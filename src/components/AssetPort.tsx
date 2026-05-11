 import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, ArrowLeft, Plus, PanelRight, BookOpen, User, AlertTriangle } from "lucide-react";
import { AssetItem } from "./AssetItem";
import type { Asset } from "@/types/assetInterfaces";
import { AssetCreationModalImproved } from "./asset/AssetCreationModalImproved";
import { AssetEditModalImproved } from "./asset/AssetEditModalImproved";
import { EmptySpaceContextMenu } from "./EmptySpaceContextMenu";
import { useAssetTree } from "@/hooks/useAssetTree";
import { useAssetStore } from '@/stores/assetStore';
import { useBookStore } from "@/stores/bookStoreSimple";
import { useBackgroundStore } from "@/stores/backgroundStore";
import { useAuthStore } from "@/stores/authStore";
import { useCloudStore } from "@/stores/cloudStore";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { BackgroundControls } from "@/components/asset/BackgroundControls";
import { BackgroundMigrationDialog } from "@/components/BackgroundMigrationDialog";
import { BackgroundMigration } from "@/utils/backgroundMigration";
import { EnhancedAccountModal } from "@/components/account/EnhancedAccountModal";
import { LocalStorageWarning } from "@/components/LocalStorageWarning";
import { Button } from "@/components/ui/button";
import { useSampleData } from "@/hooks/useSampleData";
import { AutosaveIndicator } from "@/components/autosave/AutosaveIndicator";
import { 
  globalToLocalCoords, 
  localToGlobalCoords, 
  screenToViewportCoords,
  getDefaultViewportConfig,
  calculateCenterTransform,
  calculateViewportCenterPosition,
  type ViewportConfig 
} from "@/utils/coordinateUtils";
import { getBackgroundColor, shouldShowParchmentOverlay, shouldShowGlassEffect } from "@/utils/backgroundUtils";
import { getAssetKeyWithBook } from "@/stores/backgroundStore";
import type { BackgroundConfig } from "@/types/background";

const initialAssets: Omit<Asset, 'id' | 'children'>[] = [];

interface AssetPortProps {
  onToggleSidebar?: () => void;
  currentWorldTitle?: string;
  onOpenWorldLibrary?: () => void;
}

