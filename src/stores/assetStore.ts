import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Asset } from '@/types/assetInterfaces';
import type { CustomField, CustomFieldValue, GlobalCustomField, ViewportDisplaySettings } from '@/types/extendedAsset';
import { DEFAULT_VIEWPORT_DISPLAY_SETTINGS } from '@/types/extendedAsset';
import { DEFAULT_BACKGROUND_CONFIG } from '@/types/background';
import { useBookStore } from './bookStoreSimple';
import { supabase } from '@/lib/supabase';
import { documentMutationService } from '@/services/DocumentMutationService';
import { undoService } from '@/services/UndoService';
import { storeCoordinator } from '@/services/StoreCoordinator';
import { migrateAssetTypes } from '@/utils/typeMigration';

// Virtualization interfaces
export interface AssetMetadata {
  id: string;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId?: string;
  updatedAt: number;
  hasContent: boolean;
}

interface AssetCacheEntry {
  metadata: AssetMetadata;
  fullAsset?: Asset;
  lastAccessed: number;
  isDirty: boolean;
}

interface AssetSyncQueue {
  create: AssetMetadata[];
  update: AssetMetadata[];
  delete: string[];
}

interface AssetStore {
  // Book-scoped asset registry for isolation
  bookAssets: Record<string, Record<string, Asset>>;
  
  // Active asset state
  currentActiveId: string | null;
  currentViewportId: string | null; // Current viewport context (enteredAssetId)
  
  // Global custom fields (book-scoped)
  bookGlobalCustomFields: Record<string, GlobalCustomField[]>;
  
  // Background editing state
  isEditingBackground: boolean;
  
  // Virtualization state
  isVirtualizedMode: boolean;
  assetCache: Map<string, AssetCacheEntry>;
  visibleAssetIds: Set<string>;
  syncQueue: AssetSyncQueue;
  syncTimer: NodeJS.Timeout | null;
  isLoading: boolean;
  
  // Initialization state management
  initializationState: 'idle' | 'loading' | 'ready' | 'error';
  initializationError: string | null;
  initializingBookId: string | null;
  
  // Helper methods
  getCurrentBookId: () => string | null;
  
  // Unified initialization methods
  initializeAssetStore: (bookId: string) => Promise<void>;
  ensureBookData: (bookId: string) => Promise<void>;
  getBookId: () => string | null;
  
  // Get current book's assets
  getCurrentBookAssets: () => Record<string, Asset>;
  getCurrentBookGlobalCustomFields: () => GlobalCustomField[];
  
  // World-aware actions
  loadWorldData: (worldData: any, bookIdOverride?: string) => void;
  getWorldData: () => any;
  clearWorldData: () => void;
  clearBookData: (bookId: string) => void;
  
  // Actions
  createAsset: (assetData: Omit<Asset, 'asset_id' | 'children'>, parentId?: string) => string;
  reparentAsset: (assetId: string, newParentId?: string) => void;
  deleteAsset: (assetId: string) => void;
  updateAssetPosition: (assetId: string, x: number, y: number) => void;
  updateAssetPositionFast: (assetId: string, x: number, y: number) => void;
  updateAssetSize: (assetId: string, width: number, height: number) => void;
  updateAsset: (assetId: string, updates: Partial<Omit<Asset, 'asset_id' | 'children' | 'parent_id'>>) => void;
  setActiveAsset: (assetId: string | null) => void;
  setCurrentViewportId: (assetId: string | null) => void;
  getActiveAsset: () => Asset | null;
  getAssetById: (assetId: string) => Asset | null;
  getCurrentViewportAsset: () => Asset | null;
  getRootAssets: () => Asset[];
  getAssetChildren: (parentId: string) => Asset[];
  getAssetTree: (rootId?: string) => Asset[];
  
  // Viewport navigation methods
  enterViewport: (assetId: string) => boolean;
  exitViewport: () => boolean;
  getViewportPath: () => string[];
  
  // Custom Fields
  addCustomField: (assetId: string, field: Omit<CustomField, 'id'>) => void;
  updateCustomField: (assetId: string, fieldId: string, updates: Partial<CustomField>) => void;
  removeCustomField: (assetId: string, fieldId: string) => void;
  updateCustomFieldValue: (assetId: string, fieldId: string, value: string) => void;
  
