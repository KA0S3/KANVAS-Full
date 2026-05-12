/**
 * BACKGROUND STORE - Background management
 * 
 * Simple store for managing canvas backgrounds and settings
 * This is a simplified version for compatibility
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Background {
  id: string;
  type: 'color' | 'image' | 'gradient';
  value: string;
  opacity?: number;
  position?: 'center' | 'cover' | 'repeat';
}

interface BackgroundStoreState {
  backgrounds: Record<string, Background>;
  currentBackgroundId: string | null;
  
  // Actions
  addBackground: (background: Background) => void;
  removeBackground: (backgroundId: string) => void;
  updateBackground: (backgroundId: string, updates: Partial<Background>) => void;
  setCurrentBackground: (backgroundId: string | null) => void;
  getCurrentBackground: () => Background | undefined;
  getAllBackgrounds: () => Background[];
}

// Helper function for backward compatibility
export const getAssetKeyWithBook = (assetId: string, bookId: string) => {
  return `${bookId}:${assetId}`;
};

export const useBackgroundStore = create<BackgroundStoreState>()(
  persist(
    (set, get) => ({
      // Initial state
      backgrounds: {},
      currentBackgroundId: null,

      // Add a background
      addBackground: (background: Background) => {
        set(state => ({
          backgrounds: {
            ...state.backgrounds,
            [background.id]: background
          }
        }));
      },

      // Remove a background
      removeBackground: (backgroundId: string) => {
        set(state => {
          const newBackgrounds = { ...state.backgrounds };
          delete newBackgrounds[backgroundId];
          
          // Clear current background if it was the removed one
          const newCurrentBackgroundId = state.currentBackgroundId === backgroundId ? null : state.currentBackgroundId;
          
          return {
            backgrounds: newBackgrounds,
            currentBackgroundId: newCurrentBackgroundId
          };
        });
      },

      // Update a background
      updateBackground: (backgroundId: string, updates: Partial<Background>) => {
        set(state => ({
          backgrounds: {
            ...state.backgrounds,
            [backgroundId]: state.backgrounds[backgroundId] 
              ? { ...state.backgrounds[backgroundId], ...updates }
              : undefined
          }
        }));
      },

      // Set current background
      setCurrentBackground: (backgroundId: string | null) => {
        set({ currentBackgroundId: backgroundId });
      },

      // Get current background
      getCurrentBackground: () => {
        const { currentBackgroundId, backgrounds } = get();
        return currentBackgroundId ? backgrounds[currentBackgroundId] : undefined;
      },

      // Get all backgrounds
      getAllBackgrounds: () => {
        return Object.values(get().backgrounds);
      }
    }),
    {
      name: 'background-store',
      partialize: (state) => ({
        backgrounds: state.backgrounds,
        currentBackgroundId: state.currentBackgroundId
      })
    }
  )
);
