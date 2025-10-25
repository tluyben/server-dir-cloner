import { Router } from 'express';
import { z } from 'zod';
import { db, servers, syncDirectories } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { validate } from '../middleware/validation.js';
import { AppError } from '../middleware/error.js';
import { testServerConnection } from '../services/server-client.js';
import { generateApiKey } from '../middleware/auth.js';

const router = Router();

/**
 * Validation schemas
 */
const createServerSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    url: z.string().url(),
    apiKey: z.string().optional(),
  }),
});

const updateServerSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/),
  }),
  body: z.object({
    name: z.string().min(1).max(100).optional(),
    url: z.string().url().optional(),
    apiKey: z.string().optional(),
    active: z.boolean().optional(),
  }),
});

const serverIdSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/),
  }),
});

/**
 * POST /api/servers
 * Register a new server
 */
router.post('/', validate(createServerSchema), async (req, res, next) => {
  try {
    const { name, url, apiKey } = req.body;

    // Check if server with same name already exists
    const [existing] = await db.select().from(servers).where(eq(servers.name, name)).limit(1);

    if (existing) {
      throw new AppError(409, `Server with name '${name}' already exists`);
    }

    // Generate server ID
    const serverId = `server-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Use provided API key or generate new one
    const finalApiKey = apiKey || generateApiKey();

    // Test connection before registering
    const connectionTest = await testServerConnection(url, finalApiKey);
    if (!connectionTest.success) {
      throw new AppError(400, `Failed to connect to server: ${connectionTest.error}`);
    }

    // Insert server
    const [newServer] = await db
      .insert(servers)
      .values({
        serverId,
        name,
        url,
        apiKey: finalApiKey,
        active: true,
      })
      .returning();

    res.status(201).json(newServer);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/servers
 * List all registered servers
 */
router.get('/', async (_req, res, next) => {
  try {
    const allServers = await db.select().from(servers);
    res.json(allServers);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/servers/:id
 * Get server details
 */
router.get('/:id', validate(serverIdSchema), async (req, res, next) => {
  try {
    const serverId = parseInt(req.params.id, 10);

    const [server] = await db.select().from(servers).where(eq(servers.id, serverId)).limit(1);

    if (!server) {
      throw new AppError(404, 'Server not found');
    }

    // Get sync directories for this server
    const syncs = await db
      .select()
      .from(syncDirectories)
      .where(eq(syncDirectories.remoteServerId, serverId));

    res.json({
      ...server,
      syncCount: syncs.length,
      syncs: syncs.map((s) => ({
        id: s.id,
        localPath: s.localPath,
        remotePath: s.remotePath,
        status: s.status,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/servers/:id
 * Update server
 */
router.put('/:id', validate(updateServerSchema), async (req, res, next) => {
  try {
    const serverId = parseInt(req.params.id, 10);
    const updates = req.body;

    const [server] = await db.select().from(servers).where(eq(servers.id, serverId)).limit(1);

    if (!server) {
      throw new AppError(404, 'Server not found');
    }

    // Test connection if URL or API key is being updated
    if (updates.url || updates.apiKey) {
      const testUrl = updates.url || server.url;
      const testKey = updates.apiKey || server.apiKey;

      const connectionTest = await testServerConnection(testUrl, testKey);
      if (!connectionTest.success) {
        throw new AppError(400, `Failed to connect to server: ${connectionTest.error}`);
      }
    }

    const [updated] = await db
      .update(servers)
      .set({
        ...updates,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(servers.id, serverId))
      .returning();

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/servers/:id
 * Delete server (must have no active syncs)
 */
router.delete('/:id', validate(serverIdSchema), async (req, res, next) => {
  try {
    const serverId = parseInt(req.params.id, 10);

    const [server] = await db.select().from(servers).where(eq(servers.id, serverId)).limit(1);

    if (!server) {
      throw new AppError(404, 'Server not found');
    }

    // Check for active syncs
    const syncs = await db
      .select()
      .from(syncDirectories)
      .where(eq(syncDirectories.remoteServerId, serverId));

    if (syncs.length > 0) {
      throw new AppError(
        409,
        `Cannot delete server with active sync directories. Remove ${syncs.length} sync(s) first.`,
      );
    }

    await db.delete(servers).where(eq(servers.id, serverId));

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/servers/:id/ping
 * Test connection to server
 */
router.post('/:id/ping', validate(serverIdSchema), async (req, res, next) => {
  try {
    const serverId = parseInt(req.params.id, 10);

    const [server] = await db.select().from(servers).where(eq(servers.id, serverId)).limit(1);

    if (!server) {
      throw new AppError(404, 'Server not found');
    }

    const result = await testServerConnection(server.url, server.apiKey);

    res.json({
      serverId: server.id,
      serverName: server.name,
      url: server.url,
      connected: result.success,
      error: result.error,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

export const serversRouter = router;
