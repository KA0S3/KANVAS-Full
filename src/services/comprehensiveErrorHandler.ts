/**
 * Comprehensive Error Handling and Recovery System
 * 
 * Provides intelligent error detection, categorization, and recovery strategies
 * with user-friendly error messages and automatic retry mechanisms
 */

export enum ErrorCategory {
  NETWORK = 'network',
  AUTHENTICATION = 'authentication',
  PERMISSION = 'permission',
  VALIDATION = 'validation',
  CONFLICT = 'conflict',
  QUOTA = 'quota',
  SYSTEM = 'system',
  USER_INPUT = 'user_input',
  UNKNOWN = 'unknown'
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

export enum RecoveryStrategy {
  NONE = 'none',
  RETRY = 'retry',
  RETRY_WITH_BACKOFF = 'retry_with_backoff',
  FALLBACK = 'fallback',
  USER_INTERVENTION = 'user_intervention',
  REFRESH_REQUIRED = 'refresh_required',
  RESTART_REQUIRED = 'restart_required'
}

export interface ErrorContext {
  operation: string;
  component: string;
  userId?: string;
  projectId?: string;
  assetId?: string;
  timestamp: number;
  userAgent: string;
  url: string;
  additionalData?: Record<string, any>;
}

export interface ErrorInfo {
  id: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  technicalMessage: string;
  context: ErrorContext;
  recoveryStrategy: RecoveryStrategy;
  canRetry: boolean;
  retryCount: number;
  maxRetries: number;
  suggestions: string[];
  isRecoverable: boolean;
}

export interface ErrorRecoveryResult {
  success: boolean;
  strategy: RecoveryStrategy;
  attempts: number;
  finalMessage?: string;
  error?: Error;
}

interface ErrorHandlingOptions {
  enableAutoRetry?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  enableFallback?: boolean;
  enableUserNotification?: boolean;
  customRecoveryStrategies?: Map<string, () => Promise<boolean>>;
}

class ComprehensiveErrorHandler {
  private static instance: ComprehensiveErrorHandler;
  private errorHistory: ErrorInfo[] = [];
  private activeRecoveries: Map<string, Promise<ErrorRecoveryResult>> = new Map();
  private errorListeners: Set<(error: ErrorInfo) => void> = new Set();
  private recoveryListeners: Set<(result: ErrorRecoveryResult) => void> = new Set();
  private options: Required<ErrorHandlingOptions>;

  static getInstance(): ComprehensiveErrorHandler {
    if (!ComprehensiveErrorHandler.instance) {
      ComprehensiveErrorHandler.instance = new ComprehensiveErrorHandler();
    }
    return ComprehensiveErrorHandler.instance;
  }

  constructor(options: ErrorHandlingOptions = {}) {
    this.options = {
      enableAutoRetry: true,
      maxRetries: 3,
      retryDelay: 1000,
      enableFallback: true,
      enableUserNotification: true,
      customRecoveryStrategies: new Map(),
      ...options
    };

    // Setup global error handlers
    this.setupGlobalErrorHandlers();
  }

  /**
   * Handle an error with comprehensive analysis and recovery
   */
  async handleError(
    error: Error | string,
    context: Partial<ErrorContext>,
    options: { operation?: string; component?: string } = {}
  ): Promise<ErrorInfo> {
    const errorInfo = this.analyzeError(error, context, options);
    
    // Store in history
    this.errorHistory.push(errorInfo);
    
    // Limit history size
    if (this.errorHistory.length > 1000) {
      this.errorHistory = this.errorHistory.slice(-500);
    }

    // Notify listeners
    this.notifyErrorListeners(errorInfo);

    // Attempt recovery if possible
    if (errorInfo.isRecoverable && this.options.enableAutoRetry) {
      this.attemptRecovery(errorInfo);
    }

    return errorInfo;
  }

