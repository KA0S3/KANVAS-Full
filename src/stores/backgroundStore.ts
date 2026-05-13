/**
 * BACKGROUND STORE - Background management
 * 
 * Simple store for managing canvas backgrounds and settings
 * This is a simplified version for compatibility
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DEFAULT_BACKGROUND_CONFIG,
  type BackgroundConfig,
  type BackgroundMode,
} from '@/types/background';

interface Background {
  id: string;
  type: 'color' | 'image' | 'gradient';
  value: string;
  opacity?: number;
  position?: 'center' | 'cover' | 'repeat';
}

interface BackgroundStoreState {
  backgrounds: Record<string, Background>;
  currentBackgroundId: string | null;
  configs: Record<string, BackgroundConfig>;
  
  // Actions
  addBackground: (background: Background) => void;
  removeBackground: (backgroundId: string) => void;
  updateBackground: (backgroundId: string, updates: Partial<Background>) => void;
  setCurrentBackground: (backgroundId: string | null) => void;
  getCurrentBackground: () => Background | undefined;
  getAllBackgrounds: () => Background[];

  // BackgroundConfig API used by viewport background editors
  getBackground: (assetId: string) => BackgroundConfig;
  setBackground: (assetId: string, config: BackgroundConfig | null) => void;
  cloneConfig: (config: BackgroundConfig) => BackgroundConfig;
  migrateLegacyConfig: (legacyConfig: any) => BackgroundConfig;
  cleanup: () => void;
}

// Helper function for backward compatibility
export const getAssetKeyWithBook = (assetId: string, bookId?: string) => {
  return `${bookId || 'default'}:${assetId}`;
};

const cloneBackgroundConfig = (config: BackgroundConfig): BackgroundConfig =>
  JSON.parse(JSON.stringify(config));

const normalizeBackgroundConfig = (config?: Partial<BackgroundConfig> | null): BackgroundConfig => ({
  ...cloneBackgroundConfig(DEFAULT_BACKGROUND_CONFIG),
  ...(config || {}),
  mode: (config?.mode && ['glass', 'parchment', 'color'].includes(config.mode)
    ? config.mode
    : DEFAULT_BACKGROUND_CONFIG.mode) as BackgroundMode,
  color: config?.color ?? null,
  imageUrl: config?.imageUrl ?? null,
  position: config?.position || DEFAULT_BACKGROUND_CONFIG.position,
  scale: config?.scale ?? DEFAULT_BACKGROUND_CONFIG.scale,
  edgeOpacity: config?.edgeOpacity ?? DEFAULT_BACKGROUND_CONFIG.edgeOpacity,
  innerRadius: config?.innerRadius ?? DEFAULT_BACKGROUND_CONFIG.innerRadius,
  outerRadius: config?.outerRadius ?? DEFAULT_BACKGROUND_CONFIG.outerRadius,
  gridSize: config?.gridSize ?? DEFAULT_BACKGROUND_CONFIG.gridSize,
});

const migrateLegacyConfig = (legacyConfig: any): BackgroundConfig => {
  if (!legacyConfig) {
    return cloneBackgroundConfig(DEFAULT_BACKGROUND_CONFIG);
  }

  const mode: BackgroundMode = legacyConfig.useParchment
    ? 'parchment'
    : legacyConfig.isClear
      ? 'glass'
      : 'color';

  return normalizeBackgroundConfig({
    mode: legacyConfig.mode || mode,
    color: legacyConfig.color ?? null,
    imageUrl: legacyConfig.imageUrl ?? legacyConfig.image ?? null,
    position: legacyConfig.position,
    scale: legacyConfig.scale,
    edgeOpacity: legacyConfig.edgeOpacity,
    innerRadius: legacyConfig.innerRadius,
    outerRadius: legacyConfig.outerRadius,
    gridSize: legacyConfig.gridSize,
    imageSize: legacyConfig.imageSize,
  });
};

export const useBackgroundStore = create<BackgroundStoreState>()(
  persist(
    (set, get) => ({
      // Initial state
      backgrounds: {},
      currentBackgroundId: null,
      configs: {},

      // Add a background
      addBackground: (background: Background) => {
        set(state => ({
          backgrounds: {
            ...state.backgrounds,
            [background.id]: background
          }
        }));
      },

      // Remove a background
      removeBackground: (backgroundId: string) => {
        set(state => {
          const newBackgrounds = { ...state.backgrounds };
          delete newBackgrounds[backgroundId];
          
          // Clear current background if it was the removed one
          const newCurrentBackgroundId = state.currentBackgroundId === backgroundId ? null : state.currentBackgroundId;
          
          return {
            backgrounds: newBackgrounds,
            currentBackgroundId: newCurrentBackgroundId
          };
        });
      },

      // Update a background
      updateBackground: (backgroundId: string, updates: Partial<Background>) => {
        set(state => ({
          backgrounds: {
            ...state.backgrounds,
            [backgroundId]: state.backgrounds[backgroundId] 
              ? { ...state.backgrounds[backgroundId], ...updates }
              : undefined
          }
        }));
      },

      // Set current background
      setCurrentBackground: (backgroundId: string | null) => {
        set({ currentBackgroundId: backgroundId });
      },

      // Get current background
      getCurrentBackground: () => {
        const { currentBackgroundId, backgrounds } = get();
        return currentBackgroundId ? backgrounds[currentBackgroundId] : undefined;
      },

      // Get all backgrounds
      getAllBackgrounds: () => {
        return Object.values(get().backgrounds);
      },

      getBackground: (assetId: string) => {
        const config = get().configs[assetId];
        return config
          ? cloneBackgroundConfig(config)
          : cloneBackgroundConfig(DEFAULT_BACKGROUND_CONFIG);
      },

      setBackground: (assetId: string, config: BackgroundConfig | null) => {
        set(state => {
          const nextConfigs = { ...state.configs };

          if (!config) {
            delete nextConfigs[assetId];
          } else {
            nextConfigs[assetId] = normalizeBackgroundConfig(config);
          }

          return { configs: nextConfigs };
        });
      },

      cloneConfig: cloneBackgroundConfig,

      migrateLegacyConfig,

      cleanup: () => {
        set({ configs: {} });
      }
    }),
    {
      name: 'background-store',
      partialize: (state) => ({
        backgrounds: state.backgrounds,
        currentBackgroundId: state.currentBackgroundId,
        configs: state.configs
      })
    }
  )
);
