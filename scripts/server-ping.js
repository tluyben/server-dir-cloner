#!/usr/bin/env node

/**
 * Test connection to a registered server
 *
 * Usage:
 *   node scripts/server-ping.js --id <server-id>
 *   npm run server:ping -- --id <server-id>
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
  formatDate,
} from './common.js';

async function pingServer(serverId) {
  // Check if local server is running
  const isRunning = await checkServer();
  if (!isRunning) {
    process.exit(1);
  }

  const client = createApiClient();

  header(`Testing Connection to Server #${serverId}`);

  const response = await client.post(`/api/servers/${serverId}/ping`);

  if (response.status === 404) {
    error(`Server with ID ${serverId} not found`);
    console.log('   Use server-list.js to see all servers');
    process.exit(1);
  }

  const result = handleResponse(response);

  if (result.success) {
    const data = result.data;

    console.log('');
    row('Server ID:', data.serverId);
    row('Server Name:', data.serverName);
    row('URL:', data.url);
    row('Status:', data.connected ? 'Connected ✅' : 'Not Connected ❌');

    if (data.error) {
      row('Error:', data.error);
    }

    row('Test Time:', formatDate(data.timestamp));
    console.log('');

    if (data.connected) {
      success('Server is reachable and responding');
    } else {
      error('Server is not reachable');
      console.log('   Check that the server is running and the URL is correct');
    }
  } else {
    process.exit(1);
  }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.id) {
    printUsage(
      'server-ping',
      `
  Test connection to a registered server.

  Options:
    --id <number>       Server ID (required)
    --help              Show this help message
`,
      [
        'node scripts/server-ping.js --id 1',
        'npm run server:ping -- --id 1',
      ],
    );
    process.exit(args.help ? 0 : 1);
  }

  pingServer(args.id)
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      error('Unexpected error: ' + err.message);
      process.exit(1);
    });
}

export { pingServer };
