/**
 * BOOK STORE - Simple book/project management
 * 
 * Simple store for managing current book/project selection
 * This is a simplified version for compatibility
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { generateProjectId } from '@/lib/idGenerator';
import { useProjectStore } from '@/stores/projectStore';
import type { Project } from '@/storage/indexeddb';

const sanitizePersistedBook = (book: any) => {
  if (!book) {
    return book;
  }

  const sanitizedBook = { ...book };
  if (typeof sanitizedBook.coverImage === 'string' && sanitizedBook.coverImage.startsWith('data:image/')) {
    delete sanitizedBook.coverImage;
  }

  return sanitizedBook;
};

interface BookStoreState {
  currentBookId: string | null;
  books: Record<string, any>;
  leatherPresets: Array<{
    id: string;
    name: string;
    color: string;
    darkVariant: string;
    lightVariant: string;
  }>;
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
  createBook: (bookData: any) => Promise<string>;
  updateBook: (bookId: string, bookData: any) => void;
  setViewMode: (mode: string) => void;
  hydrateBooks: (projects: Project[]) => void;
}

const getProjectSettings = (bookData: any) => ({
  color: bookData.color,
  gradient: bookData.gradient,
  leatherColor: bookData.leatherColor,
  isLeatherMode: bookData.isLeatherMode,
  coverPresetId: bookData.coverPresetId,
  coverImage: bookData.coverImage,
  coverImageStorageKey: bookData.coverImageStorageKey,
  hasLocalCoverImage: bookData.hasLocalCoverImage,
  coverPageSettings: bookData.coverPageSettings,
  viewportOffset: bookData.worldData?.viewportOffset || { x: 0, y: 0 },
  viewportScale: bookData.worldData?.viewportScale || 1,
  rootBackgroundConfig: bookData.worldData?.rootBackgroundConfig || null,
  globalCustomFields: bookData.worldData?.globalCustomFields || [],
});

const projectToBook = (project: Project) => {
  const settings = project.settings || {};
  return {
    id: project.id,
    title: project.name,
    description: project.description,
    subheading: settings.subheading,
    color: settings.color || '#3b82f6',
    gradient: settings.gradient,
    leatherColor: settings.leatherColor,
    isLeatherMode: settings.isLeatherMode,
    coverPresetId: settings.coverPresetId,
    coverImage: settings.coverImage,
    coverImageStorageKey: settings.coverImageStorageKey,
    hasLocalCoverImage: settings.hasLocalCoverImage,
    coverPageSettings: settings.coverPageSettings,
    createdAt: Date.parse(project.createdAt),
    updatedAt: Date.parse(project.updatedAt),
    worldData: {
      assets: {},
      tags: {},
      globalCustomFields: settings.globalCustomFields || [],
      viewportOffset: settings.viewportOffset || { x: 0, y: 0 },
      viewportScale: settings.viewportScale || 1,
      rootBackgroundConfig: settings.rootBackgroundConfig || null,
    },
  };
};

export const useBookStore = create<BookStoreState>()(
  persist(
    (set, get) => ({
      // Initial state
      currentBookId: null,
      books: {},
      leatherPresets: [
        {
          id: 'classic-brown',
          name: 'Classic Brown',
          color: '#8b4513',
          darkVariant: '#654321',
          lightVariant: '#a0522d',
        },
        {
          id: 'elegant-black',
          name: 'Elegant Black',
          color: '#1a1a1a',
          darkVariant: '#0d0d0d',
          lightVariant: '#2d2d2d',
        },
        {
          id: 'royal-blue',
          name: 'Royal Blue',
          color: '#1e3a8a',
          darkVariant: '#1e2f5a',
          lightVariant: '#2563eb',
        },
        {
          id: 'forest-green',
          name: 'Forest Green',
          color: '#2d5016',
          darkVariant: '#1f3a0f',
          lightVariant: '#3a6b1e',
        },
        {
          id: 'royal-purple',
          name: 'Royal Purple',
          color: '#6b46c1',
          darkVariant: '#553c9a',
          lightVariant: '#8b5cf6',
        },
        {
          id: 'arctic-white',
          name: 'Arctic White',
          color: '#f5f5f0',
          darkVariant: '#e8e8e0',
          lightVariant: '#fafaf5',
        },
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
        void useProjectStore.getState().deleteProject(bookId);
      },

      // Update world data for a book
      updateWorldData: (bookId: string, worldData: any) => {
        set(state => {
          const books = { ...state.books };
          if (books[bookId]) {
            books[bookId] = {
              ...books[bookId],
              worldData: {
                ...(books[bookId].worldData || {}),
                ...worldData,
              },
              updatedAt: new Date().toISOString()
            };
          }
          return { books };
        });

        const book = get().books[bookId];
        if (book) {
          void useProjectStore.getState().updateProject(bookId, {
            settings: getProjectSettings(book),
          });
        }
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
      createBook: async (bookData: any) => {
        // Get user ID from auth store for ID generation
        let userId = undefined;
        try {
          const authStore = require('@/stores/authStore').useAuthStore.getState();
          userId = authStore.user?.id;
        } catch (e) {
          // Auth store not available, will use 'guest' prefix
        }
        
        const id = generateProjectId(userId);
        const newBook = {
          ...bookData,
          id,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        
        await useProjectStore.getState().createProject({
          id,
          userId: userId || 'guest',
          name: bookData.title || 'Untitled World',
          description: bookData.description,
          settings: getProjectSettings(bookData),
        });

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

        const currentBook = get().books[bookId];
        if (currentBook) {
          void useProjectStore.getState().updateProject(bookId, {
            name: currentBook.title,
            description: currentBook.description,
            settings: getProjectSettings(currentBook),
          });
        }
      },

      // Set view mode
      setViewMode: (mode: string) => {
        set({ viewMode: mode });
      },

      hydrateBooks: (projects: Project[]) => {
        const books = Object.fromEntries(projects.map(project => [project.id, projectToBook(project)]));
        set({ books });
      },
    }),
    {
      name: 'book-store-simple',
      partialize: (state) => ({
        currentBookId: state.currentBookId,
        viewMode: state.viewMode,
      })
    }
  )
);
