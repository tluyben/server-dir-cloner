import { Router } from 'express';
import { z } from 'zod';
import { db, servers, syncFiles, syncLogs } from '../db/index.js';
import { eq, and, desc, gte, lte } from 'drizzle-orm';
import { validate } from '../middleware/validation.js';
import { AppError } from '../middleware/error.js';
import { authenticateApiKey } from '../middleware/auth.js';
import { upload, handleMulterError } from '../middleware/upload.js';
import { validateFilePath } from '../utils/path-validator.js';
import { createServerClientByName } from '../services/server-client.js';
import { syncEngine } from '../services/sync-engine.js';
import { watcherService } from '../services/watcher.js';
import { calculateBufferChecksum } from '../utils/checksum.js';
import { existsSync } from 'fs';

const router = Router();

/**
 * Validation schemas
 */
const addFileSyncSchema = z.object({
  body: z.object({
    file: z.string().min(1),
    targets: z.array(z.string()).min(1),
  }),
});

const registerFileSyncSchema = z.object({
  body: z.object({
    file: z.string().min(1),
    sourceServer: z.string().min(1),
    sourceUrl: z.string().url(),
    isLeader: z.boolean(),
  }),
});

const syncFileIdSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/),
  }),
});

const updateFileStatusSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/),
  }),
  body: z.object({
    status: z.enum(['active', 'paused']),
  }),
});

const fileLogsQuerySchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/),
  }),
  query: z.object({
    action: z.enum(['create', 'update', 'delete']).optional(),
    status: z.enum(['success', 'failure', 'pending']).optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    limit: z.string().regex(/^\d+$/).optional().default('100'),
    offset: z.string().regex(/^\d+$/).optional().default('0'),
  }),
});

/**
 * POST /api/sync/files/add
 * Register a file for synchronization
 */
