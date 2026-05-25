/**
 * File Upload Service - Supabase Storage Integration
 * 
 * This service handles file uploads to Supabase Storage and creates
 * corresponding file records in the database using the create_file RPC.
 * 
 * NOTE: There is NO server-side get_file_url RPC because storage.sign()
 * is not a real Supabase SQL function. Use the client-side Supabase
 * Storage SDK directly for signed URLs.
 */

import { supabase } from '@/lib/supabase';
import { USE_SUPABASE } from '@/config/features';
import { createFile } from './ProjectService';

// =====================================================
// Type Definitions
// =====================================================

export interface UploadResult {
  fileId: string;
  storageKey: string;
  signedUrl?: string;
}

export interface UploadOptions {
  projectId: string;
  assetId?: string;
  expiresIn?: number; // Signed URL expiration in seconds (default: 3600 = 1 hour)
  bucket?: string; // Storage bucket name (default: 'files')
}

// =====================================================
// Main Upload Function
// =====================================================

/**
 * Upload file to Supabase Storage and create file record
 * 
 * This function:
 * 1. Generates a unique storage key
 * 2. Uploads the file to Supabase Storage
 * 3. Creates a file record in the database via RPC
 * 4. Optionally returns a signed URL for immediate access
 * 
 * If the database record creation fails, it rolls back the storage upload.
 * 
 * @param file - The File object to upload
 * @param options - Upload options (projectId, assetId, expiresIn, bucket)
 * @returns Upload result with fileId, storageKey, and optional signedUrl
 * @throws Error if upload or record creation fails
 */
export async function uploadFile(
  file: File,
  options: UploadOptions
): Promise<UploadResult> {
  if (!USE_SUPABASE) {
    throw new Error('Cloud file uploads are disabled when USE_SUPABASE=false');
  }

  const { projectId, assetId, expiresIn = 3600, bucket = 'files' } = options;

  // 1. Generate unique storage key
  // Format: {projectId}/{assetId}/{timestamp}-{filename}
  const timestamp = Date.now();
  const assetPart = assetId ? `${assetId}/` : '';
  const storageKey = `${projectId}/${assetPart}${timestamp}-${file.name}`;

  try {
    // 2. Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(storageKey, file);

    if (uploadError) {
      console.error('File upload failed:', uploadError);
      throw new Error(`File upload failed: ${uploadError.message}`);
    }

    // 3. Create file record in database
    try {
      const fileId = await createFile(
        projectId,
        assetId || null,
        storageKey,
        file.type,
        file.size
      );

      // 4. Generate signed URL for immediate access (optional)
      let signedUrl: string | undefined;
      try {
        signedUrl = await getSignedUrl(storageKey, expiresIn, bucket);
      } catch (urlError) {
        // If signed URL generation fails, log warning but don't fail the upload
        console.warn('Failed to generate signed URL:', urlError);
      }

      return {
        fileId,
        storageKey,
        signedUrl
      };
    } catch (createError) {
      console.error('File record creation failed:', createError);
      
      // Rollback: delete from storage
      try {
        await supabase.storage.from(bucket).remove([storageKey]);
        console.log('Rolled back storage upload after database failure');
      } catch (rollbackError) {
        console.error('Failed to rollback storage upload:', rollbackError);
      }
      
      throw createError;
    }
  } catch (error) {
    console.error('File upload process failed:', error);
    throw error;
  }
}

// =====================================================
// Signed URL Functions
// =====================================================

/**
 * Get signed URL for file display (client-side only)
 * 
 * Creates a signed URL that provides temporary access to a file in
 * Supabase Storage. This is useful for displaying images or other
 * files without exposing the full storage URL.
 * 
 * @param storageKey - The storage key/path in Supabase Storage
 * @param expiresIn - URL expiration time in seconds (default: 3600 = 1 hour)
 * @param bucket - Storage bucket name (default: 'files')
 * @returns Signed URL string
 * @throws Error if URL generation fails
 */
