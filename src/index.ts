import dotenv from 'dotenv';
import { createApp } from './app.js';
import { queueProcessor } from './services/queue-processor.js';
import { watcherService } from './services/watcher.js';
import { db, syncDirectories } from './db/index.js';
import { eq } from 'drizzle-orm';

dotenv.config();

const app = createApp();
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📝 API available at http://localhost:${PORT}/api`);
  console.log(`🏥 Health check at http://localhost:${PORT}/health`);
  console.log(`🔄 Sync API at http://localhost:${PORT}/api/sync`);

  // Start queue processor
  queueProcessor.start();
  console.log('✅ Queue processor started');

  // Resume watchers for active sync directories
  try {
    const activeSyncs = await db
      .select()
      .from(syncDirectories)
      .where(eq(syncDirectories.status, 'active'));

    for (const sync of activeSyncs) {
      await watcherService.startWatching(sync.id);
    }

    console.log(`✅ Resumed ${activeSyncs.length} active sync watchers`);
  } catch (error) {
    console.error('Error resuming watchers:', error);
  }
});

// Graceful shutdown
const shutdown = async () => {
  console.log('\n🛑 Shutting down gracefully...');

  // Stop accepting new connections
  server.close(() => {
    console.log('✅ HTTP server closed');
  });

  // Stop queue processor
  queueProcessor.stop();
  console.log('✅ Queue processor stopped');

  // Stop all watchers
  await watcherService.stopAll();
  console.log('✅ All watchers stopped');

  // Give time for cleanup
  setTimeout(() => {
    console.log('👋 Goodbye!');
    process.exit(0);
  }, 1000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
