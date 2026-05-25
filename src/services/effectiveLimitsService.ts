/**
 * EFFECTIVE LIMITS SERVICE
 *
 * Desktop runtime compatibility shim.
 */

export interface EffectiveLimits {
  maxAssets: number;
  maxProjects: number;
  maxFileSize: number;
  maxStorage: number;
  maxApiCalls: number;
  features: string[];
  quotaBytes?: number;
  maxBooks?: number;
  adsEnabled?: boolean;
  importExportEnabled?: boolean;
  source?: {
    plan: string;
  };
}

export const DESKTOP_LIMITS: EffectiveLimits = {
  maxAssets: Infinity,
  maxProjects: Infinity,
  maxFileSize: Infinity,
  maxStorage: Infinity,
  maxApiCalls: Infinity,
  features: ['all'],
  quotaBytes: Infinity,
  maxBooks: Infinity,
  adsEnabled: false,
  importExportEnabled: true,
  source: {
    plan: 'desktop',
  },
};

class EffectiveLimitsService {
  private static instance: EffectiveLimitsService;

  static getInstance(): EffectiveLimitsService {
    if (!EffectiveLimitsService.instance) {
      EffectiveLimitsService.instance = new EffectiveLimitsService();
    }
    return EffectiveLimitsService.instance;
  }

  async getEffectiveLimitsWithFallback(userId?: string): Promise<EffectiveLimits> {
    return DESKTOP_LIMITS;
  }

  async getEffectiveLimits(userId?: string): Promise<EffectiveLimits> {
    return DESKTOP_LIMITS;
  }

  async canPerformAction(action: 'create_asset' | 'create_project' | 'upload_file', userId?: string): Promise<boolean> {
    return true;
  }

  async getCurrentUsage(userId?: string): Promise<{
    assets: number;
    projects: number;
    storage: number;
    apiCalls: number;
  }> {
    return {
      assets: 0,
      projects: 0,
      storage: 0,
      apiCalls: 0,
    };
  }
}

export const effectiveLimitsService = EffectiveLimitsService.getInstance();
export const getEffectiveLimitsWithFallback = (userId?: string) =>
  effectiveLimitsService.getEffectiveLimitsWithFallback(userId);