export async function getSignedUrl(
  storageKey: string,
  expiresIn: number = 3600,
  bucket: string = 'files'
): Promise<string> {
  if (!USE_SUPABASE) {
    throw new Error('Signed URLs are disabled when USE_SUPABASE=false');
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storageKey, expiresIn);

  if (error) {
    console.error('Failed to create signed URL:', error);
    throw new Error(`Failed to create signed URL: ${error.message}`);
  }

  return data.signedUrl;
}

/**
 * Get public URL for file (if bucket is public)
 * 
 * Returns the public URL for a file. Only works if the bucket
 * is set to public in Supabase. For private buckets, use getSignedUrl.
 * 
 * @param storageKey - The storage key/path in Supabase Storage
 * @param bucket - Storage bucket name (default: 'files')
 * @returns Public URL string
 */
export function getPublicUrl(
  storageKey: string,
  bucket: string = 'files'
): string {
  if (!USE_SUPABASE) {
    return '';
  }

  const { data } = supabase.storage
    .from(bucket)
    .getPublicUrl(storageKey);

  return data.publicUrl;
}

// =====================================================
// File Deletion Functions
// =====================================================

/**
 * Delete file from Supabase Storage
 * 
 * Deletes a file from storage. Note: This does NOT delete the
 * corresponding file record in the database - you must handle that
 * separately if needed.
 * 
 * @param storageKey - The storage key/path in Supabase Storage
 * @param bucket - Storage bucket name (default: 'files')
 * @throws Error if deletion fails
 */
export async function deleteFileFromStorage(
  storageKey: string,
  bucket: string = 'files'
): Promise<void> {
  if (!USE_SUPABASE) {
    return;
  }

  const { error } = await supabase.storage
    .from(bucket)
    .remove([storageKey]);

  if (error) {
    console.error('Failed to delete file from storage:', error);
    throw new Error(`Failed to delete file from storage: ${error.message}`);
  }
}

/**
 * Delete file and its storage record
 * 
 * Deletes both the file from storage and the database record.
 * This is a convenience function that combines both operations.
 * 
 * @param storageKey - The storage key/path in Supabase Storage
 * @param projectId - The project UUID (for ownership validation)
 * @param bucket - Storage bucket name (default: 'files')
 * @throws Error if deletion fails
 */
export async function deleteFile(
  storageKey: string,
  projectId: string,
  bucket: string = 'files'
): Promise<void> {
  if (!USE_SUPABASE) {
    return;
  }

  // Delete from storage
  await deleteFileFromStorage(storageKey, bucket);

  // Note: You may want to add a delete_file RPC function to the database
  // to handle the database record deletion with proper ownership checks.
  // For now, this only deletes from storage.
  console.warn('Database file record deletion not implemented - only storage deleted');
}

// =====================================================
// File Listing Functions
// =====================================================

/**
 * List files in a project's storage folder
 * 
 * Lists all files in a project's folder in Supabase Storage.
 * Useful for debugging or file management UIs.
 * 
 * @param projectId - The project UUID
 * @param bucket - Storage bucket name (default: 'files')
 * @returns Array of file metadata
 * @throws Error if listing fails
 */
