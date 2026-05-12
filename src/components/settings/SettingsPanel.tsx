import React, { useState } from 'react';
import { X, Settings as SettingsIcon, Volume2, Trash2, AlertTriangle, Download, ExternalLink, Star, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAssetStore } from '@/stores/assetStore';
import { useTagStore } from '@/stores/tagStore';
import { useThemeStore } from '@/stores/themeStore';
import { useBookStore } from '@/stores/bookStoreSimple';
import { useMediaStore } from '@/stores/mediaStore';
import { audioEngine } from '@/services/AudioEngine';
import { toast } from 'sonner';
import type { Book } from '@/types/book';
import { supabase } from '@/lib/supabase';
import DataManager from '@/components/DataManager';
import { PricingModal } from '@/components/PricingModal';
import { ContactSheet } from '@/components/ContactSheet';
import { useNavigate } from 'react-router-dom';

// Error boundary component
class AudioErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('Audio error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 text-center">
          <p className="text-sm text-muted-foreground">
            Audio settings temporarily unavailable
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const navigate = useNavigate();
  const assetStore = useAssetStore();
  const { tags } = useTagStore();
  const { theme, toggleTheme } = useThemeStore();
  const { 
    getAllBooks,
    getCurrentBook,
    getWorldData,
    updateWorldData
  } = useBookStore();
  const { videosEnabled, setVideosEnabled, audioEnabled, setAudioEnabled, videoSoundsEnabled, setVideoSoundsEnabled, audioVolume, setAudioVolume } = useMediaStore();
  
  // Get current book's assets and global custom fields
  const assets = assetStore.getAllAssets();
  const globalCustomFields: any[] = []; // TODO: Implement global custom fields when needed
  
  // Get book-specific viewport settings
  const currentBook = getCurrentBook();
  const bookWorldData = currentBook ? getWorldData(currentBook.id) : null;
  const viewportOffset = bookWorldData?.viewportOffset || { x: -45, y: -20 };
  const viewportScale = bookWorldData?.viewportScale || 1;
  
  const [activeTab, setActiveTab] = useState('general');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteUnlocked, setDeleteUnlocked] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [showContactSheet, setShowContactSheet] = useState(false);
  
  const allBooks = getAllBooks();

  // Handler functions for updating book-specific viewport settings
  const handleViewportOffsetChange = (axis: 'x' | 'y', value: number) => {
    if (!currentBook) return;
    
    const newOffset = {
      ...viewportOffset,
      [axis]: value,
    };
    
    updateWorldData(currentBook.id, {
      viewportOffset: newOffset,
    });
  };

  const handleViewportScaleChange = (scale: number) => {
    if (!currentBook) return;
    
    updateWorldData(currentBook.id, {
      viewportScale: scale,
    });
  };


  const handleAudioToggle = async (enabled: boolean) => {
    setAudioEnabled(enabled);
    
    if (enabled) {
      // Start music with user interaction
      try {
        await audioEngine.startWithUserInteraction();
      } catch (error) {
        console.log('Audio start failed:', error);
      }
    } else {
      // Stop music immediately
      audioEngine.stop();
    }
  };

  const handleClearAllData = () => {
    setShowDeleteDialog(true);
  };

  const handleConfirmDeleteAllData = async () => {
    // Show browser confirmation dialog
    const confirmed = window.confirm(
      'Are you sure you want to delete all data? This action cannot be undone.'
    );

    if (!confirmed) {
      return; // User cancelled the browser confirmation
    }

    try {
      // Clear asset store data
      const assetStore = useAssetStore.getState();
      const tagStore = useTagStore.getState();
      const bookStore = useBookStore.getState();
      
      // Clear current book's data
      assetStore.clearAssets();
      tagStore.clearWorldData();
      
      // Clear all books
      const allBooks = bookStore.getAllBooks();
      allBooks.forEach(book => {
        bookStore.deleteBook(book.id);
      });
      
      // Reset media store to defaults
      useMediaStore.getState().setVideosEnabled(true);
      useMediaStore.getState().setAudioEnabled(true);
      useMediaStore.getState().setVideoSoundsEnabled(true);
      useMediaStore.getState().setAudioVolume(0.08);
      
      // Reset theme to default
      useThemeStore.getState().setTheme('dark');
      
      // Clear all localStorage items except those that shouldn't be cleared
      const keysToKeep = []; // Add any keys that should be preserved
      const allKeys = Object.keys(localStorage);
      allKeys.forEach(key => {
        if (!keysToKeep.includes(key)) {
          localStorage.removeItem(key);
        }
      });
      
      // Clear all sessionStorage
      sessionStorage.clear();
      
      // Clear Supabase data if authenticated
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          // Sign out the user to clear their session
          await supabase.auth.signOut();
        }
      } catch (supabaseError) {
        console.warn('Failed to clear Supabase session:', supabaseError);
      }
      
      // Stop audio engine
      audioEngine.stop();
      
      // Show success message
      toast.success('All data has been permanently deleted');
      
      // Close dialogs and reset state
      setShowDeleteDialog(false);
      setDeleteUnlocked(false);
      onClose();
      
      // Reload the page to ensure clean state
      setTimeout(() => {
        window.location.reload();
      }, 1000);
      
    } catch (error) {
      console.error('Failed to clear all data:', error);
      toast.error('Failed to clear some data. Please refresh the page.');
    }
  };


  const stats = {
    totalAssets: Object.keys(assets).length,
    totalTags: Object.keys(tags).length,
    totalGlobalFields: globalCustomFields.length,
  };

  return (
    <>
      <style>{`
        [data-radix-dialog-close] {
          display: none !important;
        }
      `}</style>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[80vh] glass cosmic-glow border-glass-border/40 flex flex-col overflow-y-auto scrollbar-thin scrollbar-thumb-glass-border/40 scrollbar-track-transparent hover:scrollbar-thumb-glass-border/60" showCloseButton={false}>
        <DialogHeader className="flex-shrink-0 sticky top-0 bg-glass/90 backdrop-blur-sm z-20 pb-2 relative">
          <DialogTitle className="flex items-center gap-2 h-6 translate-y-px">
            <SettingsIcon className="w-5 h-5" />
            Settings
          </DialogTitle>
          <button
            onClick={onClose}
            className="absolute right-0 -top-1 p-2 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
        </DialogHeader>
        
        <div className="flex-1">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col">
            <TabsList className="grid w-full grid-cols-4 flex-shrink-0 bg-glass/90 backdrop-blur-sm z-10">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="audio">Sound & Video</TabsTrigger>
              <TabsTrigger value="data">Data Management</TabsTrigger>
              <TabsTrigger value="about">About</TabsTrigger>
            </TabsList>
            
            <div className="mt-4">
              <TabsContent value="general" className="space-y-4">
                <Card className="glass cosmic-glow border-glass-border/40">
              <CardHeader>
                <CardTitle className="text-lg">Display Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="pt-4 border-t border-glass-border/30">
                  <div className="text-sm font-medium text-foreground mb-3">Viewport Position & Scale</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="viewport-offset-x">Offset X</Label>
                      <Input
                        id="viewport-offset-x"
                        type="number"
                        value={viewportOffset.x}
                        onChange={(e) =>
                          handleViewportOffsetChange('x', Number(e.target.value))
                        }
                        step="1"
                        className="bg-glass/50 border-glass-border/40"
                        disabled={!currentBook}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="viewport-offset-y">Offset Y</Label>
                      <Input
                        id="viewport-offset-y"
                        type="number"
                        value={viewportOffset.y}
                        onChange={(e) =>
                          handleViewportOffsetChange('y', Number(e.target.value))
                        }
                        step="1"
                        className="bg-glass/50 border-glass-border/40"
                        disabled={!currentBook}
                      />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="viewport-scale">Viewport Scale</Label>
                      <Input
                        id="viewport-scale"
                        type="number"
                        value={viewportScale}
                        onChange={(e) => handleViewportScaleChange(Number(e.target.value))}
                        min="0.5"
                        max="2"
                        step="0.05"
                        className="bg-glass/50 border-glass-border/40"
                        disabled={!currentBook}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="audio" className="space-y-4">
            <AudioErrorBoundary>
              <Card className="glass cosmic-glow border-glass-border/40">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Volume2 className="w-5 h-5" />
                    Audio Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="audio-enabled">Music</Label>
                      <div className="text-sm text-muted-foreground">
                        Enable background music and audio effects
                      </div>
                    </div>
                    <Switch
                      id="audio-enabled"
                      checked={audioEnabled}
                      onCheckedChange={handleAudioToggle}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="videos-enabled">Videos</Label>
                      <div className="text-sm text-muted-foreground">
                        Enable intro videos and animations
                      </div>
                    </div>
                    <Switch
                      id="videos-enabled"
                      checked={videosEnabled}
                      onCheckedChange={setVideosEnabled}
                    />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="video-sounds-enabled">Enable Video Sounds</Label>
                      <div className="text-sm text-muted-foreground">
                        Play video audio and sound effects
                      </div>
                    </div>
                    <Switch
                      id="video-sounds-enabled"
                      checked={videoSoundsEnabled}
                      onCheckedChange={setVideoSoundsEnabled}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="audio-volume">Music Volume: {Math.round(audioVolume * 100)}%</Label>
                    <Slider
                      id="audio-volume"
                      min={0}
                      max={100}
                      step={1}
                      value={[audioVolume * 100]}
                      onValueChange={(value) => {
                        setAudioVolume(value[0] / 100);
                        audioEngine.updateVolume(); // Update real-time volume
                      }}
                      className="w-full"
                      disabled={!audioEnabled}
                    />
                    <div className="text-xs text-muted-foreground">
                      Control background music volume
                    </div>
                  </div>
                </CardContent>
              </Card>
            </AudioErrorBoundary>
          </TabsContent>
          
          
          <TabsContent value="data" className="space-y-4">
            <Card className="glass cosmic-glow border-glass-border/40">
              <CardHeader>
                <CardTitle className="text-lg">Data Statistics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-center mb-6">
                  <div className="p-4 border border-glass-border/30 rounded-lg bg-glass/30">
                    <div className="text-2xl font-bold text-primary">{allBooks.length}</div>
                    <div className="text-sm text-muted-foreground">Books</div>
                  </div>
                  <div className="p-4 border border-glass-border/30 rounded-lg bg-glass/30">
                    <div className="text-2xl font-bold text-accent">{stats.totalAssets}</div>
                    <div className="text-sm text-muted-foreground">Assets</div>
                  </div>
                  <div className="p-4 border border-glass-border/30 rounded-lg bg-glass/30">
                    <div className="text-2xl font-bold text-secondary">{stats.totalTags}</div>
                    <div className="text-sm text-muted-foreground">Tags</div>
                  </div>
                  <div className="p-4 border border-glass-border/30 rounded-lg bg-glass/30">
                    <div className="text-2xl font-bold text-primary">{stats.totalGlobalFields}</div>
                    <div className="text-sm text-muted-foreground">Fields</div>
                  </div>
                </div>
                
                <div className="pt-4 border-t border-glass-border/30">
                  <DataManager>
                    <Button
                      variant="default"
                      className="w-full"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Import / Export Data
                    </Button>
                  </DataManager>
                </div>
                
                <div className="pt-4 border-t border-glass-border/30">
                  <Button
                    variant="destructive"
                    onClick={handleClearAllData}
                    className="w-full"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Clear All Data
                  </Button>
                  <div className="text-xs text-muted-foreground mt-2">
                    This will permanently delete all assets, tags, books, and settings.
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="about" className="space-y-4">
            <Card className="glass cosmic-glow border-glass-border/40">
              <CardHeader>
                <CardTitle className="text-lg">About KANVAS</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-center space-y-2">
                  <div className="text-2xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                    KANVAS
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Version V3.8.9.2
                  </div>
                </div>
                
                <div className="border-t border-glass-border/30 pt-4">
                  <div className="text-sm space-y-3">
                    <div className="font-semibold text-foreground">About KANVAS</div>
                    <div className="text-muted-foreground space-y-2">
                      <p>
                        KANVAS represents a revolutionary approach to creative planning and organization. 
                        Imagine having the intuitive structure of a file manager combined with the visual 
                        freedom of a digital whiteboard - that's the power of KANVAS.
                      </p>
                      <p>
                        Our innovative nesting system allows you to organize assets hierarchically, 
                        just like folders in a file manager, while providing a stunning visual canvas 
                        where you can arrange, connect, and manipulate your ideas spatially. Whether you're 
                        planning novels, managing projects, or organizing complex creative works, KANVAS 
                        adapts to your unique workflow.
                      </p>
                      <p>
                        Experience the perfect blend of structure and creativity - where organization 
                        meets imagination, and where your ideas can truly take shape in the most intuitive 
                        and visually appealing way possible.
                      </p>
                    </div>
                  </div>
                </div>
                
                <div className="border-t border-glass-border/30 pt-4">
                  <div className="text-sm space-y-2">
                    <div className="font-semibold text-foreground">Unlock Your Full Potential</div>
                    <div className="text-muted-foreground">
                      Get access to more features with a Pro account. 
                      <button 
                        onClick={() => setShowPricingModal(true)}
                        className="text-primary hover:underline ml-1"
                      >
                        See pricing information here
                      </button>
                    </div>
                  </div>
                </div>
                
                <div className="border-t border-glass-border/30 pt-4">
                  <div className="text-sm space-y-2">
                    <div className="font-semibold text-foreground">Legal Notice</div>
                    <div className="text-muted-foreground space-y-1">
                      <p>© 2026 All Rights Reserved.</p>
                      <p>Unauthorized reproduction, distribution, or modification of this software or its components is strictly prohibited.</p>
                      <p>This includes but is not limited to: copying the source code, replicating the design, or implementing similar functionality without explicit permission.</p>
                      <p>Violators may be subject to legal action under copyright and intellectual property laws.</p>
                    </div>
                  </div>
                </div>
                
                <div className="border-t border-glass-border/30 pt-4">
                  <div className="text-sm space-y-2">
                    <div className="font-semibold text-foreground">Liability Disclaimer</div>
                    <div className="text-muted-foreground space-y-1">
                      <p>The creators of this software are not liable for any data loss, corruption, or damage that may occur while using this application.</p>
                      <p>Users are responsible for maintaining backups of their data and for the security of their information.</p>
                      <p>This software is provided "as is" without warranties of any kind, either express or implied.</p>
                    </div>
                  </div>
                </div>
                
                <div className="border-t border-glass-border/30 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      navigate('/terms-of-service');
                      onClose();
                    }}
                    className="w-full glass cosmic-glow border-glass-border/40 hover:bg-glass/20 mb-3"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    View Terms of Service
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      navigate('/privacy-policy');
                      onClose();
                    }}
                    className="w-full glass cosmic-glow border-glass-border/40 hover:bg-glass/20 mb-3"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    View Privacy Policy
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      navigate('/refund-policy');
                      onClose();
                    }}
                    className="w-full glass cosmic-glow border-glass-border/40 hover:bg-glass/20"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    View Refund & Cancellation Policy
                  </Button>
                </div>
                
                <div className="border-t border-glass-border/30 pt-4">
                  <div className="text-xs text-muted-foreground text-center">
                    <p>This software is provided "as is" without warranty of any kind.</p>
                    <p>By using this application, you agree to respect the intellectual property rights of the creator.</p>
                    <div className="mt-2">
                      <button
                        onClick={() => setShowContactSheet(true)}
                        className="text-xs text-primary hover:underline flex items-center gap-1 mx-auto"
                      >
                        <Mail className="w-3 h-3" />
                        Contact Support
                      </button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
  
              </div>
          </Tabs>
        </div>
        
        {/* Delete Confirmation Dialog */}
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent className="max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-5 h-5" />
                Delete All Data
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-4">
                <div className="text-center py-4">
                  <div className="text-xl font-bold text-destructive mb-2">
                    WARNING THIS WILL DELETE ALL DATA
                  </div>
                  <div className="text-lg font-bold text-destructive">
                    THIS ACTION IS NOT REVERSABLE
                  </div>
                </div>
                
                <div className="flex items-center justify-between p-3 border border-destructive/30 rounded-lg bg-destructive/5">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="delete-unlock"
                      checked={deleteUnlocked}
                      onCheckedChange={setDeleteUnlocked}
                    />
                    <Label htmlFor="delete-unlock" className="text-sm font-medium">
                      Unlock deletion
                    </Label>
                  </div>
                </div>
                
                <div className="text-xs text-muted-foreground text-center">
                  This will permanently delete all assets, tags, worlds, and settings. There is no way to recover this data.
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => {
                setShowDeleteDialog(false);
                setDeleteUnlocked(false);
              }}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmDeleteAllData}
                disabled={!deleteUnlocked}
                className="bg-destructive hover:bg-destructive/90"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete All Data
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        
        {/* Pricing Modal */}
        <PricingModal 
          isOpen={showPricingModal} 
          onClose={() => setShowPricingModal(false)} 
        />
        
        {/* Contact Sheet */}
        <ContactSheet 
          isOpen={showContactSheet} 
          onClose={() => setShowContactSheet(false)} 
        />
      </DialogContent>
    </Dialog>
    </>
  );
}
