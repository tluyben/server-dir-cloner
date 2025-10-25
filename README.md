# Directory Cloner - Bi-Directional File Synchronization Server

A distributed server application that automatically synchronizes directories in real-time across multiple Linux servers. When a directory is registered for synchronization, any changes (create, update, delete) on one server are instantly mirrored to all connected servers.

## What Does This Do?

**Directory Cloner** enables real-time, bi-directional file synchronization between multiple servers:

- **Automatic Sync**: File changes are detected instantly and propagated to other servers
- **Bi-Directional**: Changes flow in both directions between servers
- **Real-Time Monitoring**: Filesystem watchers detect changes as they happen
- **Resilient**: Handles network failures with automatic retry and queue management
- **Secure**: API key authentication for all inter-server communication
- **Auditable**: Every operation is logged to SQLite database

### Use Cases

- Keep configuration files in sync across web server cluster
- Replicate user uploads across multiple application servers
- Maintain synchronized data directories for high availability
- Distribute content changes to edge servers automatically

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup Environment

```bash
cp .env.example .env
# Edit .env if needed (default values work for development)
```

### 3. Initialize Database

```bash
# Run database migrations
npm run db:migrate

# (Optional) Seed with sample data
npx tsx src/db/seed.ts
```

### 4. Start the Server

```bash
# Development mode with hot reload
npm run dev

# Production mode
npm run build
npm start
```

The API will be available at `http://localhost:3000`

### 5. Get Your First API Key

API keys are required to use sync features. Create one with:

```bash
# In another terminal (while server is running)
npm run create-api-key
```

This will:
- Register a server in the database
- Generate a secure 64-character API key
- Save it to `.env.local` for convenience

**Output:**
```
✅ Server registered successfully!
🔐 API Key: d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5
✅ API key appended to .env.local
```

**Important:** Save this API key securely. You'll need it to authenticate sync requests.

See **[QUICK_START_API_KEYS.md](./QUICK_START_API_KEYS.md)** for a 30-second guide to API keys.

## How It Works

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Server A (Leader)                       │
│  ┌────────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │  File System   │→ │  FS Watcher  │→ │  Sync Engine   │  │
│  │  /home/data/   │  │  (chokidar)  │  │                │  │
│  └────────────────┘  └──────────────┘  └────────┬───────┘  │
│                                                   │          │
│  ┌────────────────┐  ┌──────────────┐           │          │
│  │   SQLite DB    │  │  REST API    │           │          │
│  │  - servers     │  │  Express 5.1 │           │          │
│  │  - sync_dirs   │  └──────────────┘           │          │
│  │  - sync_logs   │                              │          │
│  └────────────────┘                              │          │
└──────────────────────────────────────────────────┼──────────┘
                                    HTTPS/HTTP     │
                                                    ▼
┌─────────────────────────────────────────────────────────────┐
│                      Server B (Target)                       │
│  ┌────────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │  REST API      │→ │  Sync Engine │→ │  File System   │  │
│  │                │  │              │  │  /home/data/   │  │
│  └────────────────┘  └──────────────┘  └────────────────┘  │
│                                              ↓               │
│  ┌────────────────┐  ┌──────────────┐      ↓               │
│  │   SQLite DB    │  │  FS Watcher  │←─────┘               │
│  └────────────────┘  └──────────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

### Sync Flow

1. **Directory Registration**: Register a directory for sync with target server(s)
2. **Initial Sync**: Leader server copies all existing files to target
3. **Watchers Start**: Both servers start monitoring the directory
4. **Change Detection**: Filesystem watcher detects file changes
5. **Queue & Sync**: Changes are queued and sent to remote server(s)
6. **Verification**: Checksums verify file integrity
7. **Logging**: All operations logged to database

## API Key Management

### How API Keys Work

API keys are required for all sync operations. They:

1. **Authenticate servers**: Each server instance needs a unique API key
2. **Secure communication**: All sync requests validate the API key
3. **Track activity**: Updates `lastSeen` timestamp on each request
4. **Enable/disable access**: Deactivate keys without deleting them

### Creating Your First API Key

**Option 1: Automated Script (Recommended)**

```bash
npm run create-api-key
```

This creates a server entry and generates a secure 64-character API key automatically.

