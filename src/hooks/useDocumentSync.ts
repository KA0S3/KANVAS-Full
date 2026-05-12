/**
 * Document Sync Hook - V2 Architecture
 *
 * Integrates with the new unified persistence system
 * Uses V2 stores for sync operations instead of legacy DocumentMutationService
 *
 * 🔒 CRITICAL: Uses only V2 stores - no legacy DocumentMutationService
 */

import { useEffect, useState } from 'react';
import { useSyncStore } from '@/stores/syncStore';
import { useKanvasStore } from '@/stores/kanvasStore';
import { useAuthStore } from '@/stores/authStore';
import { syncProcessor } from '@/sync/processor';
import { projectPersistence } from '@/persistence/projects';

export function useDocumentSync() {
  const { syncStatus, syncQueue, getSyncStatus } = useSyncStore();
  const { loadProject } = useKanvasStore();
  const { isAuthenticated } = useAuthStore();
  
  // Derived sync status for compatibility with legacy interface
  const [derivedSyncStatus, setDerivedSyncStatus] = useState({
    lastSyncTime: null as Date | null,
    syncEnabled: isAuthenticated,
    pendingChanges: false,
    onlineMode: navigator.onLine,
    quotaExceeded: false,
    storageUsed: 0,
    storageLimit: 0,
    syncInProgress: syncStatus === 'syncing',
    queuedItems: syncQueue.size,
    documentVersion: 1
  });

  useEffect(() => {
    // Update derived status when sync state changes
    setDerivedSyncStatus(prev => ({
      ...prev,
      syncEnabled: isAuthenticated,
      onlineMode: navigator.onLine,
      syncInProgress: syncStatus === 'syncing',
      queuedItems: syncQueue.size,
      pendingChanges: syncQueue.size > 0,
    }));
  }, [isAuthenticated, syncStatus, syncQueue.size]);

  const triggerSync = async () => {
    try {
      await syncProcessor.forceProcess();
      return true;
    } catch (error) {
      console.error('Sync failed:', error);
      return false;
    }
  };

  const loadFromCloud = async (projectId: string) => {
    try {
      await loadProject(projectId);
      return true;
    } catch (error) {
      console.error('Failed to load project:', error);
      return false;
    }
  };

  // V2 asset operations that replace legacy methods
  const markAssetChanged = async (assetId: string, asset: any) => {
    console.warn('markAssetChanged is deprecated. Use useKanvasStore.updateAsset instead');
  };

  const markPositionChanged = async (assetId: string, x: number, y: number, zIndex: number = 0) => {
    console.warn('markPositionChanged is deprecated. Use usePositionTracking hook instead');
  };

  const markAssetDeleted = async (assetId: string) => {
    console.warn('markAssetDeleted is deprecated. Use useKanvasStore.deleteAsset instead');
  };

  // Legacy compatibility methods (deprecated)
  const saveGlobalBackgrounds = () => {
    console.warn('saveGlobalBackgrounds is deprecated in V2 architecture');
  };

  const saveViewport = () => {
    console.warn('saveViewport is deprecated in V2 architecture');
  };

  const saveGlobalTags = () => {
    console.warn('saveGlobalTags is deprecated in V2 architecture');
  };

  const saveAssetBackground = () => {
    console.warn('saveAssetBackground is deprecated in V2 architecture');
  };

  const saveGlobalCustomFields = () => {
    console.warn('saveGlobalCustomFields is deprecated in V2 architecture');
  };

  const saveCoverMetadata = () => {
    console.warn('saveCoverMetadata is deprecated in V2 architecture');
  };

  return {
    syncStatus: derivedSyncStatus,
    triggerSync,
    loadFromCloud,
    // Legacy compatibility methods (deprecated)
    markAssetChanged,
    markPositionChanged,
    markAssetDeleted,
    saveGlobalBackgrounds,
    saveViewport,
    saveGlobalTags,
    saveAssetBackground,
    saveGlobalCustomFields,
    saveCoverMetadata,
    // Comprehensive sync status
    isAuthenticated,
    isOnline: derivedSyncStatus.onlineMode,
    lastSyncTime: derivedSyncStatus.lastSyncTime,
    syncEnabled: derivedSyncStatus.syncEnabled,
    quotaExceeded: derivedSyncStatus.quotaExceeded,
    storageUsed: derivedSyncStatus.storageUsed,
    storageLimit: derivedSyncStatus.storageLimit,
    storagePercentage: derivedSyncStatus.storageLimit > 0
      ? (derivedSyncStatus.storageUsed / derivedSyncStatus.storageLimit) * 100
      : 0,
    documentVersion: derivedSyncStatus.documentVersion,
    pendingChanges: derivedSyncStatus.pendingChanges,
    syncInProgress: derivedSyncStatus.syncInProgress,
    queuedItems: derivedSyncStatus.queuedItems,
    // Enhanced sync capabilities status
    hasMetadataSync: true,
    hasAssetBackgroundSync: true,
    hasCustomFieldSync: true,
    hasCoverMetadataSync: true,
    syncCapabilities: {
      assets: true,
      positions: true,
      backgrounds: true,
      tags: true,
      customFields: true,
      coverMetadata: true,
      assetBackgrounds: true,
      viewport: true
    }
  };
}
