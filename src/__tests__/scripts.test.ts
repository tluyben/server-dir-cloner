import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../app.js';
import { db, servers, syncDirectories } from '../db/index.js';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Tests for local administration scripts functionality
 *
 * These tests verify that the scripts directory and common utilities
 * work correctly with the API endpoints they interact with.
 */

describe('Scripts Integration Tests', () => {
  const app = createApp();
  let testApiKey: string;
  let testServerId: number;

  beforeAll(async () => {
    // Create a test server and API key
    const [server] = await db
      .insert(servers)
      .values({
        serverId: 'test-server-scripts',
        name: 'Test Scripts Server',
        url: 'http://localhost:3000',
        apiKey: 'test-scripts-api-key-12345678901234567890123456789012',
        active: true,
      })
      .returning();

    testServerId = server.id;
    testApiKey = server.apiKey;
  });

  afterAll(async () => {
    // Clean up test data
    await db.delete(syncDirectories).where(eq(syncDirectories.remoteServerId, testServerId));
    await db.delete(servers).where(eq(servers.id, testServerId));
  });

  describe('Scripts Directory Structure', () => {
    it('should have scripts directory', () => {
      const scriptsDir = path.join(path.dirname(__dirname), '..', 'scripts');
      expect(fs.existsSync(scriptsDir)).toBe(true);
    });

    it('should have common.js utilities file', () => {
      const commonFile = path.join(path.dirname(__dirname), '..', 'scripts', 'common.js');
      expect(fs.existsSync(commonFile)).toBe(true);
    });

    it('should have all server management scripts', () => {
      const scriptsDir = path.join(path.dirname(__dirname), '..', 'scripts');
      const expectedScripts = [
        'server-add.js',
        'server-list.js',
        'server-remove.js',
        'server-ping.js',
      ];

      expectedScripts.forEach((script) => {
        const scriptPath = path.join(scriptsDir, script);
        expect(fs.existsSync(scriptPath)).toBe(true);
      });
    });

    it('should have all sync management scripts', () => {
      const scriptsDir = path.join(path.dirname(__dirname), '..', 'scripts');
      const expectedScripts = ['sync-add.js', 'sync-list.js', 'sync-remove.js', 'sync-status.js'];

      expectedScripts.forEach((script) => {
        const scriptPath = path.join(scriptsDir, script);
        expect(fs.existsSync(scriptPath)).toBe(true);
      });
    });
  });

  describe('Server Management API Endpoints', () => {
    it('should list servers (used by server-list.js)', async () => {
      const response = await request(app).get('/api/servers').expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
    });

    it('should get server details (used by server-list.js --detailed)', async () => {
      const response = await request(app).get(`/api/servers/${testServerId}`).expect(200);

      expect(response.body).toHaveProperty('id', testServerId);
      expect(response.body).toHaveProperty('name', 'Test Scripts Server');
      expect(response.body).toHaveProperty('syncCount');
    });

    it('should add a new server (used by server-add.js)', async () => {
      const response = await request(app)
        .post('/api/servers')
        .send({
          name: 'Test Add Server',
          url: 'http://localhost:3001',
          apiKey: 'test-add-key-123456789012345678901234567890123456',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('name', 'Test Add Server');
      expect(response.body).toHaveProperty('apiKey');

      // Clean up
      await db.delete(servers).where(eq(servers.id, response.body.id));
    });

    it('should ping a server (used by server-ping.js)', async () => {
      const response = await request(app).post(`/api/servers/${testServerId}/ping`).expect(200);

      expect(response.body).toHaveProperty('serverId', testServerId);
      expect(response.body).toHaveProperty('connected');
    });

    it('should update a server (used by server management)', async () => {
      const response = await request(app)
        .put(`/api/servers/${testServerId}`)
        .send({
          active: false,
        })
        .expect(200);

      expect(response.body).toHaveProperty('active', false);

      // Restore
      await db.update(servers).set({ active: true }).where(eq(servers.id, testServerId));
    });
  });

  describe('Sync Management API Endpoints', () => {
    it('should list sync directories (used by sync-list.js)', async () => {
      const response = await request(app)
        .get('/api/sync/directories')
        .set('X-API-Key', testApiKey)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should require API key for sync operations', async () => {
      const response = await request(app).get('/api/sync/directories').expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should get sync directory details (used by sync-status.js)', async () => {
      // Create a test sync directory first
      const [syncDir] = await db
        .insert(syncDirectories)
        .values({
          localPath: '/test/path',
          remoteServerId: testServerId,
          remotePath: '/test/path',
          isLeader: true,
          syncDirection: 'bidirectional',
          status: 'active',
        })
        .returning();

      const response = await request(app)
        .get(`/api/sync/directories/${syncDir.id}`)
        .set('X-API-Key', testApiKey)
        .expect(200);

      expect(response.body).toHaveProperty('id', syncDir.id);
      expect(response.body).toHaveProperty('localPath', '/test/path');

      // Clean up
      await db.delete(syncDirectories).where(eq(syncDirectories.id, syncDir.id));
    });
  });

  describe('Package.json Scripts', () => {
    it('should have npm scripts defined for server management', () => {
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(path.dirname(__dirname), '..', 'package.json'), 'utf-8'),
      );

      expect(packageJson.scripts).toHaveProperty('server:add');
      expect(packageJson.scripts).toHaveProperty('server:list');
      expect(packageJson.scripts).toHaveProperty('server:remove');
      expect(packageJson.scripts).toHaveProperty('server:ping');
    });

    it('should have npm scripts defined for sync management', () => {
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(path.dirname(__dirname), '..', 'package.json'), 'utf-8'),
      );

      expect(packageJson.scripts).toHaveProperty('sync:add');
      expect(packageJson.scripts).toHaveProperty('sync:list');
      expect(packageJson.scripts).toHaveProperty('sync:remove');
      expect(packageJson.scripts).toHaveProperty('sync:status');
    });
  });

  describe('Documentation', () => {
    it('should have SCRIPTS_GUIDE.md documentation', () => {
      const guideFile = path.join(path.dirname(__dirname), '..', 'SCRIPTS_GUIDE.md');
      expect(fs.existsSync(guideFile)).toBe(true);

      const content = fs.readFileSync(guideFile, 'utf-8');
      expect(content).toContain('Local Administration Scripts');
      expect(content).toContain('server:add');
      expect(content).toContain('sync:add');
    });

    it('should document all scripts in SCRIPTS_GUIDE.md', () => {
      const guideFile = path.join(path.dirname(__dirname), '..', 'SCRIPTS_GUIDE.md');
      const content = fs.readFileSync(guideFile, 'utf-8');

      const scripts = [
        'server:add',
        'server:list',
        'server:remove',
        'server:ping',
        'sync:add',
        'sync:list',
        'sync:remove',
        'sync:status',
      ];

      scripts.forEach((script) => {
        expect(content).toContain(script);
      });
    });
  });
});
