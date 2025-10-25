# API Key Architecture & Flow

This document provides a visual overview of how API keys work in the system.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     API Key Management System                   │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                      1. KEY GENERATION                           │
└──────────────────────────────────────────────────────────────────┘

  User/Management System
         │
         │ POST /api/servers
         │ { "name": "My Server", "url": "http://..." }
         ▼
  ┌─────────────────┐
  │  Express API    │
  │  (Port 3000)    │
  └────────┬────────┘
           │
           │ 1. Validate input (Zod)
           │ 2. Check duplicate name
           │ 3. Generate API key (crypto.randomBytes)
           ▼
  ┌─────────────────┐
  │ src/middleware/ │
  │    auth.ts      │
  │ generateApiKey()│
  └────────┬────────┘
           │
           │ Returns: 64-char hex string
           │ Example: "d4e5f6a7b8c9d0e1f2a3..."
           ▼
  ┌─────────────────┐
  │ src/routes/     │
  │   servers.ts    │
  │ POST handler    │
  └────────┬────────┘
           │
           │ 4. Test connection to remote server
           │ 5. Insert into database
           ▼
  ┌─────────────────┐
  │  SQLite DB      │
  │  content.db     │
  │  servers table  │
  └────────┬────────┘
           │
           │ 6. Return server record with API key
           ▼
  {
    "id": 1,
    "serverId": "server-1729...",
    "name": "My Server",
    "url": "http://...",
    "apiKey": "d4e5f6a7b8c9d0e1...",
    "active": true,
    "createdAt": "2025-10-25T12:00:00.000Z"
  }

┌──────────────────────────────────────────────────────────────────┐
│                      2. KEY USAGE                                │
└──────────────────────────────────────────────────────────────────┘

  Client Application
         │
         │ GET /api/sync/directories
         │ Headers: { "X-API-Key": "d4e5f6a7b8c9..." }
         ▼
  ┌─────────────────┐
  │  Express API    │
  │  (Middleware)   │
  └────────┬────────┘
           │
           │ authenticateApiKey middleware
           ▼
  ┌─────────────────┐
  │ src/middleware/ │
  │    auth.ts      │
  │ authenticateApiKey()│
  └────────┬────────┘
           │
           │ 1. Extract X-API-Key from header
           │ 2. Query database for matching key
           ▼
  ┌─────────────────┐
  │  SQLite DB      │
  │  content.db     │
  │  servers table  │
  └────────┬────────┘
           │
           ├─ Key found & active?
           │  └─ Yes ──┐
           │           │
           └─ No ──────┼─► 401 Unauthorized
                       │
                       │ 3. Attach server info to request
                       │ 4. Update lastSeen timestamp
                       ▼
           ┌─────────────────────┐
           │ req.authenticatedServer = {
           │   id: 1,
           │   serverId: "server-...",
           │   name: "My Server"
           │ }
           └──────────┬──────────┘
                      │
                      │ 5. Proceed to route handler
                      ▼
           ┌─────────────────────┐
           │  Protected Route    │
           │  Handler            │
           └─────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                   3. KEY MANAGEMENT                              │
└──────────────────────────────────────────────────────────────────┘

  ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
  │  View Keys  │       │ Update Key  │       │ Delete Key  │
  └──────┬──────┘       └──────┬──────┘       └──────┬──────┘
         │                     │                     │
         │ GET /api/servers    │ PUT /api/servers/:id│ DELETE /api/
         │                     │                     │  servers/:id
         ▼                     ▼                     ▼
  ┌─────────────────────────────────────────────────────────┐
  │              Server Management Routes                   │
  │               (src/routes/servers.ts)                   │
  └───────────────────────┬─────────────────────────────────┘
                          │
                          │ Database operations
                          ▼
                  ┌──────────────┐
                  │  SQLite DB   │
                  │  servers     │
                  └──────────────┘
```

## Database Schema

```sql
CREATE TABLE servers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  serverId        TEXT NOT NULL UNIQUE,       -- Unique server identifier
  name            TEXT NOT NULL,              -- Human-readable name
  url             TEXT NOT NULL,              -- Server URL
  apiKey          TEXT NOT NULL,              -- Authentication key
  active          BOOLEAN NOT NULL DEFAULT 1, -- Active/inactive status
  lastSeen        TEXT,                       -- Last authentication timestamp
  createdAt       TEXT NOT NULL,              -- Creation timestamp
  updatedAt       TEXT NOT NULL               -- Last update timestamp
);

