import type { Request, Response, NextFunction } from 'express';
import { AppError } from './error.js';
import { db, servers } from '../db/index.js';
import { eq } from 'drizzle-orm';

/**
 * Extended Request interface with authenticated server info
 */
export interface AuthenticatedRequest extends Request {
  authenticatedServer?: {
    id: number;
    serverId: string;
    name: string;
  };
}

/**
 * Middleware to authenticate requests using API key
 * Validates the X-API-Key header against registered servers
 */
export const authenticateApiKey = async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const apiKeyHeader = process.env.API_KEY_HEADER || 'X-API-Key';
    const apiKey = req.headers[apiKeyHeader.toLowerCase()] as string;

    if (!apiKey) {
      throw new AppError(401, `Missing ${apiKeyHeader} header`);
    }

    // Look up server by API key
    const [server] = await db.select().from(servers).where(eq(servers.apiKey, apiKey)).limit(1);

    if (!server) {
      throw new AppError(401, 'Invalid API key');
    }

    if (!server.active) {
      throw new AppError(403, 'Server is not active');
    }

    // Attach server info to request
    req.authenticatedServer = {
      id: server.id,
      serverId: server.serverId,
      name: server.name,
    };

    // Update last seen timestamp
    await db
      .update(servers)
      .set({
        lastSeen: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(servers.id, server.id));

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Optional authentication middleware
 * Attempts to authenticate but doesn't fail if no key is provided
 */
export const optionalAuth = async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const apiKeyHeader = process.env.API_KEY_HEADER || 'X-API-Key';
    const apiKey = req.headers[apiKeyHeader.toLowerCase()] as string;

    if (apiKey) {
      const [server] = await db.select().from(servers).where(eq(servers.apiKey, apiKey)).limit(1);

      if (server && server.active) {
        req.authenticatedServer = {
          id: server.id,
          serverId: server.serverId,
          name: server.name,
        };

        // Update last seen
        await db
          .update(servers)
          .set({
            lastSeen: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(servers.id, server.id));
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Generate a secure random API key
 */
export function generateApiKey(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto = require('node:crypto');
  return crypto.randomBytes(32).toString('hex');
}