  /**
   * Analyze error and categorize it
   */
  private analyzeError(
    error: Error | string,
    context: Partial<ErrorContext>,
    options: { operation?: string; component?: string } = {}
  ): ErrorInfo {
    const errorMessage = typeof error === 'string' ? error : error.message;
    const technicalMessage = typeof error === 'string' ? error : error.stack || errorMessage;
    
    const errorContext: ErrorContext = {
      operation: options.operation || 'unknown',
      component: options.component || 'unknown',
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      ...context
    };

    const category = this.categorizeError(errorMessage, error);
    const severity = this.determineSeverity(category, errorMessage);
    const recoveryStrategy = this.determineRecoveryStrategy(category, errorMessage);
    const suggestions = this.generateSuggestions(category, errorMessage);

    return {
      id: this.generateErrorId(),
      category,
      severity,
      message: this.generateUserFriendlyMessage(category, errorMessage),
      technicalMessage,
      context: errorContext,
      recoveryStrategy,
      canRetry: this.canRetry(category, recoveryStrategy),
      retryCount: 0,
      maxRetries: this.options.maxRetries,
      suggestions,
      isRecoverable: recoveryStrategy !== RecoveryStrategy.NONE
    };
  }

  /**
   * Categorize error based on message and type
   */
  private categorizeError(message: string, error: Error | string): ErrorCategory {
    const lowerMessage = message.toLowerCase();

    // Network errors
    if (lowerMessage.includes('network') || lowerMessage.includes('fetch') || 
        lowerMessage.includes('connection') || lowerMessage.includes('timeout')) {
      return ErrorCategory.NETWORK;
    }

    // Authentication errors
    if (lowerMessage.includes('unauthorized') || lowerMessage.includes('authentication') ||
        lowerMessage.includes('login') || lowerMessage.includes('token')) {
      return ErrorCategory.AUTHENTICATION;
    }

    // Permission errors
    if (lowerMessage.includes('forbidden') || lowerMessage.includes('permission') ||
        lowerMessage.includes('access denied')) {
      return ErrorCategory.PERMISSION;
    }

    // Validation errors
    if (lowerMessage.includes('validation') || lowerMessage.includes('invalid') ||
        lowerMessage.includes('required') || lowerMessage.includes('format')) {
      return ErrorCategory.VALIDATION;
    }

    // Conflict errors
    if (lowerMessage.includes('conflict') || lowerMessage.includes('version') ||
        lowerMessage.includes('concurrent')) {
      return ErrorCategory.CONFLICT;
    }

    // Quota errors
    if (lowerMessage.includes('quota') || lowerMessage.includes('limit') ||
        lowerMessage.includes('exceeded') || lowerMessage.includes('storage')) {
      return ErrorCategory.QUOTA;
    }

    // System errors
    if (lowerMessage.includes('system') || lowerMessage.includes('internal') ||
        lowerMessage.includes('server') || lowerMessage.includes('database')) {
      return ErrorCategory.SYSTEM;
    }

    // User input errors
    if (lowerMessage.includes('input') || lowerMessage.includes('user') ||
        lowerMessage.includes('malformed')) {
      return ErrorCategory.USER_INPUT;
    }

    return ErrorCategory.UNKNOWN;
  }

  /**
   * Determine error severity
   */
  private determineSeverity(category: ErrorCategory, message: string): ErrorSeverity {
    switch (category) {
      case ErrorCategory.SYSTEM:
      case ErrorCategory.AUTHENTICATION:
        return ErrorSeverity.HIGH;
      
      case ErrorCategory.NETWORK:
      case ErrorCategory.PERMISSION:
      case ErrorCategory.QUOTA:
        return message.includes('critical') || message.includes('fatal') 
          ? ErrorSeverity.HIGH 
          : ErrorSeverity.MEDIUM;
      
      case ErrorCategory.CONFLICT:
      case ErrorCategory.VALIDATION:
        return ErrorSeverity.MEDIUM;
      
      case ErrorCategory.USER_INPUT:
        return ErrorSeverity.LOW;
      
      default:
        return ErrorSeverity.MEDIUM;
    }
  }

