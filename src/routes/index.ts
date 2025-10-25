import { Router } from 'express';
import { usersRouter } from './users.js';
import { postsRouter } from './posts.js';
import { productsRouter } from './products.js';
import { syncRouter } from './sync.js';
import { serversRouter } from './servers.js';

export const apiRouter = Router();

apiRouter.get('/', (_req, res) => {
  res.json({
    message: 'Directory Cloner API v1.0.0',
    endpoints: {
      users: '/api/users',
      posts: '/api/posts',
      products: '/api/products',
      sync: '/api/sync',
      servers: '/api/servers',
    },
  });
});

apiRouter.use('/users', usersRouter);
apiRouter.use('/posts', postsRouter);
apiRouter.use('/products', productsRouter);
apiRouter.use('/sync', syncRouter);
apiRouter.use('/servers', serversRouter);
