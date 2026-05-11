import type { BackgroundConfig } from '@/types/background';
import { DEFAULT_BACKGROUND_CONFIG } from '@/types/background';
import { indexedDBStorage } from './indexedDBStorage';
import { unifiedUploadService } from '@/services/UnifiedUploadService';
import { useAuthStore } from '@/stores/authStore';
import { useBookStore } from '@/stores/bookStoreSimple';
import { useBackgroundStore } from '@/stores/backgroundStore';

const STORAGE_PREFIX = 'background:';
const METADATA_PREFIX = 'bgmeta:';

// Defer background storage initialization to prevent startup logs
// This will be initialized when first accessed

/**
 * Migrate old background: format to new bgmeta: format
 * This should be called once during app initialization
 */
export function migrateBackgroundFormat(): void {
  const keysToMigrate: string[] = [];
  
  // Find all old format keys
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(STORAGE_PREFIX)) {
      keysToMigrate.push(key);
    }
  }
  
  if (keysToMigrate.length === 0) {
    console.log('[BackgroundStorage] No old format backgrounds to migrate');
    return;
  }
  
  console.log(`[BackgroundStorage] Migrating ${keysToMigrate.length} backgrounds from old format`);
  
  keysToMigrate.forEach(oldKey => {
    try {
      const assetId = oldKey.substring(STORAGE_PREFIX.length);
      const newKey = getStorageKey(assetId);
      const stored = localStorage.getItem(oldKey);
      
      if (stored) {
        localStorage.setItem(newKey, stored);
        localStorage.removeItem(oldKey);
        console.log(`[BackgroundStorage] Migrated ${assetId} from ${oldKey} to ${newKey}`);
      }
    } catch (error) {
      console.error(`[BackgroundStorage] Failed to migrate ${oldKey}:`, error);
    }
  });
  
  console.log('[BackgroundStorage] Migration completed');
}

/**
 * Centralized background storage utility
 * Uses IndexedDB for image blobs, localStorage for metadata
 */

export function getStorageKey(assetId: string): string {
  return `${METADATA_PREFIX}${assetId}`;
}

export async function getBackgroundAsync(assetId: string): Promise<BackgroundConfig> {
  try {
    const storageKey = getStorageKey(assetId);
    const stored = localStorage.getItem(storageKey);
    
    let config: BackgroundConfig;
    if (stored) {
      config = JSON.parse(stored) as BackgroundConfig;
    } else {
      config = JSON.parse(JSON.stringify(DEFAULT_BACKGROUND_CONFIG));
    }
    
    // If IndexedDB has the image, restore it to the config
    const imageUrl = await indexedDBStorage.getImage(assetId);
    if (imageUrl) {
      config.imageUrl = imageUrl;
    }
    
    // Deep clone to prevent reference sharing
    return JSON.parse(JSON.stringify(config));
  } catch (error) {
    console.error(`Error loading background config for ${assetId}:`, error);
    return JSON.parse(JSON.stringify(DEFAULT_BACKGROUND_CONFIG));
  }
}

// Sync functions removed - using async IndexedDB functions only


// Async version that stores images in IndexedDB
export async function setBackgroundAsync(assetId: string, config: BackgroundConfig): Promise<void> {
  try {
    const storageKey = getStorageKey(assetId);
    
    // Deep clone config
    const configToStore = JSON.parse(JSON.stringify(config));
    
    // If there's a base64 image, store it in IndexedDB instead
    if (configToStore.imageUrl?.startsWith('data:')) {
      try {
        const response = await fetch(configToStore.imageUrl);
        const blob = await response.blob();
        const file = new File([blob], `background-${assetId}.jpg`, { type: blob.type });
        const result = await indexedDBStorage.storeImage(assetId, file);
        
        if (result.success) {
          // Store metadata only, remove large base64 from localStorage
          configToStore.imageUrl = null;
          configToStore.indexedDBStored = true;
          configToStore.compressedSize = result.compressedSize;
        }
      } catch (error) {
        console.error(`[BackgroundStorage] Failed to store image in IndexedDB:`, error);
        // Fall back to storing in localStorage if IndexedDB fails
      }
    }
    
    localStorage.setItem(storageKey, JSON.stringify(configToStore));
  } catch (error) {
    console.error(`Error saving background config for ${assetId}:`, error);
  }
}

// Function to upload background image to R2
async function uploadBackgroundToR2(assetId: string, base64Image: string): Promise<string | null> {
  try {
    const authStore = useAuthStore.getState();
    const bookStore = useBookStore.getState();
    
    if (!authStore.isAuthenticated || !authStore.user || !bookStore.currentBookId) {
      console.log(`[BackgroundStorage] Cannot upload to R2 - not authenticated or no project loaded`);
      return null;
    }

    // Convert base64 to blob
    const response = await fetch(base64Image);
    const blob = await response.blob();
    const file = new File([blob], `background-${assetId}.jpg`, { type: blob.type });

    // Upload using UnifiedUploadService
    const result = await unifiedUploadService.upload(
      file,
      {
        assetId: `bg-${assetId}`,
        projectId: bookStore.currentBookId
      }
    );

    if (result.success && result.publicUrl) {
      console.log(`[BackgroundStorage] Successfully uploaded background ${assetId} to R2: ${result.publicUrl}`);
      return result.publicUrl;
    } else {
      console.error(`[BackgroundStorage] Failed to upload background ${assetId} to R2:`, result.error);
      return null;
    }
  } catch (error) {
    console.error(`[BackgroundStorage] Error uploading background ${assetId} to R2:`, error);
    return null;
  }
}

// Sync functions removed - using async IndexedDB functions only

// Async version that loads images from IndexedDB
export async function loadAllBackgroundsAsync(): Promise<Record<string, BackgroundConfig>> {
  const configs: Record<string, BackgroundConfig> = {};
  const processedIds = new Set<string>();
  
  try {
    // Check new metadata format first
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(METADATA_PREFIX)) {
        const assetId = key.substring(METADATA_PREFIX.length);
        if (!processedIds.has(assetId)) {
          processedIds.add(assetId);
          const config = await getBackgroundAsync(assetId);
          configs[assetId] = config;
        }
      }
    }
    
    // Check old format for any unmigrated backgrounds
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) {
        const assetId = key.substring(STORAGE_PREFIX.length);
        if (!processedIds.has(assetId)) {
          processedIds.add(assetId);
          const config = await getBackgroundAsync(assetId);
          configs[assetId] = config;
        }
      }
    }
  } catch (error) {
    console.error('Error loading all background configs:', error);
  }
  
  return configs;
}

// Sync load function removed - using async loadAllBackgroundsAsync only

export function removeBackground(assetId: string): void {
  try {
    // Remove from IndexedDB only
    indexedDBStorage.removeImage(assetId);
  } catch (error) {
    console.error(`Error removing background config for ${assetId}:`, error);
  }
}

export function clearAllBackgrounds(): void {
  try {
    // Clear IndexedDB backgrounds only
    indexedDBStorage.clearAll();
  } catch (error) {
    console.error('Error clearing all background configs:', error);
  }
}
