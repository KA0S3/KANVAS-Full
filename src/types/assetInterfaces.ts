/**
 * Unified Asset Interface Structure
 * Matches database schema with flat structure and snake_case field names
 * Eliminates mapping complexity while maintaining type safety
 */

import type { CustomField, CustomFieldValue, ViewportDisplaySettings } from "./extendedAsset";
import type { BackgroundConfig } from "./background";

// Asset type definition
export type AssetType = "image" | "document" | "video" | "audio" | "code" | "other" | "card" | "text" | "container" | "viewport" | "tag";

/**
 * Unified Asset Interface - Flat structure matching database schema
 * Uses snake_case to directly match PostgreSQL column names
 * Eliminates need for complex mapping functions
 */
export interface Asset {
  // Core database fields (snake_case to match database)
  asset_id: string;
  parent_id?: string | null;
  name: string;
  type: AssetType;
  x: number;
  y: number;
  width: number;
  height: number;
  z_index: number;
  is_expanded: boolean;
  content?: string | null;
  background_config?: BackgroundConfig;
  viewport_config?: {
    zoom: number;
    pan_x: number;
    pan_y: number;
  };
  custom_fields?: {
    customFields: CustomField[];
    customFieldValues: CustomFieldValue[];
    tags?: string[];
    viewportDisplaySettings?: ViewportDisplaySettings;
    thumbnail?: string;
    background?: string;
    description?: string;
  };
  updated_at?: string;

  // Frontend-specific fields (not stored in database)
  children: string[];
  created_at?: number;
  is_locked?: boolean;
  border_shape?: 'square' | 'circle';
  show_tag_border?: boolean;
  deleted_at?: string;

  // Cloud sync fields
  cloud_status: 'local' | 'uploading' | 'synced' | 'failed';
  cloud_id?: string;
  cloud_path?: string;
  cloud_size?: number;
  cloud_updated_at?: string;
  cloud_error?: string;
  file?: File;
}

// Type guards for checking asset capabilities
export function hasCloudCapabilities(asset: Asset): boolean {
  return 'cloud_status' in asset;
}

export function hasViewportCapabilities(asset: Asset): boolean {
  return 'viewport_config' in asset;
}

export function hasExtendedFields(asset: Asset): boolean {
  return 'custom_fields' in asset;
}

export function hasMetadata(asset: Asset): boolean {
  return 'created_at' in asset;
}

// Helper functions for creating assets with proper defaults
export function createAsset(
  name: string,
  type: AssetType,
  position: { x: number; y: number } = { x: 100, y: 100 },
  parent_id?: string | null
): Asset {
  const asset_id = crypto.randomUUID();
  const now = Date.now();
  
  return {
    // Core database fields
    asset_id,
    parent_id: parent_id || null,
    name,
    type,
    x: position.x,
    y: position.y,
    width: 200,
    height: 150,
    z_index: 0,
    is_expanded: false,
    content: null,
    background_config: {
      mode: "glass",
      color: null,
      imageUrl: null,
      position: { x: 0, y: 0 },
      scale: 1,
      edgeOpacity: 1,
      innerRadius: 0.3,
      outerRadius: 0.8,
      gridSize: 40
    },
    viewport_config: {
      zoom: 1,
      pan_x: 0,
      pan_y: 0
    },
    custom_fields: {
      customFields: [],
      customFieldValues: [],
      tags: [],
      viewportDisplaySettings: {
        name: true,
        description: false,
        thumbnail: true,
        portraitBlur: 0.2
      },
      thumbnail: '',
      background: '',
      description: ''
    },
    updated_at: new Date().toISOString(),

    // Frontend-specific fields
    children: [],
    created_at: now,
    is_locked: false,
    border_shape: 'square',
    show_tag_border: false,
    deleted_at: null,

    // Cloud sync fields
    cloud_status: 'local',
    cloud_id: null,
    cloud_path: null,
    cloud_size: null,
    cloud_updated_at: null,
    cloud_error: null,
    file: null
  };
}
