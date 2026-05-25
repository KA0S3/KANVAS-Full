import { useKanvasStore } from '@/stores/kanvasStore';
import { useCloudStore } from '@/stores/cloudStore';
import { useAuthStore } from '@/stores/authStore';
import { unifiedUploadService } from '@/services/UnifiedUploadService';
import type { Asset } from '@/types/Asset';
import { useState } from 'react';

interface UpgradeModalState {
  isOpen: boolean;
  currentUsage: number;
  quotaLimit: number;
  requiredBytes: number;
}

// Helper function to convert technical errors to user-friendly messages
const getUserFriendlyErrorMessage = (technicalError: string): string => {
  if (technicalError.includes('quota') || technicalError.includes('Quota')) {
    return 'Upload failed. The local asset was kept.';
  }
  if (technicalError.includes('network') || technicalError.includes('connection')) {
    return 'Network connection failed. Please check your internet connection and try again.';
  }
  if (technicalError.includes('timeout')) {
    return 'Upload timed out. Please try again with a smaller file or better connection.';
  }
  if (technicalError.includes('unauthorized') || technicalError.includes('auth')) {
    return 'Upload failed. The local asset was kept.';
  }
  if (technicalError.includes('file too large') || technicalError.includes('size')) {
    return 'File is too large for this operation.';
  }
  if (technicalError.includes('invalid') || technicalError.includes('format')) {
    return 'Invalid file format. Please choose a supported file type.';
  }
  return 'An unexpected error occurred. Please try again later.';
};

export function useAssetCreation() {
  const { createAsset, updateAsset } = useKanvasStore();
  const { effectiveLimits } = useAuthStore();
  const [upgradeModal, setUpgradeModal] = useState<UpgradeModalState>({
    isOpen: false,
    currentUsage: 0,
    quotaLimit: 0,
    requiredBytes: 0
  });

  const createNewAsset = async (
    assetData: Omit<Asset, 'id' | 'metadata'> & { metadata?: Partial<Asset['metadata']> }, 
    options?: { 
      fromUserClick?: boolean;
      file?: File;
      skipCloud?: boolean;
    }
  ): Promise<string> => {
    // SAFEGUARD: Only allow creation if explicitly triggered by user click
    if (!options?.fromUserClick) {
      throw new Error("Asset creation blocked: not triggered by user click");
    }
    
    // CRITICAL FIX: Validate required fields before asset creation
    if (!assetData.content.title?.trim()) {
      throw new Error('Asset title is required');
    }
    
    // Ensure projectId is provided and valid
    if (!assetData.projectId || typeof assetData.projectId !== 'string') {
      throw new Error('Asset must have a valid projectId');
    }
    
    // Ensure layout is valid
    if (!assetData.layout || typeof assetData.layout !== 'object') {
      throw new Error('Asset must have valid layout data');
    }
    
    console.log('Creating asset from modal', { 
      title: assetData.content.title,
      projectId: assetData.projectId,
      hasLayout: !!assetData.layout
    });
    
    try {
      // Create local asset first (local-first principle)
      const assetId = await createAsset(assetData);
      console.log('Asset created successfully:', assetId);
      
      // Store file reference for later cloud sync during normal save cycle
      if (options.file) {
        // Store file in asset for later upload during sync cycle
        await updateAsset(assetId, { 
          content: {
            ...assetData.content,
            customFields: {
              ...assetData.content.customFields,
              file: options.file.name
            }
          }
        });
      }
      
      // NOTE: Cloud upload will happen during normal sync cycle (40-60s debounce)
      // This respects low IO principles and prevents immediate API calls
      
      return assetId;
    } catch (error) {
      console.error('Failed to create asset:', error);
      throw error;
    }
  };

  const uploadAssetToCloud = async (assetId: string, file: File, projectId?: string): Promise<void> => {
    if (!isAuthenticated || !user) {
      console.log('User not authenticated, skipping upload');
      return;
    }

    if (!projectId) {
      console.warn('No project ID provided, skipping cloud upload');
      return;
    }

    try {
      // Store upload status in custom fields since cloud_status doesn't exist in V2 Asset interface
      await updateAsset(assetId, {
        content: {
          customFields: {
            uploadStatus: 'uploading',
            uploadError: undefined
          }
        }
      });

      // Upload using UnifiedUploadService
      const result = await unifiedUploadService.uploadFile(
        file,
        {
          metadata: {
            assetId,
            projectId
          },
          onProgress: (progress) => {
            console.log(`[useAssetCreation] Upload: ${progress.percentage}%`);
          }
        }
      );

      if (result.success) {
        // Update asset with cloud metadata in custom fields
        await updateAsset(assetId, {
          content: {
            customFields: {
              uploadStatus: 'synced',
              cloudPath: result.key,
              cloudSize: file.size,
              cloudUpdatedAt: new Date().toISOString(),
              uploadError: undefined
            }
          }
        });
        
        console.log('Asset successfully uploaded to cloud:', result.key);
      } else {
        // Check if it's a quota error
        if (result.error?.includes('quota') || result.error?.includes('Quota')) {
          const quotaLimit = (effectiveLimits as any)?.quotaBytes || 0;
          
          setUpgradeModal({
            isOpen: false,
            currentUsage: 0, // TODO: Get actual usage from auth store
            quotaLimit,
            requiredBytes: file.size
          });
        }
        
        // Handle upload failure but keep local asset
        const userFriendlyError = getUserFriendlyErrorMessage(result.error || 'Unknown upload error');
        await updateAsset(assetId, {
          content: {
            customFields: {
              uploadStatus: 'failed',
              uploadError: userFriendlyError
            }
          }
        });
        
        console.error('Cloud upload failed:', result.error);
      }
    } catch (error) {
      // Handle unexpected errors but preserve local asset
      const errorMessage = error instanceof Error ? error.message : 'Unexpected error';
      const userFriendlyMessage = getUserFriendlyErrorMessage(errorMessage);
      
      await updateAsset(assetId, {
        content: {
          customFields: {
            uploadStatus: 'failed',
            uploadError: userFriendlyMessage
          }
        }
      });
      
      console.error('Unexpected error during cloud upload:', error);
    }
  };

  const retryCloudUpload = async (assetId: string, file: File, projectId?: string): Promise<void> => {
    await uploadAssetToCloud(assetId, file, projectId);
  };

  const canUploadToCloud = async (file: File): Promise<boolean> => true;

  const closeUpgradeModal = () => {
    setUpgradeModal(prev => ({ ...prev, isOpen: false }));
  };

  // Check if user is over quota to determine modal type
  const isOverQuota = false; // TODO: Implement proper quota checking when auth store has quota data

  return { 
    createNewAsset,
    uploadAssetToCloud,
    retryCloudUpload,
    canUploadToCloud,
    upgradeModal,
    closeUpgradeModal,
    isOverQuota
  };
}
