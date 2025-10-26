# Docker Architecture Diagram

## Development Setup

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Docker Host Machine                              │
│                                                                           │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                  directory-cloner-dev Container                     │ │
│  │                                                                      │ │
│  │  ┌──────────────┐      ┌───────────────┐      ┌─────────────────┐ │ │
│  │  │              │      │               │      │                 │ │ │
│  │  │ Source Code  │─────▶│  TSX Watch    │─────▶│  Express API    │ │ │
│  │  │ (mounted)    │      │  Hot Reload   │      │  Port 3000      │ │ │
│  │  │              │      │               │      │                 │ │ │
│  │  └──────────────┘      └───────────────┘      └─────────────────┘ │ │
│  │         │                                              │            │ │
│  │         │                                              │            │ │
│  │         ▼                                              ▼            │ │
│  │  ┌──────────────┐      ┌───────────────┐      ┌─────────────────┐ │ │
│  │  │              │      │               │      │                 │ │ │
│  │  │ node_modules │      │  SQLite DB    │      │  Chokidar       │ │ │
│  │  │ (volume)     │      │  content.db   │      │  File Watcher   │ │ │
│  │  │              │      │               │      │                 │ │ │
│  │  └──────────────┘      └───────────────┘      └─────────────────┘ │ │
│  │                                                                      │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                    │                                      │
│  Mounted Volumes:                  │                                      │
│  ┌───────────────────────────────┐ │                                      │
│  │ ./src ─────────────▶ /app/src  │ │                                      │
│  │ ./content.db ──────▶ /app/content.db                                 │
│  │ ./test-sync ───────▶ /test-sync│ │                                      │
│  │ node_modules (named volume)    │ │                                      │
│  └───────────────────────────────┘ │                                      │
│                                    │                                      │
│  Exposed Ports:                   │                                      │
│  ┌───────────────────────────────┐ │                                      │
│  │ 3000 ──────────▶ HTTP API      │ │                                      │
│  │ 9229 ──────────▶ Node Debugger │ │                                      │
│  └───────────────────────────────┘ │                                      │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

## Production Setup

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Docker Host Machine                              │
│                                                                           │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │             directory-cloner-api Container (Production)             │ │
│  │                       User: expressjs (1001)                         │ │
│  │                                                                      │ │
│  │  ┌──────────────┐      ┌───────────────┐      ┌─────────────────┐ │ │
│  │  │              │      │               │      │                 │ │ │
│  │  │ Built Code   │─────▶│   Node.js     │─────▶│  Express API    │ │ │
│  │  │ (dist/)      │      │  Production   │      │  Port 3000      │ │ │
│  │  │              │      │               │      │                 │ │ │
│  │  └──────────────┘      └───────────────┘      └─────────────────┘ │ │
│  │                                │                       │            │ │
│  │                                ▼                       ▼            │ │
│  │                        ┌───────────────┐      ┌─────────────────┐ │ │
│  │                        │               │      │                 │ │ │
│  │                        │  SQLite DB    │      │  Chokidar       │ │ │
│  │                        │ /data/        │      │  File Watcher   │ │ │
│  │                        │  content.db   │      │                 │ │ │
│  │                        │               │      │                 │ │ │
│  │                        └───────────────┘      └─────────────────┘ │ │
│  │                                                                      │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  Mounted Volumes (Persistent):                                           │
│  ┌──────────────────────────────────┐                                    │
│  │ ./data ─────────────▶ /data      │ (SQLite DB, persistent)            │
│  │ ./sync-data ────────▶ /sync-data │ (Sync directories)                 │
│  └──────────────────────────────────┘                                    │
│                                                                           │
│  Exposed Ports:                                                           │
│  ┌──────────────────────────────────┐                                    │
│  │ 3000 ──────────▶ HTTP API        │                                    │
│  └──────────────────────────────────┘                                    │
│                                                                           │
│  Health Check:                                                            │
│  ┌──────────────────────────────────┐                                    │
│  │ GET /health (every 30s)          │                                    │
│  └──────────────────────────────────┘                                    │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

## Multi-Server Production Setup

