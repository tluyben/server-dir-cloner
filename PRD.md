# Product Requirements Document (PRD)
## Bi-Directional Directory Synchronization Server

**Version:** 1.0
**Last Updated:** 2025-10-25
**Project:** Directory Cloner - Real-time bi-directional directory synchronization

---

## 1. Executive Summary

### 1.1 Product Vision
Build a distributed server application that can be installed on multiple Linux servers and automatically synchronizes directory changes in real-time. When a directory is registered for synchronization, any changes (create, update, delete) on one server are instantly mirrored to all connected servers.

### 1.2 Key Capabilities
- **Bi-directional sync**: Changes flow in both directions between servers
- **Real-time monitoring**: Filesystem watchers detect changes instantly
- **Conflict-free**: First sync establishes a leader (source server) for initial state
- **Resilient**: Handles network failures, retries, and reconnections
- **Auditable**: All actions logged to SQLite database
- **RESTful API**: Simple HTTP endpoints for management

---

## 2. User Stories

### 2.1 Primary User Stories

**US-01: Register Directory for Sync**
*As a system administrator, I want to register a directory for synchronization with another server, so that changes are automatically mirrored.*

**Acceptance Criteria:**
- Can POST to `/api/sync/add` with directory path and target servers
- Server automatically creates bi-directional relationship
- Initial sync copies all files from source (leader) to target
- Returns success with sync configuration details

**US-02: Real-time File Synchronization**
*As a user, when I create/modify/delete a file in a synced directory, I want it automatically replicated to all connected servers.*

**Acceptance Criteria:**
- File creation triggers immediate replication
- File updates are detected and synced
- File deletions are mirrored (with safety checks)
- Subdirectory operations work recursively

**US-03: View Sync Status**
*As an administrator, I want to view all active sync relationships and their status.*

**Acceptance Criteria:**
- GET `/api/sync` returns all active sync configurations
- Shows last sync time, error count, and status
- Can filter by directory or server

**US-04: Audit Trail**
*As a compliance officer, I want to see a complete log of all sync operations.*

**Acceptance Criteria:**
- All operations logged with timestamp, path, action, and result
- Can query logs by date range, directory, or action type
- Logs persist in SQLite database

---

## 3. System Architecture

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Server A (Leader)                       │
│  ┌────────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │  File System   │→ │  FS Watcher  │→ │  Sync Engine   │  │
│  │  /home/xxx/... │  │  (chokidar)  │  │                │  │
│  └────────────────┘  └──────────────┘  └────────┬───────┘  │
│                                                   │          │
│  ┌────────────────┐  ┌──────────────┐           │          │
│  │   SQLite DB    │  │  REST API    │           │          │
│  │  - sync_dirs   │  │  Express 5.1 │           │          │
│  │  - sync_logs   │  └──────────────┘           │          │
│  │  - servers     │                              │          │
│  └────────────────┘                              │          │
└──────────────────────────────────────────────────┼──────────┘
                                                    │
                                    HTTPS/HTTP     │
                                                    ▼
┌─────────────────────────────────────────────────────────────┐
│                      Server B (Target)                       │
│  ┌────────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │  REST API      │→ │  Sync Engine │→ │  File System   │  │
│  │                │  │              │  │  /home/xxx/... │  │
│  └────────────────┘  └──────────────┘  └────────────────┘  │
│                                              ↓               │
│  ┌────────────────┐  ┌──────────────┐      ↓               │
│  │   SQLite DB    │  │  FS Watcher  │←─────┘               │
│  │                │  │  (chokidar)  │                       │
│  └────────────────┘  └──────────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Component Breakdown

#### 3.2.1 Database Schema (SQLite)

