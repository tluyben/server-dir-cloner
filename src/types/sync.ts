/**
 * Sync operation types and interfaces
 */

export type SyncAction = 'create' | 'update' | 'delete' | 'mkdir' | 'rmdir';
export type SyncDirection = 'outbound' | 'inbound';
export type SyncStatus = 'success' | 'failure' | 'pending';
export type QueueStatus = 'pending' | 'processing' | 'failed' | 'completed';
export type DirectoryStatus = 'active' | 'paused' | 'error';
export type SyncDirectionType = 'bidirectional' | 'send' | 'receive';

/**
 * File operation metadata
 */
export interface FileOperation {
  syncDirId: number;
  action: SyncAction;
  filePath: string;
  checksum?: string;
  timestamp: string;
  fileSize?: number;
}

/**
 * Sync operation result
 */
export interface SyncOperationResult {
  success: boolean;
  action: SyncAction;
  filePath: string;
  processed: boolean;
  logId?: number;
  error?: string;
}

/**
 * Watcher event data
 */
export interface WatcherEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir';
  path: string;
  stats?: {
    size: number;
    mtime: Date;
  };
}

/**
 * Server health status
 */
export interface ServerHealth {
  status: 'healthy' | 'unhealthy' | 'degraded';
  serverId: string;
  serverName: string;
  version: string;
  uptime: number;
  activeSyncs: number;
  queuedOperations: number;
  watchers: {
    active: number;
    filesWatched: number;
  };
  storage: {
    dbSize: number;
    syncedDirectoriesSize: number;
  };
}

/**
 * Sync statistics
 */
export interface SyncStats {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  averageProcessingTime: number;
}

/**
 * Initial sync progress
 */
export interface InitialSyncProgress {
  totalFiles: number;
  processedFiles: number;
  totalDirectories: number;
  processedDirectories: number;
  bytesTransferred: number;
  startTime: Date;
  estimatedCompletion?: Date;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}