export function AssetPort({ onToggleSidebar, currentWorldTitle, onOpenWorldLibrary }: AssetPortProps) {
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isTouchDragging, setIsTouchDragging] = useState(false);
  const [touchStartDistance, setTouchStartDistance] = useState(0);
  const [lastTouchDistance, setLastTouchDistance] = useState(0);
  const [enteredAssetId, setEnteredAssetId] = useState<string | null>(null);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 800, height: 600 });
  const [backgroundRefreshKey, setBackgroundRefreshKey] = useState(0);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showBackgroundControls, setShowBackgroundControls] = useState(false);
  const [showMigrationDialog, setShowMigrationDialog] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalInitialData, setModalInitialData] = useState<any>(null);
  const [generatorImportData, setGeneratorImportData] = useState<any>(null);

  // Handle generator import messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'GENERATOR_IMPORT') {
        console.log('AssetPort: Received generator import data:', event.data.data);
        setGeneratorImportData(event.data.data);
        setIsModalOpen(true);
      }
    };

    window.addEventListener('message', handleMessage);
    
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);
  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasInitialized = useRef(false);
  
  // Background editing state - use refs to prevent resets
  const [isDraggingBackground, setIsDraggingBackground] = useState(false);
  const backgroundDragStartRef = useRef({ x: 0, y: 0 });
  const backgroundStartPositionRef = useRef({ x: 0, y: 0 });
  const backgroundConfigRef = useRef<BackgroundConfig | null>(null);

  // Initialize sample data
  useSampleData();

  // Migration check disabled - backgrounds now automatically save to IndexedDB
  // Old data is migrated transparently when loaded
  useEffect(() => {
    // Migration is now handled automatically by backgroundStorage.ts
    // No manual migration dialog needed
    setShowMigrationDialog(false);
  }, []);

  // Listen for background save events
  useEffect(() => {
    const handleBackgroundSave = () => {
      setBackgroundRefreshKey(prev => prev + 1);
    };

    window.addEventListener('backgroundSaved', handleBackgroundSave);
    return () => {
      window.removeEventListener('backgroundSaved', handleBackgroundSave);
    };
  }, []);

  const {
    assets,
    activeAsset,
    deleteAsset,
    updateAssetPosition,
    updateAssetSize,
    setActiveAsset,
    getRootAssets,
    searchAssets,
    getAssetPath,
  } = useAssetTree();
  
  const { currentActiveId, setCurrentViewportId, currentViewportId, isEditingBackground, setIsEditingBackground, updateAsset, updateAssetPositionFast } = useAssetStore();
  const { getCurrentBook, getWorldData, updateWorldData, currentBookId } = useBookStore();
  const { getBackground, setBackground, migrateLegacyConfig, configs: backgroundConfigs } = useBackgroundStore();
  const { isAuthenticated, user, plan, effectiveLimits } = useAuthStore();
  const { quota } = useCloudStore();
  const navigate = useNavigate();
  
  // Calculate effective viewport size based on current context
  const getEffectiveViewportSize = useCallback(() => {
    if (enteredAssetId && assets && assets[enteredAssetId]) {
      // When inside a nested asset, use the parent asset's dimensions as the viewport
      const parentAsset = assets[enteredAssetId];
      return {
        width: parentAsset.width || 800,
        height: parentAsset.height || 600
      };
    }
    // When at root level, use the actual container dimensions
    return viewportSize;
  }, [enteredAssetId, assets, viewportSize]);

  const effectiveViewportSize = getEffectiveViewportSize();
  
  // Log effective viewport size changes for debugging
  // useEffect(() => {
  //   console.log('🎯 AssetPort: Effective viewport size changed:', effectiveViewportSize);
  //   console.log('🎯 AssetPort: Currently in asset:', enteredAssetId || 'root');
  // }, [effectiveViewportSize, enteredAssetId]);
  
  // Get book-specific viewport settings, falling back to defaults if no book is selected
  const currentBook = getCurrentBook();
  const bookWorldData = currentBook ? getWorldData(currentBook.id) : null;
  const bookViewportOffset = bookWorldData?.viewportOffset || { x: -45, y: -20 };
  const bookViewportScale = bookWorldData?.viewportScale || 1;
  
  const handleCloseContextMenu = useCallback(() => {
    setContextMenuPosition(null);
  }, []);

  const handleOpenSettings = useCallback(() => {
    setShowSettings(true);
  }, []);

  const handleOpenBackgroundSettings = useCallback(() => {
    setShowBackgroundControls(true);
  }, []);

  const handleResize = useCallback((assetId: string, width: number, height: number) => {
    updateAssetSize(assetId, width, height);
  }, [updateAssetSize]);

  // Update viewport size when component mounts or window resizes
  useEffect(() => {
    const updateViewportSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setViewportSize({ width: rect.width, height: rect.height });
      }
    };

    updateViewportSize();
    window.addEventListener('resize', updateViewportSize);
    return () => window.removeEventListener('resize', updateViewportSize);
  }, []);

  // Initialize with empty state - no test assets
  useEffect(() => {
    if (!hasInitialized.current) {
      hasInitialized.current = true;
    }
  }, []);

  // Sync enteredAssetId from store's currentViewportId on mount/restore
  // This ensures that when the page is refreshed, we restore the correct viewport
  useEffect(() => {
    // Only sync if we have a valid currentViewportId in the store and assets are loaded
    if (currentViewportId && assets && assets[currentViewportId]) {
      console.log(`[AssetPort] Restoring viewport from store: ${currentViewportId}`);
      setEnteredAssetId(currentViewportId);
    }
  }, [currentViewportId, assets]);

  const openCreateAssetModal = useCallback(() => {
    console.log('🎯 Opening create modal');
    
    // Always center assets in the middle of the visible screen
    const centerPosition = calculateViewportCenterPosition(
      viewportSize.width,
      viewportSize.height,
      200, // default asset width
      150  // default asset height
    );
    
    console.log('AssetPort: Opening asset modal at screen center:', centerPosition.x, centerPosition.y);
    console.log('AssetPort: Using screen viewport size:', viewportSize);
    
    // ONLY open the modal - do NOT create any assets
    setModalInitialData({
      name: 'New Asset',
      type: 'other',
      x: centerPosition.x,
      y: centerPosition.y,
      width: 200,
      height: 150,
    });
    setIsModalOpen(true);
  }, [viewportSize]);

  const handleCreateAssetClick = (e: React.MouseEvent) => {
    console.log('🔵 AssetPort handleCreateAssetClick called');
    e.stopPropagation();
    e.preventDefault();
    e.nativeEvent.stopImmediatePropagation(); // Prevent other listeners
    console.log('🔵 AssetPort: All event propagation stopped, calling openCreateAssetModal');
    openCreateAssetModal();
  };

  const handleAccountClick = () => {
    // Check if user is authenticated and is an owner
    if (isAuthenticated && user && plan) {
      const ownerEmail = import.meta.env.VITE_OWNER_EMAIL;
      const isOwner = user.email === ownerEmail && plan === 'owner';
      
      // Always open account modal for all users including owners
      setShowAccountModal(true);
    } else {
      // Open account modal for non-authenticated users
      setShowAccountModal(true);
    }
  };

  const handleDeleteAsset = useCallback((id: string) => {
    deleteAsset(id);
  }, [deleteAsset]);

  const handleEditAsset = useCallback((asset: Asset) => {
    setEditingAssetId(asset.id);
    setIsEditModalOpen(true);
  }, []);

  const handleAssetDoubleClick = useCallback((asset: Asset) => {
    // Enter the asset by setting it as the active asset
    if (!asset?.id) {
      return;
    }
    setActiveAsset(asset.id);
    setEnteredAssetId(asset.id);
    setCurrentViewportId(asset.id);
  }, [setActiveAsset, setCurrentViewportId, setEnteredAssetId]);

  // Listen for navigation events from sidebar
  useEffect(() => {
    const handleNavigateToAsset = (event: CustomEvent) => {
      const { assetId } = event.detail;
      const asset = assets[assetId];
      
      if (asset) {
        // Navigate to parent viewport without moving the viewport
        if (asset.parentId) {
          // Exit current asset and go to parent
          setEnteredAssetId(asset.parentId);
          setCurrentViewportId(asset.parentId);
          setActiveAsset(asset.parentId);
        } else {
          // Asset is at root level, exit to root
          setEnteredAssetId(null);
          setCurrentViewportId(null);
          setActiveAsset(null);
        }
        
        // Set the target asset as active for highlighting
        setActiveAsset(assetId);
      }
    };

    window.addEventListener('navigateToAsset', handleNavigateToAsset as EventListener);
    return () => {
      window.removeEventListener('navigateToAsset', handleNavigateToAsset as EventListener);
    };
  }, [assets, setActiveAsset]);

  const handleExitAsset = useCallback(() => {
    if (enteredAssetId && assets[enteredAssetId]?.parentId) {
      // Go up one level to parent
      const parentId = assets[enteredAssetId].parentId;
      setEnteredAssetId(parentId);
      setCurrentViewportId(parentId);
      setActiveAsset(parentId);
    } else {
      // At root level, exit to root
      setEnteredAssetId(null);
      setActiveAsset(null);
      setCurrentViewportId(null);
    }
  }, [enteredAssetId, assets, setActiveAsset, setCurrentViewportId]);

  const handleMouseDown = useCallback((e: React.MouseEvent, asset: Asset) => {
    e.preventDefault();
    
    // Exit background editing if active
    if (isEditingBackground) {
      setIsEditingBackground(false);
    }
    
    setSelectedAsset(asset.id);
    setActiveAsset(asset.id);
    setIsDragging(true);
    
    const rect = (e.target as HTMLElement).closest('.asset-item')?.getBoundingClientRect();
    if (rect) {
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  }, [setActiveAsset, isEditingBackground, setIsEditingBackground, setSelectedAsset, setIsDragging, setDragOffset]);

  const handleTouchStart = useCallback((e: React.TouchEvent, asset: Asset) => {
    e.preventDefault();
    const touch = e.touches[0];
    setSelectedAsset(asset.id);
    setActiveAsset(asset.id);
    setIsTouchDragging(true);
    
    const rect = (e.target as HTMLElement).closest('.asset-item')?.getBoundingClientRect();
    if (rect && touch) {
      setDragOffset({
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      });
    }
  }, [setActiveAsset]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isTouchDragging || !selectedAsset || !containerRef.current) return;
    
    const touch = e.touches[0];
    if (!touch) return;
    
    const containerRect = containerRef.current.getBoundingClientRect();
    const screenX = touch.clientX - containerRect.left - dragOffset.x;
    const screenY = touch.clientY - containerRef.current.getBoundingClientRect().top - dragOffset.y;
    
    // Keep within bounds of container
    const boundedX = Math.max(0, Math.min(screenX, containerRect.width - 200));
    const boundedY = Math.max(0, Math.min(screenY, containerRect.height - 50));
    
    // Update asset position using fast method (no mutation queueing during drag)
    updateAssetPositionFast(selectedAsset, boundedX, boundedY);
  }, [isTouchDragging, selectedAsset, dragOffset, updateAssetPositionFast]);

  const handleTouchEnd = useCallback(() => {
    setIsTouchDragging(false);
    // Save final position via mutation service when drag ends
    if (selectedAsset && assets[selectedAsset]) {
      const asset = assets[selectedAsset];
      updateAssetPosition(selectedAsset, asset.x, asset.y);
    }
   }, [selectedAsset, assets, updateAssetPosition]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !selectedAsset || !containerRef.current) return;
    
    const containerRect = containerRef.current.getBoundingClientRect();
    const screenX = e.clientX - containerRect.left - dragOffset.x;
    const screenY = e.clientY - containerRef.current.getBoundingClientRect().top - dragOffset.y;
    
    // Keep within bounds of container
    const boundedX = Math.max(0, Math.min(screenX, containerRect.width - 200));
    const boundedY = Math.max(0, Math.min(screenY, containerRect.height - 50));
    
    // Update asset position using fast method (no mutation queueing during drag)
    updateAssetPositionFast(selectedAsset, boundedX, boundedY);
  }, [isDragging, selectedAsset, dragOffset, updateAssetPositionFast]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    // Save final position via mutation service when drag ends
    if (selectedAsset && assets[selectedAsset]) {
      const asset = assets[selectedAsset];
      updateAssetPosition(selectedAsset, asset.x, asset.y);
    }
   }, [selectedAsset, assets, updateAssetPosition]);

  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    
    // Check if click is on empty space (not on an asset or its children)
    const isAssetClick = target.classList.contains('asset-item') || target.closest('.asset-item');
    
    if (!isAssetClick) {
      // Only deselect if an asset is selected, don't exit the current asset viewport
      if (selectedAsset) {
        setSelectedAsset(null);
        setActiveAsset(null);
      }
    }
  }, [selectedAsset, setActiveAsset]);

  const handleContainerDoubleClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    
    // Check if double-click is on empty space (not on an asset or its children)
    const isAssetClick = target.classList.contains('asset-item') || target.closest('.asset-item');
    
    if (!isAssetClick) {
      // Open asset creation modal
      openCreateAssetModal();
    }
  }, [openCreateAssetModal]);

  const handleContainerContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    
    console.log('Context menu triggered on:', e.target);
    
    // Check if the click is on empty space
    const target = e.target as HTMLElement;
    const isContainer = target === containerRef.current;
    const isViewportContainer = target.classList.contains('viewport-container');
    const isBackgroundElement = target.classList.contains('absolute') && 
      !target.classList.contains('asset-item') &&
      !target.closest('.asset-item');
    
    // Also check if it's on the background div itself
    const isBackgroundDiv = target.classList.contains('glass-strong') || 
                           target.classList.contains('cosmic-glow');
    
    console.log('Context menu checks:', {
      isContainer,
      isViewportContainer,
      isBackgroundElement,
      isBackgroundDiv,
      targetClasses: target.className,
      targetTag: target.tagName
    });
    
    if (isContainer || isViewportContainer || isBackgroundElement || isBackgroundDiv) {
      console.log('Context menu should show at:', { x: e.clientX, y: e.clientY });
      setContextMenuPosition({ x: e.clientX, y: e.clientY });
    } else {
      console.log('Context menu blocked - not on empty space');
    }
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    if (isTouchDragging) {
      window.addEventListener("touchmove", handleTouchMove, { passive: false });
      window.addEventListener("touchend", handleTouchEnd);
      return () => {
        window.removeEventListener("touchmove", handleTouchMove);
        window.removeEventListener("touchend", handleTouchEnd);
      };
    }
  }, [isTouchDragging, handleTouchMove, handleTouchEnd]);

  // Get assets to display based on current context
  const displayAssets = useMemo(() => {
    console.log('🎯 AssetPort: Calculating displayAssets', {
      enteredAssetId,
      hasAssets: !!assets,
      assetsKeys: assets ? Object.keys(assets) : 'no assets',
      getRootAssetsCount: getRootAssets().length
    });

    if (enteredAssetId && assets && assets[enteredAssetId]) {
      const children = assets[enteredAssetId].children.map(childId => assets[childId]).filter(Boolean) || [];
      console.log('🎯 AssetPort: Showing child assets for parent', enteredAssetId, ':', children.map(c => ({ id: c.id, name: c.name })));
      return children;
    } else {
      const rootAssets = getRootAssets();
      console.log('🎯 AssetPort: Showing root assets:', rootAssets.map(c => ({ id: c.id, name: c.name })));
      return rootAssets;
    }
  }, [enteredAssetId, assets, getRootAssets]);

  // Build breadcrumb path with asset IDs
  const getBreadcrumbPath = () => {
    const path: { name: string; assetId: string | null }[] = [{ name: currentBook?.title || 'Root', assetId: null }];
    
    if (enteredAssetId && assets && assets[enteredAssetId]) {
      const buildPath = (assetId: string): { name: string; assetId: string | null }[] => {
        const asset = assets[assetId];
        if (!asset) return [];
        
        if (asset.parentId) {
          const parentPath = buildPath(asset.parentId);
          return [...parentPath, { name: asset.name, assetId: asset.id }];
        }
        return [{ name: asset.name, assetId: asset.id }];
      };
      
      const fullPath = buildPath(enteredAssetId);
      return [...path, ...fullPath];
    }
    return path;
  };

  const breadcrumbPath = getBreadcrumbPath();

  // Get current background config from new store - subscribe to configs for reactivity
  const assetKey = getAssetKeyWithBook(enteredAssetId || 'root', currentBook?.id);
  const backgroundConfig = backgroundConfigs[assetKey] || getBackground(assetKey);
  
  // State for tracking image natural size
  const [imageNaturalSize, setImageNaturalSize] = useState<{ width: number; height: number } | null>(null);
  
  // Handle image loading for natural size detection
  useEffect(() => {
    if (!backgroundConfig?.imageUrl) {
      setImageNaturalSize(null);
      return;
    }

    const img = new Image();
    img.onload = () => {
      const newSize = { width: img.naturalWidth, height: img.naturalHeight };
      setImageNaturalSize(newSize);
      
      // Only update config with image size if it's not already set
      // Don't overwrite if already saved - this preserves user's scale settings on refresh
      if (!backgroundConfig.imageSize) {
        const assetKey = getAssetKeyWithBook(enteredAssetId || 'root', currentBook?.id);
        const updatedConfig = { ...backgroundConfig, imageSize: newSize };
        setBackground(assetKey, updatedConfig);
      }
    };
    img.src = backgroundConfig.imageUrl;
  }, [backgroundConfig?.imageUrl, backgroundConfig?.imageSize, enteredAssetId, currentBook?.id]);

  // Background editing handlers
  const handleBackgroundMouseDown = useCallback((e: React.MouseEvent) => {
    if (!isEditingBackground || !backgroundConfig?.imageUrl) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    setIsDraggingBackground(true);
    
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;
    
    const startX = e.clientX - containerRect.left - (backgroundConfig.position?.x || 0);
    const startY = e.clientY - containerRect.top - (backgroundConfig.position?.y || 0);
    
    backgroundDragStartRef.current = { x: startX, y: startY };
    backgroundStartPositionRef.current = { x: backgroundConfig.position?.x || 0, y: backgroundConfig.position?.y || 0 };
  }, [isEditingBackground, backgroundConfig]);

  const handleBackgroundMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingBackground || !containerRef.current) return;
    
    const containerRect = containerRef.current.getBoundingClientRect();
    const newX = e.clientX - containerRect.left - backgroundDragStartRef.current.x;
    const newY = e.clientY - containerRect.top - backgroundDragStartRef.current.y;
    
    // Update background position in real-time
    updateBackgroundPosition(newX, newY);
  }, [isDraggingBackground]);

  const handleBackgroundMouseUp = useCallback(() => {
    setIsDraggingBackground(false);
  }, []);

  const updateBackgroundPosition = useCallback((x: number, y: number) => {
    const assetKey = getAssetKeyWithBook(enteredAssetId || 'root', currentBook?.id);
    const updatedConfig = { ...backgroundConfig, position: { x, y } };
    setBackground(assetKey, updatedConfig);
  }, [enteredAssetId, currentBook, backgroundConfig]);

  const updateBackgroundScale = useCallback((scale: number) => {
    const assetKey = getAssetKeyWithBook(enteredAssetId || 'root', currentBook?.id);
    const updatedConfig = { ...backgroundConfig, scale };
    setBackground(assetKey, updatedConfig);
  }, [enteredAssetId, currentBook, backgroundConfig]);

  const handleBackgroundWheel = useCallback((e: WheelEvent) => {
    if (!isEditingBackground || !backgroundConfig?.imageUrl) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const scaleDelta = e.deltaY > 0 ? -0.05 : 0.05;
    const newScale = Math.max(0.1, Math.min(3, (backgroundConfig.scale || 1) + scaleDelta));
    
    // Dispatch event to sync with sliders in editor components
    window.dispatchEvent(new CustomEvent('backgroundPreviewUpdate', {
      detail: {
        scale: newScale,
        assetId: enteredAssetId || 'root'
      }
    }));
    
    // Also update directly for immediate visual feedback
    updateBackgroundScale(newScale);
  }, [backgroundConfig, enteredAssetId, isEditingBackground, updateBackgroundScale]);

  // Listen for background preview update events
  useEffect(() => {
    const handleBackgroundPreviewUpdate = (event: CustomEvent) => {
      // Update live scale for real-time preview
      const { scale } = event.detail;
      if (scale !== undefined) {
        // Actually update the scale like the mouse wheel does
        updateBackgroundScale(scale);
      }
    };

    window.addEventListener('backgroundPreviewUpdate', handleBackgroundPreviewUpdate as EventListener);
    return () => {
      window.removeEventListener('backgroundPreviewUpdate', handleBackgroundPreviewUpdate as EventListener);
    };
  }, [updateBackgroundScale]);

  // Background event listeners
  useEffect(() => {
    if (isDraggingBackground) {
      window.addEventListener("mousemove", handleBackgroundMouseMove);
      window.addEventListener("mouseup", handleBackgroundMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleBackgroundMouseMove);
        window.removeEventListener("mouseup", handleBackgroundMouseUp);
      };
    }
  }, [isDraggingBackground, handleBackgroundMouseMove, handleBackgroundMouseUp]);

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener("wheel", handleBackgroundWheel, { passive: false });
      return () => {
        container.removeEventListener("wheel", handleBackgroundWheel);
      };
    }
  }, [handleBackgroundWheel]);

  const getRenderedBackgroundImageSize = () => {
    const scale = typeof backgroundConfig.scale === 'number' ? backgroundConfig.scale : 1;
    const size = backgroundConfig.imageSize || imageNaturalSize;
    if (!size || typeof size.width !== 'number' || typeof size.height !== 'number') return null;
    return {
      width: Math.round(size.width * scale),
      height: Math.round(size.height * scale),
    };
  };

   return (
    <div className="glass-strong cosmic-glow rounded-2xl w-full h-full flex flex-col mx-auto my-auto min-h-0">
       {/* Header */}
      <div className="flex items-center justify-between p-1 md:p-2 border-b border-glass-border/20 flex-wrap gap-2">
        <div className="flex items-center gap-1 md:gap-2 flex-wrap">
          {currentWorldTitle && onOpenWorldLibrary && (
            <Button
              id="world-library-button"
              className="gap-1 md:gap-2 self-center glass cosmic-glow border-glass-border/40 text-xs md:text-sm"
              variant="outline"
              size="sm"
              onClick={onOpenWorldLibrary}
            >
              <ArrowLeft className="w-3 h-3 md:w-4 md:h-4" />
              <div className="flex flex-col leading-tight">
                <span className="text-xs">Back to</span>
                <span className="text-xs font-medium">Library</span>
              </div>
            </Button>
          )}
          {/* Library Management Button for Asset Viewport */}
          {!currentWorldTitle && (
            <Button
              id="library-button-asset"
              variant="outline"
              size="sm"
              onClick={onOpenWorldLibrary}
              className="gap-1 md:gap-2 self-center glass cosmic-glow border-glass-border/40 text-xs md:text-sm"
            >
              <BookOpen className="w-3 h-3 md:w-4 md:h-4" />
              <span className="hidden sm:inline">Library</span>
            </Button>
          )}
          {enteredAssetId && (
            <button
              onClick={handleExitAsset}
              className="p-1.5 hover:bg-muted rounded transition-colors self-center"
              title="Exit asset"
            >
              <ArrowLeft className="w-3 h-3 md:w-4 md:h-4 text-muted-foreground" />
            </button>
          )}
          {/* Interactive Breadcrumb Path */}
          <nav className="flex items-center text-xs text-muted-foreground bg-glass/50 px-1 md:px-2 py-1 rounded border border-glass-border/30 max-w-[200px] md:max-w-none overflow-hidden">
            {breadcrumbPath.map((segment, index) => {
              const isLast = index === breadcrumbPath.length - 1;
              const isRoot = index === 0;
              
              return (
                <div key={index} className="flex items-center">
                  {index > 0 && (
                    <span className="mx-0.5 md:mx-1 text-muted-foreground/60">/</span>
                  )}
                  <button
                    onClick={() => {
                      if (isRoot) {
                        handleExitAsset();
                      } else if (segment.assetId) {
                        handleAssetDoubleClick(assets[segment.assetId]);
                      }
                    }}
                    className={`hover:text-foreground transition-colors truncate max-w-[60px] md:max-w-none ${
                      isLast 
                        ? 'text-foreground font-medium cursor-default' 
                        : 'hover:underline cursor-pointer'
                    }`}
                    disabled={isLast}
                  >
                    {segment.name}
                  </button>
                </div>
              );
            })}
          </nav>
          {!isEditingBackground && (
            <Button
              id="add-asset-button"
              variant="cosmic"
              size="sm"
              className="gap-1 md:gap-2 self-center text-xs md:text-sm"
              onClick={handleCreateAssetClick}
              disabled={isModalOpen}
            >
              <Plus className="w-3 h-3 md:w-4 md:h-4" />
              <span className="hidden sm:inline">{isModalOpen ? 'Creating...' : 'Add Asset'}</span>
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* LocalStorage Warning - only show when not authenticated */}
          {!isAuthenticated && (
            <LocalStorageWarning onOpenAccountModal={() => setShowAccountModal(true)} />
          )}
          
          {/* Account Button */}
          <Button
            id="account-sync-button"
            variant={effectiveLimits && quota && quota.used >= effectiveLimits.quotaBytes ? "destructive" : "outline"}
            size="sm"
            onClick={() => setShowAccountModal(true)}
            className="gap-1 md:gap-2 self-center text-xs md:text-sm relative"
            title={isAuthenticated ? "Account" : "Sign In"}
          >
            {effectiveLimits && quota && quota.used >= effectiveLimits.quotaBytes && (
              <AlertTriangle className="w-3 h-3 md:w-4 md:h-4 absolute -top-1 -right-1 animate-pulse" />
            )}
            <User className="w-3 h-3 md:w-4 md:h-4" />
            <span className="hidden sm:inline">{isAuthenticated ? 'Account' : 'Sign In'}</span>
          </Button>

          {onToggleSidebar && (
            <button
              id="sidebar-toggle-button"
              onClick={onToggleSidebar}
              className="p-1.5 md:p-2 hover:bg-muted rounded transition-colors"
              title="Toggle Shelf"
            >
              <PanelRight className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Canvas Area */}
      <div
        id="asset-canvas-area"
        ref={containerRef}
        onClick={handleContainerClick}
        onDoubleClick={handleContainerDoubleClick}
        onContextMenu={handleContainerContextMenu}
        onMouseDown={handleBackgroundMouseDown}
        className={`flex-1 relative overflow-hidden ${
          isEditingBackground && backgroundConfig?.imageUrl ? 'cursor-move' : 'cursor-crosshair'
        }`}
      >
        {/* Autosave Indicator - Bottom Left */}
        <div className="absolute bottom-4 left-4 z-10">
          <AutosaveIndicator compact={true} />
        </div>
        <div
          className={`absolute inset-0 ${shouldShowGlassEffect(backgroundConfig) ? 'glass cosmic-glow' : ''}`}
          style={{
            backgroundColor: getBackgroundColor(backgroundConfig),
          }}
        >
          {/* Parchment Texture Overlay */}
          {shouldShowParchmentOverlay(backgroundConfig) && (
            <div 
              className="absolute inset-0 pointer-events-none"
              style={{
                opacity: backgroundConfig.imageUrl ? 0.15 : 0.25,
                backgroundImage: `
                  radial-gradient(
                    ellipse at 20% 30%,
                    rgba(139, 69, 19, 0.08) 0%,
                    transparent 40%
                  ),
                  radial-gradient(
                    ellipse at 80% 70%,
                    rgba(160, 82, 45, 0.06) 0%,
                    transparent 35%
                  ),
                  radial-gradient(
                    ellipse at 50% 50%,
                    rgba(205, 133, 63, 0.04) 0%,
                    transparent 60%
                  )
                `,
                backgroundSize: '400px 400px, 350px 350px, 500px 500px',
                backgroundPosition: '0 0, 100px 100px, -50px -50px',
                mixBlendMode: 'multiply',
                filter: 'blur(0.5px)',
              }}
            />
          )}
        </div>

        {backgroundConfig.imageUrl && (
          <>
            <img
              src={backgroundConfig.imageUrl}
              alt=""
              draggable={false}
              className={`absolute max-w-none select-none ${
                isEditingBackground ? 'pointer-events-auto' : 'pointer-events-none'
              }`}
              style={{
                left: `${backgroundConfig.position?.x ?? 0}px`,
                top: `${backgroundConfig.position?.y ?? 0}px`,
                width: (() => {
                  const rendered = getRenderedBackgroundImageSize();
                  return rendered ? `${rendered.width}px` : 'auto';
                })(),
                height: (() => {
                  const rendered = getRenderedBackgroundImageSize();
                  return rendered ? `${rendered.height}px` : 'auto';
                })(),
                mask: backgroundConfig.imageUrl ? 
                  `radial-gradient(circle at center, 
                    black ${(backgroundConfig.innerRadius || 0.3) * 100}%, 
                    transparent ${(backgroundConfig.outerRadius || 0.8) * 100}%)` : 
                  undefined,
                WebkitMask: backgroundConfig.imageUrl ? 
                  `radial-gradient(circle at center, 
                    black ${(backgroundConfig.innerRadius || 0.3) * 100}%, 
                    transparent ${(backgroundConfig.outerRadius || 0.8) * 100}%)` : 
                  undefined,
              }}
            />
            
            {/* Visual guide - dashed border around background image */}
            {isEditingBackground && (() => {
              const rendered = getRenderedBackgroundImageSize();
              if (!rendered) return null;
              
              return (
                <div
                  className="absolute border-2 border-dashed border-primary/50 pointer-events-none"
                  style={{
                    left: `${backgroundConfig.position?.x ?? 0}px`,
                    top: `${backgroundConfig.position?.y ?? 0}px`,
                    width: `${rendered.width}px`,
                    height: `${rendered.height}px`,
                  }}
                />
              );
            })()}
          </>
        )}

        {/* Background editing overlay */}
        {isEditingBackground && backgroundConfig.imageUrl && (
          <div className="absolute bottom-4 right-4 bg-black/70 text-white text-xs px-3 py-2 rounded pointer-events-none z-30">
            <div>Position: ({Math.round(backgroundConfig.position?.x || 0)}, {Math.round(backgroundConfig.position?.y || 0)})</div>
            <div>Scale: {backgroundConfig.scale?.toFixed(2) || '1.00'}</div>
            <div>Inner Radius: {Math.round((backgroundConfig.innerRadius || 0.3) * 100)}%</div>
            <div>Outer Radius: {Math.round((backgroundConfig.outerRadius || 0.8) * 100)}%</div>
            <div className="text-xs text-gray-300 mt-1">Drag to move • Scroll to scale • Use slider to resize</div>
          </div>
        )}

        {/* Simple container without transforms */}
        <div className="viewport-container" style={{ width: '100%', height: '100%', position: 'relative' }}>
         {(() => {
    console.log('🎯 AssetPort: About to render assets', {
      displayAssetsCount: displayAssets.length,
      displayAssets: displayAssets.map(a => ({ id: a.id, name: a.name, type: a.type })),
      enteredAssetId,
      currentBook: currentBook?.id,
      rawDisplayAssets: displayAssets,
      assetsFromStore: assets,
      getRootAssetsResult: getRootAssets()
    });
    
    if (displayAssets.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center text-muted-foreground" style={{ height: '100%' }}>
           <Sparkles className="w-8 h-8 mb-2 opacity-50" />
           <p className="text-sm">
             {enteredAssetId ? 'No child assets' : 'No assets yet'}
           </p>
           <p className="text-xs opacity-70">
             {enteredAssetId 
               ? 'Double-click parent assets to add children' 
               : 'Add your first asset to get started'}
           </p>
         </div>
      );
    }
    
    return displayAssets.map((asset) => {
      // CRITICAL FIX: Validate asset before rendering to prevent React error #130
      if (!asset || !asset.id) {
        console.error('[AssetPort] Invalid asset in displayAssets:', asset);
        return null;
      }
      
      // When inside a parent asset, position relative to parent's bounds
      let displayAsset = { ...asset };
      
      if (enteredAssetId && assets && assets[enteredAssetId]) {
        const parentAsset = assets[enteredAssetId];
        // For nested assets, just use the stored coordinates as-is since we're not using transforms
        displayAsset = asset;
      }
      
      return (
        <AssetItem
          key={asset.id}
          asset={displayAsset}
          onDelete={handleDeleteAsset}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          onDoubleClick={handleAssetDoubleClick}
          isSelected={selectedAsset === asset.id}
          onResize={handleResize}
          onEdit={handleEditAsset}
          onSelectAndFocus={handleAssetDoubleClick}
          isEditingBackground={isEditingBackground}
        />
      );
    }).filter(Boolean); // Filter out null assets
  })()}
        </div>
      </div>


      {/* Empty Space Context Menu */}
      {contextMenuPosition && (
        <EmptySpaceContextMenu
          position={contextMenuPosition}
          onClose={handleCloseContextMenu}
          enteredAssetId={enteredAssetId}
          onOpenSettings={handleOpenSettings}
          onOpenBackgroundSettings={handleOpenBackgroundSettings}
          onOpenAssetModal={(initialData) => {
            setModalInitialData(initialData);
            setIsModalOpen(true);
          }}
          viewportSize={viewportSize}
        />
      )}

      {/* Settings Panel */}
      <SettingsPanel
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />

      {/* Background Controls */}
      {showBackgroundControls && (
        <BackgroundControls
          assetId={enteredAssetId}
          onSave={() => setShowBackgroundControls(false)}
        />
      )}

      {/* Asset Creation Modal */}
      <AssetCreationModalImproved
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setGeneratorImportData(null);
        }}
        initialData={modalInitialData}
        parentId={enteredAssetId || undefined}
        generatorImportData={generatorImportData}
        projectId={currentBookId || undefined}
        viewportSize={viewportSize}
      />

      {/* Asset Edit Modal */}
      <AssetEditModalImproved
        isOpen={isEditModalOpen}
        onClose={() => {
          setIsEditModalOpen(false);
          setEditingAssetId(null);
        }}
        assetId={editingAssetId}
        viewportSize={viewportSize}
      />

      {/* Account Modal */}
      <EnhancedAccountModal
        isOpen={showAccountModal}
        onClose={() => setShowAccountModal(false)}
      />

      {/* Background Migration Dialog */}
      <BackgroundMigrationDialog
        isOpen={showMigrationDialog}
        onClose={() => setShowMigrationDialog(false)}
      />

      </div>
  );
}
