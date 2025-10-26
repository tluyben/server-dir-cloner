# Docker Guide - Directory Cloner API

Complete guide for running the Directory Cloner API in Docker containers for both development and production environments.

## Table of Contents

- [Quick Start](#quick-start)
- [Development Setup](#development-setup)
- [Production Deployment](#production-deployment)
- [Multi-Server Setup](#multi-server-setup)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

## Quick Start

### Prerequisites

- Docker 20.10+ installed
- Docker Compose 2.0+ installed
- 2GB+ free disk space

### Development (Fast Start)

```bash
# Clone and start development environment
git clone <repository-url>
cd directory-cloner

# Start development server with hot reload
docker-compose -f docker-compose.dev.yml up

# Access the API
curl http://localhost:3000/health
```

The API will be available at `http://localhost:3000` with hot reload enabled.

### Production (Fast Start)

```bash
# Build and start production server
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f api
```

## Development Setup

### Starting the Development Environment

```bash
# Start in foreground (see logs)
docker-compose -f docker-compose.dev.yml up

# Start in background
docker-compose -f docker-compose.dev.yml up -d

# Stop
docker-compose -f docker-compose.dev.yml down
```

### Development Features

- **Hot Reload**: Code changes automatically restart the server
- **Volume Mounting**: Source code is mounted for instant updates
- **Debug Port**: Port 9229 exposed for Node.js debugging
- **Persistent Database**: SQLite database persists between restarts
- **Test Directories**: `./test-sync` mounted for testing sync features

### Development Workflow

```bash
# View logs in real-time
docker-compose -f docker-compose.dev.yml logs -f dev

# Execute commands inside container
docker-compose -f docker-compose.dev.yml exec dev bash

# Run database migrations
docker-compose -f docker-compose.dev.yml exec dev npm run db:migrate

# Run tests
docker-compose -f docker-compose.dev.yml exec dev npm test

# Seed database with sample data
docker-compose -f docker-compose.dev.yml exec dev npx tsx src/db/seed.ts

# Create API key
docker-compose -f docker-compose.dev.yml exec dev npm run create-api-key
```

### Debugging with VSCode

Add this configuration to `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "attach",
      "name": "Docker: Attach to Node",
      "port": 9229,
      "address": "localhost",
      "localRoot": "${workspaceFolder}",
      "remoteRoot": "/app",
      "protocol": "inspector",
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

To enable debugging, modify the `docker-compose.dev.yml` command:

```yaml
command: node --inspect=0.0.0.0:9229 -r tsx/register src/index.ts
```

## Production Deployment

### Building for Production

```bash
# Build the production image
docker-compose build

# Or build manually
docker build -f Dockerfile.prod -t directory-cloner:latest .
```

### Starting Production Server

```bash
# Start in background
docker-compose up -d

# Check health
docker-compose ps
docker-compose exec api curl http://localhost:3000/health

# View logs
docker-compose logs -f api
```

### Production Configuration

Create a `.env.prod` file for production settings:

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=/data/content.db

# Security
CORS_ORIGIN=https://yourdomain.com
API_KEY_HEADER=X-API-Key

# Performance
MAX_FILE_SIZE=104857600
MAX_CONCURRENT_SYNCS=10
QUEUE_PROCESS_INTERVAL_MS=500

# Retry Configuration
MAX_RETRY_ATTEMPTS=5
RETRY_BACKOFF_MS=2000

# Logging
LOG_LEVEL=info
LOG_RETENTION_DAYS=90
```

Load it with:

```bash
docker-compose --env-file .env.prod up -d
```

### Data Persistence

Production data is stored in volumes:

```bash
# Create data directory on host
mkdir -p ./data
chmod 755 ./data

# Database will be stored in ./data/content.db
# Sync directories in ./sync-data
```

### Running Database Migrations

```bash
# Run migrations in production
docker-compose exec api node dist/db/migrate.js
```

### Backup and Restore

```bash
# Backup database
docker-compose exec api sqlite3 /data/content.db ".backup '/data/backup.db'"
docker cp directory-cloner-api:/data/backup.db ./backup-$(date +%Y%m%d).db

# Restore database
docker cp ./backup.db directory-cloner-api:/data/content.db
docker-compose restart api
```

## Multi-Server Setup

Test directory synchronization between multiple servers using Docker.

### Start Multiple Instances

```bash
# Start primary and replica servers
docker-compose --profile multi-server up -d

# Check both are running
docker-compose ps
```

This starts:
- **Primary Server**: `http://localhost:3000`
- **Replica Server**: `http://localhost:3001`

### Configure Server Sync

```bash
# Register servers with each other
# On primary, register replica
curl -X POST http://localhost:3000/api/servers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Replica Server",
    "url": "http://api-replica:3000"
  }'

# Save the returned API key
REPLICA_API_KEY="<api-key-from-response>"

# On replica, register primary
curl -X POST http://localhost:3001/api/servers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Primary Server",
    "url": "http://api:3000"
  }'

# Start syncing a directory
curl -X POST http://localhost:3000/api/sync/directories \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $REPLICA_API_KEY" \
  -d '{
    "localPath": "/sync-data/shared",
    "remoteServerId": 1,
    "remotePath": "/sync-data/shared",
    "isLeader": true
  }'
```

### Test Synchronization

```bash
# Create a file on primary
docker-compose exec api sh -c 'echo "test content" > /sync-data/shared/test.txt'

# Check it appears on replica (after a few seconds)
docker-compose exec api-replica cat /sync-data/shared/test.txt
```

## Configuration

### Environment Variables

All environment variables can be configured via `docker-compose.yml`:

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `production` | Environment mode |
| `PORT` | `3000` | Server port |
| `DATABASE_URL` | `/data/content.db` | SQLite database path |
| `API_PREFIX` | `/api` | API route prefix |
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed CORS origin |
| `MAX_FILE_SIZE` | `104857600` | Max file size (100MB) |
| `SYNC_DEBOUNCE_MS` | `100` | Filesystem event debounce |
| `MAX_CONCURRENT_SYNCS` | `5` | Parallel sync operations |
| `QUEUE_PROCESS_INTERVAL_MS` | `1000` | Queue processing interval |
| `MAX_RETRY_ATTEMPTS` | `3` | Max sync retry attempts |
| `RETRY_BACKOFF_MS` | `1000` | Initial retry backoff |
| `LOG_LEVEL` | `info` | Logging level |
| `LOG_RETENTION_DAYS` | `90` | Days to keep logs |

### Volume Mounts

#### Development Volumes

```yaml
volumes:
  - .:/app                      # Source code (hot reload)
  - node_modules:/app/node_modules  # Dependencies
  - ./content.db:/app/content.db    # Database
  - ./test-sync:/test-sync          # Test sync directory
```

#### Production Volumes

```yaml
volumes:
  - ./data:/data                # Persistent database
  - ./sync-data:/sync-data      # Sync directories
```

### Network Configuration

Containers communicate on a dedicated bridge network:

```yaml
networks:
  cloner-network:
    driver: bridge
```

For cross-host sync, use Docker Swarm or external network configuration.

## Troubleshooting

### Common Issues

#### Container Won't Start

```bash
# Check logs
docker-compose logs api

# Check if port is already in use
lsof -i :3000

# Remove old containers
docker-compose down -v
docker-compose up -d
```

#### Database Locked Error

```bash
# Stop all containers
docker-compose down

# Remove database lock files
rm -f ./data/*.db-shm ./data/*.db-wal

# Restart
docker-compose up -d
```

#### Permission Issues

```bash
# Fix data directory permissions
sudo chown -R 1001:1001 ./data ./sync-data

# Or run container as root (not recommended for production)
docker-compose run --user root api bash
```

#### Hot Reload Not Working (Development)

```bash
# Ensure source code is mounted correctly
docker-compose -f docker-compose.dev.yml down -v
docker-compose -f docker-compose.dev.yml up

# Check if tsx is watching files
docker-compose -f docker-compose.dev.yml logs dev | grep tsx
```

#### Can't Connect Between Containers

```bash
# Use service names, not localhost
# ✅ Correct: http://api:3000
# ❌ Wrong: http://localhost:3000

# Test connectivity
docker-compose exec api ping api-replica
docker-compose exec api curl http://api-replica:3000/health
```

### Debugging Commands

```bash
# Shell into running container
docker-compose exec api sh
docker-compose exec api bash

# Check running processes
docker-compose exec api ps aux

# Check disk usage
docker-compose exec api df -h

# Check node version
docker-compose exec api node --version

# Inspect container
docker inspect directory-cloner-api

# View resource usage
docker stats directory-cloner-api

# Rebuild without cache
docker-compose build --no-cache
```

### Health Checks

```bash
# Check health status
docker-compose ps

# Manual health check
curl http://localhost:3000/health

# Container health logs
docker inspect --format='{{json .State.Health}}' directory-cloner-api | jq
```

## Best Practices

### Security

1. **Don't Expose Server Management Endpoints**
   ```yaml
   # Use firewall or reverse proxy
   ports:
     - "127.0.0.1:3000:3000"  # Only localhost
   ```

2. **Use Secrets for API Keys**
   ```bash
   # Use Docker secrets or external secrets manager
   docker secret create api_key ./api_key.txt
   ```

3. **Run as Non-Root User**
   ```dockerfile
   # Already configured in Dockerfile.prod
   USER expressjs
   ```

4. **Enable HTTPS in Production**
   ```yaml
   # Use reverse proxy like Nginx or Traefik
   labels:
     - "traefik.enable=true"
     - "traefik.http.routers.api.tls=true"
   ```

### Performance

1. **Optimize Resource Limits**
   ```yaml
   deploy:
     resources:
       limits:
         cpus: '2'
         memory: 2G
       reservations:
         cpus: '1'
         memory: 512M
   ```

2. **Use Named Volumes for Better Performance**
   ```yaml
   volumes:
     - db-data:/data  # Named volume (faster than bind mount)
   ```

3. **Enable BuildKit**
   ```bash
   export DOCKER_BUILDKIT=1
   docker-compose build
   ```

### Monitoring

1. **Collect Logs**
   ```bash
   # Configure log rotation
   docker-compose logs -f --tail=100 api > logs/docker-$(date +%Y%m%d).log
   ```

2. **Monitor Health**
   ```bash
   # Create monitoring script
   watch -n 5 'docker-compose ps && curl -s http://localhost:3000/health | jq'
   ```

3. **Track Resource Usage**
   ```bash
   # Monitor in real-time
   docker stats directory-cloner-api
   ```

### Backup Strategy

```bash
# Automated backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
docker-compose exec -T api sqlite3 /data/content.db ".backup '/data/backup-${DATE}.db'"
docker cp directory-cloner-api:/data/backup-${DATE}.db ./backups/
find ./backups -name "backup-*.db" -mtime +7 -delete
```

### CI/CD Integration

```yaml
# Example GitHub Actions workflow
name: Docker Build
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Build Docker image
        run: docker build -f Dockerfile.prod -t directory-cloner:${{ github.sha }} .
      - name: Run tests
        run: docker run directory-cloner:${{ github.sha }} npm test
      - name: Push to registry
        run: docker push directory-cloner:${{ github.sha }}
```

## Advanced Topics

### Docker Swarm Deployment

```bash
# Initialize swarm
docker swarm init

# Deploy stack
docker stack deploy -c docker-compose.yml cloner

# Scale service
docker service scale cloner_api=3

# View services
docker service ls
```

### Kubernetes Deployment

See `k8s/` directory for Kubernetes manifests (if available), or convert:

```bash
# Convert docker-compose to k8s
kompose convert -f docker-compose.yml
```

### Custom Network Bridge

```bash
# Create custom bridge network
docker network create --driver bridge --subnet 172.20.0.0/16 cloner-net

# Use in docker-compose.yml
networks:
  cloner-network:
    external: true
    name: cloner-net
```

## Support

For issues, questions, or contributions:
- Check existing documentation: `README.md`, `CLAUDE.md`
- Review logs: `docker-compose logs -f`
- Check health: `curl http://localhost:3000/health`
- Inspect container: `docker-compose exec api bash`

## License

MIT License - see LICENSE file for details