  /**
   * Determine recovery strategy
   */
  private determineRecoveryStrategy(category: ErrorCategory, message: string): RecoveryStrategy {
    switch (category) {
      case ErrorCategory.NETWORK:
        return RecoveryStrategy.RETRY_WITH_BACKOFF;
      
      case ErrorCategory.AUTHENTICATION:
        return RecoveryStrategy.REFRESH_REQUIRED;
      
      case ErrorCategory.PERMISSION:
        return RecoveryStrategy.USER_INTERVENTION;
      
      case ErrorCategory.CONFLICT:
        return RecoveryStrategy.RETRY;
      
      case ErrorCategory.QUOTA:
        return RecoveryStrategy.USER_INTERVENTION;
      
      case ErrorCategory.VALIDATION:
        return RecoveryStrategy.USER_INTERVENTION;
      
      case ErrorCategory.SYSTEM:
        return message.includes('temporary') ? RecoveryStrategy.RETRY : RecoveryStrategy.USER_INTERVENTION;
      
      case ErrorCategory.USER_INPUT:
        return RecoveryStrategy.NONE;
      
      default:
        return RecoveryStrategy.RETRY;
    }
  }

  /**
   * Generate user-friendly error messages
   */
  private generateUserFriendlyMessage(category: ErrorCategory, technicalMessage: string): string {
    switch (category) {
      case ErrorCategory.NETWORK:
        return 'Connection issue. Please check your internet connection and try again.';
      
      case ErrorCategory.AUTHENTICATION:
        return 'Authentication required. Please log in again.';
      
      case ErrorCategory.PERMISSION:
        return 'You don\'t have permission to perform this action.';
      
      case ErrorCategory.VALIDATION:
        return 'Please check your input and try again.';
      
      case ErrorCategory.CONFLICT:
        return 'There was a conflict. Your changes may not have been saved.';
      
      case ErrorCategory.QUOTA:
        return 'Storage limit reached. Please free up some space and try again.';
      
      case ErrorCategory.SYSTEM:
        return 'A system error occurred. Please try again later.';
      
      case ErrorCategory.USER_INPUT:
        return 'Invalid input provided. Please check and try again.';
      
      default:
        return 'An unexpected error occurred. Please try again.';
    }
  }

  /**
   * Generate recovery suggestions
   */
  private generateSuggestions(category: ErrorCategory, message: string): string[] {
    const suggestions: string[] = [];

    switch (category) {
      case ErrorCategory.NETWORK:
        suggestions.push('Check your internet connection');
        suggestions.push('Try refreshing the page');
        suggestions.push('Wait a moment and try again');
        break;
      
      case ErrorCategory.AUTHENTICATION:
        suggestions.push('Log in again');
        suggestions.push('Clear your browser cache');
        suggestions.push('Check if your session expired');
        break;
      
      case ErrorCategory.PERMISSION:
        suggestions.push('Contact your administrator');
        suggestions.push('Check if you have the right role');
        suggestions.push('Try with a different account');
        break;
      
      case ErrorCategory.VALIDATION:
        suggestions.push('Check all required fields');
        suggestions.push('Verify the format of your input');
        suggestions.push('Remove any special characters');
        break;
      
      case ErrorCategory.CONFLICT:
        suggestions.push('Refresh the page and try again');
        suggestions.push('Check if someone else is editing');
        suggestions.push('Save your work elsewhere first');
        break;
      
      case ErrorCategory.QUOTA:
        suggestions.push('Delete unused files');
        suggestions.push('Upgrade your storage plan');
        suggestions.push('Compress your files');
        break;
      
      case ErrorCategory.SYSTEM:
        suggestions.push('Try again in a few minutes');
        suggestions.push('Report this issue to support');
        suggestions.push('Check the system status page');
        break;
    }

    return suggestions;
  }

  /**
   * Check if error can be retried
   */
  private canRetry(category: ErrorCategory, strategy: RecoveryStrategy): boolean {
    return strategy === RecoveryStrategy.RETRY || 
           strategy === RecoveryStrategy.RETRY_WITH_BACKOFF ||
           strategy === RecoveryStrategy.FALLBACK;
  }

  /**
   * Attempt error recovery
   */
  private async attemptRecovery(errorInfo: ErrorInfo): Promise<void> {
    if (this.activeRecoveries.has(errorInfo.id)) {
      return; // Already recovering
    }

    const recoveryPromise = this.executeRecovery(errorInfo);
    this.activeRecoveries.set(errorInfo.id, recoveryPromise);

    try {
      const result = await recoveryPromise;
      this.notifyRecoveryListeners(result);
    } catch (error) {
      console.error('[ErrorHandler] Recovery failed:', error);
    } finally {
      this.activeRecoveries.delete(errorInfo.id);
    }
  }

