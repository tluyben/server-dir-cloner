# Local Administration Scripts Guide

This guide covers the local administration scripts for managing servers and sync directories without dealing with curl commands or API keys directly.

## Overview

The `scripts/` directory contains command-line tools for:

- **Server Management**: Register, list, remove, and test remote servers
- **Sync Management**: Configure, monitor, and remove directory synchronization
- **No Manual API Key Handling**: Scripts automatically load your API key from `.env.local`
- **User-Friendly Output**: Colored, formatted output for easy reading

## Quick Start

### 1. Create Your First API Key

Before using sync operations, you need an API key:

```bash
npm run create-api-key
```

This creates a server entry and saves the API key to `.env.local` automatically.

### 2. Add a Remote Server

Register a remote server for synchronization:

```bash
npm run server:add -- --name "Production Server" --url "http://192.168.1.100:3000"
```

### 3. Start Syncing a Directory

Enable synchronization for a directory:

```bash
npm run sync:add -- --directory "/home/data" --targets "Production Server"
```

### 4. Monitor Sync Status

Check the status of your syncs:

```bash
npm run sync:list
npm run sync:status -- --id 1 --logs
```

## Available Scripts

### Server Management Scripts

#### `server:add` - Register a New Server

Register a remote server in the synchronization network.

**Usage:**
```bash
npm run server:add -- --name "Server Name" --url "http://server.example.com:3000"
```

**Options:**
- `--name <string>` - Server name (required)
- `--url <url>` - Server URL including port (required)
- `--apiKey <string>` - Custom API key (optional, auto-generated if not provided)
- `--help` - Show help message

**Examples:**
```bash
# Add a production server
npm run server:add -- --name "Production" --url "http://192.168.1.100:3000"

# Add a backup server with custom API key
npm run server:add -- --name "Backup" --url "https://backup.example.com:3000" --apiKey "custom-key-here"
```

**Output:**
```
Adding New Server
────────────────────────────────────────────────────────

Server Registered Successfully
────────────────────────────────────────────────────────
ID:                  1
Server ID:           server-1729864523456-a3x9k2
Name:                Production
URL:                 http://192.168.1.100:3000
Active:              Yes
Created:             10/25/2025, 12:00:00 PM

✅ API Key: d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5

⚠️  Important: Save this API key securely!
   Use this key when making requests from the remote server.
```

---

#### `server:list` - List All Registered Servers

View all servers in the synchronization network.

**Usage:**
```bash
npm run server:list
npm run server:list -- --detailed
```

**Options:**
- `--detailed` - Show detailed information including API keys and active syncs
- `--help` - Show help message

**Examples:**
```bash
# List all servers
npm run server:list

# List with detailed information
npm run server:list -- --detailed
```

**Output:**
```
Registered Servers (2)
────────────────────────────────────────────────────────

ID:                  1
Server ID:           server-1729864523456-a3x9k2
Name:                Production
URL:                 http://192.168.1.100:3000
Active:              Yes
Created:             10/25/2025, 12:00:00 PM
Updated:             10/25/2025, 12:00:00 PM
  ──────────────────────────────────────────────────────

ID:                  2
Server ID:           server-1729864623456-b4y0l3
Name:                Backup
URL:                 http://192.168.1.101:3000
Active:              Yes
Created:             10/25/2025, 1:00:00 PM
Updated:             10/25/2025, 1:00:00 PM
  ──────────────────────────────────────────────────────
```

---

#### `server:remove` - Remove a Server

Remove a server from the synchronization network.

**Usage:**
```bash
npm run server:remove -- --id <server-id>
```

**Options:**
- `--id <number>` - Server ID (required)
- `--help` - Show help message

**Examples:**
```bash
# Remove server with ID 1
npm run server:remove -- --id 1
```

**Important Notes:**
- Servers with active sync directories **cannot be removed**
- You must remove all associated sync directories first
- This action cannot be undone

**Output:**
```
Server Details
────────────────────────────────────────────────────────
ID:                  1
Name:                Production
URL:                 http://192.168.1.100:3000

✅ Server "Production" removed successfully
```

---

#### `server:ping` - Test Server Connection

Test connectivity to a registered server.

**Usage:**
```bash
npm run server:ping -- --id <server-id>
```

**Options:**
- `--id <number>` - Server ID (required)
- `--help` - Show help message

**Examples:**
```bash
# Test connection to server 1
npm run server:ping -- --id 1
```

**Output:**
```
Testing Connection to Server #1
────────────────────────────────────────────────────────

Server ID:           1
Server Name:         Production
URL:                 http://192.168.1.100:3000
Status:              Connected ✅
Test Time:           10/25/2025, 2:30:00 PM

✅ Server is reachable and responding
```

---

### Sync Management Scripts

#### `sync:add` - Add Directory for Synchronization

Configure a directory for automatic synchronization with one or more target servers.

**Usage:**
```bash
npm run sync:add -- --directory "/path/to/dir" --targets "Server1,Server2"
```

