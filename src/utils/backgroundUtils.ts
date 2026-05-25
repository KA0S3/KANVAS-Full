import type { BackgroundConfig, BackgroundMode } from '@/types/background';

export function isColorPickerVisible(config: BackgroundConfig | null): boolean {
  return config?.mode === "color";
}

export function getModeFromToggles(isClear: boolean, useParchment: boolean): BackgroundMode {
  if (useParchment) {
    return "parchment";
  } else if (isClear) {
    return "glass";
  } else {
    return "color";
  }
}

export function getTogglesFromMode(mode: BackgroundMode): { isClear: boolean; useParchment: boolean } {
  switch (mode) {
    case "glass":
      return { isClear: true, useParchment: false };
    case "parchment":
      return { isClear: false, useParchment: true };
    case "color":
      return { isClear: false, useParchment: false };
  }
}

export function getBackgroundColor(config: BackgroundConfig | null): string {
  if (!config) return "transparent";
  switch (config.mode) {
    case "glass":
      return "rgba(72, 72, 76, 0.74)";
    case "parchment":
      return config.color || "#eed4aa";
    case "color":
      return config.color || "#000000";
    default:
      return "transparent";
  }
}

export function shouldShowParchmentOverlay(config: BackgroundConfig | null): boolean {
  return config?.mode === "parchment";
}

export function shouldShowGlassEffect(config: BackgroundConfig | null): boolean {
  return config?.mode === "glass";
}

export function validateBackgroundConfig(config: Partial<BackgroundConfig>): BackgroundConfig {
  const validated: BackgroundConfig = {
    mode: config.mode || "glass",
    color: config.color || null,
    imageUrl: config.imageUrl || null,
    position: config.position || { x: 0, y: 0 },
    scale: config.scale || 1,
    edgeOpacity: config.edgeOpacity || 1,
    innerRadius: config.innerRadius || 0.3,
    outerRadius: config.outerRadius || 0.8,
    gridSize: config.gridSize || 40,
    imageSize: config.imageSize,
  };

  // Ensure mode is valid
  if (!["glass", "parchment", "color"].includes(validated.mode)) {
    validated.mode = "glass";
  }

  // Ensure color is only set when mode is "color"
  if (validated.mode !== "color") {
    validated.color = null;
  }

  return validated;
}