```
┌───────────────────────────────────────────────────────────────────────────────┐
│                            Docker Host Machine                                 │
│                                                                                 │
│  ┌─────────────────────────────────┐  ┌─────────────────────────────────┐    │
│  │  directory-cloner-api           │  │  directory-cloner-api-replica   │    │
│  │  (Primary Server)               │  │  (Replica Server)               │    │
│  │                                 │  │                                 │    │
│  │  ┌────────────────────────────┐ │  │ ┌────────────────────────────┐ │    │
│  │  │  Express API               │ │  │ │  Express API               │ │    │
│  │  │  Port: 3000                │ │  │ │  Port: 3000 (internal)     │ │    │
│  │  │                            │ │  │ │                            │ │    │
│  │  │  ┌──────────────────────┐  │ │  │ │  ┌──────────────────────┐  │ │    │
│  │  │  │  Sync Engine         │  │ │  │ │  │  Sync Engine         │  │ │    │
│  │  │  │                      │  │ │  │ │  │                      │  │ │    │
│  │  │  │  File Watcher        │◀─┼─┼──┼─┼─▶│  File Watcher        │  │ │    │
│  │  │  │  (Chokidar)          │  │ │  │ │  │  (Chokidar)          │  │ │    │
│  │  │  └──────────────────────┘  │ │  │ │  └──────────────────────┘  │ │    │
│  │  │                            │ │  │ │                            │ │    │
│  │  │  SQLite: /data/content.db  │ │  │ │  SQLite: /data/content.db  │ │    │
│  │  └────────────────────────────┘ │  │ └────────────────────────────┘ │    │
│  └─────────────────────────────────┘  └─────────────────────────────────┘    │
│           │                                          │                         │
│           │ Exposed: localhost:3000                  │ Exposed: localhost:3001 │
│           │                                          │                         │
│           └──────────────┬───────────────────────────┘                         │
│                          │                                                     │
│                    cloner-network (bridge)                                     │
│                          │                                                     │
│  ┌───────────────────────┴─────────────────────────────────────────────────┐ │
│  │  Volumes (Persistent Data)                                               │ │
│  │                                                                           │ │
│  │  ./data/content.db      ────▶  Primary Database                          │ │
│  │  ./data-replica/content.db ─▶  Replica Database                          │ │
│  │  ./sync-data/           ────▶  Shared Sync Directory (both servers)      │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
│  Network Communication:                                                         │
│  ┌───────────────────────────────────────────────────────────────────────────┐ │
│  │  Primary → Replica:  http://api-replica:3000 (internal DNS)              │ │
│  │  Replica → Primary:  http://api:3000 (internal DNS)                      │ │
│  │  API Key Authentication: X-API-Key header                                │ │
│  └───────────────────────────────────────────────────────────────────────────┘ │
│                                                                                 │
└───────────────────────────────────────────────────────────────────────────────┘
```

## Build Process

```
┌─────────────────────────────────────────────────────────────────┐
│                    Docker Build Process                          │
│                                                                   │
│  Development (Dockerfile):                                        │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ 1. FROM node:20-alpine                                     │  │
│  │ 2. Install native dependencies (python3, make, g++)       │  │
│  │ 3. COPY package*.json                                      │  │
│  │ 4. RUN npm ci (install all dependencies)                  │  │
│  │ 5. COPY source code                                        │  │
│  │ 6. EXPOSE 3000                                             │  │
│  │ 7. CMD ["npm", "run", "dev"]                               │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                   │
│  Production (Dockerfile.prod) - Multi-stage:                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Stage 1: Dependencies                                      │  │
│  │   - Install production dependencies only                  │  │
│  │   - Clean npm cache                                        │  │
│  │                                                             │  │
│  │ Stage 2: Builder                                           │  │
│  │   - Install all dependencies (including dev)              │  │
│  │   - Copy source code                                       │  │
│  │   - Run TypeScript build (npm run build)                  │  │
│  │                                                             │  │
│  │ Stage 3: Production                                        │  │
│  │   - Copy production dependencies from Stage 1             │  │
│  │   - Copy built code from Stage 2 (dist/)                  │  │
│  │   - Create non-root user (expressjs:nodejs)               │  │
│  │   - Copy entrypoint script                                │  │
│  │   - Health check configuration                            │  │
│  │   - USER expressjs (run as non-root)                      │  │
│  │   - ENTRYPOINT ["/usr/local/bin/docker-entrypoint.prod.sh"]│  │
│  │   - CMD ["node", "dist/index.js"]                         │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                   │
│  Result:                                                          │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Development Image: ~500MB (includes dev tools)             │  │
│  │ Production Image:  ~200MB (optimized, minimal)             │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                          Data Flow Diagram                              │
│                                                                          │
│  Client Request                                                          │
│       │                                                                  │
│       ▼                                                                  │
│  ┌─────────────────┐                                                    │
│  │ Docker Host     │                                                    │
│  │ Port 3000       │                                                    │
│  └────────┬────────┘                                                    │
│           │                                                              │
│           ▼                                                              │
│  ┌─────────────────────────────────────────┐                           │
│  │  Container: directory-cloner-api        │                           │
│  │                                         │                           │
│  │  ┌─────────────────────────────────┐   │                           │
│  │  │  Express Middleware Stack       │   │                           │
│  │  │  ├─ CORS                         │   │                           │
│  │  │  ├─ Helmet (Security)            │   │                           │
│  │  │  ├─ Logger                       │   │                           │
│  │  │  ├─ API Key Auth (X-API-Key)     │   │                           │
│  │  │  └─ Validation (Zod)             │   │                           │
│  │  └────────────┬────────────────────┘   │                           │
│  │               │                         │                           │
│  │               ▼                         │                           │
│  │  ┌─────────────────────────────────┐   │                           │
│  │  │  Route Handlers                  │   │                           │
│  │  │  ├─ /api/servers                 │   │                           │
│  │  │  ├─ /api/sync/*                  │   │                           │
│  │  │  ├─ /api/users                   │   │                           │
│  │  │  ├─ /api/posts                   │   │                           │
│  │  │  └─ /api/products                │   │                           │
│  │  └────────────┬────────────────────┘   │                           │
│  │               │                         │                           │
│  │               ▼                         │                           │
│  │  ┌─────────────────────────────────┐   │                           │
│  │  │  Services Layer                  │   │                           │
│  │  │  ├─ Sync Engine                  │   │                           │
│  │  │  ├─ File Watcher (Chokidar)      │   │                           │
│  │  │  └─ Queue Processor              │   │                           │
│  │  └────────────┬────────────────────┘   │                           │
│  │               │                         │                           │
│  │               ▼                         │                           │
│  │  ┌─────────────────────────────────┐   │                           │
│  │  │  Database Layer (Drizzle ORM)    │   │                           │
│  │  └────────────┬────────────────────┘   │                           │
│  │               │                         │                           │
│  └───────────────┼─────────────────────────┘                           │
│                  │                                                      │
│                  ▼                                                      │
│  ┌──────────────────────────────────────┐                              │
│  │  Volume: ./data/content.db           │                              │
│  │  (Persistent SQLite Database)        │                              │
│  └──────────────────────────────────────┘                              │
│                                                                          │
└────────────────────────────────────────────────────────────────────────┘
```