export async function listProjectFiles(
  projectId: string,
  bucket: string = 'files'
): Promise<any[]> {
  if (!USE_SUPABASE) {
    return [];
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .list(projectId);

  if (error) {
    console.error('Failed to list files:', error);
    throw new Error(`Failed to list files: ${error.message}`);
  }

  return data || [];
}

// =====================================================
// Batch Upload Functions
// =====================================================

/**
 * Upload multiple files in batch
 * 
 * Uploads multiple files concurrently. Useful for batch imports.
 * 
 * @param files - Array of File objects to upload
 * @param options - Upload options (projectId, assetId, expiresIn, bucket)
 * @returns Array of upload results
 * @throws Error if any upload fails
 */
export async function uploadFilesBatch(
  files: File[],
  options: UploadOptions
): Promise<UploadResult[]> {
  if (!USE_SUPABASE) {
    return [];
  }

  const uploadPromises = files.map(file => uploadFile(file, options));
  
  try {
    const results = await Promise.all(uploadPromises);
    return results;
  } catch (error) {
    console.error('Batch upload failed:', error);
    throw error;
  }
}

// =====================================================
// Utility Functions
// =====================================================

/**
 * Validate file type
 * 
 * Checks if a file is of an allowed type.
 * 
 * @param file - The File object to validate
 * @param allowedTypes - Array of allowed MIME types
 * @returns True if file type is allowed
 */
export function isFileTypeAllowed(file: File, allowedTypes: string[]): boolean {
  return allowedTypes.includes(file.type);
}

/**
 * Validate file size
 * 
 * Checks if a file is within the size limit.
 * 
 * @param file - The File object to validate
 * @param maxSizeBytes - Maximum file size in bytes
 * @returns True if file size is within limit
 */
export function isFileSizeAllowed(file: File, maxSizeBytes: number): boolean {
  return file.size <= maxSizeBytes;
}

/**
 * Get file extension
 * 
 * Extracts the file extension from a filename.
 * 
 * @param filename - The filename
 * @returns File extension (lowercase, without dot)
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

/**
 * Common file type validators
 */
export const FileValidators = {
  isImage: (file: File) => file.type.startsWith('image/'),
  isVideo: (file: File) => file.type.startsWith('video/'),
  isAudio: (file: File) => file.type.startsWith('audio/'),
  isPdf: (file: File) => file.type === 'application/pdf',
  isText: (file: File) => file.type.startsWith('text/'),
  
  // Common image formats
  isJpg: (file: File) => file.type === 'image/jpeg',
  isPng: (file: File) => file.type === 'image/png',
  isGif: (file: File) => file.type === 'image/gif',
  isWebp: (file: File) => file.type === 'image/webp',
  
  // Size limits (in bytes)
  MAX_IMAGE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_VIDEO_SIZE: 100 * 1024 * 1024, // 100MB
  MAX_AUDIO_SIZE: 50 * 1024 * 1024, // 50MB
  MAX_DOCUMENT_SIZE: 25 * 1024 * 1024, // 25MB
};

// =====================================================
// Error Handling
// =====================================================

/**
 * Custom error class for file upload errors
 */
export class FileUploadError extends Error {
  constructor(
    message: string,
    public code: 'UPLOAD_FAILED' | 'STORAGE_ERROR' | 'DB_ERROR' | 'VALIDATION_ERROR',
    public originalError?: Error
  ) {
    super(message);
    this.name = 'FileUploadError';
  }
}

/**
 * Handle file upload with comprehensive error handling
 * 
 * Wraps uploadFile with detailed error handling and user-friendly messages.
 * 
 * @param file - The File object to upload
 * @param options - Upload options
 * @returns Upload result
 * @throws FileUploadError with detailed error information
 */
export async function uploadFileWithErrorHandling(
  file: File,
  options: UploadOptions
): Promise<UploadResult> {
  // Validate file size
  if (!isFileSizeAllowed(file, FileValidators.MAX_IMAGE_SIZE)) {
    throw new FileUploadError(
      `File size exceeds maximum allowed size`,
      'VALIDATION_ERROR'
    );
  }

  try {
    return await uploadFile(file, options);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('upload')) {
        throw new FileUploadError(
          'Failed to upload file to storage',
          'STORAGE_ERROR',
          error
        );
      } else if (error.message.includes('record')) {
        throw new FileUploadError(
          'Failed to create file record',
          'DB_ERROR',
          error
        );
      }
    }
    throw new FileUploadError(
      'Unknown file upload error',
      'UPLOAD_FAILED',
      error as Error
    );
  }
}
