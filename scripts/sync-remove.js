#!/usr/bin/env node

/**
 * Remove a sync directory
 *
 * Usage:
 *   node scripts/sync-remove.js --id <sync-id>
 *   npm run sync:remove -- --id <sync-id>
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
  success,
  error,
  warning,
} from './common.js';

async function removeSync(syncId) {
  // Require API key for sync operations
  requireApiKey();

  // Check if local server is running
  const isRunning = await checkServer();
  if (!isRunning) {
    process.exit(1);
  }

  const client = createApiClient();

  // First, get sync details
  const getResponse = await client.get(`/api/sync/directories/${syncId}`);

  if (getResponse.status === 404) {
    error(`Sync directory with ID ${syncId} not found`);
    console.log('   Use sync-list.js to see all sync directories');
    process.exit(1);
  }

  const result = handleResponse(getResponse);
  if (!result.success) {
    process.exit(1);
  }

  const sync = result.data;

  header('Sync Directory Details');
  row('ID:', sync.id);
  row('Local Path:', sync.localPath);
  row('Remote Path:', sync.remotePath);
  row('Status:', sync.status);

  if (sync.server) {
    row('Remote Server:', sync.server.name);
  }

  console.log('');
  warning(`Are you sure you want to remove this sync directory?`);
  console.log('   This will stop synchronization but will NOT delete any files.');
  console.log('');

  // Perform deletion
  const deleteResponse = await client.delete(`/api/sync/directories/${syncId}`);
  const deleteResult = handleResponse(deleteResponse, `Sync directory removed successfully`);

  if (deleteResult.success) {
    console.log('');
    success('Synchronization stopped');
    console.log('   Files remain on both servers but will no longer sync.');
  } else {
    process.exit(1);
  }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.id) {
    printUsage(
      'sync-remove',
      `
  Remove a sync directory and stop synchronization.
  Note: This does not delete any files, only stops the synchronization.

  Options:
    --id <number>       Sync directory ID (required)
    --help              Show this help message

  Note: Requires X-API-Key to be set. Create one with: npm run create-api-key
`,
      [
        'node scripts/sync-remove.js --id 1',
        'npm run sync:remove -- --id 1',
      ],
    );
    process.exit(args.help ? 0 : 1);
  }

  removeSync(args.id)
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      error('Unexpected error: ' + err.message);
      process.exit(1);
    });
}

export { removeSync };
