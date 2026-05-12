/**
 * RATE LIMIT SERVICE
 * 
 * Handles rate limiting for API calls and operations
 * This is a simplified version for compatibility
 */

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

interface RateLimitState {
  requests: number;
  windowStart: number;
  blocked: boolean;
  resetTime: number;
}

class RateLimitService {
  private static instance: RateLimitService;
  private limits: Map<string, RateLimitConfig> = new Map();
  private states: Map<string, RateLimitState> = new Map();

  static getInstance(): RateLimitService {
    if (!RateLimitService.instance) {
      RateLimitService.instance = new RateLimitService();
    }
    return RateLimitService.instance;
  }

  private constructor() {
    // Set up default limits
    this.setupDefaultLimits();
  }

  /**
   * Check if a request is allowed
   */
  isAllowed(key: string, identifier?: string): boolean {
    const config = this.limits.get(key);
    if (!config) return true;

    const fullKey = identifier ? `${key}:${identifier}` : key;
    const state = this.getOrCreateState(fullKey);
    const now = Date.now();

    // Reset window if expired
    if (now - state.windowStart >= config.windowMs) {
      state.requests = 0;
      state.windowStart = now;
      state.blocked = false;
    }

    // Check if limit exceeded
    if (state.requests >= config.maxRequests) {
      state.blocked = true;
      state.resetTime = state.windowStart + config.windowMs;
      return false;
    }

    return true;
  }

  /**
   * Record a request
   */
  recordRequest(key: string, success: boolean = true, identifier?: string): void {
    const config = this.limits.get(key);
    if (!config) return;

    const fullKey = identifier ? `${key}:${identifier}` : key;
    const state = this.getOrCreateState(fullKey);

    // Skip based on configuration
    if (config.skipSuccessfulRequests && success) return;
    if (config.skipFailedRequests && !success) return;

    state.requests++;
  }

  /**
   * Get rate limit status
   */
  getStatus(key: string, identifier?: string): {
    allowed: boolean;
    requests: number;
    maxRequests: number;
    resetTime: number;
    blocked: boolean;
  } {
    const config = this.limits.get(key);
    if (!config) {
      return {
        allowed: true,
        requests: 0,
        maxRequests: 0,
        resetTime: 0,
        blocked: false
      };
    }

    const fullKey = identifier ? `${key}:${identifier}` : key;
    const state = this.getOrCreateState(fullKey);
    const now = Date.now();

    // Reset window if expired
    if (now - state.windowStart >= config.windowMs) {
      state.requests = 0;
      state.windowStart = now;
      state.blocked = false;
    }

    return {
      allowed: !state.blocked && state.requests < config.maxRequests,
      requests: state.requests,
      maxRequests: config.maxRequests,
      resetTime: state.resetTime,
      blocked: state.blocked
    };
  }

  /**
   * Reset rate limit for a key
   */
  reset(key: string, identifier?: string): void {
    const fullKey = identifier ? `${key}:${identifier}` : key;
    this.states.delete(fullKey);
  }

  /**
   * Set rate limit configuration
   */
  setLimit(key: string, config: RateLimitConfig): void {
    this.limits.set(key, config);
  }

  /**
   * Get time until reset in milliseconds
   */
  getTimeUntilReset(key: string, identifier?: string): number {
    const status = this.getStatus(key, identifier);
    const now = Date.now();
    return Math.max(0, status.resetTime - now);
  }

  /**
   * Get remaining requests allowed
   */
  getRemainingRequests(key: string, identifier?: string): number {
    const status = this.getStatus(key, identifier);
    return Math.max(0, status.maxRequests - status.requests);
  }

  // Private helper methods
  private setupDefaultLimits(): void {
    // API limits
    this.setLimit('api', {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 100,
      skipSuccessfulRequests: false,
      skipFailedRequests: true
    });

    // Asset creation limits
    this.setLimit('asset-create', {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 10
    });

    // File upload limits
    this.setLimit('file-upload', {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 5
    });

    // Sync limits
    this.setLimit('sync', {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 20
    });
  }

  private getOrCreateState(key: string): RateLimitState {
    let state = this.states.get(key);
    if (!state) {
      state = {
        requests: 0,
        windowStart: Date.now(),
        blocked: false,
        resetTime: Date.now() + 60000 // Default 1 minute
      };
      this.states.set(key, state);
    }
    return state;
  }
}

// Export singleton instance
export const rateLimitService = RateLimitService.getInstance();
