import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { BackgroundConfig, BackgroundStore } from '@/types/background';
import { DEFAULT_BACKGROUND_CONFIG, getAssetKey } from '@/types/background';
import { getBackgroundAsync as getBackgroundFromIndexedDB, setBackgroundAsync as setBackgroundToIndexedDB, loadAllBackgroundsAsync, migrateBackgroundFormat } from '@/utils/backgroundStorage';
import { documentMutationService } from '@/services/DocumentMutationService';
import { useAssetStore } from '@/stores/assetStore';
import { storeCoordinator } from '@/services/StoreCoordinator';
import { logBackground, reportError } from '@/utils/logger';

const storeInitTime = Date.now();
logBackground('============================================');
logBackground('STORE INITIALIZING at', storeInitTime);
logBackground('============================================');

// StoreCoordinator now handles all debouncing and coordination
// Legacy debouncing removed to prevent race conditions

export const useBackgroundStore = create<BackgroundStore>()(
  subscribeWithSelector(
    (set, get) => {
      // Add cleanup on page unload to prevent memory leaks
      if (typeof window !== 'undefined') {
        window.addEventListener('beforeunload', () => storeCoordinator.cleanup());
        window.addEventListener('pagehide', () => storeCoordinator.cleanup());
      }
        // Run migration first to convert any old format backgrounds
        migrateBackgroundFormat();
        
        // Initialize configs from IndexedDB on store creation
        logBackground('Running store creator function...');
        const initialConfigs = {};
        logBackground(`Initial sync load complete: ${Object.keys(initialConfigs).length} backgrounds found`);

        // Async load from IndexedDB to restore actual image URLs
        if (Object.keys(initialConfigs).length > 0) {
          logBackground('Starting async IndexedDB load...');
          loadAllBackgroundsAsync().then(loadedConfigs => {
            const loadedCount = Object.keys(loadedConfigs).length;
            const configsWithImages = Object.entries(loadedConfigs).filter(([_, config]) => config.imageUrl).length;
            logBackground(`✅ Async load complete: ${loadedCount} configs, ${configsWithImages} with images`);
            
            // Merge loaded configs with current state (preserving any in-memory changes)
            set((state) => ({
              configs: {
                ...state.configs,
                ...loadedConfigs
              }
            }));
            logBackground('Store updated with images from IndexedDB');
          }).catch(error => {
            reportError(error, 'BackgroundStore.asyncLoad', 'Failed to load images from IndexedDB');
          });
        } else {
          logBackground('✅ Store initialized - no backgrounds to load');
        }

        return {
          configs: initialConfigs,

          getBackground: (assetId: string) => {
            const state = get();
            const key = getAssetKey(assetId);

            // Try to get from in-memory store first
            if (state.configs[key]) {
              return state.cloneConfig(state.configs[key]);
            }

            // Return default config and trigger async load from IndexedDB
            getBackgroundFromIndexedDB(assetId).then(indexedDBConfig => {
              set((state) => ({
                configs: {
                  ...state.configs,
                  [key]: indexedDBConfig,
                },
              }));
            }).catch(error => {
              reportError(error, 'BackgroundStore.getBackground', 'Failed to load from IndexedDB');
            });

            return JSON.parse(JSON.stringify(DEFAULT_BACKGROUND_CONFIG));
          },

          setBackground: (assetId: string, config: BackgroundConfig) => {
            const key = getAssetKey(assetId);
            const clonedConfig = get().cloneConfig(config);

            logBackground(`Setting background for ${assetId} (key: ${key}):`, clonedConfig.mode);

            // Update in-memory store immediately (no debounce needed for UI)
            set((state) => ({
              configs: {
                ...state.configs,
                [key]: clonedConfig,
              },
            }));

            // Use StoreCoordinator for coordinated sync instead of individual debouncing
            // This prevents race conditions with other stores
            storeCoordinator.queueSyncOperation({
              type: 'background_config',
              assetId,
              data: { config: clonedConfig },
              priority: 'medium'
            });

            // Also queue asset background update if this is an asset background
            if (key.startsWith('asset:')) {
              const actualAssetId = key.substring(6);
              storeCoordinator.queueSyncOperation({
                type: 'asset_background',
                assetId: actualAssetId,
                data: { backgroundConfig: clonedConfig },
                priority: 'medium'
              });
            }

            // Persist to IndexedDB immediately for responsive UI
            // Coordinator will handle cloud sync debouncing
            setBackgroundToIndexedDB(assetId, clonedConfig).then(() => {
              logBackground(`Saved background to IndexedDB for ${assetId}`);
            }).catch(error => {
              reportError(error, 'BackgroundStore.setBackground', 'Failed to save to IndexedDB');
            });
          },

          cloneConfig: (config: BackgroundConfig): BackgroundConfig => {
            try {
              // Use safe serialization to prevent circular reference issues
              const jsonString = JSON.stringify(config, (key, val) => {
                if (typeof val === 'object' && val !== null) {
                  // Check for circular references
                  if (val.constructor && val.constructor.name === 'Object') {
                    return val;
                  }
                  // Handle potential circular references in complex objects
                  if (key === 'parent' || key === 'children') {
                    return undefined;
                  }
                }
                return val;
              });
              return JSON.parse(jsonString);
            } catch (error) {
              reportError(error, 'BackgroundStore.cloneConfig', 'Failed to clone config');
              // Fallback to shallow clone
              return { ...config };
            }
          },

          migrateLegacyConfig: (legacyConfig: any): BackgroundConfig => {
            // Convert old toggle-based config to new mode-based config
            let mode: "glass" | "parchment" | "color" = "glass";
            
            if (legacyConfig.useParchment) {
              mode = "parchment";
            } else if (legacyConfig.isClear === false) {
              mode = "color";
            } else {
              mode = "glass";
            }

            return {
              mode,
              color: mode === "color" ? (legacyConfig.color || '#000000') : null,
              imageUrl: legacyConfig.image || null,
              position: legacyConfig.position || { x: 0, y: 0 },
              scale: legacyConfig.scale || 1,
              edgeOpacity: legacyConfig.edgeOpacity || 1,
              innerRadius: legacyConfig.innerRadius || 0.3,
              outerRadius: legacyConfig.outerRadius || 0.8,
              gridSize: legacyConfig.gridSize || 40,
              imageSize: legacyConfig.imageSize,
            };
          },

          cleanup: () => {
            storeCoordinator.cleanup();
          },
        };
      }
    )
);

// Helper function for getting asset key with book context
export function getAssetKeyWithBook(assetId: string, bookId?: string): string {
  if (assetId === "root" && bookId) {
    return `root:${bookId}`;
  }
  return `asset:${assetId}`;
}
