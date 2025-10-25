import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../app.js';
import { db, users } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { testData } from '../test/utils.js';

describe('Users API', () => {
  const app = createApp();

  describe('GET /api/users', () => {
    it('should return empty array when no users exist', async () => {
      const response = await request(app).get('/api/users');

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should return all users', async () => {
      // Insert test users
      await db
        .insert(users)
        .values([
          testData.user({ email: 'user1@test.com', name: 'User 1' }),
          testData.user({ email: 'user2@test.com', name: 'User 2' }),
        ]);

      const response = await request(app).get('/api/users');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toHaveProperty('email', 'user1@test.com');
      expect(response.body[1]).toHaveProperty('email', 'user2@test.com');
    });
  });

  describe('GET /api/users/:id', () => {
    it('should return 404 for non-existent user', async () => {
      const response = await request(app).get('/api/users/999');

      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe('User not found');
    });

    it('should return user by id', async () => {
      const [user] = await db.insert(users).values(testData.user()).returning();

      const response = await request(app).get(`/api/users/${user.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', user.id);
      expect(response.body).toHaveProperty('email', user.email);
      expect(response.body).toHaveProperty('name', user.name);
    });
  });

  describe('POST /api/users', () => {
    it('should create a new user', async () => {
      const userData = testData.user();

      const response = await request(app).post('/api/users').send(userData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('email', userData.email);
      expect(response.body).toHaveProperty('name', userData.name);

      // Verify user was created in database
      const createdUser = await db.select().from(users).where(eq(users.id, response.body.id));
      expect(createdUser).toHaveLength(1);
    });

    it('should return 400 for invalid email', async () => {
      const response = await request(app)
        .post('/api/users')
        .send({ email: 'invalid-email', name: 'Test User' });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('Validation error');
    });

    it('should return 409 for duplicate email', async () => {
      const userData = testData.user();
      await db.insert(users).values(userData);

      const response = await request(app).post('/api/users').send(userData);

      expect(response.status).toBe(409);
      expect(response.body.error.message).toBe('Email already exists');
    });

    it('should validate required fields', async () => {
      const response = await request(app).post('/api/users').send({});

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('Validation error');
    });
  });

  describe('PUT /api/users/:id', () => {
    it('should update an existing user', async () => {
      const [user] = await db.insert(users).values(testData.user()).returning();

      const updateData = { name: 'Updated Name' };
      const response = await request(app).put(`/api/users/${user.id}`).send(updateData);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('name', 'Updated Name');
      expect(response.body).toHaveProperty('email', user.email);
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app).put('/api/users/999').send({ name: 'Updated Name' });

      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe('User not found');
    });
  });

  describe('DELETE /api/users/:id', () => {
    it('should delete an existing user', async () => {
      const [user] = await db.insert(users).values(testData.user()).returning();

      const response = await request(app).delete(`/api/users/${user.id}`);

      expect(response.status).toBe(204);

      // Verify user was deleted
      const deletedUser = await db.select().from(users).where(eq(users.id, user.id));
      expect(deletedUser).toHaveLength(0);
    });

    it('should return 404 for non-existent user', async () => {
      const response = await request(app).delete('/api/users/999');

      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe('User not found');
    });
  });
});
