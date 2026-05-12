/**
 * UI STORE - Ephemeral UI State Only
 * 
 * This store contains UI-only ephemeral state that is NEVER persisted.
 * Follows strict zone separation principles.
 * 
 * 🔒 CRITICAL: This store must NEVER contain canonical asset data or sync state
 */

import { create } from 'zustand';

// UI-only state (never persisted)
export interface UIState {
  // Selection state (ephemeral)
  selectedAssets: Set<string>;
  selectionAnchor: { x: number; y: number } | null;
  selectionRect: { x: number; y: number; width: number; height: number } | null;
  isSelecting: boolean;
  
  // Hover state (ephemeral)
  hoveredAsset: string | null;
  hoverPosition: { x: number; y: number } | null;
  
  // Drag state (ephemeral)
  dragState: {
    isDragging: boolean;
    draggedAssetIds: string[]; // Support multi-drag
    dragStartPos: { x: number; y: number };
    currentPos: { x: number; y: number };
    dragOffset: { x: number; y: number };
    dragMode: 'move' | 'copy' | 'resize';
  };
  
  // Viewport state (ephemeral)
  viewport: { x: number; y: number; zoom: number };
  viewportBounds: { left: number; top: number; right: number; bottom: number } | null;
  
  // UI controls (ephemeral)
  isAssetTreeOpen: boolean;
  isPropertiesPanelOpen: boolean;
  activeTab: 'canvas' | 'tree' | 'properties';
  
  // Modal states (ephemeral)
  deleteDialogOpen: boolean;
  createDialogOpen: boolean;
  
  // Search and filter (ephemeral)
  searchQuery: string;
  filterTags: string[];
  
  // Canvas interaction state (ephemeral)
  canvasMode: 'select' | 'pan' | 'create';
  showGrid: boolean;
  snapToGrid: boolean;
  gridSize: number;
}

export interface UIStore extends UIState {
  // Selection operations
  selectAsset: (assetId: string) => void;
  selectMultipleAssets: (assetIds: string[]) => void;
  deselectAsset: (assetId: string) => void;
  clearSelection: () => void;
  isSelected: (assetId: string) => boolean;
  toggleSelection: (assetId: string) => void;
  selectAllInRect: (rect: { x: number; y: number; width: number; height: number }) => void;
  
  // Selection rectangle operations
  startSelection: (anchor: { x: number; y: number }) => void;
  updateSelection: (current: { x: number; y: number }) => void;
  endSelection: () => void;
  
  // Hover operations
  setHoveredAsset: (assetId: string | null, position?: { x: number; y: number }) => void;
  clearHover: () => void;
  
  // Drag operations
  startDrag: (assetIds: string[], startPos: { x: number; y: number }, mode?: 'move' | 'copy' | 'resize') => void;
  updateDrag: (currentPos: { x: number; y: number }) => void;
  endDrag: () => void;
  getDragDelta: () => { x: number; y: number };
  
  // Viewport operations
  setViewport: (viewport: { x: number; y: number; zoom: number }) => void;
  panViewport: (delta: { x: number; y: number }) => void;
  zoomViewport: (factor: number, center?: { x: number; y: number }) => void;
  updateViewportBounds: () => void;
  
  // UI control operations
  toggleAssetTree: () => void;
  togglePropertiesPanel: () => void;
  setActiveTab: (tab: 'canvas' | 'tree' | 'properties') => void;
  
  // Modal operations
  openDeleteDialog: () => void;
  closeDeleteDialog: () => void;
  openCreateDialog: () => void;
  closeCreateDialog: () => void;
  
  // Search and filter operations
  setSearchQuery: (query: string) => void;
  setFilterTags: (tags: string[]) => void;
  addFilterTag: (tag: string) => void;
  removeFilterTag: (tag: string) => void;
  
  // Canvas interaction operations
  setCanvasMode: (mode: 'select' | 'pan' | 'create') => void;
  toggleGrid: () => void;
  toggleSnapToGrid: () => void;
  setGridSize: (size: number) => void;
  
  // Reset UI state
  resetUI: () => void;
  
  // Validation helpers
  validateUIState: () => boolean;
}

