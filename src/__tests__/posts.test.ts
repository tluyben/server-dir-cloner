import { describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../app.js';
import { db, users, posts } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { testData } from '../test/utils.js';

describe('Posts API', () => {
  const app = createApp();
  let testUserId: number;

  beforeEach(async () => {
    // Create a test user for posts
    const [user] = await db.insert(users).values(testData.user()).returning();
    testUserId = user.id;
  });

  describe('GET /api/posts', () => {
    it('should return all posts with author info', async () => {
      await db.insert(posts).values([
        testData.post(testUserId, { slug: 'post-1', published: true }),
        testData.post(testUserId, { slug: 'post-2', published: false }),
      ]);

      const response = await request(app).get('/api/posts');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toHaveProperty('post');
      expect(response.body[0]).toHaveProperty('author');
      expect(response.body[0].author).toHaveProperty('email', 'test@example.com');
    });

    it('should filter by published status', async () => {
      await db.insert(posts).values([
        testData.post(testUserId, { slug: 'published', published: true }),
        testData.post(testUserId, { slug: 'draft', published: false }),
      ]);

      const response = await request(app).get('/api/posts?published=true');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].post.published).toBe(1);
    });
  });

  describe('GET /api/posts/:id', () => {
    it('should return post by id with author', async () => {
      const [post] = await db.insert(posts).values(testData.post(testUserId)).returning();

      const response = await request(app).get(`/api/posts/${post.id}`);

      expect(response.status).toBe(200);
      expect(response.body.post).toHaveProperty('id', post.id);
      expect(response.body.author).toHaveProperty('id', testUserId);
    });

    it('should return 404 for non-existent post', async () => {
      const response = await request(app).get('/api/posts/999');

      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe('Post not found');
    });
  });

  describe('GET /api/posts/slug/:slug', () => {
    it('should return post by slug', async () => {
      const [post] = await db
        .insert(posts)
        .values(testData.post(testUserId, { slug: 'unique-slug' }))
        .returning();

      const response = await request(app).get('/api/posts/slug/unique-slug');

      expect(response.status).toBe(200);
      expect(response.body.post).toHaveProperty('slug', 'unique-slug');
    });

    it('should return 404 for non-existent slug', async () => {
      const response = await request(app).get('/api/posts/slug/non-existent');

      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe('Post not found');
    });
  });

  describe('POST /api/posts', () => {
    it('should create a new post', async () => {
      const postData = {
        title: 'New Post',
        content: 'Post content',
        slug: 'new-post',
        authorId: testUserId,
        published: true,
      };

      const response = await request(app).post('/api/posts').send(postData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('title', postData.title);
      expect(response.body).toHaveProperty('publishedAt');
    });

    it('should return 409 for duplicate slug', async () => {
      const postData = testData.post(testUserId, { slug: 'duplicate' });
      await db.insert(posts).values(postData);

      const response = await request(app).post('/api/posts').send(postData);

      expect(response.status).toBe(409);
      expect(response.body.error.message).toBe('Slug already exists');
    });

    it('should return 400 for invalid author', async () => {
      const postData = testData.post(999);

      const response = await request(app).post('/api/posts').send(postData);

      expect(response.status).toBe(400);
      expect(response.body.error.message).toBe('Invalid author ID');
    });
  });

  describe('PUT /api/posts/:id', () => {
    it('should update an existing post', async () => {
      const [post] = await db.insert(posts).values(testData.post(testUserId)).returning();

      const updateData = { title: 'Updated Title', published: true };
      const response = await request(app).put(`/api/posts/${post.id}`).send(updateData);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('title', 'Updated Title');
      expect(response.body).toHaveProperty('published', 1);
      expect(response.body).toHaveProperty('publishedAt');
    });

    it('should return 404 for non-existent post', async () => {
      const response = await request(app).put('/api/posts/999').send({ title: 'Updated' });

      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe('Post not found');
    });
  });

  describe('DELETE /api/posts/:id', () => {
    it('should delete an existing post', async () => {
      const [post] = await db.insert(posts).values(testData.post(testUserId)).returning();

      const response = await request(app).delete(`/api/posts/${post.id}`);

      expect(response.status).toBe(204);

      // Verify post was deleted
      const deletedPost = await db.select().from(posts).where(eq(posts.id, post.id));
      expect(deletedPost).toHaveLength(0);
    });

    it('should cascade delete when user is deleted', async () => {
      const [post] = await db.insert(posts).values(testData.post(testUserId)).returning();

      // Delete the user
      await db.delete(users).where(eq(users.id, testUserId));

      // Verify post was also deleted
      const deletedPost = await db.select().from(posts).where(eq(posts.id, post.id));
      expect(deletedPost).toHaveLength(0);
    });
  });
});