import { performanceMonitor } from '@/utils/performanceMonitor';

// Rate limit configuration based on Supabase free tier limits
export const RATE_LIMIT_CONFIG = {
  // Supabase free tier: 500MB bandwidth, 50k auth requests/month, 500MB storage
  // Conservative estimates for daily limits
  
  // API request limits (per user per day)
  DAILY_API_REQUESTS: 100,
  DAILY_AUTH_REQUESTS: 50,
  DAILY_UPLOAD_MB: 10,
  
  // Per minute limits for burst protection
  REQUESTS_PER_MINUTE: 10,
  AUTH_REQUESTS_PER_MINUTE: 5,
  
  // Soft limit threshold (80% of hard limit)
  SOFT_LIMIT_THRESHOLD: 0.8,
  
  // Hard limit threshold (95% of hard limit)
  HARD_LIMIT_THRESHOLD: 0.95,
  
  // Rate limit window duration in milliseconds
  WINDOW_DURATION: 60 * 1000, // 1 minute
  DAILY_WINDOW: 24 * 60 * 60 * 1000, // 24 hours
} as const;

export interface RateLimitStatus {
  current: number;
  limit: number;
  remaining: number;
  resetTime: number;
  isSoftLimitExceeded: boolean;
  isHardLimitExceeded: boolean;
  resetIn: number; // seconds until reset
}

export interface RateLimitResult {
  allowed: boolean;
  status: RateLimitStatus;
  warning?: string;
  error?: string;
}

interface RequestRecord {
  timestamp: number;
  count: number;
}

class RateLimitService {
  private static instance: RateLimitService;
  private requestWindows: Map<string, RequestRecord[]> = new Map();
  private dailyCounters: Map<string, { count: number; resetTime: number }> = new Map();

  static getInstance(): RateLimitService {
    if (!RateLimitService.instance) {
      RateLimitService.instance = new RateLimitService();
    }
    return RateLimitService.instance;
  }

  private getKey(type: string, identifier: string): string {
    return `${type}:${identifier}`;
  }

  private cleanupOldRecords(key: string, windowDuration: number): void {
    const records = this.requestWindows.get(key) || [];
    const now = Date.now();
    const cutoff = now - windowDuration;
    
    const filtered = records.filter(record => record.timestamp > cutoff);
    this.requestWindows.set(key, filtered);
  }

  private getDailyCounter(key: string): { count: number; resetTime: number } {
    const counter = this.dailyCounters.get(key);
    const now = Date.now();
    
    if (!counter || now > counter.resetTime) {
      const newCounter = {
        count: 0,
        resetTime: now + RATE_LIMIT_CONFIG.DAILY_WINDOW
      };
      this.dailyCounters.set(key, newCounter);
      return newCounter;
    }
    
    return counter;
  }

  private checkRateLimit(
    type: 'api' | 'auth' | 'upload',
    identifier: string,
    limit: number,
    windowDuration: number
  ): RateLimitResult {
    const key = this.getKey(type, identifier);
    const now = Date.now();
    
    // Clean up old records
    this.cleanupOldRecords(key, windowDuration);
    
    // Get current records
    const records = this.requestWindows.get(key) || [];
    const currentCount = records.reduce((sum, record) => sum + record.count, 0);
    
    // Calculate status
    const softLimit = Math.floor(limit * RATE_LIMIT_CONFIG.SOFT_LIMIT_THRESHOLD);
    const hardLimit = Math.floor(limit * RATE_LIMIT_CONFIG.HARD_LIMIT_THRESHOLD);
    
    const status: RateLimitStatus = {
      current: currentCount,
      limit,
      remaining: Math.max(0, limit - currentCount),
      resetTime: now + windowDuration,
      isSoftLimitExceeded: currentCount >= softLimit,
      isHardLimitExceeded: currentCount >= hardLimit,
      resetIn: Math.ceil(windowDuration / 1000)
    };

    // Determine result
    let allowed = true;
    let warning: string | undefined;
    let error: string | undefined;

    if (currentCount >= hardLimit) {
      allowed = false;
      error = `Rate limit exceeded. Please wait ${status.resetIn} seconds before trying again.`;
      performanceMonitor.incrementRateLimitExceeded();
    } else if (currentCount >= softLimit) {
      warning = `Approaching rate limit. ${status.remaining} requests remaining in the next ${status.resetIn} seconds.`;
    }

    // Add record if allowed
    if (allowed) {
      records.push({ timestamp: now, count: 1 });
      this.requestWindows.set(key, records);
    }

    return { allowed, status, warning, error };
  }

