import { useState, useEffect, useCallback } from 'react';
import { X, Save, Upload, Settings, Droplets, Eye, EyeOff, Globe, Lock, Plus, Trash2, Cloud, AlertCircle } from 'lucide-react';
import { useKanvasStore } from '@/stores/kanvasStore';
import { useProjectStore } from '@/stores/projectStore';
import { useSyncStore } from '@/stores/syncStore';
import { useAuthStore } from '@/stores/authStore';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { CustomFieldsManager } from './CustomFieldsManager';
import { ViewportDisplaySettingsManager } from './ViewportDisplaySettingsManager';
import { UpgradePromptModal } from '@/components/UpgradePromptModal';
import { calculateViewportCenterPosition, calculateChildAssetCenterPosition } from '@/utils/coordinateUtils';
import type { Asset } from '@/types/Asset';
import { GeneratorParser, EXAMPLE_GENERATOR_DATA } from '@/services/generatorParser';
import { compressImageToThumbnail } from '@/utils/thumbnailCompression';

// Type definitions for compatibility
interface CustomField {
  id: string;
  name: string;
  type: string;
  required?: boolean;
  label?: string;
  displayInViewport?: boolean;
  color?: string;
}

interface CustomFieldValue {
  fieldId: string;
  value: any;
}

interface ViewportDisplaySettings {
  name: boolean;
  description: boolean;
  thumbnail: boolean;
  portraitBlur: number;
  zoom?: number;
  showGrid?: boolean;
  snapToGrid?: boolean;
}

interface AssetCreationModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: {
    name?: string;
    type?: 'image' | 'document' | 'video' | 'audio' | 'code' | 'other';
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    description?: string;
    tags?: string[];
    thumbnail?: string;
    customFields?: CustomField[];
    customFieldValues?: CustomFieldValue[];
    viewportDisplaySettings?: ViewportDisplaySettings;
  };
  parentId?: string;
  generatorImportData?: any;
  projectId?: string;
  viewportSize?: { width: number; height: number };
}

