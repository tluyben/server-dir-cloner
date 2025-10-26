#!/usr/bin/env node

/**
 * List all active sync directories
 *
 * Usage:
 *   node scripts/sync-list.js
 *   npm run sync:list
 */

import {
  createApiClient,
  handleResponse,
  checkServer,
  requireApiKey,
  parseArgs,
  printUsage,
  header,
  row,
  formatDate,
  error,
  info,
} from './common.js';

async function listSyncs(detailed = false) {
  // Require API key for sync operations
  requireApiKey();

  // Check if local server is running
  const isRunning = await checkServer();
  if (!isRunning) {
    process.exit(1);
  }

  const client = createApiClient();

  const response = await client.get('/api/sync/directories');
  const result = handleResponse(response);

  if (result.success) {
    const syncs = result.data;

    if (!syncs || syncs.length === 0) {
      info('No sync directories configured yet');
      console.log('   Add a sync with: npm run sync:add');
      return;
    }

    header(`Active Sync Directories (${syncs.length})`);

    for (const sync of syncs) {
      console.log('');
      row('ID:', sync.id);
      row('Local Path:', sync.localPath);
      row('Remote Server ID:', sync.remoteServerId);
      row('Remote Path:', sync.remotePath);
      row('Leader:', sync.isLeader ? 'Yes' : 'No');
      row('Direction:', sync.syncDirection);
      row('Status:', sync.status);

      if (sync.lastSyncAt) {
        row('Last Sync:', formatDate(sync.lastSyncAt));
      } else {
        row('Last Sync:', 'Never');
      }

      row('Error Count:', sync.errorCount || 0);
      row('Created:', formatDate(sync.createdAt));

      // Get detailed info if requested
      if (detailed) {
        const detailResponse = await client.get(`/api/sync/directories/${sync.id}`);
        if (detailResponse.status === 200) {
          const detail = detailResponse.data;

          if (detail.server) {
            console.log('');
            console.log('  Remote Server:');
            console.log(`    Name: ${detail.server.name}`);
            console.log(`    URL: ${detail.server.url}`);
            console.log(`    Active: ${detail.server.active ? 'Yes' : 'No'}`);
          }

          if (detail.stats) {
            console.log('');
            console.log('  Statistics:');
            console.log(`    Files Synced: ${detail.stats.totalSyncs || 0}`);
            console.log(`    Successful: ${detail.stats.successfulSyncs || 0}`);
            console.log(`    Failed: ${detail.stats.failedSyncs || 0}`);
          }
        }
      }

      console.log('  ' + '─'.repeat(58));
    }

    console.log('');
  } else {
    process.exit(1);
  }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage(
      'sync-list',
      `
  List all active sync directories.

  Options:
    --detailed          Show detailed information including server details and statistics
    --help              Show this help message

  Note: Requires X-API-Key to be set. Create one with: npm run create-api-key
`,
      [
        'node scripts/sync-list.js',
        'npm run sync:list',
        'npm run sync:list -- --detailed',
      ],
    );
    process.exit(0);
  }

  listSyncs(args.detailed)
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      error('Unexpected error: ' + err.message);
      process.exit(1);
    });
}

export { listSyncs };
