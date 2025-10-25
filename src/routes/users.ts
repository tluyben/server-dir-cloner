import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, users } from '../db/index.js';
import { validate } from '../middleware/validation.js';
import { AppError } from '../middleware/error.js';

export const usersRouter = Router();

const createUserSchema = z.object({
  body: z.object({
    email: z.string().email(),
    name: z.string().min(1).max(100),
  }),
});

const updateUserSchema = z.object({
  body: z.object({
    email: z.string().email().optional(),
    name: z.string().min(1).max(100).optional(),
  }),
  params: z.object({
    id: z.string().regex(/^\d+$/),
  }),
});

usersRouter.get('/', async (_req, res, next) => {
  try {
    const allUsers = await db.select().from(users);
    res.json(allUsers);
  } catch (error) {
    next(error);
  }
});

usersRouter.get('/:id', async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const user = await db.select().from(users).where(eq(users.id, userId));

    if (user.length === 0) {
      throw new AppError(404, 'User not found');
    }

    res.json(user[0]);
  } catch (error) {
    next(error);
  }
});

usersRouter.post('/', validate(createUserSchema), async (req, res, next) => {
  try {
    const newUser = await db.insert(users).values(req.body).returning();
    res.status(201).json(newUser[0]);
  } catch (error: any) {
    if (error?.message?.includes('UNIQUE constraint failed')) {
      next(new AppError(409, 'Email already exists'));
    } else {
      next(error);
    }
  }
});

usersRouter.put('/:id', validate(updateUserSchema), async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const updatedUser = await db
      .update(users)
      .set({
        ...req.body,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, userId))
      .returning();

    if (updatedUser.length === 0) {
      throw new AppError(404, 'User not found');
    }

    res.json(updatedUser[0]);
  } catch (error) {
    next(error);
  }
});

usersRouter.delete('/:id', async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const deletedUser = await db.delete(users).where(eq(users.id, userId)).returning();

    if (deletedUser.length === 0) {
      throw new AppError(404, 'User not found');
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
