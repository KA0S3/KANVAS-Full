/**
 * COMPREHENSIVE ERROR HANDLING & RECOVERY
 * 
 * Implements robust error handling with automatic recovery
 * and user notification system for all persistence operations.
 * 
 * 🔒 CRITICAL: Must handle all error scenarios gracefully
 */

export interface ErrorContext {
  operation: string;
  component: string;
  assetId?: string;
  projectId?: string;
  timestamp: number;
  retryCount: number;
  userNotified: boolean;
}

export interface RecoveryStrategy {
  type: 'retry' | 'fallback' | 'user-intervention' | 'graceful-degradation';
  maxRetries: number;
  retryDelay: number;
  fallbackAction?: () => Promise<void>;
  userMessage?: string;
}

export interface ErrorReport {
  id: string;
  context: ErrorContext;
  error: Error;
  strategy: RecoveryStrategy;
  resolved: boolean;
  resolutionTime?: number;
}

/**
 * Error handling and recovery system
 */
export class ErrorHandlingSystem {
  private errorHistory = new Map<string, ErrorReport>();
  private activeRecoveries = new Map<string, Promise<void>>();
  private errorCallbacks = new Set<(error: ErrorReport) => void>();
  private maxHistorySize = 100;
  
  // Error categories with specific strategies
  private errorStrategies = new Map<string, RecoveryStrategy>([
    // Network errors
    ['network', {
      type: 'retry',
      maxRetries: 5,
      retryDelay: 2000,
      userMessage: 'Network connection issue. Retrying...',
    }],
    
    // Database errors
    ['database', {
      type: 'retry',
      maxRetries: 3,
      retryDelay: 1000,
      userMessage: 'Database issue. Recovering...',
    }],
    
    // Storage quota errors
    ['quota', {
      type: 'user-intervention',
      maxRetries: 0,
      retryDelay: 0,
      userMessage: 'Storage quota exceeded. Please free up space.',
      fallbackAction: async () => {
        // Trigger cleanup
        const { blobStorage } = await import('../storage/blobStorage');
        blobStorage.cleanup();
      },
    }],
    
    // Validation errors
    ['validation', {
      type: 'graceful-degradation',
      maxRetries: 0,
      retryDelay: 0,
      userMessage: 'Data validation failed. Some features may be limited.',
    }],
    
    // Permission errors
    ['permission', {
      type: 'user-intervention',
      maxRetries: 0,
      retryDelay: 0,
      userMessage: 'Permission denied. Please check your settings.',
    }],
    
    // Timeout errors
    ['timeout', {
      type: 'retry',
      maxRetries: 3,
      retryDelay: 5000,
      userMessage: 'Operation timed out. Retrying with longer timeout...',
    }],
    
    // File upload errors
    ['upload', {
      type: 'retry',
      maxRetries: 3,
      retryDelay: 3000,
      userMessage: 'File upload failed. Retrying...',
    }],
  ]);

  /**
   * Handle error with automatic recovery
   */
  async handleError(
    error: Error,
    operation: string,
    component: string,
    context: Partial<ErrorContext> = {}
  ): Promise<boolean> {
    const errorId = this.generateErrorId();
    const errorCategory = this.categorizeError(error);
    const strategy = this.errorStrategies.get(errorCategory) || this.getDefaultStrategy();
    
    const errorContext: ErrorContext = {
      operation,
      component,
      assetId: context.assetId,
      projectId: context.projectId,
      timestamp: Date.now(),
      retryCount: context.retryCount || 0,
      userNotified: false,
    };

    const errorReport: ErrorReport = {
      id: errorId,
      context: errorContext,
      error,
      strategy,
      resolved: false,
    };

    // Store error report
    this.errorHistory.set(errorId, errorReport);
    this.trimHistory();

    // Notify callbacks
    this.notifyErrorCallbacks(errorReport);

    // Attempt recovery
    const resolved = await this.attemptRecovery(errorReport);
    
    // Update error report
    errorReport.resolved = resolved;
    errorReport.resolutionTime = Date.now() - errorContext.timestamp;

    return resolved;
  }

