import { beforeAll, afterAll, beforeEach } from '@jest/globals';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import fs from 'fs';

// Use test database
export const TEST_DB_PATH = './test.db';

// Override the database connection for tests
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = TEST_DB_PATH;

let testDb: Database.Database;

beforeAll(() => {
  // Remove old test database if exists
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  // Create test database
  testDb = new Database(TEST_DB_PATH);
  testDb.pragma('journal_mode = WAL');
  testDb.pragma('foreign_keys = ON');

  // Run migrations
  const db = drizzle(testDb);
  migrate(db, { migrationsFolder: './drizzle' });
});

beforeEach(() => {
  // Clear all tables before each test
  // Delete in correct order due to foreign keys
  testDb.exec('DELETE FROM posts');
  testDb.exec('DELETE FROM products');
  testDb.exec('DELETE FROM users');
});

afterAll(() => {
  // Close and clean up test database
  if (testDb) {
    testDb.close();
  }
  // Clean up test database file
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
  if (fs.existsSync(TEST_DB_PATH + '-shm')) {
    fs.unlinkSync(TEST_DB_PATH + '-shm');
  }
  if (fs.existsSync(TEST_DB_PATH + '-wal')) {
    fs.unlinkSync(TEST_DB_PATH + '-wal');
  }
});