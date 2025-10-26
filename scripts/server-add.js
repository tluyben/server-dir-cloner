#!/usr/bin/env node

/**
 * Add a new server to the synchronization network
 *
 * Usage:
 *   node scripts/server-add.js --name "Server Name" --url "http://server.example.com:3000"
 *   npm run server:add -- --name "Server Name" --url "http://server.example.com:3000"
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
} from './common.js';

async function addServer(name, url, apiKey = null) {
  // Check if local server is running
  const isRunning = await checkServer();
  if (!isRunning) {
    process.exit(1);
  }

  const client = createApiClient();

  header('Adding New Server');

  const payload = { name, url };
  if (apiKey) {
    payload.apiKey = apiKey;
  }

  const response = await client.post('/api/servers', payload);
  const result = handleResponse(response);

  if (result.success) {
    const server = result.data;

    header('Server Registered Successfully');
    row('ID:', server.id);
    row('Server ID:', server.serverId);
    row('Name:', server.name);
    row('URL:', server.url);
    row('Active:', server.active ? 'Yes' : 'No');
    row('Created:', new Date(server.createdAt).toLocaleString());
    console.log('');
    success('API Key: ' + server.apiKey);
    console.log('');
    console.log('⚠️  Important: Save this API key securely!');
    console.log('   Use this key when making requests from the remote server.');
    console.log('');

    return server;
  } else {
    if (result.status === 409) {
      error('A server with this name already exists');
      console.log('   Try a different name or use server-list.js to view existing servers');
    }
    process.exit(1);
  }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.name || !args.url) {
    printUsage(
      'server-add',
      `
  Add a new server to the synchronization network.

  Options:
    --name <string>     Server name (required)
    --url <url>         Server URL including port (required)
    --apiKey <string>   Custom API key (optional, auto-generated if not provided)
    --help              Show this help message
`,
      [
        'node scripts/server-add.js --name "Production Server" --url "http://192.168.1.100:3000"',
        'npm run server:add -- --name "Backup Server" --url "https://backup.example.com:3000"',
      ],
    );
    process.exit(args.help ? 0 : 1);
  }

  addServer(args.name, args.url, args.apiKey)
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      error('Unexpected error: ' + err.message);
      process.exit(1);
    });
}

export { addServer };
