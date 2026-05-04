import { useState, useEffect } from 'react';
import { X, Save, Upload, ChevronDown, ChevronRight } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAssetStore } from '@/stores/assetStore';
import { useTagStore } from '@/stores/tagStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { CustomFieldsManager } from './CustomFieldsManager';
import { ViewportDisplaySettingsManager } from './ViewportDisplaySettingsManager';
import { BackgroundMapEditor } from './BackgroundMapEditor';
import type { Asset } from '@/components/AssetItem';
import type { CustomField, CustomFieldValue, ViewportDisplaySettings } from '@/types/extendedAsset';
import { assetSchema, type AssetFormData } from '@/utils/validationSchemas';

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

export function AssetEditModalImproved({ isOpen, onClose, assetId, isNewAsset = false, viewportSize, onCreateAsset, isCreating = false, initialData }: AssetEditModalProps) {
  const { getCurrentBookAssets, updateAsset, deleteAsset } = useAssetStore();
  const { tags, addTagToAsset, removeTagFromAsset } = useTagStore();
  
  const assets = getCurrentBookAssets();
  const asset = assetId ? assets[assetId] : null;
  
  // Collapsible sections state
  const [expandedSections, setExpandedSections] = useState({
    advanced: false,
    customFields: false,
    viewportSettings: false,
    background: false,
  });
  
  const form = useForm<AssetFormData>({
    resolver: zodResolver(assetSchema),
    defaultValues: {
      name: '',
      description: '',
      type: 'other' as const,
      x: 0,
      y: 0,
      width: 200,
      height: 150,
      tags: [],
      thumbnail: '',
      background: '',
      content: '',
      customFields: [],
      customFieldValues: []
    }
  });

  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<CustomFieldValue[]>([]);
  const [viewportDisplaySettings, setViewportDisplaySettings] = useState<ViewportDisplaySettings>({
    name: true,
    description: false,
    thumbnail: true,
    portraitBlur: 0,
  });
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
      form.reset({
        name: asset.name || '',
        description: asset.description || '',
        type: asset.type || 'other',
        x: asset.x || 0,
        y: asset.y || 0,
        width: asset.width || 200,
        height: asset.height || 150,
        tags: asset.tags || [],
        thumbnail: asset.thumbnail || '',
        background: asset.background || '',
        content: asset.content || '',
        customFields: asset.customFields || [],
        customFieldValues: asset.customFieldValues || []
      });
      setCustomFields(asset.customFields || []);
      setCustomFieldValues(asset.customFieldValues || []);
      setViewportDisplaySettings(asset.viewportDisplaySettings || {
        name: true,
        description: true,
        thumbnail: true,
        portraitBlur: 0,
      });
    } else if (isNewAsset) {
      // Initialize with initialData for new asset
      console.log('📝 AssetEditModal: Setting form data from initialData for new asset');
      form.reset({
        name: initialData?.name || '',
        description: initialData?.description || '',
        type: (initialData?.type as any) || 'other',
        x: initialData?.x || 0,
        y: initialData?.y || 0,
        width: initialData?.width || 200,
        height: initialData?.height || 150,
        tags: initialData?.tags || [],
        thumbnail: '',
        background: '',
        content: '',
        customFields: initialData?.customFields || [],
        customFieldValues: initialData?.customFieldValues || []
      });
      setCustomFields(initialData?.customFields || []);
      setCustomFieldValues(initialData?.customFieldValues || []);
      setViewportDisplaySettings({
        name: true,
        description: true,
        thumbnail: true,
        portraitBlur: 0,
      });
    }
  }, [asset, isNewAsset, initialData, form]);

  // Refresh asset data when background is saved
  useEffect(() => {
    if (refreshTrigger > 0 && asset) {
      // Re-sync form data with updated asset data
      form.reset({
        name: asset.name || '',
        description: asset.description || '',
        type: asset.type || 'other',
        x: asset.x || 0,
        y: asset.y || 0,
        width: asset.width || 200,
        height: asset.height || 150,
        tags: asset.tags || [],
        thumbnail: asset.thumbnail || '',
        background: asset.background || '',
        content: asset.content || '',
        customFields: asset.customFields || [],
        customFieldValues: asset.customFieldValues || []
      });
      setCustomFields(asset.customFields || []);
      setCustomFieldValues(asset.customFieldValues || []);
      setViewportDisplaySettings(asset.viewportDisplaySettings || {
        name: true,
        description: true,
        thumbnail: true,
        portraitBlur: 0,
      });
    }
  }, [refreshTrigger, asset, form]);

  // Check if there are unsaved changes
  const hasUnsavedChanges = () => {
    const formValues = form.getValues();
    
    if (isNewAsset) {
      // For new assets, check if any field has been filled
      return formValues.name.trim() || 
             formValues.description.trim() || 
             formValues.thumbnail || 
             formValues.tags.length > 0 ||
             customFields.length > 0 ||
             customFieldValues.length > 0;
    }
    
    // For existing assets, compare with original data
    if (!asset) return false;
    
    return formValues.name !== (asset.name || '') ||
           formValues.description !== (asset.description || '') ||
           formValues.thumbnail !== (asset.thumbnail || '') ||
           formValues.width !== (asset.width || 200) ||
           formValues.height !== (asset.height || 150) ||
           formValues.x !== (asset.x || 0) ||
           formValues.y !== (asset.y || 0) ||
           JSON.stringify(formValues.tags.sort()) !== JSON.stringify((asset.tags || []).sort()) ||
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
      
      // Validate form before saving
      form.handleSubmit((data) => {
        console.log('💾 AssetEditModal: Validated form data:', data);
        
        const assetData = {
          ...data,
          customFields,
          customFieldValues,
          viewportDisplaySettings,
        };

        if (isNewAsset || !asset) {
          // Create new asset
          if (onCreateAsset) {
            const creationOptions = {
              name: data.name,
              description: data.description,
              type: data.type,
              x: data.x,
              y: data.y,
              width: data.width,
              height: data.height,
              customFields,
              customFieldValues,
              tags: data.tags,
            };
            
            console.log('💾 AssetEditModal: Calling onCreateAsset with options:', creationOptions);
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
      })();
    } catch (error) {
      console.error('Failed to save asset:', error);
    }
  };

  const handleImageUpload = (field: 'thumbnail', event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        form.setValue(field, result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleTagToggle = (tagId: string) => {
    const currentTags = form.getValues('tags') || [];
    const isCurrentlySelected = currentTags.includes(tagId);
    
    // Update form state immediately
    const newTags = isCurrentlySelected
      ? currentTags.filter(id => id !== tagId)
      : [...currentTags, tagId];
    
    form.setValue('tags', newTags);
    
    // For existing assets, also update tag store immediately for visual feedback
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

  const availableTags = Object.values(tags);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && handleCloseAttempt()}>
      <DialogContent 
        className="max-w-5xl max-h-[90vh] overflow-y-auto glass cosmic-glow border-glass-border/40"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            {isNewAsset ? 'Create New Asset' : 'Edit Asset'}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Main 2-Column Layout for Essential Fields */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column - Basic Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Save className="w-5 h-5 text-primary" />
                Basic Information
              </h3>
              
              <Form {...form}>
                <div className="space-y-4">
                  {/* Name */}
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel htmlFor="asset-name">Name *</FormLabel>
                        <FormControl>
                          <Input
                            id="asset-name"
                            placeholder="Enter asset name..."
                            className="bg-glass/50 border-glass-border/40"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {/* Description */}
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel htmlFor="asset-description">Description</FormLabel>
                        <FormControl>
                          <Textarea
                            id="asset-description"
                            placeholder="Enter asset description..."
                            rows={4}
                            className="bg-glass/50 border-glass-border/40"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {/* Tags */}
                  <div className="space-y-2">
                    <Label htmlFor="asset-tags">Tags</Label>
                    <div className="flex flex-wrap gap-2 p-3 border border-glass-border/40 rounded-md bg-glass/30 min-h-[44px]">
                      {availableTags.map((tag) => {
                        // Ensure tag has a valid color, fallback to gray if not
                        const tagColor = tag.color && tag.color.trim() !== '' ? tag.color : '#6b7280';
                        const currentTags = form.getValues('tags') || [];
                        const isSelected = currentTags.includes(tag.id);
                        
                        return (
                          <Badge
                            key={tag.id}
                            variant={isSelected ? "default" : "outline"}
                            className="cursor-pointer"
                            style={{ 
                              backgroundColor: isSelected ? tagColor : 'transparent',
                              borderColor: tagColor,
                              color: isSelected ? 'white' : tagColor,
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
              </Form>
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
                  {form.watch('thumbnail') ? (
                    <div className="relative group">
                      <img
                        src={form.watch('thumbnail')}
                        alt="Thumbnail preview"
                        className="w-full h-40 object-cover rounded-md border border-glass-border/40"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => form.setValue('thumbnail', '')}
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
            {asset && (
              <div className="space-y-3">
                <SectionHeader 
                  title="Custom Fields" 
                  section="customFields" 
                  icon={<Save className="w-4 h-4 text-primary" />}
                />
                
                {expandedSections.customFields && (
                  <div className="p-4 border border-glass-border/30 rounded-lg bg-glass/10">
                    <CustomFieldsManager
                      assetId={asset.id}
                      fields={customFields}
                      values={customFieldValues}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Viewport Display Settings */}
            {asset && (
              <div className="space-y-3">
                <SectionHeader 
                  title="Viewport Display Settings" 
                  section="viewportSettings" 
                  icon={<Save className="w-4 h-4 text-primary" />}
                />
                
                {expandedSections.viewportSettings && (
                  <div className="p-4 border border-glass-border/30 rounded-lg bg-glass/10">
                    <ViewportDisplaySettingsManager
                      assetId={asset.id}
                      settings={viewportDisplaySettings}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Background Map Settings */}
            {asset && (
              <div className="space-y-3">
                <SectionHeader 
                  title="Background Map" 
                  section="background" 
                  icon={<Upload className="w-4 h-4 text-primary" />}
                />
                
                {expandedSections.background && (
                  <div className="p-4 border border-glass-border/30 rounded-lg bg-glass/10">
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
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCloseAttempt}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!form.watch('name')?.trim() || isCreating}>
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