-- Indexes
CREATE INDEX idx_servers_api_key ON servers(apiKey);
CREATE UNIQUE INDEX idx_servers_server_id ON servers(serverId);
```

## Authentication Flow

```
┌────────────────────────────────────────────────────────────────┐
│  Request arrives with X-API-Key header                        │
└────────────┬───────────────────────────────────────────────────┘
             │
             ▼
    ┌────────────────────┐
    │ Extract API key    │
    │ from header        │
    └────────┬───────────┘
             │
             ▼
    ┌────────────────────┐       No header
    │ Key present?       ├──────────────► 401: Missing X-API-Key
    └────────┬───────────┘
             │ Yes
             ▼
    ┌────────────────────┐
    │ Query database:    │
    │ SELECT * FROM      │
    │ servers WHERE      │
    │ apiKey = ?         │
    └────────┬───────────┘
             │
             ▼
    ┌────────────────────┐       Not found
    │ Key exists?        ├──────────────► 401: Invalid API key
    └────────┬───────────┘
             │ Found
             ▼
    ┌────────────────────┐       Inactive
    │ Server active?     ├──────────────► 403: Server not active
    └────────┬───────────┘
             │ Active
             ▼
    ┌────────────────────┐
    │ Update lastSeen    │
    │ timestamp          │
    └────────┬───────────┘
             │
             ▼
    ┌────────────────────┐
    │ Attach server info │
    │ to request object  │
    └────────┬───────────┘
             │
             ▼
    ┌────────────────────┐
    │ Continue to route  │
    │ handler            │
    └────────────────────┘
             │
             ▼
    ┌────────────────────┐
    │ Process request    │
    │ Return response    │
    └────────────────────┘
```

## Code Flow

```
Request
   │
   ▼
app.ts (createApp)
   │
   ├─► Helmet, CORS, body-parser
   ├─► Request logger (if not test)
   │
   ▼
routes/index.ts (apiRouter)
   │
   ├─► /api/servers     → routes/servers.ts (no auth)
   ├─► /api/sync        → routes/sync.ts (with auth)
   ├─► /api/users       → routes/users.ts (no auth)
   ├─► /api/posts       → routes/posts.ts (no auth)
   └─► /api/products    → routes/products.ts (no auth)

routes/sync.ts
   │
   ▼
authenticateApiKey middleware (middleware/auth.ts)
   │
   ├─► Validates X-API-Key header
   ├─► Queries servers table
   ├─► Checks active status
   ├─► Updates lastSeen
   └─► Attaches req.authenticatedServer
   │
   ▼
Route handler
   │
   ├─► Access req.authenticatedServer.id
   ├─► Process business logic
   └─► Return response
```

## File Responsibilities

```
src/
├── middleware/
│   └── auth.ts
│       ├── generateApiKey()           # Crypto random key generation
│       ├── authenticateApiKey()       # Required auth middleware
│       └── optionalAuth()             # Optional auth middleware
│
├── routes/
│   ├── servers.ts
│   │   ├── POST /                     # Create server & generate key
│   │   ├── GET /                      # List all servers
│   │   ├── GET /:id                   # Get server details
│   │   ├── PUT /:id                   # Update server/key
│   │   ├── DELETE /:id                # Delete server
│   │   └── POST /:id/ping             # Test connection
│   │
│   └── sync.ts
│       └── (All routes protected by authenticateApiKey)
│
└── db/
    ├── schema.ts
    │   └── servers table definition   # Database schema
    │
    └── index.ts
        └── Database connection        # Export db, servers
