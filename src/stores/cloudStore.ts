import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { connectivityService } from '@/services/connectivityService';
import { useAuthStore } from './authStore';
import { getPlanConfig } from '@/config/plans';

interface Quota {
  used: number;
  available: number;
}

interface SyncQueueItem {
  id: string;
  type: 'asset' | 'background' | 'project';
  data: any;
  timestamp: number;
  retryCount: number;
  lastRetryTime?: number;
}

interface CloudStore {
  syncEnabled: boolean;
  quota: Quota;
  pendingUploads: number;
  autosaveStatus: 'idle' | 'saving' | 'saved' | 'error';
  lastSyncTime: Date | null;
  isOnline: boolean;
  syncQueue: SyncQueueItem[];
  offlineMode: boolean;
  lastSyncError: string | null;
  
  // Methods
  toggleSync: () => void;
  setQuota: (used: number, available: number) => void;
  canUpload: (bytes: number) => boolean;
  forceUpdateSync: () => void; // Debug method
  setAutosaveStatus: (status: 'idle' | 'saving' | 'saved' | 'error') => void;
  setLastSyncTime: (time: Date | null) => void;
  setOnlineStatus: (online: boolean) => void;
  addToSyncQueue: (item: Omit<SyncQueueItem, 'id' | 'timestamp' | 'retryCount'>) => void;
  removeFromSyncQueue: (id: string) => void;
  clearSyncQueue: () => void;
  setLastSyncError: (error: string | null) => void;
  updateQuotaUsage: (bytes: number) => void;
}

// Helper function to get quota limit from plans configuration
const getQuotaLimitForPlan = (planType: string): number => {
  const planConfig = getPlanConfig(planType);
  return planConfig ? planConfig.quotaBytes : 100 * 1024 * 1024; // Fallback to 100MB
};

export const useCloudStore = create<CloudStore>()(
  persist(
    (set, get) => ({
      // Initial state
      syncEnabled: true,
      quota: {
        used: 0,
        available: getQuotaLimitForPlan('free'),
      },
      pendingUploads: 0,
      autosaveStatus: 'idle',
      lastSyncTime: null,
      isOnline: connectivityService.isOnline(),
      syncQueue: [],
      offlineMode: false,
      lastSyncError: null,

      // Toggle sync functionality
      toggleSync: () => {
        set((state) => ({
          syncEnabled: !state.syncEnabled,
        }));
      },

      // Set quota values
      setQuota: (used: number, available: number) => {
        set({
          quota: {
            used,
            available,
          },
        });
      },

      // Check if upload is possible within quota
      canUpload: (bytes: number): boolean => {
        const { syncEnabled, quota, isOnline } = get();
        const effectiveLimits = useAuthStore.getState().effectiveLimits;
        
        // If sync is disabled or offline, no cloud features active
        if (!syncEnabled || !isOnline) {
          return false;
        }
        
        // Use effectiveLimits.quotaBytes if available, otherwise fallback to quota.available
        const quotaLimit = effectiveLimits?.quotaBytes || quota.available;
        
        // Check if upload would exceed quota
        return (quota.used + bytes) <= quotaLimit;
      },

      // Debug method to force sync update
      forceUpdateSync: () => {
        console.log('[cloudStore] Force updating sync status...');
        updateQuotaBasedOnPlan();
      },

      // Set autosave status
      setAutosaveStatus: (status: 'idle' | 'saving' | 'saved' | 'error') => {
        set({ autosaveStatus: status });
      },

      // Set last sync time
      setLastSyncTime: (time: Date | null) => {
        set({ lastSyncTime: time });
      },

      // Set online status
      setOnlineStatus: (online: boolean) => {
        const wasOffline = !get().isOnline;
        set({ 
          isOnline: online,
          offlineMode: !online,
          lastSyncError: online ? null : get().lastSyncError
        });
        
        // If coming back online, trigger sync queue processing
        if (online && wasOffline && get().syncQueue.length > 0) {
          console.log('[cloudStore] Back online, processing sync queue...');
          // This will be handled by the sync service
        }
      },

      // Add item to sync queue
      addToSyncQueue: (item: Omit<SyncQueueItem, 'id' | 'timestamp' | 'retryCount'>) => {
        const queueItem: SyncQueueItem = {
          ...item,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          retryCount: 0,
        };
        
        set((state) => ({
          syncQueue: [...state.syncQueue, queueItem],
          pendingUploads: state.pendingUploads + 1,
        }));
        
        console.log('[cloudStore] Added item to sync queue:', queueItem.type);
      },

      // Remove item from sync queue
      removeFromSyncQueue: (id: string) => {
        set((state) => {
          const newQueue = state.syncQueue.filter(item => item.id !== id);
          return {
            syncQueue: newQueue,
            pendingUploads: Math.max(0, state.pendingUploads - 1),
          };
        });
      },

      // Clear sync queue
      clearSyncQueue: () => {
        set({
          syncQueue: [],
          pendingUploads: 0,
        });
      },

      // Set last sync error
      setLastSyncError: (error: string | null) => {
        set({ lastSyncError: error });
      },

      // Update quota usage
      updateQuotaUsage: (bytes: number) => {
        const currentUsed = get().quota.used;
        set((state) => ({
          quota: {
            ...state.quota,
            used: Math.max(0, currentUsed + bytes),
          },
        }));
      },
    }),
    {
      name: 'kanvas-cloud',
      // Only persist cloud settings, not dynamic state like pendingUploads
      partialize: (state) => ({
        syncEnabled: state.syncEnabled,
        quota: state.quota,
        isOnline: state.isOnline,
        offlineMode: state.offlineMode,
      }),
    }
  )
);

// Helper function to get quota limit based on current plan (re-export for backward compatibility)
export const getQuotaLimitForPlanExport = (plan: string): number => {
  const planConfig = getPlanConfig(plan);
  return planConfig ? planConfig.quotaBytes : 100 * 1024 * 1024; // Fallback to 100MB
};

// Helper function to update quota based on effective limits from authStore
export const updateQuotaBasedOnPlan = () => {
  const effectiveLimits = useAuthStore.getState().effectiveLimits;
  const currentUsed = useCloudStore.getState().quota.used;
  const isAuthenticated = useAuthStore.getState().isAuthenticated;
  
  if (effectiveLimits) {
    // Use effectiveLimits.quotaBytes which includes base plan + all overrides
    const limit = effectiveLimits.quotaBytes;
    useCloudStore.getState().setQuota(currentUsed, limit);
    
    // Auto-enable sync for all authenticated users
    if (isAuthenticated) {
      const currentState = useCloudStore.getState();
      if (!currentState.syncEnabled) {
        console.log('[cloudStore] Auto-enabling sync for authenticated user');
        useCloudStore.setState({ syncEnabled: true });
      }
    }
  } else {
    // Fallback to free plan limits if effectiveLimits not available
    const limit = getQuotaLimitForPlan('free');
    useCloudStore.getState().setQuota(currentUsed, limit);
  }
};

// CRITICAL FIX: Removed duplicate online/offline event listeners
// connectivityService already handles these events to avoid duplicate handlers
// This reduces memory usage and prevents redundant state updates
