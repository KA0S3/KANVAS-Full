export interface Book {
  id: string;
  title: string;
  subheading?: string;
  description?: string;
  coverImage?: string;
  coverImageStorageKey?: string;
  hasLocalCoverImage?: boolean;
  color: string;
  gradient?: string;
  leatherColor?: string;
  isLeatherMode?: boolean;
  coverPresetId?: string; // Track which preset cover is being used
  order?: number;
  createdAt: number;
  updatedAt: number;
  worldData: WorldData;
  isDefault?: boolean;
  // Enhanced cover page settings for layered covers
  coverPageSettings?: {
    showCoverPage: boolean;
    baseStyle: 'leather' | 'gradient' | 'image';
    coverImageData?: string;
    imageOverlay?: {
      imageData: string;
      opacity: number; // 0-100
    };
    title: {
      text: string;
      position: { x: number; y: number };
      style: {
        type: 'serif' | 'sans-serif' | 'monospace' | 'cursive' | 'fantasy' | 'custom';
        customFont?: string;
        color: string;
        size: 'small' | 'medium' | 'large' | 'extra-large';
        sizePx?: number;
        outlineColor?: string;
        outlineThickness?: number;
        shadowEnabled?: boolean;
      };
    };
    description?: {
      text: string;
      position: { x: number; y: number };
      style: {
        type: 'serif' | 'sans-serif' | 'monospace' | 'cursive' | 'fantasy' | 'custom';
        customFont?: string;
        color: string;
        size: 'small' | 'medium' | 'large' | 'extra-large';
        sizePx?: number;
        outlineColor?: string;
        outlineThickness?: number;
        shadowEnabled?: boolean;
      };
    };
    subheading?: {
      text: string;
      position: { x: number; y: number };
      style: {
        type: 'serif' | 'sans-serif' | 'monospace' | 'cursive' | 'fantasy' | 'custom';
        customFont?: string;
        color: string;
        size: 'small' | 'medium' | 'large' | 'extra-large';
        sizePx?: number;
        outlineColor?: string;
        outlineThickness?: number;
        shadowEnabled?: boolean;
      };
    };
  };
}

export interface WorldData {
  assets: Record<string, any>;
  tags: Record<string, any>;
  globalCustomFields: any[];
  viewportOffset: { x: number; y: number };
  viewportScale: number;
  rootBackgroundConfig?: any;
  backgrounds?: Record<string, any>; // Background configs stored with book
}

export interface BookCoverPreset {
  id: string;
  name: string;
  color: string;
  gradient?: string;
  pattern?: string;
}

export interface LeatherColorPreset {
  id: string;
  name: string;
  color: string;
  darkVariant: string;
  lightVariant: string;
}

export type BookViewMode = 'single' | 'spine';

export interface BookLibrarySettings {
  defaultViewMode: BookViewMode;
  autoSave: boolean;
  showBookDescriptions: boolean;
}
