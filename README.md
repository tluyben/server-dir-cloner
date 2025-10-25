# Express 5.1 API Starter

A modern, opinionated Express 5.1.0 API starter with TypeScript, Drizzle ORM, and SQLite.

## Features

- **Express 5.1.0** - Latest version of Express framework
- **TypeScript** - Full type safety and modern JavaScript features
- **Drizzle ORM** - Type-safe database queries with SQLite
- **Zod Validation** - Runtime type checking for API requests
- **Helmet & CORS** - Security best practices out of the box
- **Hot Reload** - Development server with automatic restarts
- **ESLint & Prettier** - Code quality and formatting tools

## Quick Start

```bash
# Install dependencies
npm install

# Setup environment variables
cp .env.example .env

# Generate database migrations
npm run db:generate

# Run migrations
npm run db:migrate

# (Optional) Seed the database
npx tsx src/db/seed.ts

# Start development server
npm run dev
```

The API will be available at `http://localhost:3000`

### Getting Your First API Key

To use sync features, you need an API key:

```bash
# In another terminal (while API is running)
npm run create-api-key
```

**See [QUICK_START_API_KEYS.md](./QUICK_START_API_KEYS.md) for a 30-second guide to API keys.**

## Project Structure

```
├── src/
│   ├── db/              # Database configuration and schema
│   │   ├── index.ts     # Database connection
│   │   ├── schema.ts    # Drizzle schema definitions
│   │   ├── migrate.ts   # Migration runner
│   │   └── seed.ts      # Database seeder
│   ├── middleware/      # Express middleware
│   │   ├── error.ts     # Error handling middleware
│   │   ├── logger.ts    # Request logging
│   │   └── validation.ts # Zod validation middleware
│   ├── routes/          # API route handlers
│   │   ├── index.ts     # Main router
│   │   ├── users.ts     # User endpoints
│   │   ├── posts.ts     # Post endpoints
│   │   └── products.ts  # Product endpoints
│   └── index.ts         # Application entry point
├── drizzle/             # Generated migrations
├── content.db           # SQLite database file
└── package.json         # Dependencies and scripts
```

## Available Scripts

| Script                  | Description                                 |
| ----------------------- | ------------------------------------------- |
| `npm run dev`           | Start development server with hot reload    |
| `npm run build`         | Compile TypeScript to JavaScript            |
| `npm start`             | Run production server                       |
| `npm run check`         | Run TypeScript, ESLint, and Prettier checks |
| `npm run lint`          | Fix ESLint issues                           |
| `npm run format`        | Format code with Prettier                   |
| `npm run db:generate`   | Generate Drizzle migrations                 |
| `npm run db:migrate`    | Run database migrations                     |
| `npm run db:push`       | Push schema changes directly (dev only)     |
| `npm run db:studio`     | Open Drizzle Studio GUI                     |
| `npm test`              | Run all tests with Jest                     |
| `npm run test:watch`    | Run tests in watch mode                     |
| `npm run test:coverage` | Run tests with coverage report              |

## API Endpoints

### Health Check

- `GET /health` - Server health status

### Servers (API Key Management)

- `POST /api/servers` - Register a new server and get API key
- `GET /api/servers` - List all registered servers
- `GET /api/servers/:id` - Get server details
- `PUT /api/servers/:id` - Update server configuration
- `DELETE /api/servers/:id` - Delete server
- `POST /api/servers/:id/ping` - Test server connection

**See [API_KEY_GUIDE.md](./API_KEY_GUIDE.md) for detailed API key management instructions.**

### Sync Directories (Requires API Key)

- `POST /api/sync/directories` - Create sync directory
- `GET /api/sync/directories` - List all sync directories
- `PUT /api/sync/directories/:id` - Update sync directory
- `DELETE /api/sync/directories/:id` - Delete sync directory

**See [SYNC_GUIDE.md](./SYNC_GUIDE.md) for directory synchronization guide.**

### Users

- `GET /api/users` - List all users
- `GET /api/users/:id` - Get user by ID
- `POST /api/users` - Create new user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### Posts

- `GET /api/posts` - List all posts (query: `?published=true`)
- `GET /api/posts/:id` - Get post by ID
- `GET /api/posts/slug/:slug` - Get post by slug
- `POST /api/posts` - Create new post
- `PUT /api/posts/:id` - Update post
- `DELETE /api/posts/:id` - Delete post

### Products

- `GET /api/products` - List products with filters
  - Query params: `active`, `category`, `minPrice`, `maxPrice`, `search`
- `GET /api/products/:id` - Get product by ID
- `GET /api/products/sku/:sku` - Get product by SKU
- `POST /api/products` - Create new product
- `PUT /api/products/:id` - Update product
- `PATCH /api/products/:id/stock` - Update product stock
- `DELETE /api/products/:id` - Delete product

## Database Management

The database is stored in `./content.db` (SQLite file).

### Creating Migrations

1. Modify your schema in `src/db/schema.ts`
2. Generate migration: `npm run db:generate`
3. Apply migration: `npm run db:migrate`

### Drizzle Studio

View and manage your database with a GUI:

```bash
npm run db:studio
```

## Environment Variables

Create a `.env` file based on `.env.example`:

```env
PORT=3000
NODE_ENV=development
DATABASE_URL=./content.db
API_PREFIX=/api
CORS_ORIGIN=http://localhost:3000
```

## Error Handling

The API uses a centralized error handling middleware that provides consistent error responses:

```json
{
  "error": {
    "message": "Error message",
    "statusCode": 400,
    "stack": "..." // Only in development
  }
}
```

## Request Validation

Request validation is handled by Zod schemas. Invalid requests return a 400 status with validation errors:

```json
{
  "error": {
    "message": "Validation error: body.email: Invalid email",
    "statusCode": 400
  }
}
```

## Production Deployment

1. Build the application:

   ```bash
   npm run build
   ```

2. Set environment variables:

   ```bash
   export NODE_ENV=production
   export PORT=3000
   ```

3. Run the server:
   ```bash
   npm start
   ```

## Testing

The project includes comprehensive API tests using Jest and Supertest.

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Writing Tests

Tests are located in `src/__tests__/` directory. Example test structure:

```typescript
import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../app.js';

describe('API Endpoint', () => {
  const app = createApp();

  it('should perform expected behavior', async () => {
    const response = await request(app).get('/api/endpoint').expect(200);

    expect(response.body).toHaveProperty('expected');
  });
});
```

### Test Utilities

- `src/test/setup.ts` - Test database setup and teardown
- `src/test/utils.ts` - Test data factories and helpers
- Uses separate `test.db` database for isolation

## Security

- **Helmet** - Sets various HTTP headers for security
- **CORS** - Configurable cross-origin resource sharing
- **Input Validation** - All inputs validated with Zod
- **SQL Injection Protection** - Parameterized queries via Drizzle ORM

## License

MIT
