import { useEffect, useState } from 'react';
import { documentMutationService, type SyncStatus } from '@/services/DocumentMutationService';
import { useAuthStore } from '@/stores/authStore';

export function useDocumentSync() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    lastSyncTime: null,
    syncEnabled: false,
    pendingChanges: false,
    onlineMode: false,
    quotaExceeded: false,
    storageUsed: 0,
    storageLimit: 0,
    syncInProgress: false,
    queuedItems: 0,
    documentVersion: 1
  });
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    // Subscribe to sync status updates
    const unsubscribe = documentMutationService.subscribe((status) => {
      setSyncStatus(status);
    });

    // Initial status check
    setSyncStatus(documentMutationService.getStatus());

    return () => {
      unsubscribe();
    };
  }, [isAuthenticated]);

  const triggerSync = async () => {
    return await documentMutationService.syncNow();
  };

  const loadFromCloud = async (projectId: string) => {
    const result = await documentMutationService.loadDocument(projectId);
    return result.success;
  };

  // State-based tracking methods (MASTER_PLAN.md)
  const markAssetChanged = documentMutationService.markAssetChanged.bind(documentMutationService);
  const markPositionChanged = documentMutationService.markPositionChanged.bind(documentMutationService);
  const markAssetDeleted = documentMutationService.markAssetDeleted.bind(documentMutationService);
  const saveGlobalBackgrounds = documentMutationService.saveGlobalBackgrounds.bind(documentMutationService);
  const saveViewport = documentMutationService.saveViewport.bind(documentMutationService);
  const saveGlobalTags = documentMutationService.saveGlobalTags.bind(documentMutationService);
  
  // Enhanced metadata sync methods
  const saveAssetBackground = documentMutationService.saveAssetBackground.bind(documentMutationService);
  const saveGlobalCustomFields = documentMutationService.saveGlobalCustomFields.bind(documentMutationService);
  const saveCoverMetadata = documentMutationService.saveCoverMetadata.bind(documentMutationService);

  return {
    syncStatus,
    triggerSync,
    loadFromCloud,
    // State-based tracking methods (MASTER_PLAN.md)
    markAssetChanged,
    markPositionChanged,
    markAssetDeleted,
    saveGlobalBackgrounds,
    saveViewport,
    saveGlobalTags,
    // Enhanced metadata sync methods
    saveAssetBackground,
    saveGlobalCustomFields,
    saveCoverMetadata,
    // Comprehensive sync status
    isAuthenticated,
    isOnline: syncStatus.onlineMode,
    lastSyncTime: syncStatus.lastSyncTime,
    syncEnabled: syncStatus.syncEnabled,
    quotaExceeded: syncStatus.quotaExceeded,
    storageUsed: syncStatus.storageUsed,
    storageLimit: syncStatus.storageLimit,
    storagePercentage: syncStatus.storageLimit > 0
      ? (syncStatus.storageUsed / syncStatus.storageLimit) * 100
      : 0,
    documentVersion: syncStatus.documentVersion,
    pendingChanges: syncStatus.pendingChanges,
    syncInProgress: syncStatus.syncInProgress,
    queuedItems: syncStatus.queuedItems,
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
