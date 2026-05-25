import { useState, useEffect, useRef, useCallback } from "react";
import { BookOpen, ChevronLeft, Trash2, Edit, Archive } from "lucide-react";
import { ConflictStatusIndicator } from "@/components/ConflictStatusIndicator";
import cosmicBackground from "@/assets/cosmic-background.png";
import lightBackground from "@/assets/BG-light.png";
import { AssetPort } from "@/components/AssetPort";
import { AssetExplorer } from "@/components/explorer/AssetExplorer";
import { BackgroundControls } from "@/components/asset/BackgroundControls";
import { Button } from "@/components/ui/button";
import WorldCreationDialog from "@/components/WorldCreationDialog";
import { ZipBackupManager } from "@/components/ZipBackupManager";
import BookShelf from "@/components/books/BookShelf";
import BookEditDialog from "@/components/BookEditDialog";
import "@/components/books/leather-styles.css";
import SideAdBanner from "@/components/SideAdBanner";
import { UndoStatus } from "@/components/UndoStatus";
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from "@/stores/themeStore";
import { useBookStore } from "@/stores/bookStoreSimple";
import { useKanvasStore } from '@/stores/kanvasStore';
import { useProjectStore } from '@/stores/projectStore';
import { useUIStore } from '@/stores/uiStore';
import { useSyncStore } from '@/stores/syncStore';
import { useMediaStore } from '@/stores/mediaStore';
import { audioEngine } from "@/services/AudioEngine";
import { hydrateLocalPersistenceFromIndexedDB } from "@/startup/localPersistenceHydration";
import SplashScreen from "@/components/media/SplashScreen";
import IntroVideo from "@/components/media/IntroVideo";
import { WorldAssetTransition } from "@/components/media/WorldAssetTransition";
import OnboardingPopup from "@/components/OnboardingPopup";
import type { Book } from "@/types/book";
import { navigationCache } from "@/utils/navigationCache";
import { cssUrl } from "@/utils/cssUrl";

const ENTER_TRANSITION_MS = 1250;
const RETURN_TRANSITION_MS = 950;
const BOOK_VIEW_MOUNT_DELAY_MS = 80;
const LIBRARY_REVEAL_DELAY_MS = 180;

const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

