 import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, ArrowLeft, Plus, PanelRight, BookOpen, User, AlertTriangle } from "lucide-react";
import { AssetItem } from "./AssetItem";
import type { Asset } from '@/types/Asset';
import { AssetCreationModalImproved } from "./asset/AssetCreationModalImproved";
import { AssetEditModalImproved } from "./asset/AssetEditModalImproved";
import { EmptySpaceContextMenu } from "./EmptySpaceContextMenu";
import { useKanvasStore } from '@/stores/kanvasStore';
import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from "@/stores/authStore";
import { useSyncStore } from "@/stores/syncStore";
import { useCloudStore } from "@/stores/cloudStore";
import { useBookStore } from "@/stores/bookStoreSimple";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { BackgroundControls } from "@/components/asset/BackgroundControls";
import { BackgroundMigrationDialog } from "@/components/BackgroundMigrationDialog";
import { EnhancedAccountModal } from "@/components/account/EnhancedAccountModal";
import { LocalStorageWarning } from "@/components/LocalStorageWarning";
import { Button } from "@/components/ui/button";
import { useSampleData } from "@/hooks/useSampleData";
import { AutosaveIndicator } from "@/components/autosave/AutosaveIndicator";
import { useAssetDrag } from "@/hooks/useAssetDrag";
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
import type { BackgroundConfig } from "@/types/background";
import { DEFAULT_BACKGROUND_CONFIG } from "@/types/background";
import { db } from "@/storage/indexeddb";

const initialAssets: Omit<Asset, 'id' | 'children'>[] = [];

interface AssetPortProps {
  onToggleSidebar?: () => void;
  currentWorldTitle?: string;
  onOpenWorldLibrary?: () => void;
}

