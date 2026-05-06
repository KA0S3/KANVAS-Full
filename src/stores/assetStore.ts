import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Asset } from '@/components/AssetItem';
import type { CustomField, CustomFieldValue, GlobalCustomField, ViewportDisplaySettings } from '@/types/extendedAsset';
import { DEFAULT_VIEWPORT_DISPLAY_SETTINGS } from '@/types/extendedAsset';
import { useBookStore } from './bookStoreSimple';
import { supabase } from '@/lib/supabase';
import { documentMutationService } from '@/services/DocumentMutationService';
import { undoService } from '@/services/UndoService';

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

  // Helper to get current book ID
  getCurrentBookId: () => {
    const bookStore = useBookStore.getState();
    return bookStore.currentBookId;
  },

  // Get current book's assets
  getCurrentBookAssets: () => {
    const state = get();
    const bookId = state.getCurrentBookId();
    const assets = state.bookAssets[bookId] || {};
    console.log('🎯 AssetStore.getCurrentBookAssets:', {
      bookId,
      bookAssetsKeys: Object.keys(state.bookAssets),
      assetsForBook: assets,
      assetsCount: Object.keys(assets).length
    });
    return assets;
  },

  // Get current book's global custom fields
  getCurrentBookGlobalCustomFields: () => {
    const state = get();
    const bookId = state.getCurrentBookId();
    return state.bookGlobalCustomFields[bookId] || [];
  },

  // Create a new asset
  createAsset: (assetData: Omit<Asset, 'id' | 'children'>, parentId?: string) => {
    try {
      const id = crypto.randomUUID();
      const now = Date.now();
      const newAsset: Asset = {
        ...assetData,
        id,
        children: [],
        parentId,
        width: assetData.width || 200,
        height: assetData.height || 150,
        customFields: assetData.customFields || [],
        customFieldValues: assetData.customFieldValues || [],
        tags: assetData.tags || [],
        viewportConfig: assetData.viewportConfig || {
          zoom: 1,
          panX: 0,
          panY: 0,
        },
        backgroundConfig: assetData.backgroundConfig || {
          gridSize: 40,
        },
        viewportDisplaySettings: assetData.viewportDisplaySettings || { ...DEFAULT_VIEWPORT_DISPLAY_SETTINGS },
        createdAt: now,
        updatedAt: now,
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
        newBookAssets[bookId][id] = newAsset;
        
        // If it has a parent, add this asset to parent's children array and expand the parent
        if (parentId && newBookAssets[bookId][parentId]) {
          newBookAssets[bookId][parentId] = {
            ...newBookAssets[bookId][parentId],
            children: [...newBookAssets[bookId][parentId].children, id],
            isExpanded: true, // Auto-expand parent to show new asset
            updatedAt: now,
          };
        }
        
        return { bookAssets: newBookAssets };
      });

      // Phase 3 Integration: Track metadata changes (MASTER_PLAN.md state-based tracking)
      documentMutationService.markAssetChanged(id, newAsset);

      // CRITICAL FIX: Trigger immediate sync for asset creation to ensure it saves
      // This prevents data loss if user navigates away before 40s auto-save
      setTimeout(() => {
        documentMutationService.syncNow();
      }, 100);

      // Record for undo
      undoService.recordAction('create', 'asset', newAsset);

      return id;
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

    const oldParentId = asset.parentId;

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
        parentId: newParentId,
      };

      return { bookAssets: newBookAssets };
    });

    // Phase 3 Integration: Track metadata changes (MASTER_PLAN.md state-based tracking)
    const updatedAsset = { ...asset, parentId: newParentId };
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

    // Phase 3 Integration: Track position changes for hot updates
    documentMutationService.markPositionChanged(assetId, x, y, 0);
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

    // Get the full asset data for the operation
    const state = useAssetStore.getState();
    const bookId = state.getCurrentBookId();
    if (!bookId) return;

    const bookAssets = state.bookAssets[bookId] || {};
    const asset = bookAssets[assetId];
    if (!asset) return;

    // Phase 3 Integration: Track position changes (MASTER_PLAN.md state-based tracking)
    documentMutationService.markPositionChanged(assetId, x, y, 0);
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
          ...updates,
        },
      };

      return { bookAssets: newBookAssets };
    });

    // Phase 3 Integration: Track metadata changes
    const state = useAssetStore.getState();
    const bookId = state.getCurrentBookId();
    if (bookId) {
      const bookAssets = state.bookAssets[bookId] || {};
      const asset = bookAssets[assetId];
      if (asset) {
        documentMutationService.markAssetChanged(assetId, asset);
        // Record for undo
        undoService.recordAction('update', 'asset', { ...asset, ...updates }, asset);
      }
    }

    // If updating position-related fields, track position changes (MASTER_PLAN.md state-based tracking)
    if (updates.x !== undefined || updates.y !== undefined) {
      const state = useAssetStore.getState();
      const bookId = state.getCurrentBookId();
      if (bookId) {
        const bookAssets = state.bookAssets[bookId] || {};
        const asset = bookAssets[assetId];
        if (asset) {
          documentMutationService.markPositionChanged(
            assetId,
            updates.x ?? asset.x ?? 0,
            updates.y ?? asset.y ?? 0,
            0
          );
        }
      }
    }
    
    // If updating background config, track metadata changes (MASTER_PLAN.md state-based tracking)
    // Note: markAssetChanged is already called above for all updates
    // CRITICAL FIX: Add explicit auto-save trigger for background changes
    if (updates.backgroundConfig !== undefined) {
      const state = useAssetStore.getState();
      const bookId = state.getCurrentBookId();
      if (bookId) {
        const bookAssets = state.bookAssets[bookId] || {};
        const asset = bookAssets[assetId];
        if (asset) {
          // Trigger immediate save for background changes
          documentMutationService.markAssetChanged(assetId, asset);
          console.log(`[AssetStore] Background config changed for asset ${assetId}, triggering auto-save`);
        }
      }
    }
  },

  // Delete an asset and all its descendants recursively
  deleteAsset: (assetId: string) => {
    const stateBefore = useAssetStore.getState();
    const bookId = stateBefore.getCurrentBookId();
    if (!bookId) return;
    
    const bookAssets = stateBefore.bookAssets[bookId] || {};
    const asset = bookAssets[assetId];
    if (!asset) return;

    // Recursive function to collect all descendant IDs
    const collectDescendants = (id: string): string[] => {
      const currentAsset = bookAssets[id];
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
      if (asset.parentId && currentBookAssets[asset.parentId]) {
        newBookAssets[bookId][asset.parentId] = {
          ...currentBookAssets[asset.parentId],
          children: currentBookAssets[asset.parentId].children.filter(id => !idsToDelete.includes(id)),
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
      const deletedAsset = bookAssets[id];
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
    
    const parentAsset = currentAsset.parentId 
      ? state.getAssetById(currentAsset.parentId)
      : null;
    
    if (parentAsset) {
      console.log(`[AssetStore] Exiting to parent viewport: ${parentAsset.name}`);
      set({ 
        currentViewportId: parentAsset.id,
        currentActiveId: parentAsset.id 
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
      currentId = asset.parentId;
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
    return Object.values(bookAssets).filter(asset => !asset.parentId);
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
      Object.values(bookAssets).filter(asset => !asset.parentId).forEach(asset => traverse(asset.id));
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
          customFields: [...(asset.customFields || []), newField],
          updatedAt: Date.now(),
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
          customFields: (asset.customFields || []).map((field) =>
            field.id === fieldId ? { ...field, ...updates } : field
          ),
          updatedAt: Date.now(),
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
          customFields: (asset.customFields || []).filter((field) => field.id !== fieldId),
          customFieldValues: (asset.customFieldValues || []).filter((value) => value.fieldId !== fieldId),
          updatedAt: Date.now(),
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
      
      const existingValues = asset.customFieldValues || [];
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
          customFieldValues: newValues,
          updatedAt: Date.now(),
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
          customFields: (asset.customFields || []).filter((field) => field.id !== fieldId),
          customFieldValues: (asset.customFieldValues || []).filter((value) => value.fieldId !== fieldId),
          updatedAt: Date.now(),
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
    const existingFieldIds = new Set((asset.customFields || []).map((field) => field.id));
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
          customFields: [...(asset.customFields || []), ...newCustomFields],
          updatedAt: Date.now(),
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
          viewportDisplaySettings: {
            ...(asset.viewportDisplaySettings || { ...DEFAULT_VIEWPORT_DISPLAY_SETTINGS }),
            ...settings,
          },
          updatedAt: Date.now(),
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
          newBookAssets[bookId][assetId] = { ...asset, isExpanded: true };
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
          newBookAssets[bookId][assetId] = { ...asset, isExpanded: false };
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
          isExpanded: !asset.isExpanded,
        },
      };
      
      return { bookAssets: newBookAssets };
    });
  },

  // World-aware methods
  loadWorldData: (worldData) => {
    console.log(`[AssetStore] loadWorldData called with:`, {
      hasWorldData: !!worldData,
      worldDataKeys: worldData ? Object.keys(worldData) : 'no keys',
      assetCount: worldData?.assets ? Object.keys(worldData.assets).length : 0,
      sampleAsset: worldData?.assets ? Object.values(worldData.assets)[0] : null,
      fullWorldData: worldData
    });

    // DETAILED DEBUG: Log the actual data structure
    console.log('[AssetStore] DETAILED DEBUG - worldData structure:', JSON.stringify(worldData, null, 2));
    console.log('[AssetStore] DETAILED DEBUG - worldData.assets structure:', JSON.stringify(worldData?.assets, null, 2));

    if (worldData) {
      const bookId = get().getCurrentBookId();
      console.log(`[AssetStore] Current book ID:`, bookId);
      
      if (!bookId) {
        console.warn('[AssetStore] Cannot load world data - no current book');
        return;
      }

      // Migrate 'other' type to 'card' for database compatibility
      const assets = worldData.assets || {};
      console.log(`[AssetStore] Extracted assets from worldData:`, {
        assetsType: typeof assets,
        assetsKeys: Object.keys(assets),
        assetsLength: Object.keys(assets).length,
        sampleAsset: Object.values(assets)[0]
      });
      const migratedAssets: Record<string, any> = {};
      let migratedCount = 0;

      Object.entries(assets).forEach(([id, asset]: [string, any]) => {
        if (asset.type === 'other') {
          migratedAssets[id] = { ...asset, type: 'card' };
          migratedCount++;
        } else {
          migratedAssets[id] = asset;
        }
      });

      if (migratedCount > 0) {
        console.log(`[AssetStore] Migrated ${migratedCount} assets from 'other' to 'card' type`);
      }

      console.log(`[AssetStore] About to update store with:`, {
        bookId,
        assetCount: Object.keys(migratedAssets).length,
        assetIds: Object.keys(migratedAssets)
      });

      set((state) => {
        const newBookAssets = { ...state.bookAssets };
        const newBookGlobalCustomFields = { ...state.bookGlobalCustomFields };

        newBookAssets[bookId] = migratedAssets;
        newBookGlobalCustomFields[bookId] = worldData.globalCustomFields || [];

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
          id,
          children: asset.children || [],
          customFields: asset.customFields || [],
          customFieldValues: asset.customFieldValues || [],
          tags: asset.tags || [],
          viewportConfig: asset.viewportConfig || { zoom: 1, panX: 0, panY: 0 },
          backgroundConfig: asset.backgroundConfig || { gridSize: 40 },
          viewportDisplaySettings: asset.viewportDisplaySettings || { ...DEFAULT_VIEWPORT_DISPLAY_SETTINGS },
          // Ensure required fields have defaults
          width: asset.width || 200,
          height: asset.height || 150,
          x: asset.x || 0,
          y: asset.y || 0,
          isExpanded: asset.isExpanded || false,
          createdAt: asset.createdAt || Date.now(),
          updatedAt: asset.updatedAt || Date.now(),
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
})
));

// Auto-save functionality: Now handled by autosaveService
// This subscription is kept for compatibility but autosaveService handles cloud saves
useAssetStore.subscribe(
  (state) => state,
  (state) => {
    const bookStore = useBookStore.getState();
    if (bookStore.currentBookId) {
      const worldData = {
        assets: state.bookAssets[bookStore.currentBookId] || {},
        globalCustomFields: state.bookGlobalCustomFields[bookStore.currentBookId] || [],
      };
      // Update local book store immediately for UI consistency
      // Cloud sync is handled by autosaveService
      bookStore.updateWorldData(bookStore.currentBookId, worldData);
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

// Initialize assetStore from bookStore on app start
// This ensures assetStore is populated from the single source of truth (bookStore)
const initFromBookStore = () => {
  const bookState = useBookStore.getState();
  if (bookState.currentBookId && bookState.books[bookState.currentBookId]) {
    const book = bookState.books[bookState.currentBookId];
    const assetStore = useAssetStore.getState();
    const bookId = bookState.currentBookId;

    // Only initialize if assetStore is empty for this book
    if (!assetStore.bookAssets[bookId] || Object.keys(assetStore.bookAssets[bookId] || {}).length === 0) {
      if (book.worldData?.assets && Object.keys(book.worldData.assets).length > 0) {
        console.log(`[AssetStore] Initializing from bookStore for book ${bookId}:`, Object.keys(book.worldData.assets).length, 'assets');

        // Convert flat assets to parent-child hierarchy
        const assets = book.worldData.assets;
        const bookAssets: Record<string, Asset> = {};

        Object.values(assets).forEach((asset: any) => {
          bookAssets[asset.id] = {
            ...asset,
            children: Object.values(assets)
              .filter((a: any) => a.parentId === asset.id)
              .map((a: any) => a.id),
          };
        });

        useAssetStore.setState({
          bookAssets: {
            ...assetStore.bookAssets,
            [bookId]: bookAssets,
          },
          bookGlobalCustomFields: {
            ...assetStore.bookGlobalCustomFields,
            [bookId]: book.worldData.globalCustomFields || [],
          },
        });

        // Restore viewport if we have one saved for this book
        const savedViewport = getViewportFromStorage();
        if (savedViewport?.bookId === bookId && savedViewport.viewportId && bookAssets[savedViewport.viewportId]) {
          console.log(`[AssetStore] Restoring viewport to ${savedViewport.viewportId}`);
          useAssetStore.setState({
            currentViewportId: savedViewport.viewportId,
            currentActiveId: savedViewport.viewportId,
          });
        }
      }
    }
  }
};

// Run initialization immediately and on book changes
initFromBookStore();

// Subscribe to bookStore changes - need to use selector syntax manually
// since bookStore doesn't use subscribeWithSelector
let lastBookId: string | null = null;
let lastBooksCount = 0;
useBookStore.subscribe((state) => {
  // Check if currentBookId changed or books data was populated (rehydration)
  const booksCount = Object.keys(state.books).length;
  if (state.currentBookId !== lastBookId || booksCount !== lastBooksCount) {
    lastBookId = state.currentBookId;
    lastBooksCount = booksCount;
    initFromBookStore();
  }
});
