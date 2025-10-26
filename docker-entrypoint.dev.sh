#!/bin/bash
set -e

echo "🚀 Starting development Express 5.1 API..."

# Ensure database directory exists
mkdir -p /app/data

# Check if database exists, if not, create it
if [ ! -f "/app/content.db" ]; then
  echo "📦 Database not found, will be created on first run"
  touch /app/content.db
fi

echo "✅ Database configured: ${DATABASE_URL:-/app/content.db}"

# Run database migrations
if [ -f "./src/db/migrate.ts" ]; then
  echo "🔄 Running database migrations..."
  npx tsx ./src/db/migrate.ts || echo "⚠️  Migrations not needed or already applied"
fi

# Optional: Seed database in development
if [ "${SEED_DB}" = "true" ] && [ -f "./src/db/seed.ts" ]; then
  echo "🌱 Seeding database..."
  npx tsx ./src/db/seed.ts || echo "⚠️  Seeding failed or already seeded"
fi

echo "🎯 Starting development server with hot reload..."
echo "📝 Access API at http://localhost:${PORT:-3000}/api"
echo "🏥 Health check at http://localhost:${PORT:-3000}/health"

# Execute the main command (npm run dev)
exec "$@"
