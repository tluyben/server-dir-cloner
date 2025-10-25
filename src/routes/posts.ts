import { Router } from 'express';
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { db, posts, users } from '../db/index.js';
import { validate } from '../middleware/validation.js';
import { AppError } from '../middleware/error.js';

export const postsRouter = Router();

const createPostSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(200),
    content: z.string().min(1),
    slug: z.string().min(1).max(200),
    authorId: z.number().int().positive(),
    published: z.boolean().optional(),
  }),
});

const updatePostSchema = z.object({
  body: z.object({
    title: z.string().min(1).max(200).optional(),
    content: z.string().min(1).optional(),
    slug: z.string().min(1).max(200).optional(),
    published: z.boolean().optional(),
  }),
  params: z.object({
    id: z.string().regex(/^\d+$/),
  }),
});

postsRouter.get('/', async (req, res, next) => {
  try {
    const publishedOnly = req.query.published === 'true';

    const query = publishedOnly
      ? db
          .select({
            post: posts,
            author: users,
          })
          .from(posts)
          .leftJoin(users, eq(posts.authorId, users.id))
          .where(eq(posts.published, true))
          .orderBy(desc(posts.createdAt))
      : db
          .select({
            post: posts,
            author: users,
          })
          .from(posts)
          .leftJoin(users, eq(posts.authorId, users.id))
          .orderBy(desc(posts.createdAt));

    const allPosts = await query;
    res.json(allPosts);
  } catch (error) {
    next(error);
  }
});

postsRouter.get('/slug/:slug', async (req, res, next) => {
  try {
    const post = await db
      .select({
        post: posts,
        author: users,
      })
      .from(posts)
      .leftJoin(users, eq(posts.authorId, users.id))
      .where(eq(posts.slug, req.params.slug));

    if (post.length === 0) {
      throw new AppError(404, 'Post not found');
    }

    res.json(post[0]);
  } catch (error) {
    next(error);
  }
});

postsRouter.get('/:id', async (req, res, next) => {
  try {
    const postId = parseInt(req.params.id, 10);
    const post = await db
      .select({
        post: posts,
        author: users,
      })
      .from(posts)
      .leftJoin(users, eq(posts.authorId, users.id))
      .where(eq(posts.id, postId));

    if (post.length === 0) {
      throw new AppError(404, 'Post not found');
    }

    res.json(post[0]);
  } catch (error) {
    next(error);
  }
});

postsRouter.post('/', validate(createPostSchema), async (req, res, next) => {
  try {
    const postData = {
      ...req.body,
      publishedAt: req.body.published ? new Date().toISOString() : null,
    };

    const newPost = await db.insert(posts).values(postData).returning();
    res.status(201).json(newPost[0]);
  } catch (error: any) {
    if (error?.message?.includes('UNIQUE constraint failed')) {
      next(new AppError(409, 'Slug already exists'));
    } else if (error?.message?.includes('FOREIGN KEY constraint failed')) {
      next(new AppError(400, 'Invalid author ID'));
    } else {
      next(error);
    }
  }
});

postsRouter.put('/:id', validate(updatePostSchema), async (req, res, next) => {
  try {
    const postId = parseInt(req.params.id, 10);

    const existingPost = await db.select().from(posts).where(eq(posts.id, postId));
    if (existingPost.length === 0) {
      throw new AppError(404, 'Post not found');
    }

    const updateData: any = {
      ...req.body,
      updatedAt: new Date().toISOString(),
    };

    if (req.body.published === true && !existingPost[0].published) {
      updateData.publishedAt = new Date().toISOString();
    } else if (req.body.published === false) {
      updateData.publishedAt = null;
    }

    const updatedPost = await db
      .update(posts)
      .set(updateData)
      .where(eq(posts.id, postId))
      .returning();

    res.json(updatedPost[0]);
  } catch (error) {
    next(error);
  }
});

postsRouter.delete('/:id', async (req, res, next) => {
  try {
    const postId = parseInt(req.params.id, 10);
    const deletedPost = await db.delete(posts).where(eq(posts.id, postId)).returning();

    if (deletedPost.length === 0) {
      throw new AppError(404, 'Post not found');
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
