import { useState, useEffect, useRef } from "react";
import { BookOpen, ChevronLeft, Database, Trash2, Edit } from "lucide-react";
import { ConflictStatusIndicator } from "@/components/ConflictStatusIndicator";
import cosmicBackground from "@/assets/cosmic-background.png";
import lightBackground from "@/assets/BG-light.png";
import { AssetPort } from "@/components/AssetPort";
import { AssetExplorer } from "@/components/explorer/AssetExplorer";
import { BackgroundControls } from "@/components/asset/BackgroundControls";
import { Button } from "@/components/ui/button";
import WorldCreationDialog from "@/components/WorldCreationDialog";
import DataManager from "@/components/DataManager";
import BookShelf from "@/components/books/BookShelf";
import BookEditDialog from "@/components/BookEditDialog";
import "@/components/books/leather-styles.css";
import SideAdBanner from "@/components/SideAdBanner";
import { QuotaWarningBar } from "@/components/QuotaWarningBar";
import { EnhancedAccountModal } from "@/components/account/EnhancedAccountModal";
import { UndoStatus } from "@/components/UndoStatus";
import { useAuthStore } from '@/stores/authStore';
import { useTagStore } from "@/stores/tagStore";
import { useThemeStore } from "@/stores/themeStore";
import { useBackgroundStore } from "@/stores/backgroundStore";
import type { BackgroundConfig } from "@/types/background";
import { useMediaStore } from "@/stores/mediaStore";
import { useBookStore } from "@/stores/bookStoreSimple";
import { useAssetStore } from '@/stores/assetStore';
import { audioEngine } from "@/services/AudioEngine";
import { autosaveService } from '@/services/autosaveService';
import { documentMutationService } from '@/services/DocumentMutationService';
import { listProjects } from '@/services/ProjectService';
import SplashScreen from "@/components/media/SplashScreen";
import IntroVideo from "@/components/media/IntroVideo";
import BookEntryAnimation from "@/components/media/BookEntryAnimation";
import OnboardingPopup from "@/components/OnboardingPopup";
import type { Book } from "@/types/book";
import { navigationCache } from "@/utils/navigationCache";

