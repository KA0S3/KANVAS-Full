/**
 * ASSET ITEM COMPONENT - Canonical Asset Structure with Full UX
 * 
 * This component properly uses the canonical Asset interface
 * with nested structure as defined in the plan, while restoring
 * all the rich interactions from the legacy version.
 * 
 * 🔒 CRITICAL: Only uses canonical Asset structure
 */

import React from "react";
import { X, FileText, Image, Film, Music, Code, File, Move, Maximize2, Edit, Trash2 } from "lucide-react";
import { AssetContextMenu } from '@/components/AssetContextMenu';
import { AssetCreationModal } from '@/components/asset/AssetCreationModal';
import { useTagStore } from '@/stores/tagStore';
import { useAssetDrag } from '@/hooks/useAssetDrag';
import type { Asset } from '@/types/Asset';

interface AssetItemProps {
  asset: Asset;
  onDelete: (id: string) => void;
  onMouseDown?: (e: React.MouseEvent, asset: Asset) => void;
  onTouchStart?: (e: React.TouchEvent, asset: Asset) => void;
  onDoubleClick?: (asset: Asset) => void;
  isSelected: boolean;
  onResize?: (assetId: string, width: number, height: number) => void;
  onEdit?: (asset: Asset) => void;
  onSelectAndFocus?: (asset: Asset) => void;
  isEditingBackground?: boolean;
  onCreateAsset?: (options: { name: string; parentId?: string }) => void;
}

// Icon and color mapping for asset types
const iconMap = {
  image: Image,
  document: FileText,
  video: Film,
  audio: Music,
  code: Code,
  other: File,
};

