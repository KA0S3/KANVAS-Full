/**
 * Virtualized Asset Viewport
 * Only renders assets that are visible + small buffer
 * Handles hundreds of assets smoothly
 */

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useAssetStore, type AssetMetadata } from '@/stores/assetStore';

interface VirtualizedAssetViewportProps {
  bookId: string;
  viewportWidth: number;
  viewportHeight: number;
  onAssetClick?: (asset: any) => void;
  onAssetDoubleClick?: (asset: any) => void;
  className?: string;
}

interface VisibleAsset extends AssetMetadata {
  fullAsset?: any;
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
  const enableVirtualizedMode = useAssetStore((state) => state.enableVirtualizedMode);
  const getVisibleAssets = useAssetStore((state) => state.getVisibleAssets);
  const getAssetById = useAssetStore((state) => state.getAssetById);
  
  // Buffer zone around viewport (in pixels) - loads assets slightly outside visible area
  const BUFFER_SIZE = 200;
  
  // Calculate which assets should be visible based on viewport bounds
  const getVisibleAssetIds = useCallback((assets: AssetMetadata[], bounds: typeof viewportBounds) => {
    return assets
      .filter(asset => {
        // Check if asset intersects with viewport + buffer
        const assetRight = asset.x + asset.width;
        const assetBottom = asset.y + asset.height;
        const bufferRight = bounds.x + bounds.width + BUFFER_SIZE;
        const bufferBottom = bounds.y + bounds.height + BUFFER_SIZE;
        const bufferLeft = Math.max(0, bounds.x - BUFFER_SIZE);
        const bufferTop = Math.max(0, bounds.y - BUFFER_SIZE);
        
        return asset.x < bufferRight && 
               assetRight > bufferLeft && 
               asset.y < bufferBottom && 
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
      
      // Get assets from integrated store
      const assets = await getVisibleAssets(bounds);
      
      // Filter to only assets visible in current viewport
      const visibleIds = getVisibleAssetIds(assets, bounds);
      const visible = assets.filter(asset => visibleIds.includes(asset.id));
      
      // Update visible assets in store
      const store = useAssetStore.getState();
      useAssetStore.setState({ visibleAssetIds: new Set(visibleIds) });
      
      // Load full asset data for visible assets
      const fullAssets = await Promise.all(
        visible.map(async (asset) => {
          const fullAsset = await getAssetById(asset.id);
          return { ...asset, fullAsset };
        })
      );
      
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
        <div>Cache: {useAssetStore.getState().getCacheStats().cacheSize}</div>
        <div>Queue: {
          (() => {
            const queueSize = useAssetStore.getState().getCacheStats().queueSize;
            return Object.values(queueSize).reduce((a: number, b: number) => a + b, 0);
          })()
        }</div>
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
  const [stats, setStats] = useState(() => useAssetStore.getState().getCacheStats());
  
  // Update stats periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setStats(useAssetStore.getState().getCacheStats());
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);
  
  // Force sync
  const forceSync = useCallback(async () => {
    // Sync is now handled automatically by documentMutationService
    console.log('[useVirtualizedViewport] Sync is automatic');
  }, []);
  
  // Clear cache
  const clearCache = useCallback(() => {
    useAssetStore.getState().clearCache();
  }, []);
  
  return {
    stats,
    forceSync,
    clearCache
  };
}
