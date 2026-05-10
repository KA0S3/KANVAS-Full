/**
 * Path Standardization Service
 * 
 * Ensures consistent file upload paths and URL handling across the application
 * Standardizes on R2 backend with proper path structure and URL management
 */

export enum PathType {
  ASSET = 'asset',
  THUMBNAIL = 'thumbnail',
  PREVIEW = 'preview',
  BACKGROUND = 'background',
  DOCUMENT = 'document',
  AVATAR = 'avatar',
  TEMP = 'temp'
}

export interface StandardizedPath {
  r2Key: string;
  publicUrl: string;
  backend: 'r2';
  pathType: PathType;
  projectId: string;
  assetId?: string;
  filename: string;
  extension: string;
}

export interface PathGenerationOptions {
  projectId: string;
  assetId?: string;
  filename?: string;
  pathType: PathType;
  preserveOriginalName?: boolean;
  includeTimestamp?: boolean;
  userId?: string;
}

class PathStandardizationService {
  private static instance: PathStandardizationService;
  private readonly R2_BASE_URL: string;
  private readonly PATH_SEPARATORS = {
    ASSET: 'assets',
    THUMBNAILS: 'thumbnails',
    PREVIEWS: 'previews',
    BACKGROUNDS: 'backgrounds',
    DOCUMENTS: 'documents',
    AVATARS: 'avatars',
    TEMP: 'temp'
  };

  static getInstance(): PathStandardizationService {
    if (!PathStandardizationService.instance) {
      PathStandardizationService.instance = new PathStandardizationService();
    }
    return PathStandardizationService.instance;
  }

  constructor() {
    // Get R2 base URL from environment
    this.R2_BASE_URL = import.meta.env.VITE_R2_PUBLIC_URL || '';
    
    if (!this.R2_BASE_URL) {
      console.warn('[PathStandardization] R2 base URL not configured');
    }
  }

  /**
   * Generate standardized R2 path for file upload
   */
  generateStandardizedPath(options: PathGenerationOptions): StandardizedPath {
    const { projectId, assetId, filename, pathType, preserveOriginalName, includeTimestamp, userId } = options;
    
    // Generate filename
    const generatedFilename = this.generateFilename(filename, pathType, preserveOriginalName, includeTimestamp);
    const extension = this.getFileExtension(filename || generatedFilename);
    
    // Build R2 key path
    const r2Key = this.buildR2Key(projectId, pathType, assetId, generatedFilename, userId);
    
    // Build public URL
    const publicUrl = this.buildPublicUrl(r2Key);

    return {
      r2Key,
      publicUrl,
      backend: 'r2',
      pathType,
      projectId,
      assetId,
      filename: generatedFilename,
      extension
    };
  }

  /**
   * Parse existing R2 path to extract components
   */
  parseR2Path(r2Key: string): Partial<StandardizedPath> {
    const parts = r2Key.split('/');
    
    if (parts.length < 3) {
      throw new Error(`Invalid R2 path format: ${r2Key}`);
    }

    const [userId, projectId, pathTypeStr, ...rest] = parts;
    const pathType = this.parsePathType(pathTypeStr);
    
    if (!pathType) {
      throw new Error(`Invalid path type: ${pathTypeStr}`);
    }

    const filename = rest.join('/');
    const assetId = this.extractAssetId(filename, pathType);
    const extension = this.getFileExtension(filename);

    return {
      r2Key,
      publicUrl: this.buildPublicUrl(r2Key),
      backend: 'r2',
      pathType,
      projectId,
      assetId,
      filename,
      extension
    };
  }

  /**
   * Migrate legacy cloud paths to standardized R2 paths
   */
  migrateLegacyPath(legacyPath: string, options: Omit<PathGenerationOptions, 'filename'>): StandardizedPath {
    // Try to extract filename from legacy path
    const filename = legacyPath.split('/').pop() || 'file';
    
    return this.generateStandardizedPath({
      ...options,
      filename,
      preserveOriginalName: true
    });
  }

  /**
   * Check if a path uses the standardized format
   */
  isStandardizedPath(path: string): boolean {
    try {
      const parsed = this.parseR2Path(path);
      return parsed.pathType !== undefined && parsed.projectId !== undefined;
    } catch {
      return false;
    }
  }

  /**
   * Get all standardized paths for an asset (main file, thumbnail, preview)
   */
  getAssetPaths(options: Omit<PathGenerationOptions, 'pathType'>): {
    main: StandardizedPath;
    thumbnail?: StandardizedPath;
    preview?: StandardizedPath;
  } {
    const main = this.generateStandardizedPath({ ...options, pathType: PathType.ASSET });
    
    const result: { main: StandardizedPath; thumbnail?: StandardizedPath; preview?: StandardizedPath } = {
      main
    };

    // Generate thumbnail path if it's an image
    if (this.isImageFile(main.filename)) {
      result.thumbnail = this.generateStandardizedPath({
        ...options,
        pathType: PathType.THUMBNAIL,
        filename: this.addSuffix(main.filename, '_thumb')
      });
    }

    // Generate preview path if it's an image
    if (this.isImageFile(main.filename)) {
      result.preview = this.generateStandardizedPath({
        ...options,
        pathType: PathType.PREVIEW,
        filename: this.addSuffix(main.filename, '_preview')
      });
    }

    return result;
  }

