import { useState, useEffect } from 'react';
import { X, Save, Upload, Loader2 } from 'lucide-react';
import { useAssetStore } from '@/stores/assetStore';
import { useTagStore } from '@/stores/tagStore';
import { useAuthStore } from '@/stores/authStore';
import { useBookStore } from '@/stores/bookStoreSimple';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { CustomFieldsManager } from './CustomFieldsManager';
import { ViewportDisplaySettingsManager } from './ViewportDisplaySettingsManager';
import { BackgroundMapEditor } from './BackgroundMapEditor';
import type { Asset } from '@/components/AssetItem';
import type { CustomField, CustomFieldValue, ViewportDisplaySettings } from '@/types/extendedAsset';
import { compressImageToThumbnail } from '@/utils/thumbnailCompression';
import { createId } from '@/utils/id';
import { uploadFile } from '@/services/ProjectService';

interface AssetEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  assetId?: string | null;
  isNewAsset?: boolean;
  viewportSize?: { width: number; height: number };
  onCreateAsset?: (options: { name: string; type: string; x: number; y: number; width: number; height: number; description?: string; customFields?: any[]; customFieldValues?: any[]; tags?: string[]; }) => void;
  isCreating?: boolean;
  initialData?: {
    name?: string;
    type?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    description?: string;
    customFields?: any[];
    customFieldValues?: any[];
    tags?: string[];
    parentId?: string;
    context?: string;
  };
}

