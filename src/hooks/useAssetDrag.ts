/**
 * ASSET DRAG HOOK - Provides drag functionality for assets
 * 
 * This hook provides drag and drop functionality using the UI store's drag system.
 * It handles mouse and touch events for dragging assets.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useUIStore } from '@/stores/uiStore';
import { useKanvasStore } from '@/stores/kanvasStore';
import type { Asset } from '@/types/Asset';

export function useAssetDrag(containerRef?: React.RefObject<HTMLDivElement>) {
  // Use provided containerRef or create a new one
  const internalContainerRef = useRef<HTMLDivElement>(null);
  const dragContainerRef = containerRef || internalContainerRef;
  const pointerStartRef = useRef({ x: 0, y: 0 });
  const assetStartLayoutsRef = useRef(new Map<string, Asset['layout']>());
  
  // UI store for drag state
  const {
    dragState,
    startDrag,
    updateDrag,
    endDrag,
    selectAsset,
  } = useUIStore();
  
  // Kanvas store for asset updates
  const { updateAsset, getAsset } = useKanvasStore();

  const getCanvasPointerPosition = useCallback((clientX: number, clientY: number) => {
    const container = dragContainerRef.current;
    if (!container) {
      return { x: clientX, y: clientY };
    }

    const containerRect = container.getBoundingClientRect();
    return {
      x: clientX - containerRect.left + container.scrollLeft,
      y: clientY - containerRect.top + container.scrollTop,
    };
  }, [dragContainerRef]);

  const captureDragStart = useCallback((assetIds: string[], pointerPosition: { x: number; y: number }) => {
    pointerStartRef.current = pointerPosition;
    const startLayouts = new Map<string, Asset['layout']>();

    assetIds.forEach(assetId => {
      const asset = getAsset(assetId);
      if (asset) {
        startLayouts.set(assetId, { ...asset.layout });
      }
    });

    assetStartLayoutsRef.current = startLayouts;
  }, [getAsset]);

  // Handle mouse down on asset
  const handleAssetMouseDown = useCallback((e: React.MouseEvent, asset: Asset) => {
    e.preventDefault();
    
    // Select the asset
    selectAsset(asset.id);
    
    // Start drag operation
    const assetElement = (e.target as HTMLElement).closest('.asset-item') || (e.currentTarget as HTMLElement);
    const rect = assetElement?.getBoundingClientRect();
    
    if (rect && dragContainerRef.current) {
      const pointerPosition = getCanvasPointerPosition(e.clientX, e.clientY);
      captureDragStart([asset.id], pointerPosition);
      
      startDrag([asset.id], pointerPosition);
    }
  }, [captureDragStart, getCanvasPointerPosition, selectAsset, startDrag, dragContainerRef]);

  // Handle touch start on asset
  const handleAssetTouchStart = useCallback((e: React.TouchEvent, asset: Asset) => {
    e.preventDefault();
    const touch = e.touches[0];
    
    // Select the asset
    selectAsset(asset.id);
    
    // Start touch drag
    const assetElement = (e.target as HTMLElement).closest('.asset-item') || (e.currentTarget as HTMLElement);
    const rect = assetElement?.getBoundingClientRect();
    
    if (rect && touch && dragContainerRef.current) {
      const pointerPosition = getCanvasPointerPosition(touch.clientX, touch.clientY);
      captureDragStart([asset.id], pointerPosition);
      
      startDrag([asset.id], pointerPosition);
    }
  }, [captureDragStart, getCanvasPointerPosition, selectAsset, startDrag, dragContainerRef]);

  // Handle mouse move during drag
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState.isDragging || !dragContainerRef.current) {
      return;
    }
    
    const container = dragContainerRef.current;
    const currentPos = getCanvasPointerPosition(e.clientX, e.clientY);
    
    // Update drag state
    updateDrag(currentPos);
    
    // Calculate delta and update asset positions
    const delta = {
      x: currentPos.x - pointerStartRef.current.x,
      y: currentPos.y - pointerStartRef.current.y
    };
    
    // Apply position updates to all dragged assets
    dragState.draggedAssetIds.forEach(assetId => {
      const startLayout = assetStartLayoutsRef.current.get(assetId);
      if (!startLayout) {
        return;
      }
      
      // Calculate new position based on asset's original position + delta
      const newX = startLayout.x + delta.x;
      const newY = startLayout.y + delta.y;
      
      // Apply viewport boundary constraints
      const maxX = Math.max(0, container.scrollWidth - startLayout.width);
      const maxY = Math.max(0, container.scrollHeight - startLayout.height);
      const boundedX = Math.max(0, Math.min(newX, maxX));
      const boundedY = Math.max(0, Math.min(newY, maxY));
      
      // Update asset position in store
      updateAsset(assetId, {
        layout: {
          ...startLayout,
          x: boundedX,
          y: boundedY,
        }
      });
    });
  }, [dragState, dragContainerRef, getCanvasPointerPosition, updateAsset, updateDrag]);

  // Handle touch move during drag
  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!dragState.isDragging || !dragContainerRef.current) return;
    
    e.preventDefault(); // Prevent scrolling during drag
    const touch = e.touches[0];
    if (!touch) return;
    
    const container = dragContainerRef.current;
    const currentPos = getCanvasPointerPosition(touch.clientX, touch.clientY);
    
    // Update drag state
    updateDrag(currentPos);
    
    // Calculate delta and update asset positions
    const delta = {
      x: currentPos.x - pointerStartRef.current.x,
      y: currentPos.y - pointerStartRef.current.y
    };
    
    // Apply position updates to all dragged assets
    dragState.draggedAssetIds.forEach(assetId => {
      const startLayout = assetStartLayoutsRef.current.get(assetId);
      if (!startLayout) return;
      
      // Calculate new position based on asset's original position + delta
      const newX = startLayout.x + delta.x;
      const newY = startLayout.y + delta.y;
      
      // Apply viewport boundary constraints
      const maxX = Math.max(0, container.scrollWidth - startLayout.width);
      const maxY = Math.max(0, container.scrollHeight - startLayout.height);
      const boundedX = Math.max(0, Math.min(newX, maxX));
      const boundedY = Math.max(0, Math.min(newY, maxY));
      
      // Update asset position in store
      updateAsset(assetId, {
        layout: {
          ...startLayout,
          x: boundedX,
          y: boundedY,
        }
      });
    });
  }, [dragState, dragContainerRef, getCanvasPointerPosition, updateAsset, updateDrag]);

  // Handle mouse up/touch end to end drag
  const handleDragEnd = useCallback(() => {
    assetStartLayoutsRef.current.clear();
    endDrag();
  }, [endDrag]);

  // Set up global event listeners for drag
  useEffect(() => {
    if (dragState.isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleDragEnd);
      window.addEventListener("touchmove", handleTouchMove, { passive: false });
      window.addEventListener("touchend", handleDragEnd);
      
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleDragEnd);
        window.removeEventListener("touchmove", handleTouchMove);
        window.removeEventListener("touchend", handleDragEnd);
      };
    }
  }, [dragState.isDragging, handleMouseMove, handleTouchMove, handleDragEnd]);

  return {
    containerRef: dragContainerRef,
    handleAssetMouseDown,
    handleAssetTouchStart,
    isDragging: dragState.isDragging,
    draggedAssetIds: dragState.draggedAssetIds,
  };
}