export const useUIStore = create<UIStore>((set, get) => ({
  // Initial state
  selectedAssets: new Set(),
  selectionAnchor: null,
  selectionRect: null,
  isSelecting: false,
  hoveredAsset: null,
  hoverPosition: null,
  dragState: {
    isDragging: false,
    draggedAssetIds: [],
    dragStartPos: { x: 0, y: 0 },
    currentPos: { x: 0, y: 0 },
    dragOffset: { x: 0, y: 0 },
    dragMode: 'move',
  },
  viewport: { x: 0, y: 0, zoom: 1 },
  viewportBounds: null,
  isAssetTreeOpen: true,
  isPropertiesPanelOpen: true,
  activeTab: 'canvas',
  deleteDialogOpen: false,
  createDialogOpen: false,
  searchQuery: '',
  filterTags: [],
  canvasMode: 'select',
  showGrid: false,
  snapToGrid: false,
  gridSize: 20,

  // Selection operations
  selectAsset: (assetId: string) => {
    set(state => ({
      selectedAssets: new Set([assetId])
    }));
  },

  selectMultipleAssets: (assetIds: string[]) => {
    set(state => ({
      selectedAssets: new Set(assetIds)
    }));
  },

  deselectAsset: (assetId: string) => {
    set(state => {
      const newSelection = new Set(state.selectedAssets);
      newSelection.delete(assetId);
      return { selectedAssets: newSelection };
    });
  },

  clearSelection: () => {
    set({ selectedAssets: new Set() });
  },

  isSelected: (assetId: string) => {
    return get().selectedAssets.has(assetId);
  },

  toggleSelection: (assetId: string) => {
    set(state => {
      const newSelection = new Set(state.selectedAssets);
      if (newSelection.has(assetId)) {
        newSelection.delete(assetId);
      } else {
        newSelection.add(assetId);
      }
      return { selectedAssets: newSelection };
    });
  },

  selectAllInRect: (rect: { x: number; y: number; width: number; height: number }) => {
    // This would be implemented by the canvas component
    // For now, just update the selection rect
    set(state => ({
      selectionRect: rect,
      // Assets in rect would be selected by canvas component
    }));
  },

  // Selection rectangle operations
  startSelection: (anchor: { x: number; y: number }) => {
    set({
      selectionAnchor: anchor,
      isSelecting: true,
      selectionRect: null,
    });
  },

  updateSelection: (current: { x: number; y: number }) => {
    const state = get();
    if (!state.selectionAnchor) return;

    const rect = {
      x: Math.min(state.selectionAnchor.x, current.x),
      y: Math.min(state.selectionAnchor.y, current.y),
      width: Math.abs(current.x - state.selectionAnchor.x),
      height: Math.abs(current.y - state.selectionAnchor.y),
    };

    set({ selectionRect: rect });
  },

  endSelection: () => {
    set({
      isSelecting: false,
      selectionAnchor: null,
      selectionRect: null,
    });
  },

  // Hover operations
  setHoveredAsset: (assetId: string | null, position?: { x: number; y: number }) => {
    set({ 
      hoveredAsset: assetId,
      hoverPosition: position || null,
    });
  },

  clearHover: () => {
    set({
      hoveredAsset: null,
      hoverPosition: null,
    });
  },

  // Drag operations
  startDrag: (assetIds: string[], startPos: { x: number; y: number }, mode: 'move' | 'copy' | 'resize' = 'move') => {
    set(state => ({
      dragState: {
        isDragging: true,
        draggedAssetIds: assetIds,
        dragStartPos: startPos,
        currentPos: startPos,
        dragOffset: { x: 0, y: 0 },
        dragMode: mode,
      }
    }));
  },

  updateDrag: (currentPos: { x: number; y: number }) => {
    const state = get();
    if (!state.dragState.isDragging) return;

    const dragOffset = {
      x: currentPos.x - state.dragState.dragStartPos.x,
      y: currentPos.y - state.dragState.dragStartPos.y,
    };

    set(state => ({
      dragState: {
        ...state.dragState,
        currentPos,
        dragOffset,
      }
    }));
  },

  endDrag: () => {
    set(state => ({
      dragState: {
        isDragging: false,
        draggedAssetIds: [],
        dragStartPos: { x: 0, y: 0 },
        currentPos: { x: 0, y: 0 },
        dragOffset: { x: 0, y: 0 },
        dragMode: 'move',
      }
    }));
  },

  getDragDelta: () => {
    const state = get();
    return state.dragState.dragOffset;
  },

  // Viewport operations
  setViewport: (viewport: { x: number; y: number; zoom: number }) => {
    set({ viewport });
    get().updateViewportBounds();
  },

  panViewport: (delta: { x: number; y: number }) => {
    set(state => ({
      viewport: {
        ...state.viewport,
        x: state.viewport.x + delta.x,
        y: state.viewport.y + delta.y,
      }
    }));
    get().updateViewportBounds();
  },

  zoomViewport: (factor: number, center?: { x: number; y: number }) => {
    set(state => {
      const newZoom = Math.max(0.1, Math.min(5, state.viewport.zoom * factor));
      
      if (center) {
        // Zoom towards center point
        const scale = newZoom / state.viewport.zoom;
        const newCenterX = center.x * scale;
        const newCenterY = center.y * scale;
        
        return {
          viewport: {
            ...state.viewport,
            zoom: newZoom,
            x: center.x - newCenterX,
            y: center.y - newCenterY,
          }
        };
      }
      
      return {
        viewport: {
          ...state.viewport,
          zoom: newZoom,
        }
      };
    });
    get().updateViewportBounds();
  },

  updateViewportBounds: () => {
    const state = get();
    const { viewport } = state;
    
    // Calculate viewport bounds in world coordinates
    const bounds = {
      left: -viewport.x / viewport.zoom,
      top: -viewport.y / viewport.zoom,
      right: (-viewport.x + window.innerWidth) / viewport.zoom,
      bottom: (-viewport.y + window.innerHeight) / viewport.zoom,
    };
    
    set({ viewportBounds: bounds });
  },

  // UI control operations
  toggleAssetTree: () => {
    set(state => ({ isAssetTreeOpen: !state.isAssetTreeOpen }));
  },

  togglePropertiesPanel: () => {
    set(state => ({ isPropertiesPanelOpen: !state.isPropertiesPanelOpen }));
  },

  setActiveTab: (tab: 'canvas' | 'tree' | 'properties') => {
    set({ activeTab: tab });
  },

  // Modal operations
  openDeleteDialog: () => {
    set({ deleteDialogOpen: true });
  },

  closeDeleteDialog: () => {
    set({ deleteDialogOpen: false });
  },

  openCreateDialog: () => {
    set({ createDialogOpen: true });
  },

  closeCreateDialog: () => {
    set({ createDialogOpen: false });
  },

  // Search and filter operations
  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
  },

  setFilterTags: (tags: string[]) => {
    set({ filterTags: tags });
  },

  addFilterTag: (tag: string) => {
    set(state => ({
      filterTags: [...state.filterTags, tag]
    }));
  },

  removeFilterTag: (tag: string) => {
    set(state => ({
      filterTags: state.filterTags.filter(t => t !== tag)
    }));
  },

  // Canvas interaction operations
  setCanvasMode: (mode: 'select' | 'pan' | 'create') => {
    set({ canvasMode: mode });
  },

  toggleGrid: () => {
    set(state => ({ showGrid: !state.showGrid }));
  },

  toggleSnapToGrid: () => {
    set(state => ({ snapToGrid: !state.snapToGrid }));
  },

  setGridSize: (size: number) => {
    set({ gridSize: Math.max(5, Math.min(100, size)) });
  },

  // Reset UI state
  resetUI: () => {
    set({
      selectedAssets: new Set(),
      selectionAnchor: null,
      selectionRect: null,
      isSelecting: false,
      hoveredAsset: null,
      hoverPosition: null,
      dragState: {
        isDragging: false,
        draggedAssetIds: [],
        dragStartPos: { x: 0, y: 0 },
        currentPos: { x: 0, y: 0 },
        dragOffset: { x: 0, y: 0 },
        dragMode: 'move',
      },
      viewport: { x: 0, y: 0, zoom: 1 },
      viewportBounds: null,
      isAssetTreeOpen: true,
      isPropertiesPanelOpen: true,
      activeTab: 'canvas',
      deleteDialogOpen: false,
      createDialogOpen: false,
      searchQuery: '',
      filterTags: [],
      canvasMode: 'select',
      showGrid: false,
      snapToGrid: false,
      gridSize: 20,
    });
  },

  // Validation helpers
  validateUIState: () => {
    const state = get();
    
    // Check for forbidden patterns - ensure no persistent data leaked into UI store
    const forbiddenFields = ['sync_status', 'upload_progress', 'cloud_status', 'version'];
    const stateString = JSON.stringify(state);
    
    for (const field of forbiddenFields) {
      if (stateString.includes(field)) {
        console.error(`Forbidden field ${field} found in UI state`);
        return false;
      }
    }
    
    // Validate viewport bounds are up to date
    if (state.viewport && !state.viewportBounds) {
      console.warn('Viewport bounds not calculated');
      get().updateViewportBounds();
    }
    
    return true;
  },
}));

