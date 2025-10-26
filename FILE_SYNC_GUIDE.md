# File Synchronization Guide

This guide explains how to synchronize individual files across servers using the Directory Cloner API.

## Overview

File syncing allows you to monitor and synchronize specific files (e.g., `/home/tycho/config.json`) rather than entire directories. This is useful for configuration files, logs, or other individual files that need to be kept in sync.

### Key Features

- **Monitor individual files**: Watch a specific file instead of an entire directory
- **Wait for file creation**: Files don't need to exist yet - the system monitors the parent directory and syncs when the file appears
- **Automatic synchronization**: Changes are detected and synced in real-time
- **Bi-directional sync**: Changes flow in both directions between servers
- **Parent directory monitoring**: Watches the parent directory to detect when the file is created or deleted

## How It Works

### Difference from Directory Syncing

| Aspect | Directory Sync | File Sync |
|--------|---------------|-----------|
| **What's monitored** | Entire directory tree | Single file only |
| **Watched path** | The directory itself | Parent directory (filtered for specific file) |
| **File creation** | All files in directory | Only the specific file |
| **Initial behavior** | Directory must exist | File can be created later |

### File Lifecycle

1. **Registration**: Register a file for syncing (file may not exist yet)
2. **Parent Monitoring**: System monitors the parent directory
3. **File Detection**: When file appears, it's synced to all targets
4. **Change Tracking**: Any modifications are automatically synced
5. **Deletion Handling**: File deletions are also synced

## API Endpoints

### Register a File for Syncing

**POST** `/api/sync/files/add`

Register a file to be synchronized with one or more target servers.

**Request:**
```json
{
  "file": "/home/tycho/config.json",
  "targets": ["Server B", "Server C"]
}
```

**Response (file exists):**
```json
{
  "id": 1,
  "filePath": "/home/tycho/config.json",
  "fileName": "config.json",
  "fileExists": true,
  "targets": [
    {
      "serverId": 2,
      "serverName": "Server B",
      "remoteFilePath": "/home/tycho/config.json",
      "isLeader": true,
      "status": "active",
      "fileExists": true,
      "fileSynced": true,
      "bytesTransferred": 1024
    }
  ],
  "syncInitiated": true,
  "message": "File sync initiated and file sent to targets"
}
```

