import { useAssetStore } from '@/stores/assetStore';
import { useCloudStore } from '@/stores/cloudStore';
import { useAuthStore } from '@/stores/authStore';
import { unifiedUploadService } from '@/services/UnifiedUploadService';
import { UpgradePromptModal } from '@/components/UpgradePromptModal';
import type { Asset } from '@/types/assetInterfaces';
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
    return 'Storage quota exceeded. Please upgrade your plan to continue uploading.';
  }
  if (technicalError.includes('network') || technicalError.includes('connection')) {
    return 'Network connection failed. Please check your internet connection and try again.';
  }
  if (technicalError.includes('timeout')) {
    return 'Upload timed out. Please try again with a smaller file or better connection.';
  }
  if (technicalError.includes('unauthorized') || technicalError.includes('auth')) {
    return 'Authentication failed. Please sign in again.';
  }
  if (technicalError.includes('file too large') || technicalError.includes('size')) {
    return 'File is too large. Please choose a smaller file or upgrade your plan.';
  }
  if (technicalError.includes('invalid') || technicalError.includes('format')) {
    return 'Invalid file format. Please choose a supported file type.';
  }
  return 'An unexpected error occurred. Please try again later.';
};

export function useAssetCreation() {
  const { createAsset, updateAsset } = useAssetStore();
  const { syncEnabled, quota } = useCloudStore();
  const { isAuthenticated, user, plan, effectiveLimits } = useAuthStore();
  const [upgradeModal, setUpgradeModal] = useState<UpgradeModalState>({
    isOpen: false,
    currentUsage: 0,
    quotaLimit: 0,
    requiredBytes: 0
  });

  const createNewAsset = async (
    assetData: Omit<Asset, 'asset_id' | 'children'>, 
    parentId?: string, 
    options?: { 
      fromUserClick?: boolean;
      file?: File;
      projectId?: string;
      skipCloud?: boolean;
    }
  ): Promise<string> => {
    // SAFEGUARD: Only allow creation if explicitly triggered by user click
    if (!options?.fromUserClick) {
      throw new Error("Asset creation blocked: not triggered by user click");
    }
    
    // CRITICAL FIX: Validate required fields before cloud upload
    if (!assetData.name?.trim()) {
      throw new Error('Asset name is required');
    }
    
    if (!options?.projectId && !options?.skipCloud) {
      throw new Error('Project ID is required for cloud upload');
    }
    
    console.log('Creating asset from modal');
    
    // Create local asset first (local-first principle)
    const assetId = createAsset(assetData, parentId);
    
    // If file is provided and cloud sync is enabled, attempt cloud upload
    if (options.file && syncEnabled && isAuthenticated && !options.skipCloud) {
      await uploadAssetToCloud(assetId, options.file, options.projectId);
    }
    
    return assetId;
  };

  const uploadAssetToCloud = async (assetId: string, file: File, projectId?: string): Promise<void> => {
    if (!syncEnabled || !isAuthenticated || !user) {
      console.log('Cloud sync disabled or user not authenticated, skipping upload');
      return;
    }

    if (!projectId) {
      console.warn('No project ID provided, skipping cloud upload');
      return;
    }

    try {
      // Update asset status to uploading
      updateAsset(assetId, { 
        cloud_status: 'uploading',
        cloud_error: undefined 
      });

      // Upload with variants using UnifiedUploadService
      // Note: Quota check is handled by the getUploadUrls Edge Function
      const result = await unifiedUploadService.uploadWithVariants(
        file,
        {
          assetId,
          projectId,
          generateVariants: true,
          generateThumbnail: true,
          generatePreview: true,
          onProgress: (progress) => {
            console.log(`[useAssetCreation] Upload: ${progress.percentage}%`);
          }
        }
      );

      if (result.success) {
        // Update asset with cloud metadata
        updateAsset(assetId, {
          cloud_status: 'synced',
          cloud_path: result.r2Key,
          cloud_size: file.size,
          cloud_updated_at: new Date().toISOString(),
          cloud_error: undefined
        });
        
        console.log('Asset successfully uploaded to cloud:', result.r2Key);
      } else {
        // Check if it's a quota error
        if (result.error?.includes('quota') || result.error?.includes('Quota')) {
          const quotaLimit = effectiveLimits?.quotaBytes || quota.available;
          
          setUpgradeModal({
            isOpen: true,
            currentUsage: quota.used,
            quotaLimit,
            requiredBytes: file.size
          });
        }
        
        // Handle upload failure but keep local asset
        const userFriendlyError = getUserFriendlyErrorMessage(result.error || 'Unknown upload error');
        updateAsset(assetId, { 
          cloud_status: 'failed',
          cloud_error: userFriendlyError
        });
        
        console.error('Cloud upload failed:', result.error);
      }
    } catch (error) {
      // Handle unexpected errors but preserve local asset
      const errorMessage = error instanceof Error ? error.message : 'Unexpected error';
      const userFriendlyMessage = getUserFriendlyErrorMessage(errorMessage);
      
      updateAsset(assetId, { 
        cloud_status: 'failed',
        cloud_error: userFriendlyMessage
      });
      
      console.error('Unexpected error during cloud upload:', error);
    }
  };

  const retryCloudUpload = async (assetId: string, file: File, projectId?: string): Promise<void> => {
    await uploadAssetToCloud(assetId, file, projectId);
  };

  const canUploadToCloud = async (file: File): Promise<boolean> => {
    if (!syncEnabled || !isAuthenticated) {
      return false;
    }

    // Quota check is now handled server-side by getUploadUrls Edge Function
    // We do a client-side estimate based on current quota
    const quotaLimit = effectiveLimits?.quotaBytes || quota.available;
    return (quota.used + file.size) <= quotaLimit;
  };

  const closeUpgradeModal = () => {
    setUpgradeModal(prev => ({ ...prev, isOpen: false }));
  };

  // Check if user is over quota to determine modal type
  const isOverQuota = effectiveLimits?.quotaBytes && quota.used >= effectiveLimits.quotaBytes;

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
