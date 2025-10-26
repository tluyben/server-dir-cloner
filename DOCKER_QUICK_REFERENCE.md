# Docker Quick Reference - Directory Cloner API

Quick command reference for common Docker operations.

## Quick Start Commands

### Development

```bash
# Start development server
docker-compose -f docker-compose.dev.yml up

# Start in background
docker-compose -f docker-compose.dev.yml up -d

# Stop
docker-compose -f docker-compose.dev.yml down

# Restart
docker-compose -f docker-compose.dev.yml restart
```

### Production

```bash
# Build and start
docker-compose up -d

# Stop
docker-compose down

# Rebuild
docker-compose build --no-cache
docker-compose up -d
```

## Common Operations

### View Logs

```bash
# Follow all logs
docker-compose logs -f

# Specific service
docker-compose logs -f api

# Last 100 lines
docker-compose logs --tail=100 api

# Development
docker-compose -f docker-compose.dev.yml logs -f dev
```

### Execute Commands

```bash
# Shell access
docker-compose exec api sh
docker-compose exec api bash  # if bash available

# Run npm commands
docker-compose exec api npm run db:migrate
docker-compose exec api npm test
docker-compose exec api npm run create-api-key

# Development
docker-compose -f docker-compose.dev.yml exec dev npm run db:migrate
```

### Database Operations

```bash
# Run migrations
docker-compose exec api node dist/db/migrate.js

# Seed database
docker-compose -f docker-compose.dev.yml exec dev npx tsx src/db/seed.ts

# Backup database
docker-compose exec api sqlite3 /data/content.db ".backup '/data/backup.db'"
docker cp directory-cloner-api:/data/backup.db ./backup-$(date +%Y%m%d).db

# Open SQLite shell
docker-compose exec api sqlite3 /data/content.db
```

### Health & Status

```bash
# Check container status
docker-compose ps

# Health check
curl http://localhost:3000/health

# Container stats
docker stats directory-cloner-api

# Inspect container
docker inspect directory-cloner-api
```

### Cleanup

```bash
# Stop and remove containers
docker-compose down

# Stop and remove volumes
docker-compose down -v

# Remove all (including images)
docker-compose down -v --rmi all

# Prune unused Docker resources
docker system prune -a
```

## Multi-Server Setup

```bash
# Start both servers
docker-compose --profile multi-server up -d

# Check status
docker-compose ps

# Logs for specific server
docker-compose logs -f api
docker-compose logs -f api-replica

# Shell access
docker-compose exec api sh
docker-compose exec api-replica sh
```

## Troubleshooting

### Container won't start

```bash
# Check logs
docker-compose logs api

# Remove and recreate
docker-compose down -v
docker-compose up -d

# Rebuild without cache
docker-compose build --no-cache
```

### Port already in use

```bash
# Find process using port
lsof -i :3000

# Kill process
kill -9 <PID>

# Or change port in docker-compose.yml
ports:
  - "3001:3000"
```

### Database locked

```bash
# Stop containers
docker-compose down

# Remove lock files
rm -f ./data/*.db-shm ./data/*.db-wal

# Restart
docker-compose up -d
```

### Permission errors

```bash
# Fix ownership (Linux/Mac)
sudo chown -R $(id -u):$(id -g) ./data ./sync-data

# Or run as root (not recommended)
docker-compose run --user root api bash
```

## File Locations

### Development

- **Source Code**: `./` (mounted to `/app`)
- **Database**: `./content.db` (mounted to `/app/content.db`)
- **Node Modules**: `node_modules` named volume
- **Test Sync**: `./test-sync` (mounted to `/test-sync`)

### Production

- **Database**: `./data/content.db` (mounted to `/data/content.db`)
- **Sync Data**: `./sync-data` (mounted to `/sync-data`)
- **Logs**: `docker-compose logs`

## Environment Variables

Override in `docker-compose.yml` or use `.env` file:

```bash
# Create .env file
cat > .env << EOF
PORT=3000
NODE_ENV=production
DATABASE_URL=/data/content.db
LOG_LEVEL=info
EOF

# Use with docker-compose
docker-compose --env-file .env up -d
```

## Docker Commands Cheat Sheet

```bash
# Images
docker images                    # List images
docker build -t name:tag .      # Build image
docker rmi image-id             # Remove image

# Containers
docker ps                       # List running containers
docker ps -a                    # List all containers
docker stop container-id        # Stop container
docker rm container-id          # Remove container
docker exec -it container sh    # Shell access

# Volumes
docker volume ls                # List volumes
docker volume rm volume-name    # Remove volume
docker volume prune             # Remove unused volumes

# Networks
docker network ls               # List networks
docker network inspect name     # Inspect network

# System
docker system df                # Disk usage
docker system prune -a          # Remove all unused resources
```

## See Also

- **[DOCKER.md](./DOCKER.md)** - Complete Docker documentation
- **[README.md](./README.md)** - Project overview
- **[CLAUDE.md](./CLAUDE.md)** - Development guide
