#!/usr/bin/env node

/**
 * List all registered servers
 *
 * Usage:
 *   node scripts/server-list.js
 *   npm run server:list
 */

import {
  createApiClient,
  handleResponse,
  checkServer,
  header,
  row,
  formatDate,
  error,
  info,
  parseArgs,
  printUsage,
} from './common.js';

async function listServers(detailed = false) {
  // Check if local server is running
  const isRunning = await checkServer();
  if (!isRunning) {
    process.exit(1);
  }

  const client = createApiClient();

  const response = await client.get('/api/servers');
  const result = handleResponse(response);

  if (result.success) {
    const servers = result.data;

    if (servers.length === 0) {
      info('No servers registered yet');
      console.log('   Add a server with: npm run server:add');
      return;
    }

    header(`Registered Servers (${servers.length})`);

    for (const server of servers) {
      console.log('');
      row('ID:', server.id);
      row('Server ID:', server.serverId);
      row('Name:', server.name);
      row('URL:', server.url);
      row('Active:', server.active ? 'Yes' : 'No');

      if (detailed) {
        row('API Key:', server.apiKey);
      }

      row('Created:', formatDate(server.createdAt));
      row('Updated:', formatDate(server.updatedAt));

      if (server.lastSeen) {
        row('Last Seen:', formatDate(server.lastSeen));
      }

      // Get detailed info if requested
      if (detailed) {
        const detailResponse = await client.get(`/api/servers/${server.id}`);
        if (detailResponse.status === 200) {
          const detail = detailResponse.data;
          row('Sync Count:', detail.syncCount || 0);

          if (detail.syncs && detail.syncs.length > 0) {
            console.log('');
            console.log('  Sync Directories:');
            detail.syncs.forEach((sync, idx) => {
              console.log(`    ${idx + 1}. ${sync.localPath} → ${sync.remotePath} (${sync.status})`);
            });
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
      'server-list',
      `
  List all registered servers in the synchronization network.

  Options:
    --detailed          Show detailed information including API keys and syncs
    --help              Show this help message
`,
      [
        'node scripts/server-list.js',
        'npm run server:list',
        'npm run server:list -- --detailed',
      ],
    );
    process.exit(0);
  }

  listServers(args.detailed)
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      error('Unexpected error: ' + err.message);
      process.exit(1);
    });
}

export { listServers };