**servers**
- `id`: INTEGER PRIMARY KEY
- `server_id`: TEXT UNIQUE - unique identifier for this server instance
- `name`: TEXT - friendly name
- `url`: TEXT - base URL (e.g., http://serverB:3000)
- `api_key`: TEXT - authentication token
- `active`: BOOLEAN - is server online
- `last_seen`: DATETIME - last successful ping
- `created_at`: DATETIME
- `updated_at`: DATETIME

**sync_directories**
- `id`: INTEGER PRIMARY KEY
- `local_path`: TEXT - absolute path on this server
- `remote_server_id`: INTEGER FK → servers.id
- `remote_path`: TEXT - absolute path on remote server
- `is_leader`: BOOLEAN - true if this server initiated sync
- `sync_direction`: TEXT - 'bidirectional' | 'send' | 'receive'
- `status`: TEXT - 'active' | 'paused' | 'error'
- `last_sync_at`: DATETIME
- `error_count`: INTEGER DEFAULT 0
- `created_at`: DATETIME
- `updated_at`: DATETIME
- UNIQUE(local_path, remote_server_id)

**sync_logs**
- `id`: INTEGER PRIMARY KEY
- `sync_dir_id`: INTEGER FK → sync_directories.id
- `action`: TEXT - 'create' | 'update' | 'delete' | 'mkdir' | 'rmdir'
- `file_path`: TEXT - relative path within synced directory
- `direction`: TEXT - 'outbound' | 'inbound'
- `status`: TEXT - 'success' | 'failure' | 'pending'
- `error_message`: TEXT - if status is failure
- `file_size`: INTEGER - bytes
- `checksum`: TEXT - SHA256 hash for verification
- `timestamp`: DATETIME
- `processing_time_ms`: INTEGER

**sync_queue**
- `id`: INTEGER PRIMARY KEY
- `sync_dir_id`: INTEGER FK → sync_directories.id
- `action`: TEXT
- `file_path`: TEXT
- `priority`: INTEGER - higher = more urgent
- `attempts`: INTEGER DEFAULT 0
- `max_attempts`: INTEGER DEFAULT 3
- `status`: TEXT - 'pending' | 'processing' | 'failed' | 'completed'
- `error_message`: TEXT
- `created_at`: DATETIME
- `updated_at`: DATETIME

#### 3.2.2 File System Watcher

**Technology:** `chokidar` npm package

**Features:**
- Recursive directory watching
- Debouncing for rapid changes
- Ignore patterns (.git, node_modules, etc.)
- Handles symbolic links safely
- Cross-platform compatibility

**Events Monitored:**
- `add`: New file created
- `change`: File modified
- `unlink`: File deleted
- `addDir`: New directory created
- `unlinkDir`: Directory deleted

#### 3.2.3 Sync Engine

**Responsibilities:**
1. Initial directory sync (leader → target)
2. Queue management for sync operations
3. Retry logic with exponential backoff
4. Checksum validation
5. Conflict detection and resolution
6. Network error handling

**Sync Algorithm:**
```
1. Detect change via filesystem watcher
2. Check if path is within a synced directory
3. Add to sync_queue with priority
4. Process queue (FIFO with priority)
5. For each queued item:
   a. Calculate file checksum (if exists)
   b. Send to remote server via REST API
   c. Log operation to sync_logs
   d. Mark queue item as completed/failed
   e. Retry on failure (up to max_attempts)
```

**Initial Sync Algorithm:**
```
1. Leader reads entire directory tree
2. For each file/directory:
   a. Calculate checksum
   b. Send metadata + content to target
   c. Target creates directories/files
   d. Target responds with success/failure
3. Target starts filesystem watcher
4. Bidirectional sync begins
```

---

## 4. API Specification

### 4.1 Authentication

**Method:** API Key in header
**Header:** `X-API-Key: <server_api_key>`

All inter-server communication requires authentication.

### 4.2 Endpoints

#### 4.2.1 Register Sync Directory

**POST /api/sync/add**

**Request Body:**
```json
{
  "directory": "/home/xxx/bla/bla",
  "targets": ["serverB"]
}
```

**Response (201 Created):**
```json
{
  "id": 1,
  "localPath": "/home/xxx/bla/bla",
  "targets": [
    {
      "serverId": 2,
      "serverName": "serverB",
      "remotePath": "/home/xxx/bla/bla",
      "isLeader": true,
      "status": "active"
    }
  ],
  "syncInitiated": true,
  "filesSync": 42,
  "directoriesSync": 7
}
```

**Behavior:**
1. Validate directory exists and is accessible
2. Create sync_directories record with is_leader=true
3. POST to target server: `/api/sync/register`
4. Perform initial sync (leader → target)
5. Start filesystem watcher
6. Return confirmation

---

#### 4.2.2 Register Remote Sync (Internal)

**POST /api/sync/register**

Called automatically by the initiating server.

**Request Body:**
```json
{
  "directory": "/home/xxx/bla/bla",
  "sourceServer": "serverA",
  "sourceUrl": "http://serverA:3000",
  "isLeader": false
}
```

**Response (201 Created):**
```json
{
  "id": 2,
  "status": "registered",
  "ready": true
}
```

**Behavior:**
1. Create sync_directories record with is_leader=false
2. Create directory if doesn't exist
3. Return ready status
4. Wait for initial sync data
5. Start filesystem watcher after initial sync

---

#### 4.2.3 Sync File Operation

**POST /api/sync/operation**

**Request Body (multipart/form-data for files):**
```json
{
  "syncDirId": 1,
  "action": "create|update|delete|mkdir|rmdir",
  "filePath": "relative/path/to/file.txt",
  "checksum": "sha256:abc123...",
  "timestamp": "2025-10-25T10:30:00Z",
  "file": <binary data for create/update>
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "action": "create",
  "filePath": "relative/path/to/file.txt",
  "processed": true,
  "logId": 123
}
```

**Error Response (409 Conflict):**
```json
{
  "error": {
    "message": "Checksum mismatch - file may have been modified",
    "statusCode": 409,
    "details": {
      "expectedChecksum": "sha256:abc123...",
      "actualChecksum": "sha256:def456..."
    }
  }
}
```

---

#### 4.2.4 List Sync Directories

**GET /api/sync**

**Query Parameters:**
- `status`: Filter by status (active|paused|error)
- `serverId`: Filter by remote server

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "localPath": "/home/xxx/bla/bla",
    "remoteServer": {
      "id": 2,
      "name": "serverB",
      "url": "http://serverB:3000"
    },
    "remotePath": "/home/xxx/bla/bla",
    "isLeader": true,
    "status": "active",
    "lastSyncAt": "2025-10-25T10:29:55Z",
    "errorCount": 0,
    "filesWatched": 42,
    "createdAt": "2025-10-25T09:00:00Z"
  }
]
```

---

#### 4.2.5 Get Sync Directory Details

**GET /api/sync/:id**

**Response (200 OK):**
```json
{
  "id": 1,
  "localPath": "/home/xxx/bla/bla",
  "remoteServer": {
    "id": 2,
    "name": "serverB",
    "url": "http://serverB:3000",
    "active": true,
    "lastSeen": "2025-10-25T10:29:50Z"
  },
  "remotePath": "/home/xxx/bla/bla",
  "isLeader": true,
  "syncDirection": "bidirectional",
  "status": "active",
  "lastSyncAt": "2025-10-25T10:29:55Z",
  "errorCount": 0,
  "stats": {
    "totalOperations": 1234,
    "successfulOperations": 1230,
    "failedOperations": 4,
    "averageProcessingTime": 45
  },
  "recentLogs": [
    {
      "id": 123,
      "action": "update",
      "filePath": "config/app.json",
      "direction": "outbound",
      "status": "success",
      "timestamp": "2025-10-25T10:29:55Z"
    }
  ]
}
```

---

#### 4.2.6 Pause/Resume Sync

**PATCH /api/sync/:id/status**

**Request Body:**
```json
{
  "status": "paused|active"
}
```

**Response (200 OK):**
```json
{
  "id": 1,
  "status": "paused",
  "updatedAt": "2025-10-25T10:30:00Z"
}
```

---

#### 4.2.7 Remove Sync Directory

**DELETE /api/sync/:id**

**Query Parameters:**
- `deleteFiles`: boolean (default: false) - whether to delete files

**Response (204 No Content)**

**Behavior:**
1. Stop filesystem watcher
2. Mark sync_directory as deleted
3. Notify remote server to remove sync
4. Optionally delete files if requested

---

#### 4.2.8 Get Sync Logs

**GET /api/sync/:id/logs**

**Query Parameters:**
- `action`: Filter by action type
- `status`: Filter by status
- `startDate`: ISO 8601 date
- `endDate`: ISO 8601 date
- `limit`: Max results (default: 100)
- `offset`: Pagination offset

**Response (200 OK):**
```json
{
  "total": 1234,
  "limit": 100,
  "offset": 0,
  "logs": [
    {
      "id": 123,
      "action": "update",
      "filePath": "config/app.json",
      "direction": "outbound",
      "status": "success",
      "fileSize": 2048,
      "checksum": "sha256:abc123...",
      "timestamp": "2025-10-25T10:29:55Z",
      "processingTimeMs": 45
    }
  ]
}
```

---

#### 4.2.9 Server Health & Status

**GET /api/sync/health**

**Response (200 OK):**
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

---

#### 4.2.10 Manage Servers

**POST /api/servers**
```json
{
  "name": "serverB",
  "url": "http://192.168.1.100:3000",
  "apiKey": "secret-key-here"
}
```

**GET /api/servers**
List all registered servers

**GET /api/servers/:id**
Get server details

**DELETE /api/servers/:id**
Remove server (must have no active syncs)

---

## 5. Technical Implementation Plan

### 5.1 Dependencies to Add

```json
{
  "chokidar": "^4.0.0",          // Filesystem watching
  "axios": "^1.7.0",              // HTTP client for inter-server communication
  "multer": "^1.4.5-lts.1",       // File upload handling
  "node-cron": "^3.0.3",          // Scheduled tasks (health checks, retry queue)
  "xxhash-addon": "^2.0.0"        // Fast checksums (alternative: built-in crypto)
}
```

### 5.2 File Structure

```
src/
├── db/
│   ├── schema.ts                # Add: servers, sync_directories, sync_logs, sync_queue
│   └── index.ts
├── middleware/
│   ├── auth.ts                  # NEW: API key authentication
│   └── upload.ts                # NEW: Multer file upload config
├── routes/
│   ├── sync.ts                  # NEW: Sync management endpoints
│   └── servers.ts               # NEW: Server management endpoints
├── services/
│   ├── watcher.ts               # NEW: Filesystem watcher service
│   ├── sync-engine.ts           # NEW: Sync operation logic
│   ├── queue-processor.ts       # NEW: Process sync queue
│   ├── checksum.ts              # NEW: File checksum utilities
│   └── server-client.ts         # NEW: HTTP client for server-to-server
├── types/
│   └── sync.ts                  # NEW: TypeScript types for sync operations
└── utils/
    ├── path-validator.ts        # NEW: Validate and sanitize paths
    └── retry.ts                 # NEW: Retry logic with exponential backoff