```

## Automation Integration Points

```
┌──────────────────────────────────────────────────────────────┐
│              Management System / Orchestrator                │
└────────────────────┬─────────────────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
        ▼            ▼            ▼
   ┌─────────┐  ┌─────────┐  ┌─────────┐
   │Container│  │   K8s   │  │  CI/CD  │
   │Bootstrap│  │  Init   │  │Pipeline │
   └────┬────┘  └────┬────┘  └────┬────┘
        │            │            │
        └────────────┼────────────┘
                     │
                     │ Execute automation script
                     ▼
        ┌────────────────────────┐
        │  Automation Scripts    │
        │                        │
        │  ├─ create-first-api-key.js   (Node.js)
        │  ├─ create_first_api_key.py   (Python)
        │  └─ create-first-api-key.sh   (Bash)
        └────────────┬───────────┘
                     │
                     │ HTTP POST
                     ▼
        ┌────────────────────────┐
        │  POST /api/servers     │
        │  {                     │
        │    "name": "...",      │
        │    "url": "..."        │
        │  }                     │
        └────────────┬───────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │  API generates key     │
        │  Returns server record │
        └────────────┬───────────┘
                     │
                     │ Save API key
                     ▼
        ┌────────────────────────┐
        │  Store in:             │
        │  ├─ Environment var    │
        │  ├─ .env file          │
        │  ├─ Secrets manager    │
        │  └─ Config file        │
        └────────────────────────┘
```

## Security Considerations

```
┌─────────────────────────────────────────────────────────┐
│                    Security Layers                      │
└─────────────────────────────────────────────────────────┘

1. Key Generation
   ├─ crypto.randomBytes(32) - Cryptographically secure
   ├─ 64 hex characters - 256 bits of entropy
   └─ Unpredictable - No sequential patterns

2. Storage
   ├─ SQLite database - File-based, access controlled
   ├─ Indexed for performance - Fast lookups
   └─ No encryption at rest - Consider for production

3. Transmission
   ├─ HTTP header - Simple and standard
   ├─ HTTPS recommended - Encrypted in transit
   └─ No query params - Not logged in most systems

4. Validation
   ├─ Exact match - No fuzzy matching
   ├─ Active check - Can disable without deleting
   └─ Timestamp tracking - Monitor usage patterns

5. Access Control
   ├─ Per-server keys - Granular access
   ├─ Can be revoked - Delete or deactivate
   └─ No IP restrictions - Flexible deployment

⚠️ Production Recommendations:
   ├─ Use HTTPS only
   ├─ Implement rate limiting
   ├─ Add IP allowlisting (optional)
   ├─ Rotate keys regularly
   ├─ Monitor lastSeen for anomalies
   └─ Consider encrypting keys in DB
```

## API Endpoints Summary

```
┌──────────────────────────────────────────────────────────────┐
│                    Public Endpoints                          │
│                  (No authentication required)                │
└──────────────────────────────────────────────────────────────┘

GET    /health                        → Health check
GET    /api                           → API info

POST   /api/servers                   → Create & get API key
GET    /api/servers                   → List servers
GET    /api/servers/:id               → Get server details
PUT    /api/servers/:id               → Update server/key
DELETE /api/servers/:id               → Delete server
POST   /api/servers/:id/ping          → Test connection

┌──────────────────────────────────────────────────────────────┐
│                  Protected Endpoints                         │
│          (X-API-Key header required)                         │
└──────────────────────────────────────────────────────────────┘

POST   /api/sync/directories          → Create sync
GET    /api/sync/directories          → List syncs
PUT    /api/sync/directories/:id      → Update sync
DELETE /api/sync/directories/:id      → Delete sync
POST   /api/sync/files                → Upload file
GET    /api/sync/files                → Download file
```

## Complete Request/Response Example

```bash
# 1. Create server and get API key
curl -X POST http://localhost:3000/api/servers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Production Server",
    "url": "https://prod.example.com"
  }'

# Response:
{
  "id": 1,
  "serverId": "server-1729864523456-a3x9k2",
  "name": "Production Server",
  "url": "https://prod.example.com",
  "apiKey": "d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5",
  "active": true,
  "lastSeen": null,
  "createdAt": "2025-10-25T12:00:00.000Z",
  "updatedAt": "2025-10-25T12:00:00.000Z"
}

# 2. Use API key to access protected endpoint
curl -H "X-API-Key: d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5" \
  http://localhost:3000/api/sync/directories

# Success! (API key was valid)
```

## Related Documentation

- [API_KEY_GUIDE.md](./API_KEY_GUIDE.md) - Complete API key guide
- [QUICK_START_API_KEYS.md](./QUICK_START_API_KEYS.md) - Quick start
- [API_KEY_SUMMARY.md](./API_KEY_SUMMARY.md) - Summary & reference
- [examples/README.md](./examples/README.md) - Automation examples
- [README.md](./README.md) - Main documentation
