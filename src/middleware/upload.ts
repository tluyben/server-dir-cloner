import multer from 'multer';
import { tmpdir } from 'os';
import { AppError } from './error.js';

/**
 * Configure multer for file uploads
 * Files are temporarily stored in memory for sync operations
 */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    // Use system temp directory
    cb(null, tmpdir());
  },
  filename: (_req, file, cb) => {
    // Generate unique filename
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `sync-${uniqueSuffix}-${file.originalname}`);
  },
});

/**
 * File filter to validate uploads
 */
const fileFilter = (
  _req: Express.Request,
  _file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  // Note: We can't reliably check size here, so we rely on multer limits
  // and post-processing validation

  cb(null, true);
};

/**
 * Configure multer limits
 */
const limits = {
  fileSize: parseInt(process.env.MAX_FILE_SIZE || '104857600', 10), // 100MB default
  files: 1, // Only one file per sync operation
};

/**
 * Multer upload middleware configured for sync operations
 */
export const upload = multer({
  storage,
  fileFilter,
  limits,
});

/**
 * Error handler for multer errors
 */
export const handleMulterError = (
  err: unknown,
  _req: Express.Request,
  _res: Express.Response,
  next: (error?: unknown) => void,
) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(
        new AppError(
          413,
          `File too large. Maximum size is ${Math.round(limits.fileSize / 1024 / 1024)}MB`,
        ),
      );
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return next(new AppError(400, 'Too many files. Only one file per request is allowed'));
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return next(new AppError(400, 'Unexpected field in upload'));
    }
    return next(new AppError(400, `Upload error: ${err.message}`));
  }
  next(err);
};

/**
 * Memory storage for small files (alternative configuration)
 */
const memoryStorage = multer.memoryStorage();

export const uploadToMemory = multer({
  storage: memoryStorage,
  fileFilter,
  limits: {
    ...limits,
    fileSize: 10485760, // 10MB limit for memory uploads
  },
});