export function AssetEditModal({ isOpen, onClose, assetId, isNewAsset = false, viewportSize, onCreateAsset, isCreating = false, initialData }: AssetEditModalProps) {
  const { getCurrentBookAssets, updateAsset, deleteAsset } = useAssetStore();
  const { tags, addTagToAsset, removeTagFromAsset } = useTagStore();
  
  const assets = getCurrentBookAssets();
  const asset = assetId ? assets[assetId] : null;
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    thumbnail: '',
    tags: [] as string[],
  });
  
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<CustomFieldValue[]>([]);
  const [viewportDisplaySettings, setViewportDisplaySettings] = useState<ViewportDisplaySettings>({
    name: true,
    description: false,
    thumbnail: true,
    portraitBlur: 0,
  });
  const [isUploadingThumbnail, setIsUploadingThumbnail] = useState(false);
  const [showUnsavedChangesDialog, setShowUnsavedChangesDialog] = useState(false);
  const [backgroundEditorOpen, setBackgroundEditorOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Initialize form data when asset changes
  useEffect(() => {
    console.log('📝 AssetEditModal: Initializing form data');
    console.log('📝 AssetEditModal: asset:', asset);
    console.log('📝 AssetEditModal: isNewAsset:', isNewAsset);
    console.log('📝 AssetEditModal: initialData:', initialData);
    
    if (asset) {
      console.log('📝 AssetEditModal: Setting form data from existing asset');
      setFormData({
        name: asset.name || '',
        description: asset.description || '',
        thumbnail: asset.thumbnail || '',
        tags: asset.tags || [],
      });
      setCustomFields(asset.customFields || []);
      setCustomFieldValues(asset.customFieldValues || []);
      setViewportDisplaySettings(asset.viewportDisplaySettings || {
        name: true,
        description: false,
        thumbnail: true,
        portraitBlur: 0,
      });
    } else if (isNewAsset) {
      // Initialize with initialData for new asset
      console.log('📝 AssetEditModal: Setting form data from initialData for new asset');
      setFormData({
        name: initialData?.name || '',
        description: initialData?.description || '',
        thumbnail: '',
        tags: initialData?.tags || [],
      });
      setCustomFields(initialData?.customFields || []);
      setCustomFieldValues(initialData?.customFieldValues || []);
      setViewportDisplaySettings({
        name: true,
        description: false,
        thumbnail: true,
        portraitBlur: 0,
      });
    }
  }, [asset, isNewAsset, initialData]);

  // Refresh asset data when background is saved
  useEffect(() => {
    if (refreshTrigger > 0 && asset) {
      // Re-sync form data with updated asset data
      setFormData({
        name: asset.name || '',
        description: asset.description || '',
        thumbnail: asset.thumbnail || '',
        tags: asset.tags || [],
      });
      setCustomFields(asset.customFields || []);
      setCustomFieldValues(asset.customFieldValues || []);
      setViewportDisplaySettings(asset.viewportDisplaySettings || {
        name: true,
        description: false,
        thumbnail: true,
        portraitBlur: 0,
      });
    }
  }, [refreshTrigger, asset]);

  // Check if there are unsaved changes
  const hasUnsavedChanges = () => {
    if (isNewAsset) {
      // For new assets, check if any field has been filled
      return formData.name.trim() || 
             formData.description.trim() || 
             formData.thumbnail || 
             formData.tags.length > 0 ||
             customFields.length > 0 ||
             customFieldValues.length > 0;
    }
    
    // For existing assets, compare with original data
    if (!asset) return false;
    
    return formData.name !== (asset.name || '') ||
           formData.description !== (asset.description || '') ||
           formData.thumbnail !== (asset.thumbnail || '') ||
           JSON.stringify(formData.tags.sort()) !== JSON.stringify((asset.tags || []).sort()) ||
           JSON.stringify(customFields) !== JSON.stringify(asset.customFields || []) ||
           JSON.stringify(customFieldValues) !== JSON.stringify(asset.customFieldValues || []) ||
           JSON.stringify(viewportDisplaySettings) !== JSON.stringify(asset.viewportDisplaySettings || {});
  };

  const handleCloseAttempt = () => {
    if (hasUnsavedChanges()) {
      setShowUnsavedChangesDialog(true);
    } else {
      onClose();
    }
  };

  const handleForceClose = () => {
    // If this is a new asset and we're exiting without saving, delete it
    if (isNewAsset && assetId) {
      deleteAsset(assetId);
    }
    setShowUnsavedChangesDialog(false);
    onClose();
  };

  const handleSave = () => {
    try {
      console.log('💾 AssetEditModal: handleSave called');
      console.log('💾 AssetEditModal: isNewAsset:', isNewAsset);
      console.log('💾 AssetEditModal: initialData:', initialData);
      console.log('💾 AssetEditModal: formData:', formData);
      
      const assetData = {
        ...formData,
        customFields,
        customFieldValues,
        viewportDisplaySettings,
      };

      if (isNewAsset || !asset) {
        // Create new asset
        if (onCreateAsset) {
          const creationOptions = {
            name: formData.name,
            description: formData.description,
            type: initialData?.type || 'other',
            x: initialData?.x ?? 100,
            y: initialData?.y ?? 100,
            width: initialData?.width ?? 200,
            height: initialData?.height ?? 150,
            customFields,
            customFieldValues,
            tags: formData.tags,
          };
          
          console.log('💾 AssetEditModal: Calling onCreateAsset with options:', creationOptions);
          console.log('💾 AssetEditModal: Using initialData?.x:', initialData?.x, 'fallback to 100');
          console.log('💾 AssetEditModal: Using initialData?.y:', initialData?.y, 'fallback to 100');
          
          onCreateAsset(creationOptions);
        }
        onClose();
        return;
      } else {
        // Update existing asset
        updateAsset(asset.id, assetData);
        
        // Tag associations are already handled in real-time via handleTagToggle
        // No need to re-process them here to avoid duplicates
      }
      
      onClose();
    } catch (error) {
      console.error('Failed to save asset:', error);
    }
  };

  const handleImageUpload = async (field: 'thumbnail', event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setIsUploadingThumbnail(true);
      try {
        const authStore = useAuthStore.getState();
        const bookStore = useBookStore.getState();
        
        if (!authStore.user || !authStore.isAuthenticated) {
          throw new Error('User not authenticated');
        }

        const currentBookId = bookStore.currentBookId;
        if (!currentBookId) {
          throw new Error('No current book found');
        }

        // Upload to Cloudflare R2 via ProjectService
        const assetIdForUpload = assetId || `temp-${createId()}`;
        const { r2Url } = await uploadFile(currentBookId, `thumbnail-${assetIdForUpload}`, file);
        setFormData(prev => ({ ...prev, [field]: r2Url }));
      } catch (error) {
        console.error('Failed to upload thumbnail:', error);
        // Fallback to compression if upload fails
        try {
          const compressedThumbnail = await compressImageToThumbnail(file);
          setFormData(prev => ({ ...prev, [field]: compressedThumbnail }));
        } catch (compressionError) {
          console.error('Failed to compress thumbnail:', compressionError);
          // Final fallback to base64
          const reader = new FileReader();
          reader.onload = (e) => {
            const result = e.target?.result as string;
            setFormData(prev => ({ ...prev, [field]: result }));
          };
          reader.readAsDataURL(file);
        }
      } finally {
        setIsUploadingThumbnail(false);
      }
    }
  };

  const handleTagToggle = (tagId: string) => {
    const isCurrentlySelected = formData.tags.includes(tagId);
    
    // Update form state immediately
    setFormData(prev => ({
      ...prev,
      tags: isCurrentlySelected
        ? prev.tags.filter(id => id !== tagId)
        : [...prev.tags, tagId]
    }));
    
    // For existing assets, also update the tag store immediately for visual feedback
    if (asset && !isNewAsset) {
      if (isCurrentlySelected) {
        removeTagFromAsset(asset.id, tagId);
      } else {
        addTagToAsset(asset.id, tagId);
      }
    }
  };

  const handleBackgroundSave = () => {
    // Trigger a refresh to sync the updated background config
    setRefreshTrigger(prev => prev + 1);
  };

  const availableTags = Object.values(tags);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleCloseAttempt}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto glass cosmic-glow border-glass-border/40">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            {isNewAsset ? 'Create New Asset' : 'Edit Asset'}
          </DialogTitle>
          <DialogDescription>
            {isNewAsset 
              ? 'Create a new asset for your world. Fill in the details below to customize your asset.'
              : 'Edit your asset details. Make changes to the properties and settings below.'
            }
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Basic Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground">Basic Information</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="asset-name">Name *</Label>
                <Input
                  id="asset-name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter asset name..."
                  className="bg-glass/50 border-glass-border/40"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="asset-tags">Tags</Label>
                <div className="flex flex-wrap gap-2 p-2 border border-glass-border/40 rounded-md bg-glass/30 min-h-[40px]">
                  {availableTags.map((tag) => {
                    // Ensure tag has a valid color, fallback to gray if not
                    const tagColor = tag.color && tag.color.trim() !== '' ? tag.color : '#6b7280';
                    
                    return (
                      <Badge
                        key={tag.id}
                        variant={formData.tags.includes(tag.id) ? "default" : "outline"}
                        className="cursor-pointer"
                        style={{ 
                          backgroundColor: formData.tags.includes(tag.id) ? tagColor : 'transparent',
                          borderColor: tagColor,
                          color: formData.tags.includes(tag.id) ? 'white' : tagColor,
                          borderWidth: '2px'
                        }}
                        onClick={() => handleTagToggle(tag.id)}
                      >
                        {tag.name}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="asset-description">Description</Label>
              <Textarea
                id="asset-description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Enter asset description..."
                rows={3}
                className="bg-glass/50 border-glass-border/40"
              />
            </div>
          </div>

          {/* Images */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-foreground">Images</h3>
            
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label htmlFor="thumbnail">Thumbnail</Label>
                {formData.thumbnail ? (
                  <div className="relative group">
                    <img
                      src={formData.thumbnail}
                      alt="Thumbnail preview"
                      className="w-full h-32 object-cover rounded-md border border-glass-border/40"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => setFormData(prev => ({ ...prev, thumbnail: '' }))}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-glass-border/40 rounded-md p-4 bg-glass/20">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageUpload('thumbnail', e)}
                      disabled={isUploadingThumbnail}
                      className="hidden"
                      id="thumbnail-upload"
                    />
                    <label
                      htmlFor="thumbnail-upload"
                      className={`flex flex-col items-center justify-center cursor-pointer hover:text-muted-foreground transition-colors ${
                        isUploadingThumbnail ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      {isUploadingThumbnail ? (
                        <>
                          <Loader2 className="w-8 h-8 mb-2 animate-spin" />
                          <span className="text-sm">Uploading to Cloudflare R2...</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-8 h-8 mb-2" />
                          <span className="text-sm">Click to upload thumbnail</span>
                          <span className="text-xs text-muted-foreground">PNG, JPG, GIF up to 10MB</span>
                        </>
                      )}
                    </label>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Custom Fields */}
          {asset && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground">Custom Fields</h3>
              <CustomFieldsManager
                assetId={asset.id}
                fields={customFields}
                values={customFieldValues}
              />
            </div>
          )}

          {/* Viewport Display Settings */}
          {asset && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground">Viewport Display Settings</h3>
              <ViewportDisplaySettingsManager
                assetId={asset.id}
                settings={viewportDisplaySettings}
              />
            </div>
          )}

          {/* Background Map Settings */}
          {asset && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground">Background Map</h3>
              <div className="p-4 border border-glass-border/40 rounded-md bg-glass/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Configure background image and positioning</p>
                    <p className="text-xs text-muted-foreground">
                      {asset.backgroundConfig?.image 
                        ? `Background set: ${asset.backgroundConfig.position?.x || 0}, ${asset.backgroundConfig.position?.y || 0}` 
                        : 'No background image set'}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBackgroundEditorOpen(true)}
                    className="gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    Edit Background
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCloseAttempt}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!formData.name.trim() || isCreating}>
            {isCreating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Creating...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                {isNewAsset ? 'Create' : 'Save'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

      {/* Unsaved Changes Confirmation Dialog */}
      <AlertDialog open={showUnsavedChangesDialog} onOpenChange={setShowUnsavedChangesDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to exit without saving?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleForceClose} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Exit Without Saving
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Background Map Editor */}
      {asset && (
        <BackgroundMapEditor
          isOpen={backgroundEditorOpen}
          onClose={() => setBackgroundEditorOpen(false)}
          assetId={asset.id}
          viewportSize={viewportSize}
          onSave={handleBackgroundSave}
        />
      )}
    </>
  );
}