  /**
   * Execute recovery strategy
   */
  private async executeRecovery(errorInfo: ErrorInfo): Promise<ErrorRecoveryResult> {
    const strategy = errorInfo.recoveryStrategy;
    let attempts = 0;
    let lastError: Error | undefined;

    switch (strategy) {
      case RecoveryStrategy.RETRY:
        return await this.executeRetry(errorInfo, attempts);
      
      case RecoveryStrategy.RETRY_WITH_BACKOFF:
        return await this.executeRetryWithBackoff(errorInfo, attempts);
      
      case RecoveryStrategy.FALLBACK:
        return await this.executeFallback(errorInfo);
      
      case RecoveryStrategy.USER_INTERVENTION:
        return await this.requestUserIntervention(errorInfo);
      
      case RecoveryStrategy.REFRESH_REQUIRED:
        return await this.requestRefresh(errorInfo);
      
      case RecoveryStrategy.RESTART_REQUIRED:
        return await this.requestRestart(errorInfo);
      
      default:
        return {
          success: false,
          strategy: RecoveryStrategy.NONE,
          attempts: 0,
          finalMessage: 'No recovery strategy available'
        };
    }
  }

  /**
   * Execute simple retry
   */
  private async executeRetry(errorInfo: ErrorInfo, attempts: number): Promise<ErrorRecoveryResult> {
    let lastError: Error | undefined;
    
    for (let i = 0; i < errorInfo.maxRetries; i++) {
      try {
        attempts++;
        
        // Check for custom recovery strategy
        const customStrategy = this.options.customRecoveryStrategies.get(errorInfo.context.operation);
        if (customStrategy) {
          const success = await customStrategy();
          if (success) {
            return {
              success: true,
              strategy: errorInfo.recoveryStrategy,
              attempts,
              finalMessage: 'Recovery successful'
            };
          }
        }

        // Default retry logic would go here
        // This would depend on the specific operation that failed
        
        if (i === errorInfo.maxRetries - 1) {
          throw new Error('Max retries exceeded');
        }

        // Wait before retry
        await this.sleep(this.options.retryDelay);
      } catch (error) {
        lastError = error as Error;
        
        if (i === errorInfo.maxRetries - 1) {
          break;
        }
      }
    }

    return {
      success: false,
      strategy: errorInfo.recoveryStrategy,
      attempts,
      finalMessage: 'Recovery failed after maximum retries',
      error: lastError
    };
  }

  /**
   * Execute retry with exponential backoff
   */
  private async executeRetryWithBackoff(errorInfo: ErrorInfo, attempts: number): Promise<ErrorRecoveryResult> {
    let lastError: Error | undefined;
    
    for (let i = 0; i < errorInfo.maxRetries; i++) {
      try {
        attempts++;
        
        // Custom retry logic would go here
        // This would depend on the specific operation that failed
        
        if (i === errorInfo.maxRetries - 1) {
          throw new Error('Max retries exceeded');
        }

        // Exponential backoff
        const delay = this.options.retryDelay * Math.pow(2, i);
        await this.sleep(delay);
      } catch (error) {
        lastError = error as Error;
        
        if (i === errorInfo.maxRetries - 1) {
          break;
        }
      }
    }

    return {
      success: false,
      strategy: errorInfo.recoveryStrategy,
      attempts,
      finalMessage: 'Recovery failed after maximum retries with backoff',
      error: lastError
    };
  }

  /**
   * Execute fallback strategy
   */
  private async executeFallback(errorInfo: ErrorInfo): Promise<ErrorRecoveryResult> {
    // Fallback logic would depend on the specific operation
    // This is a placeholder for implementation
    
    return {
      success: false,
      strategy: RecoveryStrategy.FALLBACK,
      attempts: 1,
      finalMessage: 'Fallback strategy not implemented'
    };
  }

  /**
   * Request user intervention
   */
  private async requestUserIntervention(errorInfo: ErrorInfo): Promise<ErrorRecoveryResult> {
    // This would typically show a user dialog or notification
    // For now, we'll just return the result
    
    return {
      success: false,
      strategy: RecoveryStrategy.USER_INTERVENTION,
      attempts: 0,
      finalMessage: 'User intervention required'
    };
  }

