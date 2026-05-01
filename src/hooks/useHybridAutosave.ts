import { useEffect, useState } from 'react';
import { autosaveService } from '@/services/autosaveService';
import { useAuthStore } from '@/stores/authStore';
import { useBookStore } from '@/stores/bookStoreSimple';
import { useAssetStore } from '@/stores/assetStore';
import { useBackgroundStore } from '@/stores/backgroundStore';

// Data validation functions
const validateRestoredData = (savedData: any): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (!savedData || typeof savedData !== 'object') {
    errors.push('Invalid saved data format');
    return { isValid: false, errors };
  }
  
  // Validate assets if present
  if (savedData.assets) {
    if (typeof savedData.assets !== 'object') {
      errors.push('Assets must be an object');
    } else {
      Object.entries(savedData.assets).forEach(([id, asset]) => {
        if (!asset || typeof asset !== 'object') {
          errors.push(`Invalid asset format for ${id}`);
        } else {
          const assetObj = asset as any;
          if (!assetObj.id || !assetObj.name || !assetObj.type) {
            errors.push(`Asset ${id} missing required fields`);
          }
        }
      });
    }
  }
  
  // Validate global custom fields if present
  if (savedData.worldData?.globalCustomFields) {
    if (!Array.isArray(savedData.worldData.globalCustomFields)) {
      errors.push('Global custom fields must be an array');
    } else {
      savedData.worldData.globalCustomFields.forEach((field: any, index: number) => {
        if (!field || typeof field !== 'object') {
          errors.push(`Invalid global custom field format at index ${index}`);
        } else if (!field.id || !field.label || !field.type) {
          errors.push(`Global custom field at index ${index} missing required fields`);
        }
      });
    }
  }
  
  return { isValid: errors.length === 0, errors };
};

const attemptPartialRestoration = (savedData: any, errors: string[]): void => {
  console.warn('[useHybridAutosave] Data validation failed, attempting partial restoration:', errors);
  
  const assetStore = useAssetStore.getState();
  const backgroundStore = useBackgroundStore.getState();
  const bookStore = useBookStore.getState();
  
  try {
    // Attempt to restore valid assets
    if (savedData.assets && typeof savedData.assets === 'object') {
      const validAssets: Record<string, any> = {};
      Object.entries(savedData.assets).forEach(([id, asset]) => {
        if (asset && typeof asset === 'object') {
          const assetObj = asset as any;
          if (assetObj.id && assetObj.name && assetObj.type) {
            validAssets[id] = asset;
          }
        }
      });
      
      if (Object.keys(validAssets).length > 0) {
        console.log(`[useHybridAutosave] Partially restoring ${Object.keys(validAssets).length} valid assets`);
        assetStore.restoreAssets(validAssets);
      }
    }
    
    // Attempt to restore valid global custom fields
    if (savedData.worldData?.globalCustomFields && Array.isArray(savedData.worldData.globalCustomFields)) {
      const validFields = savedData.worldData.globalCustomFields.filter((field: any) => 
        field && typeof field === 'object' && field.id && field.label && field.type
      );
      
      if (validFields.length > 0) {
        console.log(`[useHybridAutosave] Partially restoring ${validFields.length} valid global custom fields`);
        assetStore.restoreGlobalCustomFields(validFields);
      }
    }
    
    // Restore backgrounds (they're simpler and less prone to corruption)
    if (savedData.backgrounds && typeof savedData.backgrounds === 'object') {
      console.log('[useHybridAutosave] Restoring backgrounds');
      Object.entries(savedData.backgrounds).forEach(([key, config]) => {
        backgroundStore.setBackground(key, config as any);
      });
    }
    
    // Restore current book
    if (savedData.worldData?.currentBook) {
      console.log('[useHybridAutosave] Setting current book:', savedData.worldData.currentBook);
      bookStore.setCurrentBook(savedData.worldData.currentBook);
    }
    
    console.log('[useHybridAutosave] Partial restoration completed');
  } catch (error) {
    console.error('[useHybridAutosave] Partial restoration failed:', error);
  }
};

const notifyRestorationFailure = (message: string): void => {
  console.error('[useHybridAutosave] Restoration failure:', message);
  // TODO: Add user notification system (toast, alert, etc.)
  // For now, just log the error
};

