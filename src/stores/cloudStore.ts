/**
 * CLOUD STORE - Quota and Cloud Storage Management
 * 
 * Handles cloud storage quotas and limits based on user plans
 * This is a simplified version for the new architecture
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface CloudStoreState {
  // Current quota limits
  quotaUsed: number;
  quotaLimit: number;
  lastQuotaUpdate: string | null;
  
  // Actions
  updateQuotaBasedOnPlan: () => void;
  setQuotaUsed: (used: number) => void;
  setQuotaLimit: (limit: number) => void;
  resetQuota: () => void;
}

export const useCloudStore = create<CloudStoreState>()(
  persist(
    (set, get) => ({
      // Initial state
      quotaUsed: 0,
      quotaLimit: 100, // Default limit
      lastQuotaUpdate: null,

      // Update quota based on current plan (simplified)
      updateQuotaBasedOnPlan: () => {
        // In the new architecture, this would read from authStore
        // For now, implement basic quota management
        const state = get();
        
        // Get current plan from authStore (simplified)
        const authStore = (window as any).__ZUSTAND_STORES__?.authStore;
        if (authStore) {
          const plan = authStore.getState().plan;
          const effectiveLimits = authStore.getState().effectiveLimits;
          
          // Update quota limit based on plan
          let newLimit = 100; // Default
          if (plan === 'owner') {
            newLimit = effectiveLimits?.maxAssets || 1000;
          } else if (plan === 'pro') {
            newLimit = effectiveLimits?.maxAssets || 500;
          } else if (plan === 'free') {
            newLimit = effectiveLimits?.maxAssets || 100;
          }
          
          set({
            quotaLimit: newLimit,
            lastQuotaUpdate: new Date().toISOString()
          });
        }
      },

      // Set current quota usage
      setQuotaUsed: (used: number) => {
        set({ quotaUsed: used });
      },

      // Set quota limit
      setQuotaLimit: (limit: number) => {
        set({ quotaLimit: limit });
      },

      // Reset quota to defaults
      resetQuota: () => {
        set({
          quotaUsed: 0,
          quotaLimit: 100,
          lastQuotaUpdate: new Date().toISOString()
        });
      }
    }),
    {
      name: 'cloud-store',
      partialize: (state) => ({
        quotaUsed: state.quotaUsed,
        quotaLimit: state.quotaLimit,
        lastQuotaUpdate: state.lastQuotaUpdate
      })
    }
  )
);

// Export the function for backward compatibility
export const updateQuotaBasedOnPlan = () => {
  useCloudStore.getState().updateQuotaBasedOnPlan();
};
