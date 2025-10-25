import * as cron from 'node-cron';
import { db, syncQueue, syncDirectories } from '../db/index.js';
import { eq, and, lt } from 'drizzle-orm';
import { syncEngine } from './sync-engine.js';
import type { SyncQueueItem } from '../db/index.js';

/**
 * Background queue processor for sync operations
 */
export class QueueProcessor {
  private isProcessing = false;
  private cronJob: cron.ScheduledTask | null = null;
  private maxConcurrentOps: number;
  private processIntervalMs: number;

  constructor() {
    this.maxConcurrentOps = parseInt(process.env.MAX_CONCURRENT_SYNCS || '5', 10);
    this.processIntervalMs = parseInt(process.env.QUEUE_PROCESS_INTERVAL_MS || '1000', 10);
  }

  /**
   * Start the queue processor
   */
  start(): void {
    if (this.cronJob) {
      console.log('Queue processor already running');
      return;
    }

    console.log(`Starting queue processor (interval: ${this.processIntervalMs}ms)`);

    // Process queue on interval
    const cronExpression = this.getCronExpression();
    this.cronJob = cron.schedule(cronExpression, async () => {
      await this.processQueue();
    });

    // Also process immediately
    this.processQueue();
  }

  /**
   * Stop the queue processor
   */
  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('Queue processor stopped');
    }
  }

  /**
   * Get cron expression based on interval
   */
  private getCronExpression(): string {
    // Convert ms to seconds
    const seconds = Math.max(1, Math.floor(this.processIntervalMs / 1000));

    if (seconds >= 60) {
      const minutes = Math.floor(seconds / 60);
      return `*/${minutes} * * * *`; // Every N minutes
    }

    return `*/${seconds} * * * * *`; // Every N seconds
  }

  /**
   * Process pending items in the queue
   */
  async processQueue(): Promise<void> {
    // Skip if already processing
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      // Get pending items, ordered by priority (higher first) and creation time
      const pendingItems = await db
        .select()
        .from(syncQueue)
        .where(eq(syncQueue.status, 'pending'))
        .orderBy(syncQueue.priority, syncQueue.createdAt)
        .limit(this.maxConcurrentOps);

      if (pendingItems.length === 0) {
        return;
      }

      console.log(`Processing ${pendingItems.length} queued sync operations`);

      // Process items in parallel (up to max concurrent)
      const promises = pendingItems.map((item) => this.processQueueItem(item));
      await Promise.allSettled(promises);
    } catch (error) {
      console.error('Error processing queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single queue item
   */
  private async processQueueItem(item: SyncQueueItem): Promise<void> {
    try {
      // Mark as processing
      await db
        .update(syncQueue)
        .set({
          status: 'processing',
          updatedAt: new Date().toISOString(),
        })
        .where(eq(syncQueue.id, item.id));

      // Check if sync directory is active
      const [syncDir] = await db
        .select()
        .from(syncDirectories)
        .where(eq(syncDirectories.id, item.syncDirId))
        .limit(1);

      if (!syncDir || syncDir.status !== 'active') {
        console.log(`Sync directory ${item.syncDirId} is not active, skipping`);
        await db
          .update(syncQueue)
          .set({
            status: 'failed',
            errorMessage: 'Sync directory is not active',
            updatedAt: new Date().toISOString(),
          })
          .where(eq(syncQueue.id, item.id));
        return;
      }

      // Send the operation
      await syncEngine.sendOutgoingOperation(item.syncDirId, item.action as any, item.filePath);

      // Mark as completed
      await db
        .update(syncQueue)
        .set({
          status: 'completed',
          updatedAt: new Date().toISOString(),
        })
        .where(eq(syncQueue.id, item.id));

      console.log(`Completed sync operation: ${item.action} ${item.filePath}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to process queue item ${item.id}:`, errorMessage);

      // Increment attempts
      const newAttempts = item.attempts + 1;

      if (newAttempts >= item.maxAttempts) {
        // Max attempts reached, mark as failed
        await db
          .update(syncQueue)
          .set({
            status: 'failed',
            attempts: newAttempts,
            errorMessage,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(syncQueue.id, item.id));

        console.error(
          `Queue item ${item.id} failed after ${newAttempts} attempts: ${errorMessage}`,
        );
      } else {
        // Reset to pending for retry
        await db
          .update(syncQueue)
          .set({
            status: 'pending',
            attempts: newAttempts,
            errorMessage,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(syncQueue.id, item.id));

        console.log(`Queue item ${item.id} will be retried (attempt ${newAttempts})`);
      }
    }
  }

  /**
   * Clean up old completed queue items
   */
  async cleanupCompletedItems(olderThanHours = 24): Promise<number> {
    const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000).toISOString();

    const result = await db
      .delete(syncQueue)
      .where(and(eq(syncQueue.status, 'completed'), lt(syncQueue.updatedAt, cutoffTime)))
      .returning();

    console.log(`Cleaned up ${result.length} old completed queue items`);
    return result.length;
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    total: number;
  }> {
    const allItems = await db.select().from(syncQueue);

    return {
      pending: allItems.filter((i) => i.status === 'pending').length,
      processing: allItems.filter((i) => i.status === 'processing').length,
      completed: allItems.filter((i) => i.status === 'completed').length,
      failed: allItems.filter((i) => i.status === 'failed').length,
      total: allItems.length,
    };
  }

  /**
   * Retry all failed items
   */
  async retryFailedItems(): Promise<number> {
    const result = await db
      .update(syncQueue)
      .set({
        status: 'pending',
        attempts: 0,
        errorMessage: null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(syncQueue.status, 'failed'))
      .returning();

    console.log(`Reset ${result.length} failed items for retry`);
    return result.length;
  }
}

// Singleton instance
export const queueProcessor = new QueueProcessor();
