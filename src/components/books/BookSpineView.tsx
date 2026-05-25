import React, { useEffect, useState } from 'react';
import type { Book } from '@/types/book';
import BookCard from './BookCard';
import EditableBook from './EditableBook';
import { useBookStore } from '@/stores/bookStoreSimple';
import { useThemeStore } from '@/stores/themeStore';
import useImageColorExtractor from '@/hooks/useImageColorExtractor';
import { DeleteBookModal } from './DeleteBookModal';
import { BookContextMenu } from './BookContextMenu';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { loadBookCover } from '@/utils/bookCoverStorage';

interface BookSpineViewProps {
  books: Book[];
  selectedBookId?: string;
  onBookSelect: (book: Book) => void;
  onBookDelete?: (book: Book) => void;
  showDeleteButton?: boolean;
  className?: string;
  enableEditing?: boolean;
}

const BookSpineView: React.FC<BookSpineViewProps> = ({
  books,
  selectedBookId,
  onBookSelect,
  onBookDelete,
  showDeleteButton = false,
  className = '',
  enableEditing = false
}) => {
  const { updateBook, leatherPresets, reorderBooks } = useBookStore();
  const { theme } = useThemeStore();
  const { extractColor, getColor } = useImageColorExtractor();
  const [extractedColors, setExtractedColors] = useState<Map<string, string>>(new Map());
  const [resolvedCoverImages, setResolvedCoverImages] = useState<Map<string, string>>(new Map());
  const [currentPage, setCurrentPage] = useState(0);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [bookToDelete, setBookToDelete] = useState<Book | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    book: Book;
    position: { x: number; y: number };
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = books.findIndex((book) => book.id === active.id);
      const newIndex = books.findIndex((book) => book.id === over?.id);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        reorderBooks(oldIndex, newIndex);
      }
    }
  };

  const handleBookUpdate = (updatedBook: Book) => {
    updateBook(updatedBook.id, updatedBook);
    onBookSelect(updatedBook);
  };

  // Helper function to check if book has assets
  const bookHasAssets = (book: Book): boolean => {
    return book.worldData && 
           book.worldData.assets && 
           Object.keys(book.worldData.assets).length > 0;
  };

  // Handle modal confirm delete
  const handleConfirmDelete = () => {
    if (bookToDelete && onBookDelete) {
      onBookDelete(bookToDelete);
    }
  };

  // Handle right-click context menu
  const handleContextMenu = (book: Book, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      book,
      position: { x: event.clientX, y: event.clientY }
    });
  };

  // Handle context menu actions
  const handleContextMenuEnter = (book: Book) => {
    onBookSelect(book);
  };

  const handleContextMenuEdit = (book: Book) => {
    // This would need to be passed in as a prop or handled differently
    console.log('Edit book:', book.title);
  };

  const handleContextMenuDelete = (book: Book) => {
    setBookToDelete(book);
    setDeleteModalOpen(true);
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  useEffect(() => {
    let cancelled = false;

    const hydrateLocalCovers = async () => {
      const nextResolvedCovers = new Map<string, string>();

      await Promise.all(books.map(async (book) => {
        if (book.hasLocalCoverImage || book.coverImageStorageKey) {
          const coverImage = await loadBookCover(book.coverImageStorageKey || book.id);
          if (coverImage) {
            nextResolvedCovers.set(book.id, coverImage);
          }
        } else if (book.coverImage) {
          nextResolvedCovers.set(book.id, book.coverImage);
        }
      }));

      if (!cancelled) {
        setResolvedCoverImages(nextResolvedCovers);
      }
    };

    hydrateLocalCovers();

    return () => {
      cancelled = true;
    };
  }, [books]);

  // Extract colors for books with cover images
  useEffect(() => {
    console.log('BookSpineView: Processing books for color extraction...');
    books.forEach(async (book) => {
      const coverImage = resolvedCoverImages.get(book.id) || book.coverImage;
      if (coverImage) {
        console.log('BookSpineView: Processing book:', book.title);
        // Check cache first
        const cachedColor = getColor(coverImage);
        if (cachedColor) {
          console.log('BookSpineView: Using cached color for', book.title, ':', cachedColor);
          setExtractedColors(prev => new Map(prev.set(book.id, cachedColor)));
        } else {
          console.log('BookSpineView: Extracting new color for', book.title);
          // Extract color asynchronously
          const color = await extractColor(coverImage);
          if (color) {
            console.log('BookSpineView: Color extracted for', book.title, ':', color);
            setExtractedColors(prev => new Map(prev.set(book.id, color)));
          }
        }
      }
    });
  }, [books, resolvedCoverImages, extractColor, getColor]);

  // Arrange books in reading order with pagination
  const booksPerRow = 13;
  const booksPerPage = booksPerRow * 2; // 13 books per shelf × 2 shelves

  // Reset current page when books change to prevent out-of-bounds
  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(books.length / booksPerPage) - 1);
    if (currentPage > maxPage) {
      setCurrentPage(maxPage);
    }
  }, [books, currentPage, booksPerPage]);
  const totalPages = Math.ceil(books.length / booksPerPage);
  
  // Get books for current page
  const startIndex = currentPage * booksPerPage;
  const endIndex = Math.min(startIndex + booksPerPage, books.length);
  const currentPageBooks = books.slice(startIndex, endIndex);
  
  // Split current page books into top and bottom rows
  const topRowBooks = currentPageBooks.slice(0, Math.min(booksPerRow, currentPageBooks.length));
  const bottomRowBooks = currentPageBooks.length > booksPerRow ? currentPageBooks.slice(booksPerRow) : [];
  
  // Check if we need navigation
  const needsNavigation = totalPages > 1;
  
  // Navigation functions
  const goToNextPage = () => {
    if (currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1);
    }
  };
  
  const goToPrevPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  const generateSpineColor = (book: Book) => {
    // First priority: custom cover image with extracted color
    if (resolvedCoverImages.get(book.id) || book.coverImage) {
      const extractedColor = extractedColors.get(book.id);
      if (extractedColor) {
        return extractedColor;
      }
      // Fallback to book color while extraction is in progress
      return book.color || '#3b82f6';
    }
    
    // Priority: coverPageSettings baseStyle color, then book.color, then gradient, then leather
    if (book.coverPageSettings) {
      const settings = book.coverPageSettings;
      if (settings.baseStyle === 'leather' && book.leatherColor) {
        // Find the leather preset - leather colors stay consistent regardless of theme
        const preset = leatherPresets.find(p => p.color === book.leatherColor);
        if (preset) {
          return preset.color; // Use base color, not theme variant
        }
        return book.leatherColor;
      }
      if (settings.baseStyle === 'gradient' && book.gradient) {
        // Extract first color from gradient
        const match = book.gradient.match(/#[0-9a-fA-F]{6}/);
        return match ? match[0] : book.color;
      }
      if (settings.title && settings.title.style.color) {
        return settings.title.style.color;
      }
    }
    
    // Handle leather mode - leather colors stay consistent regardless of theme
    if (book.isLeatherMode && book.leatherColor) {
      const preset = leatherPresets.find(p => p.color === book.leatherColor);
      if (preset) {
        return preset.color; // Use base color, not theme variant
      }
      return book.leatherColor;
    }
    
    // Fallback to book color properties
    if (book.color) {
      return book.color;
    }
    
    if (book.gradient) {
      // Extract first color from gradient for consistency
      const match = book.gradient.match(/#[0-9a-fA-F]{6}/);
      return match ? match[0] : '#3b82f6';
    }
    
    // Final fallback
    return '#3b82f6';
  };

  const SortableSpineBook: React.FC<{ book: Book; index: number }> = ({ book, index }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: book.id });

    const spineColor = generateSpineColor(book);
    const isSelected = selectedBookId === book.id;
    const [isDoubleClicking, setIsDoubleClicking] = useState(false);

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };

    const handleDoubleClick = () => {
      if (!isDragging) {
        setIsDoubleClicking(true);
        setTimeout(() => setIsDoubleClicking(false), 200);
        onBookSelect(book);
      }
    };

    return (
      <div
        ref={setNodeRef}
        className={`
          spineview-spine-wrapper
          relative group cursor-pointer
          transition-all duration-300 ease-out
          hover:translate-x-1 hover:-translate-y-1
          ${isSelected ? 'spineview-selected z-20' : 'z-10'}
          ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}
          ${isDoubleClicking ? 'scale-105' : ''}
        `}
        onClick={() => !isDragging && onBookSelect(book)}
        onDoubleClick={handleDoubleClick}
        onContextMenu={(e) => handleContextMenu(book, e)}
        {...attributes}
        {...listeners}
        style={{
          ...style,
          width: '40px',
          height: '180px',
          marginRight: index % 13 === 12 ? '10px' : '1px',
        }}
      >
        {/* Book spine with 3D effect */}
        <div
          className="spineview-spine absolute inset-0 rounded-sm"
          style={{
            background: `
              linear-gradient(135deg, 
                ${spineColor} 0%, 
                ${spineColor}cc 30%, 
                ${spineColor}99 50%, 
                ${spineColor}cc 70%, 
                ${spineColor} 100%
              ),
              linear-gradient(90deg,
                rgba(0,0,0,0.3) 0%,
                transparent 5%,
                transparent 95%,
                rgba(0,0,0,0.3) 100%
              )
            `,
            boxShadow: `
              inset -2px 0 4px rgba(0,0,0,0.4),
              inset 2px 0 4px rgba(255,255,255,0.1),
              inset 0 0 8px rgba(0,0,0,0.2),
              0 2px 8px rgba(0,0,0,0.3)
            `,
            border: '1px solid rgba(0,0,0,0.2)',
            transform: isSelected ? 'translateZ(4px)' : 'translateZ(0)',
          }}
        >
          {/* Vertical title */}
          <div
            className="spineview-title absolute inset-0 flex items-center justify-center"
            style={{
              writingMode: 'vertical-rl',
              textOrientation: 'mixed',
            }}
          >
            <div
              className="font-bold text-white tracking-wider"
              style={{
                fontSize: '9px',
                lineHeight: '1.1',
                textShadow: '0 1px 2px rgba(0,0,0,0.8), 0 0 6px rgba(0,0,0,0.5)',
                maxHeight: '160px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 15,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {book.title}
            </div>
          </div>

          {/* Hover overlay */}
          <div
            className="spineview-hover-overlay absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 50%, rgba(0,0,0,0.1) 100%)',
              boxShadow: 'inset 0 0 12px rgba(255,255,255,0.2)',
            }}
          />
        </div>

        {/* Tooltip */}
        <div
          className="spineview-tooltip absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none z-30"
          style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}
        >
          <div className="font-medium">{book.title}</div>
          <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full">
            <div
              className="border-4 border-transparent border-t-gray-900"
              style={{ width: 0, height: 0 }}
            />
          </div>
        </div>
      </div>
    );
  };

  if (books.length === 0) {
    return (
      <div className={`flex items-center justify-center h-full ${className}`}>
      </div>
    );
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <div className={`spineview-container h-full overflow-y-auto ${className}`}>
          <div className="spineview-bookcase flex flex-col items-center justify-center min-h-full py-6 px-4">
            
            {/* Navigation controls */}
            {needsNavigation && (
              <div className="flex items-center justify-between w-full max-w-4xl mb-4">
                <button
                  onClick={goToPrevPage}
                  disabled={currentPage === 0}
                  className={`p-2 rounded-lg transition-all duration-200 ${
                    currentPage === 0
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-gray-700 text-white hover:bg-gray-600'
                  }`}
                  aria-label="Previous page"
                >
                  <ChevronLeft size={20} />
                </button>
                
                <div className="text-center">
                  <span className="text-sm text-gray-600">
                    Page {currentPage + 1} of {totalPages}
                  </span>
                  <div className="text-xs text-gray-500 mt-1">
                    Books {startIndex + 1}-{Math.min(endIndex, books.length)} of {books.length}
                  </div>
                </div>
                
                <button
                  onClick={goToNextPage}
                  disabled={currentPage === totalPages - 1}
                  className={`p-2 rounded-lg transition-all duration-200 ${
                    currentPage === totalPages - 1
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-gray-700 text-white hover:bg-gray-600'
                  }`}
                  aria-label="Next page"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            )}
            
            {/* Top shelf row */}
            <div className="spineview-shelf-row flex items-end mb-4 relative">
              {/* Invisible shelf effect */}
              <div
                className="spineview-shelf-shadow absolute -bottom-3 left-0 right-0 h-1 rounded-full"
                style={{
                  background: 'linear-gradient(90deg, transparent, rgba(0,0,0,0.2), transparent)',
                  filter: 'blur(3px)',
                }}
              />
              
              <SortableContext items={topRowBooks.map(book => book.id)} strategy={horizontalListSortingStrategy}>
                {topRowBooks.map((book, index) => (
                  <SortableSpineBook key={book.id} book={book} index={index} />
                ))}
              </SortableContext>
              
              {/* Fill empty spaces for visual balance */}
              {topRowBooks.length < 13 && (
                <>
                  {Array.from({ length: Math.max(0, 13 - topRowBooks.length) }).map((_, index) => (
                    <div
                      key={`top-filler-${index}`}
                      className="spineview-filler-spine"
                      style={{
                        width: '40px',
                        height: '180px',
                        marginRight: index === 12 - topRowBooks.length ? '10px' : '1px',
                        background: 'linear-gradient(135deg, rgba(156,163,175,0.15) 0%, rgba(107,114,128,0.08) 50%, rgba(75,85,99,0.15) 100%)',
                        borderRadius: '2px',
                        border: '1px solid rgba(0,0,0,0.08)',
                      }}
                    />
                  ))}
                </>
              )}
            </div>

            {/* Bottom shelf row */}
            <div className="spineview-shelf-row flex items-end relative">
              {/* Invisible shelf effect */}
              <div
                className="spineview-shelf-shadow absolute -bottom-3 left-0 right-0 h-1 rounded-full"
                style={{
                  background: 'linear-gradient(90deg, transparent, rgba(0,0,0,0.2), transparent)',
                  filter: 'blur(3px)',
                }}
              />
              
              <SortableContext items={bottomRowBooks.map(book => book.id)} strategy={horizontalListSortingStrategy}>
                {bottomRowBooks.map((book, index) => (
                  <SortableSpineBook key={book.id} book={book} index={index} />
                ))}
              </SortableContext>
              
              {/* Fill empty spaces for visual balance */}
              {bottomRowBooks.length < 13 && (
                <>
                  {Array.from({ length: Math.max(0, 13 - bottomRowBooks.length) }).map((_, index) => (
                    <div
                      key={`bottom-filler-${index}`}
                      className="spineview-filler-spine"
                      style={{
                        width: '40px',
                        height: '180px',
                        marginRight: index === 12 - bottomRowBooks.length ? '10px' : '1px',
                        background: 'linear-gradient(135deg, rgba(156,163,175,0.15) 0%, rgba(107,114,128,0.08) 50%, rgba(75,85,99,0.15) 100%)',
                        borderRadius: '2px',
                        border: '1px solid rgba(0,0,0,0.08)',
                      }}
                    />
                  ))}
                </>
              )}
            </div>
          </div>
          
          {/* Book count */}
          <div className="spineview-book-count text-center mt-8">
            <p className="text-gray-500 text-sm">
              {books.length} book{books.length !== 1 ? 's' : ''} on shelf
              {needsNavigation && ` • Page ${currentPage + 1} of ${totalPages}`}
            </p>
          </div>
        </div>
      </DndContext>
      
      {/* Delete Book Modal - Outside DndContext */}
      <DeleteBookModal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleConfirmDelete}
        book={bookToDelete}
      />
      
      {/* Context Menu */}
      {contextMenu && (
        <BookContextMenu
          book={contextMenu.book}
          position={contextMenu.position}
          onClose={closeContextMenu}
          onEnter={handleContextMenuEnter}
          onEdit={handleContextMenuEdit}
          onDelete={handleContextMenuDelete}
        />
      )}
    </>
  );
};

export default BookSpineView;