  /**
   * Attempt recovery based on strategy
   */
  private async attemptRecovery(errorReport: ErrorReport): Promise<boolean> {
    const { strategy, context } = errorReport;
    
    try {
      switch (strategy.type) {
        case 'retry':
          return await this.handleRetry(errorReport);
          
        case 'fallback':
          return await this.handleFallback(errorReport);
          
        case 'user-intervention':
          return await this.handleUserIntervention(errorReport);
          
        case 'graceful-degradation':
          return await this.handleGracefulDegradation(errorReport);
          
        default:
          return false;
      }
    } catch (recoveryError) {
      console.error('Recovery strategy failed:', recoveryError);
      return false;
    }
  }

  /**
   * Handle retry strategy
   */
  private async handleRetry(errorReport: ErrorReport): Promise<boolean> {
    const { strategy, context } = errorReport;
    
    if (context.retryCount >= strategy.maxRetries) {
      this.notifyUser('Max retries exceeded. Please try again later.', 'error');
      return false;
    }

    // Notify user
    if (!context.userNotified && strategy.userMessage) {
      this.notifyUser(strategy.userMessage, 'warning');
      context.userNotified = true;
    }

    // Wait before retry
    await this.delay(strategy.retryDelay);

    // Trigger retry (this would be handled by the calling component)
    this.emitRetryEvent(errorReport);
    
    return false; // Not resolved yet, retry in progress
  }

  /**
   * Handle fallback strategy
   */
  private async handleFallback(errorReport: ErrorReport): Promise<boolean> {
    const { strategy, context } = errorReport;
    
    if (strategy.fallbackAction) {
      try {
        await strategy.fallbackAction();
        this.notifyUser('Fallback recovery successful.', 'success');
        return true;
      } catch (fallbackError) {
        console.error('Fallback action failed:', fallbackError);
        this.notifyUser('Fallback recovery failed.', 'error');
        return false;
      }
    }

    return false;
  }

  /**
   * Handle user intervention strategy
   */
  private async handleUserIntervention(errorReport: ErrorReport): Promise<boolean> {
    const { strategy, context } = errorReport;
    
    // Notify user with clear action required
    if (strategy.userMessage) {
      this.notifyUser(strategy.userMessage, 'error', {
        persistent: true,
        actions: ['retry', 'ignore'],
      });
    }

    // Execute fallback action if available
    if (strategy.fallbackAction) {
      try {
        await strategy.fallbackAction();
      } catch (fallbackError) {
        console.error('Fallback action failed:', fallbackError);
      }
    }

    return false; // Requires user action
  }

  /**
   * Handle graceful degradation
   */
  private async handleGracefulDegradation(errorReport: ErrorReport): Promise<boolean> {
    const { strategy, context } = errorReport;
    
    // Notify user of degraded functionality
    if (strategy.userMessage) {
      this.notifyUser(strategy.userMessage, 'warning', {
        persistent: false,
        timeout: 5000,
      });
    }

    // Mark as resolved (degraded state is acceptable)
    return true;
  }

  /**
   * Categorize error for appropriate strategy
   */
  private categorizeError(error: Error): string {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();
    
    // Network errors
    if (message.includes('network') || message.includes('fetch') || 
        message.includes('connection') || name.includes('network')) {
      return 'network';
    }

    // Database errors
    if (message.includes('database') || message.includes('indexeddb') ||
        message.includes('transaction') || name.includes('database')) {
      return 'database';
    }

    // Storage quota errors
    if (message.includes('quota') || message.includes('storage') ||
        message.includes('space') || name.includes('quota')) {
      return 'quota';
    }

    // Validation errors
    if (message.includes('validation') || message.includes('invalid') ||
        message.includes('schema') || name.includes('validation')) {
      return 'validation';
    }

    // Permission errors
    if (message.includes('permission') || message.includes('unauthorized') ||
        message.includes('forbidden') || name.includes('permission')) {
      return 'permission';
    }

    // Timeout errors
    if (message.includes('timeout') || message.includes('timed out') ||
        name.includes('timeout')) {
      return 'timeout';
    }

    // Upload errors
    if (message.includes('upload') || message.includes('file') ||
        name.includes('upload')) {
      return 'upload';
    }

    // Default
    return 'unknown';
  }

