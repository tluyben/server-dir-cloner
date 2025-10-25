import { resolve, normalize, relative } from 'path';
import { existsSync, statSync, accessSync, constants } from 'fs';
import { AppError } from '../middleware/error.js';

/**
 * Get allowed base paths from environment or use defaults
 */
function getAllowedBasePaths(): string[] {
  const envPaths = process.env.ALLOWED_BASE_PATHS;
  if (envPaths) {
    return envPaths.split(',').map((p) => p.trim());
  }
  // Default allowed paths
  return ['/home', '/var/data', '/tmp'];
}

/**
 * Validates and sanitizes a file path
 * - Prevents path traversal attacks
 * - Ensures path is within allowed directories
 * - Checks if path exists and is accessible
 */
export function validatePath(inputPath: string, mustExist = true): string {
  // Normalize and resolve path
  const sanitizedPath = normalize(resolve(inputPath));

  // Check for path traversal attempts
  if (inputPath.includes('..')) {
    throw new AppError(400, 'Path traversal is not allowed');
  }

  // Check if path is within allowed base paths
  const allowedPaths = getAllowedBasePaths();
  const isAllowed = allowedPaths.some((basePath) => {
    const resolvedBase = resolve(basePath);
    return sanitizedPath === resolvedBase || sanitizedPath.startsWith(resolvedBase + '/');
  });

  if (!isAllowed) {
    throw new AppError(403, `Path is not within allowed directories: ${allowedPaths.join(', ')}`);
  }

  // Check if path exists (if required)
  if (mustExist && !existsSync(sanitizedPath)) {
    throw new AppError(404, `Path does not exist: ${sanitizedPath}`);
  }

  // Check read/write permissions
  if (existsSync(sanitizedPath)) {
    try {
      accessSync(sanitizedPath, constants.R_OK | constants.W_OK);
    } catch {
      throw new AppError(403, `Insufficient permissions for path: ${sanitizedPath}`);
    }
  }

  return sanitizedPath;
}

/**
 * Validates that a path is a directory
 */
export function validateDirectory(inputPath: string, mustExist = true): string {
  const sanitizedPath = validatePath(inputPath, mustExist);

  if (existsSync(sanitizedPath)) {
    const stats = statSync(sanitizedPath);
    if (!stats.isDirectory()) {
      throw new AppError(400, `Path is not a directory: ${sanitizedPath}`);
    }
  }

  return sanitizedPath;
}

/**
 * Get relative path from base directory
 * Ensures the result stays within the base directory
 */
export function getRelativePath(basePath: string, fullPath: string): string {
  const normalizedBase = normalize(resolve(basePath));
  const normalizedFull = normalize(resolve(fullPath));

  // Ensure fullPath is within basePath
  if (!normalizedFull.startsWith(normalizedBase)) {
    throw new AppError(400, 'Path is outside of base directory');
  }

  const relativePath = relative(normalizedBase, normalizedFull);

  // Double-check for path traversal
  if (relativePath.startsWith('..')) {
    throw new AppError(400, 'Invalid relative path');
  }

  return relativePath;
}

/**
 * Check if a file/directory should be ignored
 * Common patterns like .git, node_modules, etc.
 */
export function shouldIgnorePath(path: string): boolean {
  const ignorePatterns = [
    '.git',
    'node_modules',
    '.DS_Store',
    'Thumbs.db',
    '.env',
    '.env.local',
    '*.swp',
    '*.tmp',
    '*.log',
    '__pycache__',
    '.pytest_cache',
    '.vscode',
    '.idea',
  ];

  return ignorePatterns.some((pattern) => {
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace('*', '.*'));
      return regex.test(path);
    }
    return path.includes(pattern);
  });
}

/**
 * Validate file size is within limits
 */
export function validateFileSize(sizeInBytes: number): void {
  const maxFileSize = parseInt(process.env.MAX_FILE_SIZE || '104857600', 10); // 100MB default

  if (sizeInBytes > maxFileSize) {
    throw new AppError(
      413,
      `File size ${sizeInBytes} bytes exceeds maximum allowed size of ${maxFileSize} bytes`,
    );
  }
}