**Option 2: Manual Registration via API**

```bash
curl -X POST http://localhost:3000/api/servers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Server",
    "url": "http://localhost:3000"
  }'
```

**Response:**
```json
{
  "id": 1,
  "serverId": "server-1729864523456-a3x9k2",
  "name": "My Server",
  "url": "http://localhost:3000",
  "apiKey": "d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5",
  "active": true,
  "createdAt": "2025-10-25T12:00:00.000Z"
}
```

**Save the `apiKey`** - you'll need it for authenticated requests.

### How to Get API Keys (Various Methods)

#### For Development

```bash
# Quick one-liner
npm run create-api-key
```

#### For Production/Automation

**Node.js:**
```javascript
import axios from 'axios';

const response = await axios.post('http://localhost:3000/api/servers', {
  name: 'Production Server',
  url: 'http://prod-server.example.com:3000'
});

const apiKey = response.data.apiKey;
console.log('API Key:', apiKey);
// Store securely (environment variables, secrets manager, etc.)
```

**Python:**
```python
import requests

response = requests.post('http://localhost:3000/api/servers', json={
    'name': 'Production Server',
    'url': 'http://prod-server.example.com:3000'
})

api_key = response.json()['apiKey']
print(f'API Key: {api_key}')
```

**Shell Script (CI/CD):**
```bash
API_KEY=$(curl -s -X POST http://localhost:3000/api/servers \
  -H "Content-Type: application/json" \
  -d '{"name":"CI Server","url":"http://ci.example.com:3000"}' \
  | jq -r '.apiKey')

echo "X_API_KEY=$API_KEY" >> .env
```

### Using API Keys

Include the API key in the `X-API-Key` header for all sync operations:

```bash
curl -H "X-API-Key: your-api-key-here" \
  http://localhost:3000/api/sync/directories
```

### Managing API Keys

**View all servers and their API keys:**
```bash
curl http://localhost:3000/api/servers
```

**View specific server:**
```bash
curl http://localhost:3000/api/servers/1
```

**Update API key:**
```bash
curl -X PUT http://localhost:3000/api/servers/1 \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "new-key"}'
```

**Deactivate server (without deleting):**
```bash
curl -X PUT http://localhost:3000/api/servers/1 \
  -H "Content-Type: application/json" \
  -d '{"active": false}'
```

**Delete server:**
```bash
curl -X DELETE http://localhost:3000/api/servers/1
```

Note: Servers with active sync directories cannot be deleted.

### Automated API Key Creation

For management systems, containers, or CI/CD pipelines, the API provides programmatic access.

**Docker Example:**
```dockerfile
FROM node:18
WORKDIR /app
COPY . .
RUN npm install

# Bootstrap script
COPY bootstrap.sh /app/bootstrap.sh
RUN chmod +x /app/bootstrap.sh

CMD ["/app/bootstrap.sh"]
```

```bash
#!/bin/bash
# bootstrap.sh - Automatically register and get API key

API_KEY=$(curl -s -X POST "$MANAGEMENT_API/api/servers" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"container-${HOSTNAME}\",\"url\":\"http://${HOSTNAME}:3000\"}" \
  | jq -r '.apiKey')

export X_API_KEY="$API_KEY"
npm start
```

See **[API_KEY_GUIDE.md](./API_KEY_GUIDE.md)** for comprehensive documentation including Docker, Kubernetes, and advanced automation examples.

## API Endpoints

### Server Management (API Key Management)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `POST` | `/api/servers` | Register a new server and get API key | No |
| `GET` | `/api/servers` | List all registered servers | No |
| `GET` | `/api/servers/:id` | Get server details (including API key) | No |
| `PUT` | `/api/servers/:id` | Update server configuration | No |
| `DELETE` | `/api/servers/:id` | Delete server | No |
| `POST` | `/api/servers/:id/ping` | Test server connection | No |

**Note:** Server management endpoints don't require authentication to enable initial bootstrapping. In production, secure these with firewall rules or VPN.