// Selectors for derived state
export const selectSelectedAssetIds = (state: UIStore) => Array.from(state.selectedAssets);
export const selectSelectedAssetCount = (state: UIStore) => state.selectedAssets.size;
export const selectHasSelection = (state: UIStore) => state.selectedAssets.size > 0;
export const selectIsDragging = (state: UIStore) => state.dragState.isDragging;
export const selectDraggedAssetIds = (state: UIStore) => state.dragState.draggedAssetIds;
export const selectDragMode = (state: UIStore) => state.dragState.dragMode;
export const selectViewportBounds = (state: UIStore) => state.viewportBounds;
export const selectViewport = (state: UIStore) => state.viewport;
export const selectHasActiveFilters = (state: UIStore) => 
  state.searchQuery.length > 0 || state.filterTags.length > 0;
export const selectIsSelecting = (state: UIStore) => state.isSelecting;
export const selectSelectionRect = (state: UIStore) => state.selectionRect;
export const selectHoveredAsset = (state: UIStore) => state.hoveredAsset;
export const selectCanvasMode = (state: UIStore) => state.canvasMode;
export const selectShowGrid = (state: UIStore) => state.showGrid;
export const selectSnapToGrid = (state: UIStore) => state.snapToGrid;

// Utility functions for viewport culling and spatial optimization
export const isAssetInViewport = (assetBounds: { x: number; y: number; width: number; height: number }, viewport: UIState['viewport']) => {
  const viewportLeft = -viewport.x / viewport.zoom;
  const viewportTop = -viewport.y / viewport.zoom;
  const viewportRight = viewportLeft + window.innerWidth / viewport.zoom;
  const viewportBottom = viewportTop + window.innerHeight / viewport.zoom;

  return !(
    assetBounds.x + assetBounds.width < viewportLeft ||
    assetBounds.x > viewportRight ||
    assetBounds.y + assetBounds.height < viewportTop ||
    assetBounds.y > viewportBottom
  );
};

