import { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Save, Upload, Settings, Droplets, Eye, EyeOff, Globe, Lock, Plus, Trash2, Cloud, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { useAssetCreation } from '@/hooks/useAssetCreation';
import { useTagStore } from '@/stores/tagStore';
import { useAuthStore } from '@/stores/authStore';
import { useKanvasStore } from '@/stores/kanvasStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { calculateViewportCenterPosition, calculateChildAssetCenterPosition } from '@/utils/coordinateUtils';
import type { Asset } from '@/types/Asset';
import type { CustomField, CustomFieldValue, ViewportDisplaySettings } from '@/types/extendedAsset';
import { GeneratorParser, EXAMPLE_GENERATOR_DATA } from '@/services/generatorParser';

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
    customFields?: CustomField[];
    customFieldValues?: CustomFieldValue[];
    viewportDisplaySettings?: ViewportDisplaySettings;
  };
  parentId?: string;
  generatorImportData?: any;
  projectId?: string;
  viewportSize?: { width: number; height: number };
}

export function AssetCreationModalImproved({ isOpen, onClose, initialData, parentId, generatorImportData, projectId, viewportSize }: AssetCreationModalProps) {
  const { createNewAsset, canUploadToCloud } = useAssetCreation();
  const { tags } = useTagStore();
  const { isAuthenticated, plan } = useAuthStore();
  const { getProjectAssets } = useKanvasStore();
  const assets = projectId ? getProjectAssets(projectId) : [];
  
  // Collapsible sections state
  const [expandedSections, setExpandedSections] = useState({
    advanced: false,
    customFields: false,
    viewportSettings: false,
  });
  
  // Memoize the calculated position to prevent infinite loops
  const calculatedPosition = useMemo(() => {
    if (initialData?.x !== undefined && initialData?.y !== undefined) {
      return { x: initialData.x, y: initialData.y };
    }
    
    // Always center assets in the middle of the visible screen, regardless of nesting level
    const viewportWidth = viewportSize?.width || 800;
    const viewportHeight = viewportSize?.height || 600;
    return calculateViewportCenterPosition(viewportWidth, viewportHeight, 200, 150);
  }, [initialData?.x, initialData?.y, viewportSize?.width, viewportSize?.height]);
  
  // Local form state
  const [formData, setFormData] = useState(() => ({
    name: initialData?.name || 'New Asset',
    type: initialData?.type || 'other' as 'image' | 'document' | 'video' | 'audio' | 'code' | 'other',
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
      description: true,
      thumbnail: true,
      portraitBlur: 0,
    },
  }));

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

  // Update position only when modal opens or parentId changes (not on every render)
  useEffect(() => {
    if (isOpen) {
      setFormData(prev => ({
        ...prev,
        x: calculatedPosition.x,
        y: calculatedPosition.y,
      }));
    }
  }, [isOpen, parentId, calculatedPosition.x, calculatedPosition.y]);

  const [isCreating, setIsCreating] = useState(false);
  const [showUnsavedChangesDialog, setShowUnsavedChangesDialog] = useState(false);
  const availableTags = Object.values(tags);

  const handleCreateAsset = async () => {
    setIsCreating(true);
    
    try {
      // Validate required fields
      if (!formData.name || !formData.name.trim()) {
        console.error('Asset name is required');
        return;
      }
      
      if (!projectId) {
        console.error('No project ID available for asset creation');
        return;
      }

      console.log('Creating asset with:', {
        name: formData.name,
        projectId,
        x: formData.x,
        y: formData.y,
        width: formData.width,
        height: formData.height,
      });

      const assetId = await createNewAsset({
        projectId: projectId,  // Ensure projectId is passed correctly
        parentId: parentId,
        layout: {
          x: formData.x,
          y: formData.y,
          width: formData.width,
          height: formData.height,
          zIndex: 0
        },
        content: {
          title: formData.name,
          description: formData.description,
          imageUrl: formData.thumbnail || undefined,
          text: '',
          customFields: {
            type: formData.type,
            tags: formData.tags,
            thumbnail: formData.thumbnail,
            customFields: formData.customFields,
            customFieldValues: formData.customFieldValues,
            viewportDisplaySettings: formData.viewportDisplaySettings
          }
        },
        style: {},
        behavior: {
          renderMode: formData.type,
        },
        metadata: {
          tags: formData.tags,
        },
      }, { 
        fromUserClick: true,
        file: selectedFile || undefined,
        skipCloud: uploadStatus === 'denied'
      });

      console.log('Asset created successfully with ID:', assetId);
      
      // Close modal after successful creation
      onClose();
    } catch (error) {
      console.error('Error creating asset:', error);
      // Don't silently fail - ensure error is visible
      if (error instanceof Error) {
        alert(`Failed to create asset: ${error.message}`);
      }
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
    if (isAuthenticated && projectId) {
      try {
        const canUpload = await canUploadToCloud(file);
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
    
    setFormData({
      name: initialData?.name || 'New Asset',
      type: initialData?.type || 'other' as 'image' | 'document' | 'video' | 'audio' | 'code' | 'other',
      x: calculatedPosition.x,
      y: calculatedPosition.y,
      width: initialData?.width || 200,
      height: initialData?.height || 150,
      description: initialData?.description || '',
      tags: initialData?.tags || [],
      thumbnail: '',
      customFields: [] as CustomField[],
      customFieldValues: [] as CustomFieldValue[],
      viewportDisplaySettings: {
        name: true,
        description: true,
        thumbnail: true,
        portraitBlur: 0,
      } as ViewportDisplaySettings,
    });
    onClose();
  };

  const handleImageUpload = (field: 'thumbnail', event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setFormData(prev => ({ ...prev, [field]: result }));
      };
      reader.readAsDataURL(file);
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

  const toggleSection = (section: keyof typeof expandedSections) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const SectionHeader = ({ title, section, icon }: { title: string; section: keyof typeof expandedSections; icon: React.ReactNode }) => (
    <button
      type="button"
      onClick={toggleSection(section)}
      className="w-full flex items-center justify-between p-3 rounded-lg border border-glass-border/30 bg-glass/20 hover:bg-glass/30 transition-colors"
    >
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      </div>
      {expandedSections[section] ? (
        <ChevronDown className="w-4 h-4 text-muted-foreground" />
      ) : (
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      )}
    </button>
  );

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent 
          className="max-w-5xl max-h-[90vh] overflow-y-auto glass cosmic-glow border-glass-border/40"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Create New Asset</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 py-4 relative">
            {/* Notes Coming Soon - Locked Feature */}
            <div className="absolute top-0 right-0 z-10">
              <div className="flex items-center gap-2 p-2 opacity-60">
                <Lock className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Notes coming soon!</span>
              </div>
            </div>

            {/* Main 2-Column Layout for Essential Fields */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column - Basic Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <Plus className="w-5 h-5 text-primary" />
                  Basic Information
                </h3>
                
                <div className="space-y-4">
                  {/* Name */}
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
                  
                                    
                  {/* Description */}
                  <div className="space-y-2">
                    <Label htmlFor="asset-description">Description</Label>
                    <Textarea
                      id="asset-description"
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Enter asset description..."
                      rows={4}
                      className="bg-glass/50 border-glass-border/40"
                    />
                  </div>
                  
                  {/* Tags */}
                  <div className="space-y-2">
                    <Label htmlFor="asset-tags">Tags</Label>
                    <div className="flex flex-wrap gap-2 p-3 border border-glass-border/40 rounded-md bg-glass/30 min-h-[44px]">
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
                </div>
              </div>

              {/* Right Column - Images */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <Upload className="w-5 h-5 text-primary" />
                  Images
                </h3>
                
                <div className="space-y-4">
                  {/* Thumbnail */}
                  <div className="space-y-2">
                    <Label htmlFor="thumbnail">Thumbnail</Label>
                    {formData.thumbnail ? (
                      <div className="relative group">
                        <img
                          src={formData.thumbnail}
                          alt="Thumbnail preview"
                          className="w-full h-40 object-cover rounded-md border border-glass-border/40"
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
                      <div className="border-2 border-dashed border-glass-border/40 rounded-md p-6 bg-glass/20">
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
            </div>

            {/* Collapsible Advanced Sections at Bottom */}
            <div className="space-y-3 border-t border-glass-border/20 pt-6">
              
              {/* Custom Fields */}
              <div className="space-y-3">
                <SectionHeader 
                  title="Custom Fields" 
                  section="customFields" 
                  icon={<Plus className="w-4 h-4 text-primary" />}
                />
                
                {expandedSections.customFields && (
                  <Card className="glass cosmic-glow border-glass-border/40">
                    <CardContent className="p-4">
                      {formData.customFields.length > 0 ? (
                        <div className="space-y-3">
                          <p className="text-sm text-muted-foreground mb-3">
                            {generatorImportData ? 'Imported fields from generator:' : 'Custom fields:'}
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
                                    <span className="text-xs text-muted-foreground">Show</span>
                                  </div>
                                </div>
                                <div className="text-sm text-foreground bg-glass/50 p-2 rounded">
                                  {formData.customFieldValues.find(fv => fv.fieldId === field.id)?.value || 'No value'}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <p className="text-sm text-muted-foreground">Custom fields will be available after asset creation.</p>
                          <p className="text-xs text-muted-foreground">You can add custom fields in the Edit modal after creating this asset.</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Viewport Display Settings */}
              <div className="space-y-3">
                <SectionHeader 
                  title="Viewport Display Settings" 
                  section="viewportSettings" 
                  icon={<Eye className="w-4 h-4 text-primary" />}
                />
                
                {expandedSections.viewportSettings && (
                  <Card className="glass cosmic-glow border-glass-border/40">
                    <CardContent className="p-4">
                      <div className="text-sm text-muted-foreground mb-4">
                        Control which information is shown when this asset appears in a parent viewport.
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Name Display */}
                        <div className="flex items-center justify-between p-3 rounded-lg border border-glass-border/30 bg-glass/30">
                          <div className="flex items-center gap-2">
                            {formData.viewportDisplaySettings.name ? (
                              <Eye className="w-4 h-4 text-green-400" />
                            ) : (
                              <EyeOff className="w-4 h-4 text-muted-foreground" />
                            )}
                            <Label className="text-sm font-medium">Asset Name</Label>
                          </div>
                          <Switch
                            checked={formData.viewportDisplaySettings.name}
                            onCheckedChange={(checked) => handleViewportSettingChange('name', checked)}
                          />
                        </div>

                        {/* Description Display */}
                        <div className="flex items-center justify-between p-3 rounded-lg border border-glass-border/30 bg-glass/30">
                          <div className="flex items-center gap-2">
                            {formData.viewportDisplaySettings.description ? (
                              <Eye className="w-4 h-4 text-green-400" />
                            ) : (
                              <EyeOff className="w-4 h-4 text-muted-foreground" />
                            )}
                            <Label className="text-sm font-medium">Description</Label>
                          </div>
                          <Switch
                            checked={formData.viewportDisplaySettings.description}
                            onCheckedChange={(checked) => handleViewportSettingChange('description', checked)}
                          />
                        </div>

                        {/* Background Display */}
                        <div className="flex items-center justify-between p-3 rounded-lg border border-glass-border/30 bg-glass/30">
                          <div className="flex items-center gap-2">
                            {formData.viewportDisplaySettings.thumbnail === false ? (
                              <Eye className="w-4 h-4 text-green-400" />
                            ) : (
                              <EyeOff className="w-4 h-4 text-muted-foreground" />
                            )}
                            <Label className="text-sm font-medium">Background</Label>
                          </div>
                          <Switch
                            checked={formData.viewportDisplaySettings.thumbnail === false}
                            onCheckedChange={(checked) => handleViewportSettingChange('thumbnail', !checked)}
                          />
                        </div>

                        {/* Portrait Blur */}
                        <div className="p-3 rounded-lg border border-glass-border/30 bg-glass/30">
                          <div className="flex items-center gap-2 mb-3">
                            <Droplets className="w-4 h-4 text-primary" />
                            <Label className="text-sm font-medium">Portrait Blur</Label>
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
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
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
    </>
  );
}