### Directory Synchronization (Requires X-API-Key Header)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/sync/directories` | Register directory for sync |
| `GET` | `/api/sync/directories` | List all sync directories |
| `GET` | `/api/sync/directories/:id` | Get sync directory details |
| `PUT` | `/api/sync/directories/:id` | Update sync configuration |
| `DELETE` | `/api/sync/directories/:id` | Remove sync directory |
| `POST` | `/api/sync/files` | Upload file (internal sync operation) |
| `GET` | `/api/sync/files` | Download file (internal sync operation) |

### Example CRUD Endpoints (Included)

The project includes example endpoints for learning:

- **Users**: `/api/users` - User management
- **Posts**: `/api/posts` - Blog posts with author relations
- **Products**: `/api/products` - Product catalog with stock management

### Health Check

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Server health status |

## Usage Examples

### 1. Register a Server

First, each server needs to know about the others:

```bash
# On Server A: Register Server B
curl -X POST http://localhost:3000/api/servers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Server B",
    "url": "http://192.168.1.100:3000"
  }'
```

**Response:**
```json
{
  "id": 1,
  "serverId": "server-1729864523456-a3x9k2",
  "name": "Server B",
  "url": "http://192.168.1.100:3000",
  "apiKey": "d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5",
  "active": true,
  "createdAt": "2025-10-25T12:00:00.000Z"
}
```

**Save the `apiKey`** - you'll need it for authenticated requests.

### 2. Create a Sync Directory

```bash
# Register /home/data for synchronization
curl -X POST http://localhost:3000/api/sync/directories \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key-here" \
  -d '{
    "localPath": "/home/data",
    "remoteServerId": 1,
    "remotePath": "/home/data",
    "isLeader": true
  }'
```

**Response:**
```json
{
  "id": 1,
  "localPath": "/home/data",
  "remoteServerId": 1,
  "remotePath": "/home/data",
  "isLeader": true,
  "status": "active",
  "syncDirection": "bidirectional",
  "createdAt": "2025-10-25T12:00:00.000Z"
}
```

Now any changes in `/home/data` will automatically sync between servers!

### 3. List Active Syncs

```bash
curl http://localhost:3000/api/sync/directories \
  -H "X-API-Key: your-api-key-here"
```

### 4. View Sync Logs

```bash
curl http://localhost:3000/api/sync/directories/1/logs \
  -H "X-API-Key: your-api-key-here"
```

## Project Structure

```
├── src/
│   ├── db/                  # Database configuration
│   │   ├── index.ts         # Database connection & exports
│   │   ├── schema.ts        # Drizzle ORM schemas
│   │   ├── migrate.ts       # Migration runner
│   │   └── seed.ts          # Database seeder
│   ├── middleware/          # Express middleware
│   │   ├── auth.ts          # API key authentication
│   │   ├── error.ts         # Error handling
│   │   ├── logger.ts        # Request logging
│   │   └── validation.ts    # Zod validation
│   ├── routes/              # API route handlers
│   │   ├── index.ts         # Main router
│   │   ├── servers.ts       # Server management (API keys)
│   │   ├── sync.ts          # Directory sync endpoints
│   │   ├── users.ts         # Example: User CRUD
│   │   ├── posts.ts         # Example: Post CRUD
│   │   └── products.ts      # Example: Product CRUD
│   ├── services/            # Business logic
│   │   ├── watcher.ts       # Filesystem watcher (chokidar)
│   │   ├── sync-engine.ts   # Sync operation logic
│   │   └── queue-processor.ts # Background queue processing
│   ├── __tests__/           # Test files
│   └── index.ts             # Application entry point
├── drizzle/                 # Generated database migrations
├── examples/                # Example scripts
│   ├── create-first-api-key.js  # API key creation script
│   └── ...                  # Other examples
├── content.db               # SQLite database (created on first run)
├── .env.example             # Environment variables template
└── package.json             # Dependencies and scripts
```

## Database Schema

### Core Tables

**servers** - Registered servers for synchronization
- `id`, `serverId`, `name`, `url`
- `apiKey` - Authentication key
- `active`, `lastSeen`
- `createdAt`, `updatedAt`

**sync_directories** - Directories configured for sync
- `id`, `localPath`, `remotePath`
- `remoteServerId` (FK → servers)
- `isLeader`, `syncDirection`, `status`
- `lastSyncAt`, `errorCount`
- `createdAt`, `updatedAt`

