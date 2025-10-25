# Express 5.1 API - LLM Guide

## Overview

This is an opinionated Express 5.1.0 API built with TypeScript, Drizzle ORM, and SQLite. The project follows modern best practices for API development with a focus on type safety, validation, and developer experience.

## Key Technical Details

### Stack

- **Runtime**: Node.js 18+ with ES modules
- **Framework**: Express 5.1.0
- **Language**: TypeScript 5.7 with strict mode
- **Database**: SQLite with Better-SQLite3 driver
- **ORM**: Drizzle ORM 0.38
- **Validation**: Zod 3.24
- **Development**: TSX for hot reload

### Database Location

**IMPORTANT**: The SQLite database is ALWAYS located at `./content.db` (relative to project root).

### File Structure

```
src/
├── db/
│   ├── index.ts      # Database connection, exports db instance and schema
│   ├── schema.ts     # Drizzle schema definitions (users, posts, products)
│   ├── migrate.ts    # Migration runner script
│   └── seed.ts       # Database seeder with sample data
├── middleware/
│   ├── error.ts      # AppError class and error handler middleware
│   ├── logger.ts     # Request logging middleware
│   └── validation.ts # Zod validation middleware factory
├── routes/
│   ├── index.ts      # Main API router
│   ├── users.ts      # User CRUD endpoints
│   ├── posts.ts      # Post CRUD endpoints with author relations
│   └── products.ts   # Product CRUD with stock management
└── index.ts          # Express app entry point
```

## Important Commands

### Development Workflow

```bash
npm run dev           # Start dev server with hot reload
npm run check        # Run all checks (TypeScript, ESLint, Prettier)
npm test             # Run all tests
npm run test:watch   # Run tests in watch mode
npm run db:migrate   # Apply database migrations
npm run db:studio    # Open Drizzle Studio GUI
```

### Database Operations

```bash
npm run db:generate  # Generate migrations from schema changes
npm run db:migrate   # Apply pending migrations
npm run db:push      # Push schema directly (dev only)
npx tsx src/db/seed.ts # Seed database with sample data
```

## Code Patterns and Conventions

### Error Handling

- Use `AppError` class for operational errors
- All routes wrapped in try-catch with `next(error)`
- Centralized error middleware handles responses

### Validation

- All input validated with Zod schemas
- Use `validate()` middleware in routes
- Schema validates body, params, and query together

### Database Queries

```typescript
// Import from db/index.ts
import { db, users, posts } from '../db/index.js';

// Use Drizzle query builder
const result = await db.select().from(users).where(eq(users.id, 1));

// Always use .returning() for mutations
const newUser = await db.insert(users).values(data).returning();
```

### Route Structure

```typescript
router.method('path', validate(schema), async (req, res, next) => {
  try {
    // Route logic
    res.json(result);
  } catch (error) {
    next(error); // Pass to error middleware
  }
});
```

## Common Tasks

### Adding a New Entity

1. Define schema in `src/db/schema.ts`
2. Export types (inferSelect/inferInsert)
3. Generate migration: `npm run db:generate`
4. Apply migration: `npm run db:migrate`
5. Create route file in `src/routes/`
6. Add validation schemas
7. Import and use in `src/routes/index.ts`
8. Write tests in `src/__tests__/`

### Modifying Schema

1. Update `src/db/schema.ts`
2. Run `npm run db:generate`
3. Review generated migration in `drizzle/` folder
4. Run `npm run db:migrate`

### Adding Middleware

1. Create file in `src/middleware/`
2. Export middleware function
3. Apply in `src/index.ts` or specific routes

## API Response Patterns

### Success Responses

- GET collection: `200` with array
- GET single: `200` with object
- POST: `201` with created object
- PUT/PATCH: `200` with updated object
- DELETE: `204` with no content

### Error Responses

```json
{
  "error": {
    "message": "Human readable error",
    "statusCode": 400,
    "stack": "..." // Only in development
  }
}
```

## Database Schema

### Users Table

- id: autoincrement primary key
- email: unique, required
- name: required
- createdAt/updatedAt: auto-managed timestamps

### Posts Table

- id: autoincrement primary key
- title, content, slug: required
- authorId: foreign key to users
- published: boolean flag
- publishedAt: nullable timestamp
- createdAt/updatedAt: auto-managed

### Products Table

- id: autoincrement primary key
- name, price, stock, sku: required
- description, category: optional
- active: boolean flag
- createdAt/updatedAt: auto-managed

## Testing the API

### Quick Test Commands

```bash
# Health check
curl http://localhost:3000/health

# Get all users
curl http://localhost:3000/api/users

# Create a user
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","name":"Test User"}'

# Get products with filters
curl "http://localhost:3000/api/products?active=true&minPrice=10&maxPrice=100"
```

## Environment Variables

- PORT: Server port (default: 3000)
- NODE_ENV: development/production
- DATABASE_URL: Path to SQLite file (./content.db)
- CORS_ORIGIN: Allowed origin for CORS

## Testing

### Test Structure
- Tests are in `src/__tests__/` directory
- Test setup in `src/test/setup.ts`
- Test utilities in `src/test/utils.ts`
- Separate test database (`test.db`) is used

### Writing Tests
```typescript
// Import from @jest/globals for ESM
import { describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../app.js';

describe('Feature', () => {
  const app = createApp();
  
  it('should test behavior', async () => {
    const response = await request(app)
      .get('/api/endpoint')
      .expect(200);
    
    expect(response.body).toHaveProperty('field');
  });
});
```

### Test Data Factories
```typescript
import { testData } from '../test/utils.js';

const user = testData.user({ email: 'custom@test.com' });
const post = testData.post(userId, { title: 'Custom Title' });
const product = testData.product({ sku: 'TEST-SKU' });
```

## Notes for LLMs

1. **Always use `.js` extension in imports** due to ES modules
2. **Database is always at `./content.db`** - never change this path (test database at `./test.db`)
3. **Use returning() on all mutations** for Drizzle ORM
4. **Validate all inputs** with Zod before processing
5. **Handle foreign key constraints** in error responses
6. **Use transactions** for multi-table operations
7. **Never expose stack traces** in production
8. **Follow existing patterns** in the codebase
9. **Write tests for all new endpoints** using Jest and Supertest
10. **Use test data factories** for consistent test data

## Common Issues and Solutions

### Migration Fails

- Check schema syntax
- Ensure database file is writable
- Review migration SQL in drizzle/ folder

### TypeScript Errors

- Run `npm run check` to see all issues
- Ensure all imports use `.js` extension
- Check tsconfig.json settings

### Database Locked

- Close Drizzle Studio if running
- Check for hanging connections
- Restart dev server

### UNIQUE Constraint Failed

- Check for duplicate values
- Add proper error handling for 409 Conflict
- Validate uniqueness before insert