const Index = () => {
  // FEATURE FLAG: Change to true to re-enable ads for all users
  const ADS_ENABLED_FOR_ALL_USERS = false;
  
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [bookLibraryOpen, setBookLibraryOpen] = useState(true);
  const [backgroundRefreshTrigger, setBackgroundRefreshTrigger] = useState(0);
  const [showBookEntryAnimation, setShowBookEntryAnimation] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isCloudLoading, setIsCloudLoading] = useState(false);
  const createWorldButtonRef = useRef<HTMLButtonElement>(null);
  const { currentActiveId, loadWorldData, isEditingBackground, setIsEditingBackground, currentViewportId, setActiveAsset, getCurrentBookAssets, setCurrentViewportId } = useAssetStore(); // Using getCurrentBookAssets method
  const { loadWorldData: loadTagWorldData } = useTagStore();
  const { currentBookId, setCurrentBook, getAllBooks, deleteBook, updateWorldData } = useBookStore(); // Adding back book store - confirmed working
  const { theme } = useThemeStore(); // Adding back theme store - confirmed working
  // const { getBackground } = useBackgroundStore(); // Temporarily disabled to debug
  const { appPhase, showLibrary, setTransitioning, setAppPhase } = useMediaStore(); // Adding back media store - confirmed working
  // Simple auth state for storage quota functionality
  const { effectiveLimits, isAuthenticated, initializeAuth } = useAuthStore(); // Using working auth store
  const showAds = false; // Temporarily disabled

  // Fallback functions and values
  const getBackground = () => null;

  // Initialize auth on mount
  useEffect(() => {
    initializeAuth();
    console.log('[Index] Auth initialized');
  }, [initializeAuth]);

  // Load data from cloud when user authenticates - LOW I/O OPTIMIZED
  // Sync project metadata from Supabase to local bookStore on sign-in only
  // Full project data loads only when opening a specific project
  useEffect(() => {
    if (isAuthenticated && !isCloudLoading) {
      console.log('[Index] User authenticated, syncing project metadata from Supabase...');
      setIsCloudLoading(true);
      
      // Add a small delay to ensure auth state is fully settled
      const loadTimeout = setTimeout(async () => {
        try {
          console.log('[Index] Calling listProjects()...');
          // Sync project metadata from Supabase to local bookStore
          const projects = await listProjects();
          console.log(`[Index] Fetched ${projects.length} projects from Supabase:`, projects);
          
          if (projects.length === 0) {
            console.log('[Index] No projects found in Supabase for this user');
          }
          
          const currentBooks = getAllBooks();
          const existingBookIds = new Set(currentBooks.map(book => book.id));
          
          // Sync metadata - create new books OR update existing books with latest cover settings
          let syncedCount = 0;
          let updatedCount = 0;
          for (const project of projects) {
            const bookStore = useBookStore.getState();
            const existingBook = currentBooks.find(b => b.id === project.id);
            
            if (!existingBook) {
              // Create new local book entry
              bookStore.createBook({
                id: project.id, // Use Supabase project ID instead of generating new one
                title: project.name,
                color: project.color || '#3b82f6',
                gradient: project.gradient || undefined,
                leatherColor: project.leather_color || undefined,
                isLeatherMode: project.is_leather_mode || false,
                coverImage: project.cover_image || undefined,
                coverPageSettings: project.cover_page_settings || {},
                worldData: {
                  assets: {},
                  tags: project.tags_config || {},
                  globalCustomFields: [],
                  viewportOffset: { x: -45, y: -20 },
                  viewportScale: 1,
                },
              });
              syncedCount++;
              console.log(`[Index] Synced project metadata to local book: ${project.name}`);
            } else {
              // Update existing book with latest cover/text settings from Supabase
              bookStore.updateBook(project.id, {
                title: project.name,
                color: project.color || existingBook.color,
                gradient: project.gradient || existingBook.gradient,
                leatherColor: project.leather_color || existingBook.leatherColor,
                isLeatherMode: project.is_leather_mode ?? existingBook.isLeatherMode,
                coverImage: project.cover_image || existingBook.coverImage,
                coverPageSettings: project.cover_page_settings || existingBook.coverPageSettings,
              });
              updatedCount++;
              console.log(`[Index] Updated existing book with latest metadata: ${project.name}`);
            }
          }
          
          console.log(`[Index] Synced ${syncedCount} new projects and updated ${updatedCount} existing projects from Supabase`);
          
          // Load full data for current book if one is selected
          const targetBookId = getTargetBookId();
          let success = false;
          
          if (targetBookId) {
            const result = await documentMutationService.loadDocument(targetBookId);
            success = result.success;
            if (result.success && result.data) {
              console.log(`[Index] DocumentMutation result:`, {
                success: result.success,
                hasData: !!result.data,
                hasWorldDocument: !!result.data.world_document,
                worldDocumentKeys: result.data.world_document ? Object.keys(result.data.world_document) : 'no keys',
                fullResult: result.data
              });
              
              // Set book ID for future operations (in case it changed)
              if (currentBookId !== targetBookId) {
                console.log('[Index] Setting book ID for future operations:', targetBookId);
                setCurrentBook(targetBookId);
              }
              
              // Load all world document data using unified approach
              success = await loadWorldDocumentData(result, targetBookId, {
                loadAssets: true,
                loadBackgrounds: true,
                loadTags: true,
                skipIfAssetsExist: false
              });
              
              if (!success) {
                console.error('[Index] Failed to load world document data');
              }
            }
          } else {
            // No current book, just mark as success for now
            success = true;
          }
          
          if (success) {
            console.log('[Index] Project metadata sync and current book data load completed');
          } else {
            console.warn('[Index] Failed to load current book data from cloud');
          }
        } catch (err) {
          console.error('[Index] Cloud loading failed:', err);
        } finally {
          setIsCloudLoading(false);
        }
      }, 1000); // Increased delay to 1 second for auth state settlement
      
      return () => {
        clearTimeout(loadTimeout);
        setIsCloudLoading(false);
      };
    }
  }, [isAuthenticated]); // Only depend on isAuthenticated to prevent infinite loop

  // Initialize autosave service when authenticated
  // useEffect(() => {
  //   if (isAuthenticated) {
  //     console.log('[Index] User authenticated, autosave will be handled by autosaveService');
  //   } else {
  //     console.log('[Index] User not authenticated, local save only');
  //   }
  // }, [isAuthenticated]); // Temporarily disabled to debug


  // useEffect(() => {
  //   document.documentElement.className = theme;
  // }, [theme]); // Temporarily disabled to debug

  // Audio is now started from splash screen with user interaction
  // useEffect(() => {
  //   if (appPhase === 'LIBRARY') {
  //     audioEngine.start();
  //   }
  // }, [appPhase]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      audioEngine.cleanup();
    };
  }, []);

  // Restore cached navigation state on mount (non-intrusive)
  useEffect(() => {
    // Only attempt restoration if we're not already in a specific phase
    // This prevents interfering with normal app flow
    if (appPhase !== 'SPLASH') {
      return;
    }

    const cachedState = navigationCache.getState();
    if (!cachedState) {
      return;
    }

    // Only restore if we have meaningful state to restore
    if (cachedState.appPhase !== 'SPLASH' && cachedState.currentBookId) {
      // Restore app phase
      setAppPhase(cachedState.appPhase);

      // Restore current book if it still exists
      const book = getAllBooks().find(b => b.id === cachedState.currentBookId);
      if (book) {
        setCurrentBook(cachedState.currentBookId);
        documentMutationService.setProjectId(cachedState.currentBookId);
        
        // Load world data if we were in a book view and book has world data
        if (cachedState.appPhase === 'BOOK_VIEW' && book.worldData) {
          // Create a mock document result for the unified function
          const mockDocumentResult = {
            success: true,
            data: {
              world_document: book.worldData
            }
          };
          
          // Use unified function for consistent data loading (async call in useEffect)
          loadWorldDocumentData(mockDocumentResult, book.id, {
            loadAssets: true,
            loadBackgrounds: true,
            loadTags: true,
            skipIfAssetsExist: true // Preserve existing assets if they exist
          }).then(loadSuccess => {
            if (!loadSuccess) {
              console.error('[Index] Failed to restore cached world data');
            }
          }).catch(err => {
            console.error('[Index] Error restoring cached world data:', err);
          });
        }
      }

      // Note: Viewport restoration is now handled by assetStore.initFromBookStore()
      // which runs after assets are loaded, ensuring the viewport asset exists
      // before attempting to restore. This prevents race conditions.

      // Restore active asset if it exists
      if (cachedState.currentActiveId) {
        setActiveAsset(cachedState.currentActiveId);
      }

      // Restore UI states
      setSidebarOpen(cachedState.sidebarOpen);
      setBookLibraryOpen(cachedState.bookLibraryOpen);
      setIsEditingBackground(cachedState.isEditingBackground ?? false);
    }
  }, []); // Empty dependency array - only run once on mount

  // Save navigation state when relevant state changes (non-intrusive)
  useEffect(() => {
    // Don't save state during splash screen - let users have fresh starts
    if (appPhase === 'SPLASH') {
      navigationCache.clearState();
      return;
    }

    // Only save if we have meaningful state to preserve
    // Must have a book ID to save - otherwise we save null bookId which breaks viewport restoration
    if (!currentBookId) {
      return;
    }

    const currentState: import('@/utils/navigationCache').NavigationState = {
      appPhase,
      currentBookId,
      currentViewportId,
      currentActiveId,
      bookLibraryOpen,
      sidebarOpen,
      isEditingBackground,
    };

    // Add viewport asset data if we're in a viewport
    const currentBookAssets = getCurrentBookAssets();
    if (currentViewportId && currentBookAssets[currentViewportId]) {
      const viewportAsset = currentBookAssets[currentViewportId];
      currentState.viewportAsset = {
        id: viewportAsset.asset_id,
        x: viewportAsset.x ?? 0,
        y: viewportAsset.y ?? 0,
        width: viewportAsset.width ?? 100,
        height: viewportAsset.height ?? 100,
        viewportConfig: viewportAsset.viewport_config ?? {
          zoom: 1,
          panX: 0,
          panY: 0
        },
      };
    }

    navigationCache.saveState(currentState);
  }, [
    appPhase,
    currentBookId,
    currentViewportId,
    currentActiveId,
    bookLibraryOpen,
    sidebarOpen,
    isEditingBackground,
    getCurrentBookAssets, // Include getCurrentBookAssets to capture viewport changes
  ]);

  // Helper function for consistent book ID resolution
  const getTargetBookId = (fallbackId?: string) => {
    const targetId = fallbackId || currentBookId;
    if (!targetId || targetId === 'null') {
      console.error('[Index] Cannot resolve target book ID - no valid book ID available');
      return null;
    }
    return targetId;
  };

  // Unified function to load world document data consistently
  // This eliminates duplicate logic and ensures consistent data structure handling
  const loadWorldDocumentData = async (
    documentResult: any, 
    targetBookId: string,
    options: {
      loadAssets?: boolean;
      loadBackgrounds?: boolean;
      loadTags?: boolean;
      skipIfAssetsExist?: boolean;
    } = {}
  ) => {
    const {
      loadAssets = true,
      loadBackgrounds = true,
      loadTags = true,
      skipIfAssetsExist = false
    } = options;

    console.log('[Index] loadWorldDocumentData called:', {
      targetBookId,
      hasData: !!documentResult?.data,
      hasWorldDocument: !!documentResult?.data?.world_document,
      options
    });

    if (!documentResult?.data?.world_document) {
      console.error('[Index] loadWorldDocumentData: No world_document found in result');
      return false;
    }

    const worldDocument = documentResult.data.world_document;
    let success = true;

    // ASSET LOADING - Unified approach using world_document.assets
    if (loadAssets) {
      const assets = worldDocument.assets || {};
      console.log('[Index] Loading assets from world_document.assets:', Object.keys(assets).length);

      // Check if we should skip loading assets (for optimization)
      if (skipIfAssetsExist) {
        const currentAssets = useAssetStore.getState().getCurrentBookAssets();
        const hasAssets = Object.keys(currentAssets).length > 0;
        const bookHasAssets = Object.keys(assets).length > 0;
        
        console.log('[Index] skipIfAssetsExist check:', {
          hasAssets,
          bookHasAssets,
          currentAssetCount: Object.keys(currentAssets).length,
          incomingAssetCount: Object.keys(assets).length
        });
        
        // Only skip if we have existing assets AND the incoming assets are not empty
        // This prevents the case where assets are lost due to empty incoming data
        if (bookHasAssets && hasAssets) {
          console.log('[Index] Skipping asset loading to preserve existing assets');
        } else if (!bookHasAssets && hasAssets) {
          console.log('[Index] WARNING: Book has no assets but store has assets - this indicates a sync issue');
          // Load anyway to ensure consistency
          const assetStore = useAssetStore.getState();
          assetStore.loadWorldData({ 
            assets: assets,
            globalCustomFields: worldDocument.globalCustomFields || {}
          }, targetBookId);
        } else {
          // Load assets through proper store method to maintain virtualized mode
          if (Object.keys(assets).length > 0) {
            console.log('[Index] Loading assets through proper loadWorldData method');
            
            const assetStore = useAssetStore.getState();
            assetStore.loadWorldData({ 
              assets: assets,
              globalCustomFields: worldDocument.globalCustomFields || {}
            }, targetBookId);
            
            console.log('[Index] Assets loaded through loadWorldData with book ID override:', targetBookId);
          } else {
            console.log('[Index] No assets to load - incoming assets array is empty');
          }
        }
      } else {
        // Load assets unconditionally
        if (Object.keys(assets).length > 0) {
          console.log('[Index] Loading assets unconditionally');
          
          const assetStore = useAssetStore.getState();
          assetStore.loadWorldData({ 
            assets: assets,
            globalCustomFields: worldDocument.globalCustomFields || {}
          }, targetBookId);
          
          console.log('[Index] Assets loaded through loadWorldData with book ID override:', targetBookId);
        }
      }
    }

    // BACKGROUND RESTORATION - Unified approach
    if (loadBackgrounds && worldDocument.backgrounds) {
      const backgroundStore = useBackgroundStore.getState();
      const backgrounds = worldDocument.backgrounds;
      console.log('[Index] Restoring', Object.keys(backgrounds).length, 'backgrounds');

      Object.entries(backgrounds).forEach(([key, config]) => {
        const clonedConfig = backgroundStore.cloneConfig(config as BackgroundConfig);
        backgroundStore.setBackground(key, clonedConfig);
      });
    }

    // TAG RESTORATION - Unified approach
    if (loadTags && (worldDocument.tags || worldDocument.assetTags)) {
      const tagData = {
        tags: worldDocument.tags || {},
        assetTags: worldDocument.assetTags || {}
      };
      console.log('[Index] Restoring tags:', Object.keys(tagData.tags).length, 'tags and', Object.keys(tagData.assetTags).length, 'asset tag associations');
      loadTagWorldData(tagData);
    }

    // Load other world data (excluding assets to prevent overwriting)
    const worldDataForOtherStuff = JSON.parse(JSON.stringify(worldDocument));
    delete worldDataForOtherStuff.assets; // Remove assets to prevent overwriting
    
    // Only load worldData if it has meaningful content (not just empty objects)
    const hasMeaningfulData = Object.keys(worldDataForOtherStuff).length > 0 && 
      Object.values(worldDataForOtherStuff).some(value => 
        value && typeof value === 'object' && Object.keys(value).length > 0
      );
    
    if (hasMeaningfulData) {
      setTimeout(() => {
        loadWorldData(worldDataForOtherStuff);
      }, 0);
    } else {
      console.log('[Index] Skipping empty worldData to prevent overwriting loaded assets');
    }

    return success;
  };

  const handleBackgroundSave = () => {
    // Force re-render of components that depend on background config
    setBackgroundRefreshTrigger(prev => prev + 1);
  };

  const handleBookSelect = async (book: Book) => {
    setCurrentBook(book.id);
    // Set project ID for DocumentMutationService so operations can sync
    documentMutationService.setProjectId(book.id);
    
    // Ensure project exists on server for authenticated users
    const { isAuthenticated } = useAuthStore.getState();
    if (isAuthenticated) {
      try {
        const result = await documentMutationService.loadDocument(book.id);
        if (!result.success && result.error === 'Project not found') {
          console.log('[Index] Book not found on server, creating project...');
          const created = await documentMutationService.createProject(
            book.id, 
            book.title,
            book.coverPageSettings
          );
          if (created) {
            console.log('[Index] Created project on server for book:', book.title);
          }
        }
      } catch (err) {
        console.warn('[Index] Failed to ensure project exists:', err);
      }
    }
    
    // Don't load world data here - only load when entering viewport from single view
    // Don't close library here - let user stay in book library
  };

  const handleEnterBook = async (book: Book) => {
    // Start book entry animation instead of direct entry
    setShowBookEntryAnimation(true);
    setBookLibraryOpen(false);
    
    // Load document from server to set currentProjectId for sync
    // This is critical - without it, asset operations won't sync
    const { isAuthenticated } = useAuthStore.getState();
    if (isAuthenticated) {
      const result = await documentMutationService.loadDocument(book.id);
      if (result.success && result.data) {
        console.log('[Index] Loaded document for sync:', result.data.version);
        
        // Use unified function for consistent data loading
        // This fixes the conflicting asset path issue by using world_document.assets consistently
        const loadSuccess = await loadWorldDocumentData(result, book.id, {
          loadAssets: true,
          loadBackgrounds: true,
          loadTags: true,
          skipIfAssetsExist: false
        });
        
        if (!loadSuccess) {
          console.error('[Index] Failed to load world document data in handleEnterBook');
        }
      } else if (result.error === 'Project not found') {
        // Book doesn't exist on server yet - create it
        console.log('[Index] Book not found on server, creating project...');
        const created = await documentMutationService.createProject(
          book.id, 
          book.title,
          book.coverPageSettings
        );
        if (created) {
          console.log('[Index] Created project on server for book:', book.title);
        } else {
          console.warn('[Index] Failed to create project on server');
        }
      } else {
        console.warn('[Index] Could not load document from server:', result.error);
      }
      
      // Sync any backgrounds that were saved locally before entering the book
      // These weren't synced because no project was loaded at the time
      const backgroundStore = useBackgroundStore.getState();
      const allConfigs = backgroundStore.configs;
      if (Object.keys(allConfigs).length > 0) {
        console.log('[Index] Syncing', Object.keys(allConfigs).length, 'backgrounds to cloud');
        documentMutationService.saveGlobalBackgrounds(allConfigs);
      }
    }
    
    // Store the book data immediately - no setTimeout to avoid timing issues
    setCurrentBook(book.id);
    documentMutationService.setProjectId(book.id);
    
    // Use unified function for consistent book world data loading
    if (book.worldData) {
      // Create a mock document result for unified function
      const mockDocumentResult = {
        success: true,
        data: {
          world_document: book.worldData
        }
      };
      
      // Use unified function for consistent data loading
      loadWorldDocumentData(mockDocumentResult, book.id, {
        loadAssets: true,
        loadBackgrounds: true,
        loadTags: true,
        skipIfAssetsExist: true // Preserve existing assets if they exist
      }).then(loadSuccess => {
        if (!loadSuccess) {
          console.error('[Index] Failed to load book world data');
        }
      }).catch(err => {
        console.error('[Index] Error loading book world data:', err);
      });
    }
  };

  const handleBookEntryComplete = () => {
    setShowBookEntryAnimation(false);
  };

  const handleOpenBookLibrary = () => {
    setBookLibraryOpen(true);
  };

  const handleDeleteWorld = async (book: Book) => {
    await deleteBook(book.id);
  };

  const handleWorldCreated = async (newBookId: string) => {
    // Find the newly created book
    const allBooks = getAllBooks();
    const newBook = allBooks.find(book => book.id === newBookId);
    
    if (newBook) {
      // Immediately create project on server for cloud sync BEFORE selecting
      const { isAuthenticated } = useAuthStore.getState();
      if (isAuthenticated) {
        console.log('[Index] Creating server project for new book:', newBook.title);
        const created = await documentMutationService.createProject(
          newBook.id,
          newBook.title,
          newBook.coverPageSettings
        );
        if (created) {
          console.log('[Index] Server project created for new book:', newBook.title);
        } else {
          console.warn('[Index] Failed to create server project for new book');
        }
      }
      
      // Select the new book and focus on it in single view mode
      // This will set the project ID for DocumentMutationService
      await handleBookSelect(newBook);
    }
  };

  const handleEditBook = () => {
    const currentBook = getAllBooks().find(b => b.id === currentBookId);
    if (currentBook) {
      setIsEditDialogOpen(true);
    }
  };

  const backgroundStyle = {
    backgroundImage: `url(${theme === 'dark' ? cosmicBackground : lightBackground})`,
    backgroundSize: '300%',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };

  return (
    <div className="h-screen bg-background text-foreground relative overflow-hidden">
      {/* Quota Warning Bar */}
      <QuotaWarningBar />
      
      {/* Conflict Resolution Status */}
      <div className="absolute top-12 right-4 z-50">
        <ConflictStatusIndicator />
      </div>
      
            
      {/* Media Experience Layers */}
      {appPhase === 'SPLASH' && <SplashScreen />}
      {appPhase === 'INTRO_VIDEO' && <IntroVideo />}
      {showBookEntryAnimation && (
        <BookEntryAnimation onEntryComplete={handleBookEntryComplete} />
      )}

      {/* Background Layer */}
      <div
        className={`absolute inset-0 w-full h-full transition-opacity duration-2000 ${
          appPhase === 'LIBRARY' || appPhase === 'BOOK_VIEW' ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          backgroundImage: `url(${theme === 'dark' ? cosmicBackground : lightBackground})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />
      
      {/* Content Overlay with Flex Container */}
      <div className={`relative z-10 h-screen transition-opacity duration-2000 flex w-full overflow-hidden ${
        appPhase === 'LIBRARY' || appPhase === 'BOOK_VIEW' ? 'opacity-100' : 'opacity-0'
      }`}>
        {/* Main App Content - with dynamic max-width based on ad visibility */}
        <div className="flex-1 h-screen overflow-hidden" style={{ maxWidth: `calc(100vw - ${showAds ? '160px' : '0px'})` }}>
      {/* New Book Shelf */}
      {bookLibraryOpen && (
        <div className={`fixed inset-0 z-50 h-screen overflow-hidden ${
          theme === 'dark' ? 'bg-black/95' : 'bg-background/95'
        }`}>
          <div className="relative h-full">
            
            {/* Book Shelf Component */}
            <BookShelf
              onBookSelect={handleBookSelect}
              onBookEnter={handleEnterBook}
              showDeleteButton={true}
              onBookDelete={handleDeleteWorld}
              className="h-full"
              enableEditing={true}
            />

            {/* Edit Book Button */}
            <div className="absolute bottom-20 left-6 z-10">
              <Button
                onClick={handleEditBook}
                disabled={!currentBookId}
                className={`${
                  theme === 'dark' 
                    ? 'bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:opacity-50' 
                    : 'bg-primary hover:bg-primary/90 disabled:bg-gray-400 disabled:opacity-50'
                }`}
                title="Edit current book"
              >
                <Edit className="w-4 h-4 mr-2" />
                <span className="text-sm font-medium">Edit</span>
              </Button>
            </div>

            {/* Create Book Button */}
            <div className="absolute bottom-6 left-6 z-10">
              <WorldCreationDialog onWorldCreated={handleWorldCreated}>
                <Button 
                  id="create-world-button"
                  ref={createWorldButtonRef}
                  className={`${
                    theme === 'dark' 
                      ? 'bg-blue-600 hover:bg-blue-700' 
                      : 'bg-primary hover:bg-primary/90'
                  }`}>
                  ✨ Create New World
                </Button>
              </WorldCreationDialog>
            </div>

            {/* Backup/Restore Button */}
            <div className="absolute bottom-6 right-6 z-10">
              <DataManager>
                <Button 
                  id="backup-restore-button"
                  variant="outline" 
                  size="sm" 
                  className={`${
                    theme === 'dark'
                      ? 'border-gray-600 text-gray-200 hover:bg-gray-800'
                      : 'border-border text-foreground hover:bg-accent'
                  }`}>
                  <Database className="w-4 h-4 mr-2" />
                  Backup/Restore
                </Button>
              </DataManager>
            </div>
          </div>
        </div>
      )}

      {/* Main App Content */}
      {currentBookId && (
        <div className="flex h-screen flex-col md:flex-row overflow-hidden">
          {/* Main Content Area */}
          <div className="flex-1 flex flex-col relative min-h-0 overflow-hidden">
            {/* Asset Port */}
            <div className="flex-1 p-2 md:p-4 overflow-hidden">
              <AssetPort 
                onToggleSidebar={() => setSidebarOpen(prev => !prev)} 
                currentWorldTitle={getAllBooks().find(b => b.id === currentBookId)?.title || 'Current World'}
                onOpenWorldLibrary={handleOpenBookLibrary}
              />
            </div>
          </div>

          {/* Fantasy Sidebar - Mobile Overlay */}
          <aside className={`fantasy-overlay ${sidebarOpen ? "is-open" : ""} ${!showAds ? "no-ads" : ""}`} aria-hidden={!sidebarOpen}>
            <div className="fantasy-sidebar">
              <div className="fantasy-sidebar-content">
                {/* Use the new AssetExplorer component */}
                <AssetExplorer sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(prev => !prev)} />
              </div>
            </div>
          </aside>

          {/* Background Editor - Independent of sidebar */}
          {isEditingBackground && (
            <BackgroundControls 
              assetId={currentViewportId} 
              onSave={handleBackgroundSave} 
              onToggleSidebar={() => setSidebarOpen(prev => !prev)}
            />
          )}
        </div>
      )}
        </div>
        
        {/* Side Ad Banner */}
        <SideAdBanner />
      </div>
      
      {/* Account Modal */}
      <EnhancedAccountModal
        isOpen={showAccountModal}
        onClose={() => setShowAccountModal(false)}
      />

      {/* Book Edit Dialog */}
      <BookEditDialog
        book={getAllBooks().find(b => b.id === currentBookId)}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
      />

      {/* Onboarding Helper Popup */}
      <OnboardingPopup anchorElement={createWorldButtonRef.current} />

      {/* Undo Status Indicator */}
      <UndoStatus />

    </div>
  );
};

export default Index;
