import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { errorHandler } from '../middleware/error.js';
import { requestLogger } from '../middleware/logger.js';
import { apiRouter } from '../routes/index.js';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema.js';

// Create test app factory
export function createTestApp(_dbPath = './test.db') {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Disable logging in tests
  if (process.env.NODE_ENV !== 'test') {
    app.use(requestLogger);
  }

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  app.use('/api', apiRouter);
  app.use(errorHandler);

  return app;
}

// Test database helper
export function getTestDb(_dbPath = './test.db') {
  const sqlite = new Database(_dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  return drizzle(sqlite, { schema });
}

// Test data factories
export const testData = {
  user: (overrides = {}) => ({
    email: 'test@example.com',
    name: 'Test User',
    ...overrides,
  }),

  post: (authorId: number, overrides = {}) => ({
    title: 'Test Post',
    content: 'This is test content',
    slug: 'test-post',
    authorId,
    published: false,
    ...overrides,
  }),

  product: (overrides = {}) => ({
    name: 'Test Product',
    description: 'Test product description',
    price: 99.99,
    stock: 100,
    sku: 'TEST-001',
    category: 'Test Category',
    active: true,
    ...overrides,
  }),
};
