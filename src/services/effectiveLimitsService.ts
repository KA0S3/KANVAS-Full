/**
 * EFFECTIVE LIMITS SERVICE
 * 
 * Manages effective limits for users based on their plan and usage
 * This is a simplified version for compatibility
 */

export interface EffectiveLimits {
  maxAssets: number;
  maxProjects: number;
  maxFileSize: number; // in bytes
  maxStorage: number; // in bytes
  maxApiCalls: number;
  features: string[];
}

class EffectiveLimitsService {
  private static instance: EffectiveLimitsService;

  static getInstance(): EffectiveLimitsService {
    if (!EffectiveLimitsService.instance) {
      EffectiveLimitsService.instance = new EffectiveLimitsService();
    }
    return EffectiveLimitsService.instance;
  }

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get effective limits for a user with fallback
   */
  async getEffectiveLimitsWithFallback(userId?: string): Promise<EffectiveLimits> {
    try {
      // Try to get limits from server or auth store
      const limits = await this.getEffectiveLimits(userId);
      return limits;
    } catch (error) {
      console.warn('Failed to get effective limits, using fallback:', error);
      return this.getFallbackLimits();
    }
  }

  /**
   * Get effective limits for a user
   */
  async getEffectiveLimits(userId?: string): Promise<EffectiveLimits> {
    // In a real implementation, this would fetch from the server
    // For now, return default limits based on user plan
    const plan = await this.getUserPlan(userId);
    return this.getLimitsForPlan(plan);
  }

  /**
   * Check if user can perform an action based on limits
   */
  async canPerformAction(action: 'create_asset' | 'create_project' | 'upload_file', userId?: string): Promise<boolean> {
    const limits = await this.getEffectiveLimitsWithFallback(userId);
    const currentUsage = await this.getCurrentUsage(userId);

    switch (action) {
      case 'create_asset':
        return currentUsage.assets < limits.maxAssets;
      case 'create_project':
        return currentUsage.projects < limits.maxProjects;
      case 'upload_file':
        return currentUsage.storage < limits.maxStorage;
      default:
        return false;
    }
  }

  /**
   * Get current usage statistics
   */
  async getCurrentUsage(userId?: string): Promise<{
    assets: number;
    projects: number;
    storage: number;
    apiCalls: number;
  }> {
    // In a real implementation, this would fetch from the database
    // For now, return mock data
    return {
      assets: 0,
      projects: 0,
      storage: 0,
      apiCalls: 0
    };
  }

  // Private helper methods
  private async getUserPlan(userId?: string): Promise<string> {
    // Try to get plan from auth store
    try {
      const authStore = (window as any).__ZUSTAND_STORES__?.authStore;
      if (authStore) {
        return authStore.getState().plan || 'free';
      }
    } catch (error) {
      console.warn('Failed to get user plan from auth store:', error);
    }

    // Fallback to checking localStorage or default to free
    return localStorage.getItem('user-plan') || 'free';
  }

  private getLimitsForPlan(plan: string): EffectiveLimits {
    switch (plan) {
      case 'owner':
        return {
          maxAssets: 10000,
          maxProjects: 100,
          maxFileSize: 100 * 1024 * 1024, // 100MB
          maxStorage: 10 * 1024 * 1024 * 1024, // 10GB
          maxApiCalls: 100000,
          features: ['all']
        };
      case 'pro':
        return {
          maxAssets: 1000,
          maxProjects: 20,
          maxFileSize: 50 * 1024 * 1024, // 50MB
          maxStorage: 1 * 1024 * 1024 * 1024, // 1GB
          maxApiCalls: 10000,
          features: ['advanced', 'sync', 'export']
        };
      case 'free':
      default:
        return {
          maxAssets: 100,
          maxProjects: 3,
          maxFileSize: 10 * 1024 * 1024, // 10MB
          maxStorage: 100 * 1024 * 1024, // 100MB
          maxApiCalls: 1000,
          features: ['basic']
        };
    }
  }

  private getFallbackLimits(): EffectiveLimits {
    return {
      maxAssets: 100,
      maxProjects: 3,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxStorage: 100 * 1024 * 1024, // 100MB
      maxApiCalls: 1000,
      features: ['basic']
    };
  }
}

// Export singleton instance and function for backward compatibility
export const effectiveLimitsService = EffectiveLimitsService.getInstance();
export const getEffectiveLimitsWithFallback = (userId?: string) => 
  effectiveLimitsService.getEffectiveLimitsWithFallback(userId);
