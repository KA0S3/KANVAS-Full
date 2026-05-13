import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAssetStore } from '@/stores/assetStore';
import { useBookStore } from '@/stores/bookStoreSimple';
import { useKanvasStore } from '@/stores/kanvasStore';
import { AssetItem } from '../AssetItem';
import { AssetCreationModalFixed } from './AssetCreationModalFixed';
import { BackgroundMapEditorFixed } from './BackgroundMapEditorFixed';
import { StorageCleanup } from '@/utils/storageCleanup';
import type { Asset } from '@/types/Asset';

interface AssetPortProps {
  assetId: string;
  viewportSize: { width: number; height: number };
  className?: string;
}

export function AssetPortFixed({ assetId, viewportSize, className }: AssetPortProps) {
  const { getAsset } = useAssetStore();
  const { getCurrentBook } = useBookStore();
  const { getProjectAssets } = useKanvasStore();
  const currentBook = getCurrentBook();
  const assets = currentBook ? getProjectAssets(currentBook.id) : [];
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBackgroundModal, setShowBackgroundModal] = useState(false);
  const [effectiveViewportSize, setEffectiveViewportSize] = useState(viewportSize);
  const containerRef = useRef<HTMLDivElement>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Debounced viewport size update to prevent excessive re-renders
  const debouncedViewportUpdate = useCallback(
    debounce((size: { width: number; height: number }) => {
      setEffectiveViewportSize(size);
    }, 100),
    []
  );

  // Setup resize observer with debouncing
  useEffect(() => {
    if (!containerRef.current) return;

    resizeObserverRef.current = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const { width, height } = entry.contentRect;
        debouncedViewportUpdate({ width, height });
      }
    });

    resizeObserverRef.current.observe(containerRef.current);

    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
    };
  }, [debouncedViewportUpdate]);

  // Check storage usage periodically
  useEffect(() => {
    // Initial check only - no polling to prevent idle CPU usage
    StorageCleanup.checkAndCleanup();

    // NOTE: Polling removed - storage cleanup will run on component mount
    // const checkInterval = setInterval(() => {
    //   StorageCleanup.checkAndCleanup();
    // }, 30000); // Check every 30 seconds
    // return () => clearInterval(checkInterval);
  }, []);

  const currentAsset = getAsset(assetId);
  const childAssets = useMemo(() => {
    if (!assetId) return [];
    // Get child assets using the kanvasStore
    const allAssets = currentBook ? getProjectAssets(currentBook.id) : [];
    return allAssets.filter(asset => asset.parentId === assetId);
  }, [assetId, currentBook, getProjectAssets]);

  // Memoize position calculation to prevent re-renders
  const createModalPosition = useMemo(() => {
    return {
      x: effectiveViewportSize.width / 2 - 150, // Center horizontally (modal is ~300px wide)
      y: effectiveViewportSize.height / 2 - 100, // Center vertically (modal is ~200px tall)
    };
  }, [effectiveViewportSize]);

  const handleOpenCreateModal = useCallback(() => {
    console.log('🎯 Opening create modal');
    console.log('AssetPort: Opening asset modal at screen center:', createModalPosition.x, createModalPosition.y);
    console.log('AssetPort: Using screen viewport size:', effectiveViewportSize);
    setShowCreateModal(true);
  }, [createModalPosition, effectiveViewportSize]);

  const handleOpenBackgroundModal = useCallback(() => {
    setShowBackgroundModal(true);
  }, []);

  const handleCloseCreateModal = useCallback(() => {
    setShowCreateModal(false);
  }, []);

  const handleCloseBackgroundModal = useCallback(() => {
    setShowBackgroundModal(false);
  }, []);

  // Asset action handlers
  const deleteAsset = useCallback((assetId: string) => {
    console.log('Delete asset:', assetId);
    // Implementation would go here
  }, []);
  
  const selectAsset = useCallback((asset: Asset) => {
    console.log('Select asset:', asset.id);
    // Implementation would go here
  }, []);
  
  const editAsset = useCallback((asset: Asset) => {
    console.log('Edit asset:', asset.id);
    // Implementation would go here
  }, []);
  
  const resizeAsset = useCallback((assetId: string, width: number, height: number) => {
    console.log('Resize asset:', assetId, width, height);
    // Implementation would go here
  }, []);
  
  const handleAssetAction = useCallback((action: string, asset: Asset) => {
    // Handle asset actions without causing render loops
    console.log('Asset action:', action, asset.id);
  }, []);

  return (
    <div 
      ref={containerRef}
      className={`asset-port relative w-full h-full overflow-hidden ${className || ''}`}
      style={{ width: effectiveViewportSize.width, height: effectiveViewportSize.height }}
    >
      {/* Background */}
      {currentAsset?.style.background && (
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: currentAsset.style.background.color || 'transparent',
            backgroundImage: currentAsset.style.background.image 
              ? `url(${currentAsset.style.background.image})` 
              : 'none',
            backgroundPosition: `${currentAsset.style.background.position?.x || 0}px ${currentAsset.style.background.position?.y || 0}px`,
            backgroundSize: `${(currentAsset.style.background.scale || 1) * 100}%`,
            opacity: currentAsset.style.opacity || 1,
          }}
        />
      )}

      {/* Child Assets */}
      {childAssets.map((childAsset) => (
        <AssetItem
          key={childAsset.id}
          asset={childAsset}
          onDelete={deleteAsset}
          onMouseDown={(e, asset) => selectAsset(asset)}
          onDoubleClick={editAsset}
          isSelected={false}
          onResize={resizeAsset}
          onEdit={editAsset}
        />
      ))}

      {/* Controls */}
      <div className="absolute bottom-4 right-4 flex gap-2">
        <button
          onClick={handleOpenBackgroundModal}
          className="px-3 py-2 bg-glass/50 border border-glass-border/40 rounded-md hover:bg-glass/70 transition-colors text-sm"
        >
          Background
        </button>
        <button
          onClick={handleOpenCreateModal}
          className="px-3 py-2 bg-primary/50 border border-primary/40 rounded-md hover:bg-primary/70 transition-colors text-sm"
        >
          Add Asset
        </button>
      </div>

      {/* Modals */}
      {showCreateModal && (
        <AssetCreationModalFixed
          isOpen={showCreateModal}
          onClose={handleCloseCreateModal}
          parentId={assetId}
          projectId={currentBook?.id}
          viewportSize={effectiveViewportSize}
          initialData={createModalPosition}
        />
      )}

      {showBackgroundModal && (
        <BackgroundMapEditorFixed
          isOpen={showBackgroundModal}
          onClose={handleCloseBackgroundModal}
          assetId={assetId}
          viewportSize={effectiveViewportSize}
        />
      )}
    </div>
  );
}

// Simple debounce utility
function debounce<T extends (...args: any[]) => void>(func: T, wait: number): T {
  let timeout: NodeJS.Timeout;
  return ((...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  }) as T;
}
