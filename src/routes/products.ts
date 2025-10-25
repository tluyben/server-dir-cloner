import { Router } from 'express';
import { z } from 'zod';
import { eq, desc, and, gte, lte, like } from 'drizzle-orm';
import { db, products } from '../db/index.js';
import { validate } from '../middleware/validation.js';
import { AppError } from '../middleware/error.js';

export const productsRouter = Router();

const createProductSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(200),
    description: z.string().optional(),
    price: z.number().positive(),
    stock: z.number().int().min(0),
    sku: z.string().min(1).max(50),
    category: z.string().optional(),
    active: z.boolean().optional(),
  }),
});

const updateProductSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().optional(),
    price: z.number().positive().optional(),
    stock: z.number().int().min(0).optional(),
    category: z.string().optional(),
    active: z.boolean().optional(),
  }),
  params: z.object({
    id: z.string().regex(/^\d+$/),
  }),
});

productsRouter.get('/', async (req, res, next) => {
  try {
    const conditions = [];

    if (req.query.active === 'true') {
      conditions.push(eq(products.active, true));
    } else if (req.query.active === 'false') {
      conditions.push(eq(products.active, false));
    }

    if (req.query.category) {
      conditions.push(eq(products.category, req.query.category as string));
    }

    if (req.query.minPrice) {
      conditions.push(gte(products.price, parseFloat(req.query.minPrice as string)));
    }

    if (req.query.maxPrice) {
      conditions.push(lte(products.price, parseFloat(req.query.maxPrice as string)));
    }

    if (req.query.search) {
      conditions.push(like(products.name, `%${req.query.search}%`));
    }

    const baseQuery = db.select().from(products);
    const finalQuery = conditions.length > 0 ? baseQuery.where(and(...conditions)) : baseQuery;

    const allProducts = await finalQuery.orderBy(desc(products.createdAt));
    res.json(allProducts);
  } catch (error) {
    next(error);
  }
});

productsRouter.get('/:id', async (req, res, next) => {
  try {
    const productId = parseInt(req.params.id, 10);
    const product = await db.select().from(products).where(eq(products.id, productId));

    if (product.length === 0) {
      throw new AppError(404, 'Product not found');
    }

    res.json(product[0]);
  } catch (error) {
    next(error);
  }
});

productsRouter.get('/sku/:sku', async (req, res, next) => {
  try {
    const product = await db.select().from(products).where(eq(products.sku, req.params.sku));

    if (product.length === 0) {
      throw new AppError(404, 'Product not found');
    }

    res.json(product[0]);
  } catch (error) {
    next(error);
  }
});

productsRouter.post('/', validate(createProductSchema), async (req, res, next) => {
  try {
    const newProduct = await db.insert(products).values(req.body).returning();
    res.status(201).json(newProduct[0]);
  } catch (error: any) {
    if (error?.message?.includes('UNIQUE constraint failed')) {
      next(new AppError(409, 'SKU already exists'));
    } else {
      next(error);
    }
  }
});

productsRouter.put('/:id', validate(updateProductSchema), async (req, res, next) => {
  try {
    const productId = parseInt(req.params.id, 10);
    const updatedProduct = await db
      .update(products)
      .set({
        ...req.body,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(products.id, productId))
      .returning();

    if (updatedProduct.length === 0) {
      throw new AppError(404, 'Product not found');
    }

    res.json(updatedProduct[0]);
  } catch (error) {
    next(error);
  }
});

productsRouter.patch('/:id/stock', async (req, res, next) => {
  try {
    const productId = parseInt(req.params.id, 10);
    const { quantity, operation } = req.body;

    if (typeof quantity !== 'number' || quantity <= 0) {
      throw new AppError(400, 'Invalid quantity');
    }

    if (!['add', 'subtract', 'set'].includes(operation)) {
      throw new AppError(400, 'Invalid operation. Use: add, subtract, or set');
    }

    const product = await db.select().from(products).where(eq(products.id, productId));

    if (product.length === 0) {
      throw new AppError(404, 'Product not found');
    }

    let newStock = product[0].stock;

    if (operation === 'add') {
      newStock += quantity;
    } else if (operation === 'subtract') {
      newStock -= quantity;
      if (newStock < 0) {
        throw new AppError(400, 'Insufficient stock');
      }
    } else {
      newStock = quantity;
    }

    const updatedProduct = await db
      .update(products)
      .set({
        stock: newStock,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(products.id, productId))
      .returning();

    res.json(updatedProduct[0]);
  } catch (error) {
    next(error);
  }
});

productsRouter.delete('/:id', async (req, res, next) => {
  try {
    const productId = parseInt(req.params.id, 10);
    const deletedProduct = await db.delete(products).where(eq(products.id, productId)).returning();

    if (deletedProduct.length === 0) {
      throw new AppError(404, 'Product not found');
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});
