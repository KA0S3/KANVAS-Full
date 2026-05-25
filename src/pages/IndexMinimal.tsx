import { useState, useEffect } from "react";
import { BookOpen } from "lucide-react";
import cosmicBackground from "@/assets/cosmic-background.png";
import lightBackground from "@/assets/BG-light.png";
import { Button } from "@/components/ui/button";
import { useAssetStore } from "@/stores/assetStore";
import { useBookStore } from "@/stores/bookStoreSimple";
import { useThemeStore } from "@/stores/themeStore";
import type { Book } from "@/types/book";
import { cssUrl } from "@/utils/cssUrl";

const IndexMinimal = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [bookLibraryOpen, setBookLibraryOpen] = useState(true);
  const { currentActiveId, loadWorldData } = useAssetStore();
  const { currentBookId, setCurrentBook, getAllBooks, createBook } = useBookStore();
  const { theme } = useThemeStore();

  useEffect(() => {
    document.documentElement.className = theme;
  }, [theme]);

  const handleBookSelect = (book: Book) => {
    setCurrentBook(book.id);
    loadWorldData(book.worldData);
    setBookLibraryOpen(false);
  };

  const backgroundStyle = {
    backgroundImage: cssUrl(theme === 'dark' ? cosmicBackground : lightBackground),
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };

  return (
    <div className="min-h-screen bg-background text-foreground" style={backgroundStyle}>
      {/* Simple Book Library */}
      {bookLibraryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-8 max-w-4xl max-h-[80vh] overflow-y-auto m-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-white">📚 World Library</h2>
              <span className="text-sm text-gray-300 bg-gray-800 px-3 py-1 rounded-md border border-gray-600">
                Books: {getAllBooks().length} / ∞
              </span>
            </div>
            
            <div className="space-y-4">
              {getAllBooks().length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-lg text-white mb-4">No worlds yet. Create your first world!</p>
                  <Button onClick={async () => {
                    const newBookId = await createBook({
                      title: `World ${getAllBooks().length + 1}`,
                      description: 'A new world',
                      color: '#3b82f6',
                      worldData: { assets: {}, tags: {}, globalCustomFields: [], viewportOffset: { x: -45, y: -20 }, viewportScale: 1 }
                    });
                    setCurrentBook(newBookId);
                  }} className="mb-4">
                    ✨ Create First World
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                  {getAllBooks().map((book) => (
                    <div 
                      key={book.id}
                      className="p-4 border border-gray-600 rounded-lg cursor-pointer hover:bg-gray-700 transition-colors"
                      onClick={() => handleBookSelect(book)}
                    >
                      <h3 className="font-bold text-lg text-white">{book.title}</h3>
                      <p className="text-sm text-gray-400">{book.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="flex justify-end mt-6">
              <Button variant="outline" onClick={() => setBookLibraryOpen(false)}>
                ✖️ Close Library
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      {currentBookId && (
        <div className="flex h-screen">
          <div className="absolute top-4 right-4 z-20">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBookLibraryOpen(true)}
              className="gap-2"
            >
              <BookOpen className="w-4 h-4" />
              {getAllBooks().find(b => b.id === currentBookId)?.title || 'Current World'}
            </Button>
          </div>
          
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center p-8">
              <h1 className="text-4xl font-bold text-white mb-4">🎯 Current World</h1>
              <h2 className="text-2xl text-blue-400 mb-2">
                {getAllBooks().find(b => b.id === currentBookId)?.title || 'No World Selected'}
              </h2>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IndexMinimal;