  private checkDailyLimit(
    type: 'api' | 'auth' | 'upload',
    identifier: string,
    dailyLimit: number
  ): RateLimitResult {
    const key = `${this.getKey(type, identifier)}:daily`;
    const counter = this.getDailyCounter(key);
    
    const softLimit = Math.floor(dailyLimit * RATE_LIMIT_CONFIG.SOFT_LIMIT_THRESHOLD);
    const hardLimit = Math.floor(dailyLimit * RATE_LIMIT_CONFIG.HARD_LIMIT_THRESHOLD);
    
    const status: RateLimitStatus = {
      current: counter.count,
      limit: dailyLimit,
      remaining: Math.max(0, dailyLimit - counter.count),
      resetTime: counter.resetTime,
      isSoftLimitExceeded: counter.count >= softLimit,
      isHardLimitExceeded: counter.count >= hardLimit,
      resetIn: Math.ceil((counter.resetTime - Date.now()) / 1000)
    };

    let allowed = true;
    let warning: string | undefined;
    let error: string | undefined;

    if (counter.count >= hardLimit) {
      allowed = false;
      error = `Daily ${type} limit exceeded. Please try again tomorrow.`;
      performanceMonitor.incrementRateLimitExceeded();
    } else if (counter.count >= softLimit) {
      warning = `Approaching daily ${type} limit. ${status.remaining} requests remaining today.`;
    }

    // Increment counter if allowed
    if (allowed) {
      counter.count++;
      this.dailyCounters.set(key, counter);
    }

    return { allowed, status, warning, error };
  }

  // Public API methods
  checkApiRequest(userId: string, ipAddress?: string): RateLimitResult {
    // Check per-minute limit first
    const perMinuteResult = this.checkRateLimit(
      'api',
      userId,
      RATE_LIMIT_CONFIG.REQUESTS_PER_MINUTE,
      RATE_LIMIT_CONFIG.WINDOW_DURATION
    );

    if (!perMinuteResult.allowed) {
      return perMinuteResult;
    }

    // Check daily limit
    const dailyResult = this.checkDailyLimit('api', userId, RATE_LIMIT_CONFIG.DAILY_API_REQUESTS);
    
    // Combine results - use daily status but ensure both limits are respected
    return {
      allowed: dailyResult.allowed && perMinuteResult.allowed,
      status: dailyResult.status,
      warning: perMinuteResult.warning || dailyResult.warning,
      error: dailyResult.error || perMinuteResult.error
    };
  }

  checkAuthRequest(userId: string, ipAddress?: string): RateLimitResult {
    // Check per-minute limit first
    const perMinuteResult = this.checkRateLimit(
      'auth',
      userId,
      RATE_LIMIT_CONFIG.AUTH_REQUESTS_PER_MINUTE,
      RATE_LIMIT_CONFIG.WINDOW_DURATION
    );

    if (!perMinuteResult.allowed) {
      return perMinuteResult;
    }

    // Check daily limit
    const dailyResult = this.checkDailyLimit('auth', userId, RATE_LIMIT_CONFIG.DAILY_AUTH_REQUESTS);
    
    // Combine results
    return {
      allowed: dailyResult.allowed,
      status: dailyResult.status,
      warning: perMinuteResult.warning || dailyResult.warning,
      error: dailyResult.error
    };
  }

  checkUploadRequest(userId: string, uploadSizeMB: number, ipAddress?: string): RateLimitResult {
    // For uploads, we check the cumulative upload size
    const key = this.getKey('upload', userId);
    const now = Date.now();
    
    // Clean up old records (24-hour window)
    this.cleanupOldRecords(key, RATE_LIMIT_CONFIG.DAILY_WINDOW);
    
    const records = this.requestWindows.get(key) || [];
    const currentUploadSize = records.reduce((sum, record) => sum + record.count, 0);
    
    const softLimit = RATE_LIMIT_CONFIG.DAILY_UPLOAD_MB * RATE_LIMIT_CONFIG.SOFT_LIMIT_THRESHOLD;
    const hardLimit = RATE_LIMIT_CONFIG.DAILY_UPLOAD_MB * RATE_LIMIT_CONFIG.HARD_LIMIT_THRESHOLD;
    
    const status: RateLimitStatus = {
      current: currentUploadSize,
      limit: RATE_LIMIT_CONFIG.DAILY_UPLOAD_MB,
      remaining: Math.max(0, RATE_LIMIT_CONFIG.DAILY_UPLOAD_MB - currentUploadSize),
      resetTime: now + RATE_LIMIT_CONFIG.DAILY_WINDOW,
      isSoftLimitExceeded: currentUploadSize >= softLimit,
      isHardLimitExceeded: currentUploadSize >= hardLimit,
      resetIn: Math.ceil(RATE_LIMIT_CONFIG.DAILY_WINDOW / 1000)
    };

    let allowed = true;
    let warning: string | undefined;
    let error: string | undefined;

    if (currentUploadSize >= hardLimit) {
      allowed = false;
      error = `Daily upload limit exceeded. Please try again tomorrow.`;
      performanceMonitor.incrementRateLimitExceeded();
    } else if (currentUploadSize + uploadSizeMB >= hardLimit) {
      allowed = false;
      error = `Upload would exceed daily limit. Please try a smaller file or try again tomorrow.`;
    } else if (currentUploadSize >= softLimit) {
      warning = `Approaching daily upload limit. ${(status.remaining).toFixed(1)}MB remaining today.`;
    }

    // Add record if allowed
    if (allowed) {
      records.push({ timestamp: now, count: uploadSizeMB });
      this.requestWindows.set(key, records);
    }

    return { allowed, status, warning, error };
  }