**sync_logs** - Audit trail of all sync operations
- `id`, `syncDirId`, `action`, `filePath`
- `direction`, `status`, `errorMessage`
- `fileSize`, `checksum`
- `timestamp`, `processingTimeMs`

**sync_queue** - Pending sync operations
- `id`, `syncDirId`, `action`, `filePath`
- `priority`, `attempts`, `maxAttempts`
- `status`, `errorMessage`
- `createdAt`, `updatedAt`

### Example Tables (Included)

- **users** - User management example
- **posts** - Blog posts with author relations
- **products** - Product catalog with stock management

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Compile TypeScript to JavaScript |
| `npm start` | Run production server |
| `npm run check` | Run TypeScript, ESLint, Prettier checks |
| `npm run lint` | Fix ESLint issues |
| `npm run format` | Format code with Prettier |
| `npm run db:generate` | Generate database migrations from schema |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:push` | Push schema changes directly (dev only) |
| `npm run db:studio` | Open Drizzle Studio database GUI |
| `npm test` | Run all tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run create-api-key` | Create first API key interactively |

## Technology Stack

- **Runtime**: Node.js 18+ with ES modules
- **Framework**: Express 5.1.0
- **Language**: TypeScript 5.7 (strict mode)
- **Database**: SQLite with Better-SQLite3
- **ORM**: Drizzle ORM 0.38
- **Validation**: Zod 3.24
- **File Watching**: Chokidar 4.0
- **HTTP Client**: Axios 1.12
- **Testing**: Jest 29 + Supertest
- **Development**: TSX for hot reload

## Configuration

### Environment Variables

Create a `.env` file (copy from `.env.example`):

```env
# Server Configuration
PORT=3000
NODE_ENV=development
API_PREFIX=/api

# Database
DATABASE_URL=./content.db

# Security
CORS_ORIGIN=http://localhost:3000
API_KEY_HEADER=X-API-Key

# Sync Configuration (optional, defaults shown)
MAX_FILE_SIZE=104857600          # 100MB
SYNC_DEBOUNCE_MS=100             # Filesystem event debounce
MAX_CONCURRENT_SYNCS=5           # Parallel sync operations
QUEUE_PROCESS_INTERVAL_MS=1000   # Queue processing frequency

# Retry Configuration
MAX_RETRY_ATTEMPTS=3
RETRY_BACKOFF_MS=1000            # Initial backoff time

# Logging
LOG_LEVEL=info
LOG_RETENTION_DAYS=90
```

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Test Structure

- `src/__tests__/` - Test files
- `src/test/setup.ts` - Test database setup
- `src/test/utils.ts` - Test data factories
- Uses separate `test.db` database for isolation

### Writing Tests

```typescript
import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../app.js';

describe('Sync API', () => {
  const app = createApp();

  it('should create sync directory', async () => {
    const response = await request(app)
      .post('/api/sync/directories')
      .set('X-API-Key', 'test-key')
      .send({ localPath: '/test', remoteServerId: 1 })
      .expect(201);

    expect(response.body).toHaveProperty('id');
  });
});
```

## Security

### Best Practices

1. **API Key Security**
   - Never commit API keys to version control
   - Store in environment variables or secrets manager
   - Rotate keys regularly (e.g., every 90 days)
   - Use HTTPS in production

2. **Path Validation**
   - Only allow whitelisted base directories
   - Prevent path traversal attacks
   - Validate all file paths before operations

3. **Network Security**
   - Use HTTPS for production deployments
   - Implement rate limiting
   - Secure server management endpoints with firewall/VPN

4. **Data Integrity**
   - All file transfers verified with SHA256 checksums
   - Atomic file writes (write to temp, then rename)
   - Transaction-based database operations

### Security Checklist

- [ ] API keys stored securely (not in git)
- [ ] Using HTTPS in production
- [ ] Server management endpoints secured (firewall/VPN)
- [ ] File size limits configured
- [ ] Allowed base paths configured
- [ ] Regular API key rotation implemented
- [ ] Monitoring for unusual activity enabled

## Production Deployment

### 1. Build the Application

```bash
npm run build
```

### 2. Set Environment Variables

```bash
export NODE_ENV=production
export PORT=3000
export DATABASE_URL=/var/lib/directory-cloner/content.db
```

