/**
 * TAG STORE - Tag management
 * 
 * Simple store for managing tags and tag operations
 * This is a simplified version for compatibility
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Tag {
  id: string;
  name: string;
  color?: string;
  count?: number;
}

interface TagStoreState {
  tags: Record<string, Tag>;
  popularTags: string[];
  
  // Actions
  addTag: (tag: Tag) => void;
  removeTag: (tagId: string) => void;
  updateTag: (tagId: string, updates: Partial<Tag>) => void;
  getTag: (tagId: string) => Tag | undefined;
  getAllTags: () => Tag[];
  getPopularTags: () => string[];
  updatePopularTags: () => void;
}

export const useTagStore = create<TagStoreState>()(
  persist(
    (set, get) => ({
      // Initial state
      tags: {},
      popularTags: [],

      // Add a tag
      addTag: (tag: Tag) => {
        set(state => ({
          tags: {
            ...state.tags,
            [tag.id]: tag
          }
        }));
        
        // Update popular tags
        get().updatePopularTags();
      },

      // Remove a tag
      removeTag: (tagId: string) => {
        set(state => {
          const newTags = { ...state.tags };
          delete newTags[tagId];
          return { tags: newTags };
        });
        
        // Update popular tags
        get().updatePopularTags();
      },

      // Update a tag
      updateTag: (tagId: string, updates: Partial<Tag>) => {
        set(state => ({
          tags: {
            ...state.tags,
            [tagId]: state.tags[tagId] ? { ...state.tags[tagId], ...updates } : undefined
          }
        }));
        
        // Update popular tags
        get().updatePopularTags();
      },

      // Get a specific tag
      getTag: (tagId: string) => {
        return get().tags[tagId];
      },

      // Get all tags
      getAllTags: () => {
        return Object.values(get().tags);
      },

      // Get popular tags
      getPopularTags: () => {
        return get().popularTags;
      },

      // Update popular tags based on usage count
      updatePopularTags: () => {
        const { tags } = get();
        const sortedTags = Object.values(tags)
          .filter(tag => tag.count && tag.count > 0)
          .sort((a, b) => (b.count || 0) - (a.count || 0))
          .slice(0, 10)
          .map(tag => tag.name);
        
        set({ popularTags: sortedTags });
      }
    }),
    {
      name: 'tag-store',
      partialize: (state) => ({
        tags: state.tags,
        popularTags: state.popularTags
      })
    }
  )
);
