#!/usr/bin/env node

/**
 * Add a directory for synchronization
 *
 * Usage:
 *   node scripts/sync-add.js --directory "/path/to/dir" --targets "Server1,Server2"
 *   npm run sync:add -- --directory "/path/to/dir" --targets "Server1,Server2"
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

async function addSync(directory, targets) {
  // Require API key for sync operations
  requireApiKey();

  // Check if local server is running
  const isRunning = await checkServer();
  if (!isRunning) {
    process.exit(1);
  }

  const client = createApiClient();

  header('Adding Directory for Synchronization');
  row('Directory:', directory);
  row('Targets:', targets.join(', '));
  console.log('');

  const response = await client.post('/api/sync/add', {
    directory,
    targets,
  });

  const result = handleResponse(response);

  if (result.success) {
    const data = result.data;

    success('Directory synchronization initiated');
    console.log('');
    row('Local Path:', data.localPath);
    row('Targets:', data.targets.length);
    console.log('');

    if (data.targets && data.targets.length > 0) {
      console.log('Target Servers:');
      data.targets.forEach((target, idx) => {
        console.log(`  ${idx + 1}. ${target.serverName}`);
        console.log(`     Remote Path: ${target.remotePath}`);
        console.log(`     Status: ${target.status}`);
        console.log(`     Leader: ${target.isLeader ? 'Yes' : 'No'}`);
        if (target.filesSynced !== undefined) {
          console.log(`     Files Synced: ${target.filesSynced}`);
        }
        console.log('');
      });
    }

    success('Synchronization is now active!');
    console.log('   Any changes to the directory will be automatically synced.');
  } else {
    if (result.status === 404) {
      error('One or more target servers not found');
      console.log('   Use server-list.js to see available servers');
    }
    process.exit(1);
  }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.directory || !args.targets) {
    printUsage(
      'sync-add',
      `
  Add a directory for synchronization with one or more target servers.

  Options:
    --directory <path>  Local directory path (required)
    --targets <names>   Comma-separated target server names (required)
    --help              Show this help message

  Note: Requires X-API-Key to be set. Create one with: npm run create-api-key
`,
      [
        'node scripts/sync-add.js --directory "/home/data" --targets "Server1"',
        'npm run sync:add -- --directory "/var/www/uploads" --targets "Server1,Server2"',
      ],
    );
    process.exit(args.help ? 0 : 1);
  }

  const targets = args.targets.split(',').map((t) => t.trim());

  addSync(args.directory, targets)
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      error('Unexpected error: ' + err.message);
      console.error(err);
      process.exit(1);
    });
}

export { addSync };
