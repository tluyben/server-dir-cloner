import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from './error.js';

export const validate = (schema: z.ZodSchema) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessage = error.errors
          .map((err) => `${err.path.join('.')}: ${err.message}`)
          .join(', ');
        next(new AppError(400, `Validation error: ${errorMessage}`));
      } else {
        next(error);
      }
    }
  };
};