// Version compatibility checking
const checkVersionCompatibility = (savedData: any): boolean => {
  const currentVersion = '3.9.7'; // Get from package.json or app version
  const savedVersion = savedData.version || 'unknown';
  
  // For now, assume compatibility - can be enhanced later
  console.log(`[useHybridAutosave] Version check: saved=${savedVersion}, current=${currentVersion}`);
  return true;
};

// Conflict detection during restoration
const detectConflicts = (savedData: any, currentData: any): any[] => {
  const conflicts: any[] = [];
  
  // Check for asset conflicts
  if (savedData.assets && currentData.assets) {
    Object.keys(savedData.assets).forEach(assetId => {
      if (currentData.assets[assetId]) {
        const savedAsset = savedData.assets[assetId];
        const currentAsset = currentData.assets[assetId];
        
        // Simple conflict detection based on timestamps
        if (savedAsset.updatedAt && currentAsset.updatedAt) {
          const savedTime = new Date(savedAsset.updatedAt);
          const currentTime = new Date(currentAsset.updatedAt);
          
          if (currentTime > savedTime) {
            conflicts.push({
              type: 'asset',
              id: assetId,
              localData: currentAsset,
              remoteData: savedAsset,
              resolution: 'local-wins' // Default strategy
            });
          }
        }
      }
    });
  }
  
  return conflicts;
};

// Schema validation using TypeScript interfaces
const validateAssetSchema = (asset: any): boolean => {
  const requiredFields = ['id', 'name', 'type', 'x', 'y', 'width', 'height'];
  return requiredFields.every(field => asset.hasOwnProperty(field));
};

const validateGlobalCustomFieldSchema = (field: any): boolean => {
  const requiredFields = ['id', 'label', 'type'];
  return requiredFields.every(field => field.hasOwnProperty(field));
};

