import { importAssetToCurrentProject } from '@/persistence/desktopProjectPersistence';
import { db, type FileBlob } from '@/storage/indexeddb';
import { useProjectStore } from '@/stores/projectStore';
import { createId } from '@/utils/id';

interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

interface UploadOptions {
  assetId?: string;
  projectId?: string;
  backend?: 'auto' | 'local' | 'r2' | 'supabase';
  onProgress?: (progress: UploadProgress) => void;
  onComplete?: (result: UploadResult) => void;
  onError?: (error: Error) => void;
  metadata?: Record<string, any>;
}

interface UploadStatus {
  status: 'pending' | 'uploading' | 'completed' | 'error' | 'cancelled';
  progress?: UploadProgress;
  result?: UploadResult;
}

interface UploadResult {
  success: boolean;
  url?: string;
  publicUrl?: string;
  key?: string;
  size?: number;
  metadata?: Record<string, any>;
  error?: string;
}

type CloudRetryListener = (assetId: string, retryCount: number, cloudError?: string) => void;

class UnifiedUploadService {
  private static instance: UnifiedUploadService;
  private uploadStatuses = new Map<string, UploadStatus>();
  private cloudRetryListeners = new Set<CloudRetryListener>();

  static getInstance(): UnifiedUploadService {
    if (!UnifiedUploadService.instance) {
      UnifiedUploadService.instance = new UnifiedUploadService();
    }
    return UnifiedUploadService.instance;
  }

  async uploadFile(file: File, options: UploadOptions = {}): Promise<UploadResult> {
    return await this.storeFileLocally(file, options);
  }

  async uploadFileLegacy(file: File, options: UploadOptions = {}): Promise<UploadResult> {
    return await this.uploadFile(file, options);
  }

  async upload(file: File, options: UploadOptions = {}): Promise<UploadResult> {
    return await this.uploadFile(file, options);
  }

  async uploadFiles(files: File[], options: UploadOptions = {}): Promise<UploadResult[]> {
    return await Promise.all(files.map(file => this.uploadFile(file, options)));
  }

  async uploadBatch(
    files: Array<File | { file: File; assetId?: string; projectId?: string; metadata?: Record<string, any> }>,
    options: UploadOptions = {}
  ): Promise<UploadResult[]> {
    return await Promise.all(files.map(input => {
      if (input instanceof File) {
        return this.uploadFile(input, options);
      }

      return this.uploadFile(input.file, {
        ...options,
        assetId: input.assetId ?? options.assetId,
        projectId: input.projectId ?? options.projectId,
        metadata: {
          ...options.metadata,
          ...input.metadata,
        },
      });
    }));
  }

  async uploadWithVariants(file: File, options: UploadOptions = {}) {
    const original = await this.uploadFile(file, options);
    return {
      success: original.success,
      original,
      variants: [],
      error: original.error,
    };
  }

  async retryUpload(assetId: string, file: File, projectId?: string): Promise<UploadResult> {
    const retryCount = ((this.uploadStatuses.get(assetId)?.result?.metadata?.retryCount as number) || 0) + 1;

    for (const listener of this.cloudRetryListeners) {
      listener(assetId, retryCount);
    }

    return await this.uploadFile(file, {
      assetId,
      projectId,
      metadata: {
        retryCount,
        assetId,
        projectId,
      },
    });
  }

  getPublicUrl(storageKey: string): string {
    return storageKey;
  }

  getStatus() {
    return {
      r2Configured: false,
      supabaseConfigured: false,
      localOnly: true,
      availableBackends: ['local', 'r2', 'supabase', 'auto'],
      defaultBackend: 'local',
    };
  }

  isBackendAvailable(backend: string): boolean {
    return ['auto', 'local', 'r2', 'supabase'].includes(backend);
  }

  onCloudRetry(callback: CloudRetryListener): () => void {
    this.cloudRetryListeners.add(callback);
    return () => {
      this.cloudRetryListeners.delete(callback);
    };
  }

  cancelUpload(key: string): boolean {
    const current = this.uploadStatuses.get(key);
    if (!current) {
      return false;
    }

    this.uploadStatuses.set(key, {
      ...current,
      status: 'cancelled',
    });
    return true;
  }

  getUploadStatus(key: string): UploadStatus {
    return this.uploadStatuses.get(key) || {
      status: 'error',
      result: {
        success: false,
        error: `No upload found for key: ${key}`,
      },
    };
  }

  private async storeFileLocally(file: File, options: UploadOptions): Promise<UploadResult> {
    const backend = options.backend || 'auto';
    if (!this.isBackendAvailable(backend)) {
      return {
        success: false,
        error: `Unsupported backend: ${backend}`,
      };
    }

    const validation = this.validateFile(file);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
      };
    }

    const metadata = {
      ...options.metadata,
    };
    const assetId = String(metadata.assetId || options.assetId || createId());
    const projectId = String(
      metadata.projectId ||
      options.projectId ||
      useProjectStore.getState().currentProject?.id ||
      localStorage.getItem('currentProjectId') ||
      ''
    );
    const objectUrl = URL.createObjectURL(file);
    const fallbackKey = this.generateLocalKey(file, assetId);

    this.uploadStatuses.set(assetId, {
      status: 'uploading',
      progress: {
        loaded: 0,
        total: file.size,
        percentage: 0,
      },
    });

    try {
      let storageKey = fallbackKey;
      let publicUrl = objectUrl;

      if (this.canWriteToDesktopProject(projectId)) {
        const imported = await importAssetToCurrentProject(file, assetId);
        storageKey = imported.relativePath;
        publicUrl = imported.relativePath;
      }

      const createdAt = new Date().toISOString();
      const fileRecord: FileBlob = {
        id: createId(),
        projectId,
        assetId,
        storageKey,
        mimeType: file.type,
        sizeBytes: file.size,
        blob: file,
        createdAt,
      };

      await db.storeFile(fileRecord);

      const progress = {
        loaded: file.size,
        total: file.size,
        percentage: 100,
      };
      options.onProgress?.(progress);

      const result: UploadResult = {
        success: true,
        key: storageKey,
        url: objectUrl,
        publicUrl,
        size: file.size,
        metadata: {
          ...metadata,
          fileId: fileRecord.id,
          assetId,
          projectId,
          fileName: file.name,
          fileMimeType: file.type,
          fileStoredAt: createdAt,
        },
      };

      this.uploadStatuses.set(assetId, {
        status: 'completed',
        progress,
        result,
      });

      options.onComplete?.(result);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown upload error';
      const wrappedError = error instanceof Error ? error : new Error(errorMessage);

      this.uploadStatuses.set(assetId, {
        status: 'error',
        result: {
          success: false,
          error: errorMessage,
        },
      });
      options.onError?.(wrappedError);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  private canWriteToDesktopProject(projectId: string): boolean {
    if (typeof window === 'undefined' || !window.kanvasDesktop || !projectId) {
      return false;
    }

    return useProjectStore.getState().currentProject?.id === projectId;
  }

  private validateFile(file: File): { valid: boolean; error?: string } {
    if (!file) {
      return {
        valid: false,
        error: 'No file provided',
      };
    }

    if (!file.name) {
      return {
        valid: false,
        error: 'File must have a name',
      };
    }

    return { valid: true };
  }

  private generateLocalKey(file: File, assetId: string): string {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `assets/${assetId}/${Date.now()}-${safeName}`;
  }
}

export const unifiedUploadService = UnifiedUploadService.getInstance();
