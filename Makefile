# Makefile for Directory Cloner Docker Management
# Provides convenient shortcuts for common Docker operations

.PHONY: help dev dev-build dev-up dev-down dev-logs dev-shell prod prod-build prod-up prod-down prod-logs prod-shell multi-server clean test backup

# Default target
help:
	@echo "Directory Cloner - Docker Management"
	@echo ""
	@echo "Development Commands:"
	@echo "  make dev         - Start development environment"
	@echo "  make dev-build   - Build development image"
	@echo "  make dev-up      - Start dev in background"
	@echo "  make dev-down    - Stop development environment"
	@echo "  make dev-logs    - Follow development logs"
	@echo "  make dev-shell   - Open shell in dev container"
	@echo ""
	@echo "Production Commands:"
	@echo "  make prod        - Start production environment"
	@echo "  make prod-build  - Build production image"
	@echo "  make prod-up     - Start prod in background"
	@echo "  make prod-down   - Stop production environment"
	@echo "  make prod-logs   - Follow production logs"
	@echo "  make prod-shell  - Open shell in prod container"
	@echo ""
	@echo "Multi-Server Commands:"
	@echo "  make multi-server - Start multi-server setup"
	@echo ""
	@echo "Utility Commands:"
	@echo "  make clean       - Remove all containers and volumes"
	@echo "  make test        - Run tests in container"
	@echo "  make backup      - Backup production database"
	@echo "  make migrate     - Run database migrations"
	@echo ""

# Development
dev:
	docker-compose -f docker-compose.dev.yml up

dev-build:
	docker-compose -f docker-compose.dev.yml build

dev-up:
	docker-compose -f docker-compose.dev.yml up -d

dev-down:
	docker-compose -f docker-compose.dev.yml down

dev-logs:
	docker-compose -f docker-compose.dev.yml logs -f

dev-shell:
	docker-compose -f docker-compose.dev.yml exec dev sh

# Production
prod:
	docker-compose up

prod-build:
	docker-compose build --no-cache

prod-up:
	docker-compose up -d

prod-down:
	docker-compose down

prod-logs:
	docker-compose logs -f api

prod-shell:
	docker-compose exec api sh

# Multi-server
multi-server:
	docker-compose --profile multi-server up -d
	@echo ""
	@echo "Multi-server setup started:"
	@echo "  Primary: http://localhost:3000"
	@echo "  Replica: http://localhost:3001"

# Utilities
clean:
	docker-compose -f docker-compose.dev.yml down -v
	docker-compose down -v
	docker system prune -f
	@echo "Cleaned up Docker resources"

test:
	docker-compose -f docker-compose.dev.yml exec dev npm test

migrate:
	docker-compose exec api npm run db:migrate

backup:
	@mkdir -p backups
	@BACKUP_FILE="backups/backup-$$(date +%Y%m%d_%H%M%S).db"; \
	docker-compose exec -T api sqlite3 /data/content.db ".backup '/data/backup.db'" && \
	docker cp directory-cloner-api:/data/backup.db $$BACKUP_FILE && \
	echo "Database backed up to $$BACKUP_FILE"

# API Key management
create-key:
	docker-compose -f docker-compose.dev.yml exec dev npm run create-api-key

# Status
status:
	@echo "=== Docker Containers ==="
	@docker-compose ps 2>/dev/null || echo "No production containers running"
	@docker-compose -f docker-compose.dev.yml ps 2>/dev/null || echo "No dev containers running"
	@echo ""
	@echo "=== Health Check ==="
	@curl -s http://localhost:3000/health 2>/dev/null | jq . || echo "API not responding on port 3000"
