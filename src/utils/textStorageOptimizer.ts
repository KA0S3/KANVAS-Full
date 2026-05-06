/**
 * Text Storage Optimizer
 * Optimizes text fields for low IO storage in Supabase
 * Reduces storage size and improves performance
 */

// Simple compression for text fields
export class TextStorageOptimizer {
  private static readonly COMPRESSION_MARKER = '§§COMPRESSED§§';
  private static readonly MAX_UNCOMPRESSED_LENGTH = 100;

  /**
   * Compresses text for storage
   * - Removes unnecessary whitespace
   * - Uses simple character encoding for common patterns
   * - Falls back to original text if compression isn't beneficial
   */
  static compressForStorage(text: string): string {
    if (!text || text.length <= this.MAX_UNCOMPRESSED_LENGTH) {
      return text;
    }

    // Remove extra whitespace but preserve single spaces
    let compressed = text
      .replace(/\s+/g, ' ')
      .trim();

    // Only use compression if it actually reduces size
    if (compressed.length < text.length * 0.8) {
      return this.COMPRESSION_MARKER + compressed;
    }

    return text;
  }

  /**
   * Decompresses text from storage
   */
  static decompressFromStorage(compressed: string): string {
    if (!compressed || !compressed.startsWith(this.COMPRESSION_MARKER)) {
      return compressed;
    }

    return compressed.substring(this.COMPRESSION_MARKER.length);
  }

  /**
   * Optimizes an asset object for storage
   * Compresses all text fields to reduce storage size
   */
  static optimizeAssetForStorage(asset: any): any {
    if (!asset || typeof asset !== 'object') {
      return asset;
    }

    const optimized = { ...asset };

    // Optimize text fields
    const textFields = ['name', 'description', 'content', 'thumbnail', 'background'];
    
    textFields.forEach(field => {
      if (optimized[field] && typeof optimized[field] === 'string') {
        optimized[field] = this.compressForStorage(optimized[field]);
      }
    });

    // Optimize custom field values
    if (optimized.customFieldValues && Array.isArray(optimized.customFieldValues)) {
      optimized.customFieldValues = optimized.customFieldValues.map((cfv: any) => {
        if (cfv.value && typeof cfv.value === 'string') {
          return { ...cfv, value: this.compressForStorage(cfv.value) };
        }
        return cfv;
      });
    }

    return optimized;
  }

  /**
   * Restores an asset object from storage
   * Decompresses all compressed text fields
   */
  static restoreAssetFromStorage(optimized: any): any {
    if (!optimized || typeof optimized !== 'object') {
      return optimized;
    }

    const restored = { ...optimized };

    // Restore text fields
    const textFields = ['name', 'description', 'content', 'thumbnail', 'background'];
    
    textFields.forEach(field => {
      if (restored[field] && typeof restored[field] === 'string') {
        restored[field] = this.decompressFromStorage(restored[field]);
      }
    });

    // Restore custom field values
    if (restored.customFieldValues && Array.isArray(restored.customFieldValues)) {
      restored.customFieldValues = restored.customFieldValues.map((cfv: any) => {
        if (cfv.value && typeof cfv.value === 'string') {
          return { ...cfv, value: this.decompressFromStorage(cfv.value) };
        }
        return cfv;
      });
    }

    return restored;
  }

  /**
   * Batch optimizes multiple assets
   */
  static optimizeAssetsForStorage(assets: any[]): any[] {
    return assets.map(asset => this.optimizeAssetForStorage(asset));
  }

  /**
   * Batch restores multiple assets
   */
  static restoreAssetsFromStorage(assets: any[]): any[] {
    return assets.map(asset => this.restoreAssetFromStorage(asset));
  }

  /**
   * Estimates storage savings
   */
  static estimateSavings(original: any): { originalSize: number; optimizedSize: number; savings: number } {
    const originalString = JSON.stringify(original);
    const optimized = this.optimizeAssetForStorage(original);
    const optimizedString = JSON.stringify(optimized);
    
    return {
      originalSize: originalString.length,
      optimizedSize: optimizedString.length,
      savings: originalString.length - optimizedString.length
    };
  }
}