export function AssetPort({ onToggleSidebar, currentWorldTitle, onOpenWorldLibrary }: AssetPortProps) {
  // UI state from UI store - proper state separation
  const { 
    selectedAssets, 
    selectAsset, 
    hoveredAsset, 
    setHoveredAsset,
    dragState,
    startDrag,
    updateDrag,
    endDrag,
    viewport
  } = useUIStore();
  
  // Local component state (ephemeral)
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
  const [backgroundConfig, setBackgroundConfig] = useState<BackgroundConfig | null>(() => {
    // Initialize with default config to prevent null reference errors
    return {
      mode: "glass",
      color: null,
      imageUrl: null,
      position: { x: 0, y: 0 },
      scale: 1,
      edgeOpacity: 1,
      innerRadius: 0.3,
      outerRadius: 0.8,
      gridSize: 40,
    };
  });
  const [isEditingBackground, setIsEditingBackground] = useState(false);
  const [isDraggingBackground, setIsDraggingBackground] = useState(false);

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
  
  // Use drag hook with container ref
  const { isDragging, handleAssetMouseDown, handleAssetTouchStart } = useAssetDrag(containerRef);
  
  // Background editing state - use refs to prevent resets
  const backgroundDragStartRef = useRef({ x: 0, y: 0 });
  const backgroundStartPositionRef = useRef({ x: 0, y: 0 });
  const backgroundConfigRef = useRef<BackgroundConfig | null>({
    mode: "glass",
    color: null,
    imageUrl: null,
    position: { x: 0, y: 0 },
    scale: 1,
    edgeOpacity: 1,
    innerRadius: 0.3,
    outerRadius: 0.8,
    gridSize: 40,
  });

  const {
    getProjectAssets, 
    updateAsset, 
    currentProjectId,
    deleteAsset,
    getAsset,
  } = useKanvasStore();
  
  const assets = currentProjectId ? getProjectAssets(currentProjectId) : [];
  const { isAuthenticated, user, plan, effectiveLimits } = useAuthStore();
  const { quotaUsed, quotaLimit } = useCloudStore();
  const {
    getCurrentBook,
    getWorldData,
    updateWorldData,
    currentBookId
  } = useBookStore();
  const navigate = useNavigate();
  
  // Load background config for current asset/book
  useEffect(() => {
    const loadBackgroundConfig = async () => {
      try {
        let config: BackgroundConfig = JSON.parse(JSON.stringify(DEFAULT_BACKGROUND_CONFIG));

        if (enteredAssetId) {
          const asset = useKanvasStore.getState().getAsset(enteredAssetId);
          config = asset?.style.background
            ? { ...config, ...asset.style.background }
            : config;
        } else {
          const projectId = useKanvasStore.getState().currentProjectId || currentBookId;
          const project = projectId ? await db.getProject(projectId) : null;
          config = project?.settings?.backgrounds?.root
            ? { ...config, ...project.settings.backgrounds.root }
            : config;
        }

        setBackgroundConfig(config);
        backgroundConfigRef.current = config;
      } catch (error) {
        console.error('Failed to load background config:', error);
      }
    };
    
    loadBackgroundConfig();
  }, [enteredAssetId, backgroundRefreshKey, currentBookId]);

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
  
  // Calculate effective viewport size based on current context
  const getEffectiveViewportSize = useCallback(() => {
    if (enteredAssetId) {
      // When inside a nested asset, use the parent asset's dimensions as the viewport
      const parentAsset = assets.find(a => a.id === enteredAssetId);
      if (parentAsset) {
        return {
          width: parentAsset.layout.width,
          height: parentAsset.layout.height
        };
      }
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
    setIsEditingBackground(true);
  }, []);

  const handleCloseBackgroundSettings = useCallback(() => {
    setShowBackgroundControls(false);
    setIsEditingBackground(false);
    setIsDraggingBackground(false);
  }, []);

  const handleBackgroundConfigChange = useCallback((config: BackgroundConfig) => {
    setBackgroundConfig(config);
    backgroundConfigRef.current = config;

    if (enteredAssetId) {
      const asset = getAsset(enteredAssetId);
      if (asset) {
        updateAsset(enteredAssetId, {
          style: {
            ...asset.style,
            background: config,
          },
        });
      }
      return;
    }

    const projectId = currentProjectId || currentBookId;
    if (projectId) {
      db.getProject(projectId).then(project => {
        if (!project) return;
        return db.updateProject({
          ...project,
          settings: {
            ...project.settings,
            backgrounds: {
              ...(project.settings?.backgrounds || {}),
              root: config,
            },
          },
          updatedAt: new Date().toISOString(),
          version: (project.version || 0) + 1,
        });
      }).catch(error => {
        console.error('Failed to save root background:', error);
      });
    }
  }, [enteredAssetId, getAsset, updateAsset, currentProjectId, currentBookId]);

  useEffect(() => {
    const handleOpenBackgroundPanel = () => {
      handleOpenBackgroundSettings();
    };

    window.addEventListener('openViewportBackgroundSettings', handleOpenBackgroundPanel);
    return () => {
      window.removeEventListener('openViewportBackgroundSettings', handleOpenBackgroundPanel);
    };
  }, [handleOpenBackgroundSettings]);

  const handleResize = useCallback((assetId: string, width: number, height: number) => {
    const asset = assets.find(a => a.id === assetId);
    if (asset) {
      updateAsset(assetId, { 
        layout: { 
          ...asset.layout,
          width, 
          height 
        } 
      });
    }
  }, [updateAsset, assets]);

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

  // Note: currentViewportId doesn't exist in V2 architecture
  // This viewport restoration needs to be migrated to use new store patterns
  useEffect(() => {
    // Viewport restoration disabled for V2 migration
    // TODO: Implement proper viewport restoration using V2 store patterns
  }, []);

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
    setEnteredAssetId(asset.id);
  }, []);

  // Listen for navigation events from sidebar
  useEffect(() => {
    const handleNavigateToAsset = (event: CustomEvent) => {
      const { assetId } = event.detail;
      const asset = assets.find(a => a.id === assetId);
      
      if (asset) {
        // Navigate to parent viewport without moving the viewport
        if (asset.parentId) {
          // Exit current asset and go to parent
          setEnteredAssetId(asset.parentId);
        } else {
          // Asset is at root level, exit to root
          setEnteredAssetId(null);
        }
      }
    };

    window.addEventListener('navigateToAsset', handleNavigateToAsset as EventListener);
    return () => {
      window.removeEventListener('navigateToAsset', handleNavigateToAsset as EventListener);
    };
  }, [assets]);

  const handleExitAsset = useCallback(() => {
    if (enteredAssetId) {
      const currentAsset = assets.find(a => a.id === enteredAssetId);
      if (currentAsset?.parentId) {
        // Go up one level to parent
        setEnteredAssetId(currentAsset.parentId);
      } else {
        // At root level, exit to root
        setEnteredAssetId(null);
      }
    }
  }, [enteredAssetId, assets]);

  
  // Old drag handlers removed - now using useAssetDrag hook

  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    
    // Check if click is on empty space (not on an asset or its children)
    const isAssetClick = target.classList.contains('asset-item') || target.closest('.asset-item');
    
    if (!isAssetClick) {
      // Clear selection if clicking on empty space
      useUIStore.getState().clearSelection();
    }
  }, []);

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

  // Drag event listeners are now handled by useAssetDrag hook

  // Get assets to display based on current context
  const displayAssets = useMemo(() => {
    if (enteredAssetId) {
      // Show children of the entered asset
      return assets.filter(asset => asset.parentId === enteredAssetId);
    } else {
      // Show root-level assets (no parentId)
      return assets.filter(asset => !asset.parentId);
    }
  }, [enteredAssetId, assets]);

  // Build breadcrumb path with asset IDs
  const getBreadcrumbPath = useCallback(() => {
    const currentBook = getCurrentBook();
    const path: { name: string; assetId: string | null }[] = [{ name: currentBook?.title || 'Root', assetId: null }];
    
    if (enteredAssetId) {
      const buildPath = (assetId: string): { name: string; assetId: string | null }[] => {
        const asset = assets.find(a => a.id === assetId);
        if (!asset) return [];
        
        if (asset.parentId) {
          const parentPath = buildPath(asset.parentId);
          return [...parentPath, { name: asset.content.title || 'Untitled', assetId: asset.id }];
        }
        return [{ name: asset.content.title || 'Untitled', assetId: asset.id }];
      };
      
      const fullPath = buildPath(enteredAssetId);
      return [...path, ...fullPath];
    }
    return path;
  }, [enteredAssetId, assets, getCurrentBook]);

  const breadcrumbPath = getBreadcrumbPath();
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
      if (!backgroundConfig.imageSize) {
        const updatedConfig = { ...backgroundConfig, imageSize: newSize };
        handleBackgroundConfigChange(updatedConfig);
      }
    };
    img.src = backgroundConfig.imageUrl;
  }, [backgroundConfig?.imageUrl, backgroundConfig?.imageSize, enteredAssetId, handleBackgroundConfigChange]);

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
    if (!backgroundConfig) return;
    
    const updatedConfig = { ...backgroundConfig, position: { x, y } };
    handleBackgroundConfigChange(updatedConfig);
  }, [backgroundConfig, handleBackgroundConfigChange]);

  const updateBackgroundScale = useCallback((scale: number) => {
    if (!backgroundConfig) return;
    
    const updatedConfig = { ...backgroundConfig, scale };
    handleBackgroundConfigChange(updatedConfig);
  }, [backgroundConfig, handleBackgroundConfigChange]);

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
                        const asset = assets.find(a => a.id === segment.assetId);
                        if (asset) {
                          handleAssetDoubleClick(asset);
                        }
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
            variant={effectiveLimits && quotaUsed >= effectiveLimits.maxStorage ? "destructive" : "outline"}
            size="sm"
            onClick={() => setShowAccountModal(true)}
            className="gap-1 md:gap-2 self-center text-xs md:text-sm relative"
            title={isAuthenticated ? "Account" : "Sign In"}
          >
            {effectiveLimits && quotaUsed >= effectiveLimits.maxStorage && (
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
              
              if (enteredAssetId) {
                const parentAsset = assets.find(a => a.id === enteredAssetId);
                // For nested assets, just use stored coordinates as-is since we're not using transforms
                displayAsset = asset;
              }
              
              return (
                <AssetItem
                  key={asset.id}
                  asset={displayAsset}
                  onDelete={handleDeleteAsset}
                  onMouseDown={handleAssetMouseDown}
                  onTouchStart={handleAssetTouchStart}
                  onDoubleClick={handleAssetDoubleClick}
          isSelected={selectedAssets.has(asset.id)}
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
          onSave={handleCloseBackgroundSettings}
          onClose={handleCloseBackgroundSettings}
          onChange={handleBackgroundConfigChange}
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
        projectId={currentBookId || currentProjectId || undefined}
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