```

### 5.3 Implementation Phases

#### Phase 1: Database & Core Models (Week 1)
- [ ] Add new database schemas
- [ ] Generate and run migrations
- [ ] Create TypeScript types
- [ ] Write database seed data for testing

#### Phase 2: Server Management (Week 1)
- [ ] Implement server registration endpoints
- [ ] API key authentication middleware
- [ ] Server health check endpoints
- [ ] Tests for server management

#### Phase 3: Sync Directory Registration (Week 2)
- [ ] POST /api/sync/add endpoint
- [ ] POST /api/sync/register endpoint
- [ ] Path validation and sanitization
- [ ] Initial directory sync logic
- [ ] Tests for sync registration

#### Phase 4: Filesystem Watcher (Week 2-3)
- [ ] Integrate chokidar
- [ ] Watch registered directories
- [ ] Debounce rapid changes
- [ ] Map filesystem events to sync actions
- [ ] Tests for watcher service

#### Phase 5: Sync Engine (Week 3-4)
- [ ] Queue management
- [ ] File transfer logic (upload/download)
- [ ] Checksum calculation and validation
- [ ] POST /api/sync/operation endpoint
- [ ] Conflict detection
- [ ] Tests for sync operations

#### Phase 6: Queue Processor (Week 4)
- [ ] Background queue processor
- [ ] Retry logic with exponential backoff
- [ ] Error handling and logging
- [ ] Scheduled health checks
- [ ] Tests for queue processor

#### Phase 7: Logging & Monitoring (Week 5)
- [ ] Comprehensive sync_logs storage
- [ ] GET /api/sync/:id/logs endpoint
- [ ] Performance metrics
- [ ] Dashboard data aggregation
- [ ] Tests for logging

#### Phase 8: Error Handling & Edge Cases (Week 5-6)
- [ ] Network failure handling
- [ ] Disk full scenarios
- [ ] Permission errors
- [ ] Large file handling (streaming)
- [ ] Circular sync prevention
- [ ] Tests for error scenarios

#### Phase 9: Documentation & Deployment (Week 6)
- [ ] API documentation (OpenAPI/Swagger)
- [ ] Deployment guide for Linux
- [ ] Docker support
- [ ] Environment configuration
- [ ] Production security hardening

---

## 6. Data Flow Examples

### 6.1 Scenario: Register New Sync Directory

```
User → ServerA POST /api/sync/add
  ↓
