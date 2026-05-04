import { rateLimitService, RateLimitResult } from './rateLimitService';
import { performanceMonitor } from '@/utils/performanceMonitor';

export interface RateLimitMiddlewareOptions {
  userId: string;
  ipAddress?: string;
  operationType: 'api' | 'auth' | 'upload';
  uploadSizeMB?: number;
  onWarning?: (message: string) => void;
  onError?: (message: string) => void;
}

export class RateLimitMiddleware {
  // Wrapper for API requests
  static async withRateLimit<T>(
    options: RateLimitMiddlewareOptions,
    operation: () => Promise<T>
  ): Promise<T> {
    // Check rate limit before operation
    let rateLimitResult: RateLimitResult;
    
    switch (options.operationType) {
      case 'api':
        rateLimitResult = rateLimitService.checkApiRequest(options.userId, options.ipAddress);
        break;
      case 'auth':
        rateLimitResult = rateLimitService.checkAuthRequest(options.userId, options.ipAddress);
        break;
      case 'upload':
        if (!options.uploadSizeMB) {
          throw new Error('Upload size is required for upload operations');
        }
        rateLimitResult = rateLimitService.checkUploadRequest(
          options.userId, 
          options.uploadSizeMB, 
          options.ipAddress
        );
        break;
      default:
        throw new Error(`Unsupported operation type: ${options.operationType}`);
    }

    // Handle warnings
    if (rateLimitResult.warning && options.onWarning) {
      options.onWarning(rateLimitResult.warning);
    }

    // Handle errors (hard limits)
    if (!rateLimitResult.allowed) {
      const error = new Error(rateLimitResult.error || 'Rate limit exceeded');
      (error as any).rateLimitExceeded = true;
      (error as any).rateLimitStatus = rateLimitResult.status;
      
      if (options.onError) {
        options.onError(rateLimitResult.error || 'Rate limit exceeded');
      }
      
      throw error;
    }

    // Track the request
    performanceMonitor.incrementDatabaseRequests();

    try {
      // Execute the operation
      const result = await operation();
      return result;
    } catch (error) {
      // Don't count failed operations towards rate limit
      // This could be implemented by decrementing the counter, but for simplicity
      // we'll just log the error
      console.warn('[RateLimit] Operation failed:', error);
      throw error;
    }
  }

  // Synchronous wrapper for non-async operations
  static withRateLimitSync<T>(
    options: RateLimitMiddlewareOptions,
    operation: () => T
  ): T {
    // Check rate limit before operation
    let rateLimitResult: RateLimitResult;
    
    switch (options.operationType) {
      case 'api':
        rateLimitResult = rateLimitService.checkApiRequest(options.userId, options.ipAddress);
        break;
      case 'auth':
        rateLimitResult = rateLimitService.checkAuthRequest(options.userId, options.ipAddress);
        break;
      case 'upload':
        if (!options.uploadSizeMB) {
          throw new Error('Upload size is required for upload operations');
        }
        rateLimitResult = rateLimitService.checkUploadRequest(
          options.userId, 
          options.uploadSizeMB, 
          options.ipAddress
        );
        break;
      default:
        throw new Error(`Unsupported operation type: ${options.operationType}`);
    }

    // Handle warnings
    if (rateLimitResult.warning && options.onWarning) {
      options.onWarning(rateLimitResult.warning);
    }

    // Handle errors (hard limits)
    if (!rateLimitResult.allowed) {
      const error = new Error(rateLimitResult.error || 'Rate limit exceeded');
      (error as any).rateLimitExceeded = true;
      (error as any).rateLimitStatus = rateLimitResult.status;
      
      if (options.onError) {
        options.onError(rateLimitResult.error || 'Rate limit exceeded');
      }
      
      throw error;
    }

    // Track the request
    performanceMonitor.incrementDatabaseRequests();

    try {
      // Execute the operation
      const result = operation();
      return result;
    } catch (error) {
      console.warn('[RateLimit] Operation failed:', error);
      throw error;
    }
  }

  // Get current rate limit status for UI display
  static getCurrentStatus(userId: string) {
    return rateLimitService.getCurrentStatus(userId);
  }

  // Check if user is approaching limits (for proactive UI updates)
  static isApproachingLimits(userId: string): {
    isApproachingAnyLimit: boolean;
    warnings: string[];
    criticalWarnings: string[];
  } {
    const status = this.getCurrentStatus(userId);
    const warnings: string[] = [];
    const criticalWarnings: string[] = [];

    // Check API limits
    if (status.api.isSoftLimitExceeded) {
      warnings.push(`API requests: ${status.api.remaining}/${status.api.limit} remaining today`);
    }
    if (status.api.isHardLimitExceeded) {
      criticalWarnings.push('API requests limit reached');
    }

    // Check Auth limits
    if (status.auth.isSoftLimitExceeded) {
      warnings.push(`Auth requests: ${status.auth.remaining}/${status.auth.limit} remaining today`);
    }
    if (status.auth.isHardLimitExceeded) {
      criticalWarnings.push('Auth requests limit reached');
    }

    // Check Upload limits
    if (status.upload.isSoftLimitExceeded) {
      warnings.push(`Upload: ${status.upload.remaining.toFixed(1)}MB/${status.upload.limit}MB remaining today`);
    }
    if (status.upload.isHardLimitExceeded) {
      criticalWarnings.push('Upload limit reached');
    }

    return {
      isApproachingAnyLimit: warnings.length > 0 || criticalWarnings.length > 0,
      warnings,
      criticalWarnings
    };
  }

  // Get time until next reset
  static getTimeUntilReset(userId: string): {
    api: { hours: number; minutes: number };
    auth: { hours: number; minutes: number };
    upload: { hours: number; minutes: number };
  } {
    const status = this.getCurrentStatus(userId);
    
    const formatTime = (seconds: number) => {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return { hours, minutes };
    };

    return {
      api: formatTime(status.api.resetIn),
      auth: formatTime(status.auth.resetIn),
      upload: formatTime(status.upload.resetIn)
    };
  }
}

// Convenience functions for common operations
export const withApiRateLimit = <T>(
  userId: string,
  operation: () => Promise<T>,
  options?: {
    ipAddress?: string;
    onWarning?: (message: string) => void;
    onError?: (message: string) => void;
  }
) => {
  return RateLimitMiddleware.withRateLimit({
    userId,
    ipAddress: options?.ipAddress,
    operationType: 'api',
    onWarning: options?.onWarning,
    onError: options?.onError
  }, operation);
};

export const withAuthRateLimit = <T>(
  userId: string,
  operation: () => Promise<T>,
  options?: {
    ipAddress?: string;
    onWarning?: (message: string) => void;
    onError?: (message: string) => void;
  }
) => {
  return RateLimitMiddleware.withRateLimit({
    userId,
    ipAddress: options?.ipAddress,
    operationType: 'auth',
    onWarning: options?.onWarning,
    onError: options?.onError
  }, operation);
};

export const withUploadRateLimit = <T>(
  userId: string,
  uploadSizeMB: number,
  operation: () => Promise<T>,
  options?: {
    ipAddress?: string;
    onWarning?: (message: string) => void;
    onError?: (message: string) => void;
  }
) => {
  return RateLimitMiddleware.withRateLimit({
    userId,
    ipAddress: options?.ipAddress,
    operationType: 'upload',
    uploadSizeMB,
    onWarning: options?.onWarning,
    onError: options?.onError
  }, operation);
};
