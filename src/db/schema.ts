import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const posts = sqliteTable('posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  content: text('content').notNull(),
  slug: text('slug').notNull().unique(),
  authorId: integer('author_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  published: integer('published', { mode: 'boolean' }).notNull().default(false),
  publishedAt: text('published_at'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const products = sqliteTable('products', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  description: text('description'),
  price: real('price').notNull(),
  stock: integer('stock').notNull().default(0),
  sku: text('sku').notNull().unique(),
  category: text('category'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

// Sync-related tables
export const servers = sqliteTable('servers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  serverId: text('server_id').notNull().unique(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  apiKey: text('api_key').notNull(),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  lastSeen: text('last_seen'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const syncDirectories = sqliteTable('sync_directories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  localPath: text('local_path').notNull(),
  remoteServerId: integer('remote_server_id')
    .notNull()
    .references(() => servers.id, { onDelete: 'cascade' }),
  remotePath: text('remote_path').notNull(),
  isLeader: integer('is_leader', { mode: 'boolean' }).notNull().default(false),
  syncDirection: text('sync_direction').notNull().default('bidirectional'), // 'bidirectional' | 'send' | 'receive'
  status: text('status').notNull().default('active'), // 'active' | 'paused' | 'error'
  lastSyncAt: text('last_sync_at'),
  errorCount: integer('error_count').notNull().default(0),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const syncLogs = sqliteTable('sync_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  syncDirId: integer('sync_dir_id')
    .notNull()
    .references(() => syncDirectories.id, { onDelete: 'cascade' }),
  action: text('action').notNull(), // 'create' | 'update' | 'delete' | 'mkdir' | 'rmdir'
  filePath: text('file_path').notNull(),
  direction: text('direction').notNull(), // 'outbound' | 'inbound'
  status: text('status').notNull(), // 'success' | 'failure' | 'pending'
  errorMessage: text('error_message'),
  fileSize: integer('file_size'),
  checksum: text('checksum'),
  timestamp: text('timestamp')
    .notNull()
    .default(sql`(datetime('now'))`),
  processingTimeMs: integer('processing_time_ms'),
});

export const syncQueue = sqliteTable('sync_queue', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  syncDirId: integer('sync_dir_id')
    .notNull()
    .references(() => syncDirectories.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),
  filePath: text('file_path').notNull(),
  priority: integer('priority').notNull().default(5),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  status: text('status').notNull().default('pending'), // 'pending' | 'processing' | 'failed' | 'completed'
  errorMessage: text('error_message'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;

export type Server = typeof servers.$inferSelect;
export type NewServer = typeof servers.$inferInsert;
export type SyncDirectory = typeof syncDirectories.$inferSelect;
export type NewSyncDirectory = typeof syncDirectories.$inferInsert;
export type SyncLog = typeof syncLogs.$inferSelect;
export type NewSyncLog = typeof syncLogs.$inferInsert;
export type SyncQueueItem = typeof syncQueue.$inferSelect;
export type NewSyncQueueItem = typeof syncQueue.$inferInsert;