ServerA validates directory exists
  ↓
ServerA creates sync_directories record (is_leader=true)
  ↓
ServerA → ServerB POST /api/sync/register
  ↓
ServerB creates sync_directories record (is_leader=false)
  ↓
ServerB creates directory if needed
  ↓
ServerB responds "ready"
  ↓
ServerA performs initial sync (walks directory tree)
  ↓
For each file:
  ServerA → ServerB POST /api/sync/operation (action=create)
  ↓
  ServerB writes file
  ↓
  ServerB logs operation
  ↓
  ServerB responds "success"
  ↓
ServerA starts watcher on directory
  ↓
ServerB starts watcher on directory
  ↓
Bi-directional sync active
```

### 6.2 Scenario: File Update on ServerA

```
User modifies /home/xxx/bla/bla/config.json on ServerA
  ↓
Chokidar detects "change" event
  ↓
Watcher identifies sync_dir_id
  ↓
Calculate SHA256 checksum
  ↓
Add to sync_queue (priority=normal)
  ↓
Queue processor picks up item
  ↓
ServerA → ServerB POST /api/sync/operation
  {
    action: "update",
    filePath: "config.json",
    checksum: "sha256:...",
    file: <binary>
  }
  ↓
ServerB receives request
  ↓
ServerB temporarily pauses watcher for this path
  ↓
