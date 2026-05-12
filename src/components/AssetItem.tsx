/**
 * ASSET ITEM COMPONENT - Canonical Asset Structure
 * 
 * This component properly uses the canonical Asset interface
 * with nested structure as defined in the plan.
 * 
 * 🔒 CRITICAL: Only uses canonical Asset structure
 */

import React from "react";
import { X, FileText, Image, Film, Music, Code, File, Move, Maximize2, Edit, Trash2 } from "lucide-react";
import { AssetContextMenu } from '@/components/AssetContextMenu';
import { AssetCreationModal } from '@/components/asset/AssetCreationModal';
import type { Asset } from '@/types/Asset';

interface AssetItemProps {
  asset: Asset;
  onDelete: (id: string) => void;
  onMouseDown: (e: React.MouseEvent, asset: Asset) => void;
  onTouchStart?: (e: React.TouchEvent, asset: Asset) => void;
  onDoubleClick?: (asset: Asset) => void;
  isSelected: boolean;
  onResize?: (assetId: string, width: number, height: number) => void;
  onEdit?: (asset: Asset) => void;
  onSelectAndFocus?: (asset: Asset) => void;
  isEditingBackground?: boolean;
}

export const AssetItemFixed: React.FC<AssetItemProps> = ({
  asset,
  onDelete,
  onMouseDown,
  onTouchStart,
  onDoubleClick,
  isSelected,
  onResize,
  onEdit,
  onSelectAndFocus,
  isEditingBackground,
}) => {
  // Extract values from canonical asset structure
  const title = asset.content.title || '';
  const description = asset.content.description || '';
  const imageUrl = asset.content.imageUrl;
  const text = asset.content.text || '';
  const x = asset.layout.x;
  const y = asset.layout.y;
  const width = asset.layout.width;
  const height = asset.layout.height;
  const zIndex = asset.layout.zIndex || 0;
  const opacity = asset.style.opacity || 1;
  const backgroundColor = asset.style.background?.color || '#ffffff';
  const shape = asset.style.shape || 'square';
  const showTagBorder = asset.style.border?.showTagBorder || false;
  const tags = asset.metadata.tags || [];
  const renderMode = asset.behavior.renderMode || 'other';

  // Get asset type from render mode
  const getAssetIcon = () => {
    switch (renderMode) {
      case 'image':
        return <Image className="h-4 w-4" />;
      case 'video':
        return <Film className="h-4 w-4" />;
      case 'audio':
        return <Music className="h-4 w-4" />;
      case 'text':
      case 'document':
        return <FileText className="h-4 w-4" />;
      case 'code':
        return <Code className="h-4 w-4" />;
      default:
        return <File className="h-4 w-4" />;
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    onMouseDown(e, asset);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    onTouchStart?.(e, asset);
  };

  const handleDoubleClick = () => {
    onDoubleClick?.(asset);
  };

  const handleResize = () => {
    onResize?.(asset.id, width, height);
  };

  const handleEdit = () => {
    onEdit?.(asset);
  };

  const handleSelectAndFocus = () => {
    onSelectAndFocus?.(asset);
  };

  const handleDelete = () => {
    onDelete(asset.id);
  };

  // Context menu
  const [contextMenuOpen, setContextMenuOpen] = React.useState(false);
  const [contextMenuPosition, setContextMenuPosition] = React.useState({ x: 0, y: 0 });

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setContextMenuOpen(true);
  };

  const closeContextMenu = () => {
    setContextMenuOpen(false);
  };

  // Render asset content
  const renderAssetContent = () => {
    if (imageUrl) {
      return (
        <div className="w-full h-full flex items-center justify-center overflow-hidden">
          <img 
            src={imageUrl} 
            alt={title}
            className="max-w-full max-h-full object-contain"
            style={{ opacity }}
          />
        </div>
      );
    }

    if (text) {
      return (
        <div className="w-full h-full p-2 overflow-hidden">
          <p className="text-sm break-words">{text}</p>
        </div>
      );
    }

    return (
      <div className="w-full h-full flex items-center justify-center">
        {getAssetIcon()}
      </div>
    );
  };

  return (
    <>
      <div
        className={`asset-item absolute border-2 cursor-move transition-all duration-200 ${
          isSelected ? 'border-blue-500 shadow-lg' : 'border-gray-300 hover:border-gray-400'
        } ${isEditingBackground ? 'pointer-events-none' : ''}`}
        style={{
          left: `${x}px`,
          top: `${y}px`,
          width: `${width}px`,
          height: `${height}px`,
          zIndex,
          opacity,
          backgroundColor,
          borderRadius: shape === 'rounded' ? '8px' : shape === 'circle' ? '50%' : '0',
        }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      >
        {/* Asset content */}
        <div className="w-full h-full relative">
          {renderAssetContent()}
          
          {/* Tags */}
          {tags.length > 0 && (
            <div className="absolute top-2 left-2 flex flex-wrap gap-1">
              {tags.map((tag, index) => (
                <span
                  key={index}
                  className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full"
                  style={{
                    border: showTagBorder ? '1px solid #3b82f6' : 'none',
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          
          {/* Selection indicator */}
          {isSelected && (
            <div className="absolute inset-0 border-2 border-blue-500 pointer-events-none" />
          )}
        </div>

        {/* Resize handle */}
        {onResize && (
          <div
            className="absolute bottom-0 right-0 w-4 h-4 bg-blue-500 cursor-se-resize"
            onMouseDown={(e) => {
              e.stopPropagation();
              handleResize();
            }}
          />
        )}
      </div>

      {/* Context menu */}
      {contextMenuOpen && (
        <AssetContextMenu
          asset={asset}
          position={contextMenuPosition}
          onClose={closeContextMenu}
          onDelete={handleDelete}
          onEdit={handleEdit}
          onSelectAndFocus={handleSelectAndFocus}
        />
      )}
    </>
  );
};

// Export alias for backward compatibility
export const AssetItem = AssetItemFixed;