export function AssetCreationModal({ isOpen, onClose, initialData, parentId, generatorImportData, projectId, viewportSize }: AssetCreationModalProps) {
  const { currentProject } = useProjectStore();
  const { isAuthenticated, plan } = useAuthStore();
  
  // Simple mock data for tags (would come from project store)
  const mockTags = [
    { id: '1', name: 'red', color: 'red' },
    { id: '2', name: 'blue', color: 'blue' },
    { id: '3', name: 'green', color: 'green' },
  ];
  const tags = mockTags;
  const syncEnabled = true; // Would come from sync store
  
  // Mock variables for missing functions
  const upgradeModal = { isOpen: false };
  const closeUpgradeModal = () => {};
  const isOverQuota = false;
  
  // Calculate the correct position based on whether this is a child asset or root asset
  const getCalculatedPosition = useCallback(() => {
    if (initialData?.x !== undefined && initialData?.y !== undefined) {
      return { x: initialData.x, y: initialData.y };
    }
    
    // Always center assets in the middle of the visible screen, regardless of nesting level
    const viewportWidth = viewportSize?.width || 800;
    const viewportHeight = viewportSize?.height || 600;
    console.log('🎯 AssetCreationModal: Using screen dimensions:', { viewportWidth, viewportHeight });
    const centerPosition = calculateViewportCenterPosition(viewportWidth, viewportHeight, 200, 150);
    console.log('🎯 AssetCreationModal: Calculated screen center position:', centerPosition);
    return centerPosition;
  }, [initialData, viewportSize]);
  
  // Local form state
  const [formData, setFormData] = useState(() => {
    const calculatedPosition = getCalculatedPosition();
    return {
      name: initialData?.name || 'New Asset',
      type: initialData?.type || 'card' as 'image' | 'document' | 'video' | 'audio' | 'code' | 'card',
      x: calculatedPosition.x,
      y: calculatedPosition.y,
      width: initialData?.width || 200,
      height: initialData?.height || 150,
      description: initialData?.description || '',
      tags: initialData?.tags || [],
      thumbnail: '',
      customFields: initialData?.customFields || [],
      customFieldValues: initialData?.customFieldValues || [],
      viewportDisplaySettings: initialData?.viewportDisplaySettings || {
        name: true,
        description: false,
        thumbnail: true,
        portraitBlur: 0,
      },
    };
  });


  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'checking' | 'allowed' | 'denied'>('idle');

  // Handle generator import data
  useEffect(() => {
    if (generatorImportData) {
      try {
        const parsedAsset = GeneratorParser.parseGeneratorData(generatorImportData);
        setFormData(prev => ({
          ...prev,
          name: parsedAsset.name || prev.name,
          description: parsedAsset.description || prev.description,
          customFields: parsedAsset.customFields || [],
          customFieldValues: parsedAsset.customFieldValues || [],
        }));
      } catch (error) {
        console.error('Error parsing generator import data:', error);
      }
    }
  }, [generatorImportData]);

  // Update position when parentId changes (e.g., when creating child vs root asset)
  useEffect(() => {
    const calculatedPosition = getCalculatedPosition();
    setFormData(prev => ({
      ...prev,
      x: calculatedPosition.x,
      y: calculatedPosition.y,
    }));
  }, [parentId, getCalculatedPosition]);

  const [isCreating, setIsCreating] = useState(false);
  const [showUnsavedChangesDialog, setShowUnsavedChangesDialog] = useState(false);
  const availableTags = Object.values(tags);

  // Log when modal opens
  if (isOpen) {
    console.log('AssetCreationModal: Modal opened');
  }

  const handleCreateAsset = async () => {
    console.log('AssetCreationModal: Create button pressed');
    
    if (!projectId) {
      console.error('No project ID available');
      return;
    }
    
    setIsCreating(true);
    
    try {
      // Create canonical asset structure
      const canonicalAsset = {
        projectId,
        parentId: parentId || undefined,
        layout: {
          x: formData.x,
          y: formData.y,
          width: formData.width,
          height: formData.height,
          zIndex: 0,
        },
        content: {
          title: formData.name,
          description: formData.description,
          customFields: {
            ...formData.customFields,
            // Convert custom field values to proper structure
            ...(formData.customFieldValues || {}),
          },
        },
        style: {
          background: formData.thumbnail ? { imageUrl: formData.thumbnail } : undefined,
          tagColor: formData.tags?.[0], // Use first tag as color
        },
        behavior: {
          renderMode: formData.type,
          viewport: formData.viewportDisplaySettings, // Asset position within parent viewport
        },
        metadata: {
          tags: formData.tags || [],
        },
      };

      // Create asset using new store
      const assetId = await useKanvasStore.getState().createAsset(canonicalAsset);
      
      // Handle file upload if needed
      if (selectedFile && uploadStatus === 'allowed') {
        // File upload will be handled by the blob storage system
        console.log('File upload will be handled by blob storage');
      }

      console.log('AssetCreationModal: Asset created with ID:', assetId);
      
      // Close modal after successful creation
      onClose();
    } catch (error) {
      console.error('AssetCreationModal: Error creating asset:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setUploadStatus('checking');

    // Check if upload is possible
    if (syncEnabled && isAuthenticated && projectId) {
      try {
        // Mock function for now - would check actual quota
        const canUpload = true; // await canUploadToCloud(file);
        setUploadStatus(canUpload ? 'allowed' : 'denied');
      } catch (error) {
        console.error('Error checking upload quota:', error);
        setUploadStatus('denied');
      }
    } else {
      setUploadStatus('idle');
    }

    // Don't convert to base64 - use file object directly
    // R2 upload will handle the file and set cloudPath
    // For preview, we'll use a blob URL in the display component
  };

  const handleClose = () => {
    setSelectedFile(null);
    setUploadStatus('idle');
    
    // Recalculate position for the next time the modal opens
    const resetPosition = getCalculatedPosition();
    
    setFormData({
      name: initialData?.name || 'New Asset',
      type: initialData?.type || 'card' as 'image' | 'document' | 'video' | 'audio' | 'code' | 'card',
      x: resetPosition.x,
      y: resetPosition.y,
      width: initialData?.width || 200,
      height: initialData?.height || 150,
      description: initialData?.description || '',
      tags: initialData?.tags || [],
      thumbnail: '',
      customFields: [] as CustomField[],
      customFieldValues: [] as CustomFieldValue[],
      viewportDisplaySettings: {
        name: true,
        description: false,
        thumbnail: true,
        portraitBlur: 0,
      } as ViewportDisplaySettings,
    });
    onClose();
  };

  const handleImageUpload = async (field: 'thumbnail', event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        // Compress the image to meet database size constraints
        const compressedThumbnail = await compressImageToThumbnail(file);
        setFormData(prev => ({ ...prev, [field]: compressedThumbnail }));
      } catch (error) {
        console.error('Failed to compress thumbnail:', error);
        // Fallback to original method if compression fails
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result as string;
          setFormData(prev => ({ ...prev, [field]: result }));
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleTagToggle = (tagId: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.includes(tagId)
        ? prev.tags.filter(id => id !== tagId)
        : [...prev.tags, tagId]
    }));
  };

  const handleViewportSettingChange = (key: keyof ViewportDisplaySettings, value: boolean | number) => {
    setFormData(prev => ({
      ...prev,
      viewportDisplaySettings: {
        ...prev.viewportDisplaySettings,
        [key]: value
      }
    }));
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto glass cosmic-glow border-glass-border/40">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Create New Asset</DialogTitle>
            <DialogDescription>
              Create a new asset for your world. Fill in the details below to customize your asset.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4 relative">
            {/* Notes Coming Soon - Locked Feature */}
            <div className="absolute top-0 right-0">
              <div className="flex items-center gap-2 p-2 opacity-60">
                <Lock className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Notes coming soon!</span>
              </div>
            </div>

            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground">Basic Information</h3>
              
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
                        className="hidden"
                        id="thumbnail-upload"
                      />
                      <label
                        htmlFor="thumbnail-upload"
                        className="flex flex-col items-center justify-center cursor-pointer hover:text-muted-foreground transition-colors"
                      >
                        <Upload className="w-8 h-8 mb-2" />
                        <span className="text-sm">Click to upload thumbnail</span>
                        <span className="text-xs text-muted-foreground">PNG, JPG, GIF up to 10MB</span>
                      </label>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Custom Fields */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground">Custom Fields</h3>
              <Card className="glass cosmic-glow border-glass-border/40">
                <CardHeader>
                  <CardTitle className="text-lg text-foreground">Custom Fields</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {formData.customFields.length > 0 ? (
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground mb-3">
                        {generatorImportData ? 'Imported fields from generator:' : 'Custom fields:'}
                      </p>
                      {formData.customFields.map((field, index) => (
                        <div key={field.id} className="p-3 border border-glass-border/30 rounded-lg bg-glass/30">
                          <div className="flex items-center justify-between mb-2">
                            <Label className="text-sm font-medium">{field.label}</Label>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={field.displayInViewport}
                                onCheckedChange={(checked) => {
                                  const updatedFields = [...formData.customFields];
                                  updatedFields[index] = { ...field, displayInViewport: checked };
                                  setFormData(prev => ({ ...prev, customFields: updatedFields }));
                                }}
                              />
                              <span className="text-xs text-muted-foreground">Show on canvas</span>
                            </div>
                          </div>
                          <div className="text-sm text-foreground bg-glass/50 p-2 rounded">
                            {formData.customFieldValues.find(fv => fv.fieldId === field.id)?.value || 'No value'}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-sm text-muted-foreground">Custom fields will be available after asset creation.</p>
                      <p className="text-xs text-muted-foreground">You can add custom fields in the Edit modal after creating this asset.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Viewport Display Settings */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground">Viewport Display Settings</h3>
              <Card className="glass cosmic-glow border-glass-border/40">
                <CardHeader>
                  <CardTitle className="text-lg text-foreground flex items-center gap-2">
                    <Settings className="w-5 h-5" />
                    Viewport Display Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-sm text-muted-foreground mb-4">
                    Control which information is shown when this asset appears in a parent viewport.
                  </div>

                  {/* Name Display */}
                  <div className="flex items-center justify-between p-3 rounded-lg border border-glass-border/30 bg-glass/30">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        {formData.viewportDisplaySettings.name ? (
                          <Eye className="w-4 h-4 text-green-400" />
                        ) : (
                          <EyeOff className="w-4 h-4 text-muted-foreground" />
                        )}
                        <Label className="text-sm font-medium">
                          Asset Name
                        </Label>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Show the asset's name in the viewport
                      </div>
                    </div>
                    <Switch
                      checked={formData.viewportDisplaySettings.name}
                      onCheckedChange={(checked) => handleViewportSettingChange('name', checked)}
                    />
                  </div>

                  {/* Description Display */}
                  <div className="flex items-center justify-between p-3 rounded-lg border border-glass-border/30 bg-glass/30">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        {formData.viewportDisplaySettings.description ? (
                          <Eye className="w-4 h-4 text-green-400" />
                        ) : (
                          <EyeOff className="w-4 h-4 text-muted-foreground" />
                        )}
                        <Label className="text-sm font-medium">
                          Description
                        </Label>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Show the asset's description in the viewport
                      </div>
                    </div>
                    <Switch
                      checked={formData.viewportDisplaySettings.description}
                      onCheckedChange={(checked) => handleViewportSettingChange('description', checked)}
                    />
                  </div>

                  {/* Background Display */}
                  <div className="flex items-center justify-between p-3 rounded-lg border border-glass-border/30 bg-glass/30">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        {formData.viewportDisplaySettings.thumbnail === false ? (
                          <Eye className="w-4 h-4 text-green-400" />
                        ) : (
                          <EyeOff className="w-4 h-4 text-muted-foreground" />
                        )}
                        <Label className="text-sm font-medium">
                          Background
                        </Label>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Show background image through transparent asset
                      </div>
                    </div>
                    <Switch
                      checked={formData.viewportDisplaySettings.thumbnail === false}
                      onCheckedChange={(checked) => handleViewportSettingChange('thumbnail', !checked)}
                    />
                  </div>

                  {/* Portrait Blur */}
                  <div className="p-3 rounded-lg border border-glass-border/30 bg-glass/30">
                    <div className="flex items-center gap-3 mb-3">
                      <Droplets className="w-4 h-4 text-primary" />
                      <Label className="text-sm font-medium">
                        Portrait Blur
                      </Label>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Blur Amount</span>
                        <span className="text-xs text-muted-foreground">
                          {Math.round(formData.viewportDisplaySettings.portraitBlur * 100)}%
                        </span>
                      </div>
                      <Slider
                        value={[formData.viewportDisplaySettings.portraitBlur]}
                        onValueChange={([value]) => handleViewportSettingChange('portraitBlur', value)}
                        max={1}
                        min={0}
                        step={0.1}
                        className="w-full"
                      />
                      <div className="text-xs text-muted-foreground">
                        Adjust blur for portrait background (0 = clear, 1 = full blur)
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button onClick={handleCreateAsset} disabled={!formData.name.trim() || isCreating}>
              {isCreating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Creating...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Create
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upgrade Modal */}
      <UpgradePromptModal
        isOpen={upgradeModal.isOpen}
        onClose={closeUpgradeModal}
        title={isOverQuota ? "Storage Quota Exceeded" : "Approaching Storage Limit"}
        message={isOverQuota 
          ? `You've exceeded your storage quota. Upgrade to continue uploading files.`
          : `You're approaching your storage limit. Upgrade to get more space.`
        }
        action="Upgrade Now"
        type="plan_limit"
        onAction={() => {
          // TODO: Navigate to upgrade page or open payment flow
          console.log('Navigate to upgrade flow');
        }}
      />
    </>
  );
}
