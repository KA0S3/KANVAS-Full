import { rateLimitService, RateLimitResult } from './rateLimitService';
import { performanceMonitor } from '@/utils/performanceMonitor';

export enum OperationPriority {
  CRITICAL = 0,    // User data saves, conflict resolution
  HIGH = 1,       // Asset operations, sync operations
  NORMAL = 2,     // Viewport changes, background updates
  LOW = 3,        // Analytics, non-essential operations
  BULK = 4        // Batch operations, bulk uploads
}

export interface SmartRateLimitOptions {
  userId: string;
  ipAddress?: string;
  operationType: 'api' | 'auth' | 'upload';
  priority: OperationPriority;
  uploadSizeMB?: number;
  operationName?: string; // For better error messages
  retryOnRateLimit?: boolean;
  maxRetries?: number;
  onWarning?: (message: string) => void;
  onError?: (message: string) => void;
  onRetry?: (attempt: number, maxRetries: number) => void;
}

interface QueuedOperation {
  id: string;
  priority: OperationPriority;
  execute: () => Promise<any>;
  options: SmartRateLimitOptions;
  attempts: number;
  lastAttempt: number;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}

export class SmartRateLimitMiddleware {
  private static operationQueue: QueuedOperation[] = [];
  private static isProcessing = false;
  private static readonly RETRY_DELAYS = [1000, 2000, 4000, 8000]; // Exponential backoff
  private static readonly MAX_QUEUE_SIZE = 1000;

  /**
   * Execute operation with smart rate limiting and priority queuing
   */
  static async withSmartRateLimit<T>(
    options: SmartRateLimitOptions,
    operation: () => Promise<T>
  ): Promise<T> {
    // Check if operation can be executed immediately
    const canExecuteImmediately = await this.canExecuteImmediately(options);
    
    if (canExecuteImmediately) {
      return this.executeWithRetry(options, operation);
    }

    // Queue the operation if rate limited
    return this.queueOperation(options, operation);
  }

  /**
   * Check if operation can be executed immediately based on priority and rate limits
   */
  private static async canExecuteImmediately(options: SmartRateLimitOptions): Promise<boolean> {
    // Critical operations always try to execute immediately
    if (options.priority === OperationPriority.CRITICAL) {
      return true;
    }

    // Check if there are higher priority operations in queue
    const hasHigherPriorityInQueue = this.operationQueue.some(
      op => op.priority < options.priority
    );
    
    if (hasHigherPriorityInQueue) {
      return false;
    }

    // Check rate limits
    const rateLimitResult = await this.checkRateLimit(options);
    return rateLimitResult.allowed;
  }

