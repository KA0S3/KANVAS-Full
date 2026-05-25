import { useState, useEffect, useMemo, useRef } from 'react';
import { X, Save, Upload } from 'lucide-react';
import { useBookStore } from '@/stores/bookStoreSimple';
import { useKanvasStore } from '@/stores/kanvasStore';
import { importAssetToCurrentProject } from '@/persistence/desktopProjectPersistence';
import { db } from '@/storage/indexeddb';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { DEFAULT_BACKGROUND_CONFIG, type BackgroundConfig, type BackgroundMode } from '@/types/background';
import { isColorPickerVisible, getBackgroundColor, validateBackgroundConfig } from '@/utils/backgroundUtils';

interface BackgroundControlsProps {
  assetId: string | null;
  onSave?: () => void;
  onClose?: () => void;
  onChange?: (config: BackgroundConfig) => void;
  onToggleSidebar?: () => void;
}

export function BackgroundControls({ assetId, onSave, onClose, onChange, onToggleSidebar }: BackgroundControlsProps) {
  const { getCurrentBook } = useBookStore();
  const { getAsset, updateAsset, currentProjectId } = useKanvasStore();

  const asset = assetId ? getAsset(assetId) : null;
  const currentBook = getCurrentBook();

  const backgroundConfig = (assetId && asset?.style.background)
    ? { ...DEFAULT_BACKGROUND_CONFIG, ...asset.style.background }
    : DEFAULT_BACKGROUND_CONFIG;
  const [localConfig, setLocalConfig] = useState<BackgroundConfig>(backgroundConfig);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [imageNaturalSize, setImageNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const previewTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const saveConfig = (config: BackgroundConfig) => {
    if (assetId && asset) {
      updateAsset(assetId, {
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

    onChange?.(config);
    window.dispatchEvent(new CustomEvent('backgroundPreviewChanged', {
      detail: {
        assetId: assetId || 'root',
        config,
      },
    }));
  };

  // Initialize local config when background config changes
  useEffect(() => {
    setLocalConfig(backgroundConfig);
    setHasUnsavedChanges(false);
  }, [assetId, asset?.style.background]);

  useEffect(() => {
    if (assetId) return;

    const projectId = currentProjectId || currentBook?.id;
    if (!projectId) return;

    db.getProject(projectId).then(project => {
      const config = project?.settings?.backgrounds?.root
        ? { ...DEFAULT_BACKGROUND_CONFIG, ...project.settings.backgrounds.root }
        : DEFAULT_BACKGROUND_CONFIG;
      setLocalConfig(config);
    }).catch(error => {
      console.error('Failed to load root background:', error);
    });
  }, [assetId, currentProjectId, currentBook?.id]);

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
        if (prev.imageSize && prev.imageSize.width === newSize.width && prev.imageSize.height === newSize.height) {
          return prev;
        }
        const updatedConfig = { ...prev, imageSize: newSize };
        saveConfig(updatedConfig);
        return updatedConfig;
      });
    };
    img.src = localConfig.imageUrl;
  }, [localConfig.imageUrl]);

  // Cleanup preview timeout on unmount
  useEffect(() => {
    return () => {
      if (previewTimeoutRef.current) {
        clearTimeout(previewTimeoutRef.current);
      }
    };
  }, []);

  // Listen for background preview update events from viewport mouse wheel
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

  const handleModeChange = (newMode: BackgroundMode) => {
    const updatedConfig = validateBackgroundConfig({ ...localConfig, mode: newMode });
    setLocalConfig(updatedConfig);
    setHasUnsavedChanges(true);
    saveConfig(updatedConfig);
  };

  const handleSave = () => {
    // Save is now automatic - just update state and notify
    setHasUnsavedChanges(false);
    
    if (onSave) {
      onSave();
    }
    
    // Dispatch event to notify other components
    window.dispatchEvent(new CustomEvent('backgroundSaved'));
    
    // Reopen sidebar if toggle function is provided
    if (onToggleSidebar) {
      onToggleSidebar();
    }

    onClose?.();
  };

  const handleCancel = () => {
    setLocalConfig(backgroundConfig);
    setImageNaturalSize(null);
    setHasUnsavedChanges(false);
    onChange?.(backgroundConfig);
  };

  const handleExit = () => {
    onClose?.();
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
      event.target.value = '';
    }
  };

  const handleRemoveBackground = () => {
    const updatedConfig = { ...localConfig, imageUrl: null };
    setLocalConfig(updatedConfig);
    setHasUnsavedChanges(true);
    saveConfig(updatedConfig);
  };

  const updateLocalConfig = (updates: Partial<BackgroundConfig>) => {
    const updatedConfig = validateBackgroundConfig({ ...localConfig, ...updates });
    setLocalConfig(updatedConfig);
    setHasUnsavedChanges(true);
    saveConfig(updatedConfig);
  };

  const assetName = asset ? asset.content.title : 'Root Background';

  return (
    <div className="fixed right-4 top-4 w-80 max-h-[calc(100vh-2rem)] glass/60 cosmic-glow border border-glass-border/30 rounded-md p-4 space-y-4 overflow-y-auto z-50 backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">
          Background Editor - {assetName}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 hover:bg-destructive/20 hover:text-destructive"
          onClick={handleExit}
          title="Exit"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Background Image Section */}
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
              id="bg-upload-controls"
            />
            <label
              htmlFor="bg-upload-controls"
              className="flex flex-col items-center justify-center cursor-pointer hover:text-muted-foreground transition-colors"
            >
              <Upload className="w-12 h-12 mb-3" />
              <span className="text-base font-medium">Click to upload background map</span>
              <span className="text-sm text-muted-foreground">PNG, JPG, GIF up to 10MB</span>
            </label>
          </div>
        )}
      </div>

      {/* Background Mode Section */}
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

      
      {/* Asset Scale Section */}
      <div className="space-y-4">
        <h3 className="text-base font-semibold text-foreground">Asset Scale</h3>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="asset-scale">Scale</Label>
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
            id="asset-scale"
            min={0.1}
            max={3}
            step={0.01}
            value={[localConfig.scale || 1]}
            onValueChange={([value]) => updateLocalConfig({ scale: value })}
            className="w-full"
          />
        </div>
      </div>

      {/* Edge Fade Section */}
      {localConfig.imageUrl && (
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
      )}
    </div>
  );
}
