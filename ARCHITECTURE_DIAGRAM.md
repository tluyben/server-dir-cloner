# Directory Cloner - System Architecture

## High-Level Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          SERVER A (Leader)                                    │
│                          http://192.168.1.10:3000                            │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                     File System Layer                              │    │
│  │                                                                    │    │
│  │   /home/data/                                                      │    │
│  │   ├── file1.txt                                                    │    │
│  │   ├── file2.json                                                   │    │
│  │   └── subdir/                                                      │    │
│  │       └── nested.pdf                                               │    │
│  └─────────────────────────┬──────────────────────────────────────────┘    │
│                            │                                                │
│                            │ File events (add, change, unlink)              │
│                            ▼                                                │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │              Filesystem Watcher Service (Chokidar)                 │    │
│  │  - Monitors /home/data/ recursively                                │    │
│  │  - Debounces events (100ms default)                                │    │
│  │  - Ignores .git, node_modules, etc.                                │    │
│  │  - Emits: add, change, unlink, addDir, unlinkDir                   │    │
│  └─────────────────────────┬──────────────────────────────────────────┘    │
│                            │                                                │
│                            │ Sync actions queued                            │
│                            ▼                                                │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                      Sync Queue (SQLite)                           │    │
│  │  ┌──────────────────────────────────────────────────────┐          │    │
│  │  │ id │ action  │ file_path      │ status  │ attempts  │          │    │
│  │  ├────┼─────────┼────────────────┼─────────┼───────────┤          │    │
│  │  │ 1  │ update  │ file1.txt      │ pending │ 0         │          │    │
│  │  │ 2  │ create  │ subdir/new.txt │ pending │ 0         │          │    │
│  │  └──────────────────────────────────────────────────────┘          │    │
│  └─────────────────────────┬──────────────────────────────────────────┘    │
│                            │                                                │
│                            │ Processed by background worker                 │
│                            ▼                                                │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                   Queue Processor Service                          │    │
│  │  - Runs every 1000ms (configurable)                                │    │
│  │  - Picks pending items (max 5 concurrent)                          │    │
│  │  - Retry logic with exponential backoff                            │    │
│  │  - Marks completed/failed                                          │    │
│  └─────────────────────────┬──────────────────────────────────────────┘    │
│                            │                                                │
│                            │ Triggers sync operation                        │
│                            ▼                                                │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                      Sync Engine Service                           │    │
│  │  1. Calculate SHA256 checksum                                      │    │
│  │  2. Get file metadata (permissions, ownership, mtime)              │    │
│  │  3. Prepare sync payload                                           │    │
│  │  4. Call remote server API                                         │    │
│  │  5. Log operation result                                           │    │
│  └─────────────────────────┬──────────────────────────────────────────┘    │
│                            │                                                │
│                            │ HTTP POST                                      │
│                            │                                                │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                      REST API (Express 5.1)                        │    │
│  │                                                                    │    │
│  │  Server Management:                                                │    │
│  │  - POST   /api/servers          (register server)                  │    │
│  │  - GET    /api/servers          (list servers)                     │    │
│  │                                                                    │    │
│  │  Sync Management:                                                  │    │
│  │  - POST   /api/sync/directories (start sync)                       │    │
│  │  - GET    /api/sync/directories (list syncs)                       │    │
│  │  - GET    /api/sync/directories/:id/logs (view logs)               │    │
│  │                                                                    │    │
│  │  Internal Operations:                                              │    │
│  │  - POST   /api/sync/register    (receive sync request)             │    │
│  │  - POST   /api/sync/upload      (receive file)                     │    │
│  └─────────────────────────┬──────────────────────────────────────────┘    │
│                            │                                                │
│                            │                                                │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                   SQLite Database (content.db)                     │    │
│  │  ┌──────────────┐  ┌──────────────────┐  ┌────────────────┐       │    │
│  │  │   servers    │  │ sync_directories │  │   sync_logs    │       │    │
│  │  ├──────────────┤  ├──────────────────┤  ├────────────────┤       │    │
│  │  │ id           │  │ id               │  │ id             │       │    │
│  │  │ server_id    │  │ local_path       │  │ action         │       │    │
│  │  │ name         │  │ remote_server_id │  │ file_path      │       │    │
│  │  │ url          │  │ remote_path      │  │ status         │       │    │
│  │  │ api_key      │  │ is_leader        │  │ checksum       │       │    │
│  │  │ active       │  │ status           │  │ timestamp      │       │    │
│  │  └──────────────┘  └──────────────────┘  └────────────────┘       │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└───────────────────────────┬──────────────────────────────────────────────────┘
                            │
                            │ HTTPS/HTTP
                            │ X-API-Key: d4e5f6a7b8c9...
                            │ POST /api/sync/upload
                            │ {file: <binary>, metadata: {...}}
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                          SERVER B (Target)                                    │
│                          http://192.168.1.20:3000                            │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                      REST API (Express 5.1)                        │    │
│  │  ┌───────────────────────────────────────────┐                     │    │
│  │  │  API Key Authentication Middleware        │                     │    │
│  │  │  - Validates X-API-Key header              │                     │    │
│  │  │  - Checks against servers table            │                     │    │
│  │  │  - Updates lastSeen timestamp              │                     │    │
│  │  └───────────────────────────────────────────┘                     │    │
│  │                                                                    │    │
│  │  POST /api/sync/upload                                             │    │
│  │  - Receives file and metadata                                      │    │
│  │  - Validates checksum                                              │    │
│  │  - Writes file to /home/data/                                      │    │
│  └─────────────────────────┬──────────────────────────────────────────┘    │
│                            │                                                │
│                            │ Sync operation executed                        │
│                            ▼                                                │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                      Sync Engine Service                           │    │
│  │  1. Temporarily pause watcher for this path                        │    │
│  │  2. Write file atomically (tmp + rename)                           │    │
│  │  3. Apply metadata (chmod, chown, timestamps)                      │    │
│  │  4. Verify checksum matches                                        │    │
│  │  5. Resume watcher                                                 │    │
│  │  6. Log operation                                                  │    │
│  │  7. Return success/failure                                         │    │
│  └─────────────────────────┬──────────────────────────────────────────┘    │
│                            │                                                │
│                            │ File written                                   │
│                            ▼                                                │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                     File System Layer                              │    │
│  │                                                                    │    │
│  │   /home/data/                                                      │    │
│  │   ├── file1.txt          ← Updated!                                │    │
│  │   ├── file2.json                                                   │    │
│  │   └── subdir/                                                      │    │
│  │       ├── nested.pdf                                               │    │
│  │       └── new.txt         ← Created!                               │    │
│  └─────────────────────────┬──────────────────────────────────────────┘    │
│                            │                                                │
│                            │ File events detected                           │
│                            ▼                                                │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │              Filesystem Watcher Service (Chokidar)                 │    │
│  │  - Also watches /home/data/ recursively                            │    │
│  │  - Detects local changes by users                                  │    │
│  │  - Syncs back to Server A (bi-directional!)                        │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │                   SQLite Database (content.db)                     │    │
│  │  - Same schema as Server A                                         │    │
│  │  - Independent database instance                                   │    │
│  │  - Logs all operations locally                                     │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Sync Flow: File Update Example

