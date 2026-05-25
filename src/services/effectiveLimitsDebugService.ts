import { supabase } from '@/lib/supabase';
import { USE_SUPABASE } from '@/config/features';

export interface DebugStep {
  step: string;
  timestamp: string;
  input: any;
  output: any;
  source?: string;
  reason?: string;
}

export interface DebugChain {
  userId: string;
  steps: DebugStep[];
  finalLimits: {
    quotaBytes: number;
    maxBooks: number;
    adsEnabled: boolean;
    importExportEnabled: boolean;
    expiresAt?: string;
    source: {
      plan: string;
      licenseId?: string;
      ownerKeyId?: string;
    };
  };
  summary: {
    basePlan: string;
    hasLicenseOverride: boolean;
    hasOwnerKeyOverride: boolean;
    lastModified: string;
    resolutionTime: number;
  };
}

export interface DebugResponse {
  data?: DebugChain;
  error?: string;
}

/**
 * Fetch effective limits debug information from the server
 * Only accessible to owners and administrators
 */
export async function fetchEffectiveLimitsDebug(): Promise<DebugResponse> {
  if (!USE_SUPABASE) {
    return { error: 'Effective limits debug is disabled when USE_SUPABASE=false' };
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.access_token) {
      return { error: 'User not authenticated' };
    }

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/effective-limits-debug`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      if (response.status === 403) {
        return { 
          error: 'Access denied. This debug endpoint is only available to owners and administrators.' 
        };
      }
      
      return { 
        error: errorData.error || `HTTP ${response.status}: ${response.statusText}` 
      };
    }

    const data = await response.json();
    return { data };
  } catch (error) {
    console.error('Failed to fetch effective limits debug:', error);
    return { 
      error: error instanceof Error ? error.message : 'Network error occurred' 
    };
  }
}

/**
 * Format debug information for display
 */
export function formatDebugInfo(debugChain: DebugChain): {
  summary: string;
  resolutionSteps: string[];
  featureStatus: { [key: string]: { enabled: boolean; source: string; reason?: string } };
} {
  const { steps, finalLimits, summary } = debugChain;
  
  // Create summary
  const summaryText = `Base plan: ${summary.basePlan.toUpperCase()} | ` +
    `License override: ${summary.hasLicenseOverride ? 'YES' : 'NO'} | ` +
    `Owner key override: ${summary.hasOwnerKeyOverride ? 'YES' : 'NO'} | ` +
    `Last modified: ${new Date(summary.lastModified).toLocaleString()}`;
  
  // Create resolution steps
  const resolutionSteps = steps.map(step => {
    const time = new Date(step.timestamp).toLocaleTimeString();
    const action = step.step.replace('_', ' ').toUpperCase();
    const source = step.source ? ` (${step.source})` : '';
    const result = step.reason || 'Completed';
    return `${time} - ${action}${source}: ${result}`;
  });
  
  // Create feature status
  const featureStatus: { [key: string]: { enabled: boolean; source: string; reason?: string } } = {
    'ads': {
      enabled: !finalLimits.adsEnabled, // adsEnabled=true means ads are shown
      source: 'base_plan',
      reason: finalLimits.adsEnabled ? 'Ads enabled for this plan' : 'Ads disabled for this plan'
    },
    'import_export': {
      enabled: finalLimits.importExportEnabled,
      source: 'base_plan',
      reason: finalLimits.importExportEnabled ? 'Import/Export enabled' : 'Import/Export disabled'
    },
    'max_books': {
      enabled: finalLimits.maxBooks === -1,
      source: 'base_plan',
      reason: finalLimits.maxBooks === -1 ? 'Unlimited books' : `Limited to ${finalLimits.maxBooks} books`
    },
    'quota_bytes': {
      enabled: finalLimits.quotaBytes > 100 * 1024 * 1024, // More than 100MB
      source: 'base_plan',
      reason: `${(finalLimits.quotaBytes / (1024 * 1024)).toFixed(1)}MB storage`
    }
  };
  
  // Update sources based on final limits
  if (finalLimits.source.licenseId) {
    Object.keys(featureStatus).forEach(key => {
      featureStatus[key].source = 'license_override';
    });
  }
  if (finalLimits.source.ownerKeyId) {
    Object.keys(featureStatus).forEach(key => {
      if (featureStatus[key].source === 'base_plan') {
        featureStatus[key].source = 'owner_key_override';
      }
    });
  }
  
  return {
    summary: summaryText,
    resolutionSteps,
    featureStatus
  };
}
