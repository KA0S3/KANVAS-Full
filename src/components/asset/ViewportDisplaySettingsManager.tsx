import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { ViewportDisplaySettings } from '@/types/extendedAsset';
import { useKanvasStore } from '@/stores/kanvasStore';
import { Eye, EyeOff, Settings, Droplets } from 'lucide-react';

interface ViewportDisplaySettingsManagerProps {
  assetId: string;
  settings: ViewportDisplaySettings;
}

export function ViewportDisplaySettingsManager({ 
  assetId, 
  settings 
}: ViewportDisplaySettingsManagerProps) {
  const { getAsset, updateAsset } = useKanvasStore();

  const handleSettingChange = (key: keyof ViewportDisplaySettings, value: boolean | number) => {
    const asset = getAsset(assetId);
    if (!asset) return;

    const currentSettings = asset.content.customFields?.viewportDisplaySettings || settings;
    updateAsset(assetId, {
      content: {
        ...asset.content,
        customFields: {
          ...asset.content.customFields,
          viewportDisplaySettings: {
            ...currentSettings,
            [key]: value,
          },
        },
      },
    });
  };

  return (
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
              {settings.name ? (
                <Eye className="w-4 h-4 text-green-400" />
              ) : (
                <EyeOff className="w-4 h-4 text-muted-foreground" />
              )}
              <Label htmlFor="name-display" className="text-sm font-medium">
                Asset Name
              </Label>
            </div>
            <div className="text-xs text-muted-foreground">
              Show the asset's name in the viewport
            </div>
          </div>
          <Switch
            id="name-display"
            checked={settings.name}
            onCheckedChange={(checked) => handleSettingChange('name', checked)}
          />
        </div>

        {/* Description Display */}
        <div className="flex items-center justify-between p-3 rounded-lg border border-glass-border/30 bg-glass/30">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {settings.description ? (
                <Eye className="w-4 h-4 text-green-400" />
              ) : (
                <EyeOff className="w-4 h-4 text-muted-foreground" />
              )}
              <Label htmlFor="description-display" className="text-sm font-medium">
                Description
              </Label>
            </div>
            <div className="text-xs text-muted-foreground">
              Show the asset's description in the viewport
            </div>
          </div>
          <Switch
            id="description-display"
            checked={settings.description}
            onCheckedChange={(checked) => handleSettingChange('description', checked)}
          />
        </div>

        {/* Background Display */}
        <div className="flex items-center justify-between p-3 rounded-lg border border-glass-border/30 bg-glass/30">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {settings.thumbnail === false ? (
                <Eye className="w-4 h-4 text-green-400" />
              ) : (
                <EyeOff className="w-4 h-4 text-muted-foreground" />
              )}
              <Label htmlFor="background-display" className="text-sm font-medium">
                Background
              </Label>
            </div>
            <div className="text-xs text-muted-foreground">
              Show background image through transparent asset
            </div>
          </div>
          <Switch
            id="background-display"
            checked={settings.thumbnail === false}
            onCheckedChange={(checked) => handleSettingChange('thumbnail', !checked)}
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
                {Math.round(settings.portraitBlur * 100)}%
              </span>
            </div>
            <Slider
              value={[settings.portraitBlur]}
              onValueChange={([value]) => handleSettingChange('portraitBlur', value)}
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

        {/* Custom Fields Preview */}
        <div className="mt-6 p-3 rounded-lg border border-glass-border/30 bg-glass/20">
          <div className="text-sm font-medium mb-2">Custom Fields</div>
          <div className="text-xs text-muted-foreground">
            Custom fields can be shown/hidden individually in the Custom Fields Manager above.
            Look for the eye icon next to each field.
          </div>
        </div>

        {/* Preview Section */}
        <div className="mt-6 p-4 rounded-lg border border-glass-border/30 bg-glass/20">
          <div className="text-sm font-medium mb-3">Preview</div>
          <div className="text-xs text-muted-foreground space-y-1">
            <div>• Name: {settings.name ? 'Visible' : 'Hidden'}</div>
            <div>• Description: {settings.description ? 'Visible' : 'Hidden'}</div>
            <div>• Background: {settings.thumbnail === false ? 'On' : 'Off'}</div>
            <div>• Portrait Blur: {Math.round(settings.portraitBlur * 100)}%</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