ServerB writes file to /home/xxx/bla/bla/config.json
  ↓
ServerB verifies checksum
  ↓
ServerB logs operation (sync_logs)
  ↓
ServerB resumes watcher for this path
  ↓
ServerB responds success
  ↓
ServerA logs operation (sync_logs)
  ↓
ServerA marks queue item completed
```

### 6.3 Scenario: File Created on ServerB (Reverse)

```
User creates /home/xxx/bla/bla/new-file.txt on ServerB
  ↓
Chokidar detects "add" event
  ↓
Watcher identifies sync_dir_id
  ↓
Calculate checksum
  ↓
Add to sync_queue
  ↓
Queue processor picks up
  ↓
ServerB → ServerA POST /api/sync/operation
  {
    action: "create",
    filePath: "new-file.txt",
    checksum: "sha256:...",
    file: <binary>
  }
  ↓
ServerA receives, pauses watcher temporarily
  ↓
ServerA creates file
  ↓
ServerA verifies checksum
  ↓
ServerA logs and responds
  ↓
Both servers have new-file.txt
```

---

## 7. Security Considerations

### 7.1 Authentication
- API keys for inter-server communication
- Keys stored securely in environment variables
- Rotate keys periodically
- Rate limiting on all endpoints

### 7.2 Path Validation
- Whitelist allowed base directories
- Prevent path traversal attacks (`../../../etc/passwd`)
- Validate paths are within allowed zones
- Reject symbolic links outside sync directories

### 7.3 File Size Limits
- Configure max file size (default: 100MB)
- Stream large files instead of loading into memory
- Disk space checks before writing files

### 7.4 Network Security
- HTTPS for production deployments
- Certificate validation
- Timeout configurations
- Request size limits

### 7.5 Data Integrity
- Checksum verification on all transfers
- Transaction-based database operations
- File write atomicity (write to temp, then rename)

---

## 8. Performance Considerations

### 8.1 Optimization Strategies
- Debounce filesystem events (e.g., 100ms)
- Batch small file operations
- Use rsync-style algorithms for large files
- Compress files during transfer
- Connection pooling for HTTP requests

### 8.2 Scalability
- Queue-based architecture for horizontal scaling
- Separate watcher and sync processes
- Database indexing on frequently queried fields
- Archive old logs to separate table

### 8.3 Resource Management
- Limit concurrent sync operations (e.g., 5 max)
- Memory limits for file buffers
- Graceful degradation under load
- Circuit breaker pattern for failing servers

---

## 9. Testing Strategy

### 9.1 Unit Tests
- Path validation functions
- Checksum calculation
- Queue management
- API endpoint handlers

### 9.2 Integration Tests
- Two-server sync simulation
- File operation scenarios (CRUD)
- Network failure recovery
- Conflict resolution

### 9.3 End-to-End Tests
- Full sync lifecycle
- Multi-file operations
- Large file transfers
- Long-running sync stability

### 9.4 Test Scenarios
1. Create file on A → appears on B
2. Update file on B → updates on A
3. Delete file on A → deletes on B
4. Network interruption → queue persists, retries succeed
5. Concurrent modifications → last-write-wins (with logging)
6. Server restart → watchers resume, queue processing continues
7. Large directory tree (10,000+ files) → efficient sync
8. Permission errors → logged, retried, eventually fail gracefully

---

## 10. Monitoring & Observability

### 10.1 Metrics to Track
- Sync operations per second
- Queue depth
- Error rate by type
- Average processing time
- Network latency between servers
- Disk space usage

### 10.2 Logging
- Structured JSON logs
- Log levels: DEBUG, INFO, WARN, ERROR
- Correlation IDs for tracking operations across servers
- Rotation and archival policies

### 10.3 Health Checks
- Periodic ping between servers
- Filesystem accessibility checks
- Database connectivity
- Queue processor status

---

## 11. Configuration

### 11.1 Environment Variables

```env
# Server Configuration
SERVER_ID=server-a-unique-id
SERVER_NAME=serverA
PORT=3000

