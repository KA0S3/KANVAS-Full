import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  Edit, 
  Trash2, 
  Copy, 
  Move, 
  Lock, 
  Unlock, 
  Eye, 
  Plus,
  FileText,
  Image,
  Film,
  Music,
  Code,
  File,
  Square,
  Circle,
  Palette
} from 'lucide-react';
import { useAssetStore } from '@/stores/assetStore';
import { DeleteAssetDialog } from '@/components/DeleteAssetDialog';
import type { Asset } from '@/types/assetInterfaces';

interface AssetContextMenuProps {
  asset: Asset;
  position: { x: number; y: number };
  onClose: () => void;
  onEdit?: (asset: Asset) => void;
  onSelectAndFocus?: (asset: Asset) => void;
  isViewportAsset?: boolean;
  onCreateAsset?: (options: { name: string; parentId?: string }) => void;
  onCreateChildAsset?: (parentId: string) => void;
}

export const AssetContextMenu: React.FC<AssetContextMenuProps> = ({
  asset,
  position,
  onClose,
  onEdit,
  onSelectAndFocus,
  isViewportAsset = false,
  onCreateAsset,
  onCreateChildAsset,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const {
    updateAsset,
    setActiveAsset,
    getAssetChildren,
  } = useAssetStore();

  // Calculate adjusted position to keep menu on screen
  const getAdjustedPosition = () => {
    const menuWidth = 240; // Approximate menu width
    const menuHeight = 320; // Approximate menu height
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    
    let adjustedX = position.x;
    let adjustedY = position.y;
    
    // Prevent menu from going off right edge
    if (position.x + menuWidth > screenWidth) {
      adjustedX = screenWidth - menuWidth - 10; // 10px padding from edge
    }
    
    // Prevent menu from going off left edge
    if (position.x < 10) {
      adjustedX = 10;
    }
    
    // Prevent menu from going off bottom edge
    if (position.y + menuHeight > screenHeight) {
      adjustedY = screenHeight - menuHeight - 10; // 10px padding from edge
    }
    
    // Prevent menu from going off top edge
    if (position.y < 10) {
      adjustedY = 10;
    }
    
    return { x: adjustedX, y: adjustedY };
  };

  const adjustedPosition = getAdjustedPosition();

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const handleDelete = () => {
    console.log('Delete button clicked for asset:', asset.name);
    // Don't close the context menu - let the dialog appear over it
    setShowDeleteDialog(true);
    console.log('Dialog state set to true, current state:', showDeleteDialog);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit?.(asset);
    onClose();
  };

  const handleDuplicateAsset = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    e.nativeEvent.stopImmediatePropagation();
    
    const newAssetData = {
      ...asset,
      name: `${asset.name} (Copy)`,
      x: asset.x + 20,
      y: asset.y + 20,
    };
    // Remove id, children, parentId, and timestamps from the data
    const { id, children, parentId, createdAt, updatedAt, ...assetDataToCopy } = newAssetData;
    if (onCreateAsset) {
      onCreateAsset(assetDataToCopy);
    }
    onClose();
  };

  const handleToggleLock = () => {
    updateAsset(asset.id, { isLocked: !asset.isLocked });
    onClose();
  };

  const handleToggleBorderShape = () => {
    const newShape = asset.borderShape === 'circle' ? 'square' : 'circle';
    updateAsset(asset.id, { borderShape: newShape });
    onClose();
  };

  const handleToggleTagBorder = () => {
    updateAsset(asset.id, { showTagBorder: !asset.showTagBorder });
    onClose();
  };

  const handleToggleThumbnail = () => {
    const currentSettings = asset.viewportDisplaySettings || { name: true, description: false, thumbnail: true, portraitBlur: 0 };
    updateAsset(asset.id, {
      viewportDisplaySettings: {
        ...currentSettings,
        thumbnail: !currentSettings.thumbnail,
      },
    });
    onClose();
  };

  const handleCreateChild = (e: React.MouseEvent) => {
    console.log('Create Child button clicked for asset:', asset.name);
    e.stopPropagation();
    e.preventDefault();
    e.nativeEvent.stopImmediatePropagation();
    
    // Close context menu and trigger parent to handle modal
    onClose();
    onCreateChildAsset?.(asset.id);
    console.log('Called onCreateChildAsset with parentId:', asset.id);
  };

  const handleSelect = () => {
    if (isViewportAsset) {
      // For viewport assets, just select the asset
      setActiveAsset(asset.id);
    } else {
      // For sidebar assets, do the same as double-clicking (open parent viewport)
      onSelectAndFocus?.(asset);
    }
    onClose();
  };

  const getAssetIcon = (type: Asset['type']) => {
    const iconMap = {
      image: Image,
      document: FileText,
      video: Film,
      audio: Music,
      code: Code,
      other: File,
    };
    return iconMap[type];
  };

  const AssetIcon = getAssetIcon(asset.type);
  const hasChildren = getAssetChildren(asset.id).length > 0;
  
  return (
    <>
      <DeleteAssetDialog
        asset={asset}
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
      />
      
      {createPortal(
        <div
          ref={menuRef}
          className="fixed glass-strong cosmic-glow border border-glass-border/40 rounded-lg shadow-2xl z-[9999] py-2 min-w-[200px]"
          style={{
            left: `${adjustedPosition.x}px`,
            top: `${adjustedPosition.y}px`,
          }}
        >
          {/* Asset Info Header */}
          <div className="px-3 py-2 border-b border-glass-border/20">
            <div className="flex items-center gap-2">
              <AssetIcon className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-foreground truncate">{asset.name}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Type: {asset.type} {hasChildren && `• ${getAssetChildren(asset.id).length} children`}
            </div>
          </div>

          {/* Menu Items */}
          <div className="py-1 max-h-64 overflow-y-auto">
            {/* Edit */}
            <button
              onClick={handleEdit}
              className="w-full px-3 py-2 flex items-center gap-2 text-sm text-foreground hover:bg-glass-border/20 transition-colors"
            >
              <Edit className="w-4 h-4" />
              Edit Asset
            </button>

            {/* Select - Only show for sidebar assets */}
            {!isViewportAsset && (
              <button
                onClick={handleSelect}
                className="w-full px-3 py-2 flex items-center gap-2 text-sm text-foreground hover:bg-glass-border/20 transition-colors"
              >
                <Eye className="w-4 h-4" />
                Select & Focus
              </button>
            )}

            {/* Duplicate */}
            <button
              onClick={handleDuplicateAsset}
              className="w-full px-3 py-2 flex items-center gap-2 text-sm text-foreground hover:bg-glass-border/20 transition-colors"
            >
              <Copy className="w-4 h-4" />
              Duplicate
            </button>

            {/* Create Child */}
            <button
              onClick={handleCreateChild}
              className="w-full px-3 py-2 flex items-center gap-2 text-sm text-foreground hover:bg-glass-border/20 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Child Asset
            </button>

            {/* Toggle Lock */}
            <button
              onClick={handleToggleLock}
              className="w-full px-3 py-2 flex items-center gap-2 text-sm text-foreground hover:bg-glass-border/20 transition-colors"
            >
              {asset.isLocked ? (
                <>
                  <Unlock className="w-4 h-4" />
                  Unlock Asset
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  Lock Asset
                </>
              )}
            </button>

            {/* Toggle Border Shape */}
            <button
              onClick={handleToggleBorderShape}
              className="w-full px-3 py-2 flex items-center gap-2 text-sm text-foreground hover:bg-glass-border/20 transition-colors"
            >
              {asset.borderShape === 'circle' ? (
                <>
                  <Square className="w-4 h-4" />
                  Square Shape
                </>
              ) : (
                <>
                  <Circle className="w-4 h-4" />
                  Circular Shape
                </>
              )}
            </button>

            {/* Toggle Tag Border */}
            <button
              onClick={handleToggleTagBorder}
              className="w-full px-3 py-2 flex items-center gap-2 text-sm text-foreground hover:bg-glass-border/20 transition-colors"
            >
              <Palette className="w-4 h-4" />
              {asset.showTagBorder ? 'Hide Tag Border' : 'Show Tag Border'}
            </button>

            {/* Toggle Background */}
            <button
              onClick={handleToggleThumbnail}
              className="w-full px-3 py-2 flex items-center gap-2 text-sm text-foreground hover:bg-glass-border/20 transition-colors"
            >
              <Image className="w-4 h-4" />
              {asset.viewportDisplaySettings?.thumbnail === false ? 'Background On' : 'Background Off'}
            </button>

            {/* Delete */}
            <button
              onClick={handleDelete}
              className="w-full px-3 py-2 flex items-center gap-2 text-sm text-destructive hover:bg-destructive/20 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete Asset
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
