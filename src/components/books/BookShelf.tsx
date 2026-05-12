import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, User, Users, Building, Sparkles, Swords, Wand2 } from 'lucide-react';
import { useBookStore } from '@/stores/bookStoreSimple';
import { useThemeStore } from '@/stores/themeStore';
import { useAuthStore } from '@/stores/authStore';
import { useMediaStore } from '@/stores/mediaStore';
import { Button } from '@/components/ui/button';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { AccountModal } from '@/components/account/AccountModal';
import { LocalStorageWarning } from '@/components/LocalStorageWarning';
import { AutosaveIndicator } from '@/components/autosave/AutosaveIndicator';
import type { Book } from '@/types/book';
import SingleBookFocus from './SingleBookFocus';
import BookSpineView from './BookSpineView';
import ViewModeSelector from './ViewModeSelector';
import BookEditDialog from '@/components/BookEditDialog';

interface BookShelfProps {
  onBookSelect: (book: Book) => void;
  onBookEnter?: (book: Book) => void;
  showDeleteButton?: boolean;
  onBookDelete?: (book: Book) => void;
  className?: string;
  enableEditing?: boolean; // New prop to enable editing functionality
}

const BookShelf: React.FC<BookShelfProps> = ({
  onBookSelect,
  onBookEnter,
  showDeleteButton = false,
  onBookDelete,
  className = '',
  enableEditing = false
}) => {
  const { viewMode, setViewMode, getAllBooks, currentBookId, setCurrentBook, getCurrentBook } = useBookStore();
  const { theme } = useThemeStore();
  const { user, plan, isAuthenticated, effectiveLimits } = useAuthStore();
  const { professionalMode } = useMediaStore();
  const navigate = useNavigate();
  const books = getAllBooks();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [generatorsOpen, setGeneratorsOpen] = useState(false);

  const openGenerator = (generator: string) => {
    window.open(`/generators/${generator}.html`, '_blank', 'noopener,noreferrer');
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (generatorsOpen) {
        setGeneratorsOpen(false);
      }
    };

    if (generatorsOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => {
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [generatorsOpen]);

  // Helper function to get max books display
  const getMaxBooksDisplay = () => {
    // Check effective limits first (owner keys, licenses, etc.)
    if (effectiveLimits?.maxBooks !== undefined) {
      return effectiveLimits.maxBooks === -1 ? '∞' : effectiveLimits.maxBooks;
    }
    
    // Fallback to plan-based limits
    const maxBooksByPlan = {
      free: 1,
      pro: -1, // Unlimited
      lifetime: -1 // Unlimited
    };
    
    const maxBooks = maxBooksByPlan[plan as keyof typeof maxBooksByPlan] || 1;
    return maxBooks === -1 ? '∞' : maxBooks;
  };

  const handleBookSelect = (book: Book) => {
    // Set the current book in store
    setCurrentBook(book.id);
    // If selecting from spine view, switch to single view mode
    if (viewMode === 'spine') {
      setViewMode('single');
    }
    onBookSelect(book);
  };

  const handleViewModeChange = (newMode: 'single' | 'spine') => {
    setViewMode(newMode);
  };

  const handleAccountClick = () => {
    // Check if user is authenticated and is an owner
    if (isAuthenticated && user && plan) {
      const ownerEmail = import.meta.env.VITE_OWNER_EMAIL;
      const isOwner = user.email === ownerEmail && plan === 'owner';
      
      // Always open account modal for all users including owners
      setIsAccountModalOpen(true);
    } else {
      // Open account modal for non-authenticated users
      setIsAccountModalOpen(true);
    }
  };

  const handleEditBook = () => {
    const currentBook = getCurrentBook();
    if (currentBook) {
      setIsEditDialogOpen(true);
    }
  };

  const renderViewMode = () => {
    switch (viewMode) {
      case 'single':
        return (
          <SingleBookFocus
            books={books}
            selectedBookId={currentBookId}
            onBookSelect={handleBookSelect}
            onBookEnter={onBookEnter}
            onBookDelete={onBookDelete}
            showDeleteButton={showDeleteButton}
            enableEditing={enableEditing}
            onBookEdit={handleEditBook}
          />
        );
      case 'spine':
        return (
          <BookSpineView
            books={books}
            selectedBookId={currentBookId}
            onBookSelect={handleBookSelect}
            onBookDelete={onBookDelete}
            showDeleteButton={showDeleteButton}
            enableEditing={enableEditing}
          />
        );
      default:
        return (
          <SingleBookFocus
            books={books}
            selectedBookId={currentBookId}
            onBookSelect={handleBookSelect}
            onBookEnter={onBookEnter}
            onBookDelete={onBookDelete}
            showDeleteButton={showDeleteButton}
            enableEditing={enableEditing}
          />
        );
    }
  };

  return (
    <div 
      className={`relative h-full ${className}`}
      style={{
        backgroundImage: `url(${theme === 'dark' ? '/pedestal-dark.png' : '/pedestal-light.png'})`,
        backgroundSize: '150%',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-10">
        <div className="flex items-center justify-between px-6 py-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className={`text-xl font-bold drop-shadow-lg ${
                theme === 'dark' ? 'text-white' : 'text-foreground'
              }`}>World Library</h1>
              <AutosaveIndicator compact={true} />
            </div>
            <p className={`text-sm drop-shadow ${
              theme === 'dark' ? 'text-white/80' : 'text-muted-foreground'
            }`}>
              {getMaxBooksDisplay()} book{getMaxBooksDisplay() !== '∞' && getMaxBooksDisplay() !== 1 ? 's' : ''} available
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            {/* LocalStorage Warning - only show when not authenticated */}
            {!isAuthenticated && (
              <LocalStorageWarning onOpenAccountModal={handleAccountClick} />
            )}
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleAccountClick}
              className={`${
                theme === 'dark' 
                  ? 'border-white/20 text-white hover:bg-white/10' 
                  : 'border-border text-foreground hover:bg-accent'
              }`}
              title={isAuthenticated ? "Account" : "Sign In"}
            >
              <User className="w-4 h-4" />
              <span className="hidden sm:inline">{isAuthenticated ? 'Account' : 'Sign In'}</span>
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsSettingsOpen(true)}
              className={`${
                theme === 'dark' 
                  ? 'border-white/20 text-white hover:bg-white/10' 
                  : 'border-border text-foreground hover:bg-accent'
              }`}
            >
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Button>
            
            {/* Generators Button - hidden in professional mode */}
            {!professionalMode && (
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setGeneratorsOpen(!generatorsOpen);
                  }}
                  className={`
                    whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border hover:text-accent-foreground py-2 px-3 h-10 flex items-center justify-center gap-2 bg-sidebar-accent/20 border-sidebar-border hover:bg-sidebar-accent/40
                    ${
                      theme === 'dark' 
                        ? 'border-white/20 text-white hover:bg-white/10' 
                        : 'border-border text-foreground hover:bg-accent'
                    }
                  `}
                  title="Generators"
                >
                  <Wand2 className="w-4 h-4" />
                </button>
                
                {generatorsOpen && (
                  <div className="absolute top-full mt-1 right-0 z-50 min-w-[160px] bg-sidebar border border-sidebar-border rounded-md shadow-lg overflow-hidden">
                    <div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openGenerator('character-generator');
                        }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-sidebar-accent/40 flex items-center gap-2 transition-all duration-200 ease-in-out transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                      >
                        <Users className="w-4 h-4" />
                        <span>Characters</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openGenerator('city-generator');
                        }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-sidebar-accent/40 flex items-center gap-2 transition-all duration-200 ease-in-out transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                      >
                        <Building className="w-4 h-4" />
                        <span>Cities</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openGenerator('god-generator');
                        }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-sidebar-accent/40 flex items-center gap-2 transition-all duration-200 ease-in-out transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>Gods</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openGenerator('battle-manager');
                        }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-sidebar-accent/40 flex items-center gap-2 transition-all duration-200 ease-in-out transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                      >
                        <Swords className="w-4 h-4" />
                        <span>Battles</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* View Mode Selector - Centered below header */}
      <div className="absolute top-20 left-0 right-0 z-10 flex justify-center">
        <ViewModeSelector
          currentMode={viewMode}
          onModeChange={handleViewModeChange}
          bookCount={books.length}
          enableEditing={enableEditing}
          onEditBook={handleEditBook}
          showEditButton={false}
        />
      </div>

      {/* Main Content Area */}
      <div className="pt-32 h-full">
        <div className="relative h-full transition-all duration-500 ease-in-out">
          {renderViewMode()}
        </div>
      </div>

      {/* Empty State */}
      {books.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-6xl mb-4">📚</div>
            <h2 className={`text-2xl font-bold mb-2 ${
              theme === 'dark' ? 'text-white' : 'text-foreground'
            }`}>No Books Yet</h2>
            <p className={`mb-6 mt-12 ${
              theme === 'dark' ? 'text-gray-400' : 'text-muted-foreground'
            }`}>
              Create your first book to get started with your library
            </p>
          </div>
        </div>
      )}

      {/* Book Edit Dialog */}
      <BookEditDialog
        book={getCurrentBook()}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
      />

      {/* Settings Panel */}
      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Account Modal */}
      <AccountModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
      />

      {/* Terms and Conditions Notice */}
      <div className="absolute bottom-2 left-0 right-0 text-center z-10">
        <p className={`text-xs ${
          theme === 'dark' ? 'text-white/40' : 'text-muted-foreground/60'
        }`}>
          By using this app you confirm you have read and understood the{' '}
          <a 
            href="/terms-of-service" 
            className={`underline hover:opacity-100 ${
              theme === 'dark' ? 'text-white/60' : 'text-muted-foreground'
            }`}
          >
            Terms & Conditions
          </a>
          {' '}and{' '}
          <a 
            href="/privacy-policy" 
            className={`underline hover:opacity-100 ${
              theme === 'dark' ? 'text-white/60' : 'text-muted-foreground'
            }`}
          >
            Privacy Policy
          </a>
        </p>
      </div>
    </div>
  );
};

export default BookShelf;
