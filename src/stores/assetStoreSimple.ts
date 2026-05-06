/**
 * Scalable Asset Store with Low-IO Architecture
 * Integrates with AssetCacheService for handling hundreds of assets
 * Uses virtualized loading and intelligent caching
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Asset } from '@/components/AssetItem';
import type { CustomField, CustomFieldValue, GlobalCustomField, ViewportDisplaySettings } from '@/types/extendedAsset';
import { DEFAULT_VIEWPORT_DISPLAY_SETTINGS } from '@/types/extendedAsset';
import { useBookStore } from './bookStoreSimple';
import { supabase } from '@/lib/supabase';
import { documentMutationService } from '@/services/DocumentMutationService';
import { undoService } from '@/services/UndoService';
import { assetCacheService, type AssetMetadata } from '@/services/AssetCacheService';

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
  
  // Cache service integration
  isVirtualizedMode: boolean;
  
  // Helper methods
  getCurrentBookId: () => string | null;
  
  // Get current book's assets
  getCurrentBookAssets: () => Record<string, Asset>;
  getCurrentBookGlobalCustomFields: () => GlobalCustomField[];
  
  // World-aware actions
  loadWorldData: (worldData: any) => void;
  getWorldData: () => any;
  clearWorldData: () => void;
  clearBookData: (bookId: string) => void;
  
  // Actions
  createAsset: (assetData: Omit<Asset, 'id' | 'children'>, parentId?: string) => string;
  reparentAsset: (assetId: string, newParentId?: string) => void;
  deleteAsset: (assetId: string) => void;
  updateAssetPosition: (assetId: string, x: number, y: number) => void;
  updateAssetPositionFast: (assetId: string, x: number, y: number) => void;
  updateAssetSize: (assetId: string, width: number, height: number) => void;
  updateAsset: (assetId: string, updates: Partial<Omit<Asset, 'id' | 'children' | 'parentId'>>) => void;
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
  
  // Virtualized loading methods
  enableVirtualizedMode: () => void;
  disableVirtualizedMode: () => void;
  loadAssetsFromCache: () => Promise<void>;
  getVisibleAssets: (bounds?: { x: number; y: number; width: number; height: number }) => Promise<AssetMetadata[]>;
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
    isVirtualizedMode: false,

  // Helper to get current book ID
  getCurrentBookId: () => {
    const bookStore = useBookStore.getState();
    return bookStore.currentBookId;
  },

  // Get current book's assets
  getCurrentBookAssets: () => {
    const bookId = get().getCurrentBookId();
    return bookId ? get().bookAssets[bookId] || {} : {};
  },

  getCurrentBookGlobalCustomFields: () => {
    const bookId = get().getCurrentBookId();
    return bookId ? get().bookGlobalCustomFields[bookId] || [] : [];
  },

  // Load world data from cache service or legacy data
  loadWorldData: async (worldData: any) => {
    const bookId = get().getCurrentBookId();
    if (!bookId) return;

    console.log('[AssetStore] Loading world data for book:', bookId, 'virtualized:', get().isVirtualizedMode);
    console.log('[AssetStore] worldData structure:', {
      keys: Object.keys(worldData || {}),
      hasAssets: !!worldData?.assets,
      assetKeys: worldData?.assets ? Object.keys(worldData.assets) : 'no assets',
      worldDataSample: worldData
    });

    // Helper function to reconstruct asset hierarchy from parentId relationships
    const reconstructAssetHierarchy = (assets: Record<string, Asset>): Record<string, Asset> => {
      const reconstructedAssets: Record<string, Asset> = {};
      
      // First pass: copy all assets with empty children arrays
      Object.entries(assets).forEach(([id, asset]) => {
        reconstructedAssets[id] = {
          ...asset,
          children: [], // Start with empty children array
        };
      });
      
      // Second pass: build children arrays from parentId relationships
      Object.entries(reconstructedAssets).forEach(([id, asset]) => {
        if (asset.parentId && reconstructedAssets[asset.parentId]) {
          reconstructedAssets[asset.parentId].children.push(id);
        }
      });
      
      console.log('[AssetStore] Reconstructed hierarchy for', Object.keys(assets).length, 'assets');
      return reconstructedAssets;
    };

    if (get().isVirtualizedMode) {
      // Initialize cache service for this book
      assetCacheService.initialize(supabase, bookId);
      
      // Store assets directly if provided (from DocumentMutation)
      if (worldData?.assets) {
        console.log('[AssetStore] Storing assets from worldData in virtualized mode:', Object.keys(worldData.assets).length);
        // Reconstruct hierarchy before storing
        const reconstructedAssets = reconstructAssetHierarchy(worldData.assets);
        set((state) => ({
          bookAssets: {
            ...state.bookAssets,
            [bookId]: reconstructedAssets
          }
        }));
      } else {
        console.log('[AssetStore] No assets in worldData, calling loadAssetsFromCache');
        // Load assets from cache service only if not provided
        await get().loadAssetsFromCache();
      }
      
      // Load global custom fields
      if (worldData?.globalCustomFields) {
        set((state) => ({
          bookGlobalCustomFields: {
            ...state.bookGlobalCustomFields,
            [bookId]: worldData.globalCustomFields
          }
        }));
      }
    } else {
      // Legacy mode: load all assets at once
      if (worldData?.assets) {
        const assets = worldData.assets;
        // Reconstruct hierarchy before storing
        const reconstructedAssets = reconstructAssetHierarchy(assets);
        set((state) => ({
          bookAssets: {
            ...state.bookAssets,
            [bookId]: reconstructedAssets
          }
        }));
        console.log('[AssetStore] Loaded', Object.keys(assets).length, 'assets in legacy mode with hierarchy reconstruction');
      }
      
      // Load global custom fields
      if (worldData?.globalCustomFields) {
        set((state) => ({
          bookGlobalCustomFields: {
            ...state.bookGlobalCustomFields,
            [bookId]: worldData.globalCustomFields
          }
        }));
      }
    }
  },

  // Load assets from cache service
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
      
      // Get visible assets (will load from server if needed)
      const assets = await assetCacheService.getVisibleAssets(bookId);
      
      // Convert to Asset format and update store
      const assetMap: Record<string, Asset> = {};
      
      for (const metadata of assets) {
        const fullAsset = await assetCacheService.getFullAsset(metadata.id);
        if (fullAsset) {
          assetMap[metadata.id] = fullAsset;
        }
      }
      
      set((state) => ({
        bookAssets: {
          ...state.bookAssets,
          [bookId]: assetMap
        }
      }));
      
      console.log('[AssetStore] Loaded', Object.keys(assetMap).length, 'assets from cache');
      
    } catch (error) {
      console.error('[AssetStore] Failed to load from cache:', error);
    }
  },

  // Get visible assets for virtualized rendering
  getVisibleAssets: async (bounds?: { x: number; y: number; width: number; height: number }) => {
    const bookId = get().getCurrentBookId();
    if (!bookId || !get().isVirtualizedMode) return [];

    return assetCacheService.getVisibleAssets(bookId, bounds);
  },

  // Enable virtualized mode
  enableVirtualizedMode: () => {
    console.log('[AssetStore] Enabling virtualized mode');
    set({ isVirtualizedMode: true });
    
    // Initialize cache service
    const bookId = get().getCurrentBookId();
    if (bookId) {
      assetCacheService.initialize(supabase, bookId);
    }
  },

  // Disable virtualized mode
  disableVirtualizedMode: () => {
    console.log('[AssetStore] Disabling virtualized mode');
    set({ isVirtualizedMode: false });
    assetCacheService.clearCache();
  },

  // Create asset
  createAsset: (assetData, parentId) => {
    const bookId = get().getCurrentBookId();
    if (!bookId) return '';

    const id = crypto.randomUUID();
    const now = Date.now();
    
    const newAsset: Asset = {
      ...assetData,
      id,
      children: [],
      parentId,
      createdAt: now,
      updatedAt: now,
      customFields: [],
      viewportConfig: { zoom: 1, panX: 0, panY: 0 },
    };

    if (get().isVirtualizedMode) {
      // Use cache service
      assetCacheService.createAsset(newAsset);
    } else {
      // Legacy mode: update local store immediately
      set((state) => {
        const currentAssets = state.bookAssets[bookId] || {};
        return {
          bookAssets: {
            ...state.bookAssets,
            [bookId]: {
              ...currentAssets,
              [id]: newAsset
            }
          }
        };
      });
    }

    // Record for undo
    undoService.recordAction('create', 'asset', newAsset);

    // Sync to cloud using proper operation queueing
    documentMutationService.queueServerOperation('CREATE_ASSET', {
      assetId: newAsset.id,
      name: newAsset.name,
      type: newAsset.type,
      position: {
        x: newAsset.x,
        y: newAsset.y,
        width: newAsset.width,
        height: newAsset.height,
        zIndex: 0
      },
      parentId: newAsset.parentId
    });

    console.log('[AssetStore] Created asset:', newAsset.name);
    return id;
  },

  // Delete asset
  deleteAsset: (assetId) => {
    const bookId = get().getCurrentBookId();
    if (!bookId) return;

    const asset = get().getAssetById(assetId);
    if (!asset) return;

    // Record for undo
    undoService.recordAction('delete', 'asset', asset, asset);

    if (get().isVirtualizedMode) {
      // Use cache service
      assetCacheService.deleteAsset(assetId);
    } else {
      // Legacy mode: update local store immediately
      set((state) => {
        const currentAssets = state.bookAssets[bookId] || {};
        const newAssets = { ...currentAssets };
        delete newAssets[assetId];
        
        return {
          bookAssets: {
            ...state.bookAssets,
            [bookId]: newAssets
          }
        };
      });
    }

    // Clear active/viewport if deleted
    if (get().currentActiveId === assetId) {
      set({ currentActiveId: null });
    }
    if (get().currentViewportId === assetId) {
      set({ currentViewportId: null });
    }

    // Sync to cloud using proper operation queueing
    documentMutationService.queueServerOperation('DELETE_ASSET', {
      assetId: assetId
    });

    console.log('[AssetStore] Deleted asset:', asset.name);
  },

  // Update asset position
  updateAssetPosition: (assetId, x, y) => {
    const asset = get().getAssetById(assetId);
    if (!asset) return;

    const updatedAsset = { ...asset, x, y, updatedAt: Date.now() };

    if (get().isVirtualizedMode) {
      // Use cache service
      assetCacheService.updateAsset(updatedAsset);
    } else {
      // Legacy mode: update local store immediately
      set((state) => {
        const bookId = get().getCurrentBookId();
        if (!bookId) return state;
        
        const currentAssets = state.bookAssets[bookId] || {};
        return {
          bookAssets: {
            ...state.bookAssets,
            [bookId]: {
              ...currentAssets,
              [assetId]: updatedAsset
            }
          }
        };
      });
    }

    // Record for undo
    undoService.recordAction('update', 'asset', updatedAsset, asset);

    // Sync to cloud using proper operation queueing
    documentMutationService.queueServerOperation('UPDATE_POSITION', {
      assetId: assetId,
      x: x,
      y: y,
      width: asset.width,
      height: asset.height,
      zIndex: 0
    });
  },

  // Fast update for drag operations (no undo/sync)
  updateAssetPositionFast: (assetId, x, y) => {
    const asset = get().getAssetById(assetId);
    if (!asset) return;

    const updatedAsset = { ...asset, x, y };

    if (get().isVirtualizedMode) {
      // Update cache without queuing for sync
      assetCacheService.updateAsset(updatedAsset);
    } else {
      // Legacy mode: update local store immediately
      set((state) => {
        const bookId = get().getCurrentBookId();
        if (!bookId) return state;
        
        const currentAssets = state.bookAssets[bookId] || {};
        return {
          bookAssets: {
            ...state.bookAssets,
            [bookId]: {
              ...currentAssets,
              [assetId]: updatedAsset
            }
          }
        };
      });
    }
  },

  // Update asset size
  updateAssetSize: (assetId, width, height) => {
    const asset = get().getAssetById(assetId);
    if (!asset) return;

    const updatedAsset = { ...asset, width, height, updatedAt: Date.now() };

    if (get().isVirtualizedMode) {
      // Use cache service
      assetCacheService.updateAsset(updatedAsset);
    } else {
      // Legacy mode: update local store immediately
      set((state) => {
        const bookId = get().getCurrentBookId();
        if (!bookId) return state;
        
        const currentAssets = state.bookAssets[bookId] || {};
        return {
          bookAssets: {
            ...state.bookAssets,
            [bookId]: {
              ...currentAssets,
              [assetId]: updatedAsset
            }
          }
        };
      });
    }

    // Record for undo
    undoService.recordAction('update', 'asset', updatedAsset, asset);

    // Sync to cloud using proper operation queueing
    documentMutationService.queueServerOperation('UPDATE_POSITION', {
      assetId: assetId,
      x: asset.x,
      y: asset.y,
      width: width,
      height: height,
      zIndex: 0
    });
  },

  // Update asset
  updateAsset: (assetId, updates) => {
    const asset = get().getAssetById(assetId);
    if (!asset) return;

    const updatedAsset = { ...asset, ...updates, updatedAt: Date.now() };

    if (get().isVirtualizedMode) {
      // Use cache service
      assetCacheService.updateAsset(updatedAsset);
    } else {
      // Legacy mode: update local store immediately
      set((state) => {
        const bookId = get().getCurrentBookId();
        if (!bookId) return state;
        
        const currentAssets = state.bookAssets[bookId] || {};
        return {
          bookAssets: {
            ...state.bookAssets,
            [bookId]: {
              ...currentAssets,
              [assetId]: updatedAsset
            }
          }
        };
      });
    }

    // Record for undo
    undoService.recordAction('update', 'asset', updatedAsset, asset);

    // Sync to cloud using proper operation queueing
    if (updates.x !== undefined || updates.y !== undefined || updates.width !== undefined || updates.height !== undefined) {
      documentMutationService.queueServerOperation('UPDATE_POSITION', {
        assetId: assetId,
        x: updatedAsset.x,
        y: updatedAsset.y,
        width: updatedAsset.width,
        height: updatedAsset.height,
        zIndex: 0
      });
    }
    
    if (updates.name !== undefined) {
      documentMutationService.queueServerOperation('UPDATE_METADATA', {
        assetId: assetId,
        name: updatedAsset.name
      });
    }
  },

  // Set active asset
  setActiveAsset: (assetId) => {
    set({ currentActiveId: assetId });
  },

  // Set current viewport
  setCurrentViewportId: (assetId) => {
    set({ currentViewportId: assetId });
  },

  // Get active asset
  getActiveAsset: () => {
    const activeId = get().currentActiveId;
    return activeId ? get().getAssetById(activeId) : null;
  },

  // Get asset by ID
  getAssetById: (assetId) => {
    const bookId = get().getCurrentBookId();
    if (!bookId) return null;
    
    const assets = get().bookAssets[bookId] || {};
    return assets[assetId] || null;
  },

  // Get current viewport asset
  getCurrentViewportAsset: () => {
    const viewportId = get().currentViewportId;
    return viewportId ? get().getAssetById(viewportId) : null;
  },

  // Get root assets (no parent)
  getRootAssets: () => {
    const assets = get().getCurrentBookAssets();
    return Object.values(assets).filter(asset => !asset.parentId);
  },

  // Get asset children
  getAssetChildren: (parentId) => {
    const assets = get().getCurrentBookAssets();
    return Object.values(assets).filter(asset => asset.parentId === parentId);
  },

  // Get asset tree
  getAssetTree: (rootId) => {
    const assets = get().getCurrentBookAssets();
    const visited = new Set<string>();
    
    const buildTree = (assetId: string): Asset[] => {
      if (visited.has(assetId)) return [];
      visited.add(assetId);
      
      const asset = assets[assetId];
      if (!asset) return [];
      
      const children = asset.children || [];
      const childTrees = children.flatMap(childId => buildTree(childId));
      
      return [asset, ...childTrees];
    };
    
    if (rootId) {
      return buildTree(rootId);
    } else {
      // Return all root assets and their descendants
      const rootAssets = get().getRootAssets();
      return rootAssets.flatMap(asset => buildTree(asset.id));
    }
  },

  // Enter viewport
  enterViewport: (assetId) => {
    const asset = get().getAssetById(assetId);
    if (!asset) return false;
    
    set({ 
      currentViewportId: assetId,
      currentActiveId: null 
    });
    
    return true;
  },

  // Exit viewport
  exitViewport: () => {
    const currentViewportId = get().currentViewportId;
    if (!currentViewportId) return false;
    
    const asset = get().getAssetById(currentViewportId);
    const parentId = asset?.parentId;
    
    set({ 
      currentViewportId: parentId || null,
      currentActiveId: currentViewportId 
    });
    
    return true;
  },

  // Get viewport path
  getViewportPath: () => {
    const path: string[] = [];
    let currentId = get().currentViewportId;
    
    while (currentId) {
      path.unshift(currentId);
      const asset = get().getAssetById(currentId);
      currentId = asset?.parentId || null;
    }
    
    return path;
  },

  // Custom field methods (simplified for this example)
  addCustomField: (assetId, field) => {
    const asset = get().getAssetById(assetId);
    if (!asset) return;
    
    const newField = { ...field, id: crypto.randomUUID() };
    const updatedAsset = {
      ...asset,
      customFields: [...(asset.customFields || []), newField],
      updatedAt: Date.now()
    };
    
    get().updateAsset(assetId, updatedAsset);
  },

  updateCustomField: (assetId, fieldId, updates) => {
    const asset = get().getAssetById(assetId);
    if (!asset) return;
    
    const updatedFields = (asset.customFields || []).map(field =>
      field.id === fieldId ? { ...field, ...updates } : field
    );
    
    const updatedAsset = {
      ...asset,
      customFields: updatedFields,
      updatedAt: Date.now()
    };
    
    get().updateAsset(assetId, updatedAsset);
  },

  removeCustomField: (assetId, fieldId) => {
    const asset = get().getAssetById(assetId);
    if (!asset) return;
    
    const updatedFields = (asset.customFields || []).filter(field => field.id !== fieldId);
    
    const updatedAsset = {
      ...asset,
      customFields: updatedFields,
      updatedAt: Date.now()
    };
    
    get().updateAsset(assetId, updatedAsset);
  },

  updateCustomFieldValue: (assetId, fieldId, value) => {
    const asset = get().getAssetById(assetId);
    if (!asset) return;
    
    // Update the custom field value in the asset's customFieldValues
    const updatedValues = (asset.customFieldValues || []).filter(v => v.fieldId !== fieldId);
    updatedValues.push({ fieldId, value });
    
    get().updateAsset(assetId, { customFieldValues: updatedValues });
  },

  // Global custom fields (simplified)
  addGlobalCustomField: (field) => {
    const bookId = get().getCurrentBookId();
    if (!bookId) return;
    
    const newField = { ...field, id: crypto.randomUUID(), createdAt: Date.now(), updatedAt: Date.now() };
    
    set((state) => ({
      bookGlobalCustomFields: {
        ...state.bookGlobalCustomFields,
        [bookId]: [...(state.bookGlobalCustomFields[bookId] || []), newField]
      }
    }));
  },

  updateGlobalCustomField: (fieldId, updates) => {
    const bookId = get().getCurrentBookId();
    if (!bookId) return;
    
    set((state) => ({
      bookGlobalCustomFields: {
        ...state.bookGlobalCustomFields,
        [bookId]: (state.bookGlobalCustomFields[bookId] || []).map(field =>
          field.id === fieldId ? { ...field, ...updates, updatedAt: Date.now() } : field
        )
      }
    }));
  },

  removeGlobalCustomField: (fieldId) => {
    const bookId = get().getCurrentBookId();
    if (!bookId) return;
    
    set((state) => ({
      bookGlobalCustomFields: {
        ...state.bookGlobalCustomFields,
        [bookId]: (state.bookGlobalCustomFields[bookId] || []).filter(field => field.id !== fieldId)
      }
    }));
  },

  applyGlobalFieldsToAsset: (assetId) => {
    const asset = get().getAssetById(assetId);
    const globalFields = get().getCurrentBookGlobalCustomFields();
    
    if (!asset || !globalFields.length) return;
    
    const newCustomFields = globalFields.map(field => ({
      id: crypto.randomUUID(),
      label: field.label,
      type: field.type,
      displayInViewport: field.displayInViewport,
      isGlobal: true
    }));
    
    const newFieldValues = globalFields.map(field => ({
      fieldId: field.id,
      value: '' // Default empty value
    }));
    
    const updatedAsset = {
      ...asset,
      customFields: [...(asset.customFields || []), ...newCustomFields],
      customFieldValues: [...(asset.customFieldValues || []), ...newFieldValues],
      updatedAt: Date.now()
    };
    
    get().updateAsset(assetId, updatedAsset);
  },

  // Bulk restoration
  restoreAssets: (assets) => {
    const bookId = get().getCurrentBookId();
    if (!bookId) return;
    
    if (get().isVirtualizedMode) {
      // Add all assets to cache
      Object.values(assets).forEach(asset => {
        assetCacheService.updateAsset(asset);
      });
    } else {
      // Legacy mode
      set((state) => ({
        bookAssets: {
          ...state.bookAssets,
          [bookId]: assets
        }
      }));
    }
  },

  restoreGlobalCustomFields: (fields) => {
    const bookId = get().getCurrentBookId();
    if (!bookId) return;
    
    set((state) => ({
      bookGlobalCustomFields: {
        ...state.bookGlobalCustomFields,
        [bookId]: fields
      }
    }));
  },

  // Background editing
  setIsEditingBackground: (editing) => {
    set({ isEditingBackground: editing });
  },

  // Expansion state (simplified)
  expandAll: () => {
    // Implementation depends on your UI needs
    console.log('[AssetStore] expandAll called');
  },

  collapseAll: () => {
    // Implementation depends on your UI needs
    console.log('[AssetStore] collapseAll called');
  },

  toggleAssetExpansion: (assetId) => {
    // Implementation depends on your UI needs
    console.log('[AssetStore] toggleAssetExpansion called for:', assetId);
  },

  // Clear world data
  clearWorldData: () => {
    const bookId = get().getCurrentBookId();
    if (!bookId) return;
    
    if (get().isVirtualizedMode) {
      assetCacheService.clearCache();
    }
    
    set((state) => ({
      bookAssets: {
        ...state.bookAssets,
        [bookId]: {}
      },
      bookGlobalCustomFields: {
        ...state.bookGlobalCustomFields,
        [bookId]: []
      }
    }));
  },

  // Clear book data
  clearBookData: (bookId) => {
    set((state) => {
      const newBookAssets = { ...state.bookAssets };
      const newGlobalFields = { ...state.bookGlobalCustomFields };
      delete newBookAssets[bookId];
      delete newGlobalFields[bookId];
      
      return {
        bookAssets: newBookAssets,
        bookGlobalCustomFields: newGlobalFields
      };
    });
  },

  // Get world data
  getWorldData: () => {
    const bookId = get().getCurrentBookId();
    if (!bookId) return null;
    
    return {
      assets: get().getCurrentBookAssets(),
      globalCustomFields: get().getCurrentBookGlobalCustomFields()
    };
  },

  // Reparent asset
  reparentAsset: (assetId, newParentId) => {
    const asset = get().getAssetById(assetId);
    if (!asset) return;
    
    const updatedAsset = { ...asset, parentId: newParentId, updatedAt: Date.now() };
    get().updateAsset(assetId, updatedAsset);
  },
    })
  )
);