router.post('/add', validate(addFileSyncSchema), async (req, res, next) => {
  try {
    const { file, targets } = req.body;

    // Validate file path (file may not exist yet)
    const { filePath, parentDir, fileName } = validateFilePath(file, false);
    const fileExists = existsSync(filePath);

    // Get server info
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

      // Create sync file record (leader)
      const [syncFile] = await db
        .insert(syncFiles)
        .values({
          filePath: filePath,
          remoteServerId: targetServer.id,
          remoteFilePath: filePath, // Same path on remote
          isLeader: true,
          syncDirection: 'bidirectional',
          status: 'active',
          fileExists: fileExists,
          parentDirectory: parentDir,
        })
        .returning();

      // Register sync on target server
      const client = await createServerClientByName(targetName);
      await client.registerFileSync(filePath, thisServerName, thisServerUrl);

      // If file exists, perform initial sync
      let syncResult = null;
      if (fileExists) {
        syncResult = await syncEngine.performInitialFileSync(syncFile.id);
      }

      // Start watcher on parent directory
      await watcherService.startWatchingFile(syncFile.id);

      results.push({
        serverId: targetServer.id,
        serverName: targetServer.name,
        remoteFilePath: filePath,
        isLeader: true,
        status: 'active',
        fileExists,
        ...syncResult,
      });
    }

    res.status(201).json({
      id: results[0]?.serverId || 0,
      filePath: filePath,
      fileName: fileName,
      fileExists,
      targets: results,
      syncInitiated: fileExists,
      message: fileExists
        ? 'File sync initiated and file sent to targets'
        : 'File sync initiated - monitoring parent directory, will sync when file appears',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/sync/files/register
 * Register remote file sync (called by initiating server)
 */
router.post(
  '/register',
  authenticateApiKey,
  validate(registerFileSyncSchema),
  async (req, res, next) => {
    try {
      const { file, sourceServer, sourceUrl } = req.body;

      // Validate file path (file may not exist yet)
      const { filePath, parentDir } = validateFilePath(file, false);
      const fileExists = existsSync(filePath);

      // Ensure parent directory exists (but NOT the file itself)
      const fs = await import('fs/promises');
      await fs.mkdir(parentDir, { recursive: true });

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

      // Create sync file record (not leader)
      const [syncFile] = await db
        .insert(syncFiles)
        .values({
          filePath: filePath,
          remoteServerId: sourceServerId,
          remoteFilePath: filePath,
          isLeader: false,
          syncDirection: 'bidirectional',
          status: 'active',
          fileExists: fileExists,
          parentDirectory: parentDir,
        })
        .returning();

      // Start watching parent directory
      await watcherService.startWatchingFile(syncFile.id);

      res.status(201).json({
        id: syncFile.id,
        status: 'registered',
        ready: true,
        fileExists,
        message: fileExists
          ? 'File sync registered and file exists locally'
          : 'File sync registered - monitoring parent directory',
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/sync/files/operation
 * Handle incoming file operation from remote server
 */
router.post(
  '/operation',
  authenticateApiKey,
  upload.single('file'),
  handleMulterError,
  async (req: any, res: any, next: any) => {
    try {
      const { syncFileId, action, fileName, checksum } = req.body;

      if (!syncFileId || !action || !fileName) {
        throw new AppError(400, 'Missing required fields: syncFileId, action, fileName');
      }

      const syncFileIdNum = parseInt(syncFileId, 10);

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
      const result = await syncEngine.handleIncomingFileOperation(
        syncFileIdNum,
        action,
        fileBuffer,
        checksum,
      );

      // Ensure watcher is started (in case it stopped)
      await watcherService.startWatchingFile(syncFileIdNum);

      res.json(result);
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/sync/files
 * List all sync files
 */
router.get('/', async (req, res, next) => {
  try {
    const { status, serverId, fileExists } = req.query;

    let query = db.select().from(syncFiles);

    const conditions = [];
    if (status) {
      conditions.push(eq(syncFiles.status, status as string));
    }
    if (serverId) {
      const serverIdNum = parseInt(serverId as string, 10);
      conditions.push(eq(syncFiles.remoteServerId, serverIdNum));
    }
    if (fileExists !== undefined) {
      const fileExistsBool = fileExists === 'true';
      conditions.push(eq(syncFiles.fileExists, fileExistsBool));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
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
          ...sync,
          server: server
            ? {
                id: server.id,
                name: server.name,
                url: server.url,
              }
            : null,
        };
      }),
    );

    res.json(enriched);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/sync/files/:id
 * Get specific sync file details
 */
router.get('/:id', validate(syncFileIdSchema), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);

    const [syncFile] = await db.select().from(syncFiles).where(eq(syncFiles.id, id)).limit(1);

    if (!syncFile) {
      throw new AppError(404, 'Sync file not found');
    }

    // Get server info
    const [server] = await db
      .select()
      .from(servers)
      .where(eq(servers.id, syncFile.remoteServerId))
      .limit(1);

    // Check if file currently exists
    const currentFileExists = existsSync(syncFile.filePath);

    // Update fileExists status if changed
    if (currentFileExists !== syncFile.fileExists) {
      await db
        .update(syncFiles)
        .set({
          fileExists: currentFileExists,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(syncFiles.id, id));
    }

    res.json({
      ...syncFile,
      fileExists: currentFileExists,
      server: server
        ? {
            id: server.id,
            name: server.name,
            url: server.url,
          }
        : null,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/sync/files/:id
 * Update sync file status
 */
router.put('/:id', validate(updateFileStatusSchema), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { status } = req.body;

    const [syncFile] = await db.select().from(syncFiles).where(eq(syncFiles.id, id)).limit(1);

    if (!syncFile) {
      throw new AppError(404, 'Sync file not found');
    }

    // Update status
    const [updated] = await db
      .update(syncFiles)
      .set({
        status,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(syncFiles.id, id))
      .returning();

    // Handle watcher based on status
    if (status === 'paused') {
      await watcherService.stopWatchingFile(id);
    } else if (status === 'active') {
      await watcherService.startWatchingFile(id);
    }

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/sync/files/:id
 * Remove file sync
 */
router.delete('/:id', validate(syncFileIdSchema), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { deleteFile } = req.query;

    const [syncFile] = await db.select().from(syncFiles).where(eq(syncFiles.id, id)).limit(1);

    if (!syncFile) {
      throw new AppError(404, 'Sync file not found');
    }

    // Stop watcher
    await watcherService.stopWatchingFile(id);

    // Delete file if requested
    if (deleteFile === 'true' && existsSync(syncFile.filePath)) {
      const fs = await import('fs/promises');
      await fs.unlink(syncFile.filePath);
    }

    // Delete sync record
    await db.delete(syncFiles).where(eq(syncFiles.id, id));

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/sync/files/:id/logs
 * Get sync logs for a file
 */
router.get('/:id/logs', validate(fileLogsQuerySchema), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { action, status, startDate, endDate, limit, offset } = req.query;

    // Verify sync file exists
    const [syncFile] = await db.select().from(syncFiles).where(eq(syncFiles.id, id)).limit(1);

    if (!syncFile) {
      throw new AppError(404, 'Sync file not found');
    }

    // Build query with filters
    const conditions = [eq(syncLogs.syncFileId, id)];

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

    const logs = await db
      .select()
      .from(syncLogs)
      .where(and(...conditions))
      .orderBy(desc(syncLogs.timestamp))
      .limit(parseInt(limit as string, 10))
      .offset(parseInt(offset as string, 10));

    res.json(logs);
  } catch (error) {
    next(error);
  }
});

export default router;
