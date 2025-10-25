import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../app.js';

describe('Validation Middleware', () => {
  const app = createApp();

  describe('User validation', () => {
    it('should reject invalid email format', async () => {
      const response = await request(app)
        .post('/api/users')
        .send({ email: 'not-an-email', name: 'Test' });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('Validation error');
      expect(response.body.error.message).toContain('email');
    });

    it('should reject empty name', async () => {
      const response = await request(app)
        .post('/api/users')
        .send({ email: 'test@example.com', name: '' });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('Validation error');
    });

    it('should reject missing required fields', async () => {
      const response = await request(app).post('/api/users').send({});

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('Validation error');
    });
  });

  describe('Post validation', () => {
    it('should reject empty title', async () => {
      const response = await request(app).post('/api/posts').send({
        title: '',
        content: 'Content',
        slug: 'slug',
        authorId: 1,
      });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('Validation error');
    });

    it('should reject non-integer authorId', async () => {
      const response = await request(app).post('/api/posts').send({
        title: 'Title',
        content: 'Content',
        slug: 'slug',
        authorId: 'not-a-number',
      });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('Validation error');
    });

    it('should accept optional published field', async () => {
      const response = await request(app).post('/api/posts').send({
        title: 'Title',
        content: 'Content',
        slug: 'unique-slug-' + Date.now(),
        authorId: 1,
        // published field omitted
      });

      // Will fail with invalid author, but validation passes
      expect(response.status).toBe(400);
      expect(response.body.error.message).toBe('Invalid author ID');
    });
  });

  describe('Product validation', () => {
    it('should reject negative price', async () => {
      const response = await request(app).post('/api/products').send({
        name: 'Product',
        price: -10,
        stock: 10,
        sku: 'SKU-001',
      });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('Validation error');
    });

    it('should reject negative stock', async () => {
      const response = await request(app).post('/api/products').send({
        name: 'Product',
        price: 10,
        stock: -5,
        sku: 'SKU-001',
      });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('Validation error');
    });

    it('should accept optional fields', async () => {
      const response = await request(app).post('/api/products').send({
        name: 'Product',
        price: 99.99,
        stock: 10,
        sku: 'SKU-' + Date.now(),
        // description, category, active omitted
      });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('description', null);
      expect(response.body).toHaveProperty('category', null);
      expect(response.body).toHaveProperty('active', 1);
    });
  });

  describe('ID parameter validation', () => {
    it('should reject non-numeric ID in URL', async () => {
      const response = await request(app).get('/api/users/abc');

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('Validation error');
    });

    it('should accept numeric ID in URL', async () => {
      const response = await request(app).get('/api/users/123');

      // Will return 404 but validation passes
      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe('User not found');
    });
  });
});