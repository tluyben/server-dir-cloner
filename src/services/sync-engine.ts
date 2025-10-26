import { join, basename } from 'path';
import { mkdir, unlink, rmdir, readdir, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { db, syncDirectories, syncFiles, syncLogs } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { calculateFileChecksum, getFileMetadata } from '../utils/checksum.js';
import { createServerClient } from './server-client.js';
import { watcherService } from './watcher.js';
import type { SyncAction, SyncOperationResult } from '../types/sync.js';

/**
 * Core sync engine for handling file operations
 */
export class SyncEngine {
  /**
   * Perform initial sync from leader to target
   * Walks the entire directory tree and copies all files
   */
  async performInitialSync(syncDirId: number): Promise<{
    filesSync: number;
    directoriesSync: number;
    bytesTransferred: number;
  }> {
    const startTime = Date.now();
    let filesSync = 0;
    let directoriesSync = 0;
    let bytesTransferred = 0;

    const [syncDir] = await db
      .select()
      .from(syncDirectories)
      .where(eq(syncDirectories.id, syncDirId))
      .limit(1);

    if (!syncDir) {
      throw new Error(`Sync directory ${syncDirId} not found`);
    }

    if (!syncDir.isLeader) {
      throw new Error('Initial sync can only be performed by the leader');
    }

    console.log(`Starting initial sync for ${syncDir.localPath}`);

    // Create server client
    const client = await createServerClient(syncDir.remoteServerId);

    // Walk directory tree
    const walkResult = await this.walkDirectory(syncDir.localPath, syncDir.localPath);

    // Send all directories first
    for (const dir of walkResult.directories) {
      try {
        await client.sendFileOperation(syncDirId, 'mkdir', dir);
        directoriesSync++;
      } catch (error) {
        console.error(`Failed to sync directory ${dir}:`, error);
      }
    }

    // Send all files
    for (const file of walkResult.files) {
      try {
        const fullPath = join(syncDir.localPath, file);
        const metadata = await getFileMetadata(fullPath);

        await client.sendFileOperation(syncDirId, 'create', file, fullPath, metadata.checksum);

        filesSync++;
        bytesTransferred += metadata.size;
      } catch (error) {
        console.error(`Failed to sync file ${file}:`, error);
      }
    }

    const duration = Date.now() - startTime;
    console.log(
      `Initial sync completed in ${duration}ms: ${filesSync} files, ${directoriesSync} directories, ${bytesTransferred} bytes`,
    );

    // Update last sync time
    await db
      .update(syncDirectories)
      .set({
        lastSyncAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(syncDirectories.id, syncDirId));

    return { filesSync, directoriesSync, bytesTransferred };
  }

  /**
   * Walk directory tree and return all files and directories
   */
  private async walkDirectory(
    basePath: string,
    currentPath: string,
  ): Promise<{
    files: string[];
    directories: string[];
  }> {
    const files: string[] = [];
    const directories: string[] = [];

    const entries = await readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(currentPath, entry.name);
      const relativePath = fullPath.substring(basePath.length + 1);

      if (entry.isDirectory()) {
        directories.push(relativePath);
        // Recursively walk subdirectories
        const subResult = await this.walkDirectory(basePath, fullPath);
        files.push(...subResult.files);
        directories.push(...subResult.directories);
      } else if (entry.isFile()) {
        files.push(relativePath);
      }
    }

    return { files, directories };
  }

  /**
   * Handle incoming file operation from remote server
   */
  async handleIncomingOperation(
    syncDirId: number,
    action: SyncAction,
    filePath: string,
    fileBuffer?: Buffer,
    checksum?: string,
  ): Promise<SyncOperationResult> {
    const startTime = Date.now();

    try {
      const [syncDir] = await db
        .select()
        .from(syncDirectories)
        .where(eq(syncDirectories.id, syncDirId))
        .limit(1);

      if (!syncDir) {
        throw new Error(`Sync directory ${syncDirId} not found`);
      }

      const fullPath = join(syncDir.localPath, filePath);

      // Pause watcher for this path to prevent loop
      watcherService.pausePath(fullPath, 2000);

      let fileSize: number | undefined;

      // Perform the action
      switch (action) {
        case 'create':
        case 'update': {
          if (!fileBuffer) {
            throw new Error('File buffer required for create/update operations');
          }

          // Ensure parent directory exists
          const parentDir = join(fullPath, '..');
          await mkdir(parentDir, { recursive: true });

          // Write file
          await writeFile(fullPath, fileBuffer);
          fileSize = fileBuffer.length;

          // Verify checksum if provided
          if (checksum) {
            const actualChecksum = await calculateFileChecksum(fullPath);
            if (actualChecksum !== checksum) {
              throw new Error('Checksum mismatch after write');
            }
          }

          console.log(`${action} file: ${fullPath}`);
          break;
        }

        case 'delete':
          if (existsSync(fullPath)) {
            await unlink(fullPath);
            console.log(`Deleted file: ${fullPath}`);
          }
          break;

        case 'mkdir':
          await mkdir(fullPath, { recursive: true });
          console.log(`Created directory: ${fullPath}`);
          break;

        case 'rmdir':
          if (existsSync(fullPath)) {
            await rmdir(fullPath, { recursive: true });
            console.log(`Removed directory: ${fullPath}`);
          }
          break;
      }

      const processingTime = Date.now() - startTime;

      // Log the operation
      const [log] = await db
        .insert(syncLogs)
        .values({
          syncDirId,
          action,
          filePath,
          direction: 'inbound',
          status: 'success',
          fileSize,
          checksum,
          processingTimeMs: processingTime,
        })
        .returning();

      return {
        success: true,
        action,
        filePath,
        processed: true,
        logId: log.id,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Get current sync directory for error count
      const [currentSyncDir] = await db
        .select()
        .from(syncDirectories)
        .where(eq(syncDirectories.id, syncDirId))
        .limit(1);

      // Log the failure
      await db.insert(syncLogs).values({
        syncDirId,
        action,
        filePath,
        direction: 'inbound',
        status: 'failure',
        errorMessage,
        processingTimeMs: processingTime,
      });

      // Increment error count
      await db
        .update(syncDirectories)
        .set({
          errorCount: currentSyncDir?.errorCount ? currentSyncDir.errorCount + 1 : 1,
          status: 'error',
          updatedAt: new Date().toISOString(),
        })
        .where(eq(syncDirectories.id, syncDirId));

      return {
        success: false,
        action,
        filePath,
        processed: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Send outgoing file operation to remote server
   */
  async sendOutgoingOperation(
    syncDirId: number,
    action: SyncAction,
    filePath: string,
  ): Promise<SyncOperationResult> {
    const startTime = Date.now();

    try {
      const [syncDir] = await db
        .select()
        .from(syncDirectories)
        .where(eq(syncDirectories.id, syncDirId))
        .limit(1);

      if (!syncDir) {
        throw new Error(`Sync directory ${syncDirId} not found`);
      }

      const fullPath = join(syncDir.localPath, filePath);
      const client = await createServerClient(syncDir.remoteServerId);

      let checksum: string | undefined;
      let fileSize: number | undefined;

      // Get file metadata for create/update operations
      if ((action === 'create' || action === 'update') && existsSync(fullPath)) {
        const metadata = await getFileMetadata(fullPath);
        checksum = metadata.checksum;
        fileSize = metadata.size;
      }

      // Send to remote server
      const result = await client.sendFileOperation(
        syncDirId,
        action,
        filePath,
        fullPath,
        checksum,
      );

      const processingTime = Date.now() - startTime;

      // Log the operation
      await db.insert(syncLogs).values({
        syncDirId,
        action,
        filePath,
        direction: 'outbound',
        status: 'success',
        fileSize,
        checksum,
        processingTimeMs: processingTime,
      });

      // Update last sync time
      await db
        .update(syncDirectories)
        .set({
          lastSyncAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(syncDirectories.id, syncDirId));

      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Log the failure
      await db.insert(syncLogs).values({
        syncDirId,
        action,
        filePath,
        direction: 'outbound',
        status: 'failure',
        errorMessage,
        processingTimeMs: processingTime,
      });

      throw error;
    }
  }

  /**
   * Perform initial file sync from leader to target
   * Only syncs if the file exists on the leader
   */
  async performInitialFileSync(syncFileId: number): Promise<{
    fileSynced: boolean;
    bytesTransferred: number;
  }> {
    const startTime = Date.now();
    let bytesTransferred = 0;

    const [syncFile] = await db
      .select()
      .from(syncFiles)
      .where(eq(syncFiles.id, syncFileId))
      .limit(1);

    if (!syncFile) {
      throw new Error(`Sync file ${syncFileId} not found`);
    }

    if (!syncFile.isLeader) {
      throw new Error('Initial file sync can only be performed by the leader');
    }

    // Check if file exists
    if (!existsSync(syncFile.filePath)) {
      console.log(`File ${syncFile.filePath} does not exist yet, skipping initial sync`);
      return { fileSynced: false, bytesTransferred: 0 };
    }

    console.log(`Starting initial file sync for ${syncFile.filePath}`);

    // Create server client
    const client = await createServerClient(syncFile.remoteServerId);

    // Get file metadata
    const metadata = await getFileMetadata(syncFile.filePath);

    // Send file to remote
    await client.sendFileSyncOperation(
      syncFileId,
      'create',
      basename(syncFile.filePath),
      syncFile.filePath,
      metadata.checksum,
    );

    bytesTransferred = metadata.size;

    const duration = Date.now() - startTime;
    console.log(`Initial file sync completed in ${duration}ms: ${bytesTransferred} bytes`);

    // Update last sync time
    await db
      .update(syncFiles)
      .set({
        lastSyncAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(syncFiles.id, syncFileId));

    return { fileSynced: true, bytesTransferred };
  }

  /**
   * Handle incoming file operation from remote server (for individual file sync)
   */
  async handleIncomingFileOperation(
    syncFileId: number,
    action: SyncAction,
    fileBuffer?: Buffer,
    checksum?: string,
  ): Promise<SyncOperationResult> {
    const startTime = Date.now();

    try {
      const [syncFile] = await db
        .select()
        .from(syncFiles)
        .where(eq(syncFiles.id, syncFileId))
        .limit(1);

      if (!syncFile) {
        throw new Error(`Sync file ${syncFileId} not found`);
      }

      const fullPath = syncFile.filePath;

      // Pause watcher for this path to prevent loop
      watcherService.pausePath(fullPath, 2000);

      let fileSize: number | undefined;

      // Perform the action (only file operations, no mkdir/rmdir)
      switch (action) {
        case 'create':
        case 'update': {
          if (!fileBuffer) {
            throw new Error('File buffer required for create/update operations');
          }

          // Ensure parent directory exists
          await mkdir(syncFile.parentDirectory, { recursive: true });

          // Write file
          await writeFile(fullPath, fileBuffer);
          fileSize = fileBuffer.length;

          // Update fileExists status
          await db
            .update(syncFiles)
            .set({
              fileExists: true,
              updatedAt: new Date().toISOString(),
            })
            .where(eq(syncFiles.id, syncFileId));

          // Verify checksum if provided
          if (checksum) {
            const actualChecksum = await calculateFileChecksum(fullPath);
            if (actualChecksum !== checksum) {
              throw new Error('Checksum mismatch after write');
            }
          }

          console.log(`${action} file: ${fullPath}`);
          break;
        }

        case 'delete':
          if (existsSync(fullPath)) {
            await unlink(fullPath);
            console.log(`Deleted file: ${fullPath}`);

            // Update fileExists status
            await db
              .update(syncFiles)
              .set({
                fileExists: false,
                updatedAt: new Date().toISOString(),
              })
              .where(eq(syncFiles.id, syncFileId));
          }
          break;

        case 'mkdir':
        case 'rmdir':
          // These operations are not applicable for file syncing
          throw new Error(`Operation ${action} is not supported for file syncing`);
      }

      const processingTime = Date.now() - startTime;

      // Log the operation
      const [log] = await db
        .insert(syncLogs)
        .values({
          syncFileId,
          syncDirId: null,
          action,
          filePath: basename(fullPath),
          direction: 'inbound',
          status: 'success',
          fileSize,
          checksum,
          processingTimeMs: processingTime,
        })
        .returning();

      return {
        success: true,
        action,
        filePath: basename(fullPath),
        processed: true,
        logId: log.id,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Get current sync file for error count
      const [currentSyncFile] = await db
        .select()
        .from(syncFiles)
        .where(eq(syncFiles.id, syncFileId))
        .limit(1);

      // Log the failure
      await db.insert(syncLogs).values({
        syncFileId,
        syncDirId: null,
        action,
        filePath: currentSyncFile ? basename(currentSyncFile.filePath) : 'unknown',
        direction: 'inbound',
        status: 'failure',
        errorMessage,
        processingTimeMs: processingTime,
      });

      // Increment error count
      await db
        .update(syncFiles)
        .set({
          errorCount: currentSyncFile?.errorCount ? currentSyncFile.errorCount + 1 : 1,
          status: 'error',
          updatedAt: new Date().toISOString(),
        })
        .where(eq(syncFiles.id, syncFileId));

      return {
        success: false,
        action,
        filePath: currentSyncFile ? basename(currentSyncFile.filePath) : 'unknown',
        processed: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Send outgoing file operation to remote server (for individual file sync)
   */
  async sendOutgoingFileOperation(
    syncFileId: number,
    action: SyncAction,
  ): Promise<SyncOperationResult> {
    const startTime = Date.now();

    try {
      const [syncFile] = await db
        .select()
        .from(syncFiles)
        .where(eq(syncFiles.id, syncFileId))
        .limit(1);

      if (!syncFile) {
        throw new Error(`Sync file ${syncFileId} not found`);
      }

      const fullPath = syncFile.filePath;
      const fileName = basename(fullPath);
      const client = await createServerClient(syncFile.remoteServerId);

      let checksum: string | undefined;
      let fileSize: number | undefined;

      // Get file metadata for create/update operations
      if ((action === 'create' || action === 'update') && existsSync(fullPath)) {
        const metadata = await getFileMetadata(fullPath);
        checksum = metadata.checksum;
        fileSize = metadata.size;
      }

      // Send to remote server
      const result = await client.sendFileSyncOperation(
        syncFileId,
        action,
        fileName,
        fullPath,
        checksum,
      );

      const processingTime = Date.now() - startTime;

      // Log the operation
      await db.insert(syncLogs).values({
        syncFileId,
        syncDirId: null,
        action,
        filePath: fileName,
        direction: 'outbound',
        status: 'success',
        fileSize,
        checksum,
        processingTimeMs: processingTime,
      });

      // Update last sync time
      await db
        .update(syncFiles)
        .set({
          lastSyncAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(syncFiles.id, syncFileId));

      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      const [syncFile] = await db
        .select()
        .from(syncFiles)
        .where(eq(syncFiles.id, syncFileId))
        .limit(1);

      // Log the failure
      await db.insert(syncLogs).values({
        syncFileId,
        syncDirId: null,
        action,
        filePath: syncFile ? basename(syncFile.filePath) : 'unknown',
        direction: 'outbound',
        status: 'failure',
        errorMessage,
        processingTimeMs: processingTime,
      });

      throw error;
    }
  }
}

// Singleton instance
export const syncEngine = new SyncEngine();