**Options:**
- `--directory <path>` - Local directory path (required)
- `--targets <names>` - Comma-separated target server names (required)
- `--help` - Show help message

**Prerequisites:**
- API key must be configured (run `npm run create-api-key`)
- Target servers must be registered (use `server:add`)

**Examples:**
```bash
# Sync a directory to one server
npm run sync:add -- --directory "/home/data" --targets "Production"

# Sync to multiple servers
npm run sync:add -- --directory "/var/www/uploads" --targets "Production,Backup"
```

**Output:**
```
Adding Directory for Synchronization
────────────────────────────────────────────────────────
Directory:           /home/data
Targets:             Production

✅ Directory synchronization initiated

Local Path:          /home/data
Targets:             1

Target Servers:
  1. Production
     Remote Path: /home/data
     Status: active
     Leader: Yes
     Files Synced: 42

✅ Synchronization is now active!
   Any changes to the directory will be automatically synced.
```

---

#### `sync:list` - List All Sync Directories

View all active directory synchronization configurations.

**Usage:**
```bash
npm run sync:list
npm run sync:list -- --detailed
```

**Options:**
- `--detailed` - Show detailed information including server details and statistics
- `--help` - Show help message

**Prerequisites:**
- API key must be configured

**Examples:**
```bash
# List all syncs
npm run sync:list

# List with detailed information
npm run sync:list -- --detailed
```

**Output:**
```
Active Sync Directories (2)
────────────────────────────────────────────────────────

ID:                  1
Local Path:          /home/data
Remote Server ID:    1
Remote Path:         /home/data
Leader:              Yes
Direction:           bidirectional
Status:              active
Last Sync:           10/25/2025, 3:00:00 PM
Error Count:         0
Created:             10/25/2025, 12:00:00 PM
  ──────────────────────────────────────────────────────
```

---

#### `sync:remove` - Remove Sync Directory

Stop synchronization for a directory (files are not deleted).

**Usage:**
```bash
npm run sync:remove -- --id <sync-id>
```

**Options:**
- `--id <number>` - Sync directory ID (required)
- `--help` - Show help message

**Prerequisites:**
- API key must be configured

**Important Notes:**
- This **stops synchronization only** - no files are deleted
- Files remain on both servers but will no longer sync
- You can re-add the directory later if needed

**Examples:**
```bash
# Remove sync directory 1
npm run sync:remove -- --id 1
```

**Output:**
```
Sync Directory Details
────────────────────────────────────────────────────────
ID:                  1
Local Path:          /home/data
Remote Path:         /home/data
Status:              active
Remote Server:       Production

⚠️  Are you sure you want to remove this sync directory?
   This will stop synchronization but will NOT delete any files.

✅ Sync directory removed successfully

✅ Synchronization stopped
   Files remain on both servers but will no longer sync.
```

---

#### `sync:status` - Show Sync Status and Logs

Display detailed status and recent operation logs for a sync directory.

**Usage:**
```bash
npm run sync:status -- --id <sync-id>
npm run sync:status -- --id <sync-id> --logs
npm run sync:status -- --id <sync-id> --logs --limit 50
```

**Options:**
- `--id <number>` - Sync directory ID (required)
- `--logs` - Show recent sync operation logs
- `--limit <number>` - Number of log entries to show (default: 20)
- `--help` - Show help message

**Prerequisites:**
- API key must be configured

**Examples:**
```bash
# Show basic status
npm run sync:status -- --id 1

# Show status with recent logs
npm run sync:status -- --id 1 --logs

# Show status with 50 most recent logs
npm run sync:status -- --id 1 --logs --limit 50
```

**Output:**
```
Sync Directory Status
────────────────────────────────────────────────────────
ID:                  1
Local Path:          /home/data
Remote Path:         /home/data
Leader:              Yes
Direction:           bidirectional
Status:              active
Error Count:         0
Last Sync:           10/25/2025, 3:15:00 PM
Created:             10/25/2025, 12:00:00 PM
Updated:             10/25/2025, 3:15:00 PM

Remote Server
────────────────────────────────────────────────────────
ID:                  1
Name:                Production
URL:                 http://192.168.1.100:3000
Active:              Yes
Last Seen:           10/25/2025, 3:15:00 PM

Statistics
────────────────────────────────────────────────────────
Total Syncs:         156
Successful:          154
Failed:              2
Data Transferred:    2.45 MB

Recent Sync Operations (20/156)
────────────────────────────────────────────────────────

  1. UPDATE - success
    File:              /home/data/config.json
    Direction:         outbound
    Time:              10/25/2025, 3:15:00 PM
    Size:              1.23 KB
    Duration:          45ms

  2. CREATE - success
    File:              /home/data/uploads/photo.jpg
    Direction:         outbound
    Time:              10/25/2025, 3:10:00 PM
    Size:              245.67 KB
    Duration:          123ms
```

---

## Common Workflows

### Initial Setup for a New Deployment

