# Local Administration Scripts

This directory contains command-line tools for managing servers and sync directories without dealing with curl commands or API keys directly.

## Quick Reference

### Server Management

```bash
# Add a server
npm run server:add -- --name "Production" --url "http://192.168.1.100:3000"

# List all servers
npm run server:list

# List with details
npm run server:list -- --detailed

# Ping a server
npm run server:ping -- --id 1

# Remove a server
npm run server:remove -- --id 1
```

### Sync Management

```bash
# Add sync directory
npm run sync:add -- --directory "/home/data" --targets "Production"

# List all syncs
npm run sync:list

# List with details
npm run sync:list -- --detailed

# Show sync status
npm run sync:status -- --id 1

# Show sync status with logs
npm run sync:status -- --id 1 --logs --limit 50

# Remove sync
npm run sync:remove -- --id 1
```

## Available Scripts

### Server Scripts

- **server-add.js** - Register a new server in the network
- **server-list.js** - List all registered servers
- **server-remove.js** - Remove a server (must have no active syncs)
- **server-ping.js** - Test connection to a server

### Sync Scripts

- **sync-add.js** - Add a directory for synchronization
- **sync-list.js** - List all sync directories
- **sync-remove.js** - Remove sync directory (stops sync, doesn't delete files)
- **sync-status.js** - Show detailed status and operation logs

### Utilities

- **common.js** - Shared utilities for all scripts (API client, formatting, etc.)

## Prerequisites

1. **Server must be running**: `npm run dev` or `npm start`
2. **API key required** (for sync operations): `npm run create-api-key`

## Help

Every script has a `--help` flag:

```bash
npm run server:add -- --help
npm run sync:status -- --help
```

## Full Documentation

See **[../SCRIPTS_GUIDE.md](../SCRIPTS_GUIDE.md)** for:

- Detailed usage instructions
- All available options
- Example workflows
- Troubleshooting guide
- Integration with CI/CD