# Database
DATABASE_URL=./content.db

# Sync Configuration
MAX_FILE_SIZE=104857600          # 100MB in bytes
SYNC_DEBOUNCE_MS=100             # Debounce time for FS events
MAX_CONCURRENT_SYNCS=5           # Max parallel sync operations
QUEUE_PROCESS_INTERVAL_MS=1000   # How often to process queue

# Retry Configuration
MAX_RETRY_ATTEMPTS=3
RETRY_BACKOFF_MS=1000            # Initial backoff time

# Security
API_KEY_HEADER=X-API-Key
ALLOWED_BASE_PATHS=/home,/var/data  # Comma-separated allowed roots

# Logging
LOG_LEVEL=info
LOG_RETENTION_DAYS=90
```

### 11.2 Runtime Configuration (Database)

Store dynamic configuration in database:
- Allowed sync directories
- Ignore patterns (.gitignore style)
- Per-directory sync settings

---

## 12. Deployment Guide

### 12.1 Installation Steps

```bash
# 1. Clone repository
git clone <repo-url>
cd directory-cloner

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
nano .env  # Edit configuration

# 4. Setup database
npm run db:migrate

# 5. Generate API key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 6. Start server
npm run dev  # Development
npm start    # Production

# 7. Install as systemd service (production)
sudo cp deploy/directory-cloner.service /etc/systemd/system/
sudo systemctl enable directory-cloner
sudo systemctl start directory-cloner
```

### 12.2 Multi-Server Setup

**On ServerA:**
```bash
export SERVER_ID=server-a
export SERVER_NAME=serverA
export PORT=3000
npm start
```

**On ServerB:**
```bash
export SERVER_ID=server-b
export SERVER_NAME=serverB
export PORT=3000
npm start
```

**Register servers:**
```bash
# On ServerA, register ServerB
curl -X POST http://serverA:3000/api/servers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "serverB",
    "url": "http://serverB:3000",
    "apiKey": "server-b-api-key"
  }'