**Response (file doesn't exist yet):**
```json
{
  "id": 1,
  "filePath": "/home/tycho/config.json",
  "fileName": "config.json",
  "fileExists": false,
  "targets": [
    {
      "serverId": 2,
      "serverName": "Server B",
      "remoteFilePath": "/home/tycho/config.json",
      "isLeader": true,
      "status": "active",
      "fileExists": false
    }
  ],
  "syncInitiated": false,
  "message": "File sync initiated - monitoring parent directory, will sync when file appears"
}
```

### List All Synced Files

**GET** `/api/sync/files`

**Query Parameters:**
- `status` (optional): Filter by status (`active`, `paused`, `error`)
- `serverId` (optional): Filter by remote server ID
- `fileExists` (optional): Filter by file existence (`true`, `false`)

**Response:**
```json
[
  {
    "id": 1,
    "filePath": "/home/tycho/config.json",
    "remoteServerId": 2,
    "remoteFilePath": "/home/tycho/config.json",
    "isLeader": true,
    "syncDirection": "bidirectional",
    "status": "active",
    "fileExists": true,
    "parentDirectory": "/home/tycho",
    "lastSyncAt": "2025-10-26T12:00:00.000Z",
    "errorCount": 0,
    "createdAt": "2025-10-26T11:00:00.000Z",
    "updatedAt": "2025-10-26T12:00:00.000Z",
    "server": {
      "id": 2,
      "name": "Server B",
      "url": "http://192.168.1.100:3000"
    }
  }
]
```

### Get File Sync Details

**GET** `/api/sync/files/:id`

**Response:**
```json
{
  "id": 1,
  "filePath": "/home/tycho/config.json",
  "remoteServerId": 2,
  "remoteFilePath": "/home/tycho/config.json",
  "isLeader": true,
  "syncDirection": "bidirectional",
  "status": "active",
  "fileExists": true,
  "parentDirectory": "/home/tycho",
  "lastSyncAt": "2025-10-26T12:00:00.000Z",
  "errorCount": 0,
  "createdAt": "2025-10-26T11:00:00.000Z",
  "updatedAt": "2025-10-26T12:00:00.000Z",
  "server": {
    "id": 2,
    "name": "Server B",
    "url": "http://192.168.1.100:3000"
  }
}
```

### Update File Sync Status

**PUT** `/api/sync/files/:id`

Pause or resume file synchronization.

**Request:**
```json
{
  "status": "paused"
}
```

**Response:**
```json
{
  "id": 1,
  "status": "paused",
  "updatedAt": "2025-10-26T12:30:00.000Z"
}
```

### Remove File Sync

**DELETE** `/api/sync/files/:id?deleteFile=true`

Remove file sync configuration (optionally delete the file).

**Query Parameters:**
- `deleteFile` (optional): Whether to delete the actual file (`true`, `false`)

**Response:** `204 No Content`

### View Sync Logs

**GET** `/api/sync/files/:id/logs`

**Query Parameters:**
- `action` (optional): Filter by action (`create`, `update`, `delete`)
- `status` (optional): Filter by status (`success`, `failure`, `pending`)
- `startDate` (optional): Filter logs after this date (ISO 8601)
- `endDate` (optional): Filter logs before this date (ISO 8601)
- `limit` (optional): Number of results (default: 100)
- `offset` (optional): Pagination offset (default: 0)

**Response:**
```json
[
  {
    "id": 1,
    "syncFileId": 1,
    "syncDirId": null,
    "action": "create",
    "filePath": "config.json",
    "direction": "outbound",
    "status": "success",
    "errorMessage": null,
    "fileSize": 1024,
    "checksum": "abc123...",
    "timestamp": "2025-10-26T12:00:00.000Z",
    "processingTimeMs": 150
  }
]
```

## Usage Examples

### Example 1: Sync a Configuration File

Scenario: You want to keep `/etc/app/config.json` in sync across two servers.

**On Server A:**

```bash
# 1. Register Server B
curl -X POST http://localhost:3000/api/servers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Server B",
    "url": "http://192.168.1.100:3000"
  }'

# Save the API key from the response
API_KEY="your-api-key-here"

# 2. Register the file for syncing
curl -X POST http://localhost:3000/api/sync/files/add \
  -H "Content-Type: application/json" \
  -d '{
    "file": "/etc/app/config.json",
    "targets": ["Server B"]
  }'
```

Now any changes to `/etc/app/config.json` on either server will be automatically synced!

### Example 2: Sync a File That Doesn't Exist Yet

Scenario: You want to monitor a log file that will be created later.

```bash
# Register the file (it doesn't exist yet)
curl -X POST http://localhost:3000/api/sync/files/add \
  -H "Content-Type: application/json" \
  -d '{
    "file": "/var/log/app/application.log",
    "targets": ["Backup Server"]
  }'

# Response indicates the file will be monitored
# {
#   "fileExists": false,
#   "message": "File sync initiated - monitoring parent directory, will sync when file appears"
# }

# Later, when the application creates the log file:
echo "Log entry" > /var/log/app/application.log

# The file is automatically synced to all targets!
```

### Example 3: Monitor Sync Status

```bash
# List all synced files
curl http://localhost:3000/api/sync/files

# Get details for a specific file sync
curl http://localhost:3000/api/sync/files/1

# View sync logs
curl "http://localhost:3000/api/sync/files/1/logs?limit=10"

# Filter by status
curl "http://localhost:3000/api/sync/files?fileExists=true&status=active"
```

### Example 4: Pause and Resume Syncing

```bash
# Pause syncing
curl -X PUT http://localhost:3000/api/sync/files/1 \
  -H "Content-Type: application/json" \
  -d '{"status": "paused"}'

# Make changes without syncing...
echo "test" > /home/tycho/config.json

# Resume syncing
curl -X PUT http://localhost:3000/api/sync/files/1 \
  -H "Content-Type: application/json" \
  -d '{"status": "active"}'
```

### Example 5: Remove File Sync

```bash
# Stop syncing but keep the file
curl -X DELETE http://localhost:3000/api/sync/files/1

# Stop syncing and delete the file
curl -X DELETE "http://localhost:3000/api/sync/files/1?deleteFile=true"
```

## Common Use Cases

### 1. Configuration File Management

Keep configuration files synchronized across your server cluster:

```bash
# Sync nginx config
curl -X POST http://localhost:3000/api/sync/files/add \
  -H "Content-Type: application/json" \
  -d '{
    "file": "/etc/nginx/nginx.conf",
    "targets": ["Web Server 1", "Web Server 2", "Web Server 3"]
  }'
```

### 2. Application State Files

Sync application state or cache files:

```bash
# Sync session state
curl -X POST http://localhost:3000/api/sync/files/add \
  -H "Content-Type: application/json" \
  -d '{
    "file": "/var/lib/app/session.db",
    "targets": ["App Server Backup"]
  }'
```

### 3. Log Aggregation

Collect logs from multiple servers to a central location:

```bash
# On each app server, sync to central log server
curl -X POST http://localhost:3000/api/sync/files/add \
  -H "Content-Type: application/json" \
  -d '{
    "file": "/var/log/app/errors.log",
    "targets": ["Central Log Server"]
  }'
```

## Best Practices

1. **Use for specific files**: File syncing is ideal for configuration files, state files, or specific logs - not for large datasets
2. **Monitor file size**: Large files will be transferred entirely on each change - use compression if needed
3. **Parent directory permissions**: Ensure the parent directory exists and has proper permissions
4. **Avoid frequent changes**: Files that change very frequently (e.g., every second) may cause high network traffic
5. **Use pausing wisely**: Pause syncing when making bulk changes, then resume when done

## Troubleshooting

### File Not Syncing

**Check file exists status:**
```bash
curl http://localhost:3000/api/sync/files/1
# Look at "fileExists" field
```

**Check sync logs:**
```bash
curl "http://localhost:3000/api/sync/files/1/logs?status=failure"
```

### File Created But Not Synced

The system watches the parent directory with a slight delay for file system stability. Wait a few seconds and check the logs.

### Permission Errors

Ensure:
1. The parent directory exists
2. The application has read/write permissions to the parent directory
3. The parent directory is in an allowed base path (check `ALLOWED_BASE_PATHS` environment variable)

### Sync Conflicts

If the file is modified on both servers simultaneously:
- The most recent change wins (based on filesystem modification time)
- Check sync logs to see which version was applied

## Database Schema

File syncs are stored in the `sync_files` table:

```sql
CREATE TABLE sync_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,            -- Absolute path to the file
  remote_server_id INTEGER NOT NULL,  -- FK to servers table
  remote_file_path TEXT NOT NULL,     -- Path on remote server
  is_leader INTEGER NOT NULL,         -- Whether this is the initiating server
  sync_direction TEXT NOT NULL,       -- 'bidirectional', 'send', or 'receive'
  status TEXT NOT NULL,               -- 'active', 'paused', or 'error'
  file_exists INTEGER NOT NULL,       -- Whether file currently exists
  parent_directory TEXT NOT NULL,     -- Directory being watched
  last_sync_at TEXT,                  -- Last successful sync timestamp
  error_count INTEGER NOT NULL,       -- Number of consecutive errors
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (remote_server_id) REFERENCES servers(id)
);
```

## Integration with Local Admin Scripts

You can use the local administration scripts for file syncing:

```bash
# Add a file sync (feature coming soon)
npm run sync:add-file -- --file "/home/data/config.json" --targets "Server B"

# List all file syncs
npm run sync:files -- --list

# Check file sync status
npm run sync:files -- --id 1 --status

# Remove file sync
npm run sync:files -- --id 1 --remove
```

## Technical Details

### How File Watching Works

1. **Parent Directory Monitoring**: Instead of watching the file directly, the system watches the parent directory
2. **Event Filtering**: Only events for the specific file are processed
3. **Existence Tracking**: The `fileExists` field is updated when the file appears or disappears
4. **Shallow Watching**: `depth: 0` ensures only the parent directory is watched, not subdirectories

### Performance Considerations

- **Small Overhead**: File watching has minimal overhead compared to directory watching
- **No Recursion**: Only the parent directory is monitored, making it very efficient
- **Debouncing**: File changes are debounced (default 100ms) to avoid excessive syncing

### Security

- **Path Validation**: All file paths are validated and must be within allowed base directories
- **Authentication**: All sync operations require API key authentication
- **Checksum Verification**: File integrity is verified using SHA-256 checksums
