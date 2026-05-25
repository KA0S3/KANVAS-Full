import { useState, useEffect, useMemo, useRef } from 'react';
import { X, Save, Upload, Database, Cloud, HardDrive } from 'lucide-react';
import { useAssetStore } from '@/stores/assetStore';
import { useBookStore } from '@/stores/bookStoreSimple';
import { useBackgroundStore } from '@/stores/backgroundStore';
import { useAuthStore } from '@/stores/authStore';
import { useCloudStore } from '@/stores/cloudStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { Asset } from '@/types/assetInterfaces';
import type { BackgroundConfig, BackgroundMode } from '@/types/background';
import { isColorPickerVisible, getBackgroundColor, validateBackgroundConfig } from '@/utils/backgroundUtils';
import { getAssetKey } from '@/types/background';
import { indexedDBStorage } from '@/utils/indexedDBStorage';

interface BackgroundControlsEnhancedProps {
  assetId: string | null;
  onSave?: () => void;
  onToggleSidebar?: () => void;
}

export function BackgroundControlsEnhanced({ assetId, onSave, onToggleSidebar }: BackgroundControlsEnhancedProps) {
  const { getCurrentBookAssets, updateAsset, setIsEditingBackground } = useAssetStore();
  const { getCurrentBook, getWorldData, updateWorldData } = useBookStore();
  const { getBackground, setBackground, cloneConfig } = useBackgroundStore();
  const { user, plan, isAuthenticated } = useAuthStore();
  const { syncEnabled } = useCloudStore();
  
  const assets = getCurrentBookAssets();
  const asset = assetId ? assets[assetId] : null;
  const currentBook = getCurrentBook();
  
  // Get background config using enhanced store
  const backgroundConfig = getBackground(getAssetKey(assetId || 'root', currentBook?.id));
  const [localConfig, setLocalConfig] = useState<BackgroundConfig>(backgroundConfig);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [imageNaturalSize, setImageNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [storageInfo, setStorageInfo] = useState<any>(null);
  const previewTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Image loading will be handled by backgroundStore's async loading

  // Storage info functionality removed for simplicity

  // Initialize local config when background config changes
  useEffect(() => {
    setLocalConfig(backgroundConfig);
    setHasUnsavedChanges(false);
  }, [backgroundConfig]);

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
      
      // Update config with image size if not already set
      if (!backgroundConfig.imageSize || 
          backgroundConfig.imageSize.width !== newSize.width || 
          backgroundConfig.imageSize.height !== newSize.height) {
        const assetKey = getAssetKey(assetId || 'root', currentBook?.id);
        const updatedConfig = { ...backgroundConfig, imageSize: newSize };
        setBackground(assetKey, updatedConfig);
      }
    };
    img.src = localConfig.imageUrl;
  }, [localConfig.imageUrl, backgroundConfig.imageSize, assetId, currentBook?.id, setBackground]);

  // Handle background preview updates
  useEffect(() => {
    const handleBackgroundPreviewUpdate = (event: CustomEvent) => {
      const { scale, assetId: eventAssetId } = event.detail;
      if (scale !== undefined && (eventAssetId === 'root' || eventAssetId === assetId)) {
        setLocalConfig(prev => ({ ...prev, scale }));
        setHasUnsavedChanges(true);
        
        // Auto-save with debouncing
        if (previewTimeoutRef.current) {
          clearTimeout(previewTimeoutRef.current);
        }
        previewTimeoutRef.current = setTimeout(() => {
          const assetKey = getAssetKey(assetId || 'root', currentBook?.id);
          const updatedConfig = { ...localConfig, scale };
          setBackground(assetKey, updatedConfig);
          setHasUnsavedChanges(false);
        }, 500);
      }
    };

    window.addEventListener('backgroundPreviewUpdate', handleBackgroundPreviewUpdate as EventListener);
    return () => {
      window.removeEventListener('backgroundPreviewUpdate', handleBackgroundPreviewUpdate as EventListener);
      if (previewTimeoutRef.current) {
        clearTimeout(previewTimeoutRef.current);
      }
    };
  }, [assetId, localConfig, currentBook?.id, setBackground]);

  const handleModeChange = (newMode: BackgroundMode) => {
    const updatedConfig = validateBackgroundConfig({ ...localConfig, mode: newMode });
    setLocalConfig(updatedConfig);
    setHasUnsavedChanges(true);
    
    // Auto-save immediately via store
    const assetKey = getAssetKey(assetId || 'root', currentBook?.id);
    setBackground(assetKey, updatedConfig);
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 100);

      const reader = new FileReader();
      reader.onload = async (e) => {
        const result = e.target?.result as string;
        const updatedConfig = { ...localConfig, imageUrl: result };
        setLocalConfig(updatedConfig);
        setHasUnsavedChanges(true);
        
        clearInterval(progressInterval);
        setUploadProgress(100);
        
        // Auto-save via enhanced store (handles IndexedDB/Cloud automatically)
        const assetKey = getAssetKey(assetId || 'root', currentBook?.id);
        await setBackground(assetKey, updatedConfig);
        
        setTimeout(() => {
          setIsUploading(false);
          setUploadProgress(0);
        }, 500);
      };
      
      reader.onerror = () => {
        clearInterval(progressInterval);
        setIsUploading(false);
        setUploadProgress(0);
        console.error('Failed to read file');
      };
      
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Failed to upload image:', error);
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleRemoveBackground = async () => {
    const updatedConfig = { ...localConfig, imageUrl: null };
    setLocalConfig(updatedConfig);
    setHasUnsavedChanges(true);
    
    // Auto-save via enhanced store
    const assetKey = getAssetKey(assetId || 'root', currentBook?.id);
    await setBackground(assetKey, updatedConfig);
    
    // Also remove from IndexedDB
    if (assetId) {
      await indexedDBStorage.removeImage(assetId);
    }
  };

  const updateLocalConfig = async (updates: Partial<BackgroundConfig>) => {
    const updatedConfig = validateBackgroundConfig({ ...localConfig, ...updates });
    setLocalConfig(updatedConfig);
    setHasUnsavedChanges(true);
    
    // Auto-save via enhanced store
    const assetKey = getAssetKey(assetId || 'root', currentBook?.id);
    await setBackground(assetKey, updatedConfig);
  };

  const getStorageIcon = () => {
    if (!isAuthenticated || plan === 'guest') {
      return <Database className="w-4 h-4 text-blue-500" />;
    }
    return syncEnabled ? <Cloud className="w-4 h-4 text-green-500" /> : <HardDrive className="w-4 h-4 text-gray-500" />;
  };

  const getStorageType = () => {
    if (!isAuthenticated || plan === 'guest') {
      return 'IndexedDB (Local)';
    }
    return syncEnabled ? 'Cloud Storage (Pro)' : 'Local Storage';
  };

  const assetName = asset ? asset.name : 'Root Background';

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
          onClick={onSave}
          title="Close"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Storage Info */}
      <div className="flex items-center justify-between p-2 bg-glass/30 rounded-lg">
        <div className="flex items-center gap-2">
          {getStorageIcon()}
          <span className="text-xs font-medium">{getStorageType()}</span>
        </div>
        {storageInfo && (
          <span className="text-xs text-muted-foreground">
            {storageInfo.indexedDB.count} images
          </span>
        )}
      </div>

      {/* Background Image */}
      <div className="space-y-2">
        <h3 className="text-base font-semibold text-foreground">Background Image</h3>

        {isUploading && (
          <div className="space-y-2">
            <div className="w-full bg-glass/30 rounded-full h-2">
              <div 
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Uploading... {uploadProgress}%
            </p>
          </div>
        )}

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
            {imageNaturalSize && (
              <div className="absolute bottom-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                {imageNaturalSize.width}×{imageNaturalSize.height}
              </div>
            )}
          </div>
        ) : (
          <div className="border-2 border-dashed border-glass-border/40 rounded-md p-4 bg-glass/20">
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
              id="bg-upload-enhanced"
              disabled={isUploading}
            />
            <label
              htmlFor="bg-upload-enhanced"
              className="flex flex-col items-center justify-center cursor-pointer hover:text-muted-foreground transition-colors"
            >
              <Upload className="w-8 h-8 mb-2" />
              <span className="text-sm font-medium">Click to upload background</span>
              <span className="text-xs text-muted-foreground">PNG, JPG, GIF up to 10MB</span>
            </label>
          </div>
        )}
      </div>

      {/* Background Mode */}
      <div className="space-y-2">
        <h3 className="text-base font-semibold text-foreground">Background Mode</h3>

        <RadioGroup value={localConfig.mode} onValueChange={(value) => handleModeChange(value as BackgroundMode)}>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="glass" id="glass-mode-enhanced" />
            <Label htmlFor="glass-mode-enhanced">Glass Effect</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="parchment" id="parchment-mode-enhanced" />
            <Label htmlFor="parchment-mode-enhanced">Parchment Texture</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="color" id="color-mode-enhanced" />
            <Label htmlFor="color-mode-enhanced">Solid Color</Label>
          </div>
        </RadioGroup>

        {isColorPickerVisible(localConfig) && (
          <div className="space-y-2">
            <Label htmlFor="bg-color-enhanced">Background Color</Label>
            <div className="flex gap-2">
              <Input
                id="bg-color-enhanced"
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

      {/* Position & Scale */}
      {localConfig.imageUrl && (
        <div className="space-y-2">
          <h3 className="text-base font-semibold text-foreground">Position & Scale</h3>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="scale-enhanced">Scale</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="scale-input-enhanced"
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
              id="scale-enhanced"
              min={0.1}
              max={3}
              step={0.01}
              value={[localConfig.scale || 1]}
              onValueChange={([value]) => updateLocalConfig({ scale: value })}
              className="w-full"
            />
          </div>
        </div>
      )}

      {/* Storage Statistics */}
      {storageInfo && (
        <div className="space-y-2">
          <h3 className="text-base font-semibold text-foreground">Storage Usage</h3>
          <div className="text-xs space-y-1">
            <div className="flex justify-between">
              <span>IndexedDB Images:</span>
              <span>{storageInfo.indexedDB.count}</span>
            </div>
            <div className="flex justify-between">
              <span>Local Storage Items:</span>
              <span>{storageInfo.localStorage.count}</span>
            </div>
            <div className="flex justify-between">
              <span>Compressed Size:</span>
              <span>{(storageInfo.indexedDB.compressedSize / 1024 / 1024).toFixed(2)} MB</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