  // Get current status for UI display
  getCurrentStatus(userId: string): {
    api: RateLimitStatus;
    auth: RateLimitStatus;
    upload: RateLimitStatus;
  } {
    const now = Date.now();
    
    // API status
    const apiRecords = this.requestWindows.get(this.getKey('api', userId)) || [];
    const apiDaily = this.getDailyCounter(this.getKey('api', userId));
    
    // Auth status
    const authRecords = this.requestWindows.get(this.getKey('auth', userId)) || [];
    const authDaily = this.getDailyCounter(this.getKey('auth', userId));
    
    // Upload status
    const uploadRecords = this.requestWindows.get(this.getKey('upload', userId)) || [];
    const uploadDaily = this.getDailyCounter(this.getKey('upload', userId));
    
    return {
      api: {
        current: apiDaily.count,
        limit: RATE_LIMIT_CONFIG.DAILY_API_REQUESTS,
        remaining: Math.max(0, RATE_LIMIT_CONFIG.DAILY_API_REQUESTS - apiDaily.count),
        resetTime: apiDaily.resetTime,
        isSoftLimitExceeded: apiDaily.count >= RATE_LIMIT_CONFIG.DAILY_API_REQUESTS * RATE_LIMIT_CONFIG.SOFT_LIMIT_THRESHOLD,
        isHardLimitExceeded: apiDaily.count >= RATE_LIMIT_CONFIG.DAILY_API_REQUESTS * RATE_LIMIT_CONFIG.HARD_LIMIT_THRESHOLD,
        resetIn: Math.ceil((apiDaily.resetTime - now) / 1000)
      },
      auth: {
        current: authDaily.count,
        limit: RATE_LIMIT_CONFIG.DAILY_AUTH_REQUESTS,
        remaining: Math.max(0, RATE_LIMIT_CONFIG.DAILY_AUTH_REQUESTS - authDaily.count),
        resetTime: authDaily.resetTime,
        isSoftLimitExceeded: authDaily.count >= RATE_LIMIT_CONFIG.DAILY_AUTH_REQUESTS * RATE_LIMIT_CONFIG.SOFT_LIMIT_THRESHOLD,
        isHardLimitExceeded: authDaily.count >= RATE_LIMIT_CONFIG.DAILY_AUTH_REQUESTS * RATE_LIMIT_CONFIG.HARD_LIMIT_THRESHOLD,
        resetIn: Math.ceil((authDaily.resetTime - now) / 1000)
      },
      upload: {
        current: uploadDaily.count,
        limit: RATE_LIMIT_CONFIG.DAILY_UPLOAD_MB,
        remaining: Math.max(0, RATE_LIMIT_CONFIG.DAILY_UPLOAD_MB - uploadDaily.count),
        resetTime: uploadDaily.resetTime,
        isSoftLimitExceeded: uploadDaily.count >= RATE_LIMIT_CONFIG.DAILY_UPLOAD_MB * RATE_LIMIT_CONFIG.SOFT_LIMIT_THRESHOLD,
        isHardLimitExceeded: uploadDaily.count >= RATE_LIMIT_CONFIG.DAILY_UPLOAD_MB * RATE_LIMIT_CONFIG.HARD_LIMIT_THRESHOLD,
        resetIn: Math.ceil((uploadDaily.resetTime - now) / 1000)
      }
    };
  }

  // Reset user's rate limits (for testing or admin purposes)
  resetUserLimits(userId: string): void {
    const keys = [
      this.getKey('api', userId),
      this.getKey('auth', userId),
      this.getKey('upload', userId),
      `${this.getKey('api', userId)}:daily`,
      `${this.getKey('auth', userId)}:daily`,
      `${this.getKey('upload', userId)}:daily`
    ];
    
    keys.forEach(key => {
      this.requestWindows.delete(key);
      this.dailyCounters.delete(key);
    });
  }

  // Get performance metrics
  getMetrics(): {
    totalUsers: number;
    activeUsers: number;
    totalRequests: number;
    rateLimitExceeded: number;
  } {
    const perfMetrics = performanceMonitor.getMetrics();
    
    return {
      totalUsers: this.dailyCounters.size / 3, // Approximate
      activeUsers: this.requestWindows.size / 3, // Approximate
      totalRequests: perfMetrics.databaseRequests + perfMetrics.authRequests,
      rateLimitExceeded: perfMetrics.rateLimitExceeded
    };
  }
}

export const rateLimitService = RateLimitService.getInstance();
