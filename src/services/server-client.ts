import axios, { type AxiosInstance } from 'axios';
import FormData from 'form-data';
import { createReadStream } from 'fs';
import { db, servers } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { retryOnNetworkError } from '../utils/retry.js';
import type { SyncAction } from '../types/sync.js';

/**
 * HTTP client for server-to-server communication
 */
export class ServerClient {
  private client: AxiosInstance;
  // // private serverId: number;
  // private apiKey: string;

  constructor(_serverId: number, baseURL: string, _apiKey: string) {
    // Store for future use if needed
    // this.serverId = _serverId;
    // this.apiKey = _apiKey;

    this.client = axios.create({
      baseURL,
      timeout: 30000, // 30 second timeout
      headers: {
        'X-API-Key': _apiKey,
      },
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error(`Request to ${baseURL} failed:`, error.message);
        return Promise.reject(error);
      },
    );
  }

  /**
   * Register a sync directory on remote server
   */
  async registerSync(
    directory: string,
    sourceServer: string,
    sourceUrl: string,
  ): Promise<{
    id: number;
    status: string;
    ready: boolean;
  }> {
    const response = await retryOnNetworkError(() =>
      this.client.post('/api/sync/register', {
        directory,
        sourceServer,
        sourceUrl,
        isLeader: false,
      }),
    );

    return response.data;
  }

  /**
   * Send a file operation to remote server
   */
  async sendFileOperation(
    syncDirId: number,
    action: SyncAction,
    filePath: string,
    localFullPath?: string,
    checksum?: string,
    metadata?: {
      mode?: number;
      uid?: number;
      gid?: number;
      mtime?: string;
    },
  ): Promise<{
    success: boolean;
    action: SyncAction;
    filePath: string;
    processed: boolean;
    logId?: number;
  }> {
    const formData = new FormData();
    formData.append('syncDirId', syncDirId.toString());
    formData.append('action', action);
    formData.append('filePath', filePath);
    formData.append('timestamp', new Date().toISOString());

    if (checksum) {
      formData.append('checksum', checksum);
    }

    // Add file metadata (permissions, ownership, mtime)
    if (metadata) {
      if (metadata.mode !== undefined) {
        formData.append('fileMode', metadata.mode.toString());
      }
      if (metadata.uid !== undefined) {
        formData.append('fileUid', metadata.uid.toString());
      }
      if (metadata.gid !== undefined) {
        formData.append('fileGid', metadata.gid.toString());
      }
      if (metadata.mtime) {
        formData.append('fileMtime', metadata.mtime);
      }
    }

    // Attach file for create/update operations
    if ((action === 'create' || action === 'update') && localFullPath) {
      formData.append('file', createReadStream(localFullPath));
    }

    const response = await retryOnNetworkError(() =>
      this.client.post('/api/sync/operation', formData, {
        headers: formData.getHeaders(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      }),
    );

    return response.data;
  }

  /**
   * Register a file sync on remote server
   */
  async registerFileSync(
    file: string,
    sourceServer: string,
    sourceUrl: string,
  ): Promise<{
    id: number;
    status: string;
    ready: boolean;
    fileExists: boolean;
  }> {
    const response = await retryOnNetworkError(() =>
      this.client.post('/api/sync/files/register', {
        file,
        sourceServer,
        sourceUrl,
        isLeader: false,
      }),
    );

    return response.data;
  }

  /**
   * Send a file sync operation to remote server (for individual file syncing)
   */
  async sendFileSyncOperation(
    syncFileId: number,
    action: SyncAction,
    fileName: string,
    localFullPath?: string,
    checksum?: string,
    metadata?: {
      mode?: number;
      uid?: number;
      gid?: number;
      mtime?: string;
    },
  ): Promise<{
    success: boolean;
    action: SyncAction;
    filePath: string;
    processed: boolean;
    logId?: number;
  }> {
    const formData = new FormData();
    formData.append('syncFileId', syncFileId.toString());
    formData.append('action', action);
    formData.append('fileName', fileName);
    formData.append('timestamp', new Date().toISOString());

    if (checksum) {
      formData.append('checksum', checksum);
    }

    // Add file metadata (permissions, ownership, mtime)
    if (metadata) {
      if (metadata.mode !== undefined) {
        formData.append('fileMode', metadata.mode.toString());
      }
      if (metadata.uid !== undefined) {
        formData.append('fileUid', metadata.uid.toString());
      }
      if (metadata.gid !== undefined) {
        formData.append('fileGid', metadata.gid.toString());
      }
      if (metadata.mtime) {
        formData.append('fileMtime', metadata.mtime);
      }
    }

    // Attach file for create/update operations
    if ((action === 'create' || action === 'update') && localFullPath) {
      formData.append('file', createReadStream(localFullPath));
    }

    const response = await retryOnNetworkError(() =>
      this.client.post('/api/sync/files/operation', formData, {
        headers: formData.getHeaders(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      }),
    );

    return response.data;
  }

  /**
   * Remove a sync directory on remote server
   */
  async removeSync(syncDirId: number, deleteFiles = false): Promise<void> {
    await retryOnNetworkError(() =>
      this.client.delete(`/api/sync/${syncDirId}`, {
        params: { deleteFiles },
      }),
    );
  }

  /**
   * Remove a file sync on remote server
   */
  async removeFileSync(syncFileId: number, deleteFile = false): Promise<void> {
    await retryOnNetworkError(() =>
      this.client.delete(`/api/sync/files/${syncFileId}`, {
        params: { deleteFile },
      }),
    );
  }

  /**
   * Ping remote server to check health
   */
  async ping(): Promise<boolean> {
    try {
      const response = await this.client.get('/api/sync/health', {
        timeout: 5000,
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * Get remote server health status
   */
  async getHealth(): Promise<{
    status: string;
    serverId: string;
    serverName: string;
    uptime: number;
  }> {
    const response = await this.client.get('/api/sync/health');
    return response.data;
  }
}

/**
 * Factory function to create a client for a specific server
 */
export async function createServerClient(serverId: number): Promise<ServerClient> {
  const [server] = await db.select().from(servers).where(eq(servers.id, serverId)).limit(1);

  if (!server) {
    throw new Error(`Server with id ${serverId} not found`);
  }

  if (!server.active) {
    throw new Error(`Server ${server.name} is not active`);
  }

  return new ServerClient(server.id, server.url, server.apiKey);
}

/**
 * Factory function to create a client for a server by name
 */
export async function createServerClientByName(serverName: string): Promise<ServerClient> {
  const [server] = await db.select().from(servers).where(eq(servers.name, serverName)).limit(1);

  if (!server) {
    throw new Error(`Server ${serverName} not found`);
  }

  if (!server.active) {
    throw new Error(`Server ${server.name} is not active`);
  }

  return new ServerClient(server.id, server.url, server.apiKey);
}

/**
 * Test connection to a server
 */
export async function testServerConnection(
  url: string,
  apiKey: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const client = axios.create({
      baseURL: url,
      timeout: 5000,
      headers: {
        'X-API-Key': apiKey,
      },
    });

    await client.get('/api/sync/health');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}
