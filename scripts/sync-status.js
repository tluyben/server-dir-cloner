#!/usr/bin/env node

/**
 * Show detailed status and logs for a sync directory
 *
 * Usage:
 *   node scripts/sync-status.js --id <sync-id>
 *   npm run sync:status -- --id <sync-id>
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
  error,
  formatDate,
  formatSize,
} from './common.js';

async function syncStatus(syncId, showLogs = false, limit = 20) {
  // Require API key for sync operations
  requireApiKey();

  // Check if local server is running
  const isRunning = await checkServer();
  if (!isRunning) {
    process.exit(1);
  }

  const client = createApiClient();

  // Get sync details
  const response = await client.get(`/api/sync/directories/${syncId}`);

  if (response.status === 404) {
    error(`Sync directory with ID ${syncId} not found`);
    console.log('   Use sync-list.js to see all sync directories');
    process.exit(1);
  }

  const result = handleResponse(response);
  if (!result.success) {
    process.exit(1);
  }

  const sync = result.data;

  header('Sync Directory Status');
  row('ID:', sync.id);
  row('Local Path:', sync.localPath);
  row('Remote Path:', sync.remotePath);
  row('Leader:', sync.isLeader ? 'Yes' : 'No');
  row('Direction:', sync.syncDirection);
  row('Status:', sync.status);
  row('Error Count:', sync.errorCount || 0);

  if (sync.lastSyncAt) {
    row('Last Sync:', formatDate(sync.lastSyncAt));
  } else {
    row('Last Sync:', 'Never');
  }

  row('Created:', formatDate(sync.createdAt));
  row('Updated:', formatDate(sync.updatedAt));

  // Show server info
  if (sync.server) {
    console.log('');
    header('Remote Server');
    row('ID:', sync.server.id);
    row('Name:', sync.server.name);
    row('URL:', sync.server.url);
    row('Active:', sync.server.active ? 'Yes' : 'No');

    if (sync.server.lastSeen) {
      row('Last Seen:', formatDate(sync.server.lastSeen));
    }
  }

  // Show statistics
  if (sync.stats) {
    console.log('');
    header('Statistics');
    row('Total Syncs:', sync.stats.totalSyncs || 0);
    row('Successful:', sync.stats.successfulSyncs || 0);
    row('Failed:', sync.stats.failedSyncs || 0);

    if (sync.stats.totalBytes) {
      row('Data Transferred:', formatSize(sync.stats.totalBytes));
    }
  }

  // Show recent logs if requested
  if (showLogs) {
    const logsResponse = await client.get(`/api/sync/directories/${syncId}/logs`, {
      params: { limit: limit.toString() },
    });

    if (logsResponse.status === 200) {
      const logsData = logsResponse.data;
      const logs = logsData.logs || [];

      console.log('');
      header(`Recent Sync Operations (${logs.length}/${logsData.total || 0})`);

      if (logs.length === 0) {
        console.log('  No sync operations yet');
      } else {
        logs.forEach((log, idx) => {
          console.log('');
          console.log(`  ${idx + 1}. ${log.action.toUpperCase()} - ${log.status}`);
          row('    File:', log.filePath);
          row('    Direction:', log.direction);
          row('    Time:', formatDate(log.timestamp));

          if (log.fileSize) {
            row('    Size:', formatSize(log.fileSize));
          }

          if (log.processingTimeMs) {
            row('    Duration:', `${log.processingTimeMs}ms`);
          }

          if (log.errorMessage) {
            row('    Error:', log.errorMessage);
          }
        });
      }

      console.log('');
    }
  }

  console.log('');
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.id) {
    printUsage(
      'sync-status',
      `
  Show detailed status and logs for a sync directory.

  Options:
    --id <number>       Sync directory ID (required)
    --logs              Show recent sync operation logs
    --limit <number>    Number of log entries to show (default: 20)
    --help              Show this help message

  Note: Requires X-API-Key to be set. Create one with: npm run create-api-key
`,
      [
        'node scripts/sync-status.js --id 1',
        'npm run sync:status -- --id 1 --logs',
        'npm run sync:status -- --id 1 --logs --limit 50',
      ],
    );
    process.exit(args.help ? 0 : 1);
  }

  const showLogs = args.logs === true;
  const limit = args.limit ? parseInt(args.limit, 10) : 20;

  syncStatus(args.id, showLogs, limit)
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      error('Unexpected error: ' + err.message);
      process.exit(1);
    });
}

export { syncStatus };