```bash
# 1. Create API key
npm run create-api-key

# 2. Add remote servers
npm run server:add -- --name "Production" --url "http://prod.example.com:3000"
npm run server:add -- --name "Backup" --url "http://backup.example.com:3000"

# 3. Verify servers are reachable
npm run server:ping -- --id 1
npm run server:ping -- --id 2

# 4. Set up directory sync
npm run sync:add -- --directory "/var/www/data" --targets "Production,Backup"

# 5. Monitor sync
npm run sync:list
npm run sync:status -- --id 1 --logs
```

### Monitoring and Troubleshooting

```bash
# Check all active syncs
npm run sync:list -- --detailed

# Check specific sync status
npm run sync:status -- --id 1 --logs --limit 50

# Test server connectivity
npm run server:ping -- --id 1

# View all servers and their status
npm run server:list -- --detailed
```

### Removing Syncs and Servers

```bash
# Remove a sync directory
npm run sync:remove -- --id 1

# Remove a server (requires no active syncs)
npm run server:remove -- --id 1
```

## API Key Management

### Where API Keys are Stored

- Created by `npm run create-api-key`
- Automatically saved to `.env.local`
- Scripts automatically load from `.env.local`
- Can also be set via `X_API_KEY` environment variable

### Manual API Key Setup

If you prefer to set the API key manually:

```bash
# Set in environment
export X_API_KEY="your-api-key-here"

# Or add to .env.local
echo "X_API_KEY=your-api-key-here" >> .env.local
```

### Security Best Practices

1. **Never commit** `.env.local` to version control
2. **Rotate keys regularly** (every 90 days recommended)
3. **Use HTTPS** in production environments
4. **Limit access** to scripts directory on production servers
5. **Store keys securely** in secrets manager for production

## Environment Variables

Scripts support the following environment variables:

- `API_URL` - Base URL for the API (default: `http://localhost:3000`)
- `X_API_KEY` - API key for authentication (loaded from `.env.local` if not set)

**Example:**
```bash
API_URL=http://production.example.com:3000 npm run server:list
```

## Script Locations

All scripts are located in the `scripts/` directory:

```
scripts/
├── common.js           # Shared utilities
├── server-add.js       # Add server
├── server-list.js      # List servers
├── server-remove.js    # Remove server
├── server-ping.js      # Test server connection
├── sync-add.js         # Add sync directory
├── sync-list.js        # List sync directories
├── sync-remove.js      # Remove sync directory
└── sync-status.js      # Show sync status and logs
```

## Direct Script Usage

You can also run scripts directly without npm:

```bash
# Using node
node scripts/server-list.js
node scripts/sync-status.js --id 1 --logs

# Make scripts executable (Linux/Mac)
chmod +x scripts/*.js
./scripts/server-list.js
```

## Troubleshooting

### "Cannot connect to server"

**Problem:** Script can't reach the API server.

**Solutions:**
1. Ensure the server is running: `npm run dev`
2. Check the API URL: `echo $API_URL`
3. Verify the port is correct (default: 3000)

### "No API key found"

**Problem:** Scripts requiring authentication can't find an API key.

**Solutions:**
1. Create an API key: `npm run create-api-key`
2. Check `.env.local` exists and contains `X_API_KEY`
3. Set environment variable: `export X_API_KEY="your-key"`

### "Server with name already exists"

**Problem:** Attempting to add a server with a duplicate name.

**Solutions:**
1. Use a different name
2. View existing servers: `npm run server:list`
3. Remove the old server first (if appropriate)

### "Cannot delete server with active sync directories"

**Problem:** Trying to remove a server that has active syncs.

**Solutions:**
1. List sync directories: `npm run sync:list`
2. Remove syncs first: `npm run sync:remove -- --id <id>`
3. Then remove server: `npm run server:remove -- --id <id>`

### Permission Errors

**Problem:** Scripts can't access directories or files.

**Solutions:**
1. Check directory permissions
2. Run with appropriate user privileges
3. Ensure script files are executable: `chmod +x scripts/*.js`

## Integration with CI/CD

Scripts can be used in automated workflows:

```bash
#!/bin/bash
# deploy.sh - Example deployment script

# Set API key from secrets
export X_API_KEY="${PRODUCTION_API_KEY}"
export API_URL="http://production.example.com:3000"

# Add deployment server if not exists
npm run server:add -- --name "Deploy-$(date +%s)" --url "$DEPLOY_SERVER_URL" || true

# Set up sync
npm run sync:add -- --directory "/var/www/app" --targets "Production,Backup"

# Verify
npm run sync:status -- --id 1
```

## Getting Help

For any script, use the `--help` flag:

```bash
npm run server:add -- --help
npm run sync:status -- --help
```

## Related Documentation

- **[README.md](./README.md)** - Project overview and API documentation
- **[QUICK_START_API_KEYS.md](./QUICK_START_API_KEYS.md)** - 30-second API key guide
- **[API_KEY_GUIDE.md](./API_KEY_GUIDE.md)** - Comprehensive API key management
- **[CLAUDE.md](./CLAUDE.md)** - Development guide for LLMs
