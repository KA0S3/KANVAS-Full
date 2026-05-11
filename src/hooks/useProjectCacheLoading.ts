/**
 * useProjectCacheLoading Hook
 * 
 * Provides loading state management for project cache operations.
 * Integrates with existing UI loading patterns to show
 * non-moving loading indicators instead of save symbols.
 */

import { useState, useEffect } from 'react';
import { projectCacheService } from '@/services/projectCacheService';

export interface CacheLoadingState {
  isRefreshing: boolean;
  isPopulating: boolean;
  lastRefreshTime: number | null;
  error: string | null;
}

export function useProjectCacheLoading(): CacheLoadingState & {
  refreshCache: () => Promise<void>;
  clearError: () => void;
} {
  const [loadingState, setLoadingState] = useState<CacheLoadingState>({
    isRefreshing: false,
    isPopulating: false,
    lastRefreshTime: null,
    error: null,
  });

  // Listen to cache service events
  useEffect(() => {
    let isSubscribed = true;

    const updateLoadingState = () => {
      if (!isSubscribed) return;
      
      const stats = projectCacheService.getCacheStats();
      setLoadingState(prev => ({
        ...prev,
        isRefreshing: stats.isStale && stats.projectCount > 0,
        lastRefreshTime: stats.lastUpdated || null,
        error: null,
      }));
    };

    // Initial state
    updateLoadingState();

    // Set up polling for loading state updates
    const interval = setInterval(updateLoadingState, 1000);

    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, []);

  const refreshCache = async () => {
    setLoadingState(prev => ({ ...prev, isRefreshing: true, error: null }));
    
    try {
      await projectCacheService.populateCache(true); // Force refresh
      setLoadingState(prev => ({
        ...prev,
        isRefreshing: false,
        lastRefreshTime: Date.now(),
      }));
    } catch (error) {
      setLoadingState(prev => ({
        ...prev,
        isRefreshing: false,
        error: error instanceof Error ? error.message : 'Failed to refresh cache',
      }));
    }
  };

  const clearError = () => {
    setLoadingState(prev => ({ ...prev, error: null }));
  };

  return {
    ...loadingState,
    refreshCache,
    clearError,
  };
}
