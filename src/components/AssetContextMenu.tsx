/**
 * ASSET CONTEXT MENU COMPONENT - Canonical Asset Structure
 * 
 * This component properly uses the canonical Asset interface
 * with nested structure as defined in the plan.
 * 
 * 🔒 CRITICAL: Only uses canonical Asset structure
 */

import React, { useRef, useState } from "react";
import { createPortal } from 'react-dom';
import {
  X,
  FileText,
  Image,
  Film,
  Music,
  Code,
  File,
  Square,
  Circle,
  Palette,
  Lock,
  Unlock,
  Trash2,
  Edit,
  Plus,
  Maximize2
} from 'lucide-react';
import { useKanvasStore, selectAssetsByParentId } from '@/stores/kanvasStore';
import { DeleteAssetDialog } from '@/components/DeleteAssetDialog';
import type { Asset } from '@/types/Asset';

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

export const AssetContextMenuFixed: React.FC<AssetContextMenuProps> = ({
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
    createAsset,
  } = useKanvasStore();

  // Calculate adjusted position to keep menu on screen
  const getAdjustedPosition = () => {
    const menuWidth = 240; // Approximate menu width
    const menuHeight = 320; // Approximate menu height
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    
    let adjustedX = position.x;
    let adjustedY = position.y;
    
    // Adjust horizontal position
    if (adjustedX + menuWidth > screenWidth) {
      adjustedX = screenWidth - menuWidth - 10;
    }
    
    // Adjust vertical position
    if (adjustedY + menuHeight > screenHeight) {
      adjustedY = screenHeight - menuHeight - 10;
    }
    
    return { x: adjustedX, y: adjustedY };
  };

  const handleDelete = () => {
    console.log('Delete button clicked for asset:', asset.content.title);
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
      // Update nested structure properly
      content: {
        ...asset.content,
        title: `${asset.content.title} (Copy)`,
      },
      layout: {
        ...asset.layout,
        x: asset.layout.x + 20,
        y: asset.layout.y + 20,
      },
    };
    
    const { id, metadata, ...assetDataToCopy } = newAssetData;
    createAsset(assetDataToCopy);
    onClose();
  };

  const handleToggleLock = () => {
    // Lock state should be in UI store, not asset data
    updateAsset(asset.id, {
      // This would be handled by UI state, not asset metadata
    });
    onClose();
  };

  const handleToggleBorderShape = () => {
    const newShape = asset.style.shape === 'circle' ? 'square' : 'circle';
    updateAsset(asset.id, {
      style: {
        ...asset.style,
        shape: newShape,
      },
    });
    onClose();
  };

  const handleToggleTagBorder = () => {
    updateAsset(asset.id, {
      style: {
        ...asset.style,
        border: {
          ...asset.style.border,
          showTagBorder: !asset.style.border?.showTagBorder,
        },
      },
    });
    onClose();
  };

  const handleToggleThumbnail = () => {
    const currentSettings = asset.content.customFields?.viewportDisplaySettings || { 
      name: true, 
      description: false, 
      thumbnail: true, 
      portraitBlur: 0 
    };
    
    updateAsset(asset.id, {
      content: {
        ...asset.content,
        customFields: {
          ...asset.content.customFields,
          viewportDisplaySettings: {
            ...currentSettings,
            thumbnail: !currentSettings.thumbnail,
          },
        },
      },
    });
    onClose();
  };

  const handleCreateChild = (e: React.MouseEvent) => {
    console.log('Create Child button clicked for asset:', asset.content.title);
    e.stopPropagation();
    e.preventDefault();
    e.nativeEvent.stopImmediatePropagation();
    
    // Close context menu and trigger parent to handle modal
    onClose();
    onCreateChildAsset?.(asset.id);
    console.log('Called onCreateChildAsset with parentId:', asset.id);
  };

  // Get asset type icon
  const getAssetIcon = () => {
    switch (asset.behavior.renderMode) {
      case 'image':
        return <Image className="w-4 h-4" />;
      case 'video':
        return <Film className="w-4 h-4" />;
      case 'audio':
        return <Music className="w-4 h-4" />;
      case 'text':
      case 'document':
        return <FileText className="w-4 h-4" />;
      case 'code':
        return <Code className="w-4 h-4" />;
      default:
        return <File className="w-4 h-4" />;
    }
  };

  // Check if asset has children (should be computed)
  const children = selectAssetsByParentId(asset.id)(useKanvasStore.getState());
  const hasChildren = children.length > 0;

  // Calculate adjusted position
  const adjustedPosition = getAdjustedPosition();

  // Setup event listeners
  React.useEffect(() => {
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
              {getAssetIcon()}
              <span className="text-sm font-medium text-foreground truncate">{asset.content.title}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Type: {asset.behavior.renderMode} {hasChildren && `• ${children.length} children`}
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

            {/* Duplicate */}
            <button
              onClick={handleDuplicateAsset}
              className="w-full px-3 py-2 flex items-center gap-2 text-sm text-foreground hover:bg-glass-border/20 transition-colors"
            >
              <File className="w-4 h-4" />
              Duplicate Asset
            </button>

            {/* Create Child */}
            <button
              onClick={handleCreateChild}
              className="w-full px-3 py-2 flex items-center gap-2 text-sm text-foreground hover:bg-glass-border/20 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Child Asset
            </button>

            {/* Toggle Border Shape */}
            <button
              onClick={handleToggleBorderShape}
              className="w-full px-3 py-2 flex items-center gap-2 text-sm text-foreground hover:bg-glass-border/20 transition-colors"
            >
              {asset.style.shape === 'circle' ? (
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
              {asset.style.border?.showTagBorder ? 'Hide Tag Border' : 'Show Tag Border'}
            </button>

            {/* Toggle Background */}
            <button
              onClick={handleToggleThumbnail}
              className="w-full px-3 py-2 flex items-center gap-2 text-sm text-foreground hover:bg-glass-border/20 transition-colors"
            >
              <Image className="w-4 h-4" />
              {asset.content.customFields?.viewportDisplaySettings?.thumbnail === false ? 'Background On' : 'Background Off'}
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


// Export alias for backward compatibility
export const AssetContextMenu = AssetContextMenuFixed;
