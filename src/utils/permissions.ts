import { chmod, chown, utimes } from 'fs/promises';

/**
 * Apply file permissions to a file or directory
 * @param filePath - Absolute path to the file or directory
 * @param mode - Unix file mode (permissions) as a number
 * @returns Promise that resolves when permissions are applied
 */
export async function applyFilePermissions(filePath: string, mode: number): Promise<void> {
  try {
    await chmod(filePath, mode);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to apply permissions to ${filePath}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Apply file ownership to a file or directory
 * @param filePath - Absolute path to the file or directory
 * @param uid - Owner user ID
 * @param gid - Owner group ID
 * @returns Promise that resolves when ownership is applied
 */
export async function applyFileOwnership(
  filePath: string,
  uid: number,
  gid: number,
): Promise<void> {
  try {
    await chown(filePath, uid, gid);
  } catch (error) {
    if (error instanceof Error) {
      // Check for permission errors
      if ('code' in error && (error.code === 'EPERM' || error.code === 'EACCES')) {
        throw new Error(
          `Permission denied when setting ownership on ${filePath}. ` +
            `Process must run as root or with CAP_CHOWN capability to change file ownership.`,
        );
      }
      throw new Error(`Failed to apply ownership to ${filePath}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Apply file modification time
 * @param filePath - Absolute path to the file or directory
 * @param mtime - Modification time as Date or timestamp
 * @returns Promise that resolves when modification time is set
 */
export async function applyFileTimestamp(filePath: string, mtime: Date | string): Promise<void> {
  try {
    const mtimeDate = typeof mtime === 'string' ? new Date(mtime) : mtime;
    // Set both atime and mtime to the same value
    await utimes(filePath, mtimeDate, mtimeDate);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to apply timestamp to ${filePath}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Apply complete file metadata (permissions, ownership, and timestamp)
 * @param filePath - Absolute path to the file or directory
 * @param metadata - File metadata to apply
 * @param options - Options for what metadata to apply
 * @returns Promise that resolves when all metadata is applied
 */
export async function applyFileMetadata(
  filePath: string,
  metadata: {
    mode?: number;
    uid?: number;
    gid?: number;
    mtime?: Date | string;
  },
  options: {
    applyPermissions?: boolean;
    applyOwnership?: boolean;
    applyTimestamp?: boolean;
  } = {
    applyPermissions: true,
    applyOwnership: true,
    applyTimestamp: true,
  },
): Promise<{
  permissionsApplied: boolean;
  ownershipApplied: boolean;
  timestampApplied: boolean;
  errors: string[];
}> {
  const result = {
    permissionsApplied: false,
    ownershipApplied: false,
    timestampApplied: false,
    errors: [] as string[],
  };

  // Apply permissions
  if (options.applyPermissions && metadata.mode !== undefined) {
    try {
      await applyFilePermissions(filePath, metadata.mode);
      result.permissionsApplied = true;
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  // Apply ownership (only if both uid and gid are provided)
  if (options.applyOwnership && metadata.uid !== undefined && metadata.gid !== undefined) {
    try {
      await applyFileOwnership(filePath, metadata.uid, metadata.gid);
      result.ownershipApplied = true;
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  // Apply timestamp
  if (options.applyTimestamp && metadata.mtime !== undefined) {
    try {
      await applyFileTimestamp(filePath, metadata.mtime);
      result.timestampApplied = true;
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  return result;
}

/**
 * Check if the current process has permission to change file ownership
 * @returns True if process is running as root or has CAP_CHOWN capability
 */
export function canChangeOwnership(): boolean {
  return process.getuid !== undefined && process.getuid() === 0;
}

/**
 * Format file mode as octal string for display
 * @param mode - Unix file mode as number
 * @returns Octal string representation (e.g., "0644")
 */
export function formatFileMode(mode: number): string {
  // Extract just the permission bits (last 12 bits)
  const permissions = mode & 0o7777;
  return `0${permissions.toString(8)}`;
}

/**
 * Parse octal permission string to number
 * @param octalString - Octal string (e.g., "0644" or "644")
 * @returns File mode as number
 */
export function parseFileMode(octalString: string): number {
  // Remove leading "0" if present and parse as octal
  const cleanString = octalString.startsWith('0') ? octalString.slice(1) : octalString;
  return parseInt(cleanString, 8);
}
