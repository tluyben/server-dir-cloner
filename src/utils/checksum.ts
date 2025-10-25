import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';

/**
 * Calculate SHA256 checksum of a file
 * @param filePath - Absolute path to the file
 * @returns Promise resolving to checksum string in format "sha256:hash"
 */
export async function calculateFileChecksum(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);

    stream.on('data', (chunk) => {
      hash.update(chunk);
    });

    stream.on('end', () => {
      const checksum = hash.digest('hex');
      resolve(`sha256:${checksum}`);
    });

    stream.on('error', (error) => {
      reject(new Error(`Failed to calculate checksum: ${error.message}`));
    });
  });
}

/**
 * Calculate SHA256 checksum of a buffer
 * @param buffer - Buffer containing file data
 * @returns Checksum string in format "sha256:hash"
 */
export function calculateBufferChecksum(buffer: Buffer): string {
  const hash = createHash('sha256');
  hash.update(buffer);
  return `sha256:${hash.digest('hex')}`;
}

/**
 * Verify that a file's checksum matches the expected value
 * @param filePath - Absolute path to the file
 * @param expectedChecksum - Expected checksum in format "sha256:hash"
 * @returns Promise resolving to true if checksums match
 */
export async function verifyFileChecksum(
  filePath: string,
  expectedChecksum: string,
): Promise<boolean> {
  const actualChecksum = await calculateFileChecksum(filePath);
  return actualChecksum === expectedChecksum;
}

/**
 * Get file metadata including size and checksum
 * @param filePath - Absolute path to the file
 * @returns Promise resolving to file metadata
 */
export async function getFileMetadata(filePath: string): Promise<{
  size: number;
  checksum: string;
  mtime: Date;
}> {
  const stats = await stat(filePath);

  if (!stats.isFile()) {
    throw new Error('Path is not a file');
  }

  const checksum = await calculateFileChecksum(filePath);

  return {
    size: stats.size,
    checksum,
    mtime: stats.mtime,
  };
}

/**
 * Extract hash from checksum string
 * @param checksum - Checksum in format "sha256:hash"
 * @returns Just the hash portion
 */
export function extractHash(checksum: string): string {
  const parts = checksum.split(':');
  return parts.length === 2 ? parts[1] : checksum;
}

/**
 * Check if two checksums match
 * @param checksum1 - First checksum
 * @param checksum2 - Second checksum
 * @returns True if checksums match
 */
export function checksumsMatch(checksum1: string, checksum2: string): boolean {
  return extractHash(checksum1) === extractHash(checksum2);
}
