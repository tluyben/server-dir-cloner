import chokidar, { type FSWatcher } from 'chokidar';
import { basename } from 'path';
import { existsSync } from 'fs';
import { db, syncDirectories, syncFiles, syncQueue } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { getRelativePath, shouldIgnorePath } from '../utils/path-validator.js';
import type { SyncAction } from '../types/sync.js';

/**
 * Manages filesystem watchers for synced directories
 */
export class WatcherService {
  private watchers: Map<number, FSWatcher> = new Map();
  private fileWatchers: Map<number, FSWatcher> = new Map(); // For individual file syncing
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
   * Start watching a specific file
   * Watches the parent directory and filters events for the specific file
   */
  async startWatchingFile(syncFileId: number): Promise<void> {
    // Check if already watching
    if (this.fileWatchers.has(syncFileId)) {
      console.log(`Already watching sync file ${syncFileId}`);
      return;
    }

    // Get sync file configuration
    const [syncFile] = await db
      .select()
      .from(syncFiles)
      .where(eq(syncFiles.id, syncFileId))
      .limit(1);

    if (!syncFile) {
      throw new Error(`Sync file ${syncFileId} not found`);
    }

    if (syncFile.status !== 'active') {
      console.log(`Sync file ${syncFileId} is ${syncFile.status}, not starting watcher`);
      return;
    }

    const targetFileName = basename(syncFile.filePath);
    const parentDir = syncFile.parentDirectory;

    console.log(
      `Starting file watcher for ${syncFile.filePath} (watching parent: ${parentDir}, sync file ${syncFileId})`,
    );

    // Create watcher for parent directory only
    const watcher = chokidar.watch(parentDir, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: this.debounceMs,
        pollInterval: 50,
      },
      depth: 0, // Don't watch subdirectories
      ignored: (path: string) => {
        // Only watch the specific file we care about
        const fileName = basename(path);
        return fileName !== targetFileName;
      },
    });

    // Handle file events - only for our specific file
    watcher
      .on('add', async (path) => {
        if (basename(path) === targetFileName) {
          console.log(`Watched file appeared: ${path}`);
          // Update fileExists status
          await db
            .update(syncFiles)
            .set({
              fileExists: true,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(syncFiles.id, syncFileId));

          await this.handleFileEventForFile(syncFileId, syncFile.filePath, path, 'create');
        }
      })
      .on('change', async (path) => {
        if (basename(path) === targetFileName) {
          await this.handleFileEventForFile(syncFileId, syncFile.filePath, path, 'update');
        }
      })
      .on('unlink', async (path) => {
        if (basename(path) === targetFileName) {
          console.log(`Watched file disappeared: ${path}`);
          // Update fileExists status
          await db
            .update(syncFiles)
            .set({
              fileExists: false,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(syncFiles.id, syncFileId));

          await this.handleFileEventForFile(syncFileId, syncFile.filePath, path, 'delete');
        }
      })
      .on('error', (error) => {
        console.error(`File watcher error for sync file ${syncFileId}:`, error);
      })
      .on('ready', () => {
        console.log(`File watcher ready for sync file ${syncFileId}`);
        // Check if file exists now
        const fileExists = existsSync(syncFile.filePath);
        if (fileExists !== syncFile.fileExists) {
          db.update(syncFiles)
            .set({
              fileExists,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(syncFiles.id, syncFileId))
            .then(() => {
              console.log(`Updated fileExists status for sync file ${syncFileId}: ${fileExists}`);
            });
        }
      });

    this.fileWatchers.set(syncFileId, watcher);
  }

  /**
   * Stop watching a specific file
   */
  async stopWatchingFile(syncFileId: number): Promise<void> {
    const watcher = this.fileWatchers.get(syncFileId);
    if (watcher) {
      await watcher.close();
      this.fileWatchers.delete(syncFileId);
      console.log(`Stopped file watcher for sync file ${syncFileId}`);
    }
  }

  /**
   * Handle file events for individual file syncing
   */
  private async handleFileEventForFile(
    syncFileId: number,
    filePath: string,
    fullPath: string,
    action: SyncAction,
  ): Promise<void> {
    try {
      // Skip if path is paused
      if (this.isPathPaused(fullPath)) {
        console.log(`Skipping paused file: ${fullPath}`);
        return;
      }

      const fileName = basename(filePath);
      console.log(`File ${action}: ${fileName} in sync file ${syncFileId}`);

      // Add to sync queue with syncFileId
      await db.insert(syncQueue).values({
        syncFileId,
        syncDirId: null, // This is a file sync, not a directory sync
        action,
        filePath: fileName, // Just the filename for file syncs
        priority: 5,
        status: 'pending',
      });
    } catch (error) {
      console.error(`Error handling file event for ${fullPath}:`, error);
    }
  }

  /**
   * Stop all watchers (for graceful shutdown)
   */
  async stopAll(): Promise<void> {
    console.log('Stopping all watchers...');
    const dirPromises = Array.from(this.watchers.keys()).map((syncDirId) =>
      this.stopWatching(syncDirId),
    );
    const filePromises = Array.from(this.fileWatchers.keys()).map((syncFileId) =>
      this.stopWatchingFile(syncFileId),
    );
    await Promise.all([...dirPromises, ...filePromises]);
  }
}

// Singleton instance
export const watcherService = new WatcherService();
