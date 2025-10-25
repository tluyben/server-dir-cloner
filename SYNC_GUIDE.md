# Directory Sync Feature Guide

## Overview

The Directory Sync feature enables real-time, bi-directional synchronization of directories between multiple servers. When a directory is registered for sync, any changes (create, update, delete) on one server are automatically mirrored to all connected servers.

## Key Features

- **Bi-directional sync**: Changes flow in both directions between servers
- **Real-time monitoring**: Filesystem watchers detect changes instantly
- **Conflict-free**: First sync establishes a leader (source server) for initial state
- **Resilient**: Handles network failures, retries, and reconnections
- **Auditable**: All actions logged to SQLite database
- **RESTful API**: Simple HTTP endpoints for management

## Quick Start

### 1. Configure Environment

Copy and edit `.env.example`:

```bash
cp .env.example .env
```

Key configuration for sync:

```env
SERVER_ID=server-a-unique-id
SERVER_NAME=serverA
SERVER_URL=http://localhost:3000
ALLOWED_BASE_PATHS=/home,/var/data,/tmp
MAX_FILE_SIZE=104857600  # 100MB
```

### 2. Generate API Key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Register Remote Server

On **Server A**:

```bash
curl -X POST http://localhost:3000/api/servers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "serverB",
    "url": "http://serverB:3000",
    "apiKey": "your-generated-api-key"
  }'
```

On **Server B**, register Server A similarly.

### 4. Start Synchronization

From **Server A** (the leader):

```bash
curl -X POST http://localhost:3000/api/sync/add \
  -H "Content-Type: application/json" \
  -d '{
    "directory": "/home/user/data",
    "targets": ["serverB"]
  }'
```

This will:

1. Validate the directory exists
2. Register sync on both servers
3. Perform initial sync (copy all files from A to B)
4. Start filesystem watchers
5. Enable bi-directional sync

## API Endpoints

### Server Management

#### Register Server

```http
POST /api/servers
Content-Type: application/json

{
  "name": "serverB",
  "url": "http://serverB:3000",
  "apiKey": "your-api-key"
}
```

#### List Servers

```http
GET /api/servers
```

#### Get Server Details

```http
GET /api/servers/:id
```

#### Delete Server

```http
DELETE /api/servers/:id
```

### Sync Management

#### Add Sync Directory

```http
POST /api/sync/add
Content-Type: application/json

{
  "directory": "/path/to/sync",
  "targets": ["serverB", "serverC"]
}
```

#### List Sync Directories

```http
GET /api/sync
GET /api/sync?status=active
GET /api/sync?serverId=2
```

#### Get Sync Details

```http
GET /api/sync/:id
```

Returns detailed statistics, recent logs, and server info.

#### Pause/Resume Sync

```http
PATCH /api/sync/:id/status
Content-Type: application/json

{
  "status": "paused"  // or "active"
}
```

#### Remove Sync

```http
DELETE /api/sync/:id
DELETE /api/sync/:id?deleteFiles=true
```

#### Get Sync Logs

```http
GET /api/sync/:id/logs
GET /api/sync/:id/logs?action=update&status=success&limit=50
```

Query parameters:

- `action`: filter by action (create, update, delete, mkdir, rmdir)
- `status`: filter by status (success, failure, pending)
- `startDate`: ISO 8601 date
- `endDate`: ISO 8601 date
- `limit`: max results (default: 100)
- `offset`: pagination offset

### Health Check

```http
GET /api/sync/health
```

Returns:

```json
{
  "status": "healthy",
  "serverId": "server-a-uuid",
  "serverName": "serverA",
  "version": "1.0.0",
  "uptime": 86400,
  "activeSyncs": 3,
  "queuedOperations": 5,
  "watchers": {
    "active": 3,
    "filesWatched": 1234
  },
  "storage": {
    "dbSize": 1048576,
    "syncedDirectoriesSize": 10485760
  }
}
```

## Architecture

### Components

1. **Filesystem Watcher** (`src/services/watcher.ts`)
   - Uses `chokidar` to monitor directory changes
   - Debounces rapid changes
   - Ignores common patterns (.git, node_modules, etc.)

2. **Sync Engine** (`src/services/sync-engine.ts`)
   - Handles initial directory sync
   - Processes incoming/outgoing operations
   - Verifies checksums for data integrity

3. **Queue Processor** (`src/services/queue-processor.ts`)
   - Background worker processing sync queue
   - Implements retry logic with exponential backoff
   - Manages concurrent sync operations

4. **Server Client** (`src/services/server-client.ts`)
   - HTTP client for server-to-server communication
   - Handles file uploads via multipart/form-data
   - Implements connection pooling and timeouts

### Data Flow

```
File Change → Watcher → Queue → Processor → Remote Server → Apply Change
```

1. User modifies file on Server A
2. Chokidar detects change event
3. Watcher adds operation to sync queue
4. Queue processor picks up operation
5. Sends HTTP request to Server B with file data
6. Server B applies change and logs operation
7. Server B's watcher is paused temporarily to prevent loop
8. Both servers have identical files

## Database Schema

### servers

- `id`: Primary key
- `server_id`: Unique server identifier
- `name`: Human-readable name
- `url`: Base URL for API
- `api_key`: Authentication token
- `active`: Is server online
- `last_seen`: Last successful ping

### sync_directories

- `id`: Primary key
- `local_path`: Absolute path on this server
- `remote_server_id`: Foreign key to servers
- `remote_path`: Absolute path on remote server
- `is_leader`: True if this server initiated sync
- `sync_direction`: bidirectional | send | receive
- `status`: active | paused | error
- `last_sync_at`: Timestamp of last successful sync
- `error_count`: Number of failed operations

### sync_logs

