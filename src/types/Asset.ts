/**
 * CANONICAL ASSET INTERFACE - Single Source of Truth
 * 
 * This is the ONLY asset structure allowed in the system.
 * All assets must conform to this exact schema - NO exceptions.
 * 
 * 🔒 SCHEMA GOVERNANCE: This interface is immutable and sacred
 * - One Structure: All assets use this EXACT structure
 * - Behavior via Configuration: Rendering derives ONLY from behavior.renderMode
 * - Unified Persistence: Single serialization format - NO branching
 * - State Separation: Runtime state NEVER mixes with canonical data
 * 
 * Updated to use TEXT-based IDs instead of UUIDs for better readability and user context
 * New ID format: {prefix}_{userShortId}_{timestampBase36}_{randomChars}
 */

import { z } from 'zod';
import { createId } from '@/utils/id';
import { generateAssetId } from '@/lib/idGenerator';

// Core identity (Immutable)
export interface AssetIdentity {
  id: string;
  projectId: string;
  parentId?: string;
}

// Layout & Position (Normalized)
export interface AssetLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  scale?: number;
  rotation?: number;
  zIndex?: number;
}

// Content & Data (Highly Dynamic Fields Nested)
export interface AssetContent {
  title?: string;
  description?: string;
  imageUrl?: string;  // Reference ONLY, never embedded
  text?: string;
  customFields?: Record<string, any>;  // Catch-all for extensibility
}

// Visual Style (Normalized)
export interface AssetStyle {
  background?: any;
  tagColor?: string;
  border?: any;
  shape?: string;
  opacity?: number;
}

// Behavior Configuration (CONTROLLED EXTENSIBILITY)
export interface AssetBehavior {
  renderMode?: string;  // NEVER evolves into asset type branching
  interactions?: Record<string, any>;  // Nested to prevent top-level bloat
  viewport?: {
    zoom?: number;
    panX?: number;
    panY?: number;
  };
}

// System Metadata (Persistent ONLY)
export interface AssetMetadata {
  tags?: string[];
  createdAt: string;
  updatedAt: string;
  version: number;  // Simple integer for last-write-wins
}

/**
 * SINGLE CANONICAL ASSET STRUCTURE
 * This is the only asset type allowed in the system
 */
export interface Asset {
  // Core Identity (Immutable)
  id: string;
  projectId: string;
  parentId?: string;

  // Layout & Position (Normalized)
  layout: AssetLayout;

  // Content & Data (Highly Dynamic Fields Nested)
  content: AssetContent;

  // Visual Style (Normalized)
  style: AssetStyle;

  // Behavior Configuration (CONTROLLED EXTENSIBILITY)
  behavior: AssetBehavior;

  // System Metadata (Persistent ONLY)
  metadata: AssetMetadata;
}

// Zod schema for runtime validation (updated for TEXT-based IDs)
// Note: Frontend accepts any non-empty string for IDs to support both legacy and new formats
// New assets are generated with the proper format, but old IDs are still accepted for compatibility
export const AssetIdentitySchema = z.object({
  id: z.string().min(1, "Asset ID cannot be empty"),
  projectId: z.string().min(1, "Project ID cannot be empty"),
  parentId: z.string().min(1, "Parent ID cannot be empty").optional().or(z.literal(null)),
});

export const AssetLayoutSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  scale: z.number().positive().optional(),
  rotation: z.number().optional(),
  zIndex: z.number().int().optional(),
});

export const AssetContentSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  imageUrl: z.string().optional(),
  text: z.string().optional(),
  customFields: z.record(z.any()).optional(),
});

export const AssetStyleSchema = z.object({
  background: z.any().optional(),
  tagColor: z.string().optional(),
  border: z.any().optional(),
  shape: z.string().optional(),
  opacity: z.number().min(0).max(1).optional(),
});