  // Global Custom Fields
  addGlobalCustomField: (field: Omit<GlobalCustomField, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateGlobalCustomField: (fieldId: string, updates: Partial<GlobalCustomField>) => void;
  removeGlobalCustomField: (fieldId: string) => void;
  applyGlobalFieldsToAsset: (assetId: string) => void;
  
  // Bulk restoration methods for autosave system
  restoreAssets: (assets: Record<string, Asset>) => void;
  restoreGlobalCustomFields: (fields: GlobalCustomField[]) => void;
  
  // Background editing actions
  setIsEditingBackground: (editing: boolean) => void;
  
  // Expansion state management
  expandAll: () => void;
  collapseAll: () => void;
  toggleAssetExpansion: (assetId: string) => void;
  
  // Virtualization methods
  enableVirtualizedMode: () => void;
  disableVirtualizedMode: () => void;
  loadAssetsFromCache: () => Promise<void>;
  getVisibleAssets: (bounds?: { x: number; y: number; width: number; height: number }) => Promise<AssetMetadata[]>;
  getCacheStats: () => { cacheSize: number; maxCacheSize: number; queueSize: any; visibleAssets: number; isLoading: boolean };
  clearCache: () => void;
}

export const useAssetStore = create<AssetStore>()(
  subscribeWithSelector(
    (set, get) => ({
    // Initial state
    bookAssets: {},
    currentActiveId: null,
    currentViewportId: null,
    bookGlobalCustomFields: {},
    isEditingBackground: false,
    
    // Virtualization state (disabled by default for backward compatibility)
    isVirtualizedMode: false,
    assetCache: new Map(),
    visibleAssetIds: new Set(),
    syncQueue: { create: [], update: [], delete: [] },
    syncTimer: null,
    isLoading: false,

    // Initialization state
    initializationState: 'idle',
    initializationError: null,
    initializingBookId: null,

  // Unified initialization methods
  initializeAssetStore: async (bookId: string) => {
    const state = get();
    
    // Prevent concurrent initialization
    if (state.initializationState === 'loading' && state.initializingBookId === bookId) {
      console.log(`[AssetStore] Initialization already in progress for book ${bookId}`);
      return;
    }
    
    if (state.initializationState === 'ready' && state.bookAssets[bookId]) {
      console.log(`[AssetStore] Book ${bookId} already initialized`);
      return;
    }

    console.log(`[AssetStore] Starting initialization for book ${bookId}`);
    set({ 
      initializationState: 'loading', 
      initializationError: null, 
      initializingBookId: bookId 
    });

    try {
      // Use unified data loading strategy
      await state.ensureBookData(bookId);
      
      set({ 
        initializationState: 'ready', 
        initializationError: null, 
        initializingBookId: null 
      });
      
      console.log(`[AssetStore] Successfully initialized book ${bookId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[AssetStore] Failed to initialize book ${bookId}:`, errorMessage);
      
      set({ 
        initializationState: 'error', 
        initializationError: errorMessage, 
        initializingBookId: null 
      });
    }
  },

  ensureBookData: async (bookId: string) => {
    const state = get();
    
    // Check if data already exists and is not stale
    const existingAssets = state.bookAssets[bookId];
    if (existingAssets && Object.keys(existingAssets).length > 0) {
      // Check if data is stale (older than 5 minutes)
      const oldestAsset = Object.values(existingAssets).reduce((oldest, asset) => {
        const assetTime = asset.updated_at ? new Date(asset.updated_at).getTime() : 0;
        const oldestTime = oldest.updated_at ? new Date(oldest.updated_at).getTime() : 0;
        return assetTime < oldestTime ? asset : oldest;
      }, existingAssets[Object.keys(existingAssets)[0]]);
      
      const dataAge = Date.now() - (oldestAsset?.updated_at ? new Date(oldestAsset.updated_at).getTime() : 0);
      const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
      
      if (dataAge < STALE_THRESHOLD_MS) {
        console.log(`[AssetStore] Using cached data for book ${bookId} (age: ${Math.round(dataAge / 1000)}s)`);
        return;
      } else {
        console.log(`[AssetStore] Cached data is stale for book ${bookId} (age: ${Math.round(dataAge / 1000)}s), refreshing`);
      }
    }

    try {
      // Priority 1: Try DocumentMutationService (cloud data)
      if (documentMutationService.getCurrentProjectId() === bookId) {
        console.log(`[AssetStore] Loading from DocumentMutationService for book ${bookId}`);
        const result = await documentMutationService.loadDocument(bookId);
        
        if (result.success && result.data?.world_document?.assets) {
          const assets = result.data.world_document.assets;
          const globalCustomFields = result.data.world_document.globalCustomFields || [];
          
          // CRITICAL FIX: Don't overwrite existing assets with empty data
          const existingAssets = state.bookAssets[bookId];
          const hasExistingAssets = existingAssets && Object.keys(existingAssets).length > 0;
          const hasNewAssets = assets && Object.keys(assets).length > 0;
          
          if (hasExistingAssets && !hasNewAssets) {
            console.log(`[AssetStore] WARNING: DocumentMutationService returned empty assets, but we have existing assets. Preserving existing data.`);
            console.log(`[AssetStore] Existing assets count: ${Object.keys(existingAssets).length}, New assets count: ${Object.keys(assets).length}`);
            return;
          }
          
          // Convert to proper Asset format and rebuild hierarchy
          const assetMap: Record<string, Asset> = {};
          Object.entries(assets).forEach(([id, asset]: [string, any]) => {
            assetMap[id] = {
              ...asset,
              children: [], // Will be reconstructed
            };
          });
          
          // Rebuild parent-child relationships
          Object.entries(assetMap).forEach(([id, asset]) => {
            if (asset.parent_id && assetMap[asset.parent_id]) {
              assetMap[asset.parent_id].children.push(id);
            }
          });
          
          set((prevState) => ({
            bookAssets: {
              ...prevState.bookAssets,
              [bookId]: assetMap
            },
            bookGlobalCustomFields: {
              ...prevState.bookGlobalCustomFields,
              [bookId]: globalCustomFields
            }
          }));
          
          console.log(`[AssetStore] Loaded ${Object.keys(assetMap).length} assets from cloud for book ${bookId}`);
          return;
        }
      }
      
      // Priority 2: Try BookStore (local cache)
      const bookStore = useBookStore.getState();
      const book = bookStore.books[bookId];
      
      if (book?.worldData?.assets && Object.keys(book.worldData.assets).length > 0) {
        console.log(`[AssetStore] Loading from BookStore for book ${bookId}`);
        
        const assets = book.worldData.assets;
        const assetMap: Record<string, Asset> = {};
        
        Object.values(assets).forEach((asset: any) => {
          assetMap[asset.asset_id] = {
            ...asset,
            children: Object.values(assets)
              .filter((a: any) => a.parent_id === asset.asset_id)
              .map((a: any) => a.asset_id),
          };
        });
        
        set((prevState) => ({
          bookAssets: {
            ...prevState.bookAssets,
            [bookId]: assetMap
          },
          bookGlobalCustomFields: {
            ...prevState.bookGlobalCustomFields,
            [bookId]: book.worldData.globalCustomFields || []
          }
        }));
        
        console.log(`[AssetStore] Loaded ${Object.keys(assetMap).length} assets from BookStore for book ${bookId}`);
        return;
      }
      
      // Priority 3: Initialize empty (new book)
      console.log(`[AssetStore] Initializing empty data for book ${bookId}`);
      set((prevState) => ({
        bookAssets: {
          ...prevState.bookAssets,
          [bookId]: {}
        },
        bookGlobalCustomFields: {
          ...prevState.bookGlobalCustomFields,
          [bookId]: []
        }
      }));
      
    } catch (error) {
      console.error(`[AssetStore] Error ensuring book data for ${bookId}:`, error);
      throw error;
    }
  },

  getBookId: () => {
    const state = get();
    return state.initializingBookId || state.getCurrentBookId();
  },

  // Helper to get current book ID
  getCurrentBookId: () => {
    const bookStore = useBookStore.getState();
    return bookStore.currentBookId;
  },

  // Get current book's assets
  getCurrentBookAssets: () => {
    const state = get();
    const bookId = state.getBookId();
    
    if (!bookId) {
      console.warn('[AssetStore] No book ID available for getCurrentBookAssets');
      return {};
    }
    
    const assets = state.bookAssets[bookId] || {};
    return assets;
  },

  // Get current book's global custom fields
  getCurrentBookGlobalCustomFields: () => {
    const state = get();
    const bookId = state.getBookId();
    
    if (!bookId) {
      console.warn('[AssetStore] No book ID available for getCurrentBookGlobalCustomFields');
      return [];
    }
    
    return state.bookGlobalCustomFields[bookId] || [];
  },

  // Create a new asset
  createAsset: (assetData: Omit<Asset, 'asset_id' | 'children'>, parentId?: string) => {
    try {
      const state = get();
      const bookId = state.getBookId();
      
      if (!bookId) {
        console.warn('[AssetStore] Cannot create asset - no current book');
        return '';
      }
      
      // Ensure book is initialized before creating assets
      if (state.initializationState === 'idle' || (!state.bookAssets[bookId] || Object.keys(state.bookAssets[bookId]).length === 0)) {
        console.warn('[AssetStore] Book not initialized, triggering initialization before creating asset');
        state.initializeAssetStore(bookId);
      }
      
      const asset_id = crypto.randomUUID();
      const now = Date.now();
      const newAsset: Asset = {
        ...assetData,
        asset_id,
        children: [],
        parent_id: parentId,
        width: assetData.width || 200,
        height: assetData.height || 150,
        z_index: assetData.z_index || 0,
        is_expanded: assetData.is_expanded || false,
        custom_fields: {
          customFields: assetData.custom_fields?.customFields || [],
          customFieldValues: assetData.custom_fields?.customFieldValues || [],
          tags: assetData.custom_fields?.tags || [],
          viewportDisplaySettings: assetData.custom_fields?.viewportDisplaySettings || { ...DEFAULT_VIEWPORT_DISPLAY_SETTINGS },
          thumbnail: assetData.custom_fields?.thumbnail,
          background: assetData.custom_fields?.background,
          description: assetData.custom_fields?.description
        },
        viewport_config: assetData.viewport_config || {
          zoom: 1,
          pan_x: 0,
          pan_y: 0,
        },
        background_config: assetData.background_config || DEFAULT_BACKGROUND_CONFIG,
        updated_at: new Date().toISOString(),
        created_at: now,
        is_locked: assetData.is_locked || false,
        border_shape: assetData.border_shape || 'square',
        show_tag_border: assetData.show_tag_border || false,
        deleted_at: null,
        cloud_status: assetData.cloud_status || 'local',
        cloud_id: assetData.cloud_id || null,
        cloud_path: assetData.cloud_path || null,
        cloud_size: assetData.cloud_size || null,
        cloud_updated_at: assetData.cloud_updated_at || null,
        cloud_error: assetData.cloud_error || null,
        file: assetData.file || null
      };

      set((state) => {
        const bookId = state.getCurrentBookId();
        if (!bookId) {
          console.warn('[AssetStore] Cannot create asset - no current book');
          return state;
        }
        
        const newBookAssets = { ...state.bookAssets };
        if (!newBookAssets[bookId]) {
          newBookAssets[bookId] = {};
        }
        
        // Atomic operation: Add the new asset to book-specific registry
        newBookAssets[bookId][asset_id] = newAsset;
        
        // If it has a parent, add this asset to parent's children array and expand the parent
        if (parentId && newBookAssets[bookId][parentId]) {
          newBookAssets[bookId][parentId] = {
            ...newBookAssets[bookId][parentId],
            children: [...newBookAssets[bookId][parentId].children, asset_id],
            is_expanded: true, // Auto-expand parent to show new asset
            updated_at: new Date().toISOString(),
          };
        }
        
        return { bookAssets: newBookAssets };
      });

      // Phase 3 Integration: Track metadata changes (MASTER_PLAN.md state-based tracking)
      documentMutationService.markAssetChanged(asset_id, newAsset);

      // Asset creation sync now handled by existing 40s autosync to reduce redundant API calls

      // Record for undo
      undoService.recordAction('create', 'asset', newAsset);

      return asset_id;
    } catch (error) {
      console.error('[AssetStore] Failed to create asset:', error);
      // Return a fallback ID or throw a more descriptive error
      const fallbackId = `fallback-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      console.warn('[AssetStore] Using fallback asset ID:', fallbackId);
      return fallbackId;
    }
  },

  // Reparent an asset (move from one parent to another)
  reparentAsset: (assetId: string, newParentId?: string) => {
    const state = useAssetStore.getState();
    const bookId = state.getCurrentBookId();
    if (!bookId) return;
    
    const bookAssets = state.bookAssets[bookId] || {};
    const asset = bookAssets[assetId];
    if (!asset) return;

    const oldParentId = asset.parent_id;

    set((setState) => {
      const newBookAssets = { ...setState.bookAssets };
      const currentBookAssets = newBookAssets[bookId] || {};
      
      // Remove from old parent's children array
      if (oldParentId && currentBookAssets[oldParentId]) {
        newBookAssets[bookId][oldParentId] = {
          ...currentBookAssets[oldParentId],
          children: currentBookAssets[oldParentId].children.filter(id => id !== assetId),
        };
      }

      // Add to new parent's children array
      if (newParentId && currentBookAssets[newParentId]) {
        newBookAssets[bookId][newParentId] = {
          ...currentBookAssets[newParentId],
          children: [...currentBookAssets[newParentId].children, assetId],
        };
      }

      // Update the asset's parent reference
      newBookAssets[bookId][assetId] = {
        ...asset,
        parent_id: newParentId,
      };

      return { bookAssets: newBookAssets };
    });

    // Phase 3 Integration: Track metadata changes (MASTER_PLAN.md state-based tracking)
    const updatedAsset = { ...asset, parent_id: newParentId };
    documentMutationService.markAssetChanged(assetId, updatedAsset);

    // Record for undo
    undoService.recordAction('update', 'asset', updatedAsset, asset);
  },

  // Update asset position (fast - no mutation queueing, for drag operations)
  updateAssetPositionFast: (assetId: string, x: number, y: number) => {
    set((state) => {
      const bookId = state.getCurrentBookId();
      if (!bookId) return state;

      const bookAssets = state.bookAssets[bookId] || {};
      const asset = bookAssets[assetId];
      if (!asset) return state;

      const newBookAssets = { ...state.bookAssets };
      newBookAssets[bookId] = {
        ...bookAssets,
        [assetId]: {
          ...asset,
          x,
          y,
        },
      };

      return { bookAssets: newBookAssets };
    });

    // Use StoreCoordinator for coordinated position tracking (prevents race conditions)
    storeCoordinator.queueSyncOperation({
      type: 'asset_position',
      assetId,
      data: { position: { x, y, z: 0 } },
      priority: 'medium'
    });
  },

  // Update asset position
  updateAssetPosition: (assetId: string, x: number, y: number) => {
    set((state) => {
      const bookId = state.getCurrentBookId();
      if (!bookId) return state;
      
      const bookAssets = state.bookAssets[bookId] || {};
      const asset = bookAssets[assetId];
      if (!asset) return state;

      const newBookAssets = { ...state.bookAssets };
      newBookAssets[bookId] = {
        ...bookAssets,
        [assetId]: {
          ...asset,
          x,
          y,
        },
      };

      return { bookAssets: newBookAssets };
    });

    // Use StoreCoordinator for coordinated position tracking (prevents race conditions)
    storeCoordinator.queueSyncOperation({
      type: 'asset_position',
      assetId,
      data: { position: { x, y, z: 0 } },
      priority: 'medium'
    });
  },

  // Update asset size
  updateAssetSize: (assetId: string, width: number, height: number) => {
    try {
      set((state) => {
        const bookId = state.getCurrentBookId();
        if (!bookId) return state;
        
        const bookAssets = state.bookAssets[bookId] || {};
        const asset = bookAssets[assetId];
        if (!asset) return state;

        const newBookAssets = { ...state.bookAssets };
        newBookAssets[bookId] = {
          ...bookAssets,
          [assetId]: {
            ...asset,
            width: Math.max(100, width), // Minimum width of 100px
            height: Math.max(80, height), // Minimum height of 80px
          },
        };

        return { bookAssets: newBookAssets };
      });
      
      // Get the full asset data for the operation
      const state = useAssetStore.getState();
      const bookId = state.getCurrentBookId();
      if (!bookId) return;

      const bookAssets = state.bookAssets[bookId] || {};
      const asset = bookAssets[assetId];
      if (!asset) return;

      const updates = { width, height };

      // Phase 3 Integration: Track metadata changes
      documentMutationService.markAssetChanged(assetId, asset);

      // Record for undo
      undoService.recordAction('update', 'asset', asset, { ...asset, width: updates.width, height: updates.height });

      // Phase 3 Integration: Track position changes (MASTER_PLAN.md state-based tracking)
      documentMutationService.markPositionChanged(assetId, asset.x || 0, asset.y || 0, 0);
    } catch (error) {
      console.error('[AssetStore] Failed to update asset size:', error);
      // Continue without updating size to prevent crashes
    }
  },

  // Update asset properties
  updateAsset: (assetId: string, updates: Partial<Omit<Asset, 'id' | 'children' | 'parentId'>>) => {
    const state = get();
    const bookId = state.getBookId();
    
    if (!bookId) {
      console.warn('[AssetStore] Cannot update asset - no current book');
      return;
    }
    
    // Ensure book is initialized before updating assets
    if (state.initializationState === 'idle' || (!state.bookAssets[bookId] || Object.keys(state.bookAssets[bookId]).length === 0)) {
      console.warn('[AssetStore] Book not initialized, triggering initialization before updating asset');
      state.initializeAssetStore(bookId);
    }
    
    set((setState) => {
      const currentBookAssets = setState.bookAssets[bookId] || {};
      const asset = currentBookAssets[assetId];
      if (!asset) return setState;

      const newBookAssets = { ...setState.bookAssets };
      newBookAssets[bookId] = {
        ...currentBookAssets,
        [assetId]: {
          ...asset,
          ...updates,
        },
      };

      return { bookAssets: newBookAssets };
    });

    // Phase 3 Integration: Track metadata changes
    const currentState = useAssetStore.getState();
    const currentBookId = currentState.getCurrentBookId();
    if (currentBookId) {
      const currentBookAssets = currentState.bookAssets[currentBookId] || {};
      const currentAsset = currentBookAssets[assetId];
      if (currentAsset) {
        documentMutationService.markAssetChanged(assetId, currentAsset);
        // Record for undo
        undoService.recordAction('update', 'asset', { ...currentAsset, ...updates }, currentAsset);
      }
    }

    // If updating position-related fields, track position changes (MASTER_PLAN.md state-based tracking)
    if (updates.x !== undefined || updates.y !== undefined) {
      const positionState = useAssetStore.getState();
      const positionBookId = positionState.getCurrentBookId();
      if (positionBookId) {
        const positionBookAssets = positionState.bookAssets[positionBookId] || {};
        const positionAsset = positionBookAssets[assetId];
        if (positionAsset) {
          documentMutationService.markPositionChanged(
            assetId,
            updates.x ?? positionAsset.x ?? 0,
            updates.y ?? positionAsset.y ?? 0,
            0
          );
        }
      }
    }
    
    // If updating background config, use StoreCoordinator for coordinated sync
    if (updates.background_config !== undefined) {
      const bgState = useAssetStore.getState();
      const bgBookId = bgState.getCurrentBookId();
      if (bgBookId) {
        const bgBookAssets = bgState.bookAssets[bgBookId] || {};
        const bgAsset = bgBookAssets[assetId];
        if (bgAsset) {
          // Use StoreCoordinator to coordinate background changes (prevents race conditions)
          storeCoordinator.queueSyncOperation({
            type: 'asset_background',
            assetId,
            data: { background_config: bgAsset.background_config },
            priority: 'medium'
          });
          console.log(`[AssetStore] Background config changed for asset ${assetId}, queued for coordinated sync`);
        }
      }
    }
  },

  // Delete an asset and all its descendants recursively
  deleteAsset: (assetId: string) => {
    const state = get();
    const bookId = state.getBookId();
    
    if (!bookId) {
      console.warn('[AssetStore] Cannot delete asset - no current book');
      return;
    }
    
    // Ensure book is initialized before deleting assets
    if (state.initializationState === 'idle' || (!state.bookAssets[bookId] || Object.keys(state.bookAssets[bookId]).length === 0)) {
      console.warn('[AssetStore] Book not initialized, triggering initialization before deleting asset');
      state.initializeAssetStore(bookId);
    }
    
    const currentBookAssets = state.bookAssets[bookId] || {};
    const asset = currentBookAssets[assetId];
    if (!asset) return;

    // Recursive function to collect all descendant IDs
    const collectDescendants = (id: string): string[] => {
      const currentAsset = currentBookAssets[id];
      if (!currentAsset || currentAsset.children.length === 0) return [];
      
      let descendants: string[] = [];
      for (const childId of currentAsset.children) {
        descendants.push(childId);
        descendants = descendants.concat(collectDescendants(childId));
      }
      return descendants;
    };

    // Collect all IDs to delete (asset + all descendants)
    const idsToDelete = [assetId, ...collectDescendants(assetId)];

    set((state) => {
      const newBookAssets = { ...state.bookAssets };
      const currentBookAssets = newBookAssets[bookId] || {};

      // Remove from parent's children array if it has a parent
      if (asset.parent_id && currentBookAssets[asset.parent_id]) {
        newBookAssets[bookId][asset.parent_id] = {
          ...currentBookAssets[asset.parent_id],
          children: currentBookAssets[asset.parent_id].children.filter(id => !idsToDelete.includes(id)),
        };
      }

      // Delete all assets from registry
      idsToDelete.forEach(id => {
        delete newBookAssets[bookId][id];
      });

      // Clear active asset if it was deleted
      const newActiveId = state.currentActiveId && idsToDelete.includes(state.currentActiveId) 
        ? null 
        : state.currentActiveId;

      return { 
        bookAssets: newBookAssets,
        currentActiveId: newActiveId,
      };
    });
    
    // Phase 3 Integration: Track deleted assets (MASTER_PLAN.md state-based tracking)
    // Delete children first, then parent
    idsToDelete.reverse().forEach(id => {
      const deletedAsset = currentBookAssets[id];
      if (deletedAsset) {
        undoService.recordAction('delete', 'asset', deletedAsset, deletedAsset);
      }
      documentMutationService.markAssetDeleted(id);
    });

    // CRITICAL FIX: Trigger immediate sync for asset deletion to ensure it saves
    // This prevents data loss if user navigates away before 40s auto-save
    setTimeout(() => {
      documentMutationService.syncNow();
    }, 100);
  },

  // Set the active asset
  setActiveAsset: (assetId: string | null) => {
    try {
      set({ currentActiveId: assetId });
    } catch (error) {
      console.error('[AssetStore] Failed to set active asset:', error);
      // Continue with null active asset to prevent crashes
      set({ currentActiveId: null });
    }
  },

  // Set the current viewport context - IMPROVED
  setCurrentViewportId: (assetId: string | null) => {
    const state = get();
    const bookId = state.getCurrentBookId();
    if (!bookId) return;
    
    const bookAssets = state.bookAssets[bookId] || {};
    
    // Validate that the asset exists and is a viewport type
    if (assetId && !bookAssets[assetId]) {
      console.warn(`[AssetStore] Cannot set viewport to non-existent asset: ${assetId}`);
      return;
    }
    
    if (assetId) {
      const asset = bookAssets[assetId];
      if (asset && asset.type !== 'other') {
        console.log(`[AssetStore] Setting viewport to asset: ${asset.name} (${assetId})`);
      }
    } else {
      console.log('[AssetStore] Clearing viewport context');
    }

    set({ currentViewportId: assetId });

    // Save to localStorage for persistence across refreshes
    saveViewportToStorage(bookId, assetId);
  },

  // Get asset by ID from current book
  getAssetById: (assetId: string) => {
    const state = get();
    const bookId = state.getCurrentBookId();
    if (!bookId) return null;
    
    const bookAssets = state.bookAssets[bookId] || {};
    return bookAssets[assetId] || null;
  },

  // Get the current viewport asset
  getCurrentViewportAsset: () => {
    const state = get();
    const bookId = state.getCurrentBookId();
    if (!bookId || !state.currentViewportId) return null;
    
    const bookAssets = state.bookAssets[bookId] || {};
    return bookAssets[state.currentViewportId] || null;
  },

  // Enter a nested viewport (for navigation)
  enterViewport: (assetId: string) => {
    const state = get();
    const bookId = state.getCurrentBookId();
    if (!bookId) return false;
    
    const bookAssets = state.bookAssets[bookId] || {};
    const asset = bookAssets[assetId];
    
    if (!asset) {
      console.warn(`[AssetStore] Cannot enter non-existent viewport: ${assetId}`);
      return false;
    }
    
    console.log(`[AssetStore] Entering viewport: ${asset.name}`);
    set({ 
      currentViewportId: assetId,
      currentActiveId: assetId 
    });
    return true;
  },

  // Exit current viewport (go up one level)
  exitViewport: () => {
    const state = get();
    const currentAsset = state.getCurrentViewportAsset();
    
    if (!currentAsset) {
      console.warn('[AssetStore] No viewport to exit');
      return false;
    }
    
    const parentAsset = currentAsset.parent_id 
      ? state.getAssetById(currentAsset.parent_id)
      : null;
    
    if (parentAsset) {
      console.log(`[AssetStore] Exiting to parent viewport: ${parentAsset.name}`);
      set({ 
        currentViewportId: parentAsset.asset_id,
        currentActiveId: parentAsset.asset_id 
      });
    } else {
      console.log('[AssetStore] Exiting to root level');
      set({ 
        currentViewportId: null,
        currentActiveId: null 
      });
    }
    return true;
  },

  // Get viewport hierarchy path
  getViewportPath: () => {
    const state = get();
    const path: string[] = [];
    let currentId = state.currentViewportId;
    
    while (currentId) {
      const asset = state.getAssetById(currentId);
      if (!asset) break;
      
      path.unshift(asset.name);
      currentId = asset.parent_id;
    }
    
    return path;
  },

  // Get the active asset object
  getActiveAsset: () => {
    const state = get();
    const bookId = state.getCurrentBookId();
    if (!bookId || !state.currentActiveId) return null;
    
    const bookAssets = state.bookAssets[bookId] || {};
    return bookAssets[state.currentActiveId] || null;
  },

  // Get all root-level assets (no parent)
  getRootAssets: () => {
    const state = get();
    const bookId = state.getCurrentBookId();
    if (!bookId) return [];
    
    const bookAssets = state.bookAssets[bookId] || {};
    return Object.values(bookAssets).filter(asset => !asset.parent_id);
  },

  // Get direct children of a specific asset
  getAssetChildren: (parentId: string) => {
    const state = get();
    const bookId = state.getCurrentBookId();
    if (!bookId) return [];
    
    const bookAssets = state.bookAssets[bookId] || {};
    const parent = bookAssets[parentId];
    if (!parent) return [];
    
    return parent.children
      .map(childId => bookAssets[childId])
      .filter(Boolean) as Asset[];
  },

  // Get entire tree starting from root or specific asset
  getAssetTree: (rootId?: string) => {
    const state = get();
    const bookId = state.getCurrentBookId();
    if (!bookId) return [];
    
    const bookAssets = state.bookAssets[bookId] || {};
    const result: Asset[] = [];
    
    const traverse = (assetId: string) => {
      const asset = bookAssets[assetId];
      if (!asset) return;
      
      result.push(asset);
      asset.children.forEach(traverse);
    };

    if (rootId) {
      traverse(rootId);
    } else {
      // Start from all root assets
      Object.values(bookAssets).filter(asset => !asset.parent_id).forEach(asset => traverse(asset.asset_id));
    }
    
    return result;
  },

  // Custom Fields
  addCustomField: (assetId: string, field: Omit<CustomField, 'id'>) => {
    const newField: CustomField = {
      ...field,
      id: `field-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    };
    
    set((state) => {
      const bookId = state.getCurrentBookId();
      if (!bookId) return state;
      
      const bookAssets = state.bookAssets[bookId] || {};
      const asset = bookAssets[assetId];
      if (!asset) return state;
      
      const newBookAssets = { ...state.bookAssets };
      newBookAssets[bookId] = {
        ...bookAssets,
        [assetId]: {
          ...asset,
          custom_fields: {
            ...asset.custom_fields,
            customFields: [...(asset.custom_fields?.customFields || []), newField]
          },
          updated_at: new Date().toISOString(),
        },
      };
      
      return { bookAssets: newBookAssets };
    });
  },

  updateCustomField: (assetId: string, fieldId: string, updates: Partial<CustomField>) => {
    set((state) => {
      const bookId = state.getCurrentBookId();
      if (!bookId) return state;
      
      const bookAssets = state.bookAssets[bookId] || {};
      const asset = bookAssets[assetId];
      if (!asset) return state;
      
      const newBookAssets = { ...state.bookAssets };
      newBookAssets[bookId] = {
        ...bookAssets,
        [assetId]: {
          ...asset,
          custom_fields: {
            ...asset.custom_fields,
            customFields: (asset.custom_fields?.customFields || []).map((field) =>
              field.id === fieldId ? { ...field, ...updates } : field
            )
          },
          updated_at: new Date().toISOString(),
        },
      };
      
      return { bookAssets: newBookAssets };
    });
  },

  removeCustomField: (assetId: string, fieldId: string) => {
    set((state) => {
      const bookId = state.getCurrentBookId();
      if (!bookId) return state;
      
      const bookAssets = state.bookAssets[bookId] || {};
      const asset = bookAssets[assetId];
      if (!asset) return state;
      
      const newBookAssets = { ...state.bookAssets };
      newBookAssets[bookId] = {
        ...bookAssets,
        [assetId]: {
          ...asset,
          custom_fields: {
            ...asset.custom_fields,
            customFields: (asset.custom_fields?.customFields || []).filter((field) => field.id !== fieldId),
            customFieldValues: (asset.custom_fields?.customFieldValues || []).filter((value) => value.fieldId !== fieldId)
          },
          updated_at: new Date().toISOString(),
        },
      };
      
      return { bookAssets: newBookAssets };
    });
  },

  updateCustomFieldValue: (assetId: string, fieldId: string, value: string) => {
    set((state) => {
      const bookId = state.getCurrentBookId();
      if (!bookId) return state;
      
      const bookAssets = state.bookAssets[bookId] || {};
      const asset = bookAssets[assetId];
      if (!asset) return state;
      
      const existingValues = asset.custom_fields?.customFieldValues || [];
      const existingValueIndex = existingValues.findIndex((v) => v.fieldId === fieldId);
      
      let newValues;
      if (existingValueIndex >= 0) {
        // Update existing value
        newValues = [...existingValues];
        newValues[existingValueIndex] = { fieldId, value };
      } else {
        // Add new value
        newValues = [...existingValues, { fieldId, value }];
      }
      
      const newBookAssets = { ...state.bookAssets };
      newBookAssets[bookId] = {
        ...bookAssets,
        [assetId]: {
          ...asset,
          custom_fields: {
            ...asset.custom_fields,
            customFieldValues: newValues
          },
          updated_at: new Date().toISOString(),
        },
      };
      
      return { bookAssets: newBookAssets };
    });
  },

  // Global Custom Fields
  addGlobalCustomField: (field: Omit<GlobalCustomField, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newField: GlobalCustomField = {
      ...field,
      id: `global-field-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    set((state) => {
      const bookId = state.getCurrentBookId();
      if (!bookId) return state;
      
      const newBookGlobalCustomFields = { ...state.bookGlobalCustomFields };
      const currentFields = newBookGlobalCustomFields[bookId] || [];
      newBookGlobalCustomFields[bookId] = [...currentFields, newField];
      
      return { bookGlobalCustomFields: newBookGlobalCustomFields };
    });
  },

  updateGlobalCustomField: (fieldId: string, updates: Partial<GlobalCustomField>) => {
    set((state) => {
      const bookId = state.getCurrentBookId();
      if (!bookId) return state;
      
      const newBookGlobalCustomFields = { ...state.bookGlobalCustomFields };
      const currentFields = newBookGlobalCustomFields[bookId] || [];
      newBookGlobalCustomFields[bookId] = currentFields.map((field) =>
        field.id === fieldId ? { ...field, ...updates, updatedAt: Date.now() } : field
      );
      
      return { bookGlobalCustomFields: newBookGlobalCustomFields };
    });
  },

  removeGlobalCustomField: (fieldId: string) => {
    set((state) => {
      const bookId = state.getCurrentBookId();
      if (!bookId) return state;
      
      const newBookGlobalCustomFields = { ...state.bookGlobalCustomFields };
      const currentFields = newBookGlobalCustomFields[bookId] || [];
      newBookGlobalCustomFields[bookId] = currentFields.filter((field) => field.id !== fieldId);
      
      // Remove this field from all assets in the current book
      const newBookAssets = { ...state.bookAssets };
      const bookAssets = newBookAssets[bookId] || {};
      
      Object.keys(bookAssets).forEach((assetId) => {
        const asset = bookAssets[assetId];
        newBookAssets[bookId][assetId] = {
          ...asset,
          custom_fields: {
            ...asset.custom_fields,
            customFields: (asset.custom_fields?.customFields || []).filter((field) => field.id !== fieldId),
            customFieldValues: (asset.custom_fields?.customFieldValues || []).filter((value) => value.fieldId !== fieldId)
          },
          updated_at: new Date().toISOString(),
        };
      });
      
      return {
        bookGlobalCustomFields: newBookGlobalCustomFields,
        bookAssets: newBookAssets,
      };
    });
  },

  applyGlobalFieldsToAsset: (assetId: string) => {
    const state = get();
    const bookId = state.getCurrentBookId();
    if (!bookId) return;
    
    const bookAssets = state.bookAssets[bookId] || {};
    const asset = bookAssets[assetId];
    if (!asset) return;
    
    const globalFields = state.bookGlobalCustomFields[bookId] || [];
    const existingFieldIds = new Set((asset.custom_fields?.customFields || []).map((field) => field.id));
    const newGlobalFields = globalFields.filter(
      (globalField) => !existingFieldIds.has(globalField.id)
    );
    
    if (newGlobalFields.length === 0) return;
    
    const newCustomFields = newGlobalFields.map((globalField): CustomField => ({
      id: globalField.id,
      label: globalField.label,
      type: globalField.type,
      displayInViewport: globalField.displayInViewport,
      isGlobal: true,
    }));
    
    set((state) => {
      const newBookAssets = { ...state.bookAssets };
      newBookAssets[bookId] = {
        ...bookAssets,
        [assetId]: {
          ...asset,
          custom_fields: {
            ...asset.custom_fields,
            customFields: [...(asset.custom_fields?.customFields || []), ...newCustomFields]
          },
          updated_at: new Date().toISOString(),
        },
      };
      
      return { bookAssets: newBookAssets };
    });
  },

  // Viewport Display Settings
  updateViewportDisplaySettings: (assetId: string, settings: Partial<ViewportDisplaySettings>) => {
    set((state) => {
      const bookId = state.getCurrentBookId();
      if (!bookId) return state;
      
      const bookAssets = state.bookAssets[bookId] || {};
      const asset = bookAssets[assetId];
      if (!asset) return state;
      
      const newBookAssets = { ...state.bookAssets };
      newBookAssets[bookId] = {
        ...bookAssets,
        [assetId]: {
          ...asset,
          custom_fields: {
            ...asset.custom_fields,
            viewportDisplaySettings: {
              ...(asset.custom_fields?.viewportDisplaySettings || { ...DEFAULT_VIEWPORT_DISPLAY_SETTINGS }),
              ...settings,
            }
          },
          updated_at: new Date().toISOString(),
        },
      };
      
      return { bookAssets: newBookAssets };
    });
  },


  // Background editing actions
  setIsEditingBackground: (editing: boolean) => {
    set({ isEditingBackground: Boolean(editing) });
  },

  // Expansion state management
  expandAll: () => {
    set((state) => {
      const bookId = state.getCurrentBookId();
      if (!bookId) return state;
      
      const newBookAssets = { ...state.bookAssets };
      const bookAssets = newBookAssets[bookId] || {};
      
      // Set all assets with children to expanded
      Object.keys(bookAssets).forEach(assetId => {
        const asset = bookAssets[assetId];
        if (asset.children && asset.children.length > 0) {
          newBookAssets[bookId][assetId] = { ...asset, is_expanded: true };
        }
      });
      
      return { bookAssets: newBookAssets };
    });
  },

  collapseAll: () => {
    set((state) => {
      const bookId = state.getCurrentBookId();
      if (!bookId) return state;
      
      const newBookAssets = { ...state.bookAssets };
      const bookAssets = newBookAssets[bookId] || {};
      
      // Set all assets with children to collapsed
      Object.keys(bookAssets).forEach(assetId => {
        const asset = bookAssets[assetId];
        if (asset.children && asset.children.length > 0) {
          newBookAssets[bookId][assetId] = { ...asset, is_expanded: false };
        }
      });
      
      return { bookAssets: newBookAssets };
    });
  },

  toggleAssetExpansion: (assetId: string) => {
    set((state) => {
      const bookId = state.getCurrentBookId();
      if (!bookId) return state;
      
      const bookAssets = state.bookAssets[bookId] || {};
      const asset = bookAssets[assetId];
      if (!asset || !asset.children || asset.children.length === 0) return state;
      
      const newBookAssets = { ...state.bookAssets };
      newBookAssets[bookId] = {
        ...bookAssets,
        [assetId]: {
          ...asset,
          is_expanded: !asset.is_expanded,
        },
      };
      
      return { bookAssets: newBookAssets };
    });
  },

  // World-aware methods
  loadWorldData: (worldData, bookIdOverride?: string) => {
    const bookId = bookIdOverride || get().getCurrentBookId();
    
    // CRITICAL FIX: Extract assets from the correct nested structure
    // DocumentMutationService returns {world_document: {assets: {...}}}
    // But we need to handle both structures for compatibility
    const assets = worldData?.world_document?.assets || worldData?.assets || {};
    
    console.log(`[AssetStore] loadWorldData called:`, {
      hasWorldData: !!worldData,
      assetCount: Object.keys(assets).length,
      bookId: bookId,
      bookIdOverride: bookIdOverride || null,
      currentBookId: get().getCurrentBookId(),
      hasWorldDocument: !!worldData?.world_document,
      directAssets: !!worldData?.assets
    });

    if (worldData) {
      console.log(`[AssetStore] Using book ID:`, bookId, bookIdOverride ? '(override)' : '(current)');
      
      if (!bookId) {
        console.warn('[AssetStore] Cannot load world data - no current book');
        return;
      }
      
      // CRITICAL FIX: Don't overwrite existing assets with empty data
      const existingAssets = get().bookAssets[bookId];
      const hasExistingAssets = existingAssets && Object.keys(existingAssets).length > 0;
      const hasNewAssets = assets && Object.keys(assets).length > 0;
      
      if (!hasNewAssets && hasExistingAssets) {
        console.warn('[AssetStore] WARNING: worldData.assets is empty, but we have existing assets. Preserving existing data.');
        console.log(`[AssetStore] Existing assets count: ${Object.keys(existingAssets).length}, New assets count: ${Object.keys(assets).length}`);
        return;
      }
      
      if (!assets || Object.keys(assets).length === 0) {
        console.warn('[AssetStore] WARNING: worldData.assets is empty');
      }

      // Migrate 'other' type to 'card' for database compatibility
      const migratedAssets = migrateAssetTypes(assets);

      console.log(`[AssetStore] About to update store with:`, {
        bookId,
        assetCount: Object.keys(migratedAssets).length,
        assetIds: Object.keys(migratedAssets)
      });

      set((state) => {
        const newBookAssets = { ...state.bookAssets };
        const newBookGlobalCustomFields = { ...state.bookGlobalCustomFields };

        newBookAssets[bookId] = migratedAssets;
        newBookGlobalCustomFields[bookId] = worldData?.world_document?.globalCustomFields || worldData?.globalCustomFields || []

        console.log(`[AssetStore] Store updated. New state:`, {
          totalBooks: Object.keys(newBookAssets).length,
          currentBookAssets: Object.keys(newBookAssets[bookId] || {}).length,
          currentBookId: bookId
        });

        return {
          bookAssets: newBookAssets,
          currentActiveId: null,
          currentViewportId: null,
          bookGlobalCustomFields: newBookGlobalCustomFields,
        };
      });
    }
  },

  getWorldData: () => {
    const state = get();
    const bookId = state.getCurrentBookId();
    if (!bookId) {
      return { assets: {}, globalCustomFields: [] };
    }
    
    return {
      assets: state.bookAssets[bookId] || {},
      globalCustomFields: state.bookGlobalCustomFields[bookId] || [],
    };
  },

  clearWorldData: () => {
    const bookId = get().getCurrentBookId();
    if (!bookId) {
      console.warn('[AssetStore] Cannot clear world data - no current book');
      return;
    }
    
    set((state) => {
      const newBookAssets = { ...state.bookAssets };
      const newBookGlobalCustomFields = { ...state.bookGlobalCustomFields };
      
      newBookAssets[bookId] = {};
      newBookGlobalCustomFields[bookId] = [];
      
      return {
        bookAssets: newBookAssets,
        currentActiveId: null,
        currentViewportId: null,
        bookGlobalCustomFields: newBookGlobalCustomFields,
        isEditingBackground: false,
      };
    });
  },

  clearBookData: (bookId: string) => {
    set((state) => {
      const newBookAssets = { ...state.bookAssets };
      const newBookGlobalCustomFields = { ...state.bookGlobalCustomFields };
      
      delete newBookAssets[bookId];
      delete newBookGlobalCustomFields[bookId];
      
      // Clear active state if it was this book
      const currentBookId = state.getCurrentBookId();
      const newActiveId = (currentBookId === bookId) ? null : state.currentActiveId;
      const newViewportId = (currentBookId === bookId) ? null : state.currentViewportId;
      
      return {
        bookAssets: newBookAssets,
        bookGlobalCustomFields: newBookGlobalCustomFields,
        currentActiveId: newActiveId,
        currentViewportId: newViewportId,
      };
    });
  },

  // Bulk restoration methods for autosave system
  restoreAssets: (assets: Record<string, Asset>) => {
    const bookId = get().getCurrentBookId();
    if (!bookId) {
      console.warn('[AssetStore] Cannot restore assets - no current book');
      return;
    }
    
    console.log(`[AssetStore] Restoring ${Object.keys(assets).length} assets for book ${bookId}`);
    
    set((state) => {
      const newBookAssets = { ...state.bookAssets };
      const restoredAssets: Record<string, Asset> = {};
      
      // Process assets and rebuild hierarchy
      Object.entries(assets).forEach(([id, asset]) => {
        // Ensure asset has required fields and proper structure
        const validatedAsset: Asset = {
          ...asset,
          asset_id: id,
          children: asset.children || [],
          custom_fields: {
            customFields: asset.custom_fields?.customFields || [],
            customFieldValues: asset.custom_fields?.customFieldValues || [],
            tags: asset.custom_fields?.tags || [],
            viewportDisplaySettings: asset.custom_fields?.viewportDisplaySettings || { ...DEFAULT_VIEWPORT_DISPLAY_SETTINGS }
          },
          viewport_config: asset.viewport_config || { zoom: 1, pan_x: 0, pan_y: 0 },
          background_config: asset.background_config || DEFAULT_BACKGROUND_CONFIG,
          // Ensure required fields have defaults
          width: asset.width || 200,
          height: asset.height || 150,
          x: asset.x || 0,
          y: asset.y || 0,
          is_expanded: asset.is_expanded || false,
          created_at: typeof asset.created_at === 'number' ? asset.created_at : Date.now(),
          updated_at: asset.updated_at || new Date().toISOString(),
        };
        
        restoredAssets[id] = validatedAsset;
      });
      
      newBookAssets[bookId] = restoredAssets;
      return { bookAssets: newBookAssets };
    });
    
    console.log(`[AssetStore] Successfully restored ${Object.keys(assets).length} assets`);
  },

  restoreGlobalCustomFields: (fields: GlobalCustomField[]) => {
    const bookId = get().getCurrentBookId();
    if (!bookId) {
      console.warn('[AssetStore] Cannot restore global custom fields - no current book');
      return;
    }
    
    console.log(`[AssetStore] Restoring ${fields.length} global custom fields for book ${bookId}`);
    
    set((state) => {
      const newBookGlobalCustomFields = { ...state.bookGlobalCustomFields };
      newBookGlobalCustomFields[bookId] = fields;
      return { bookGlobalCustomFields: newBookGlobalCustomFields };
    });
    
    console.log(`[AssetStore] Successfully restored ${fields.length} global custom fields`);
  },

  // Virtualization methods
  enableVirtualizedMode: () => {
    console.log('[AssetStore] Enabling virtualized mode');
    set({ isVirtualizedMode: true });
    
    // Initialize cache service
    const bookId = get().getCurrentBookId();
    if (bookId) {
      // Initialize virtualization for this book
      get().loadAssetsFromCache();
    }
  },

  disableVirtualizedMode: () => {
    console.log('[AssetStore] Disabling virtualized mode');
    set({ isVirtualizedMode: false });
    get().clearCache();
  },

  loadAssetsFromCache: async () => {
    const bookId = get().getCurrentBookId();
    if (!bookId || !get().isVirtualizedMode) return;

    // Check if assets are already loaded to prevent redundant calls
    const currentAssets = get().bookAssets[bookId];
    if (currentAssets && Object.keys(currentAssets).length > 0) {
      console.log('[AssetStore] Assets already loaded, skipping cache service call');
      return;
    }

    try {
      console.log('[AssetStore] Loading assets from cache service...');
      set({ isLoading: true });
      
      // Load assets using documentMutationService for consistency
      const result = await documentMutationService.loadDocument(bookId);
      
      if (result.success && result.data?.assets) {
        const assets = result.data.assets;
        
        // Convert to Asset format and update store
        const assetMap: Record<string, Asset> = {};
        
        Object.entries(assets).forEach(([id, asset]: [string, any]) => {
          assetMap[id] = {
            ...asset,
            children: [], // Will be reconstructed by parent relationships
          };
        });
        
        // Reconstruct hierarchy
        Object.entries(assetMap).forEach(([id, asset]) => {
          if (asset.parent_id && assetMap[asset.parent_id]) {
            assetMap[asset.parent_id].children.push(id);
          }
        });
        
        set((state) => ({
          bookAssets: {
            ...state.bookAssets,
            [bookId]: assetMap
          },
          isLoading: false
        }));
        
        console.log('[AssetStore] Loaded', Object.keys(assetMap).length, 'assets from cache');
      }
    } catch (error) {
      console.error('[AssetStore] Failed to load from cache:', error);
      set({ isLoading: false });
    }
  },

  getVisibleAssets: async (bounds?: { x: number; y: number; width: number; height: number }) => {
    const bookId = get().getCurrentBookId();
    if (!bookId || !get().isVirtualizedMode) return [];

    const bookAssets = get().bookAssets[bookId] || {};
    
    // Filter assets based on viewport bounds if provided
    const visibleAssets = Object.values(bookAssets).filter(asset => {
      if (!bounds) return true;
      
      // Check if asset intersects with viewport
      const assetRight = (asset.x || 0) + (asset.width || 0);
      const assetBottom = (asset.y || 0) + (asset.height || 0);
      const boundsRight = bounds.x + bounds.width;
      const boundsBottom = bounds.y + bounds.height;
      
      return !(
        (asset.x || 0) > boundsRight ||
        (asset.y || 0) > boundsBottom ||
        assetRight < bounds.x ||
        assetBottom < bounds.y
      );
    });

    // Convert to AssetMetadata format
    return visibleAssets.map(asset => ({
      id: asset.asset_id,
      name: asset.name,
      type: asset.type,
      x: asset.x || 0,
      y: asset.y || 0,
      width: asset.width || 200,
      height: asset.height || 150,
      parentId: asset.parent_id,
      updatedAt: typeof asset.updated_at === 'number' ? asset.updated_at : Date.now(),
      hasContent: !!asset.content
    }));
  },

  getCacheStats: () => {
    const state = get();
    return {
      cacheSize: state.assetCache.size,
      maxCacheSize: 50, // LRU cache limit
      queueSize: {
        create: state.syncQueue.create.length,
        update: state.syncQueue.update.length,
        delete: state.syncQueue.delete.length
      },
      visibleAssets: state.visibleAssetIds.size,
      isLoading: state.isLoading
    };
  },

  clearCache: () => {
    set((state) => ({
      assetCache: new Map(),
      visibleAssetIds: new Set(),
      syncQueue: { create: [], update: [], delete: [] },
      syncTimer: null
    }));
  },
})
));

// Auto-save functionality: Now handled by autosaveService with intelligent batching
// This subscription is kept for compatibility but autosaveService handles cloud saves
let lastSyncTime = 0;
const SYNC_THROTTLE_MS = 2000; // 2 seconds minimum between syncs
const BATCH_SIZE_THRESHOLD = 10; // Only batch if more than 10 assets changed

useAssetStore.subscribe(
  (state) => state,
  (state, prevState) => {
    const bookStore = useBookStore.getState();
    if (bookStore.currentBookId) {
      const currentBookId = bookStore.currentBookId;
      const currentAssets = state.bookAssets[currentBookId] || {};
      const prevAssets = prevState.bookAssets[currentBookId] || {};
      
      // Check if significant changes occurred
      const assetCountChanged = Object.keys(currentAssets).length !== Object.keys(prevAssets).length;
      const globalFieldsChanged = JSON.stringify(state.bookGlobalCustomFields[currentBookId]) !== 
                              JSON.stringify(prevState.bookGlobalCustomFields[currentBookId]);
      
      const now = Date.now();
      const timeSinceLastSync = now - lastSyncTime;
      
      // Only sync if: significant changes OR enough time passed
      if (assetCountChanged || globalFieldsChanged || timeSinceLastSync > SYNC_THROTTLE_MS) {
        const worldData = {
          assets: currentAssets,
          globalCustomFields: state.bookGlobalCustomFields[currentBookId] || [],
        };
        
        // Update local book store immediately for UI consistency
        bookStore.updateWorldData(currentBookId, worldData);
        
        // Track sync time for throttling
        lastSyncTime = now;
        
        console.log(`[AssetStore] Sync triggered: assets=${assetCountChanged}, fields=${globalFieldsChanged}, throttle=${timeSinceLastSync}ms`);
      }
    }
  },
  {
    equalityFn: (a, b) => {
      // Only trigger auto-save for relevant changes
      return (
        a.bookAssets === b.bookAssets &&
        a.bookGlobalCustomFields === b.bookGlobalCustomFields
      );
    },
  }
);

// Simple viewport persistence - direct localStorage
const VIEWPORT_STORAGE_KEY = 'kanvas-last-viewport';

const saveViewportToStorage = (bookId: string, viewportId: string | null) => {
  if (!bookId) return;
  try {
    localStorage.setItem(VIEWPORT_STORAGE_KEY, JSON.stringify({ bookId, viewportId, timestamp: Date.now() }));
  } catch (e) {
    // ignore
  }
};

const getViewportFromStorage = (): { bookId: string; viewportId: string } | null => {
  try {
    const raw = localStorage.getItem(VIEWPORT_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Only valid if less than 24 hours old
    if (Date.now() - data.timestamp > 24 * 60 * 60 * 1000) return null;
    return data;
  } catch (e) {
    return null;
  }
};

// Unified initialization logic - replaces complex initFromBookStore
const initializeAssetStoreForCurrentBook = async () => {
  const bookState = useBookStore.getState();
  const assetStore = useAssetStore.getState();
  
  if (bookState.currentBookId) {
    console.log(`[AssetStore] Initializing for current book: ${bookState.currentBookId}`);
    
    // Use unified initialization method
    await assetStore.initializeAssetStore(bookState.currentBookId);
    
    // Restore viewport if we have one saved for this book
    const savedViewport = getViewportFromStorage();
    if (savedViewport?.bookId === bookState.currentBookId && savedViewport.viewportId) {
      const currentAssets = assetStore.getCurrentBookAssets();
      if (currentAssets[savedViewport.viewportId]) {
        console.log(`[AssetStore] Restoring viewport to ${savedViewport.viewportId}`);
        useAssetStore.setState({
          currentViewportId: savedViewport.viewportId,
          currentActiveId: savedViewport.viewportId,
        });
      }
    }
  }
};

// Run initialization immediately and on book changes
initializeAssetStoreForCurrentBook();

// Subscribe to bookStore changes with simplified logic
let lastBookId: string | null = null;
useBookStore.subscribe((state) => {
  if (state.currentBookId !== lastBookId) {
    lastBookId = state.currentBookId;
    if (state.currentBookId) {
      initializeAssetStoreForCurrentBook();
    }
  }
});
