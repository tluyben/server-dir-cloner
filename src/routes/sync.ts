import { Router } from 'express';
import { z } from 'zod';
import { db, servers, syncDirectories, syncLogs } from '../db/index.js';
import { eq, and, desc, gte, lte } from 'drizzle-orm';
import { validate } from '../middleware/validation.js';
import { AppError } from '../middleware/error.js';
import { authenticateApiKey } from '../middleware/auth.js';
import { upload, handleMulterError } from '../middleware/upload.js';
import { validateDirectory } from '../utils/path-validator.js';
import { createServerClientByName } from '../services/server-client.js';
import { syncEngine } from '../services/sync-engine.js';
import { watcherService } from '../services/watcher.js';
import { queueProcessor } from '../services/queue-processor.js';
import { calculateBufferChecksum } from '../utils/checksum.js';
import { statSync, readdirSync } from 'fs';
import { join } from 'path';

const router = Router();

/**
 * Validation schemas
 */
const addSyncSchema = z.object({
  body: z.object({
    directory: z.string().min(1),
    targets: z.array(z.string()).min(1),
  }),
});

const registerSyncSchema = z.object({
  body: z.object({
    directory: z.string().min(1),
    sourceServer: z.string().min(1),
    sourceUrl: z.string().url(),
    isLeader: z.boolean(),
  }),
});

// const syncOperationSchema = z.object({
//   body: z.object({
//     syncDirId: z.number().int().positive(),
//     action: z.enum(['create', 'update', 'delete', 'mkdir', 'rmdir']),
//     filePath: z.string().min(1),
//     checksum: z.string().optional(),
//     timestamp: z.string().datetime(),
//   }),
// });

const syncIdSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/),
  }),
});

const updateStatusSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/),
  }),
  body: z.object({
    status: z.enum(['active', 'paused']),
  }),
});

const logsQuerySchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/),
  }),
  query: z.object({
    action: z.enum(['create', 'update', 'delete', 'mkdir', 'rmdir']).optional(),
    status: z.enum(['success', 'failure', 'pending']).optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    limit: z.string().regex(/^\d+$/).optional().default('100'),
    offset: z.string().regex(/^\d+$/).optional().default('0'),
  }),
});

/**
 * POST /api/sync/add
 * Register a directory for synchronization
 */