const colorMap = {
  image: "text-primary",
  document: "text-accent",
  video: "text-secondary",
  audio: "text-glow-primary",
  code: "text-primary",
  other: "text-muted-foreground",
};

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
  isEditingBackground = false,
  onCreateAsset,
}) => {
  // Drag handlers are now passed from parent (AssetPort)
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
  
  // Get tag store for tag colors
  const { getAllTags } = useTagStore();
  const allTags = getAllTags();
  
  // Extract asset tags from metadata tags array
  const assetTags = (tags || []).map(tagName => {
    const tag = Object.values(allTags).find(t => t.name === tagName);
    return tag || { id: tagName, name: tagName, color: '#888888' };
  });
  const hasTags = assetTags && assetTags.length > 0;
  const firstTagColor = hasTags ? assetTags[0]?.color : null;
  
  // Get viewport display settings from custom fields
  const displaySettings = asset.content.customFields?.viewportDisplaySettings || {
    name: true,
    description: false,
    thumbnail: true,
    portraitBlur: 0,
  };
  
  // Get portrait image from various sources
  const portraitImage = imageUrl || asset.content.customFields?.thumbnail || 
    asset.content.customFields?.customFieldValues?.find(v => {
      const field = asset.content.customFields?.customFields?.find(f => f.id === v.fieldId);
      return field?.label?.toLowerCase() === 'portrait' && field.type === 'image' && v.value;
    })?.value;
  
  // Get displayed custom fields
  const displayedCustomFields = (asset.content.customFields?.customFields || [])
    .filter(field => field.displayInViewport && field.label?.toLowerCase() !== 'portrait')
    .map(field => {
      const value = asset.content.customFields?.customFieldValues?.find(v => v.fieldId === field.id);
      return {
        label: field.label,
        value: value?.value || '',
        type: field.type,
      };
    });
  
  // State management
  const [isResizing, setIsResizing] = React.useState(false);
  const [resizeStart, setResizeStart] = React.useState({ x: 0, y: 0, width: 0, height: 0 });
  const [showExternalText, setShowExternalText] = React.useState(false);
  const [showChildAssetModal, setShowChildAssetModal] = React.useState(false);
  const [childAssetParentId, setChildAssetParentId] = React.useState<string | null>(null);
  const [contextMenu, setContextMenu] = React.useState({
    visible: false,
    x: 0,
    y: 0,
  });
  
  // Helper functions
  const getColorWithOpacity = (color: string, opacity: number): string => {
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    } else if (color.startsWith('hsl')) {
      return color.replace('hsl(', 'hsla(').replace(')', `, ${opacity})`);
    } else if (color.startsWith('rgba')) {
      return color.replace(/[\d.]+\)$/, `${opacity})`);
    } else if (color.startsWith('hsla')) {
      return color.replace(/[\d.]+\)$/, `${opacity})`);
    }
    return color;
  };
  
  const calculateZIndex = React.useCallback(() => {
    const area = width * height;
    const maxArea = 500 * 400;
    const minArea = 50 * 50;
    const normalizedArea = Math.max(minArea, Math.min(maxArea, area));
    const zIndexRange = 900;
    const zIndex = 1000 - Math.floor(((normalizedArea - minArea) / (maxArea - minArea)) * zIndexRange);
    return zIndex;
  }, [width, height]);
  
  const dynamicZIndex = calculateZIndex();
  
  // Check if asset is too small for integrated name tab
  const isAssetTooSmall = React.useMemo(() => {
    return width < 150 || height < 120;
  }, [width, height]);

  // Get asset icon from render mode
  const getAssetIcon = () => {
    const Icon = iconMap[renderMode as keyof typeof iconMap] || File;
    return <Icon className="h-4 w-4" />;
  };
  
  const Icon = iconMap[renderMode as keyof typeof iconMap] || File;
  const colorClass = colorMap[renderMode as keyof typeof colorMap] || 'text-muted-foreground';

  // Event handlers
  const handleContextMenu = React.useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
    });
  }, []);
  
  const closeContextMenu = React.useCallback(() => {
    setContextMenu({ visible: false, x: 0, y: 0 });
  }, []);
  
  const handleCreateChildAsset = React.useCallback((parentId: string) => {
    setChildAssetParentId(parentId);
    setShowChildAssetModal(true);
  }, []);
  
  const handleResizeStart = (e: React.MouseEvent) => {
    if (isEditingBackground) return;
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(true);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width,
      height,
    });
  };
  
  const handleMouseMove = React.useCallback((e: MouseEvent) => {
    if (!isResizing || !onResize) return;
    const deltaX = e.clientX - resizeStart.x;
    const deltaY = e.clientY - resizeStart.y;
    const newWidth = Math.max(25, resizeStart.width + deltaX);
    const newHeight = Math.max(25, resizeStart.height + deltaY);
    onResize(asset.id, newWidth, newHeight);
  }, [isResizing, resizeStart, asset.id, onResize]);
  
  const handleMouseUp = React.useCallback(() => {
    setIsResizing(false);
  }, []);
  
  React.useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);
  
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isEditingBackground) {
      e.preventDefault();
      // Call the parent handler for drag functionality
      onMouseDown?.(e, asset);
    }
  };
  
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isEditingBackground) {
      e.preventDefault();
      // Call the parent handler for drag functionality
      onTouchStart?.(e, asset);
    }
  };
  
  const handleDoubleClick = () => {
    if (!isEditingBackground) {
      onDoubleClick?.(asset);
    }
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

  // Render asset content based on shape and display settings
  const renderAssetContent = () => {
    if (shape === 'circle') {
      return renderCircularAsset();
    } else {
      return renderSquareAsset();
    }
  };
  
  const renderCircularAsset = () => (
    <>
      {/* Floating name pill - always shown for circular assets */}
      {displaySettings.name && (
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className="px-2 py-0.5 bg-black/90 backdrop-blur-sm border border-glass-border/40 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5),0_0_16px_rgba(0,0,0,0.3)] pointer-events-auto">
            <div className="flex items-center gap-1">
              <Move className="w-1.5 h-1.5 text-foreground/80 opacity-70" />
              <Icon className={`w-2 h-2 ${colorClass}`} />
              <span className="text-[9px] font-medium text-foreground truncate max-w-[100px]">{title}</span>
              <button
                onClick={(e) => { e.stopPropagation(); handleEdit(); }}
                className="p-0.5 hover:bg-blue-500/20 rounded"
                title="Edit asset"
              >
                <Edit className="w-2 h-2 text-blue-400" />
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Main circular container */}
      <div className={`h-full overflow-hidden relative rounded-full ${
        displaySettings.thumbnail ? 'glass' : 'bg-transparent'
      } border-2 border-gray-800 shadow-[0_0_20px_rgba(0,0,0,0.8),0_0_40px_rgba(0,0,0,0.6),0_0_60px_rgba(0,0,0,0.4),inset_0_0_10px_rgba(0,0,0,0.3)]`}>
        {/* Thumbnail - only when enabled */}
        {portraitImage && displaySettings.thumbnail && (
          <>
            <img
              src={portraitImage}
              alt={`${title} portrait`}
              className="w-full h-full object-cover pointer-events-none"
              style={{ filter: `blur(${displaySettings.portraitBlur * 8}px)` }}
            />
            {/* Gradient overlay for better text visibility */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent pointer-events-none" />
          </>
        )}
        {/* Custom fields overlay at bottom half */}
        {(displayedCustomFields.length > 0 || (displaySettings.description && description)) && (
          <div className="absolute bottom-0 left-0 right-0 top-1/2 z-10 pointer-events-auto">
            <div className="h-full overflow-y-auto p-4 relative">
              <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/40 via-transparent to-black/40 z-10" />
              {displaySettings.description && description && (
                <div className="text-xs text-white/90 line-clamp-2 drop-shadow-md mb-2">{description}</div>
              )}
              {displayedCustomFields.length > 0 && displayedCustomFields.map((field, index) => (
                <div key={index} className="text-xs relative mb-2">
                  <div className="font-medium text-white/90 drop-shadow-md">{field.label}:</div>
                  {field.type === 'image' && field.value ? (
                    <img src={field.value} alt={field.label} className="w-12 h-12 object-cover rounded border border-white/20 mx-auto mt-1" />
                  ) : (
                    <div className="text-white/80 drop-shadow-md text-center">{field.value}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {/* Edit button outside the circle */}
      <button
        onClick={(e) => { e.stopPropagation(); handleEdit(); }}
        className={`absolute top-0 right-0 -translate-y-2 transition-opacity p-1.5 hover:bg-blue-500/20 rounded flex-shrink-0 bg-blue-500/10 border border-glass-border/40 z-20 ${
          isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
        title="Edit asset"
      >
        <Edit className="w-4 h-4 text-blue-400" />
      </button>
      
      {/* Tags */}
      {assetTags.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 flex flex-wrap gap-1 justify-center z-10">
          {assetTags.slice(0, 6).map((tag, index) => (
            <div key={tag.id} className="w-2 h-2 rounded-full border border-foreground/30" style={{ backgroundColor: tag.color }} title={tag.name} />
          ))}
          {assetTags.length > 6 && (
            <div className="text-xs text-foreground/80">+{assetTags.length - 6}</div>
          )}
        </div>
      )}
      
      {/* Toggle detailed view button */}
      <button
        onClick={(e) => { e.stopPropagation(); setShowExternalText(!showExternalText); }}
        className="absolute top-0 left-0 -translate-y-2 opacity-70 hover:opacity-100 transition-opacity p-1.5 hover:bg-green-500/20 rounded flex-shrink-0 bg-green-500/10 border border-glass-border/30 z-20"
        title={showExternalText ? "Hide detailed view" : "Show detailed view"}
      >
        <FileText className="w-3 h-3 text-green-400" />
      </button>
      
      {/* External detailed text panel */}
      {showExternalText && (
        <div className="absolute top-full left-0 right-0 mt-2 p-3 glass rounded-lg relative z-30 min-w-[200px]">
          <button
            onClick={(e) => { e.stopPropagation(); setShowExternalText(false); }}
            className="absolute top-1 right-1 opacity-70 hover:opacity-100 transition-opacity p-1 hover:bg-red-500/20 rounded flex-shrink-0"
            title="Hide text"
          >
            <Trash2 className="w-3 h-3 text-red-400" />
          </button>
          <div className="space-y-2">
            {displaySettings.name && (
              <div className="flex items-center gap-2">
                <Move className="w-4 h-4 text-foreground opacity-70" />
                <span className="text-sm font-medium text-foreground">{title}</span>
              </div>
            )}
            {displaySettings.description && description && (
              <div className="text-xs text-foreground/90">{description}</div>
            )}
            {displayedCustomFields.length > 0 && (
              <div className="space-y-2">
                {displayedCustomFields.map((field, index) => (
                  <div key={index} className="text-xs">
                    <div className="font-medium text-foreground/90">{field.label}:</div>
                    {field.type === 'image' && field.value ? (
                      <img src={field.value} alt={field.label} className="w-full h-16 object-cover rounded border border-glass-border/30 mt-1" />
                    ) : (
                      <div className="text-foreground/80">{field.value}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {assetTags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {assetTags.map((tag, index) => (
                  <div key={tag.id} className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-glass-border/30" style={{ backgroundColor: getColorWithOpacity(tag.color, 0.12) }} title={tag.name}>
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }} />
                    <span className="text-xs text-foreground/80">{tag.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
  
  const renderSquareAsset = () => (
    <>
      {/* Floating name pill - shown when asset is too small */}
      {displaySettings.name && isAssetTooSmall && (
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className="px-2 py-0.5 bg-black/90 backdrop-blur-sm border border-glass-border/40 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.5),0_0_16px_rgba(0,0,0,0.3)] pointer-events-auto">
            <div className="flex items-center gap-1">
              <Move className="w-1.5 h-1.5 text-foreground/80 opacity-70" />
              <Icon className={`w-2 h-2 ${colorClass}`} />
              <span className="text-[9px] font-medium text-foreground truncate max-w-[100px]">{title}</span>
              <button
                onClick={(e) => { e.stopPropagation(); handleEdit(); }}
                className="p-0.5 hover:bg-blue-500/20 rounded"
                title="Edit asset"
              >
                <Edit className="w-2 h-2 text-blue-400" />
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className={`h-full overflow-hidden relative flex flex-col ${
        displaySettings.thumbnail ? 'glass' : 'bg-transparent'
      } border-2 border-gray-800 shadow-[0_0_20px_rgba(0,0,0,0.8),0_0_40px_rgba(0,0,0,0.6),0_0_60px_rgba(0,0,0,0.4),inset_0_0_10px_rgba(0,0,0,0.3)] rounded-t-lg`}>
        {/* Name tab integrated with the square - only when asset is large enough */}
        {displaySettings.name && !isAssetTooSmall && (
          <div className="h-7 border-b z-10 bg-black/80 rounded-t-lg flex-shrink-0" style={{
            borderColor: 'rgba(255,255,255,0.1)',
            boxShadow: 'inset 0 0 8px rgba(0,0,0,0.6), inset 0 0 16px rgba(0,0,0,0.4), inset 0 0 24px rgba(0,0,0,0.2)'
          }}>
            <div className="flex items-center gap-1 px-2 h-full">
              <Move className="w-2 h-2 text-foreground/80 opacity-70 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              <Icon className={`w-3 h-3 ${colorClass} flex-shrink-0`} />
              <span className="flex-1 text-xs font-medium text-foreground truncate leading-tight">{title}</span>
              <button
                onClick={(e) => { e.stopPropagation(); handleEdit(); }}
                className={`transition-opacity p-0.5 hover:bg-blue-500/20 rounded flex-shrink-0 ${
                  isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
                title="Edit asset"
              >
                <Edit className="w-4 h-4 text-blue-400" />
              </button>
            </div>
          </div>
        )}
        {/* Content area - thumbnail or fields */}
        <div className="relative overflow-hidden" style={{ height: `${height - (displaySettings.name && !isAssetTooSmall ? 28 : 0)}px` }}>
          {/* Thumbnail with overlay content - when thumbnail enabled */}
          {portraitImage && displaySettings.thumbnail ? (
            <>
              <div className="absolute inset-0 w-full h-full">
                <img
                  src={portraitImage}
                  alt={`${title} portrait`}
                  className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                  style={{ filter: `blur(${displaySettings.portraitBlur * 8}px)` }}
                />
              </div>
              {!isAssetTooSmall && (
                <>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent pointer-events-none" />
                  <div className="absolute bottom-0 left-0 right-0 top-1/2 z-10 pointer-events-auto">
                    <div className="h-full overflow-y-auto p-3 relative">
                      <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/40 via-transparent to-black/40 z-10" />
                      {displaySettings.description && description && (
                        <div className="text-xs text-white/90 line-clamp-3 drop-shadow-md mb-3">{description}</div>
                      )}
                      {displayedCustomFields.length > 0 && displayedCustomFields.map((field, index) => (
                        <div key={index} className="text-xs relative mb-2">
                          <div className="font-medium text-white/90 drop-shadow-md">{field.label}:</div>
                          {field.type === 'image' && field.value ? (
                            <img src={field.value} alt={field.label} className="w-full h-12 object-cover rounded border border-white/20 mt-1" />
                          ) : (
                            <div className="text-white/80 drop-shadow-md">{field.value}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            /* Layout when thumbnail hidden, no portrait, or asset is too small */
            <>
              <div className="absolute bottom-0 left-0 right-0 top-1/2 z-10 pointer-events-auto">
                <div className="h-full overflow-y-auto p-3 relative">
                  <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/20 via-transparent to-black/20 z-10" />
                  {displaySettings.description && description && (
                    <div className="text-xs text-muted-foreground line-clamp-2 mb-3">{description}</div>
                  )}
                  {displayedCustomFields.length > 0 && displayedCustomFields.map((field, index) => (
                    <div key={index} className="text-xs relative mb-2">
                      <div className="font-medium text-foreground/80">{field.label}:</div>
                      {field.type === 'image' && field.value ? (
                        <img src={field.value} alt={field.label} className="w-full h-16 object-cover rounded border border-glass-border/30 mt-1" />
                      ) : (
                        <div className="text-muted-foreground">{field.value}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      
      {/* Tag dots at the bottom for square assets */}
      {assetTags.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 flex flex-wrap gap-1 justify-center z-10">
          {assetTags.slice(0, 6).map((tag, index) => (
            <div key={tag.id} className="w-2 h-2 rounded-full border border-foreground/30" style={{ backgroundColor: tag.color }} title={tag.name} />
          ))}
          {assetTags.length > 6 && (
            <div className="text-xs text-foreground/80">+{assetTags.length - 6}</div>
          )}
        </div>
      )}
    </>
  );

  return (
    <>
      <div
        onMouseDown={!isEditingBackground ? handleMouseDown : undefined}
        onTouchStart={!isEditingBackground ? handleTouchStart : undefined}
        onDoubleClick={!isEditingBackground ? handleDoubleClick : undefined}
        onContextMenu={!isEditingBackground ? handleContextMenu : undefined}
        style={{
          position: "absolute",
          left: x,
          top: y,
          width,
          height,
          transform: isSelected ? "scale(1.05)" : "scale(1)",
          overflow: 'visible',
          zIndex: isSelected ? dynamicZIndex + 100 : dynamicZIndex,
          ...(hasTags && firstTagColor && showTagBorder && {
            boxShadow: `
              inset 0 0 8px ${getColorWithOpacity(firstTagColor, 0.8)},
              inset 0 0 16px ${getColorWithOpacity(firstTagColor, 0.6)},
              0 0 4px ${getColorWithOpacity(firstTagColor, 0.7)},
              0 0 8px ${getColorWithOpacity(firstTagColor, 0.5)},
              0 0 12px ${getColorWithOpacity(firstTagColor, 0.3)}
            `.trim()
          }),
          /* Remove glass blur for all assets */
          backdropFilter: 'none',
          WebkitBackdropFilter: 'none',
          background: 'transparent'
        }}
        className={`asset-item group relative ${
          isSelected ? "border-primary/60" : ""
        } ${
          isEditingBackground ? "pointer-events-none opacity-50 cursor-not-allowed" : "cursor-grab active:cursor-grabbing"
        } ${
          shape === 'circle' ? 'rounded-full' : ''
        } ${showExternalText ? 'z-50' : ''}`}
        id={asset.id}
      >
        {renderAssetContent()}
        
        {/* Resize Handle for Square Assets Only */}
        {shape !== 'circle' && isSelected && !isEditingBackground && (
          <div
            className="absolute bottom-0 right-0 translate-y-2 cursor-se-resize opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-primary/20 rounded flex-shrink-0 bg-primary/10 border border-glass-border/30 z-20"
            onMouseDown={handleResizeStart}
          >
            <Maximize2 className="w-3 h-3 text-primary" />
          </div>
        )}
        
        {/* Resize Handle for Circle Assets */}
        {shape === 'circle' && isSelected && !isEditingBackground && (
          <div
            className="absolute bottom-0 right-0 translate-y-2 cursor-se-resize opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-primary/20 rounded flex-shrink-0 bg-primary/10 border border-glass-border/30 z-20"
            onMouseDown={handleResizeStart}
          >
            <Maximize2 className="w-3 h-3 text-primary" />
          </div>
        )}
        
        {/* Context Menu */}
        {contextMenu.visible && (
          <AssetContextMenu
            asset={asset}
            position={{ x: contextMenu.x, y: contextMenu.y }}
            onClose={closeContextMenu}
            onEdit={handleEdit}
            onSelectAndFocus={handleSelectAndFocus}
            isViewportAsset={true}
            onCreateAsset={onCreateAsset}
            onCreateChildAsset={handleCreateChildAsset}
          />
        )}
        
        {/* Child Asset Creation Modal */}
        <AssetCreationModal
          isOpen={showChildAssetModal}
          onClose={() => { setShowChildAssetModal(false); setChildAssetParentId(null); }}
          parentId={childAssetParentId || undefined}
        />
      </div>
    </>
  );
};

// Export alias for backward compatibility
export const AssetItem = AssetItemFixed;
