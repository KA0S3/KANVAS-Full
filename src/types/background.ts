/**
 * Background Configuration Types
 * Strict mode-based background system with per-asset storage
 */

export type BackgroundMode = "glass" | "parchment" | "color";

export interface BackgroundConfig {
  mode: BackgroundMode;
  color: string | null;
  imageUrl: string | null;
  position?: { x: number; y: number };
  scale?: number;
  edgeOpacity?: number;
  innerRadius?: number;
  outerRadius?: number;
  gridSize?: number;
  imageSize?: { width: number; height: number };
}

export interface BackgroundStore {
  configs: Record<string, BackgroundConfig>;
  getBackground: (assetId: string) => BackgroundConfig;
  setBackground: (assetId: string, config: BackgroundConfig) => void;
  cloneConfig: (config: BackgroundConfig) => BackgroundConfig;
  migrateLegacyConfig: (legacyConfig: any) => BackgroundConfig;
  cleanup: () => void;
}

export const DEFAULT_BACKGROUND_CONFIG: BackgroundConfig = {
  mode: "glass",
  color: null,
  imageUrl: null,
  position: { x: 0, y: 0 },
  scale: 1,
  edgeOpacity: 1,
  innerRadius: 0.3,
  outerRadius: 0.8,
  gridSize: 40,
};

export function createBackgroundConfig(overrides: Partial<BackgroundConfig> = {}): BackgroundConfig {
  return {
    ...DEFAULT_BACKGROUND_CONFIG,
    ...overrides,
  };
}

export function isValidBackgroundMode(mode: string): mode is BackgroundMode {
  return mode === "glass" || mode === "parchment" || mode === "color";
}

export function getAssetKey(assetId: string, bookId?: string): string {
  if (assetId === "root" && bookId) {
    return `root:${bookId}`;
  }
  return `asset:${assetId}`;
}