- `id`: Primary key
- `sync_dir_id`: Foreign key to sync_directories
- `action`: create | update | delete | mkdir | rmdir
- `file_path`: Relative path within synced directory
- `direction`: outbound | inbound
- `status`: success | failure | pending
- `error_message`: Error details if failed
- `file_size`: File size in bytes
- `checksum`: SHA256 hash
- `timestamp`: When operation occurred
- `processing_time_ms`: Time taken to process

### sync_queue

- `id`: Primary key
- `sync_dir_id`: Foreign key to sync_directories
- `action`: Operation type
- `file_path`: Relative path
- `priority`: Higher = more urgent (directories get higher priority)
- `attempts`: Number of retry attempts
- `max_attempts`: Maximum retries before failure
- `status`: pending | processing | failed | completed

## Configuration

### Environment Variables

| Variable                    | Description                         | Default           |
| --------------------------- | ----------------------------------- | ----------------- |
| `SERVER_ID`                 | Unique server identifier            | required          |
| `SERVER_NAME`               | Human-readable server name          | required          |
| `SERVER_URL`                | This server's public URL            | required          |
| `MAX_FILE_SIZE`             | Maximum file size in bytes          | 104857600 (100MB) |
| `SYNC_DEBOUNCE_MS`          | Debounce time for FS events         | 100               |
| `MAX_CONCURRENT_SYNCS`      | Max parallel sync operations        | 5                 |
| `QUEUE_PROCESS_INTERVAL_MS` | Queue processing interval           | 1000              |
| `MAX_RETRY_ATTEMPTS`        | Max retry attempts for failed ops   | 3                 |
| `RETRY_BACKOFF_MS`          | Initial retry backoff delay         | 1000              |
| `ALLOWED_BASE_PATHS`        | Comma-separated allowed directories | /home,/var/data   |

### Security Considerations

1. **Path Validation**: Only directories within `ALLOWED_BASE_PATHS` can be synced
2. **API Authentication**: All inter-server communication requires API key
3. **Checksum Verification**: SHA256 checksums prevent data corruption
4. **File Size Limits**: Configurable maximum file size
5. **No Path Traversal**: Paths are validated to prevent `../` attacks

### Performance Tuning

1. **Debouncing**: Increase `SYNC_DEBOUNCE_MS` for rapidly changing files
2. **Concurrent Operations**: Adjust `MAX_CONCURRENT_SYNCS` based on network bandwidth
3. **Queue Processing**: Lower `QUEUE_PROCESS_INTERVAL_MS` for lower latency
4. **File Size Limit**: Reduce `MAX_FILE_SIZE` if bandwidth is limited

## Troubleshooting

### Sync Not Working

1. Check server connectivity:

   ```bash
   curl -X POST http://localhost:3000/api/servers/:id/ping
   ```

2. Verify sync status:

   ```bash
   curl http://localhost:3000/api/sync/:id
   ```

3. Check recent logs:
   ```bash
   curl http://localhost:3000/api/sync/:id/logs?limit=20
   ```

### High Error Count

Errors can occur due to:

- Network issues
- Permission problems
- Disk full
- File conflicts

To retry failed operations:

```bash
curl -X PATCH http://localhost:3000/api/sync/:id/status \
  -H "Content-Type: application/json" \
  -d '{"status": "active"}'
```

### Queue Backing Up

Check queue stats via health endpoint:

```bash
curl http://localhost:3000/api/sync/health
```

If queue is growing:

1. Increase `MAX_CONCURRENT_SYNCS`
2. Check network latency to remote servers
3. Verify remote servers are healthy

### Sync Loops

The system prevents sync loops by:

- Pausing watchers temporarily when applying remote changes
- Tracking operation direction (inbound/outbound)

If you suspect a loop:

1. Pause the sync
2. Check logs for repeated operations
3. Resume with increased `SYNC_DEBOUNCE_MS`

## Best Practices

1. **Initial Setup**: Always start with small test directories
2. **Monitoring**: Regularly check health endpoint for queue depth
3. **Cleanup**: Periodically review and clean old logs
4. **Backups**: Sync is not a backup solution - maintain proper backups
5. **Network**: Use HTTPS in production for encrypted transport
6. **Selective Sync**: Use `.gitignore`-style patterns to exclude files
7. **Testing**: Test with non-critical data first

## Limitations

1. **Conflict Resolution**: Last-write-wins (no merge support)
2. **Large Files**: Files over `MAX_FILE_SIZE` are rejected
3. **Symbolic Links**: Symlinks outside sync directories are not followed
4. **Permissions**: File permissions are not synced (use same user on all servers)
5. **Metadata**: Only content and filenames are synced, not extended attributes

## Advanced Usage

### Multi-Server Topology

Sync one directory to multiple servers:

```bash
curl -X POST http://localhost:3000/api/sync/add \
  -H "Content-Type: application/json" \
  -d '{
    "directory": "/home/user/data",
    "targets": ["serverB", "serverC", "serverD"]
  }'
```

Note: This creates separate bi-directional syncs (A↔B, A↔C, A↔D), not a chain.

### Monitoring Script

```bash
#!/bin/bash
# monitor-sync.sh

while true; do
  echo "=== Sync Health $(date) ==="
  curl -s http://localhost:3000/api/sync/health | jq .
  echo ""
  sleep 60
done
```

### Cleanup Old Logs

The queue processor automatically cleans up completed queue items older than 24 hours. For manual cleanup:

```javascript
// In a Node.js REPL or script:
import { queueProcessor } from './services/queue-processor.js';
await queueProcessor.cleanupCompletedItems(48); // 48 hours
```

## Support

For issues or questions:

- Check logs: Server console output
- Review database: `npm run db:studio`
- API documentation: See PRD.md

## License

MIT
