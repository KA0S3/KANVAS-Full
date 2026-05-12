import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { 
  Plus, 
  Settings, 
  Image as ImageIcon,
  Minus
} from 'lucide-react';
import { useKanvasStore } from '@/stores/kanvasStore';
import { useSyncStore } from '@/stores/syncStore';
import { calculateViewportCenterPosition } from '@/utils/coordinateUtils';
import type { BackgroundConfig } from '@/types/background';

interface EmptySpaceContextMenuProps {
  position: { x: number; y: number };
  onClose: () => void;
  enteredAssetId: string | null;
  onOpenSettings: () => void;
  onOpenBackgroundSettings: () => void;
  onOpenAssetModal: (initialData?: any) => void;
  viewportSize?: { width: number; height: number };
}

export const EmptySpaceContextMenu: React.FC<EmptySpaceContextMenuProps> = ({
  position,
  onClose,
  enteredAssetId,
  onOpenSettings,
  onOpenBackgroundSettings,
  onOpenAssetModal,
  viewportSize,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const { createAsset } = useKanvasStore();
  const { currentProjectId } = useKanvasStore();

  // Calculate adjusted position to keep menu on screen
  const getAdjustedPosition = () => {
    const menuWidth = 200; // Approximate menu width
    const menuHeight = 200; // Approximate menu height
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

  const openCreateAssetModal = useCallback(() => {
    console.log('🎯 EmptySpaceContextMenu: Opening create modal');
    
    // Always center assets in the middle of the visible screen
    const viewportWidth = viewportSize?.width || 800;
    const viewportHeight = viewportSize?.height || 600;
    console.log('🎯 EmptySpaceContextMenu: Using screen dimensions:', { viewportWidth, viewportHeight });
    const centerPosition = calculateViewportCenterPosition(viewportWidth, viewportHeight, 200, 150);
    console.log('🎯 EmptySpaceContextMenu: Calculated screen center position:', centerPosition);
    
    // ONLY open the modal - do NOT create any assets
    onOpenAssetModal({
      name: 'New Asset',
      type: 'other',
      x: centerPosition.x,
      y: centerPosition.y,
      width: 200,
      height: 150,
    });
  }, [onOpenAssetModal, viewportSize]);

  const handleCreateAsset = (e: React.MouseEvent) => {
    console.log('🟢 EmptySpaceContextMenu handleCreateAsset called');
    e.stopPropagation();
    e.preventDefault();
    e.nativeEvent.stopImmediatePropagation();
    console.log('🟢 EmptySpaceContextMenu: Opening global asset modal');
    
    // Call modal opening function
    openCreateAssetModal();
    
    onClose();
  };

  const handleOpenSettings = () => {
    onOpenSettings();
    onClose();
  };

  const handleOpenBackgroundSettings = () => {
    onOpenBackgroundSettings();
    onClose();
  };

  const handleStartBackgroundEdit = () => {
    // Background editing is now handled differently in V2 architecture
    onOpenBackgroundSettings();
    onClose();
  };

  const handleCreateLine = () => {
    // Leave unlinked for now as requested
    console.log('Line creation - not implemented yet');
    onClose();
  };
  
  return (
    <>
      {createPortal(
        <div
          ref={menuRef}
          className="fixed glass-strong cosmic-glow border border-glass-border/40 rounded-lg shadow-2xl z-[9999] py-2 min-w-[200px]"
          style={{
            left: `${adjustedPosition.x}px`,
            top: `${adjustedPosition.y}px`,
          }}
        >
          {/* Menu Items */}
          <div className="py-1">
            {/* Add Asset */}
            <button
              onClick={handleCreateAsset}
              className="w-full px-3 py-2 flex items-center gap-2 text-sm text-foreground hover:bg-glass-border/20 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Asset
            </button>

            {/* Settings */}
            <button
              onClick={handleOpenSettings}
              className="w-full px-3 py-2 flex items-center gap-2 text-sm text-foreground hover:bg-glass-border/20 transition-colors"
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>

            {/* Background Settings */}
            <button
              onClick={handleOpenBackgroundSettings}
              className="w-full px-3 py-2 flex items-center gap-2 text-sm text-foreground hover:bg-glass-border/20 transition-colors"
            >
              <ImageIcon className="w-4 h-4" />
              Background Settings
            </button>

            {/* Line (unlinked) */}
            <button
              onClick={handleCreateLine}
              className="w-full px-3 py-2 flex items-center gap-2 text-sm text-foreground hover:bg-glass-border/20 transition-colors opacity-60"
              title="Not implemented yet"
            >
              <Minus className="w-4 h-4" />
              Line
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
