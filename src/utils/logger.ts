export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

export interface LoggerConfig {
  level: LogLevel;
  enableTimestamp: boolean;
  enableStackTrace: boolean;
  prefix?: string;
}

class Logger {
  private static instance: Logger;
  private config: LoggerConfig;

  private constructor() {
    this.config = {
      level: import.meta.env.DEV ? LogLevel.DEBUG : LogLevel.ERROR,
      enableTimestamp: import.meta.env.DEV,
      enableStackTrace: false,
      prefix: '[KANVAS]'
    };
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.config.level;
  }

  private formatMessage(level: string, message: string, data?: any): string {
    const parts: string[] = [];
    
    if (this.config.enableTimestamp) {
      parts.push(new Date().toISOString());
    }
    
    parts.push(this.config.prefix || '[KANVAS]');
    parts.push(`[${level}]`);
    parts.push(message);
    
    const formatted = parts.join(' ');
    
    if (data !== undefined) {
      return `${formatted} ${this.formatData(data)}`;
    }
    
    return formatted;
  }

  private formatData(data: any): string {
    if (data === null || data === undefined) {
      return '';
    }
    
    if (typeof data === 'string') {
      return data;
    }
    
    try {
      return JSON.stringify(data, null, 2);
    } catch (error) {
      return `[Object: ${Object.prototype.toString.call(data)}]`;
    }
  }

  private log(level: LogLevel, levelName: string, message: string, consoleMethod: (...args: any[]) => void, data?: any): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const formattedMessage = this.formatMessage(levelName, message, data);
    
    if (this.config.enableStackTrace && level <= LogLevel.WARN) {
      consoleMethod(formattedMessage, new Error().stack);
    } else {
      consoleMethod(formattedMessage);
    }
  }

  error(message: string, data?: any): void {
    this.log(LogLevel.ERROR, 'ERROR', message, console.error, data);
  }

  warn(message: string, data?: any): void {
    this.log(LogLevel.WARN, 'WARN', message, console.warn, data);
  }

  info(message: string, data?: any): void {
    this.log(LogLevel.INFO, 'INFO', message, console.info, data);
  }

  debug(message: string, data?: any): void {
    this.log(LogLevel.DEBUG, 'DEBUG', message, console.log, data);
  }

  // Convenience methods for specific contexts
  auth(message: string, data?: any): void {
    this.debug(`[Auth] ${message}`, data);
  }

  background(message: string, data?: any): void {
    this.debug(`[Background] ${message}`, data);
  }

  document(message: string, data?: any): void {
    this.debug(`[Document] ${message}`, data);
  }

  autosave(message: string, data?: any): void {
    this.debug(`[Autosave] ${message}`, data);
  }

  emergency(message: string, data?: any): void {
    this.info(`[Emergency] ${message}`, data);
  }

  // Performance logging
  performance(operation: string, duration: number, data?: any): void {
    this.info(`[Performance] ${operation} completed in ${duration}ms`, data);
  }

  // Error reporting with user-friendly messages
  reportError(error: Error | string, context?: string, userMessage?: string): void {
    const errorMessage = error instanceof Error ? error.message : error;
    const stack = error instanceof Error ? error.stack : undefined;
    
    this.error(`Error in ${context || 'unknown context'}: ${errorMessage}`, {
      context,
      stack,
      userMessage
    });
    
    // In production, you might want to send this to an error reporting service
    if (!import.meta.env.DEV && userMessage) {
      console.warn(`User Message: ${userMessage}`);
    }
  }
}

// Export singleton instance
export const logger = Logger.getInstance();

// Export convenience functions for direct usage
export const logError = (message: string, data?: any) => logger.error(message, data);
export const logWarn = (message: string, data?: any) => logger.warn(message, data);
export const logInfo = (message: string, data?: any) => logger.info(message, data);
export const logDebug = (message: string, data?: any) => logger.debug(message, data);

// Context-specific loggers
export const logAuth = (message: string, data?: any) => logger.auth(message, data);
export const logBackground = (message: string, data?: any) => logger.background(message, data);
export const logDocument = (message: string, data?: any) => logger.document(message, data);
export const logAutosave = (message: string, data?: any) => logger.autosave(message, data);
export const logEmergency = (message: string, data?: any) => logger.emergency(message, data);
export const logPerformance = (operation: string, duration: number, data?: any) => logger.performance(operation, duration, data);
export const reportError = (error: Error | string, context?: string, userMessage?: string) => logger.reportError(error, context, userMessage);
