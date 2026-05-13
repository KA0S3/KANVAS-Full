import { useState } from 'react';
import { CustomField, CustomFieldValue, CustomFieldType } from '@/types/extendedAsset';
import { useKanvasStore } from '@/stores/kanvasStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, Upload, X, Eye, EyeOff, Globe, Lock } from 'lucide-react';

interface CustomFieldsManagerProps {
  assetId: string;
  fields: CustomField[];
  values: CustomFieldValue[];
}

export function CustomFieldsManager({ assetId, fields, values }: CustomFieldsManagerProps) {
  const { getAsset, updateAsset } = useKanvasStore();
  
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<CustomFieldType>('text');
  const [isAddingField, setIsAddingField] = useState(false);
  const [isAddingGlobalField, setIsAddingGlobalField] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Safety check - ensure fields and values are arrays
  const safeFields = Array.isArray(fields) ? fields : [];
  const safeValues = Array.isArray(values) ? values : [];

  const getFieldValue = (fieldId: string): string => {
    const fieldValue = safeValues.find(v => v.fieldId === fieldId);
    return fieldValue?.value || '';
  };

  const persistCustomFields = (nextFields: CustomField[], nextValues: CustomFieldValue[]) => {
    const asset = getAsset(assetId);
    if (!asset) return;

    updateAsset(assetId, {
      content: {
        ...asset.content,
        customFields: {
          ...asset.content.customFields,
          customFields: nextFields,
          customFieldValues: nextValues,
        },
      },
    });
  };

  const handleAddField = (isGlobal: boolean = false) => {
    try {
      setError(null);
      if (!newFieldName.trim()) return;
      
      const existingField = safeFields.find(f => f.label === newFieldName.trim());
      if (!existingField) {
        persistCustomFields([
          ...safeFields,
          {
            id: `field_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            label: newFieldName.trim(),
            type: newFieldType,
            displayInViewport: false,
            isGlobal,
          },
        ], safeValues);
      }
      
      setNewFieldName('');
      setNewFieldType('text');
      setIsAddingField(false);
      setIsAddingGlobalField(false);
    } catch (err) {
      setError('Failed to add field. Please try again.');
      console.error('Error adding custom field:', err);
    }
  };

  const handleRemoveGlobalField = (fieldId: string) => {
    handleRemoveField(fieldId);
  };

  const handleRemoveField = (fieldId: string) => {
    persistCustomFields(
      safeFields.filter(field => field.id !== fieldId),
      safeValues.filter(value => value.fieldId !== fieldId)
    );
  };

  const handleFieldLabelChange = (fieldId: string, newLabel: string) => {
    persistCustomFields(
      safeFields.map(field => field.id === fieldId ? { ...field, label: newLabel } : field),
      safeValues
    );
  };

  const handleFieldValueChange = (fieldId: string, value: string) => {
    const existingValue = safeValues.find(item => item.fieldId === fieldId);
    const nextValues = existingValue
      ? safeValues.map(item => item.fieldId === fieldId ? { ...item, value } : item)
      : [...safeValues, { fieldId, value }];

    persistCustomFields(safeFields, nextValues);
  };

  const handleImageUpload = (fieldId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        handleFieldValueChange(fieldId, result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = (fieldId: string) => {
    handleFieldValueChange(fieldId, '');
  };

  return (
    <Card className="glass cosmic-glow border-glass-border/40">
      <CardHeader>
        <CardTitle className="text-lg text-foreground">Custom Fields</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Error display */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/30 text-red-300 px-3 py-2 rounded-md text-sm">
            {error}
          </div>
        )}
        
        {/* Existing fields */}
        {safeFields.map((field) => {
          const value = getFieldValue(field.id);
          const isGlobalField = field.isGlobal || false;
          
          return (
            <div key={field.id} className="space-y-2 p-3 border border-glass-border/30 rounded-md bg-glass/30">
              <div className="flex items-center gap-2">
                {isGlobalField && <Globe className="w-4 h-4 text-muted-foreground" />}
                <Input
                  value={field.label}
                  onChange={(e) => handleFieldLabelChange(field.id, e.target.value)}
                  placeholder="Field name"
                  className="flex-1 bg-glass/50 border-glass-border/40"
                  disabled={isGlobalField}
                />
                <Select
                  value={field.type}
                  onValueChange={(value: CustomFieldType) => 
                    persistCustomFields(
                      safeFields.map(item => item.id === field.id ? { ...item, type: value } : item),
                      safeValues
                    )
                  }
                  disabled={isGlobalField}
                >
                  <SelectTrigger className="w-24 bg-glass/50 border-glass-border/40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="image">Image</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1">
                  <Switch
                    checked={field.displayInViewport}
                    onCheckedChange={(checked) => 
                      persistCustomFields(
                        safeFields.map(item => item.id === field.id ? { ...item, displayInViewport: checked } : item),
                        safeValues
                      )
                    }
                  />
                  <Label className="text-xs whitespace-nowrap text-card-foreground">
                    {field.displayInViewport ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  </Label>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRemoveField(field.id)}
                  disabled={isGlobalField}
                  className="bg-glass/30 border-glass-border/40 hover:bg-glass/50"
                >
                  {isGlobalField ? <Lock className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                </Button>
              </div>
              
              {/* Field value input */}
              <div className="space-y-2">
                {field.type === 'text' ? (
                  <Textarea
                    value={value}
                    onChange={(e) => handleFieldValueChange(field.id, e.target.value)}
                    placeholder={`Enter ${field.label.toLowerCase()}`}
                    className="min-h-[80px] resize-none bg-glass/50 border-glass-border/40"
                  />
                ) : (
                  <div>
                    {value ? (
                      <div className="relative group">
                        <img
                          src={value}
                          alt={`${field.label} preview`}
                          className="w-full h-32 object-cover rounded-md border border-glass-border/40"
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleRemoveImage(field.id)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="border-2 border-dashed border-glass-border/40 rounded-md p-4 bg-glass/20">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleImageUpload(field.id, e)}
                          className="hidden"
                          id={`image-upload-${field.id}`}
                        />
                        <label
                          htmlFor={`image-upload-${field.id}`}
                          className="flex flex-col items-center justify-center cursor-pointer hover:text-muted-foreground transition-colors"
                        >
                          <Upload className="w-8 h-8 mb-2" />
                          <span className="text-sm">Click to upload image</span>
                          <span className="text-xs text-muted-foreground">PNG, JPG, GIF up to 10MB</span>
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Add new field */}
        {!isAddingField && !isAddingGlobalField ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setIsAddingField(true)}
              className="flex-1 bg-glass/30 border-glass-border/40 hover:bg-glass/50"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Local Field
            </Button>
            <Button
              variant="outline"
              onClick={() => setIsAddingGlobalField(true)}
              className="flex-1 bg-glass/30 border-glass-border/40 hover:bg-glass/50"
            >
              <Globe className="w-4 h-4 mr-2" />
              Add Global Field
            </Button>
          </div>
        ) : isAddingField ? (
          <div className="space-y-2 p-3 border border-glass-border/30 rounded-md bg-glass/30">
            <div className="flex items-center gap-2">
              <Input
                value={newFieldName}
                onChange={(e) => setNewFieldName(e.target.value)}
                placeholder="Field name"
                className="flex-1 bg-glass/50 border-glass-border/40"
                autoFocus
              />
              <Select
                value={newFieldType}
                onValueChange={(value: CustomFieldType) => setNewFieldType(value)}
              >
                <SelectTrigger className="w-24 bg-glass/50 border-glass-border/40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="image">Image</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => handleAddField(false)}
                disabled={!newFieldName.trim()}
                className="bg-primary/80 hover:bg-primary"
              >
                Add
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setIsAddingField(false);
                  setNewFieldName('');
                  setNewFieldType('text');
                }}
                className="bg-glass/30 border-glass-border/40 hover:bg-glass/50"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2 p-3 border border-glass-border/30 rounded-md bg-glass/30">
            <div className="flex items-center gap-2">
              <Input
                value={newFieldName}
                onChange={(e) => setNewFieldName(e.target.value)}
                placeholder="Global field name"
                className="flex-1 bg-glass/50 border-glass-border/40"
                autoFocus
              />
              <Select
                value={newFieldType}
                onValueChange={(value: CustomFieldType) => setNewFieldType(value)}
              >
                <SelectTrigger className="w-24 bg-glass/50 border-glass-border/40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="image">Image</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => handleAddField(true)}
                disabled={!newFieldName.trim()}
                className="bg-primary/80 hover:bg-primary"
              >
                Add Global
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setIsAddingGlobalField(false);
                  setNewFieldName('');
                  setNewFieldType('text');
                }}
                className="bg-glass/30 border-glass-border/40 hover:bg-glass/50"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {safeFields.length === 0 && !isAddingField && (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">No custom fields yet.</p>
            <p className="text-xs text-muted-foreground">Click "Add Custom Field" to get started.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
