import type { RetryConfig } from '../types/sync.js';

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: parseInt(process.env.MAX_RETRY_ATTEMPTS || '3', 10),
  initialDelayMs: parseInt(process.env.RETRY_BACKOFF_MS || '1000', 10),
  maxDelayMs: 30000, // 30 seconds max
  backoffMultiplier: 2,
};

/**
 * Calculate delay for exponential backoff
 * @param attempt - Current attempt number (0-indexed)
 * @param config - Retry configuration
 * @returns Delay in milliseconds
 */
export function calculateBackoffDelay(attempt: number, config: RetryConfig): number {
  const delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
  return Math.min(delay, config.maxDelayMs);
}

/**
 * Sleep for a specified duration
 * @param ms - Milliseconds to sleep
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry an async operation with exponential backoff
 * @param operation - Async function to retry
 * @param config - Retry configuration
 * @returns Promise resolving to operation result
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on the last attempt
      if (attempt < config.maxAttempts - 1) {
        const delay = calculateBackoffDelay(attempt, config);
        console.log(
          `Retry attempt ${attempt + 1}/${config.maxAttempts} failed. Retrying in ${delay}ms...`,
        );
        await sleep(delay);
      }
    }
  }

  throw new Error(
    `Operation failed after ${config.maxAttempts} attempts. Last error: ${lastError?.message}`,
  );
}

/**
 * Check if an error is retryable
 * @param error - The error to check
 * @returns True if the error should trigger a retry
 */
export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  // Network errors are retryable
  const networkErrors = [
    'econnrefused',
    'econnreset',
    'etimedout',
    'enotfound',
    'enetunreach',
    'ehostunreach',
  ];

  if (networkErrors.some((err) => message.includes(err))) {
    return true;
  }

  // HTTP status codes that are retryable
  if ('statusCode' in error) {
    const statusCode = (error as { statusCode: number }).statusCode;
    // 408 Request Timeout, 429 Too Many Requests, 500-599 Server Errors
    return statusCode === 408 || statusCode === 429 || (statusCode >= 500 && statusCode < 600);
  }

  return false;
}

/**
 * Retry an operation only for retryable errors
 * @param operation - Async function to retry
 * @param config - Retry configuration
 * @returns Promise resolving to operation result
 */
export async function retryOnNetworkError<T>(
  operation: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Only retry if it's a retryable error
      if (!isRetryableError(error)) {
        throw lastError;
      }

      // Don't retry on the last attempt
      if (attempt < config.maxAttempts - 1) {
        const delay = calculateBackoffDelay(attempt, config);
        console.log(
          `Network error detected. Retry attempt ${attempt + 1}/${config.maxAttempts} in ${delay}ms...`,
        );
        await sleep(delay);
      }
    }
  }

  throw new Error(
    `Operation failed after ${config.maxAttempts} attempts. Last error: ${lastError?.message}`,
  );
}
