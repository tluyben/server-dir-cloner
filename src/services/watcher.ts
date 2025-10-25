import chokidar, { type FSWatcher } from 'chokidar';
// import { join } from 'path';
import { db, syncDirectories, syncQueue } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { getRelativePath, shouldIgnorePath } from '../utils/path-validator.js';
import type { SyncAction } from '../types/sync.js';

/**
 * Manages filesystem watchers for synced directories
 */
export class WatcherService {
  private watchers: Map<number, FSWatcher> = new Map();
  private pausedPaths: Set<string> = new Set();
  private debounceMs: number;

  constructor() {
    this.debounceMs = parseInt(process.env.SYNC_DEBOUNCE_MS || '100', 10);
  }

  /**
   * Start watching a directory
   */
  async startWatching(syncDirId: number): Promise<void> {
    // Check if already watching
    if (this.watchers.has(syncDirId)) {
      console.log(`Already watching sync directory ${syncDirId}`);
      return;
    }

    // Get sync directory configuration
    const [syncDir] = await db
      .select()
      .from(syncDirectories)
      .where(eq(syncDirectories.id, syncDirId))
      .limit(1);

    if (!syncDir) {
      throw new Error(`Sync directory ${syncDirId} not found`);
    }

    if (syncDir.status !== 'active') {
      console.log(`Sync directory ${syncDirId} is ${syncDir.status}, not starting watcher`);
      return;
    }

    console.log(`Starting watcher for ${syncDir.localPath} (sync dir ${syncDirId})`);

    // Create watcher with options
    const watcher = chokidar.watch(syncDir.localPath, {
      persistent: true,
      ignoreInitial: true, // Don't emit events for existing files
      awaitWriteFinish: {
        stabilityThreshold: this.debounceMs,
        pollInterval: 50,
      },
      ignored: (path: string) => shouldIgnorePath(path),
      depth: undefined, // No depth limit (watch recursively)
    });

    // Handle file/directory events
    watcher
      .on('add', (path) => this.handleFileEvent(syncDirId, syncDir.localPath, path, 'create'))
      .on('change', (path) => this.handleFileEvent(syncDirId, syncDir.localPath, path, 'update'))
      .on('unlink', (path) => this.handleFileEvent(syncDirId, syncDir.localPath, path, 'delete'))
      .on('addDir', (path) => this.handleDirEvent(syncDirId, syncDir.localPath, path, 'mkdir'))
      .on('unlinkDir', (path) => this.handleDirEvent(syncDirId, syncDir.localPath, path, 'rmdir'))
      .on('error', (error) => {
        console.error(`Watcher error for sync dir ${syncDirId}:`, error);
      })
      .on('ready', () => {
        console.log(`Watcher ready for sync directory ${syncDirId}`);
      });

    this.watchers.set(syncDirId, watcher);
  }

  /**
   * Stop watching a directory
   */
  async stopWatching(syncDirId: number): Promise<void> {
    const watcher = this.watchers.get(syncDirId);
    if (watcher) {
      await watcher.close();
      this.watchers.delete(syncDirId);
      console.log(`Stopped watcher for sync directory ${syncDirId}`);
    }
  }

  /**
   * Pause watcher for a specific path temporarily
   * Used to prevent sync loops when receiving remote changes
   */
  pausePath(fullPath: string, durationMs = 1000): void {
    this.pausedPaths.add(fullPath);
    setTimeout(() => {
      this.pausedPaths.delete(fullPath);
    }, durationMs);
  }

  /**
   * Check if a path is currently paused
   */
  private isPathPaused(fullPath: string): boolean {
    return this.pausedPaths.has(fullPath);
  }

  /**
   * Handle file events (add, change, unlink)
   */
  private async handleFileEvent(
    syncDirId: number,
    basePath: string,
    fullPath: string,
    action: SyncAction,
  ): Promise<void> {
    try {
      // Skip if path is paused
      if (this.isPathPaused(fullPath)) {
        console.log(`Skipping paused path: ${fullPath}`);
        return;
      }

      // Get relative path
      const relativePath = getRelativePath(basePath, fullPath);

      console.log(`File ${action}: ${relativePath} in sync dir ${syncDirId}`);

      // Add to sync queue
      await db.insert(syncQueue).values({
        syncDirId,
        action,
        filePath: relativePath,
        priority: 5, // Normal priority
        status: 'pending',
      });
    } catch (error) {
      console.error(`Error handling file event for ${fullPath}:`, error);
    }
  }

  /**
   * Handle directory events (addDir, unlinkDir)
   */
  private async handleDirEvent(
    syncDirId: number,
    basePath: string,
    fullPath: string,
    action: SyncAction,
  ): Promise<void> {
    try {
      // Skip if path is paused
      if (this.isPathPaused(fullPath)) {
        console.log(`Skipping paused directory: ${fullPath}`);
        return;
      }

      // Get relative path
      const relativePath = getRelativePath(basePath, fullPath);

      console.log(`Directory ${action}: ${relativePath} in sync dir ${syncDirId}`);

      // Add to sync queue
      await db.insert(syncQueue).values({
        syncDirId,
        action,
        filePath: relativePath,
        priority: 7, // Higher priority for directories
        status: 'pending',
      });
    } catch (error) {
      console.error(`Error handling directory event for ${fullPath}:`, error);
    }
  }

  /**
   * Get count of active watchers
   */
  getActiveWatcherCount(): number {
    return this.watchers.size;
  }

  /**
   * Get total files being watched (approximate)
   */
  async getTotalFilesWatched(): Promise<number> {
    let total = 0;
    for (const watcher of this.watchers.values()) {
      const watched = watcher.getWatched();
      for (const files of Object.values(watched)) {
        total += files.length;
      }
    }
    return total;
  }

  /**
   * Stop all watchers (for graceful shutdown)
   */
  async stopAll(): Promise<void> {
    console.log('Stopping all watchers...');
    const promises = Array.from(this.watchers.keys()).map((syncDirId) =>
      this.stopWatching(syncDirId),
    );
    await Promise.all(promises);
  }
}

// Singleton instance
export const watcherService = new WatcherService();