  /**
   * Get default recovery strategy
   */
  private getDefaultStrategy(): RecoveryStrategy {
    return {
      type: 'retry',
      maxRetries: 3,
      retryDelay: 1000,
      userMessage: 'An error occurred. Retrying...',
    };
  }

  /**
   * Generate unique error ID
   */
  private generateErrorId(): string {
    return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Emit retry event for components to handle
   */
  private emitRetryEvent(errorReport: ErrorReport): void {
    window.dispatchEvent(new CustomEvent('error-retry', {
      detail: {
        errorId: errorReport.id,
        context: errorReport.context,
        retryCount: errorReport.context.retryCount + 1,
      },
    }));
  }

  /**
   * Notify user with toast/notification
   */
  private notifyUser(
    message: string, 
    type: 'info' | 'success' | 'warning' | 'error',
    options: {
      persistent?: boolean;
      timeout?: number;
      actions?: string[];
    } = {}
  ): void {
    // Emit notification event
    window.dispatchEvent(new CustomEvent('user-notification', {
      detail: {
        message,
        type,
        persistent: options.persistent || false,
        timeout: options.timeout || 3000,
        actions: options.actions || [],
      },
    }));
  }

  /**
   * Notify error callbacks
   */
  private notifyErrorCallbacks(errorReport: ErrorReport): void {
    for (const callback of this.errorCallbacks) {
      try {
        callback(errorReport);
      } catch (callbackError) {
        console.error('Error callback failed:', callbackError);
      }
    }
  }

  /**
   * Trim error history to prevent memory leaks
   */
  private trimHistory(): void {
    if (this.errorHistory.size > this.maxHistorySize) {
      const entries = Array.from(this.errorHistory.entries())
        .sort(([, a], [, b]) => a.context.timestamp - b.context.timestamp);
      
      const toRemove = entries.slice(0, entries.length - this.maxHistorySize);
      for (const [id] of toRemove) {
        this.errorHistory.delete(id);
      }
    }
  }

  /**
   * Delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Register error callback
   */
  onError(callback: (error: ErrorReport) => void): () => void {
    this.errorCallbacks.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.errorCallbacks.delete(callback);
    };
  }

  /**
   * Get error statistics
   */
  getErrorStats(): {
    total: number;
    byCategory: Record<string, number>;
    byComponent: Record<string, number>;
    resolved: number;
    unresolved: number;
  } {
    const errors = Array.from(this.errorHistory.values());
    const byCategory: Record<string, number> = {};
    const byComponent: Record<string, number> = {};
    let resolved = 0;
    let unresolved = 0;

    for (const error of errors) {
      const category = this.categorizeError(error.error);
      byCategory[category] = (byCategory[category] || 0) + 1;
      byComponent[error.context.component] = (byComponent[error.context.component] || 0) + 1;
      
      if (error.resolved) {
        resolved++;
      } else {
        unresolved++;
      }
    }

    return {
      total: errors.length,
      byCategory,
      byComponent,
      resolved,
      unresolved,
    };
  }

  /**
   * Get recent errors
   */
  getRecentErrors(limit: number = 10): ErrorReport[] {
    return Array.from(this.errorHistory.values())
      .sort((a, b) => b.context.timestamp - a.context.timestamp)
      .slice(0, limit);
  }

  /**
   * Clear error history
   */
  clearHistory(): void {
    this.errorHistory.clear();
  }

  /**
   * Get error by ID
   */
  getError(id: string): ErrorReport | undefined {
    return this.errorHistory.get(id);
  }

  /**
   * Cancel active recovery
   */
  cancelRecovery(errorId: string): void {
    const recovery = this.activeRecoveries.get(errorId);
    if (recovery) {
      // Note: In a real implementation, you'd need a way to cancel promises
      this.activeRecoveries.delete(errorId);
    }
  }
}

// Export singleton instance
export const errorHandling = new ErrorHandlingSystem();

// Export utility functions
export const handleError = (
  error: Error,
  operation: string,
  component: string,
  context?: Partial<ErrorContext>
) => errorHandling.handleError(error, operation, component, context);

export const onError = (callback: (error: ErrorReport) => void) => 
  errorHandling.onError(callback);