### 3. Run Database Migrations

```bash
npm run db:migrate
```

### 4. Start the Server

```bash
npm start
```

### 5. Install as Systemd Service (Linux)

```bash
sudo cp deploy/directory-cloner.service /etc/systemd/system/
sudo systemctl enable directory-cloner
sudo systemctl start directory-cloner
sudo systemctl status directory-cloner
```

### Multi-Server Setup

**On Server A:**
```bash
export SERVER_ID=server-a
export SERVER_NAME="Server A"
npm start
```

**On Server B:**
```bash
export SERVER_ID=server-b
export SERVER_NAME="Server B"
npm start
```

**Register each server:**
```bash
# From Server A, register Server B
curl -X POST http://server-a:3000/api/servers \
  -H "Content-Type: application/json" \
  -d '{"name":"Server B","url":"http://server-b:3000"}'

# From Server B, register Server A
curl -X POST http://server-b:3000/api/servers \
  -H "Content-Type: application/json" \
  -d '{"name":"Server A","url":"http://server-a:3000"}'
```

**Start syncing:**
```bash
curl -X POST http://server-a:3000/api/sync/directories \
  -H "Content-Type: application/json" \
  -H "X-API-Key: server-a-api-key" \
  -d '{
    "localPath": "/home/data",
    "remoteServerId": 1,
    "remotePath": "/home/data",
    "isLeader": true
  }'
```

## Monitoring & Observability

### Health Checks

```bash
curl http://localhost:3000/health
```

### View Sync Status

```bash
# List all active syncs
curl http://localhost:3000/api/sync/directories \
  -H "X-API-Key: your-key"

# View specific sync details
curl http://localhost:3000/api/sync/directories/1 \
  -H "X-API-Key: your-key"
```

### Check Sync Logs

```bash
# Get recent sync operations
curl http://localhost:3000/api/sync/directories/1/logs \
  -H "X-API-Key: your-key"

# Filter by action type
curl "http://localhost:3000/api/sync/directories/1/logs?action=update&limit=50" \
  -H "X-API-Key: your-key"
```

### Database GUI

Open Drizzle Studio to visually inspect the database:

```bash
npm run db:studio
```

## Troubleshooting

### Common Issues

**"Missing X-API-Key header"**
- Ensure you include the header: `-H "X-API-Key: your-key"`
- Verify the key exists: `curl http://localhost:3000/api/servers`

**"Invalid API key"**
- Check the key is correct (64 hex characters for auto-generated)
- Verify server is active: `curl http://localhost:3000/api/servers/1`
- Create new key: `npm run create-api-key`

**"Cannot connect to remote server"**
- Verify remote server URL is accessible
- Check network connectivity between servers
- Ensure remote server is running

**"Database locked"**
- Close Drizzle Studio if running
- Restart the server
- Check for hanging database connections

**Sync not working**
- Check filesystem watcher is active
- Verify directory paths exist and are accessible
- Review sync logs for errors
- Check queue status in database

## Documentation

- **[README.md](./README.md)** (this file) - Project overview and quick start
- **[QUICK_START_API_KEYS.md](./QUICK_START_API_KEYS.md)** - 30-second API key guide
- **[API_KEY_GUIDE.md](./API_KEY_GUIDE.md)** - Comprehensive API key management
- **[SYNC_GUIDE.md](./SYNC_GUIDE.md)** - Directory synchronization guide (if available)
- **[CLAUDE.md](./CLAUDE.md)** - Development guide for LLMs
- **[PRD.md](./PRD.md)** - Product requirements document

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes
4. Run tests: `npm test`
5. Run checks: `npm run check`
6. Commit: `git commit -m "Add feature"`
7. Push: `git push origin feature-name`
8. Create a Pull Request

## License

MIT License - see LICENSE file for details

## Support

For issues, questions, or feature requests:
- Check existing documentation in the project
- Review the database schema in `src/db/schema.ts`
- Check authentication middleware in `src/middleware/auth.ts`
- Review route handlers in `src/routes/`

## Acknowledgments

Built with modern best practices using:
- Express 5.1.0 for robust API handling
- Drizzle ORM for type-safe database operations
- Chokidar for reliable filesystem watching
- TypeScript for type safety and developer experience
