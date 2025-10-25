import { describe, it, expect } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../app.js';
import { db, products } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { testData } from '../test/utils.js';

describe('Products API', () => {
  const app = createApp();

  describe('GET /api/products', () => {
    beforeEach(async () => {
      await db.insert(products).values([
        testData.product({ sku: 'PROD-1', price: 50, category: 'Electronics', active: true }),
        testData.product({ sku: 'PROD-2', price: 150, category: 'Gadgets', active: true }),
        testData.product({ sku: 'PROD-3', price: 200, category: 'Electronics', active: false }),
      ]);
    });

    it('should return all products', async () => {
      const response = await request(app).get('/api/products');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(3);
    });

    it('should filter by active status', async () => {
      const response = await request(app).get('/api/products?active=true');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body.every((p: any) => p.active === 1)).toBe(true);
    });

    it('should filter by category', async () => {
      const response = await request(app).get('/api/products?category=Electronics');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body.every((p: any) => p.category === 'Electronics')).toBe(true);
    });

    it('should filter by price range', async () => {
      const response = await request(app).get('/api/products?minPrice=100&maxPrice=200');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body.every((p: any) => p.price >= 100 && p.price <= 200)).toBe(true);
    });

    it('should search by name', async () => {
      await db.insert(products).values(
        testData.product({ sku: 'SEARCH-1', name: 'Special Widget' }),
      );

      const response = await request(app).get('/api/products?search=Widget');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toBe('Special Widget');
    });
  });

  describe('GET /api/products/:id', () => {
    it('should return product by id', async () => {
      const [product] = await db.insert(products).values(testData.product()).returning();

      const response = await request(app).get(`/api/products/${product.id}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id', product.id);
      expect(response.body).toHaveProperty('sku', product.sku);
    });

    it('should return 404 for non-existent product', async () => {
      const response = await request(app).get('/api/products/999');

      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe('Product not found');
    });
  });

  describe('GET /api/products/sku/:sku', () => {
    it('should return product by SKU', async () => {
      await db.insert(products).values(testData.product({ sku: 'UNIQUE-SKU' }));

      const response = await request(app).get('/api/products/sku/UNIQUE-SKU');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('sku', 'UNIQUE-SKU');
    });
  });

  describe('POST /api/products', () => {
    it('should create a new product', async () => {
      const productData = testData.product();

      const response = await request(app).post('/api/products').send(productData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('name', productData.name);
      expect(response.body).toHaveProperty('sku', productData.sku);
    });

    it('should return 409 for duplicate SKU', async () => {
      const productData = testData.product({ sku: 'DUP-SKU' });
      await db.insert(products).values(productData);

      const response = await request(app).post('/api/products').send(productData);

      expect(response.status).toBe(409);
      expect(response.body.error.message).toBe('SKU already exists');
    });

    it('should validate required fields', async () => {
      const response = await request(app).post('/api/products').send({ name: 'Test' });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('Validation error');
    });

    it('should validate price is positive', async () => {
      const productData = { ...testData.product(), price: -10 };

      const response = await request(app).post('/api/products').send(productData);

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('Validation error');
    });
  });

  describe('PUT /api/products/:id', () => {
    it('should update an existing product', async () => {
      const [product] = await db.insert(products).values(testData.product()).returning();

      const updateData = { name: 'Updated Product', price: 199.99 };
      const response = await request(app).put(`/api/products/${product.id}`).send(updateData);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('name', 'Updated Product');
      expect(response.body).toHaveProperty('price', 199.99);
    });

    it('should return 404 for non-existent product', async () => {
      const response = await request(app).put('/api/products/999').send({ name: 'Updated' });

      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe('Product not found');
    });
  });

  describe('PATCH /api/products/:id/stock', () => {
    let productId: number;

    beforeEach(async () => {
      const [product] = await db
        .insert(products)
        .values(testData.product({ stock: 100 }))
        .returning();
      productId = product.id;
    });

    it('should add to stock', async () => {
      const response = await request(app)
        .patch(`/api/products/${productId}/stock`)
        .send({ quantity: 50, operation: 'add' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('stock', 150);
    });

    it('should subtract from stock', async () => {
      const response = await request(app)
        .patch(`/api/products/${productId}/stock`)
        .send({ quantity: 30, operation: 'subtract' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('stock', 70);
    });

    it('should set stock to specific value', async () => {
      const response = await request(app)
        .patch(`/api/products/${productId}/stock`)
        .send({ quantity: 500, operation: 'set' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('stock', 500);
    });

    it('should return 400 for insufficient stock', async () => {
      const response = await request(app)
        .patch(`/api/products/${productId}/stock`)
        .send({ quantity: 150, operation: 'subtract' });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toBe('Insufficient stock');
    });

    it('should return 400 for invalid operation', async () => {
      const response = await request(app)
        .patch(`/api/products/${productId}/stock`)
        .send({ quantity: 10, operation: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toContain('Invalid operation');
    });

    it('should return 400 for invalid quantity', async () => {
      const response = await request(app)
        .patch(`/api/products/${productId}/stock`)
        .send({ quantity: -5, operation: 'add' });

      expect(response.status).toBe(400);
      expect(response.body.error.message).toBe('Invalid quantity');
    });
  });

  describe('DELETE /api/products/:id', () => {
    it('should delete an existing product', async () => {
      const [product] = await db.insert(products).values(testData.product()).returning();

      const response = await request(app).delete(`/api/products/${product.id}`);

      expect(response.status).toBe(204);

      // Verify product was deleted
      const deletedProduct = await db.select().from(products).where(eq(products.id, product.id));
      expect(deletedProduct).toHaveLength(0);
    });

    it('should return 404 for non-existent product', async () => {
      const response = await request(app).delete('/api/products/999');

      expect(response.status).toBe(404);
      expect(response.body.error.message).toBe('Product not found');
    });
  });
});