export const AssetBehaviorSchema = z.object({
  renderMode: z.string().optional(),
  interactions: z.record(z.any()).optional(),
  viewport: z.object({
    zoom: z.number().positive().optional(),
    panX: z.number().optional(),
    panY: z.number().optional(),
  }).optional(),
});

export const AssetMetadataSchema = z.object({
  tags: z.array(z.string()).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  version: z.number().int().min(0),
});

export const AssetSchema = z.object({
  id: z.string().min(1, "Asset ID cannot be empty"),
  projectId: z.string().min(1, "Project ID cannot be empty"),
  parentId: z.string().min(1, "Parent ID cannot be empty").optional().or(z.literal(null)),
  layout: AssetLayoutSchema,
  content: AssetContentSchema,
  style: AssetStyleSchema,
  behavior: AssetBehaviorSchema,
  metadata: AssetMetadataSchema,
});

// Type guards
export function isValidAsset(obj: any): obj is Asset {
  return AssetSchema.safeParse(obj).success;
}

// Helper function to create a new asset with proper defaults (updated for TEXT-based IDs)
export function createCanonicalAsset(
  projectId: string,
  overrides: Partial<Asset> = {}
): Asset {
  const now = new Date().toISOString();
  
  // Ensure projectId is always a valid non-empty string
  const finalProjectId = projectId || 'default';
  if (!finalProjectId || typeof finalProjectId !== 'string') {
    throw new Error(`Invalid projectId: ${projectId}`);
  }
  
  // Get user ID for ID generation
  let userId = undefined;
  try {
    const authStore = require('@/stores/authStore').useAuthStore.getState();
    userId = authStore.user?.id;
  } catch (e) {
    // Auth store not available, will use 'guest' prefix
  }
  
  // Always generate a valid ID if not provided
  const finalId = overrides.id || generateAssetId(userId);
  if (!finalId || typeof finalId !== 'string' || finalId.trim().length === 0) {
    throw new Error(`Invalid or empty asset ID: ${finalId}`);
  }

  const defaultAsset: Asset = {
    // Core Identity
    id: finalId,
    projectId: finalProjectId,

    // Layout & Position
    layout: {
      x: 0,
      y: 0,
      width: 200,
      height: 150,
      zIndex: 0,
    },

    // Content & Data
    content: {
      title: '',
      customFields: {},
    },

    // Visual Style
    style: {},

    // Behavior Configuration
    behavior: {},

    // System Metadata
    metadata: {
      createdAt: now,
      updatedAt: now,
      version: 1,
    },
  };

  // Deep merge overrides with defaults - ensure identity fields are never overridden with empty values
  const mergedAsset: Asset = {
    id: finalId,
    projectId: finalProjectId,
    parentId: overrides.parentId || undefined,
    layout: { ...defaultAsset.layout, ...(overrides.layout || {}) },
    content: { ...defaultAsset.content, ...(overrides.content || {}) },
    style: { ...defaultAsset.style, ...(overrides.style || {}) },
    behavior: { ...defaultAsset.behavior, ...(overrides.behavior || {}) },
    metadata: { 
      ...defaultAsset.metadata, 
      ...(overrides.metadata || {}),
      createdAt: (overrides.metadata?.createdAt) || now,
      updatedAt: now,
      version: (overrides.metadata?.version) ?? 1
    },
  };

  // Validate the merged asset
  const validation = AssetSchema.safeParse(mergedAsset);
  if (!validation.success) {
    // Provide detailed error for debugging
    const errors = validation.error.flatten();
    console.error('Asset validation failed:', {
      asset: mergedAsset,
      errors: errors,
    });
    throw new Error(`Invalid asset structure: ${JSON.stringify(errors.fieldErrors)}`);
  }

  return validation.data as Asset;
}

// Strict validation function that throws errors for invalid assets
export function validateAssetStrict(asset: unknown): asserts asset is Asset {
  const validation = AssetSchema.safeParse(asset);
  if (!validation.success) {
    throw new Error(`Invalid asset structure: ${validation.error.message}`);
  }
}
