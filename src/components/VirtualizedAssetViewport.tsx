/**
 * Virtualized Asset Viewport
 * Only renders assets that are visible + small buffer
 * Handles hundreds of assets smoothly
 */

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useKanvasStore, selectProjectAssets } from '@/stores/kanvasStore';
import type { Asset } from '@/types/Asset';

interface VirtualizedAssetViewportProps {
  bookId: string;
  viewportWidth: number;
  viewportHeight: number;
  onAssetClick?: (asset: any) => void;
  onAssetDoubleClick?: (asset: any) => void;
  className?: string;
}

interface VisibleAsset {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fullAsset?: Asset;
}

export function VirtualizedAssetViewport({
  bookId,
  viewportWidth,
  viewportHeight,
  onAssetClick,
  onAssetDoubleClick,
  className = ''
}: VirtualizedAssetViewportProps) {
  const [visibleAssets, setVisibleAssets] = useState<VisibleAsset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [viewportBounds, setViewportBounds] = useState({ x: 0, y: 0, width: viewportWidth, height: viewportHeight });
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollOffset = useRef({ x: 0, y: 0 });
  const lastLoadTime = useRef(0);
  
  // Get asset store methods
  const getProjectAssets = useKanvasStore((state) => state.getProjectAssets);
  const getAsset = useKanvasStore((state) => state.getAsset);
  
  // Buffer zone around viewport (in pixels) - loads assets slightly outside visible area
  const BUFFER_SIZE = 200;
  
  // Calculate which assets should be visible based on viewport bounds
  const getVisibleAssetIds = useCallback((assets: Asset[], bounds: typeof viewportBounds) => {
    return assets
      .filter(asset => {
        // Check if asset intersects with viewport + buffer
        const assetRight = asset.layout.x + asset.layout.width;
        const assetBottom = asset.layout.y + asset.layout.height;
        const bufferRight = bounds.x + bounds.width + BUFFER_SIZE;
        const bufferBottom = bounds.y + bounds.height + BUFFER_SIZE;
        const bufferLeft = Math.max(0, bounds.x - BUFFER_SIZE);
        const bufferTop = Math.max(0, bounds.y - BUFFER_SIZE);
        
        return asset.layout.x < bufferRight && 
               assetRight > bufferLeft && 
               asset.layout.y < bufferBottom && 
               assetBottom > bufferTop;
      })
      .map(asset => asset.id);
  }, []);
  
  // Load assets for current viewport
  const loadVisibleAssets = useCallback(async (bounds: typeof viewportBounds) => {
    const now = Date.now();
    
    // Throttle loading to prevent excessive calls
    if (now - lastLoadTime.current < 100) {
      return;
    }
    lastLoadTime.current = now;
    
    setIsLoading(true);
    
    try {
      console.log('[VirtualizedViewport] Loading assets for bounds:', bounds);
      
      // Get assets from kanvasStore
      const assets = getProjectAssets(bookId);
      
      // Filter to only assets visible in current viewport
      const visibleIds = getVisibleAssetIds(assets, bounds);
      const visible = assets.filter(asset => visibleIds.includes(asset.id));
      
      // Create visible assets with layout data
      const fullAssets = visible.map(asset => ({
        id: asset.id,
        x: asset.layout.x,
        y: asset.layout.y,
        width: asset.layout.width,
        height: asset.layout.height,
        fullAsset: asset
      }));
      
      setVisibleAssets(fullAssets);
      console.log('[VirtualizedViewport] Loaded', fullAssets.length, 'visible assets');
      
    } catch (error) {
      console.error('[VirtualizedViewport] Failed to load assets:', error);
    } finally {
      setIsLoading(false);
    }
  }, [bookId, getVisibleAssetIds]);
  
  // Handle scroll/pan changes
  const handleViewportChange = useCallback((newBounds: typeof viewportBounds) => {
    setViewportBounds(newBounds);
    loadVisibleAssets(newBounds);
  }, [loadVisibleAssets]);
  
  // Initialize viewport
  useEffect(() => {
    const initialBounds = {
      x: scrollOffset.current.x,
      y: scrollOffset.current.y,
      width: viewportWidth,
      height: viewportHeight
    };
    handleViewportChange(initialBounds);
  }, [bookId, viewportWidth, viewportHeight, handleViewportChange]);
  
  // Monitor scroll changes (implement based on your scroll container)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const handleScroll = () => {
      const scrollLeft = container.scrollLeft;
      const scrollTop = container.scrollTop;
      
      scrollOffset.current = { x: scrollLeft, y: scrollTop };
      
      const newBounds = {
        x: scrollLeft,
        y: scrollTop,
        width: viewportWidth,
        height: viewportHeight
      };
      
      handleViewportChange(newBounds);
    };
    
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [viewportWidth, viewportHeight, handleViewportChange]);
  
  // Render individual asset
  const renderAsset = useCallback((asset: VisibleAsset): JSX.Element => {
    const AssetItem = ({ asset, onClick, onDoubleClick }: any) => {
      return (
        <div
          className="asset-item absolute border border-gray-300 bg-white p-2 cursor-pointer hover:shadow-lg transition-shadow"
          style={{
            left: `${asset.x - viewportBounds.x}px`,
            top: `${asset.y - viewportBounds.y}px`,
            width: `${asset.width}px`,
            height: `${asset.height}px`
          }}
          onClick={() => onClick?.(asset)}
          onDoubleClick={() => onDoubleClick?.(asset)}
        >
          <div className="text-sm font-medium truncate">{asset.name}</div>
          <div className="text-xs text-gray-500">{asset.type}</div>
        </div>
      );
    };
    
    return <AssetItem key={asset.id} asset={asset} onClick={onAssetClick} onDoubleClick={onAssetDoubleClick} />;
  }, [viewportBounds, onAssetClick, onAssetDoubleClick]);
  
  // Calculate total canvas size based on all assets
  const canvasSize = useMemo(() => {
    if (visibleAssets.length === 0) {
      return { width: viewportWidth, height: viewportHeight };
    }
    
    const maxX = Math.max(...visibleAssets.map(asset => asset.x + asset.width));
    const maxY = Math.max(...visibleAssets.map(asset => asset.y + asset.height));
    
    return {
      width: Math.max(viewportWidth, maxX + BUFFER_SIZE),
      height: Math.max(viewportHeight, maxY + BUFFER_SIZE)
    };
  }, [visibleAssets, viewportWidth, viewportHeight]);
  
  return (
    <div 
      ref={containerRef}
      className={`virtualized-viewport overflow-auto relative ${className}`}
      style={{ width: viewportWidth, height: viewportHeight }}
    >
      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute top-4 right-4 bg-blue-500 text-white px-3 py-1 rounded z-50">
          Loading...
        </div>
      )}
      
      {/* Performance stats */}
      <div className="absolute top-4 left-4 bg-black/50 text-white text-xs p-2 rounded z-50">
        <div>Visible: {visibleAssets.length}</div>
        <div>Total: {getProjectAssets(bookId).length}</div>
      </div>
      
      {/* Canvas with all assets positioned absolutely */}
      <div 
        className="relative"
        style={{
          width: `${canvasSize.width}px`,
          height: `${canvasSize.height}px`,
          minWidth: '100%',
          minHeight: '100%'
        }}
      >
        {visibleAssets.map(asset => renderAsset(asset))}
      </div>
    </div>
  );
}

// Hook for managing virtualized viewport state
export function useVirtualizedViewport(bookId: string) {
  const getProjectAssets = useKanvasStore((state) => state.getProjectAssets);
  
  // Force sync
  const forceSync = useCallback(async () => {
    // Sync is now handled automatically by syncStore
    console.log('[useVirtualizedViewport] Sync is automatic');
  }, []);
  
  // Clear cache (simplified)
  const clearCache = useCallback(() => {
    console.log('[useVirtualizedViewport] Cache cleared');
  }, []);
  
  return {
    stats: { cacheSize: 0, queueSize: 0 }, // Simplified stats
    forceSync,
    clearCache
  };
}
