import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { X, Save, Upload, Maximize2 } from 'lucide-react';
import { useBookStore } from '@/stores/bookStoreSimple';
import { useKanvasStore } from '@/stores/kanvasStore';
import { importAssetToCurrentProject } from '@/persistence/desktopProjectPersistence';
import { db } from '@/storage/indexeddb';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { DEFAULT_BACKGROUND_CONFIG, type BackgroundConfig, type BackgroundMode } from '@/types/background';
import { isColorPickerVisible, getBackgroundColor, validateBackgroundConfig, shouldShowParchmentOverlay, shouldShowGlassEffect } from '@/utils/backgroundUtils';
import { cssUrl } from '@/utils/cssUrl';

interface BackgroundMapEditorProps {
  isOpen: boolean;
  onClose: () => void;
  assetId: string | null;
  viewportSize?: { width: number; height: number };
  onSave?: () => void;
}

export function BackgroundMapEditor({ isOpen, onClose, assetId, viewportSize: _viewportSize, onSave }: BackgroundMapEditorProps) {
  const { getCurrentBook } = useBookStore();
  const { getAsset, updateAsset, currentProjectId } = useKanvasStore();

  // Hook to get actual window size
  const [windowSize, setWindowSize] = useState({ width: 800, height: 600 });
  
  useEffect(() => {
    const updateWindowSize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };
    
    updateWindowSize();
    window.addEventListener('resize', updateWindowSize);
    return () => window.removeEventListener('resize', updateWindowSize);
  }, []);
  
  useEffect(() => {
    const handleBackgroundPreviewUpdate = (event: CustomEvent) => {
      const { scale, assetId: eventAssetId } = event.detail;
      if (scale !== undefined && (eventAssetId === 'root' || eventAssetId === assetId)) {
        setLocalConfig(prev => ({ ...prev, scale }));
        setHasUnsavedChanges(true);
      }
    };

    window.addEventListener('backgroundPreviewUpdate', handleBackgroundPreviewUpdate as EventListener);
    return () => {
      window.removeEventListener('backgroundPreviewUpdate', handleBackgroundPreviewUpdate as EventListener);
    };
  }, [assetId]);
  
  const asset = assetId ? getAsset(assetId) : null;
  const currentBook = getCurrentBook();

  const backgroundConfig = (assetId && asset?.style.background)
    ? { ...DEFAULT_BACKGROUND_CONFIG, ...asset.style.background }
    : DEFAULT_BACKGROUND_CONFIG;
  const [localConfig, setLocalConfig] = useState<BackgroundConfig>(backgroundConfig);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageOffset, setImageOffset] = useState({ x: 0, y: 0 });
  const [showAssetOverlay, setShowAssetOverlay] = useState(true);
  const [imageNaturalSize, setImageNaturalSize] = useState<{ width: number; height: number } | null>(null);
  
  const actualViewportSize = windowSize;

  // Memoize background config to prevent infinite re-renders
  const memoizedBackgroundConfig = useMemo(() => backgroundConfig, [backgroundConfig.mode, backgroundConfig.color, backgroundConfig.imageUrl, backgroundConfig.position?.x, backgroundConfig.position?.y, backgroundConfig.scale, backgroundConfig.gridSize, backgroundConfig.edgeOpacity, backgroundConfig.innerRadius, backgroundConfig.outerRadius, backgroundConfig.imageSize?.width, backgroundConfig.imageSize?.height]);
  
  // Initialize local config when background config changes
  useEffect(() => {
    setLocalConfig(memoizedBackgroundConfig);
    setImageOffset(memoizedBackgroundConfig.position || { x: 0, y: 0 });
    setHasUnsavedChanges(false);
  }, [memoizedBackgroundConfig]);

  // Handle image loading for natural size detection
  useEffect(() => {
    if (!localConfig.imageUrl) {
      setImageNaturalSize(null);
      return;
    }

    const img = new Image();
    img.onload = () => {
      const newSize = { width: img.naturalWidth, height: img.naturalHeight };
      setImageNaturalSize(newSize);
      setLocalConfig(prev => {
        // Only update imageSize if not already set - preserves saved scale on refresh
        if (prev.imageSize) {
          return prev;
        }
        return { ...prev, imageSize: newSize };
      });
    };
    img.src = localConfig.imageUrl;
  }, [localConfig.imageUrl]);

  const getRenderedImageSize = () => {
    const scale = localConfig.scale ?? 1;
    const size = localConfig.imageSize || imageNaturalSize;
    if (!size) return null;
    return {
      width: Math.round(size.width * scale),
      height: Math.round(size.height * scale),
    };
  };

  const clampPositionToViewport = (pos: { x: number; y: number }) => {
    const rendered = getRenderedImageSize();
    if (!rendered) return pos;

    // Allow free movement for all images regardless of size
    const maxOffset = Math.max(rendered.width, rendered.height, actualViewportSize.width, actualViewportSize.height) * 3;
    
    return {
      x: Math.max(-maxOffset, Math.min(maxOffset, pos.x)),
      y: Math.max(-maxOffset, Math.min(maxOffset, pos.y)),
    };
  };

  const handleModeChange = (newMode: BackgroundMode) => {
    const updatedConfig = validateBackgroundConfig({ ...localConfig, mode: newMode });
    setLocalConfig(updatedConfig);
    setHasUnsavedChanges(true);
    saveConfig(updatedConfig);
  };

  const handleCloseAttempt = () => {
    onClose();
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (window.kanvasDesktop) {
        try {
          const importTargetId = assetId || `${currentProjectId || currentBook?.id || 'project'}_root_background`;
          const { relativePath } = await importAssetToCurrentProject(file, importTargetId);
          const updatedConfig = { ...localConfig, imageUrl: relativePath };
          setLocalConfig(updatedConfig);
          setHasUnsavedChanges(true);
          saveConfig(updatedConfig);
        } catch (error) {
          console.error('Failed to import desktop background image:', error);
        } finally {
          event.target.value = '';
        }
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        const updatedConfig = { ...localConfig, imageUrl: result };
        setLocalConfig(updatedConfig);
        setHasUnsavedChanges(true);
        saveConfig(updatedConfig);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveBackground = () => {
    const updatedConfig = { ...localConfig, imageUrl: null };
    setLocalConfig(updatedConfig);
    setHasUnsavedChanges(true);
    saveConfig(updatedConfig);
  };

  const saveConfig = (config: BackgroundConfig) => {
    if (assetId && asset) {
      updateAsset(asset.id, {
        style: {
          ...asset.style,
          background: config,
        },
      });
    } else {
      const projectId = currentProjectId || currentBook?.id;
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
    }
    
    // Dispatch event to notify other components
    window.dispatchEvent(new CustomEvent('backgroundSaved'));
    
    // For scale changes, dispatch immediate preview update for real-time feedback
    if (config.scale !== backgroundConfig.scale) {
      window.dispatchEvent(new CustomEvent('backgroundPreviewUpdate', {
        detail: {
          scale: config.scale,
          assetId: assetId || 'root'
        }
      }));
    }
  };

  const updateLocalConfig = (updates: Partial<BackgroundConfig>, skipClamping: boolean = false) => {
    const newConfig = validateBackgroundConfig({ 
      ...localConfig, 
      ...updates,
      // Explicitly preserve position if not being updated
      position: updates.position !== undefined ? updates.position : localConfig.position
    });
    
    // Only apply clamping during manual drag operations
    if (updates.position && !skipClamping) {
      newConfig.position = clampPositionToViewport(updates.position);
    }
    
    setLocalConfig(newConfig);
    setHasUnsavedChanges(true);
    saveConfig(newConfig);
  };

  // Drag handlers for preview area
  const handlePreviewMouseDown = (e: React.MouseEvent) => {
    if (!localConfig.imageUrl) return;
    
    e.preventDefault();
    setIsDragging(true);

    const previewRect = previewRef.current?.getBoundingClientRect();
    if (!previewRect) return;
    const startX = e.clientX - previewRect.left - imageOffset.x;
    const startY = e.clientY - previewRect.top - imageOffset.y;
    setDragStart({ x: startX, y: startY });
  };

  const handlePreviewMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !localConfig.imageUrl) return;
    
    const previewRect = previewRef.current?.getBoundingClientRect();
    if (!previewRect) return;

    const newX = e.clientX - previewRect.left - dragStart.x;
    const newY = e.clientY - previewRect.top - dragStart.y;

    setImageOffset({ x: newX, y: newY });
    updateLocalConfig({ position: { x: newX, y: newY } }, false);
  };

  const handlePreviewMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      const handleGlobalMouseMove = (e: MouseEvent) => {
        const previewRect = previewRef.current?.getBoundingClientRect();
        if (!previewRect) return;

        const newX = e.clientX - previewRect.left - dragStart.x;
        const newY = e.clientY - previewRect.top - dragStart.y;

        setImageOffset({ x: newX, y: newY });
        updateLocalConfig({ position: { x: newX, y: newY } }, false);
      };

      const handleGlobalMouseUp = () => {
        setIsDragging(false);
      };

      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleGlobalMouseMove);
        document.removeEventListener('mouseup', handleGlobalMouseUp);
      };
    }
  }, [isDragging, dragStart]);

  // Mouse wheel handler for scale control
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (!localConfig.imageUrl || !previewRef.current) return;
      
      const rect = previewRef.current.getBoundingClientRect();
      const isOverPreview = e.clientX >= rect.left && e.clientX <= rect.right && 
                           e.clientY >= rect.top && e.clientY <= rect.bottom;
      
      if (!isOverPreview) return;
      
      e.preventDefault();
      
      const currentScale = localConfig.scale || 1;
      const delta = e.deltaY > 0 ? -0.05 : 0.05;
      const newScale = Math.max(0.1, Math.min(3, currentScale + delta));
      
      updateLocalConfig({ scale: newScale });
    };

    const previewElement = previewRef.current;
    if (previewElement) {
      previewElement.addEventListener('wheel', handleWheel, { passive: false });
      return () => {
        previewElement.removeEventListener('wheel', handleWheel);
      };
    }
  }, [localConfig.imageUrl, localConfig.scale]);

  const previewRef = useRef<HTMLDivElement>(null);
  const assetName = asset ? asset.content.title : 'Root Background';

  return (
    <Dialog open={isOpen} onOpenChange={handleCloseAttempt}>
      <DialogContent className="fixed inset-0 w-screen h-screen max-w-none translate-x-0 translate-y-0 left-0 top-0 p-0 glass cosmic-glow border-glass-border/40">
        <div className="relative w-full h-full">
          <div
            ref={previewRef}
            className={`absolute inset-0 cursor-move ${shouldShowGlassEffect(localConfig) ? 'glass cosmic-glow' : ''}`}
            style={{
              backgroundColor: getBackgroundColor(localConfig),
              backgroundImage: cssUrl(localConfig.imageUrl),
              backgroundRepeat: 'no-repeat',
              backgroundPosition: `${imageOffset.x}px ${imageOffset.y}px`,
              backgroundSize: (() => {
                const rendered = getRenderedImageSize();
                if (rendered) return `${rendered.width}px ${rendered.height}px`;
                return 'auto';
              })(),
              mask: localConfig.imageUrl ? 
                `radial-gradient(circle at center, 
                  black ${(localConfig.innerRadius || 0.3) * 100}%, 
                  transparent ${(localConfig.outerRadius || 0.8) * 100}%)` : 
                undefined,
              WebkitMask: localConfig.imageUrl ? 
                `radial-gradient(circle at center, 
                  black ${(localConfig.innerRadius || 0.3) * 100}%, 
                  transparent ${(localConfig.outerRadius || 0.8) * 100}%)` : 
                undefined,
            }}
            onMouseDown={handlePreviewMouseDown}
            onMouseMove={handlePreviewMouseMove}
            onMouseUp={handlePreviewMouseUp}
          >
            {/* Parchment Texture Overlay */}
            {shouldShowParchmentOverlay(localConfig) && (
              <div 
                className="absolute inset-0 pointer-events-none"
                style={{
                  opacity: localConfig.imageUrl ? 0.15 : 0.25,
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
            <div
              className="absolute inset-0 pointer-events-none"
            />

            {showAssetOverlay && (
              <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded pointer-events-none">
                Viewport: {actualViewportSize.width}×{actualViewportSize.height}
              </div>
            )}

            <div className="absolute bottom-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded pointer-events-none">
              Position: ({Math.round(imageOffset.x)}, {Math.round(imageOffset.y)}) | Scale: {localConfig.scale?.toFixed(2)}
            </div>
          </div>

          <div className="absolute top-4 left-4 w-[380px] max-h-[calc(100vh-2rem)] overflow-auto glass cosmic-glow border border-glass-border/40 rounded-md p-3 space-y-4 scale-95 origin-top-left">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle className="text-lg font-bold">
                  Background Map Editor - {assetName}
                </DialogTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 hover:bg-destructive/20 hover:text-destructive"
                  onClick={handleCloseAttempt}
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </DialogHeader>

            <div className="space-y-4">
              <h3 className="text-base font-semibold text-foreground">Background Image</h3>

              {localConfig.imageUrl ? (
                <div className="relative group">
                  <img
                    src={localConfig.imageUrl}
                    alt="Background preview"
                    className="w-full h-32 object-cover rounded-md border border-glass-border/40"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={handleRemoveBackground}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <div className="border-2 border-dashed border-glass-border/40 rounded-md p-6 bg-glass/20">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                    id="bg-upload"
                  />
                  <label
                    htmlFor="bg-upload"
                    className="flex flex-col items-center justify-center cursor-pointer hover:text-muted-foreground transition-colors"
                  >
                    <Upload className="w-12 h-12 mb-3" />
                    <span className="text-base font-medium">Click to upload background map</span>
                    <span className="text-sm text-muted-foreground">PNG, JPG, GIF up to 10MB</span>
                  </label>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <h3 className="text-base font-semibold text-foreground">Background Mode</h3>

              <RadioGroup value={localConfig.mode} onValueChange={(value) => handleModeChange(value as BackgroundMode)}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="glass" id="glass-mode" />
                  <Label htmlFor="glass-mode">Glass Effect</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="parchment" id="parchment-mode" />
                  <Label htmlFor="parchment-mode">Parchment Texture</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="color" id="color-mode" />
                  <Label htmlFor="color-mode">Solid Color</Label>
                </div>
              </RadioGroup>

              {isColorPickerVisible(localConfig) && (
                <div className="space-y-2">
                  <Label htmlFor="bg-color">Background Color</Label>
                  <div className="flex gap-2">
                    <Input
                      id="bg-color"
                      type="color"
                      value={localConfig.color || '#000000'}
                      onChange={(e) => updateLocalConfig({ color: e.target.value })}
                      className="w-20 h-10 bg-glass/50 border-glass-border/40"
                    />
                    <Input
                      type="text"
                      value={localConfig.color || '#000000'}
                      onChange={(e) => updateLocalConfig({ color: e.target.value })}
                      className="flex-1 bg-glass/50 border-glass-border/40"
                      placeholder="#000000"
                    />
                  </div>
                </div>
              )}
            </div>

            {localConfig.imageUrl && (
              <div className="space-y-4">
                <h3 className="text-base font-semibold text-foreground">Position & Scale</h3>

                <div className="flex items-center justify-between">
                  <Label>True Viewport Preview (Drag on the canvas)</Label>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setWindowSize({ width: window.innerWidth, height: window.innerHeight });
                      }}
                      className="text-xs"
                    >
                      <Maximize2 className="w-3 h-3 mr-1" />
                      Refresh
                    </Button>
                    <Switch
                      id="show-overlay"
                      checked={showAssetOverlay}
                      onCheckedChange={setShowAssetOverlay}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="pos-x">X Position</Label>
                    <Input
                      id="pos-x"
                      type="number"
                      value={localConfig.position?.x || 0}
                      onChange={(e) => updateLocalConfig({
                        position: { ...localConfig.position, x: Number(e.target.value) }
                      }, true)}
                      className="bg-glass/50 border-glass-border/40"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="pos-y">Y Position</Label>
                    <Input
                      id="pos-y"
                      type="number"
                      value={localConfig.position?.y || 0}
                      onChange={(e) => updateLocalConfig({
                        position: { ...localConfig.position, y: Number(e.target.value) }
                      }, true)}
                      className="bg-glass/50 border-glass-border/40"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="scale">Scale</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="scale-input"
                        type="number"
                        min="0.1"
                        max="3"
                        step="0.01"
                        value={localConfig.scale?.toFixed(2) || '1.00'}
                        onChange={(e) => {
                          const value = parseFloat(e.target.value);
                          if (!isNaN(value) && value >= 0.1 && value <= 3) {
                            updateLocalConfig({ scale: value });
                          }
                        }}
                        className="w-20 h-8 bg-glass/50 border-glass-border/40 text-xs"
                      />
                      <span className="text-xs text-muted-foreground">×{localConfig.scale?.toFixed(2) || '1.00'}</span>
                    </div>
                  </div>
                  <Slider
                    id="scale"
                    min={0.1}
                    max={3}
                    step={0.01}
                    value={[localConfig.scale || 1]}
                    onValueChange={([value]) => updateLocalConfig({ scale: value })}
                    className="w-full"
                  />
                </div>

                <div className="space-y-4">
                <h3 className="text-base font-semibold text-foreground">Radial Fade Controls</h3>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="inner-radius">Inner Radius (Fully Visible)</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id="inner-radius-input"
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          value={Math.round((localConfig.innerRadius || 0.3) * 100)}
                          onChange={(e) => {
                            const value = parseInt(e.target.value);
                            if (!isNaN(value) && value >= 0 && value <= 100) {
                              updateLocalConfig({ innerRadius: value / 100 });
                            }
                          }}
                          className="w-20 h-8 bg-glass/50 border-glass-border/40 text-xs"
                        />
                        <span className="text-xs text-muted-foreground">{Math.round((localConfig.innerRadius || 0.3) * 100)}%</span>
                      </div>
                    </div>
                    <Slider
                      id="inner-radius"
                      min={0}
                      max={100}
                      step={1}
                      value={[Math.round((localConfig.innerRadius || 0.3) * 100)]}
                      onValueChange={([value]) => updateLocalConfig({ innerRadius: value / 100 })}
                      className="w-full"
                    />
                    <p className="text-xs text-muted-foreground">
                      Size of the center area that remains fully visible.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="outer-radius">Outer Radius (Fade Start)</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id="outer-radius-input"
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          value={Math.round((localConfig.outerRadius || 0.8) * 100)}
                          onChange={(e) => {
                            const value = parseInt(e.target.value);
                            if (!isNaN(value) && value >= 0 && value <= 100) {
                              updateLocalConfig({ outerRadius: value / 100 });
                            }
                          }}
                          className="w-20 h-8 bg-glass/50 border-glass-border/40 text-xs"
                        />
                        <span className="text-xs text-muted-foreground">{Math.round((localConfig.outerRadius || 0.8) * 100)}%</span>
                      </div>
                    </div>
                    <Slider
                      id="outer-radius"
                      min={0}
                      max={100}
                      step={1}
                      value={[Math.round((localConfig.outerRadius || 0.8) * 100)]}
                      onValueChange={([value]) => updateLocalConfig({ outerRadius: value / 100 })}
                      className="w-full"
                    />
                    <p className="text-xs text-muted-foreground">
                      Where the fade begins. Beyond this point, background becomes transparent.
                    </p>
                  </div>
                </div>
              </div>
              </div>
            )}

            <div className="space-y-4">
              <h3 className="text-base font-semibold text-foreground">Grid Settings</h3>

              <div className="space-y-2">
                <Label htmlFor="grid-size">Grid Size: {localConfig.gridSize}px</Label>
                <Input
                  id="grid-size"
                  type="range"
                  min="10"
                  max="100"
                  step="5"
                  value={localConfig.gridSize || 40}
                  onChange={(e) => updateLocalConfig({ gridSize: Number(e.target.value) })}
                  className="w-full"
                />
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
