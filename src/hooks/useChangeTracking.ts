/**
 * Change Tracking Hook - V2 Architecture
 *
 * Integrates with the new unified persistence system
 * Provides automatic change tracking for asset mutations using V2 stores
 *
 * 🔒 CRITICAL: Uses only V2 stores - no legacy DocumentMutationService
 */

import { useEffect } from 'react';
import { useKanvasStore } from '@/stores/kanvasStore';
import { useSyncStore } from '@/stores/syncStore';
import { syncProcessor } from '@/sync/processor';

/**
 * Hook to integrate change tracking with V2 asset store
 * Call this when loading a project to start tracking changes
 */
export function useChangeTracking(projectId: string | null) {
  const { currentProjectId } = useKanvasStore();
  const { syncQueue, syncStatus } = useSyncStore();

  useEffect(() => {
    if (!projectId) {
      // Project unloaded - sync processor handles cleanup
      return;
    }

    // Load sync queue for this project
    useSyncStore.getState().loadSyncQueue(projectId);

    return () => {
      // Cleanup handled automatically by stores
    };
  }, [projectId]);

  return {
    hasUnsavedChanges: () => syncQueue.size > 0,
    manualSave: async () => {
      await syncProcessor.forceProcess();
    },
    setCurrentProjectVersion: (version: number) => {
      console.warn('Version tracking is now per-asset in metadata');
    }
  };
}

/**
 * Hook to track asset position changes
 * Use this in drag handlers
 */
export function usePositionTracking() {
  const { getAsset, updateAsset } = useKanvasStore();

  const trackPositionChange = async (assetId: string, x: number, y: number, zIndex: number = 0) => {
    const asset = getAsset(assetId);
    if (!asset) return;

    await updateAsset(assetId, {
      layout: {
        ...asset.layout,
        x,
        y,
        zIndex,
      }
    });
  };

  const flushPositionChanges = async () => {
    await syncProcessor.forceProcess();
  };

  return {
    trackPositionChange,
    flushPositionChanges
  };
}

/**
 * Hook to track asset metadata changes
 * Use this when asset name, type, or other metadata changes
 */
export function useMetadataTracking() {
  const { getAsset, updateAsset } = useKanvasStore();

  const trackMetadataChange = async (assetId: string) => {
    const asset = getAsset(assetId);
    if (!asset) return;

    // Update timestamp to mark as changed
    await updateAsset(assetId, {
      metadata: {
        ...asset.metadata,
        updatedAt: new Date().toISOString(),
      }
    });
  };

  return {
    trackMetadataChange
  };
}

/**
 * Hook to track typing changes (debounced)
 * Use this for text input fields
 */
export function useTypingTracking() {
  const { getAsset, updateAsset } = useKanvasStore();

  const trackTypingChange = async (assetId: string, newValue: string) => {
    const asset = getAsset(assetId);
    if (!asset) return;

    // Update the asset content
    await updateAsset(assetId, {
      content: {
        ...asset.content,
        text: newValue,
      }
    });
  };

  return {
    trackTypingChange
  };
}
