import { useState, useEffect } from "react";
import { BookOpen } from "lucide-react";
import cosmicBackground from "@/assets/cosmic-background.png";
import lightBackground from "@/assets/BG-light.png";
import { AssetPort } from "@/components/AssetPort";
import { AssetExplorer } from "@/components/explorer/AssetExplorer";
import { BookLibrary } from "@/components/booklibrary/BookLibrary";
import { Button } from "@/components/ui/button";
import { useAssetStore } from "@/stores/assetStore";
import { useBookStore } from "@/stores/bookStoreSimple";
import { useThemeStore } from "@/stores/themeStore";
import type { Book } from "@/types/book";
import { cssUrl } from "@/utils/cssUrl";

const Index = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [bookLibraryOpen, setBookLibraryOpen] = useState(false);
  const { currentActiveId, loadWorldData, getWorldData } = useAssetStore();
  const { currentBookId, setCurrentBook, getAllBooks } = useBookStore();
  const { theme } = useThemeStore();

  useEffect(() => {
    // Apply theme class to document root
    document.documentElement.className = theme;
  }, [theme]);

  // Initialize world data when current book changes
  useEffect(() => {
    if (currentBookId) {
      const book = getAllBooks().find(b => b.id === currentBookId);
      if (book) {
        loadWorldData(book.worldData);
      }
    } else {
      // No book selected, clear world data
      loadWorldData(null);
    }
  }, [currentBookId, loadWorldData, getAllBooks]);

  // Show book library by default for new users
  useEffect(() => {
    const books = getAllBooks();
    if (books.length === 0 && !bookLibraryOpen) {
      setBookLibraryOpen(true);
    }
  }, [getAllBooks, bookLibraryOpen, setBookLibraryOpen]);

  // Auto-save world data when it changes
  useEffect(() => {
    if (currentBookId) {
      const worldData = getWorldData();
      // This will be handled by the auto-save in the store
    }
  }, [currentBookId, getWorldData]);

  const handleBookSelect = (book: Book) => {
    setCurrentBook(book.id);
  };

  const handleOpenBookLibrary = () => {
    setBookLibraryOpen(true);
  };

  const backgroundImage = theme === 'light' ? lightBackground : cosmicBackground;

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Atmospheric Fog Overlay */}
      <div className="fog-viewport-overlay">
        <div className="fog-layer-deep" />
        <div className="fog-layer-whispy" />
      </div>

      {/* Background */}
      <div 
        className="absolute inset-0 bg-center bg-no-repeat"
        style={{ 
          backgroundImage: cssUrl(backgroundImage),
          backgroundSize: theme === 'light' ? "100%" : "95%",
          backgroundPositionY: theme === 'light' ? "-75px" : "-15px",
        }}
      />
      
      {/* Subtle overlay for better glass contrast */}
      <div className="absolute inset-0 bg-background/20" />
      
      {/* Full-screen Asset Port - positioned above the book area */}
      <div className="relative z-10 flex flex-col h-screen p-4 pt-2">
        {/* World Library Button */}
        <div className="absolute top-4 right-4 z-20">
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenBookLibrary}
            className="glass cosmic-glow border-glass-border/40 gap-2"
          >
            <BookOpen className="w-4 h-4" />
            {currentBookId 
              ? getAllBooks().find(b => b.id === currentBookId)?.title || 'Current World'
              : 'Select World'
            }
          </Button>
        </div>
        
        <div className="flex-1 w-full mx-auto pb-4" style={{ height: "calc(100vh - 120px)" }}>
          <div className="min-h-[420px] h-full max-w-7xl mx-auto relative">
            <AssetPort onToggleSidebar={() => setSidebarOpen(prev => !prev)} />
          </div>
        </div>
      </div>

      <aside className={`fantasy-overlay ${sidebarOpen ? "is-open" : ""}`} aria-hidden={!sidebarOpen}>
        <div className="fantasy-sidebar">
          <div className="fantasy-sidebar-content">
            {/* Use the new AssetExplorer component */}
            <AssetExplorer sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(prev => !prev)} />
          </div>
        </div>
      </aside>

      {/* Book Library Modal */}
      <BookLibrary
        isOpen={bookLibraryOpen}
        onClose={() => setBookLibraryOpen(false)}
        onBookSelect={handleBookSelect}
      />
    </div>
  );
};

export default Index;