export const getAssetSelectionRectangle = (selectedAssets: string[], getAssetBounds: (id: string) => { x: number; y: number; width: number; height: number } | null) => {
  if (selectedAssets.length === 0) return null;
  
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  
  for (const assetId of selectedAssets) {
    const bounds = getAssetBounds(assetId);
    if (!bounds) continue;
    
    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.x + bounds.width);
    maxY = Math.max(maxY, bounds.y + bounds.height);
  }
  
  if (minX === Infinity) return null;
  
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
};

// Grid snapping utility
export const snapToGridValue = (value: number, gridSize: number) => {
  return Math.round(value / gridSize) * gridSize;
};

export const snapPointToGrid = (point: { x: number; y: number }, gridSize: number) => {
  return {
    x: snapToGridValue(point.x, gridSize),
    y: snapToGridValue(point.y, gridSize),
  };
};

// Performance optimization helpers
export const shouldAssetRender = (assetBounds: { x: number; y: number; width: number; height: number }, viewportBounds: UIState['viewportBounds'], buffer: number = 100) => {
  if (!viewportBounds) return true;
  
  return !(
    assetBounds.x + assetBounds.width < viewportBounds.left - buffer ||
    assetBounds.x > viewportBounds.right + buffer ||
    assetBounds.y + assetBounds.height < viewportBounds.top - buffer ||
    assetBounds.y > viewportBounds.bottom + buffer
  );
};

// UI State validation helpers
export const validateUIStateIntegrity = (state: UIState): boolean => {
  // Ensure no persistent data leaked into UI state
  const forbiddenPatterns = [
    /sync_status/i,
    /upload_progress/i,
    /cloud_status/i,
    /version/i,
    /created_at/i,
    /updated_at/i,
  ];
  
  const stateString = JSON.stringify(state);
  
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(stateString)) {
      console.error(`Forbidden pattern ${pattern} found in UI state`);
      return false;
    }
  }
  
  // Validate viewport consistency
  if (state.viewport.zoom <= 0 || state.viewport.zoom > 10) {
    console.error('Invalid viewport zoom level');
    return false;
  }
  
  // Validate drag state consistency
  if (state.dragState.isDragging && state.dragState.draggedAssetIds.length === 0) {
    console.error('Drag state inconsistent: isDragging but no assets');
    return false;
  }
  
  return true;
};