const Index = () => {
  // FEATURE FLAG: Change to true to re-enable ads for all users
  const ADS_ENABLED_FOR_ALL_USERS = false;
  
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [backgroundRefreshTrigger, setBackgroundRefreshTrigger] = useState(0);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isHydratingLocal, setIsHydratingLocal] = useState(true);
  const [viewportTransition, setViewportTransition] = useState<{
    direction: 'enter' | 'return';
    book?: Book;
  } | null>(null);
  const createWorldButtonRef = useRef<HTMLButtonElement>(null);
  const transitionActiveRef = useRef(false);
  const transitionTokenRef = useRef(0);
  const delayedPhaseTimerRef = useRef<number | null>(null);
  const { getProjectAssets, currentProjectId } = useKanvasStore();
  const { setCurrentProject, userProjects } = useProjectStore();
  const { selectedAssets, selectAsset, clearSelection } = useUIStore();
  const { syncStatus } = useSyncStore();
  const { currentBookId, setCurrentBook, getAllBooks, deleteBook, hydrateBooks } = useBookStore();
  const { theme } = useThemeStore(); // Adding back theme store - confirmed working
  const {
    appPhase,
    showLibrary,
    hasCompletedIntroExperience,
    enterBookView,
    completeReturningSplash,
  } = useMediaStore(); // Using mediaStore for app phase management
  const { effectiveLimits, initializeAuth } = useAuthStore();
  
  // Fallback for missing stores
  const bookLibraryOpen = appPhase === 'LIBRARY';
  const loadTagWorldData = (id: string) => console.log('Tag store fallback - loading world data for:', id);
  const showAds = false; // Temporarily disabled

  // Fallback state variables for missing legacy methods
  const [currentActiveId, setCurrentActiveId] = useState<string | null>(null);
  const [currentViewportId, setCurrentViewportId] = useState<string | null>(null);
  const [isEditingBackground, setIsEditingBackground] = useState(false);
  
  // Fallback functions
  const setActiveAsset = (id: string | null) => {
    setCurrentActiveId(id);
    if (id) selectAsset(id);
  };
  const getCurrentBookAssets = () => getProjectAssets(currentProjectId || '');
  const loadWorldData = (id: string) => {
    console.log('Loading world data for:', id);
  };
  const getBackground = () => null;

  // Initialize auth on mount
  useEffect(() => {
    initializeAuth();
    console.log('[Index] Auth initialized');
  }, [initializeAuth]);

  useEffect(() => {
    let cancelled = false;

    const hydrateLocalProjects = async () => {
      setIsHydratingLocal(true);
      try {
        await hydrateLocalPersistenceFromIndexedDB();
      } catch (error) {
        console.error('[Index] Failed to hydrate local projects:', error);
      } finally {
        if (!cancelled) {
          setIsHydratingLocal(false);
        }
      }
    };

    void hydrateLocalProjects();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    hydrateBooks(userProjects);
  }, [hydrateBooks, userProjects]);

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
      if (delayedPhaseTimerRef.current) {
        window.clearTimeout(delayedPhaseTimerRef.current);
      }
    };
  }, []);

  const restoreCachedNavigationAfterSplash = useCallback(async () => {
    const cachedState = navigationCache.getState();
    if (!cachedState || cachedState.appPhase === 'SPLASH') {
      completeReturningSplash('LIBRARY');
      return;
    }

    if (!cachedState.currentBookId) {
      completeReturningSplash('LIBRARY');
      return;
    }

    const book = getAllBooks().find(b => b.id === cachedState.currentBookId);
    if (!book) {
      completeReturningSplash('LIBRARY');
      return;
    }

    setCurrentBook(cachedState.currentBookId);
    setCurrentViewportId(cachedState.currentViewportId);
    setSidebarOpen(cachedState.sidebarOpen);
    setIsEditingBackground(cachedState.isEditingBackground ?? false);

    if (cachedState.currentActiveId) {
      setActiveAsset(cachedState.currentActiveId);
    } else {
      setActiveAsset(null);
    }

    try {
      await setCurrentProject(cachedState.currentBookId);
      await useSyncStore.getState().loadSyncQueue(cachedState.currentBookId);
      console.log('[Index] Local state restored for cached project:', cachedState.currentBookId);
    } catch (err) {
      console.error('[Index] Failed to restore cached project locally:', err);
    }

    completeReturningSplash(cachedState.bookLibraryOpen ? 'LIBRARY' : cachedState.appPhase === 'BOOK_VIEW' ? 'BOOK_VIEW' : 'LIBRARY');
  }, [completeReturningSplash, getAllBooks, setCurrentBook, setCurrentProject]);

  // Save navigation state when relevant state changes (non-intrusive)
  useEffect(() => {
    // Don't save state during splash screen - let users have fresh starts
    if (appPhase === 'SPLASH') {
      if (!hasCompletedIntroExperience) {
        navigationCache.clearState();
      }
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
    hasCompletedIntroExperience,
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
        const currentAssets = getCurrentBookAssets();
        const hasAssets = currentAssets.length > 0;
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
          // Load anyway to ensure consistency using V2 stores
          const canonicalAssets = Object.values(assets).map((legacyAsset: any) => ({
            id: legacyAsset.id,
            projectId: targetBookId,
            parentId: legacyAsset.parentId,
            layout: {
              x: legacyAsset.x || 0,
              y: legacyAsset.y || 0,
              width: legacyAsset.width || 100,
              height: legacyAsset.height || 100,
              zIndex: legacyAsset.zIndex || 0,
            },
            content: {
              title: legacyAsset.name,
              text: legacyAsset.content,
              customFields: legacyAsset.customFields || {},
            },
            style: legacyAsset.backgroundConfig || {},
            behavior: legacyAsset.viewportConfig || {},
            metadata: {
              tags: legacyAsset.type ? [legacyAsset.type] : [],
              createdAt: legacyAsset.createdAt || new Date().toISOString(),
              updatedAt: legacyAsset.updatedAt || new Date().toISOString(),
              version: 1,
            },
          }));
          
          const kanvasStore = useKanvasStore.getState();
          for (const asset of canonicalAssets) {
            await kanvasStore.createAsset(asset);
          }
          
          console.log('[Index] Assets loaded into V2 store for consistency:', canonicalAssets.length);
        } else {
          // Load assets using V2 stores
          if (Object.keys(assets).length > 0) {
            console.log('[Index] Loading assets through V2 stores');
            
            const canonicalAssets = Object.values(assets).map((legacyAsset: any) => ({
              id: legacyAsset.id,
              projectId: targetBookId,
              parentId: legacyAsset.parentId,
              layout: {
                x: legacyAsset.x || 0,
                y: legacyAsset.y || 0,
                width: legacyAsset.width || 100,
                height: legacyAsset.height || 100,
                zIndex: legacyAsset.zIndex || 0,
              },
              content: {
                title: legacyAsset.name,
                text: legacyAsset.content,
                customFields: legacyAsset.customFields || {},
              },
              style: legacyAsset.backgroundConfig || {},
              behavior: legacyAsset.viewportConfig || {},
              metadata: {
                tags: legacyAsset.type ? [legacyAsset.type] : [],
                createdAt: legacyAsset.createdAt || new Date().toISOString(),
                updatedAt: legacyAsset.updatedAt || new Date().toISOString(),
                version: 1,
              },
            }));
            
            const kanvasStore = useKanvasStore.getState();
            for (const asset of canonicalAssets) {
              await kanvasStore.createAsset(asset);
            }
            
            console.log('[Index] Assets loaded into V2 store:', canonicalAssets.length);
          } else {
            console.log('[Index] No assets to load - incoming assets array is empty');
          }
        }
      } else {
        // Load assets unconditionally using V2 stores
        if (Object.keys(assets).length > 0) {
          console.log('[Index] Loading assets unconditionally with V2 stores');
          
          // Convert legacy assets to canonical format and load into V2 store
          const canonicalAssets = Object.values(assets).map((legacyAsset: any) => ({
            id: legacyAsset.id,
            projectId: targetBookId,
            parentId: legacyAsset.parentId,
            layout: {
              x: legacyAsset.x || 0,
              y: legacyAsset.y || 0,
              width: legacyAsset.width || 100,
              height: legacyAsset.height || 100,
              zIndex: legacyAsset.zIndex || 0,
            },
            content: {
              title: legacyAsset.name,
              text: legacyAsset.content,
              customFields: legacyAsset.customFields || {},
            },
            style: legacyAsset.backgroundConfig || {},
            behavior: legacyAsset.viewportConfig || {},
            metadata: {
              tags: legacyAsset.type ? [legacyAsset.type] : [],
              createdAt: legacyAsset.createdAt || new Date().toISOString(),
              updatedAt: legacyAsset.updatedAt || new Date().toISOString(),
              version: 1,
            },
          }));
          
          // Load into V2 store
          const kanvasStore = useKanvasStore.getState();
          for (const asset of canonicalAssets) {
            await kanvasStore.createAsset(asset);
          }
          
          console.log('[Index] Assets loaded into V2 store:', canonicalAssets.length);
        }
      }
    }

    // BACKGROUND RESTORATION - Fallback approach
    if (loadBackgrounds && worldDocument.backgrounds) {
      const backgrounds = worldDocument.backgrounds;
      console.log('[Index] Skipping background restoration - background store not available in V2');
      console.log('[Index] Background data available:', Object.keys(backgrounds).length, 'backgrounds');
    }

    // TAG RESTORATION - Fallback approach
    if (loadTags && (worldDocument.tags || worldDocument.assetTags)) {
      console.log('[Index] Skipping tag restoration - tag store not available in V2');
      console.log('[Index] Tag data available:', {
        tags: Object.keys(worldDocument.tags || {}).length,
        assetTags: Object.keys(worldDocument.assetTags || {}).length
      });
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
    
    try {
      await setCurrentProject(book.id);
      await useSyncStore.getState().loadSyncQueue(book.id);
      console.log('[Index] Local project bundle loaded for book selection:', book.title);
    } catch (err) {
      console.warn('[Index] Failed to load local project bundle:', err);
    }
  };

  const handleEnterBook = async (book: Book) => {
    if (transitionActiveRef.current) {
      return;
    }

    transitionActiveRef.current = true;
    const token = transitionTokenRef.current + 1;
    transitionTokenRef.current = token;

    if (delayedPhaseTimerRef.current) {
      window.clearTimeout(delayedPhaseTimerRef.current);
      delayedPhaseTimerRef.current = null;
    }

    setViewportTransition({ direction: 'enter', book });
    setCurrentBook(book.id);

    const projectLoad = (async () => {
      try {
        await setCurrentProject(book.id);
        await useSyncStore.getState().loadSyncQueue(book.id);
        console.log('[Index] Local project bundle loaded for book entry:', book.title);
      } catch (error) {
        console.warn('[Index] Failed to load local project bundle:', error);
      }
    })();

    delayedPhaseTimerRef.current = window.setTimeout(() => {
      if (transitionTokenRef.current === token) {
        enterBookView();
      }
      delayedPhaseTimerRef.current = null;
    }, BOOK_VIEW_MOUNT_DELAY_MS);

    await Promise.all([projectLoad, wait(ENTER_TRANSITION_MS)]);

    if (transitionTokenRef.current === token) {
      enterBookView();
      setViewportTransition(null);
      transitionActiveRef.current = false;
    }
  };

  const handleOpenBookLibrary = async () => {
    if (transitionActiveRef.current) {
      return;
    }

    transitionActiveRef.current = true;
    const token = transitionTokenRef.current + 1;
    transitionTokenRef.current = token;
    const currentBook = getAllBooks().find(b => b.id === currentBookId);

    if (delayedPhaseTimerRef.current) {
      window.clearTimeout(delayedPhaseTimerRef.current);
      delayedPhaseTimerRef.current = null;
    }

    setViewportTransition({ direction: 'return', book: currentBook });

    delayedPhaseTimerRef.current = window.setTimeout(() => {
      if (transitionTokenRef.current === token) {
        showLibrary();
      }
      delayedPhaseTimerRef.current = null;
    }, LIBRARY_REVEAL_DELAY_MS);

    await wait(RETURN_TRANSITION_MS);

    if (transitionTokenRef.current === token) {
      showLibrary();
      setViewportTransition(null);
      transitionActiveRef.current = false;
    }
  };

  const handleDeleteWorld = async (book: Book) => {
    await deleteBook(book.id);
  };

  const handleWorldCreated = async (newBookId: string) => {
    // Find the newly created book
    const allBooks = getAllBooks();
    const newBook = allBooks.find(book => book.id === newBookId);
    
    if (newBook) {
      // Open the new world immediately. The first-ever entry uses the transition animation,
      // later creations go straight into the book view.
      await handleEnterBook(newBook);
      console.log('[Index] V2 project initialized for new book:', newBook.title);
    }
  };

  const handleEditBook = () => {
    const currentBook = getAllBooks().find(b => b.id === currentBookId);
    if (currentBook) {
      setIsEditDialogOpen(true);
    }
  };

  const backgroundStyle = {
    backgroundImage: cssUrl(theme === 'dark' ? cosmicBackground : lightBackground),
    backgroundSize: '270%',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };

  return (
    <div className="h-screen bg-background text-foreground relative overflow-hidden">
      {/* Conflict Resolution Status */}
      <div className="absolute top-12 right-4 z-50">
        <ConflictStatusIndicator />
      </div>
      
            
      {/* Media Experience Layers */}
      {appPhase === 'SPLASH' && (
        <SplashScreen
          isAppLoading={isHydratingLocal}
          hasCompletedIntroExperience={hasCompletedIntroExperience}
          onReturningSplashComplete={restoreCachedNavigationAfterSplash}
        />
      )}
      {appPhase === 'INTRO_VIDEO' && <IntroVideo />}

      {/* Background Layer */}
      <div
        className={`absolute inset-0 w-full h-full transition-opacity duration-2000 ${
          appPhase === 'LIBRARY' || appPhase === 'BOOK_VIEW' ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          backgroundImage: cssUrl(theme === 'dark' ? cosmicBackground : lightBackground),
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

            {/* ZIP Backup button */}
            <div className="absolute bottom-6 right-6 z-10 flex flex-col items-end gap-2">
              <ZipBackupManager>
                <Button
                  id="zip-backup-button"
                  variant="outline"
                  size="sm"
                  className={`${
                    theme === 'dark'
                      ? 'border-gray-600 text-gray-200 hover:bg-gray-800'
                      : 'border-border text-foreground hover:bg-accent'
                  }`}
                >
                  <Archive className="w-4 h-4 mr-2" />
                  ZIP Backup
                </Button>
              </ZipBackupManager>
            </div>

          </div>
        </div>
      )}

      {/* Main App Content */}
      {currentBookId && (
        <div className={`asset-viewport-shell flex h-screen flex-col md:flex-row overflow-hidden ${
          viewportTransition?.direction === 'enter'
            ? 'is-transition-enter'
            : viewportTransition?.direction === 'return'
              ? 'is-transition-return'
              : ''
        }`}>
          {/* Main Content Area */}
          <div className="flex-1 flex flex-col relative min-h-0 overflow-hidden">
            {/* Asset Port */}
            <div className="flex-1 overflow-hidden">
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
              onClose={() => setIsEditingBackground(false)}
              onToggleSidebar={() => setSidebarOpen(prev => !prev)}
            />
          )}
        </div>
      )}
        </div>
        
        {/* Side Ad Banner */}
        <SideAdBanner />
      </div>
      
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

      {viewportTransition && (
        <WorldAssetTransition
          direction={viewportTransition.direction}
          book={viewportTransition.book}
        />
      )}

    </div>
  );
};

export default Index;
