/**
 * BOOK STORE - Simple book/project management
 * 
 * Simple store for managing current book/project selection
 * This is a simplified version for compatibility
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface BookStoreState {
  currentBookId: string | null;
  books: Record<string, any>;
  leatherPresets: any[];
  viewMode: string;
  
  // Actions
  setCurrentBookId: (bookId: string | null) => void;
  addBook: (bookId: string, bookData: any) => void;
  removeBook: (bookId: string) => void;
  clearBooks: () => void;
  getAllBooks: () => any[];
  setCurrentBook: (bookId: string | null) => void;
  deleteBook: (bookId: string) => void;
  updateWorldData: (bookId: string, worldData: any) => void;
  getWorldData: (bookId: string) => any;
  getCurrentBook: () => any;
  createBook: (bookData: any) => string;
  updateBook: (bookId: string, bookData: any) => void;
  setViewMode: (mode: string) => void;
}

export const useBookStore = create<BookStoreState>()(
  persist(
    (set, get) => ({
      // Initial state
      currentBookId: null,
      books: {},
      leatherPresets: [
        { color: 'brown', name: 'Classic Brown' },
        { color: 'black', name: 'Elegant Black' },
        { color: 'blue', name: 'Royal Blue' },
        { color: 'green', name: 'Forest Green' },
        { color: 'red', name: 'Rich Red' },
        { color: 'purple', name: 'Royal Purple' },
      ],
      viewMode: 'grid',

      // Set current book ID
      setCurrentBookId: (bookId: string | null) => {
        set({ currentBookId: bookId });
        
        // Also update the global project ID for other services
        if (bookId) {
          localStorage.setItem('currentProjectId', bookId);
        } else {
          localStorage.removeItem('currentProjectId');
        }
      },

      // Add a book to the store
      addBook: (bookId: string, bookData: any) => {
        set(state => ({
          books: {
            ...state.books,
            [bookId]: bookData
          }
        }));
      },

      // Remove a book from the store
      removeBook: (bookId: string) => {
        set(state => {
          const newBooks = { ...state.books };
          delete newBooks[bookId];
          
          // Clear current book ID if it was the removed book
          const newCurrentBookId = state.currentBookId === bookId ? null : state.currentBookId;
          
          return {
            books: newBooks,
            currentBookId: newCurrentBookId
          };
        });
      },

      // Clear all books
      clearBooks: () => {
        set({
          books: {},
          currentBookId: null
        });
      },

      // Get all books as array
      getAllBooks: () => {
        const { books } = get();
        return Object.values(books);
      },

      // Set current book (alias for setCurrentBookId)
      setCurrentBook: (bookId: string | null) => {
        get().setCurrentBookId(bookId);
      },

      // Delete book (alias for removeBook)
      deleteBook: (bookId: string) => {
        get().removeBook(bookId);
      },

      // Update world data for a book
      updateWorldData: (bookId: string, worldData: any) => {
        set(state => {
          const books = { ...state.books };
          if (books[bookId]) {
            books[bookId] = {
              ...books[bookId],
              ...worldData,
              updatedAt: new Date().toISOString()
            };
          }
          return { books };
        });
      },

      // Get world data for a book
      getWorldData: (bookId: string) => {
        const { books } = get();
        return books[bookId] || null;
      },

      // Get current book
      getCurrentBook: () => {
        const { currentBookId, books } = get();
        if (currentBookId && books[currentBookId]) {
          return books[currentBookId];
        }
        return null;
      },

      // Create a new book
      createBook: (bookData: any) => {
        const id = `book_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newBook = {
          ...bookData,
          id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        
        set(state => ({
          books: {
            ...state.books,
            [id]: newBook
          }
        }));
        
        return id;
      },

      // Update a book
      updateBook: (bookId: string, bookData: any) => {
        set(state => {
          const books = { ...state.books };
          if (books[bookId]) {
            books[bookId] = {
              ...books[bookId],
              ...bookData,
              updatedAt: new Date().toISOString()
            };
          }
          return { books };
        });
      },

      // Set view mode
      setViewMode: (mode: string) => {
        set({ viewMode: mode });
      }
    }),
    {
      name: 'book-store-simple',
      partialize: (state) => ({
        currentBookId: state.currentBookId,
        books: state.books
      })
    }
  )
);
