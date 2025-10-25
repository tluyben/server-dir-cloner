import { Router } from 'express';
import { usersRouter } from './users.js';
import { postsRouter } from './posts.js';
import { productsRouter } from './products.js';

export const apiRouter = Router();

apiRouter.get('/', (_req, res) => {
  res.json({
    message: 'Express API v1.0.0',
    endpoints: {
      users: '/api/users',
      posts: '/api/posts',
      products: '/api/products',
    },
  });
});

apiRouter.use('/users', usersRouter);
apiRouter.use('/posts', postsRouter);
apiRouter.use('/products', productsRouter);