### Scenario: User updates `file1.txt` on Server A

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 1: File Modified on Server A                                           │
└─────────────────────────────────────────────────────────────────────────────┘
User: vim /home/data/file1.txt
      → Changes content and saves

┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 2: Filesystem Watcher Detects Change                                   │
└─────────────────────────────────────────────────────────────────────────────┘
Chokidar: Emits "change" event for /home/data/file1.txt
          → Event passes through debounce (100ms)
          → Identifies sync_dir_id = 1

┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 3: Queued for Sync                                                     │
└─────────────────────────────────────────────────────────────────────────────┘
INSERT INTO sync_queue:
{
  sync_dir_id: 1,
  action: 'update',
  file_path: 'file1.txt',
  status: 'pending',
  priority: 5
}

┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 4: Queue Processor Picks Up Item                                       │
└─────────────────────────────────────────────────────────────────────────────┘
Background Worker (runs every 1000ms):
  → Finds pending queue item
  → Marks status = 'processing'
  → Calls Sync Engine

┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 5: Sync Engine Prepares File                                           │
└─────────────────────────────────────────────────────────────────────────────┘
Sync Engine:
  1. Read file content
  2. Calculate SHA256: "abc123..."
  3. Get metadata: {mode: 0o644, uid: 1000, gid: 1000, mtime: "2025-10-26..."}
  4. Get remote server details (Server B)
  5. Prepare multipart form data

┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 6: HTTP Request to Server B                                            │
└─────────────────────────────────────────────────────────────────────────────┘
POST http://192.168.1.20:3000/api/sync/upload
Headers:
  X-API-Key: d4e5f6a7b8c9...
  Content-Type: multipart/form-data