router.post('/add', validate(addSyncSchema), async (req, res, next) => {
  try {
    const { directory, targets } = req.body;

    // Validate directory
    const validatedPath = validateDirectory(directory, true);

    // Get server info
    // const thisServerId = process.env.SERVER_ID || 'unknown';
    const thisServerName = process.env.SERVER_NAME || 'local';
    const thisServerUrl = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3000}`;

    const results = [];

    for (const targetName of targets) {
      // Find target server
      const [targetServer] = await db
        .select()
        .from(servers)
        .where(eq(servers.name, targetName))
        .limit(1);

      if (!targetServer) {
        throw new AppError(404, `Target server '${targetName}' not found`);
      }

      // Create sync directory record (leader)
      const [syncDir] = await db
        .insert(syncDirectories)
        .values({
          localPath: validatedPath,
          remoteServerId: targetServer.id,
          remotePath: validatedPath, // Same path on remote
          isLeader: true,
          syncDirection: 'bidirectional',
          status: 'active',
        })
        .returning();

      // Register sync on target server
      const client = await createServerClientByName(targetName);
      await client.registerSync(validatedPath, thisServerName, thisServerUrl);

      // Perform initial sync
      const syncResult = await syncEngine.performInitialSync(syncDir.id);

      // Start watcher
      await watcherService.startWatching(syncDir.id);

      results.push({
        serverId: targetServer.id,
        serverName: targetServer.name,
        remotePath: validatedPath,
        isLeader: true,
        status: 'active',
        ...syncResult,
      });
    }

    res.status(201).json({
      id: results[0]?.serverId || 0,
      localPath: validatedPath,
      targets: results,
      syncInitiated: true,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/sync/register
 * Register remote sync (called by initiating server)
 */
router.post(
  '/register',
  authenticateApiKey,
  validate(registerSyncSchema),
  async (req, res, next) => {
    try {
      const { directory, sourceServer, sourceUrl } = req.body;

      // Validate directory (create if doesn't exist)
      const validatedPath = validateDirectory(directory, false);

      // Ensure directory exists
      const fs = await import('fs/promises');
      await fs.mkdir(validatedPath, { recursive: true });

      // Find source server in our database
      let sourceServerId: number;
      const [existingServer] = await db
        .select()
        .from(servers)
        .where(eq(servers.name, sourceServer))
        .limit(1);

      if (existingServer) {
        sourceServerId = existingServer.id;
      } else {
        // Register source server automatically
        const [newServer] = await db
          .insert(servers)
          .values({
            serverId: `auto-${Date.now()}`,
            name: sourceServer,
            url: sourceUrl,
            apiKey: req.headers['x-api-key'] as string,
            active: true,
          })
          .returning();
        sourceServerId = newServer.id;
      }

      // Create sync directory record (not leader)
      const [syncDir] = await db
        .insert(syncDirectories)
        .values({
          localPath: validatedPath,
          remoteServerId: sourceServerId,
          remotePath: validatedPath,
          isLeader: false,
          syncDirection: 'bidirectional',
          status: 'active',
        })
        .returning();

      res.status(201).json({
        id: syncDir.id,
        status: 'registered',
        ready: true,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/sync/operation
 * Handle incoming file operation from remote server
 */
router.post(
  '/operation',
  authenticateApiKey,
  upload.single('file'),
  handleMulterError,
  async (req: any, res: any, next: any) => {
    try {
      const { syncDirId, action, filePath, checksum } = req.body;

      if (!syncDirId || !action || !filePath) {
        throw new AppError(400, 'Missing required fields: syncDirId, action, filePath');
      }

      const syncDirIdNum = parseInt(syncDirId, 10);

      // Get file buffer from upload
      const fileBuffer =
        req.file?.buffer ||
        (await import('fs/promises').then((fs) => fs.readFile(req.file?.path || '')));

      // Verify checksum if provided
      if (fileBuffer && checksum) {
        const actualChecksum = calculateBufferChecksum(fileBuffer);
        if (actualChecksum !== checksum) {
          throw new AppError(409, 'Checksum mismatch');
        }
      }

      // Handle the operation
      const result = await syncEngine.handleIncomingOperation(
        syncDirIdNum,
        action,
        filePath,
        fileBuffer,
        checksum,
      );

      // Start watcher if not already started
      await watcherService.startWatching(syncDirIdNum);

      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/sync
 * List all sync directories
 */
router.get('/', async (req, res, next) => {
  try {
    const { status, serverId } = req.query;

    let query = db.select().from(syncDirectories);

    if (status) {
      query = query.where(eq(syncDirectories.status, status as string)) as any;
    }
    if (serverId) {
      const serverIdNum = parseInt(serverId as string, 10);
      query = query.where(eq(syncDirectories.remoteServerId, serverIdNum)) as any;
    }

    const syncs = await query;

    // Enrich with server info
    const enriched = await Promise.all(
      syncs.map(async (sync) => {
        const [server] = await db
          .select()
          .from(servers)
          .where(eq(servers.id, sync.remoteServerId))
          .limit(1);

        return {
          id: sync.id,
          localPath: sync.localPath,
          remoteServer: server
            ? {
                id: server.id,
                name: server.name,
                url: server.url,
              }
            : null,
          remotePath: sync.remotePath,
          isLeader: sync.isLeader,
          status: sync.status,
          lastSyncAt: sync.lastSyncAt,
          errorCount: sync.errorCount,
          createdAt: sync.createdAt,
        };
      }),
    );

    res.json(enriched);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/sync/:id
 * Get sync directory details
 */
router.get('/:id', validate(syncIdSchema), async (req, res, next) => {
  try {
    const syncDirId = parseInt(req.params.id, 10);

    const [syncDir] = await db
      .select()
      .from(syncDirectories)
      .where(eq(syncDirectories.id, syncDirId))
      .limit(1);

    if (!syncDir) {
      throw new AppError(404, 'Sync directory not found');
    }

    // Get server info
    const [server] = await db
      .select()
      .from(servers)
      .where(eq(servers.id, syncDir.remoteServerId))
      .limit(1);

    // Get stats
    const logs = await db.select().from(syncLogs).where(eq(syncLogs.syncDirId, syncDirId));

    const stats = {
      totalOperations: logs.length,
      successfulOperations: logs.filter((l) => l.status === 'success').length,
      failedOperations: logs.filter((l) => l.status === 'failure').length,
      averageProcessingTime:
        logs.reduce((sum, l) => sum + (l.processingTimeMs || 0), 0) / logs.length || 0,
    };

    // Get recent logs
    const recentLogs = await db
      .select()
      .from(syncLogs)
      .where(eq(syncLogs.syncDirId, syncDirId))
      .orderBy(desc(syncLogs.timestamp))
      .limit(10);

    res.json({
      id: syncDir.id,
      localPath: syncDir.localPath,
      remoteServer: server
        ? {
            id: server.id,
            name: server.name,
            url: server.url,
            active: server.active,
            lastSeen: server.lastSeen,
          }
        : null,
      remotePath: syncDir.remotePath,
      isLeader: syncDir.isLeader,
      syncDirection: syncDir.syncDirection,
      status: syncDir.status,
      lastSyncAt: syncDir.lastSyncAt,
      errorCount: syncDir.errorCount,
      stats,
      recentLogs,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/sync/:id/status
 * Update sync status (pause/resume)
 */
router.patch('/:id/status', validate(updateStatusSchema), async (req, res, next) => {
  try {
    const syncDirId = parseInt(req.params.id, 10);
    const { status } = req.body;

    const [syncDir] = await db
      .select()
      .from(syncDirectories)
      .where(eq(syncDirectories.id, syncDirId))
      .limit(1);

    if (!syncDir) {
      throw new AppError(404, 'Sync directory not found');
    }

    // Update status
    const [updated] = await db
      .update(syncDirectories)
      .set({
        status,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(syncDirectories.id, syncDirId))
      .returning();

    // Stop/start watcher based on status
    if (status === 'paused') {
      await watcherService.stopWatching(syncDirId);
    } else if (status === 'active') {
      await watcherService.startWatching(syncDirId);
    }

    res.json({
      id: updated.id,
      status: updated.status,
      updatedAt: updated.updatedAt,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/sync/:id
 * Remove sync directory
 */
router.delete('/:id', validate(syncIdSchema), async (req, res, next) => {
  try {
    const syncDirId = parseInt(req.params.id, 10);
    const deleteFiles = req.query.deleteFiles === 'true';

    const [syncDir] = await db
      .select()
      .from(syncDirectories)
      .where(eq(syncDirectories.id, syncDirId))
      .limit(1);

    if (!syncDir) {
      throw new AppError(404, 'Sync directory not found');
    }

    // Stop watcher
    await watcherService.stopWatching(syncDirId);

    // Delete files if requested
    if (deleteFiles) {
      const fs = await import('fs/promises');
      await fs.rm(syncDir.localPath, { recursive: true, force: true });
    }

    // Delete sync directory record (cascade will handle logs and queue)
    await db.delete(syncDirectories).where(eq(syncDirectories.id, syncDirId));

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/sync/:id/logs
 * Get sync logs with filtering
 */
router.get('/:id/logs', validate(logsQuerySchema), async (req, res, next) => {
  try {
    const syncDirId = parseInt(req.params.id, 10);
    const { action, status, startDate, endDate, limit, offset } = req.query;

    const limitNum = parseInt(limit as string, 10);
    const offsetNum = parseInt(offset as string, 10);

    // Build query with filters
    const conditions = [eq(syncLogs.syncDirId, syncDirId)];

    if (action) {
      conditions.push(eq(syncLogs.action, action as string));
    }
    if (status) {
      conditions.push(eq(syncLogs.status, status as string));
    }
    if (startDate) {
      conditions.push(gte(syncLogs.timestamp, startDate as string));
    }
    if (endDate) {
      conditions.push(lte(syncLogs.timestamp, endDate as string));
    }

    // Get total count
    const allLogs = await db
      .select()
      .from(syncLogs)
      .where(conditions.length > 1 ? and(...conditions) : conditions[0]);
    const total = allLogs.length;

    // Apply pagination
    const logs = allLogs.slice(offsetNum, offsetNum + limitNum);

    res.json({
      total,
      limit: limitNum,
      offset: offsetNum,
      logs,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/sync/health
 * Get server health and sync status
 */
router.get('/health', async (_req, res, next) => {
  try {
    const serverId = process.env.SERVER_ID || 'unknown';
    const serverName = process.env.SERVER_NAME || 'local';
    const version = '1.0.0';

    // Get active syncs
    const activeSyncs = await db
      .select()
      .from(syncDirectories)
      .where(eq(syncDirectories.status, 'active'));

    // Get queue stats
    const queueStats = await queueProcessor.getQueueStats();

    // Get watcher stats
    const watcherCount = watcherService.getActiveWatcherCount();
    const filesWatched = await watcherService.getTotalFilesWatched();

    // Get DB size
    const dbPath = process.env.DATABASE_URL || './content.db';
    let dbSize = 0;
    try {
      dbSize = statSync(dbPath).size;
    } catch {
      // Ignore if can't get size
    }

    // Calculate synced directories size
    let syncedSize = 0;
    for (const sync of activeSyncs) {
      try {
        const dirPath = sync.localPath;
        const getDirectorySize = (path: string): number => {
          let size = 0;
          const files = readdirSync(path, { withFileTypes: true });
          for (const file of files) {
            const filePath = join(path, file.name);
            if (file.isDirectory()) {
              size += getDirectorySize(filePath);
            } else {
              size += statSync(filePath).size;
            }
          }
          return size;
        };
        syncedSize += getDirectorySize(dirPath);
      } catch {
        // Ignore errors for individual directories
      }
    }

    res.json({
      status: 'healthy',
      serverId,
      serverName,
      version,
      uptime: process.uptime(),
      activeSyncs: activeSyncs.length,
      queuedOperations: queueStats.pending + queueStats.processing,
      watchers: {
        active: watcherCount,
        filesWatched,
      },
      storage: {
        dbSize,
        syncedDirectoriesSize: syncedSize,
      },
    });
  } catch (error) {
    next(error);
  }
});

export const syncRouter = router;