# On ServerB, register ServerA
curl -X POST http://serverB:3000/api/servers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "serverA",
    "url": "http://serverA:3000",
    "apiKey": "server-a-api-key"
  }'
```

**Start syncing:**
```bash
# From ServerA
curl -X POST http://serverA:3000/api/sync/add \
  -H "Content-Type: application/json" \
  -H "X-API-Key: server-a-api-key" \
  -d '{
    "directory": "/home/xxx/bla/bla",
    "targets": ["serverB"]
  }'
```

---

## 13. Future Enhancements (Out of Scope for v1.0)

### 13.1 Potential Features
- **Multi-target sync**: Sync one directory to 3+ servers
- **Partial sync**: Sync only specific file patterns
- **Bandwidth throttling**: Limit sync speed
- **Compression**: Compress files during transfer
- **Encryption**: Encrypt files at rest and in transit
- **Webhooks**: Notify external systems of sync events
- **Web UI**: Dashboard for monitoring and management
- **Conflict resolution strategies**: User-defined rules
- **Incremental sync**: Only transfer changed blocks (rsync-style)
- **Scheduling**: Define sync windows (e.g., off-peak hours)

### 13.2 Advanced Features
- **Chain sync**: A ↔ B ↔ C (prevent circular loops)
- **Version control**: Keep file history
- **Selective sync**: User-defined filters
- **Priority directories**: Some dirs sync faster than others
- **Pause/resume**: Pause specific syncs without stopping watcher

---

## 14. Success Criteria

### 14.1 Functional Requirements Met
- ✅ Can register directory for bi-directional sync
- ✅ Changes propagate in <1 second (on local network)
- ✅ All CRUD operations (create, read, update, delete) work
- ✅ Server topology stored in SQLite
- ✅ All operations logged in SQLite
- ✅ Handles network failures gracefully
- ✅ Restarts resume syncing automatically

### 14.2 Non-Functional Requirements
- ✅ 99.9% sync success rate under normal conditions
- ✅ Handles 1000+ files in a directory
- ✅ Works with files up to 100MB
- ✅ API response time <100ms (excluding file transfer)
- ✅ Zero data loss under network failures
- ✅ Comprehensive test coverage (>80%)

---

## 15. Risks & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Network partition | High | Medium | Queue operations, retry on reconnect |
| Concurrent modifications | Medium | High | Last-write-wins with conflict logging |
| Disk full | High | Low | Pre-check disk space, alert on threshold |
| Large file transfers timeout | Medium | Medium | Streaming, chunked transfer, resume support |
| Circular sync loops | High | Low | Track operation IDs, prevent echo |
| Database corruption | High | Very Low | WAL mode, regular backups, transactions |
| Symlink attacks | High | Low | Path validation, whitelist directories |

---

## 16. Glossary

- **Leader**: The server that initiated the sync and performs the initial sync
- **Target**: The server receiving the sync registration
- **Sync Directory**: A directory registered for bidirectional synchronization
- **Sync Operation**: A single file/directory change (create, update, delete)
- **Sync Queue**: Database table storing pending sync operations
- **Watcher**: Filesystem monitoring service (chokidar)
- **Checksum**: SHA256 hash of file contents for verification
- **Debounce**: Delay processing to batch rapid changes

---

## 17. Appendix

### 17.1 Example curl Commands

**Register sync directory:**
```bash
curl -X POST http://localhost:3000/api/sync/add \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "directory": "/home/user/data",
    "targets": ["serverB"]
  }'
```

**List all syncs:**
```bash
curl http://localhost:3000/api/sync \
  -H "X-API-Key: your-api-key"
```

**Get sync logs:**
```bash
curl "http://localhost:3000/api/sync/1/logs?limit=50&action=update" \
  -H "X-API-Key: your-api-key"
```

**Pause sync:**
```bash
curl -X PATCH http://localhost:3000/api/sync/1/status \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"status": "paused"}'
```

### 17.2 Database Schema SQL

See generated migrations in `drizzle/` folder after running `npm run db:generate`.

---

**Document Status:** ✅ Ready for Implementation
**Approved By:** [Pending]
**Next Steps:** Begin Phase 1 - Database & Core Models
