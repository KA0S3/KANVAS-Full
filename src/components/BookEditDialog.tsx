import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Type, Palette, Settings, Loader2 } from "lucide-react";
import { useBookStore } from "@/stores/bookStoreSimple";
import { useThemeStore } from "@/stores/themeStore";
import { useAuthStore } from "@/stores/authStore";
import LeatherColorPicker from "./books/LeatherColorPicker";
import type { LeatherColorPreset } from "@/types/book";
import type { Book } from "@/types/book";
import { uploadFile } from "@/services/ProjectService";

interface BookEditDialogProps {
  book: Book | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBookUpdated?: (book: Book) => void;
}

const BookEditDialog = ({ book, open, onOpenChange, onBookUpdated }: BookEditDialogProps) => {
  const { theme } = useThemeStore();
  const { updateBook, leatherPresets } = useBookStore();
  const [title, setTitle] = useState('');
  const [subheading, setSubheading] = useState('');
  const [description, setDescription] = useState('');
  const [selectedColor, setSelectedColor] = useState('#8B4513');
  const [isLeatherMode, setIsLeatherMode] = useState(true);
  const [selectedLeatherColor, setSelectedLeatherColor] = useState<LeatherColorPreset | null>(null);
  const [selectedCoverPreset, setSelectedCoverPreset] = useState<string | null>(null);
  const [customCoverImage, setCustomCoverImage] = useState<string | null>(null);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [activeTab, setActiveTab] = useState('cover');
  const [advancedSettingsOpen, setAdvancedSettingsOpen] = useState(false);
  
  // Typography settings for title
  const [titleTextSettingsOpen, setTitleTextSettingsOpen] = useState(false);
  const [titleFontFamily, setTitleFontFamily] = useState('serif');
  const [titleFontSize, setTitleFontSize] = useState([24]);
  const [titlePosition, setTitlePosition] = useState({ x: 50, y: 40 });
  const [titleTextColor, setTitleTextColor] = useState('#ffffff');
  const [titleOutlineColor, setTitleOutlineColor] = useState('#000000');
  const [titleOutlineThickness, setTitleOutlineThickness] = useState([0]);
  const [titleShadowEnabled, setTitleShadowEnabled] = useState(false);
  const [activeTextLayer, setActiveTextLayer] = useState<'title' | 'subheading'>('title');
  
  // Typography settings for subheading
  const [subheadingTextSettingsOpen, setSubheadingTextSettingsOpen] = useState(false);
  const [subheadingFontFamily, setSubheadingFontFamily] = useState('serif');
  const [subheadingFontSize, setSubheadingFontSize] = useState([16]);
  const [subheadingPosition, setSubheadingPosition] = useState({ x: 50, y: 60 });
  const [subheadingTextColor, setSubheadingTextColor] = useState('#ffffff');
  const [subheadingOutlineColor, setSubheadingOutlineColor] = useState('#000000');
  const [subheadingOutlineThickness, setSubheadingOutlineThickness] = useState([0]);
  const [subheadingShadowEnabled, setSubheadingShadowEnabled] = useState(false);

  // Color options for gradient mode
  const colorOptions = [
    { value: '#00D9FF', label: 'Cosmic Blue', gradient: 'linear-gradient(135deg, #00D9FF, #0099CC)' },
    { value: '#FF6B6B', label: 'Sunset Red', gradient: 'linear-gradient(135deg, #FF6B6B, #CC5555)' },
    { value: '#4ECDC4', label: 'Mint Green', gradient: 'linear-gradient(135deg, #4ECDC4, #45B7AA)' },
    { value: '#FFD93D', label: 'Golden Yellow', gradient: 'linear-gradient(135deg, #FFD93D, #FFB300)' },
    { value: '#6C5CE7', label: 'Lavender Purple', gradient: 'linear-gradient(135deg, #6C5CE7, #8B5CF6)' },
    { value: '#FF8C42', label: 'Tangerine Orange', gradient: 'linear-gradient(135deg, #FF8C42, #FF6B35)' },
    { value: '#A8E6CF', label: 'Sky Blue', gradient: 'linear-gradient(135deg, #A8E6CF, #7FB3D5)' },
    { value: '#FF6B9D', label: 'Rose Pink', gradient: 'linear-gradient(135deg, #FF6B9D, #EC4899)' },
  ];

  // Auto-close dropdowns when text settings are opened
  useEffect(() => {
    if (titleTextSettingsOpen) {
      setSubheadingTextSettingsOpen(false);
    }
  }, [titleTextSettingsOpen]);

  useEffect(() => {
    if (subheadingTextSettingsOpen) {
      setTitleTextSettingsOpen(false);
    }
  }, [subheadingTextSettingsOpen]);

  // Load book data when dialog opens or book changes
  useEffect(() => {
    if (book && open) {
      setTitle(book.title || '');
      setSubheading(book.subheading || '');
      setDescription(book.description || '');
      setSelectedColor(book.color || '#8B4513');
      setIsLeatherMode(book.isLeatherMode || false);
      setSelectedLeatherColor(book.leatherColor ? leatherPresets.find(p => p.color === book.leatherColor) || null : null);
      setSelectedCoverPreset(book.coverPresetId || null);
      setCustomCoverImage(book.coverImage || null);

      // Load cover page settings if available
      if (book.coverPageSettings) {
        const settings = book.coverPageSettings;

        // Title settings
        if (settings.title) {
          setTitlePosition(settings.title.position || { x: 50, y: 40 });
          setTitleFontFamily(settings.title.style?.type || 'serif');
          setTitleFontSize([settings.title.style?.sizePx || 24]);
          setTitleTextColor(settings.title.style?.color || '#ffffff');
          setTitleOutlineColor(settings.title.style?.outlineColor || '#000000');
          setTitleOutlineThickness([settings.title.style?.outlineThickness || 0]);
          setTitleShadowEnabled(settings.title.style?.shadowEnabled || false);
        }

        // Subheading settings
        if (settings.subheading) {
          setSubheadingPosition(settings.subheading.position || { x: 50, y: 60 });
          setSubheadingFontFamily(settings.subheading.style?.type || 'serif');
          setSubheadingFontSize([settings.subheading.style?.sizePx || 16]);
          setSubheadingTextColor(settings.subheading.style?.color || '#ffffff');
          setSubheadingOutlineColor(settings.subheading.style?.outlineColor || '#000000');
          setSubheadingOutlineThickness([settings.subheading.style?.outlineThickness || 0]);
          setSubheadingShadowEnabled(settings.subheading.style?.shadowEnabled || false);
        }
      }
    }
  }, [book, open, leatherPresets]);

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && book) {
      setIsUploadingCover(true);
      try {
        const authStore = useAuthStore.getState();
        if (!authStore.user || !authStore.isAuthenticated) {
          throw new Error('User not authenticated');
        }

        // Upload to Cloudflare R2 via ProjectService
        const { r2Url } = await uploadFile(book.id, `cover-${book.id}`, file);
        setCustomCoverImage(r2Url);
      } catch (error) {
        console.error('Failed to upload cover image:', error);
        // Fallback to base64 if upload fails
        const reader = new FileReader();
        reader.onload = (e) => {
          setCustomCoverImage(e.target?.result as string);
        };
        reader.readAsDataURL(file);
      } finally {
        setIsUploadingCover(false);
      }
    }
  };

  const handleRemoveImage = () => {
    setCustomCoverImage(null);
    setSelectedCoverPreset(null);
  };

  const handleSaveChanges = () => {
    if (!book) return;

    try {
      updateBook(book.id, {
        title,
        subheading,
        description,
        color: isLeatherMode ? (selectedLeatherColor?.color || '#8B4513') : selectedColor,
        gradient: isLeatherMode ? undefined : colorOptions.find(c => c.value === selectedColor)?.gradient,
        leatherColor: isLeatherMode ? selectedLeatherColor?.color : undefined,
        isLeatherMode,
        coverPresetId: customCoverImage ? undefined : selectedCoverPreset, // Only save preset if no custom image
        coverImage: customCoverImage || undefined,
        coverPageSettings: {
          showCoverPage: true,
          baseStyle: isLeatherMode ? 'leather' : 'gradient',
          coverImageData: customCoverImage || undefined,
          title: {
            text: title,
            position: titlePosition,
            style: {
              type: titleFontFamily as any,
              color: titleTextColor,
              size: 'large',
              sizePx: titleFontSize[0],
              outlineColor: titleOutlineColor,
              outlineThickness: titleOutlineThickness[0],
              shadowEnabled: titleShadowEnabled,
            },
          },
          subheading: subheading ? {
            text: subheading,
            position: subheadingPosition,
            style: {
              type: subheadingFontFamily as any,
              color: subheadingTextColor,
              size: 'medium',
              sizePx: subheadingFontSize[0],
              outlineColor: subheadingOutlineColor,
              outlineThickness: subheadingOutlineThickness[0],
              shadowEnabled: subheadingShadowEnabled,
            },
          } : undefined,
        },
      });

      if (onBookUpdated) {
        onBookUpdated(book);
      }

      onOpenChange(false);
    } catch (error) {
      console.error('Error updating world:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`max-w-6xl max-h-[90vh] overflow-y-auto ${
        theme === 'dark' 
          ? 'bg-gray-900 border-gray-700 text-white'
          : 'bg-white border-gray-300 text-black'
      }`}>
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">✨ Edit World</DialogTitle>
        </DialogHeader>
        
        {!book ? (
          <div className="text-center py-8">
            <p className={theme === 'dark' ? 'text-gray-400' : 'text-gray-600'}>No world selected for editing</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Main Content - Two Columns */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left Column - Cover Style & Colors */}
              <div className="space-y-6">
                {/* Cover Style Selection */}
                <div className="space-y-3">
                  <Label className={`text-sm font-medium flex items-center gap-2 ${
                    theme === 'dark' ? 'text-gray-200' : 'text-black'
                  }`}>
                    <Palette className="w-4 h-4" />
                    Cover Style
                  </Label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setIsLeatherMode(true)}
                      className={`p-4 rounded-xl border-2 transition-all duration-200 hover:scale-105 ${
                        isLeatherMode
                          ? 'border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/20'
                          : 'border-gray-600 hover:border-gray-500 bg-gray-800/50'
                      }`}
                    >
                      <div className="text-center">
                        <div className="text-lg font-bold mb-1">📚</div>
                        <div className={`text-sm font-medium ${
                          theme === 'dark' ? 'text-white' : 'text-black'
                        }`}>Leather</div>
                        <div className={`text-xs mt-1 ${
                          theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                        }`}>Classic & Elegant</div>
                      </div>
                    </button>
                    <button
                      onClick={() => setIsLeatherMode(false)}
                      className={`p-4 rounded-xl border-2 transition-all duration-200 hover:scale-105 ${
                        !isLeatherMode
                          ? 'border-blue-500 bg-blue-500/10 shadow-lg shadow-blue-500/20'
                          : 'border-gray-600 hover:border-gray-500 bg-gray-800/50'
                      }`}
                    >
                      <div className="text-center">
                        <div className="text-lg font-bold mb-1">🌈</div>
                        <div className={`text-sm font-medium ${
                          theme === 'dark' ? 'text-white' : 'text-black'
                        }`}>Gradient</div>
                        <div className={`text-xs mt-1 ${
                          theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                        }`}>Modern & Vibrant</div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Color Palette */}
                <div className="space-y-3">
                  <Label className={`text-sm font-medium flex items-center gap-2 ${
                    theme === 'dark' ? 'text-gray-200' : 'text-black'
                  }`}>
                    <Palette className="w-4 h-4" />
                    {isLeatherMode ? 'Leather Colors' : 'Gradient Colors'}
                  </Label>
                  <div className={`p-4 rounded-xl border-2 ${
                    theme === 'dark' ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-100/50 border-gray-300'
                  }`}>
                    <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
                      {isLeatherMode ? (
                        leatherPresets.map((leatherColor) => (
                          <button
                            key={leatherColor.color}
                            onClick={() => setSelectedLeatherColor(leatherColor)}
                            className={`group relative p-3 rounded-lg border-2 transition-all duration-200 hover:scale-105 ${
                              selectedLeatherColor?.color === leatherColor.color
                                ? 'border-blue-500 shadow-lg shadow-blue-500/20 ring-2 ring-blue-400/50'
                                : 'border-gray-600 hover:border-gray-500'
                            }`}
                            style={{ background: leatherColor.color }}
                            title={leatherColor.name}
                          >
                            <div className="w-full h-8 rounded-md shadow-inner" style={{ background: leatherColor.color }} />
                            <div className={`mt-2 text-xs font-medium text-center ${
                              selectedLeatherColor?.color === leatherColor.color
                                ? 'text-blue-400'
                                : (theme === 'dark' ? 'text-gray-300' : 'text-gray-700')
                            }`}>
                              {leatherColor.name.split(' ')[0]}
                            </div>
                          </button>
                        ))
                      ) : (
                        colorOptions.map((color) => (
                          <button
                            key={color.value}
                            onClick={() => setSelectedColor(color.value)}
                            className={`group relative p-3 rounded-lg border-2 transition-all duration-200 hover:scale-105 ${
                              selectedColor === color.value
                                ? 'border-blue-500 shadow-lg shadow-blue-500/20 ring-2 ring-blue-400/50'
                                : 'border-gray-600 hover:border-gray-500'
                            }`}
                            style={{ background: color.gradient }}
                            title={color.label}
                          >
                            <div className="w-full h-8 rounded-md shadow-inner" style={{ background: color.gradient }} />
                            <div className={`mt-2 text-xs font-medium text-center ${
                              selectedColor === color.value
                                ? 'text-blue-400'
                                : (theme === 'dark' ? 'text-gray-300' : 'text-gray-700')
                            }`}>
                              {color.label.split(' ')[0]}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column - Text Input Fields */}
              <div className="space-y-6">
                {/* Title Input */}
                <div className="space-y-3">
                  <Label htmlFor="title" className={`text-sm font-medium flex items-center gap-2 ${
                    theme === 'dark' ? 'text-gray-200' : 'text-black'
                  }`}>
                    <Type className="w-4 h-4" />
                    World Title *
                  </Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter your world's name..."
                    className={`bg-gray-800/50 border-gray-600 text-white placeholder-gray-400 rounded-xl px-4 py-3 transition-all focus:ring-2 focus:ring-blue-500/50 ${
                      theme === 'dark' ? '' : 'bg-white/50 border-gray-300 text-black placeholder-gray-500'
                    }`}
                    maxLength={250}
                  />
                  <div className={`text-xs ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    {title.length}/250 characters
                  </div>
                </div>

                {/* Subheading Input */}
                <div className="space-y-3">
                  <Label htmlFor="subheading" className={`text-sm font-medium flex items-center gap-2 ${
                    theme === 'dark' ? 'text-gray-200' : 'text-black'
                  }`}>
                    <Type className="w-4 h-4" />
                    Subheading
                  </Label>
                  <Input
                    id="subheading"
                    value={subheading}
                    onChange={(e) => setSubheading(e.target.value)}
                    placeholder="A catchy tagline or subtitle..."
                    className={`bg-gray-800/50 border-gray-600 text-white placeholder-gray-400 rounded-xl px-4 py-3 transition-all focus:ring-2 focus:ring-blue-500/50 ${
                      theme === 'dark' ? '' : 'bg-white/50 border-gray-300 text-black placeholder-gray-500'
                    }`}
                    maxLength={500}
                  />
                  <div className={`text-xs ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    {subheading.length}/500 characters
                  </div>
                </div>

                {/* Description Input */}
                <div className="space-y-3">
                  <Label htmlFor="description" className={`text-sm font-medium flex items-center gap-2 ${
                    theme === 'dark' ? 'text-gray-200' : 'text-black'
                  }`}>
                    <Type className="w-4 h-4" />
                    Description
                  </Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe your world in detail... What makes it unique? What adventures await?"
                    className={`bg-gray-800/50 border-gray-600 text-white placeholder-gray-400 resize-none rounded-xl px-4 py-3 transition-all focus:ring-2 focus:ring-blue-500/50 ${
                      theme === 'dark' ? '' : 'bg-white/50 border-gray-300 text-black placeholder-gray-500'
                    }`}
                    rows={6}
                    maxLength={200}
                  />
                  <div className={`text-xs ${
                    theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    {description.length}/200 characters
                  </div>
                </div>
              </div>
            </div>

            {/* Collapsible Advanced Settings */}
            <Collapsible open={advancedSettingsOpen} onOpenChange={setAdvancedSettingsOpen}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  className={`w-full justify-between ${
                    theme === 'dark' 
                      ? 'bg-gray-800/50 hover:bg-gray-800/70 border border-gray-600/50 text-gray-300'
                      : 'bg-gray-100/50 hover:bg-gray-200/70 border border-gray-300/50 text-gray-700'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Settings className="w-4 h-4" />
                    Advanced Settings
                  </span>
                  {advancedSettingsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-6 mt-4">
                {/* Custom Cover Image and Text Settings in 2-column layout */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left Column - Custom Cover Image */}
                  <div className="space-y-3">
                    <Label className={`text-sm font-medium ${
                      theme === 'dark' ? 'text-gray-200' : 'text-black'
                    }`}>
                      Custom Cover Image
                    </Label>
                    {customCoverImage ? (
                      <div className="space-y-2">
                        <div className="relative rounded-lg overflow-hidden border-2 border-gray-600">
                          <img 
                            src={customCoverImage} 
                            alt="Cover preview" 
                            className="w-full h-48 object-cover"
                          />
                          <button
                            onClick={handleRemoveImage}
                            className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 text-xs"
                          >
                            ✕
                          </button>
                        </div>
                        <p className="text-xs text-green-400">✓ Custom image will override colors</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleImageUpload}
                            disabled={isUploadingCover}
                            className="hidden"
                            id="edit-cover-image-upload"
                          />
                          <label
                            htmlFor="edit-cover-image-upload"
                            className={`cursor-pointer transition-colors ${
                              isUploadingCover ? 'opacity-50 cursor-not-allowed' : ''
                            } ${theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-black'
                            }`}
                          >
                            {isUploadingCover ? (
                              <div className="flex flex-col items-center">
                                <Loader2 className="w-8 h-8 mb-2 animate-spin" />
                                <div className="text-sm">Uploading to Cloudflare R2...</div>
                              </div>
                            ) : (
                              <>
                                <div className="text-3xl mb-2">📷</div>
                                <div className="text-sm">Click to upload image</div>
                                <div className={`text-xs mt-1 ${
                                  theme === 'dark' ? 'text-gray-500' : 'text-gray-400'
                                }`}>
                                  Recommended size: 192x288px (2:3 ratio)
                                </div>
                              </>
                            )}
                          </label>
                        </div>
                        <p className={`text-xs ${
                          theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                        }`}>
                          If no image is uploaded, colors will be used
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Right Column - Text Settings */}
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <Label className={`text-sm font-medium ${
                        theme === 'dark' ? 'text-gray-200' : 'text-black'
                      }`}>
                        Text Settings
                      </Label>
                      
                      {/* Title Settings */}
                      <div className="space-y-2">
                        <Label className={`text-xs font-medium ${
                          theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                        }`}>Title</Label>
                        <div className="space-y-2">
                          <div>
                            <Label className={`text-xs ${
                              theme === 'dark' ? 'text-gray-500' : 'text-gray-500'
                            }`}>Font</Label>
                            <Select value={titleFontFamily} onValueChange={setTitleFontFamily}>
                              <SelectTrigger className={`bg-gray-700 border-gray-600 text-white text-sm ${
                                theme === 'dark' ? '' : 'bg-white border-gray-300 text-black'
                              }`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="serif">Serif</SelectItem>
                                <SelectItem value="sans-serif">Sans-serif</SelectItem>
                                <SelectItem value="monospace">Monospace</SelectItem>
                                <SelectItem value="cursive">Cursive</SelectItem>
                                <SelectItem value="fantasy">Fantasy</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className={`text-xs ${
                              theme === 'dark' ? 'text-gray-500' : 'text-gray-500'
                            }`}>Size: {titleFontSize[0]}px</Label>
                            <Slider
                              value={titleFontSize}
                              onValueChange={setTitleFontSize}
                              max={48}
                              min={12}
                              step={1}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label className={`text-xs ${
                              theme === 'dark' ? 'text-gray-500' : 'text-gray-500'
                            }`}>Color</Label>
                            <div className="flex items-center gap-2 mt-1">
                              <input
                                type="color"
                                value={titleTextColor}
                                onChange={(e) => setTitleTextColor(e.target.value)}
                                className={`w-6 h-6 rounded border cursor-pointer ${
                                  theme === 'dark' ? 'border-gray-600 bg-gray-700' : 'border-gray-300 bg-white'
                                }`}
                              />
                              <input
                                type="text"
                                value={titleTextColor}
                                onChange={(e) => setTitleTextColor(e.target.value)}
                                className={`flex-1 text-xs px-2 py-1 rounded ${
                                  theme === 'dark' ? 'bg-gray-700 border border-gray-600 text-white' : 'bg-white border border-gray-300 text-black'
                                }`}
                                placeholder="#ffffff"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Subheading Settings */}
                      <div className="space-y-2">
                        <Label className={`text-xs font-medium ${
                          theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                        }`}>Subheading</Label>
                        <div className="space-y-2">
                          <div>
                            <Label className={`text-xs ${
                              theme === 'dark' ? 'text-gray-500' : 'text-gray-500'
                            }`}>Font</Label>
                            <Select value={subheadingFontFamily} onValueChange={setSubheadingFontFamily}>
                              <SelectTrigger className={`bg-gray-700 border-gray-600 text-white text-sm ${
                                theme === 'dark' ? '' : 'bg-white border-gray-300 text-black'
                              }`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="serif">Serif</SelectItem>
                                <SelectItem value="sans-serif">Sans-serif</SelectItem>
                                <SelectItem value="monospace">Monospace</SelectItem>
                                <SelectItem value="cursive">Cursive</SelectItem>
                                <SelectItem value="fantasy">Fantasy</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className={`text-xs ${
                              theme === 'dark' ? 'text-gray-500' : 'text-gray-500'
                            }`}>Size: {subheadingFontSize[0]}px</Label>
                            <Slider
                              value={subheadingFontSize}
                              onValueChange={setSubheadingFontSize}
                              max={36}
                              min={10}
                              step={1}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label className={`text-xs ${
                              theme === 'dark' ? 'text-gray-500' : 'text-gray-500'
                            }`}>Color</Label>
                            <div className="flex items-center gap-2 mt-1">
                              <input
                                type="color"
                                value={subheadingTextColor}
                                onChange={(e) => setSubheadingTextColor(e.target.value)}
                                className={`w-6 h-6 rounded border cursor-pointer ${
                                  theme === 'dark' ? 'border-gray-600 bg-gray-700' : 'border-gray-300 bg-white'
                                }`}
                              />
                              <input
                                type="text"
                                value={subheadingTextColor}
                                onChange={(e) => setSubheadingTextColor(e.target.value)}
                                className={`flex-1 text-xs px-2 py-1 rounded ${
                                  theme === 'dark' ? 'bg-gray-700 border border-gray-600 text-white' : 'bg-white border border-gray-300 text-black'
                                }`}
                                placeholder="#ffffff"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Text Position Editor - Full Width */}
                <div className="space-y-3">
                  <Label className={`text-sm font-medium ${
                    theme === 'dark' ? 'text-gray-200' : 'text-black'
                  }`}>
                    Text Position Editor
                  </Label>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setActiveTextLayer('title')}
                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                          activeTextLayer === 'title'
                            ? 'bg-blue-600 text-white'
                            : (theme === 'dark' ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300')
                        }`}
                      >
                        Title
                      </button>
                      <button
                        onClick={() => setActiveTextLayer('subheading')}
                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                          activeTextLayer === 'subheading'
                            ? 'bg-blue-600 text-white'
                            : (theme === 'dark' ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300')
                        }`}
                      >
                        Subheading
                      </button>
                    </div>
                    <div className={`relative w-full h-64 mx-auto border rounded-lg overflow-hidden ${
                      theme === 'dark' ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-200/50 border-gray-300'
                    }`}>
                      <div className="absolute inset-0 p-2">
                        {/* Title Text Layer */}
                        <div
                          className={`absolute cursor-move select-none ${
                            activeTextLayer === 'title' 
                              ? 'ring-2 ring-blue-400 ring-offset-2 rounded' 
                              : ''
                          } ${theme === 'dark' ? 'ring-offset-gray-800' : 'ring-offset-white'}`}
                          style={{
                            left: `${titlePosition.x}%`,
                            top: `${titlePosition.y}%`,
                            transform: 'translate(-50%, -50%)',
                            fontSize: `${Math.min(titleFontSize[0] / 3, 12)}px`,
                            color: titleTextColor,
                            fontFamily: titleFontFamily,
                            WebkitTextStroke: titleOutlineThickness[0] > 0 ? `${titleOutlineThickness[0]}px ${titleOutlineColor}` : 'none',
                            textShadow: titleShadowEnabled ? '2px 2px 4px rgba(0,0,0,0.8)' : 'none'
                          }}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setActiveTextLayer('title');
                            const container = e.currentTarget.parentElement;
                            if (!container) return;
                            
                            const rect = container.getBoundingClientRect();
                            const startX = e.clientX;
                            const startY = e.clientY;
                            const startLeft = titlePosition.x;
                            const startTop = titlePosition.y;
                            
                            const handleMouseMove = (moveEvent: MouseEvent) => {
                              const deltaX = ((moveEvent.clientX - startX) / rect.width) * 100;
                              const deltaY = ((moveEvent.clientY - startY) / rect.height) * 100;
                              
                              const newX = Math.max(0, Math.min(100, startLeft + deltaX));
                              const newY = Math.max(0, Math.min(100, startTop + deltaY));
                              
                              setTitlePosition({ x: newX, y: newY });
                            };
                            
                            const handleMouseUp = () => {
                              document.removeEventListener('mousemove', handleMouseMove);
                              document.removeEventListener('mouseup', handleMouseUp);
                            };
                            
                            document.addEventListener('mousemove', handleMouseMove);
                            document.addEventListener('mouseup', handleMouseUp);
                          }}
                          onClick={() => setActiveTextLayer('title')}
                        >
                          {title || 'Title'}
                        </div>

                        {/* Subheading Text Layer */}
                        <div
                          className={`absolute cursor-move select-none ${
                            activeTextLayer === 'subheading' 
                              ? 'ring-2 ring-blue-400 ring-offset-2 rounded' 
                              : ''
                          } ${theme === 'dark' ? 'ring-offset-gray-800' : 'ring-offset-white'}`}
                          style={{
                            left: `${subheadingPosition.x}%`,
                            top: `${subheadingPosition.y}%`,
                            transform: 'translate(-50%, -50%)',
                            fontSize: `${Math.min(subheadingFontSize[0] / 3, 10)}px`,
                            color: subheadingTextColor,
                            fontFamily: subheadingFontFamily,
                            WebkitTextStroke: subheadingOutlineThickness[0] > 0 ? `${subheadingOutlineThickness[0]}px ${subheadingOutlineColor}` : 'none',
                            textShadow: subheadingShadowEnabled ? '2px 2px 4px rgba(0,0,0,0.8)' : 'none'
                          }}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setActiveTextLayer('subheading');
                            const container = e.currentTarget.parentElement;
                            if (!container) return;
                            
                            const rect = container.getBoundingClientRect();
                            const startX = e.clientX;
                            const startY = e.clientY;
                            const startLeft = subheadingPosition.x;
                            const startTop = subheadingPosition.y;
                            
                            const handleMouseMove = (moveEvent: MouseEvent) => {
                              const deltaX = ((moveEvent.clientX - startX) / rect.width) * 100;
                              const deltaY = ((moveEvent.clientY - startY) / rect.height) * 100;
                              
                              const newX = Math.max(0, Math.min(100, startLeft + deltaX));
                              const newY = Math.max(0, Math.min(100, startTop + deltaY));
                              
                              setSubheadingPosition({ x: newX, y: newY });
                            };
                            
                            const handleMouseUp = () => {
                              document.removeEventListener('mousemove', handleMouseMove);
                              document.removeEventListener('mouseup', handleMouseUp);
                            };
                            
                            document.addEventListener('mousemove', handleMouseMove);
                            document.addEventListener('mouseup', handleMouseUp);
                          }}
                          onClick={() => setActiveTextLayer('subheading')}
                        >
                          {subheading || 'Subtitle'}
                        </div>
                      </div>
                    </div>
                    <p className={`text-xs text-center ${
                      theme === 'dark' ? 'text-gray-400' : 'text-gray-600'
                    }`}>
                      Click text to select, drag to reposition • Active: {activeTextLayer === 'title' ? 'Title' : 'Subheading'}
                    </p>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        <DialogFooter className="flex gap-3 pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className={`flex-1 ${
              theme === 'dark' 
                ? 'border-gray-600 text-gray-200 hover:bg-gray-800'
                : 'border-gray-300 text-gray-700 hover:bg-gray-100'
            }`}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveChanges}
            disabled={!title.trim() || !book}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
          >
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BookEditDialog;
