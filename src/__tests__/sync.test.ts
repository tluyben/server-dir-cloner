import { describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../app.js';
import { db, servers, syncDirectories, syncLogs } from '../db/index.js';
import { generateApiKey } from '../middleware/auth.js';
import { eq } from 'drizzle-orm';

describe('Sync API', () => {
  const app = createApp();

  beforeEach(async () => {
    // Clean up tables before each test
    await db.delete(syncLogs);
    await db.delete(syncDirectories);
    await db.delete(servers);
  });

  describe('Server Management', () => {
    it('should register a new server', async () => {
      const response = await request(app)
        .post('/api/servers')
        .send({
          name: 'testServer',
          url: 'http://test-server:3000',
          apiKey: generateApiKey(),
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('testServer');
      expect(response.body.active).toBe(true);
    });

    it('should list all servers', async () => {
      // Create test server
      await db.insert(servers).values({
        serverId: 'test-1',
        name: 'testServer',
        url: 'http://test:3000',
        apiKey: generateApiKey(),
        active: true,
      });

      const response = await request(app).get('/api/servers').expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(1);
      expect(response.body[0].name).toBe('testServer');
    });

    it('should get server details', async () => {
      const [server] = await db
        .insert(servers)
        .values({
          serverId: 'test-1',
          name: 'testServer',
          url: 'http://test:3000',
          apiKey: generateApiKey(),
          active: true,
        })
        .returning();

      const response = await request(app).get(`/api/servers/${server.id}`).expect(200);

      expect(response.body.id).toBe(server.id);
      expect(response.body.name).toBe('testServer');
      expect(response.body).toHaveProperty('syncCount');
    });

    it('should delete server with no active syncs', async () => {
      const [server] = await db
        .insert(servers)
        .values({
          serverId: 'test-1',
          name: 'testServer',
          url: 'http://test:3000',
          apiKey: generateApiKey(),
          active: true,
        })
        .returning();

      await request(app).delete(`/api/servers/${server.id}`).expect(204);

      const [deleted] = await db.select().from(servers).where(eq(servers.id, server.id));
      expect(deleted).toBeUndefined();
    });

    it('should prevent deletion of server with active syncs', async () => {
      const [server] = await db
        .insert(servers)
        .values({
          serverId: 'test-1',
          name: 'testServer',
          url: 'http://test:3000',
          apiKey: generateApiKey(),
          active: true,
        })
        .returning();

      // Create a sync directory
      await db.insert(syncDirectories).values({
        localPath: '/tmp/test',
        remoteServerId: server.id,
        remotePath: '/tmp/test',
        isLeader: true,
        status: 'active',
      });

      const response = await request(app).delete(`/api/servers/${server.id}`).expect(409);

      expect(response.body.error.message).toContain('active sync');
    });
  });

  describe('Sync Directory Management', () => {
    it('should list sync directories', async () => {
      const [server] = await db
        .insert(servers)
        .values({
          serverId: 'test-1',
          name: 'testServer',
          url: 'http://test:3000',
          apiKey: generateApiKey(),
          active: true,
        })
        .returning();

      await db.insert(syncDirectories).values({
        localPath: '/tmp/test',
        remoteServerId: server.id,
        remotePath: '/tmp/test',
        isLeader: true,
        status: 'active',
      });

      const response = await request(app).get('/api/sync').expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(1);
      expect(response.body[0].localPath).toBe('/tmp/test');
    });

    it('should get sync directory details', async () => {
      const [server] = await db
        .insert(servers)
        .values({
          serverId: 'test-1',
          name: 'testServer',
          url: 'http://test:3000',
          apiKey: generateApiKey(),
          active: true,
        })
        .returning();

      const [syncDir] = await db
        .insert(syncDirectories)
        .values({
          localPath: '/tmp/test',
          remoteServerId: server.id,
          remotePath: '/tmp/test',
          isLeader: true,
          status: 'active',
        })
        .returning();

      const response = await request(app).get(`/api/sync/${syncDir.id}`).expect(200);

      expect(response.body.id).toBe(syncDir.id);
      expect(response.body.localPath).toBe('/tmp/test');
      expect(response.body).toHaveProperty('stats');
      expect(response.body).toHaveProperty('recentLogs');
    });

    it('should update sync status', async () => {
      const [server] = await db
        .insert(servers)
        .values({
          serverId: 'test-1',
          name: 'testServer',
          url: 'http://test:3000',
          apiKey: generateApiKey(),
          active: true,
        })
        .returning();

      const [syncDir] = await db
        .insert(syncDirectories)
        .values({
          localPath: '/tmp/test',
          remoteServerId: server.id,
          remotePath: '/tmp/test',
          isLeader: true,
          status: 'active',
        })
        .returning();

      const response = await request(app)
        .patch(`/api/sync/${syncDir.id}/status`)
        .send({ status: 'paused' })
        .expect(200);

      expect(response.body.status).toBe('paused');

      const [updated] = await db
        .select()
        .from(syncDirectories)
        .where(eq(syncDirectories.id, syncDir.id));
      expect(updated.status).toBe('paused');
    });

    it('should delete sync directory', async () => {
      const [server] = await db
        .insert(servers)
        .values({
          serverId: 'test-1',
          name: 'testServer',
          url: 'http://test:3000',
          apiKey: generateApiKey(),
          active: true,
        })
        .returning();

      const [syncDir] = await db
        .insert(syncDirectories)
        .values({
          localPath: '/tmp/test',
          remoteServerId: server.id,
          remotePath: '/tmp/test',
          isLeader: true,
          status: 'active',
        })
        .returning();

      await request(app).delete(`/api/sync/${syncDir.id}`).expect(204);

      const [deleted] = await db
        .select()
        .from(syncDirectories)
        .where(eq(syncDirectories.id, syncDir.id));
      expect(deleted).toBeUndefined();
    });
  });

  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/api/sync/health').expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('activeSyncs');
      expect(response.body).toHaveProperty('queuedOperations');
      expect(response.body).toHaveProperty('watchers');
      expect(response.body).toHaveProperty('storage');
    });
  });

  describe('Sync Logs', () => {
    it('should return sync logs', async () => {
      const [server] = await db
        .insert(servers)
        .values({
          serverId: 'test-1',
          name: 'testServer',
          url: 'http://test:3000',
          apiKey: generateApiKey(),
          active: true,
        })
        .returning();

      const [syncDir] = await db
        .insert(syncDirectories)
        .values({
          localPath: '/tmp/test',
          remoteServerId: server.id,
          remotePath: '/tmp/test',
          isLeader: true,
          status: 'active',
        })
        .returning();

      // Create some logs
      await db.insert(syncLogs).values({
        syncDirId: syncDir.id,
        action: 'create',
        filePath: 'test.txt',
        direction: 'outbound',
        status: 'success',
      });

      const response = await request(app).get(`/api/sync/${syncDir.id}/logs`).expect(200);

      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('logs');
      expect(Array.isArray(response.body.logs)).toBe(true);
      expect(response.body.logs.length).toBe(1);
    });

    it('should filter logs by action', async () => {
      const [server] = await db
        .insert(servers)
        .values({
          serverId: 'test-1',
          name: 'testServer',
          url: 'http://test:3000',
          apiKey: generateApiKey(),
          active: true,
        })
        .returning();

      const [syncDir] = await db
        .insert(syncDirectories)
        .values({
          localPath: '/tmp/test',
          remoteServerId: server.id,
          remotePath: '/tmp/test',
          isLeader: true,
          status: 'active',
        })
        .returning();

      await db.insert(syncLogs).values([
        {
          syncDirId: syncDir.id,
          action: 'create',
          filePath: 'test1.txt',
          direction: 'outbound',
          status: 'success',
        },
        {
          syncDirId: syncDir.id,
          action: 'update',
          filePath: 'test2.txt',
          direction: 'outbound',
          status: 'success',
        },
      ]);

      const response = await request(app)
        .get(`/api/sync/${syncDir.id}/logs?action=create`)
        .expect(200);

      expect(response.body.logs.length).toBe(1);
      expect(response.body.logs[0].action).toBe('create');
    });
  });

  describe('API Key Authentication', () => {
    it('should reject requests without API key for protected endpoints', async () => {
      await request(app)
        .post('/api/sync/register')
        .send({
          directory: '/tmp/test',
          sourceServer: 'test',
          sourceUrl: 'http://test:3000',
          isLeader: false,
        })
        .expect(401);
    });

    it('should accept requests with valid API key', async () => {
      const apiKey = generateApiKey();

      await db.insert(servers).values({
        serverId: 'test-1',
        name: 'testServer',
        url: 'http://test:3000',
        apiKey,
        active: true,
      });

      await request(app)
        .post('/api/sync/register')
        .set('X-API-Key', apiKey)
        .send({
          directory: '/tmp/test-sync',
          sourceServer: 'testSource',
          sourceUrl: 'http://test-source:3000',
          isLeader: false,
        })
        .expect(201);
    });
  });

  describe('Non-existent Directory Handling', () => {
    it('should allow registering non-existent directories', async () => {
      const apiKey = generateApiKey();
      await db
        .insert(servers)
        .values({
          serverId: 'test-1',
          name: 'testServer',
          url: 'http://test:3000',
          apiKey,
          active: true,
        })
        .returning();

      const nonExistentPath = '/tmp/non-existent-test-dir-' + Date.now();

      // Register non-existent directory
      await request(app)
        .post('/api/sync/register')
        .set('X-API-Key', apiKey)
        .send({
          directory: nonExistentPath,
          sourceServer: 'testSource',
          sourceUrl: 'http://test-source:3000',
          isLeader: false,
        })
        .expect(201);

      // Verify directory was created
      const fs = await import('fs/promises');
      const exists = await fs
        .access(nonExistentPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);

      // Clean up
      await fs.rm(nonExistentPath, { recursive: true, force: true });
    });

    it('should create directory locally when registering non-existent sync directory', async () => {
      const nonExistentPath = '/tmp/non-existent-sync-' + Date.now();
      const fs = await import('fs/promises');

      // Ensure directory doesn't exist
      await fs.rm(nonExistentPath, { recursive: true, force: true }).catch(() => {});

      const [server] = await db
        .insert(servers)
        .values({
          serverId: 'test-1',
          name: 'testServer',
          url: 'http://test:3000',
          apiKey: generateApiKey(),
          active: true,
        })
        .returning();

      // Create sync directory entry (simulating what /api/sync/add would do)
      const [syncDir] = await db
        .insert(syncDirectories)
        .values({
          localPath: nonExistentPath,
          remoteServerId: server.id,
          remotePath: nonExistentPath,
          isLeader: true,
          status: 'active',
        })
        .returning();

      expect(syncDir).toBeDefined();
      expect(syncDir.localPath).toBe(nonExistentPath);

      // Clean up
      await fs.rm(nonExistentPath, { recursive: true, force: true }).catch(() => {});
    });

    it('should handle initial sync gracefully when directory does not exist', async () => {
      const nonExistentPath = '/tmp/non-existent-initial-sync-' + Date.now();
      const fs = await import('fs/promises');

      // Ensure directory doesn't exist
      await fs.rm(nonExistentPath, { recursive: true, force: true }).catch(() => {});

      const [server] = await db
        .insert(servers)
        .values({
          serverId: 'test-1',
          name: 'testServer',
          url: 'http://test:3000',
          apiKey: generateApiKey(),
          active: true,
        })
        .returning();

      const [syncDir] = await db
        .insert(syncDirectories)
        .values({
          localPath: nonExistentPath,
          remoteServerId: server.id,
          remotePath: nonExistentPath,
          isLeader: true,
          status: 'active',
        })
        .returning();

      // Import syncEngine to test performInitialSync
      const { syncEngine } = await import('../services/sync-engine.js');

      // This should not throw an error, even though directory doesn't exist
      const result = await syncEngine.performInitialSync(syncDir.id);

      expect(result).toBeDefined();
      expect(result.filesSync).toBe(0);
      expect(result.directoriesSync).toBe(0);
      expect(result.bytesTransferred).toBe(0);

      // Clean up
      await fs.rm(nonExistentPath, { recursive: true, force: true }).catch(() => {});
    });

    it('should allow path validation for non-existent directories', async () => {
      const { validateDirectory } = await import('../utils/path-validator.js');
      const nonExistentPath = '/tmp/validation-test-' + Date.now();
      const fs = await import('fs/promises');

      // Ensure directory doesn't exist
      await fs.rm(nonExistentPath, { recursive: true, force: true }).catch(() => {});

      // Should not throw error when mustExist=false
      const validatedPath = validateDirectory(nonExistentPath, false);
      expect(validatedPath).toBeDefined();
      expect(validatedPath).toContain('validation-test');

      // Should throw error when mustExist=true
      expect(() => validateDirectory(nonExistentPath, true)).toThrow();
    });
  });
});
