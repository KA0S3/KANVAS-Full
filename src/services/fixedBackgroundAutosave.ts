import { useAssetStore } from '@/stores/assetStore';
import { useBookStore } from '@/stores/bookStoreSimple';
import { useBackgroundStore } from '@/stores/backgroundStore';
import { useAuthStore } from '@/stores/authStore';
import type { BackgroundConfig } from '@/types/background';
import { getAssetKeyWithBook } from '@/stores/backgroundStore';

/**
 * Fixed background autosave that prevents loops
 * Uses single source of truth and debounced saves
 */
class FixedBackgroundAutosave {
  private static instance: FixedBackgroundAutosave;
  private saveTimeout: number | null = null;
  private lastSaveTime: number = 0;
  private readonly DEBOUNCE_MS = 1000; // 1 second debounce
  private readonly MIN_SAVE_INTERVAL = 2000; // Minimum 2 seconds between saves

  static getInstance(): FixedBackgroundAutosave {
    if (!FixedBackgroundAutosave.instance) {
      FixedBackgroundAutosave.instance = new FixedBackgroundAutosave();
    }
    return FixedBackgroundAutosave.instance;
  }

  // Save background config without causing loops
  saveBackgroundConfig(assetId: string, config: BackgroundConfig, projectId?: string | null): void {
    const now = Date.now();
    
    // Prevent rapid saves
    if (now - this.lastSaveTime < this.MIN_SAVE_INTERVAL) {
      this.scheduleSave(assetId, config);
      return;
    }

    this.performSave(assetId, config, projectId);
  }

  private scheduleSave(assetId: string, config: BackgroundConfig, projectId?: string | null): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = window.setTimeout(() => {
      this.performSave(assetId, config, projectId);
    }, this.DEBOUNCE_MS);
  }

  private performSave(assetId: string, config: BackgroundConfig, projectId?: string | null): void {
    const { user, isAuthenticated } = useAuthStore.getState();
    const { currentBookId } = useBookStore.getState();
    const { updateAsset } = useAssetStore.getState();
    const { setBackground } = useBackgroundStore.getState();

    if (!isAuthenticated || !user) {
      console.log('[FixedBackgroundAutosave] Skipping save - user not authenticated');
      return;
    }

    try {
      // 1. Save to background store (single source of truth)
      const resolvedProjectId = projectId || currentBookId;
      const assetKey = getAssetKeyWithBook(assetId, resolvedProjectId || undefined);
      setBackground(assetKey, config);

      // 2. Update asset if it exists (but don't trigger store events)
      if (assetId !== 'root') {
        const asset = useAssetStore.getState().assets[assetId];
        if (asset) {
          // Direct update without triggering store subscriptions
          updateAsset(assetId, {
            backgroundConfig: this.convertToLegacyConfig(config),
          });
        }
      }

      // 3. Update world data for root background
      if (assetId === 'root' && resolvedProjectId) {
        const { updateWorldData } = useBookStore.getState();
        updateWorldData(resolvedProjectId, {
          rootBackgroundConfig: this.convertToLegacyConfig(config),
        });
      }

      this.lastSaveTime = Date.now();
      console.log(`[FixedBackgroundAutosave] Background saved for ${assetId}`);

    } catch (error) {
      console.error('[FixedBackgroundAutosave] Save failed:', error);
    }
  }

  private convertToLegacyConfig(config: BackgroundConfig): any {
    return {
      isClear: config.mode === 'glass',
      useParchment: config.mode === 'parchment',
      color: config.color,
      image: config.imageUrl,
      position: config.position,
      scale: config.scale,
      gridSize: config.gridSize,
      imageSize: config.imageSize,
      edgeOpacity: config.edgeOpacity,
    };
  }

  // Load background config on startup
  loadBackgroundConfig(assetId: string, projectId?: string | null): BackgroundConfig {
    const { currentBookId } = useBookStore.getState();
    const { getBackground } = useBackgroundStore.getState();
    
    const resolvedProjectId = projectId || currentBookId;
    const assetKey = getAssetKeyWithBook(assetId, resolvedProjectId || undefined);
    return getBackground(assetKey);
  }
}

export const fixedBackgroundAutosave = FixedBackgroundAutosave.getInstance();