  /**
   * Execute operation with retry logic
   */
  private static async executeWithRetry<T>(
    options: SmartRateLimitOptions,
    operation: () => Promise<T>
  ): Promise<T> {
    const maxRetries = options.maxRetries ?? 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Check rate limit before each attempt
        const rateLimitResult = await this.checkRateLimit(options);
        
        if (!rateLimitResult.allowed) {
          if (attempt === maxRetries || !options.retryOnRateLimit) {
            throw this.createRateLimitError(rateLimitResult, options.operationName);
          }

          // Wait and retry
          const delay = this.RETRY_DELAYS[Math.min(attempt, this.RETRY_DELAYS.length - 1)];
          options.onRetry?.(attempt, maxRetries);
          await this.sleep(delay);
          continue;
        }

        // Handle warnings
        if (rateLimitResult.warning && options.onWarning) {
          options.onWarning(rateLimitResult.warning);
        }

        // Execute the operation
        performanceMonitor.incrementDatabaseRequests();
        const result = await operation();
        return result;

      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on non-rate-limit errors unless explicitly configured
        if (!(error as any).rateLimitExceeded || !options.retryOnRateLimit) {
          throw error;
        }

        // If this is the last attempt, throw the error
        if (attempt === maxRetries) {
          throw error;
        }

        // Wait and retry
        const delay = this.RETRY_DELAYS[Math.min(attempt, this.RETRY_DELAYS.length - 1)];
        options.onRetry?.(attempt, maxRetries);
        await this.sleep(delay);
      }
    }

    // This should never be reached, but TypeScript needs it
    throw lastError || new Error('Operation failed');
  }

  /**
   * Queue operation for later execution
   */
  private static async queueOperation<T>(
    options: SmartRateLimitOptions,
    operation: () => Promise<T>
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      // Check queue size limit
      if (this.operationQueue.length >= this.MAX_QUEUE_SIZE) {
        reject(new Error('Operation queue is full. Please try again later.'));
        return;
      }

      const queuedOp: QueuedOperation = {
        id: this.generateOperationId(),
        priority: options.priority,
        execute: operation,
        options,
        attempts: 0,
        lastAttempt: 0,
        resolve,
        reject
      };

      // Insert in priority order (lower priority number = higher priority)
      const insertIndex = this.operationQueue.findIndex(
        op => op.priority > queuedOp.priority
      );
      
      if (insertIndex === -1) {
        this.operationQueue.push(queuedOp);
      } else {
        this.operationQueue.splice(insertIndex, 0, queuedOp);
      }

      // Start processing queue if not already running
      this.processQueue();
    });
  }

  /**
   * Process queued operations
   */
  private static async processQueue(): Promise<void> {
    if (this.isProcessing || this.operationQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.operationQueue.length > 0) {
      const operation = this.operationQueue[0];
      
      try {
        // Check if operation can be executed now
        const canExecute = await this.canExecuteImmediately(operation.options);
        
        if (!canExecute) {
          // Wait a bit and try again
          await this.sleep(100);
          continue;
        }

        // Remove from queue and execute
        this.operationQueue.shift();
        
        const result = await this.executeWithRetry(operation.options, operation.execute);
        operation.resolve(result);

      } catch (error) {
        operation.reject(error as Error);
      }
    }

    this.isProcessing = false;
  }

  /**
   * Check rate limit for operation
   */
  private static async checkRateLimit(options: SmartRateLimitOptions): Promise<RateLimitResult> {
    switch (options.operationType) {
      case 'api':
        return rateLimitService.checkApiRequest(options.userId, options.ipAddress);
      case 'auth':
        return rateLimitService.checkAuthRequest(options.userId, options.ipAddress);
      case 'upload':
        if (!options.uploadSizeMB) {
          throw new Error('Upload size is required for upload operations');
        }
        return rateLimitService.checkUploadRequest(
          options.userId, 
          options.uploadSizeMB, 
          options.ipAddress
        );
      default:
        throw new Error(`Unsupported operation type: ${options.operationType}`);
    }
  }

  /**
   * Create rate limit error with enhanced information
   */
  private static createRateLimitError(
    rateLimitResult: RateLimitResult,
    operationName?: string
  ): Error {
    const message = operationName 
      ? `Rate limit exceeded for ${operationName}: ${rateLimitResult.error || 'Too many requests'}`
      : rateLimitResult.error || 'Rate limit exceeded';
    
    const error = new Error(message);
    (error as any).rateLimitExceeded = true;
    (error as any).rateLimitStatus = rateLimitResult.status;
    
    return error;
  }

  /**
   * Generate unique operation ID
   */
  private static generateOperationId(): string {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Sleep utility
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get queue statistics for monitoring
   */
  static getQueueStats(): {
    queueSize: number;
    isProcessing: boolean;
    priorityBreakdown: Record<OperationPriority, number>;
  } {
    const priorityBreakdown: Record<OperationPriority, number> = {
      [OperationPriority.CRITICAL]: 0,
      [OperationPriority.HIGH]: 0,
      [OperationPriority.NORMAL]: 0,
      [OperationPriority.LOW]: 0,
      [OperationPriority.BULK]: 0
    };

    this.operationQueue.forEach(op => {
      priorityBreakdown[op.priority]++;
    });

    return {
      queueSize: this.operationQueue.length,
      isProcessing: this.isProcessing,
      priorityBreakdown
    };
  }

  /**
   * Clear queue (for cleanup on logout, etc.)
   */
  static clearQueue(): void {
    // Reject all pending operations
    this.operationQueue.forEach(op => {
      op.reject(new Error('Operation cancelled due to queue clear'));
    });
    
    this.operationQueue = [];
    this.isProcessing = false;
  }
}

// Convenience functions for different priority levels
export const withCriticalRateLimit = <T>(
  userId: string,
  operation: () => Promise<T>,
  options?: Omit<SmartRateLimitOptions, 'priority' | 'userId'>
) => {
  return SmartRateLimitMiddleware.withSmartRateLimit({
    userId,
    priority: OperationPriority.CRITICAL,
    retryOnRateLimit: true,
    maxRetries: 5,
    ...options
  }, operation);
};

export const withHighPriorityRateLimit = <T>(
  userId: string,
  operation: () => Promise<T>,
  options?: Omit<SmartRateLimitOptions, 'priority' | 'userId'>
) => {
  return SmartRateLimitMiddleware.withSmartRateLimit({
    userId,
    priority: OperationPriority.HIGH,
    retryOnRateLimit: true,
    maxRetries: 3,
    ...options
  }, operation);
};

export const withNormalRateLimit = <T>(
  userId: string,
  operation: () => Promise<T>,
  options?: Omit<SmartRateLimitOptions, 'priority' | 'userId'>
) => {
  return SmartRateLimitMiddleware.withSmartRateLimit({
    userId,
    priority: OperationPriority.NORMAL,
    retryOnRateLimit: false,
    maxRetries: 1,
    ...options
  }, operation);
};

export const withLowPriorityRateLimit = <T>(
  userId: string,
  operation: () => Promise<T>,
  options?: Omit<SmartRateLimitOptions, 'priority' | 'userId'>
) => {
  return SmartRateLimitMiddleware.withSmartRateLimit({
    userId,
    priority: OperationPriority.LOW,
    retryOnRateLimit: false,
    maxRetries: 1,
    ...options
  }, operation);
};

export const withBulkRateLimit = <T>(
  userId: string,
  operation: () => Promise<T>,
  options?: Omit<SmartRateLimitOptions, 'priority' | 'userId'>
) => {
  return SmartRateLimitMiddleware.withSmartRateLimit({
    userId,
    priority: OperationPriority.BULK,
    retryOnRateLimit: false,
    maxRetries: 1,
    ...options
  }, operation);
};
