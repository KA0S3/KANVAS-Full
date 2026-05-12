/**
 * MEDIA STORE - Media file management
 * 
 * Simple store for managing media files and uploads
 * This is a simplified version for compatibility
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface MediaFile {
  id: string;
  name: string;
  type: 'image' | 'video' | 'audio' | 'document';
  url: string;
  size: number;
  uploadedAt: string;
  projectId: string;
}

interface MediaStoreState {
  mediaFiles: Record<string, MediaFile>;
  uploadProgress: Record<string, number>;
  
  // Media settings (persisted)
  videosEnabled: boolean;
  videoSoundsEnabled: boolean;
  audioVolume: number;
  
  // UI state (not persisted)
  transitioning: boolean;
  currentView: 'splash' | 'intro' | 'library' | 'book';
  appPhase: 'SPLASH' | 'INTRO_VIDEO' | 'LIBRARY' | 'BOOK_VIEW';
  
  // Actions
  addMediaFile: (mediaFile: MediaFile) => void;
  removeMediaFile: (mediaId: string) => void;
  updateMediaFile: (mediaId: string, updates: Partial<MediaFile>) => void;
  getMediaFile: (mediaId: string) => MediaFile | undefined;
  getProjectMedia: (projectId: string) => MediaFile[];
  setUploadProgress: (mediaId: string, progress: number) => void;
  clearUploadProgress: (mediaId: string) => void;
  getAllMediaFiles: () => MediaFile[];
  
  // Media settings actions
  setVideosEnabled: (enabled: boolean) => void;
  setVideoSoundsEnabled: (enabled: boolean) => void;
  setAudioVolume: (volume: number) => void;
  
  // Navigation actions
  startIntro: (launchMode?: 'professional' | 'full') => void;
  showLibrary: () => void;
  enterBookView: () => void;
  setTransitioning: (transitioning: boolean) => void;
  
  // App phase management
  setAppPhase: (phase: 'SPLASH' | 'INTRO_VIDEO' | 'LIBRARY' | 'BOOK_VIEW') => void;
  initializeFromSplash: () => void;
}

export const useMediaStore = create<MediaStoreState>()(
  persist(
    (set, get) => ({
      // Initial state
      mediaFiles: {},
      uploadProgress: {},
      videosEnabled: true,
      videoSoundsEnabled: true,
      audioVolume: 0.1,
      transitioning: false,
      currentView: 'splash',
      appPhase: 'SPLASH',

      // Add a media file
      addMediaFile: (mediaFile: MediaFile) => {
        set(state => ({
          mediaFiles: {
            ...state.mediaFiles,
            [mediaFile.id]: mediaFile
          }
        }));
      },

      // Remove a media file
      removeMediaFile: (mediaId: string) => {
        set(state => {
          const newMediaFiles = { ...state.mediaFiles };
          delete newMediaFiles[mediaId];
          
          const newUploadProgress = { ...state.uploadProgress };
          delete newUploadProgress[mediaId];
          
          return {
            mediaFiles: newMediaFiles,
            uploadProgress: newUploadProgress
          };
        });
      },

      // Update a media file
      updateMediaFile: (mediaId: string, updates: Partial<MediaFile>) => {
        set(state => ({
          mediaFiles: {
            ...state.mediaFiles,
            [mediaId]: state.mediaFiles[mediaId] 
              ? { ...state.mediaFiles[mediaId], ...updates }
              : undefined
          }
        }));
      },

      // Get a specific media file
      getMediaFile: (mediaId: string) => {
        return get().mediaFiles[mediaId];
      },

      // Get media files for a specific project
      getProjectMedia: (projectId: string) => {
        return Object.values(get().mediaFiles).filter(
          media => media.projectId === projectId
        );
      },

      // Set upload progress for a media file
      setUploadProgress: (mediaId: string, progress: number) => {
        set(state => ({
          uploadProgress: {
            ...state.uploadProgress,
            [mediaId]: progress
          }
        }));
      },

      // Clear upload progress for a media file
      clearUploadProgress: (mediaId: string) => {
        set(state => {
          const newUploadProgress = { ...state.uploadProgress };
          delete newUploadProgress[mediaId];
          return { uploadProgress: newUploadProgress };
        });
      },

      // Get all media files
      getAllMediaFiles: () => {
        return Object.values(get().mediaFiles);
      },

      // Media settings actions
      setVideosEnabled: (enabled: boolean) => {
        set({ videosEnabled: enabled });
      },

      setVideoSoundsEnabled: (enabled: boolean) => {
        set({ videoSoundsEnabled: enabled });
      },

      setAudioVolume: (volume: number) => {
        set({ audioVolume: Math.max(0, Math.min(1, volume)) });
      },

      // Navigation actions
      startIntro: (launchMode?: 'professional' | 'full') => {
        set({ 
          currentView: 'intro',
          appPhase: 'INTRO_VIDEO',
          transitioning: true 
        });
        // Store launch mode for later use in V2 canvas transition
        if (launchMode) {
          localStorage.setItem('launchMode', launchMode);
        }
      },

      showLibrary: () => {
        set({ 
          currentView: 'library',
          appPhase: 'LIBRARY',
          transitioning: false 
        });
      },

      enterBookView: () => {
        set({ 
          currentView: 'book',
          appPhase: 'BOOK_VIEW',
          transitioning: false 
        });
      },

      setTransitioning: (transitioning: boolean) => {
        set({ transitioning });
      },

      // App phase management
      setAppPhase: (phase: 'SPLASH' | 'INTRO_VIDEO' | 'LIBRARY' | 'BOOK_VIEW') => {
        set({ appPhase: phase });
      },

      initializeFromSplash: () => {
        set({ 
          appPhase: 'SPLASH',
          currentView: 'splash',
          transitioning: false 
        });
      }
    }),
    {
      name: 'media-store',
      partialize: (state) => ({
        mediaFiles: state.mediaFiles,
        videosEnabled: state.videosEnabled,
        videoSoundsEnabled: state.videoSoundsEnabled,
        audioVolume: state.audioVolume
        // Don't persist UI state as it's temporary
      })
    }
  )
);
