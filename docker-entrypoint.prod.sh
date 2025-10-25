#!/bin/bash
set -e

echo "🚀 Starting production Express 5.1 API..."

# Check if /data is mounted
if [ ! -d "/data" ]; then
  echo "❌ Error: /data directory not mounted!"
  exit 1
fi

# Initialize production database
if [ ! -f "/data/content.prod.db" ]; then
  echo "📦 Production database not found at /data/content.prod.db"

  if [ -f "/data/content.db" ]; then
    echo "📋 Copying existing database from /data/content.db to /data/content.prod.db"
    cp /data/content.db /data/content.prod.db
  else
    echo "⚠️  No existing database found. Production database will be created on first run."
    # Touch the file so migrations can run
    touch /data/content.prod.db
  fi
fi

# Ensure DATABASE_URL points to production database
export DATABASE_URL="file:/data/content.prod.db"

echo "✅ Database configured: $DATABASE_URL"

# Run database migrations (in case there are pending migrations)
if [ -f "./dist/db/migrate.js" ]; then
  echo "🔄 Running database migrations..."
  node ./dist/db/migrate.js || echo "⚠️  Migration script failed or not needed"
fi

echo "🎯 Starting Express API server..."

# Execute the main command
exec "$@"