  /**
   * Request page refresh
   */
  private async requestRefresh(errorInfo: ErrorInfo): Promise<ErrorRecoveryResult> {
    // This would typically prompt the user to refresh
    // For now, we'll just return the result
    
    return {
      success: false,
      strategy: RecoveryStrategy.REFRESH_REQUIRED,
      attempts: 0,
      finalMessage: 'Page refresh required'
    };
  }

  /**
   * Request application restart
   */
  private async requestRestart(errorInfo: ErrorInfo): Promise<ErrorRecoveryResult> {
    // This would typically prompt the user to restart the application
    // For now, we'll just return the result
    
    return {
      success: false,
      strategy: RecoveryStrategy.RESTART_REQUIRED,
      attempts: 0,
      finalMessage: 'Application restart required'
    };
  }

  /**
   * Setup global error handlers
   */
  private setupGlobalErrorHandlers(): void {
    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.handleError(event.reason, {
        operation: 'unhandled_promise_rejection',
        component: 'global'
      });
    });

    // Handle uncaught errors
    window.addEventListener('error', (event) => {
      this.handleError(event.error || event.message, {
        operation: 'uncaught_error',
        component: 'global'
      });
    });
  }

  /**
   * Generate unique error ID
   */
  private generateErrorId(): string {
    return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Notify error listeners
   */
  private notifyErrorListeners(errorInfo: ErrorInfo): void {
    this.errorListeners.forEach(listener => {
      try {
        listener(errorInfo);
      } catch (error) {
        console.error('[ErrorHandler] Error in listener:', error);
      }
    });
  }

  /**
   * Notify recovery listeners
   */
  private notifyRecoveryListeners(result: ErrorRecoveryResult): void {
    this.recoveryListeners.forEach(listener => {
      try {
        listener(result);
      } catch (error) {
        console.error('[ErrorHandler] Error in recovery listener:', error);
      }
    });
  }

  /**
   * Subscribe to error events
   */
  onError(listener: (error: ErrorInfo) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  /**
   * Subscribe to recovery events
   */
  onRecovery(listener: (result: ErrorRecoveryResult) => void): () => void {
    this.recoveryListeners.add(listener);
    return () => this.recoveryListeners.delete(listener);
  }

  /**
   * Register custom recovery strategy
   */
  registerRecoveryStrategy(operation: string, strategy: () => Promise<boolean>): void {
    this.options.customRecoveryStrategies.set(operation, strategy);
  }

  /**
   * Get error statistics
   */
  getErrorStats(): {
    totalErrors: number;
    errorsByCategory: Record<ErrorCategory, number>;
    errorsBySeverity: Record<ErrorSeverity, number>;
    recentErrors: ErrorInfo[];
  } {
    const errorsByCategory: Record<ErrorCategory, number> = {} as any;
    const errorsBySeverity: Record<ErrorSeverity, number> = {} as any;

    // Initialize counters
    Object.values(ErrorCategory).forEach(category => {
      errorsByCategory[category] = 0;
    });
    Object.values(ErrorSeverity).forEach(severity => {
      errorsBySeverity[severity] = 0;
    });

    // Count errors
    this.errorHistory.forEach(error => {
      errorsByCategory[error.category]++;
      errorsBySeverity[error.severity]++;
    });

    return {
      totalErrors: this.errorHistory.length,
      errorsByCategory,
      errorsBySeverity,
      recentErrors: this.errorHistory.slice(-10)
    };
  }

  /**
   * Clear error history
   */
  clearHistory(): void {
    this.errorHistory = [];
  }
}

// Export singleton instance
export const comprehensiveErrorHandler = ComprehensiveErrorHandler.getInstance();

// Convenience functions
export const handleError = (
  error: Error | string,
  context?: Partial<ErrorContext>,
  options?: { operation?: string; component?: string }
) => comprehensiveErrorHandler.handleError(error, context, options);

export const registerRecoveryStrategy = (
  operation: string,
  strategy: () => Promise<boolean>
) => comprehensiveErrorHandler.registerRecoveryStrategy(operation, strategy);
