# Development Dockerfile for Express 5.1 API with Directory Cloner
# Multi-stage build for efficient caching and smaller final image

FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies needed for native modules (better-sqlite3, chokidar)
RUN apk add --no-cache \
    libc6-compat \
    python3 \
    make \
    g++ \
    bash \
    sqlite

# Development stage
FROM base AS development

ENV NODE_ENV=development

# Copy package files for dependency installation
COPY package*.json ./

# Install all dependencies (including dev dependencies)
RUN npm ci

# Copy source code
COPY . .

# Create data directory for SQLite database
RUN mkdir -p /app/data

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))" || exit 1

# Start development server with hot reload
CMD ["npm", "run", "dev"]
