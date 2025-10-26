#!/usr/bin/env node

/**
 * Remove a server from the synchronization network
 *
 * Usage:
 *   node scripts/server-remove.js --id <server-id>
 *   npm run server:remove -- --id <server-id>
 */

import {
  createApiClient,
  handleResponse,
  checkServer,
  parseArgs,
  printUsage,
  header,
  row,
  success,
  error,
  warning,
} from './common.js';

async function removeServer(serverId) {
  // Check if local server is running
  const isRunning = await checkServer();
  if (!isRunning) {
    process.exit(1);
  }

  const client = createApiClient();

  // First, get server details
  const getResponse = await client.get(`/api/servers/${serverId}`);

  if (getResponse.status === 404) {
    error(`Server with ID ${serverId} not found`);
    console.log('   Use server-list.js to see all servers');
    process.exit(1);
  }

  const result = handleResponse(getResponse);
  if (!result.success) {
    process.exit(1);
  }

  const server = result.data;

  header('Server Details');
  row('ID:', server.id);
  row('Name:', server.name);
  row('URL:', server.url);

  if (server.syncCount > 0) {
    console.log('');
    warning(`This server has ${server.syncCount} active sync directories`);
    console.log('');
    console.log('Sync directories:');
    server.syncs.forEach((sync, idx) => {
      console.log(`  ${idx + 1}. ${sync.localPath} → ${sync.remotePath}`);
    });
    console.log('');
    error('Cannot remove server with active syncs');
    console.log('   Remove sync directories first with: npm run sync:remove -- --id <sync-id>');
    process.exit(1);
  }

  console.log('');
  warning(`Are you sure you want to remove server "${server.name}"?`);
  console.log('   This action cannot be undone.');
  console.log('');

  // Perform deletion
  const deleteResponse = await client.delete(`/api/servers/${serverId}`);
  const deleteResult = handleResponse(
    deleteResponse,
    `Server "${server.name}" removed successfully`,
  );

  if (!deleteResult.success) {
    process.exit(1);
  }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.id) {
    printUsage(
      'server-remove',
      `
  Remove a server from the synchronization network.
  Note: Servers with active sync directories cannot be removed.

  Options:
    --id <number>       Server ID (required)
    --help              Show this help message
`,
      ['node scripts/server-remove.js --id 1', 'npm run server:remove -- --id 1'],
    );
    process.exit(args.help ? 0 : 1);
  }

  removeServer(args.id)
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      error('Unexpected error: ' + err.message);
      process.exit(1);
    });
}

export { removeServer };