Body:
  file: <binary data>
  action: "update"
  filePath: "file1.txt"
  syncDirId: 2  (Server B's sync dir ID)
  checksum: "abc123..."
  metadata: {mode: 0o644, uid: 1000, gid: 1000, mtime: "2025-10-26..."}

┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 7: Server B Receives Request                                           │
└─────────────────────────────────────────────────────────────────────────────┘
API Key Middleware:
  → Validates X-API-Key header
  → Finds server in database
  → Updates servers.last_seen = NOW()
  → Continues to route handler

┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 8: Server B Pauses Watcher                                             │
└─────────────────────────────────────────────────────────────────────────────┘
Watcher Service:
  → Adds /home/data/file1.txt to pausedPaths set
  → Prevents circular sync (this write won't trigger watcher)

┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 9: Server B Writes File                                                │
└─────────────────────────────────────────────────────────────────────────────┘
Sync Engine:
  1. Write to temp file: /home/data/.file1.txt.tmp
  2. Rename (atomic): /home/data/.file1.txt.tmp → /home/data/file1.txt
  3. Apply metadata:
     - chmod 0o644
     - chown 1000:1000
     - Set mtime to "2025-10-26..."

┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 10: Server B Verifies Checksum                                         │
└─────────────────────────────────────────────────────────────────────────────┘
Sync Engine:
  → Recalculate SHA256 of written file
  → Compare: "abc123..." === "abc123..." ✓
  → If mismatch: Return 409 Conflict error

┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 11: Server B Logs Operation                                            │
└─────────────────────────────────────────────────────────────────────────────┘
INSERT INTO sync_logs:
{
  sync_dir_id: 2,
  action: 'update',
  file_path: 'file1.txt',
  direction: 'inbound',
  status: 'success',
  checksum: 'abc123...',
  file_size: 2048,
  file_mode: 0o644,
  file_uid: 1000,
  file_gid: 1000,
  timestamp: '2025-10-26T10:30:00Z',
  processing_time_ms: 45
}

┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 12: Server B Resumes Watcher                                           │
└─────────────────────────────────────────────────────────────────────────────┘
Watcher Service:
  → Removes /home/data/file1.txt from pausedPaths set
  → Watcher active again

┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 13: Server B Responds Success                                          │
└─────────────────────────────────────────────────────────────────────────────┘
HTTP 200 OK
{
  success: true,
  action: 'update',
  filePath: 'file1.txt',
  checksum: 'abc123...'
}

┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 14: Server A Receives Response                                         │
└─────────────────────────────────────────────────────────────────────────────┘
Sync Engine:
  → Response OK, sync successful

┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 15: Server A Logs Operation                                            │
└─────────────────────────────────────────────────────────────────────────────┘
INSERT INTO sync_logs:
{
  sync_dir_id: 1,
  action: 'update',
  file_path: 'file1.txt',
  direction: 'outbound',
  status: 'success',
  checksum: 'abc123...',
  timestamp: '2025-10-26T10:30:00Z',
  processing_time_ms: 78  (includes network time)
}

┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 16: Server A Marks Queue Item Complete                                 │
└─────────────────────────────────────────────────────────────────────────────┘
UPDATE sync_queue:
SET status = 'completed',
    updated_at = NOW()
WHERE id = 1

┌─────────────────────────────────────────────────────────────────────────────┐
│ RESULT: File Synchronized                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
✓ file1.txt on Server B is now identical to Server A
✓ Both servers have complete audit logs
✓ Watcher on Server B will detect future local changes
✓ Total time: ~100ms on local network
```

---

## Reverse Flow: Server B → Server A

When a user modifies a file on **Server B**, the **exact same process** occurs in reverse:

1. Server B's watcher detects change
2. Server B queues sync operation
3. Server B sends file to Server A
4. Server A receives and writes file
5. Both servers log the operation

**This is TRUE bi-directional synchronization!**

---

## Database Schema Relationships

```
┌─────────────────────┐
│      servers        │
│                     │
│  id (PK)            │
│  server_id (unique) │──┐
│  name               │  │
│  url                │  │
│  api_key            │  │ Referenced by
│  active             │  │
│  last_seen          │  │
└─────────────────────┘  │
                         │
                         │
                         │
        ┌────────────────┴───────────────────┐
        │                                    │
        ▼                                    ▼
┌─────────────────────┐           ┌──────────────────────┐
│ sync_directories    │           │     sync_files       │
│                     │           │                      │
│  id (PK)            │           │  id (PK)             │
│  local_path         │           │  file_path           │
│  remote_server_id   │           │  remote_server_id    │
│  remote_path        │           │  remote_file_path    │
│  is_leader          │           │  is_leader           │
│  status             │           │  file_exists         │
└─────────┬───────────┘           └────────┬─────────────┘
          │                                │
          │ Referenced by                  │ Referenced by
          │                                │
          ▼                                ▼
┌─────────────────────────────────────────────────────────┐
│                      sync_logs                          │
│                                                         │
│  id (PK)                                                │
│  sync_dir_id (FK) ────────────────┐                     │
│  sync_file_id (FK) ───────────────┼─────────┐           │
│  action                           │         │           │
│  file_path                        │         │           │
│  direction (outbound/inbound)     │         │           │
│  status (success/failure)         │         │           │
│  checksum                         │         │           │
│  file_mode, file_uid, file_gid    │         │           │
│  timestamp                        │         │           │
└───────────────────────────────────┘         │           │
                                              │           │
          ┌───────────────────────────────────┘           │
          │                                               │
          ▼                                               ▼
┌─────────────────────────────────────────────────────────┐
│                     sync_queue                          │
│                                                         │
│  id (PK)                                                │
│  sync_dir_id (FK) ──────────────────────────────────────┤
│  sync_file_id (FK) ─────────────────────────────────────┤
│  action                                                 │
│  file_path                                              │
│  status (pending/processing/failed/completed)           │
│  attempts                                               │
│  priority                                               │
└─────────────────────────────────────────────────────────┘
```

---

## Key Design Patterns

### 1. **Queue-Based Architecture**
- All sync operations go through a queue
- Enables retry logic and resilience
- Prevents thundering herd on rapid changes
- Allows priority-based processing

### 2. **Watcher Pause Pattern**
- When receiving a sync, temporarily pause watcher for that path
- Prevents circular sync (A → B → A → B...)
- Resume after write completes
- Implemented in `src/services/watcher.ts`

### 3. **Atomic File Writes**
- Write to temporary file first (`.file.txt.tmp`)
- Rename to final name (atomic operation)
- Prevents corruption on partial writes
- Implemented in `src/services/sync-engine.ts`

### 4. **Checksum Verification**
- Calculate SHA256 before sending
- Verify SHA256 after receiving
- Detect corruption or network errors
- Return 409 Conflict on mismatch

### 5. **Leader Pattern**
- First server to register sync is the "leader"
- Leader performs initial sync (A → B)
- After initial sync, both are equal peers
- Prevents ambiguity on initial state

### 6. **Retry with Backoff**
- Failed operations retry up to 3 times
- Exponential backoff: 1s, 2s, 4s
- Prevents overwhelming failing servers
- Implemented in `src/utils/retry.ts`

---

## Configuration & Tuning

### Environment Variables

```env
# Sync Performance
SYNC_DEBOUNCE_MS=100              # Filesystem event debounce
MAX_CONCURRENT_SYNCS=5            # Parallel sync operations
QUEUE_PROCESS_INTERVAL_MS=1000    # Queue processing frequency

# File Limits
MAX_FILE_SIZE=104857600           # 100MB maximum file size

# Retry Logic
MAX_RETRY_ATTEMPTS=3              # Retry failed syncs 3 times
RETRY_BACKOFF_MS=1000             # Initial backoff: 1 second
```

### Tuning Guidelines

**High-Frequency Changes:**
```env
SYNC_DEBOUNCE_MS=500              # Wait longer for changes to settle
QUEUE_PROCESS_INTERVAL_MS=2000    # Process less frequently
MAX_CONCURRENT_SYNCS=3            # Reduce concurrency
```

**Low-Latency Requirements:**
```env
SYNC_DEBOUNCE_MS=50               # React immediately
QUEUE_PROCESS_INTERVAL_MS=500     # Process more frequently
MAX_CONCURRENT_SYNCS=10           # Increase concurrency
```

**Large Files:**
```env
MAX_FILE_SIZE=1073741824          # 1GB maximum
MAX_CONCURRENT_SYNCS=2            # Reduce concurrency for bandwidth
```

---

## Monitoring Points

### Key Metrics to Track

1. **Queue Depth**
   - `SELECT COUNT(*) FROM sync_queue WHERE status = 'pending'`
   - Alert if > 100 for extended period

2. **Error Rate**
   - `SELECT COUNT(*) FROM sync_logs WHERE status = 'failure'`
   - Alert if > 5% of operations

3. **Processing Time**
   - `SELECT AVG(processing_time_ms) FROM sync_logs`
   - Alert if > 5000ms (5 seconds)

4. **Sync Lag**
   - `SELECT MAX(created_at) FROM sync_queue WHERE status = 'pending'`
   - Alert if oldest pending item > 5 minutes

5. **Server Connectivity**
   - `SELECT name, last_seen FROM servers WHERE active = 1`
   - Alert if last_seen > 5 minutes ago

---

**Generated:** 2025-10-26
**Status:** Complete
**Next:** Review PRD.md and IMPLEMENTATION_STATUS.md