export function useHybridAutosave() {
  const { user, isAuthenticated } = useAuthStore();
  const { currentBookId } = useBookStore();
  
  // Restoration state management
  const [restorationState, setRestorationState] = useState<{
    isRestoring: boolean;
    progress: number;
    totalSteps: number;
    currentStep: string;
  }>({
    isRestoring: false,
    progress: 0,
    totalSteps: 4, // assets, backgrounds, worldData, screenPositions
    currentStep: ''
  });

  useEffect(() => {
    // Load existing data on mount
    if (isAuthenticated && user) {
      console.log('[useHybridAutosave] Loading data for user:', user.id);
      
      autosaveService.loadUserData(user.id, currentBookId).then((savedData) => {
        if (savedData) {
          console.log('[useHybridAutosave] Data loaded, restoring UI state');
          restoreSavedData(savedData);
        }
      });
    }

    // NOTE: autosaveService automatically handles subscriptions and debouncing
    // It performs local save + cloud sync (hybrid) in a single service
  }, [isAuthenticated, user, currentBookId]);

  // Restore saved data to stores
  const restoreSavedData = (savedData: any) => {
    try {
      console.log('[useHybridAutosave] Restoring saved data:', savedData);
      
      // Check version compatibility
      if (!checkVersionCompatibility(savedData)) {
        console.warn('[useHybridAutosave] Version compatibility check failed, proceeding anyway');
      }
      
      // Validate data first
      const validation = validateRestoredData(savedData);
      if (!validation.isValid) {
        console.error('[useHybridAutosave] Data validation failed:', validation.errors);
        // Attempt partial restoration with valid data
        attemptPartialRestoration(savedData, validation.errors);
        return;
      }
      
      // Check for conflicts with current data
      const assetStore = useAssetStore.getState();
      const currentData = {
        assets: assetStore.getCurrentBookAssets(),
      };
      
      const conflicts = detectConflicts(savedData, currentData);
      if (conflicts.length > 0) {
        console.warn(`[useHybridAutosave] Detected ${conflicts.length} conflicts, using server-wins strategy`);
        // For now, proceed with restoration (server-wins strategy)
        // TODO: Add user notification for conflicts
      }
      
      // Proceed with full restoration
      performFullRestoration(savedData);
    } catch (error) {
      console.error('[useHybridAutosave] Critical restoration failure:', error);
      // Notify user of restoration failure
      notifyRestorationFailure('Critical error during data restoration');
    }
  };

  const performFullRestoration = async (savedData: any) => {
    setRestorationState({
      isRestoring: true,
      progress: 0,
      totalSteps: 4,
      currentStep: 'Starting restoration...'
    });
    
    try {
      const assetStore = useAssetStore.getState();
      const backgroundStore = useBackgroundStore.getState();
      const bookStore = useBookStore.getState();

      // Step 1: Restore assets
      if (savedData.assets && Object.keys(savedData.assets).length > 0) {
        setRestorationState(prev => ({ ...prev, currentStep: 'Restoring assets...', progress: 0 }));
        console.log('[useHybridAutosave] Restoring assets:', Object.keys(savedData.assets).length);
        try {
          assetStore.restoreAssets(savedData.assets);
          console.log('[useHybridAutosave] Assets restored successfully');
          setRestorationState(prev => ({ ...prev, progress: 1 }));
        } catch (error) {
          console.error('[useHybridAutosave] Failed to restore assets:', error);
          // Continue with other restoration to prevent complete failure
        }
      } else {
        setRestorationState(prev => ({ ...prev, progress: 1 }));
      }

      // Step 2: Restore backgrounds
      if (savedData.backgrounds && Object.keys(savedData.backgrounds).length > 0) {
        setRestorationState(prev => ({ ...prev, currentStep: 'Restoring backgrounds...', progress: 1 }));
        console.log('[useHybridAutosave] Restoring backgrounds');
        Object.entries(savedData.backgrounds).forEach(([key, config]) => {
          // Type assertion to ensure config matches BackgroundConfig interface
          backgroundStore.setBackground(key, config as any);
        });
        setRestorationState(prev => ({ ...prev, progress: 2 }));
      } else {
        setRestorationState(prev => ({ ...prev, progress: 2 }));
      }

      // Step 3: Restore world data
      if (savedData.worldData) {
        setRestorationState(prev => ({ ...prev, currentStep: 'Restoring world data...', progress: 2 }));
        console.log('[useHybridAutosave] Restoring world data');
        
        // Restore current book if different
        if (savedData.worldData.currentBook && savedData.worldData.currentBook !== bookStore.currentBookId) {
          console.log('[useHybridAutosave] Setting current book:', savedData.worldData.currentBook);
          bookStore.setCurrentBook(savedData.worldData.currentBook);
        }

        // Restore global custom fields if available
        if (savedData.worldData.globalCustomFields && Array.isArray(savedData.worldData.globalCustomFields)) {
          console.log('[useHybridAutosave] Restoring global custom fields:', savedData.worldData.globalCustomFields.length);
          try {
            assetStore.restoreGlobalCustomFields(savedData.worldData.globalCustomFields);
            console.log('[useHybridAutosave] Global custom fields restored successfully');
          } catch (error) {
            console.error('[useHybridAutosave] Failed to restore global custom fields:', error);
            // Continue with other restoration to prevent complete failure
          }
        }
        setRestorationState(prev => ({ ...prev, progress: 3 }));
      } else {
        setRestorationState(prev => ({ ...prev, progress: 3 }));
      }

      // Step 4: Restore screen positions
      if (savedData.screenPositions && Object.keys(savedData.screenPositions).length > 0) {
        setRestorationState(prev => ({ ...prev, currentStep: 'Restoring positions...', progress: 3 }));
        console.log('[useHybridAutosave] Restoring screen positions');
        Object.entries(savedData.screenPositions).forEach(([assetId, position]: [string, any]) => {
          const asset = assetStore.getAssetById(assetId);
          if (asset) {
            assetStore.updateAssetPosition(assetId, position.x, position.y);
            if (position.width && position.height) {
              assetStore.updateAssetSize(assetId, position.width, position.height);
            }
          }
        });
      }

      console.log('[useHybridAutosave] Data restoration completed successfully');
    } catch (error) {
      console.error('[useHybridAutosave] Failed to restore saved data:', error);
    } finally {
      setRestorationState({ isRestoring: false, progress: 0, totalSteps: 4, currentStep: '' });
    }
  };

  const triggerManualSave = () => {
    return autosaveService.triggerManualSave();
  };

  const getStatus = () => {
    return autosaveService.getState().status;
  };

  return {
    triggerManualSave,
    getStatus,
    restorationState,
  };
}