  /**
   * Generate filename with proper sanitization
   */
  private generateFilename(
    originalFilename?: string,
    pathType?: PathType,
    preserveOriginalName = false,
    includeTimestamp = false
  ): string {
    if (preserveOriginalName && originalFilename) {
      let sanitized = this.sanitizeFilename(originalFilename);
      
      if (includeTimestamp) {
        const nameWithoutExt = sanitized.substring(0, sanitized.lastIndexOf('.'));
        const extension = sanitized.substring(sanitized.lastIndexOf('.'));
        sanitized = `${nameWithoutExt}_${Date.now()}${extension}`;
      }
      
      return sanitized;
    }

    // Generate UUID-based filename
    const extension = originalFilename ? this.getFileExtension(originalFilename) : '';
    const baseName = this.getBaseNameForPathType(pathType);
    
    if (includeTimestamp) {
      return `${baseName}_${Date.now()}${extension}`;
    }
    
    return `${baseName}${extension}`;
  }

  /**
   * Build R2 key path
   */
  private buildR2Key(
    projectId: string,
    pathType: PathType,
    assetId?: string,
    filename?: string,
    userId?: string
  ): string {
    const parts: string[] = [];
    
    // Add user ID if provided
    if (userId) {
      parts.push(`users/${userId}`);
    }
    
    // Add project ID
    parts.push(projectId);
    
    // Add path type directory
    parts.push(this.PATH_SEPARATORS[pathType]);
    
    // Add asset ID if provided
    if (assetId) {
      parts.push(assetId);
    }
    
    // Add filename
    if (filename) {
      parts.push(filename);
    }

    return parts.join('/');
  }

  /**
   * Build public URL
   */
  private buildPublicUrl(r2Key: string): string {
    if (!this.R2_BASE_URL) {
      throw new Error('R2 base URL not configured');
    }
    
    // Ensure no double slashes
    const baseUrl = this.R2_BASE_URL.endsWith('/') ? this.R2_BASE_URL.slice(0, -1) : this.R2_BASE_URL;
    const key = r2Key.startsWith('/') ? r2Key.slice(1) : r2Key;
    
    return `${baseUrl}/${key}`;
  }

  /**
   * Sanitize filename for safe storage
   */
  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^a-zA-Z0-9\-_\.]/g, '_')
      .replace(/_+/g, '_')
      .toLowerCase();
  }

  /**
   * Get file extension
   */
  private getFileExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    return lastDot !== -1 ? filename.substring(lastDot) : '';
  }

  /**
   * Get base name for path type
   */
  private getBaseNameForPathType(pathType?: PathType): string {
    switch (pathType) {
      case PathType.THUMBNAIL:
        return 'thumb';
      case PathType.PREVIEW:
        return 'preview';
      case PathType.BACKGROUND:
        return 'bg';
      case PathType.DOCUMENT:
        return 'doc';
      case PathType.AVATAR:
        return 'avatar';
      case PathType.TEMP:
        return 'temp';
      case PathType.ASSET:
      default:
        return 'asset';
    }
  }

  /**
   * Parse path type from string
   */
  private parsePathType(pathTypeStr: string): PathType | undefined {
    const entry = Object.entries(this.PATH_SEPARATORS).find(([_, value]) => value === pathTypeStr);
    return entry ? entry[0] as PathType : undefined;
  }

  /**
   * Extract asset ID from filename
   */
  private extractAssetId(filename: string, pathType: PathType): string | undefined {
    // For assets, the asset ID is usually in the directory structure
    // For thumbnails/previews, we extract from filename
    if (pathType === PathType.THUMBNAIL || pathType === PathType.PREVIEW) {
      // Remove suffix and extension to get asset ID
      const baseName = filename.replace(/(_thumb|_preview)\.[^.]+$/, '');
      return baseName;
    }
    
    return undefined;
  }

  /**
   * Check if file is an image
   */
  private isImageFile(filename: string): boolean {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    const extension = this.getFileExtension(filename).toLowerCase();
    return imageExtensions.includes(extension);
  }

  /**
   * Add suffix to filename before extension
   */
  private addSuffix(filename: string, suffix: string): string {
    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1) {
      return filename + suffix;
    }
    
    const name = filename.substring(0, lastDot);
    const extension = filename.substring(lastDot);
    return name + suffix + extension;
  }

  /**
   * Get service status
   */
  getStatus(): {
    configured: boolean;
    baseUrl: string;
    supportedPathTypes: PathType[];
  } {
    return {
      configured: !!this.R2_BASE_URL,
      baseUrl: this.R2_BASE_URL,
      supportedPathTypes: Object.values(PathType)
    };
  }
}

// Export singleton instance
export const pathStandardizationService = PathStandardizationService.getInstance();

// Convenience functions
export const generateAssetPath = (
  projectId: string,
  assetId: string,
  filename?: string,
  options?: Partial<PathGenerationOptions>
): StandardizedPath => {
  return pathStandardizationService.generateStandardizedPath({
    projectId,
    assetId,
    filename,
    pathType: PathType.ASSET,
    ...options
  });
};

export const generateThumbnailPath = (
  projectId: string,
  assetId: string,
  filename?: string,
  options?: Partial<PathGenerationOptions>
): StandardizedPath => {
  return pathStandardizationService.generateStandardizedPath({
    projectId,
    assetId,
    filename,
    pathType: PathType.THUMBNAIL,
    ...options
  });
};

export const generateBackgroundPath = (
  projectId: string,
  backgroundId: string,
  filename?: string,
  options?: Partial<PathGenerationOptions>
): StandardizedPath => {
  return pathStandardizationService.generateStandardizedPath({
    projectId,
    assetId: backgroundId,
    filename,
    pathType: PathType.BACKGROUND,
    ...options
  });
};