## Network Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Docker Network Setup                             │
│                                                                          │
│  cloner-network (bridge)                                                │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │                                                                  │   │
│  │  Container 1: api                                                │   │
│  │  ┌────────────────────────────────────────────────────────┐    │   │
│  │  │ Internal IP: 172.x.x.2                                  │    │   │
│  │  │ Hostname: api                                           │    │   │
│  │  │ DNS: Resolves "api-replica" to 172.x.x.3               │    │   │
│  │  └────────────────────────────────────────────────────────┘    │   │
│  │                                                                  │   │
│  │  Container 2: api-replica                                        │   │
│  │  ┌────────────────────────────────────────────────────────┐    │   │
│  │  │ Internal IP: 172.x.x.3                                  │    │   │
│  │  │ Hostname: api-replica                                   │    │   │
│  │  │ DNS: Resolves "api" to 172.x.x.2                       │    │   │
│  │  └────────────────────────────────────────────────────────┘    │   │
│  │                                                                  │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  Host Port Mapping:                                                     │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │ localhost:3000 ──▶ api:3000                                     │   │
│  │ localhost:3001 ──▶ api-replica:3000                             │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└────────────────────────────────────────────────────────────────────────┘
```

## Startup Sequence

```
Development:
┌──────────────────────────────────────────────────────────────┐
│ 1. docker-compose -f docker-compose.dev.yml up              │
│    │                                                          │
│    ├─▶ 2. Build image (if not exists)                        │
│    │   └─▶ Install dependencies                              │
│    │                                                          │
│    ├─▶ 3. Create container                                   │
│    │   └─▶ Mount volumes (source code, node_modules, db)     │
│    │                                                          │
│    ├─▶ 4. Run entrypoint script (docker-entrypoint.dev.sh)  │
│    │   ├─▶ Create database if not exists                     │
│    │   ├─▶ Run migrations                                    │
│    │   └─▶ Optional: Seed database                           │
│    │                                                          │
│    ├─▶ 5. Start main process (npm run dev)                   │
│    │   ├─▶ TSX watch starts                                  │
│    │   ├─▶ Express server starts on port 3000                │
│    │   ├─▶ Queue processor starts                            │
│    │   └─▶ File watchers resume (if any active syncs)        │
│    │                                                          │
│    └─▶ 6. Container ready                                    │
│        └─▶ Health check passes                               │
└──────────────────────────────────────────────────────────────┘

Production:
┌──────────────────────────────────────────────────────────────┐
│ 1. docker-compose up -d                                      │
│    │                                                          │
│    ├─▶ 2. Build image (multi-stage)                          │
│    │   ├─▶ Stage 1: Install prod dependencies                │
│    │   ├─▶ Stage 2: Build TypeScript                         │
│    │   └─▶ Stage 3: Create final image                       │
│    │                                                          │
│    ├─▶ 3. Create container                                   │
│    │   └─▶ Mount volumes (data, sync-data)                   │
│    │                                                          │
│    ├─▶ 4. Run entrypoint script (docker-entrypoint.prod.sh) │
│    │   ├─▶ Verify /data directory                            │
│    │   ├─▶ Initialize/copy production database               │
│    │   └─▶ Run migrations                                    │
│    │                                                          │
│    ├─▶ 5. Start main process (node dist/index.js)           │
│    │   ├─▶ Express server starts on port 3000                │
│    │   ├─▶ Queue processor starts                            │
│    │   └─▶ File watchers resume (if any active syncs)        │
│    │                                                          │
│    └─▶ 6. Container ready (running as non-root)             │
│        └─▶ Health check passes                               │
└──────────────────────────────────────────────────────────────┘
```
