import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Plus, BookOpen, ChevronDown, ChevronUp, Sparkles, Settings, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useBookStore } from '@/stores/bookStoreSimple';
import { useThemeStore } from '@/stores/themeStore';
import { useCanCreateBook } from '@/lib/limits';
import { BookCarousel } from './BookCarousel';
import { BookEditor } from './BookEditor';
import { DeleteBookModal } from '@/components/books/DeleteBookModal';
import { AutosaveIndicator } from '@/components/autosave/AutosaveIndicator';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { ZipBackupManager } from '@/components/ZipBackupManager';
import type { Book } from '@/types/book';
import { openPublicAssetUrl } from '@/utils/appUrls';

interface BookLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  onBookSelect?: (book: Book) => void;
}

export function BookLibrary({ isOpen, onClose, onBookSelect }: BookLibraryProps) {
  const { 
    books, 
    currentBookId, 
    viewMode, 
    setViewMode, 
    deleteBook,
    getAllBooks 
  } = useBookStore();
  const { theme } = useThemeStore();
  const { canCreate: canCreateBook } = useCanCreateBook();
  const navigate = useNavigate();

  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [isCreatingBook, setIsCreatingBook] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const [bookToDelete, setBookToDelete] = useState<Book | null>(null);
  const [generatorsOpen, setGeneratorsOpen] = useState(false);

  const allBooks = getAllBooks();

  const handleBookSelect = (book: Book) => {
    onBookSelect?.(book);
    onClose();
  };

  const handleBookEdit = (book: Book) => {
    setEditingBook(book);
  };

  const handleBookDelete = (book: Book) => {
    setBookToDelete(book);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (bookToDelete) {
      await deleteBook(bookToDelete.id);
      setBookToDelete(null);
      setDeleteModalOpen(false);
    }
  };

  const handleCreateBook = () => {
    setIsCreatingBook(true);
  };

  const handleCloseEditor = () => {
    setEditingBook(null);
    setIsCreatingBook(false);
  };

  const openGenerator = (generator: string) => {
    openPublicAssetUrl(`generators/${generator}.html`, '_blank', 'width=1200,height=800');
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-6xl w-full h-[80vh] glass cosmic-glow border-glass-border/40 flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              World Library
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col flex-1 gap-4 min-h-0">
            {/* Header Controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {/* Book Count */}
                <span className="text-sm text-muted-foreground bg-muted/50 px-2 py-1 rounded-md">
                  Books: {allBooks.length} / ∞
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Generators Dropdown */}
                <div className="relative">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setGeneratorsOpen(!generatorsOpen)}
                    className="gap-2"
                    title="Generators"
                    id="generators-button-library"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span className="hidden sm:inline">Generators</span>
                    {generatorsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </Button>
                  
                  {generatorsOpen && (
                    <div className="absolute top-full mt-1 right-0 z-50 bg-background border border-border rounded-md shadow-lg min-w-[200px]">
                      <div className="py-1">
                        <button
                          onClick={() => openGenerator('character-generator')}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
                        >
                          <span>👤</span> Character Generator
                        </button>
                        <button
                          onClick={() => openGenerator('battle-manager')}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
                        >
                          <span>⚔️</span> Battle Manager
                        </button>
                        <button
                          onClick={() => openGenerator('city-generator')}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
                        >
                          <span>🏰</span> City Generator
                        </button>
                        <button
                          onClick={() => openGenerator('god-generator')}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground flex items-center gap-2"
                        >
                          <span>✨</span> God Generator
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Settings Button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSettingsPanelOpen(true)}
                  className="gap-2"
                  title="Settings"
                  id="settings-button-library"
                >
                  <Settings className="w-4 h-4" />
                  <span className="hidden sm:inline">Settings</span>
                </Button>
                
                {/* Create Book Button */}
                <div className="flex items-center gap-2">
                  <Button 
                    onClick={handleCreateBook} 
                    className="gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    New World
                  </Button>
                </div>
              </div>
            </div>

            {/* Book Display Area */}
            <div className="flex-1 min-h-0">
              <BookCarousel
                books={allBooks}
                selectedBookId={currentBookId}
                onBookSelect={handleBookSelect}
                onBookEdit={handleBookEdit}
                onBookDelete={handleBookDelete}
              />
            </div>

            {/* Footer */}
            <div className="pt-4 border-t border-glass-border/30">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <div className="flex items-center gap-3">
                  <span>
                    {currentBookId 
                      ? `Current: ${allBooks.find(b => b.id === currentBookId)?.title || 'Unknown'}`
                      : 'No world selected'
                    }
                  </span>
                  <AutosaveIndicator />
                </div>
                <div className="flex items-center gap-2">
                  <ZipBackupManager>
                    <Button variant="outline" className="gap-2">
                      <Archive className="w-4 h-4" />
                      ZIP Backup
                    </Button>
                  </ZipBackupManager>
                  <Button variant="outline" onClick={onClose}>
                    Close
                  </Button>
                </div>
              </div>
            </div>
          </div>

        </DialogContent>
      </Dialog>

      {/* Book Editor Modal */}
      <BookEditor
        isOpen={isCreatingBook || !!editingBook}
        onClose={handleCloseEditor}
        book={editingBook}
      />

      {/* Settings Panel */}
      {settingsPanelOpen && (
        <SettingsPanel
          isOpen={settingsPanelOpen}
          onClose={() => setSettingsPanelOpen(false)}
        />
      )}

      {/* Delete Book Modal */}
      <DeleteBookModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setBookToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        book={bookToDelete}
      />

    </>
  );
}
