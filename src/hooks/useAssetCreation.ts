import { useKanvasStore } from '@/stores/kanvasStore';
import { unifiedUploadService } from '@/services/UnifiedUploadService';
import type { Asset } from '@/types/Asset';

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

  const createNewAsset = async (
    assetData: Omit<Asset, 'id' | 'metadata'> & { metadata?: Partial<Asset['metadata']> }, 
    options?: { 
      fromUserClick?: boolean;
      file?: File;
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
      
      if (options.file) {
        const result = await unifiedUploadService.uploadFile(options.file, {
          assetId,
          projectId: assetData.projectId,
          metadata: {
            assetId,
            projectId: assetData.projectId,
          },
        });

        if (!result.success) {
          throw new Error(result.error || 'Failed to store file locally');
        }

        await updateAsset(assetId, { 
          content: {
            ...assetData.content,
            customFields: {
              ...assetData.content.customFields,
              fileName: options.file.name,
              fileKey: result.key,
              fileSize: options.file.size,
              fileMimeType: options.file.type,
              fileStoredAt: result.metadata?.fileStoredAt,
            }
          }
        });
      }

      return assetId;
    } catch (error) {
      console.error('Failed to create asset:', error);
      throw error;
    }
  };

  const uploadAssetToCloud = async (assetId: string, file: File, projectId?: string): Promise<void> => {
    if (!projectId) {
      console.warn('No project ID provided, skipping local file storage');
      return;
    }

    try {
      const result = await unifiedUploadService.uploadFile(
        file,
        {
          assetId,
          projectId,
          onProgress: (progress) => {
            console.log(`[useAssetCreation] Upload: ${progress.percentage}%`);
          },
        }
      );

      if (result.success) {
        await updateAsset(assetId, {
          content: {
            title: useKanvasStore.getState().getAsset(assetId)?.content.title || '',
            customFields: {
              ...(useKanvasStore.getState().getAsset(assetId)?.content.customFields || {}),
              fileName: file.name,
              fileKey: result.key,
              fileSize: file.size,
              fileMimeType: file.type,
              fileStoredAt: result.metadata?.fileStoredAt,
            },
          },
        });
      } else {
        const userFriendlyError = getUserFriendlyErrorMessage(result.error || 'Unknown upload error');
        await updateAsset(assetId, {
          content: {
            customFields: {
              ...(useKanvasStore.getState().getAsset(assetId)?.content.customFields || {}),
              uploadError: userFriendlyError
            }
          }
        });

        console.error('Local file storage failed:', result.error);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unexpected error';
      const userFriendlyMessage = getUserFriendlyErrorMessage(errorMessage);
      
      await updateAsset(assetId, {
        content: {
          customFields: {
            ...(useKanvasStore.getState().getAsset(assetId)?.content.customFields || {}),
            uploadError: userFriendlyMessage
          }
        }
      });
      
      console.error('Unexpected error during local file storage:', error);
    }
  };

  const retryCloudUpload = async (assetId: string, file: File, projectId?: string): Promise<void> => {
    await uploadAssetToCloud(assetId, file, projectId);
  };

  const canUploadToCloud = async (_file: File): Promise<boolean> => true;

  return { 
    createNewAsset,
    uploadAssetToCloud,
    retryCloudUpload,
    canUploadToCloud,
    upgradeModal: { isOpen: false, currentUsage: 0, quotaLimit: 0, requiredBytes: 0 },
    closeUpgradeModal: () => {},
    isOverQuota: false
  };
}
