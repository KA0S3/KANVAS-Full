/**
 * Async operation timeout utilities
 * Provides timeout wrapping and error handling for async operations
 */

export class AsyncTimeoutError extends Error {
  constructor(operation: string, timeout: number) {
    super(`Operation "${operation}" timed out after ${timeout}ms`);
    this.name = 'AsyncTimeoutError';
  }
}

/**
 * Wraps a promise with a timeout
 * @param promise The promise to wrap
 * @param timeoutMs Timeout in milliseconds
 * @param operationName Name of the operation for error reporting
 * @returns Promise that rejects with AsyncTimeoutError if timeout is reached
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string = 'async operation'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new AsyncTimeoutError(operationName, timeoutMs));
      }, timeoutMs);
      
      // Clear timeout if promise resolves/rejects first
      promise.finally(() => {
        clearTimeout(timeoutId);
      });
    })
  ]);
}

/**
 * Default timeout configurations for different operation types
 */
export const DEFAULT_TIMEOUTS = {
  DATABASE: 10000,      // 10 seconds for database operations
  NETWORK: 30000,       // 30 seconds for network requests
  STORAGE: 5000,        // 5 seconds for local storage operations
  RENDERING: 8000,      // 8 seconds for UI rendering
  ANIMATION: 3000,      // 3 seconds for animations
} as const;

/**
 * Creates a timeout wrapper for database operations
 */
export function withDatabaseTimeout<T>(
  promise: Promise<T>,
  operationName: string = 'database operation'
): Promise<T> {
  return withTimeout(promise, DEFAULT_TIMEOUTS.DATABASE, operationName);
}

/**
 * Creates a timeout wrapper for network operations
 */
export function withNetworkTimeout<T>(
  promise: Promise<T>,
  operationName: string = 'network operation'
): Promise<T> {
  return withTimeout(promise, DEFAULT_TIMEOUTS.NETWORK, operationName);
}

/**
 * Creates a timeout wrapper for storage operations
 */
export function withStorageTimeout<T>(
  promise: Promise<T>,
  operationName: string = 'storage operation'
): Promise<T> {
  return withTimeout(promise, DEFAULT_TIMEOUTS.STORAGE, operationName);
}

/**
 * Creates a timeout wrapper for UI rendering operations
 */
export function withRenderingTimeout<T>(
  promise: Promise<T>,
  operationName: string = 'rendering operation'
): Promise<T> {
  return withTimeout(promise, DEFAULT_TIMEOUTS.RENDERING, operationName);
}

/**
 * Retry wrapper with exponential backoff and timeout
 * @param operation Async operation to retry
 * @param maxAttempts Maximum number of retry attempts
 * @param baseDelay Base delay in milliseconds
 * @param maxDelay Maximum delay in milliseconds
 * @param timeoutMs Timeout per attempt
 * @param operationName Name for error reporting
 */
export async function withRetryAndTimeout<T>(
  operation: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelay: number = 1000,
  maxDelay: number = 10000,
  timeoutMs: number = DEFAULT_TIMEOUTS.DATABASE,
  operationName: string = 'operation'
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await withTimeout(operation(), timeoutMs, `${operationName} (attempt ${attempt})`);
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on certain errors
      if (error instanceof AsyncTimeoutError) {
        throw error;
      }
      
      if (isNonRetryableError(error)) {
        throw error;
      }
      
      // If this is the last attempt, throw the error
      if (attempt === maxAttempts) {
        throw new Error(`${operationName} failed after ${maxAttempts} attempts. Last error: ${lastError.message}`);
      }
      
      // Calculate exponential backoff delay
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

/**
 * Determines if an error should not be retried
 */
function isNonRetryableError(error: Error): boolean {
  // Don't retry on authentication errors, validation errors, etc.
  const nonRetryablePatterns = [
    'unauthorized',
    'forbidden',
    'invalid',
    'not found',
    'bad request',
    'authentication',
    'permission denied'
  ];
  
  const message = error.message.toLowerCase();
  return nonRetryablePatterns.some(pattern => message.includes(pattern));
}

/**
 * Creates a cancellable async operation
 */
export function makeCancellable<T>(
  operation: () => Promise<T>,
  onCancel?: () => void
): { promise: Promise<T>; cancel: () => void } {
  let isCancelled = false;
  let timeoutId: number;
  
  const promise = new Promise<T>((resolve, reject) => {
    const execute = async () => {
      try {
        if (isCancelled) {
          reject(new Error('Operation was cancelled'));
          return;
        }
        
        const result = await operation();
        if (!isCancelled) {
          resolve(result);
        }
      } catch (error) {
        if (!isCancelled) {
          reject(error);
        }
      }
    };
    
    execute();
  });
  
  const cancel = () => {
    if (!isCancelled) {
      isCancelled = true;
      if (onCancel) {
        onCancel();
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  };
  
  return { promise, cancel };
}
