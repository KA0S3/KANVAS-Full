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
 */

import { z } from 'zod';

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

// Zod schema for runtime validation
export const AssetIdentitySchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().min(1, "Project ID is required"),
  parentId: z.string().optional(),
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
  imageUrl: z.string().url().optional(),
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
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  parentId: z.string().uuid().optional(),
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

// Helper function to create a new asset with proper defaults
export function createCanonicalAsset(
  projectId: string,
  overrides: Partial<Asset> = {}
): Asset {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const defaultAsset: Asset = {
    // Core Identity
    id,
    projectId,

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

  // Deep merge overrides with defaults
  const mergedAsset: Asset = {
    id: overrides.id || defaultAsset.id,
    projectId: overrides.projectId || defaultAsset.projectId,
    parentId: overrides.parentId,
    layout: { ...defaultAsset.layout, ...overrides.layout },
    content: { ...defaultAsset.content, ...overrides.content },
    style: { ...defaultAsset.style, ...overrides.style },
    behavior: { ...defaultAsset.behavior, ...overrides.behavior },
    metadata: { 
      ...defaultAsset.metadata, 
      ...overrides.metadata,
      version: overrides.metadata?.version ?? defaultAsset.metadata.version 
    },
  };

  // Validate the merged asset
  const validation = AssetSchema.safeParse(mergedAsset);
  if (!validation.success) {
    throw new Error(`Invalid asset structure: ${validation.error.message}`);
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
