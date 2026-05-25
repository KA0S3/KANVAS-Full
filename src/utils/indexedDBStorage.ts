/**
 * IndexedDB storage for background images with compression
 * Falls back to localStorage for metadata, stores large blobs in IndexedDB
 */

interface StoredBackgroundImage {
  id: string;
  blob: Blob;
  compressed: boolean;
  originalSize: number;
  compressedSize: number;
  mimeType: string;
  lastModified: number;
}

class IndexedDBStorage {
  private static instance: IndexedDBStorage;
  private db: IDBDatabase | null = null;
  private readonly DB_NAME = 'KanvasBackgrounds';
  private readonly DB_VERSION = 1;
  private readonly STORE_NAME = 'images';
  private readonly COMPRESSION_QUALITY = 0.8;

  static getInstance(): IndexedDBStorage {
    if (!IndexedDBStorage.instance) {
      IndexedDBStorage.instance = new IndexedDBStorage();
    }
    return IndexedDBStorage.instance;
  }

  async initDB(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains(this.STORE_NAME)) {
          const store = db.createObjectStore(this.STORE_NAME, { keyPath: 'id' });
          store.createIndex('lastModified', 'lastModified', { unique: false });
        }
      };
    });
  }

  /**
   * Store image with compression
   */
  async storeImage(assetId: string, file: File): Promise<{ success: boolean; compressedSize?: number; error?: string }> {
    try {
      await this.initDB();

      // Compress if it's an image
      let processedBlob: Blob;
      let compressed = false;
      let compressedSize = file.size;

      if (file.type.startsWith('image/')) {
        try {
          processedBlob = await this.compressImage(file);
          compressed = true;
          compressedSize = processedBlob.size;
        } catch (error) {
          console.warn('Image compression failed, using original:', error);
          processedBlob = file;
        }
      } else {
        processedBlob = file;
      }

      // Store in IndexedDB
      const storedImage: StoredBackgroundImage = {
        id: assetId,
        blob: processedBlob,
        compressed,
        originalSize: file.size,
        compressedSize,
        mimeType: file.type,
        lastModified: Date.now()
      };

      const transaction = this.db!.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      
      await store.put(storedImage);

      // Clean up old images (keep only last 50)
      await this.cleanupOldImages();

      return { 
        success: true, 
        compressedSize 
      };

    } catch (error) {
      console.error('Failed to store image in IndexedDB:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Storage failed' 
      };
    }
  }

  /**
   * Retrieve image from IndexedDB
   */
  async getImage(assetId: string): Promise<string | null> {
    try {
      await this.initDB();

      const transaction = this.db!.transaction([this.STORE_NAME], 'readonly');
      const store = transaction.objectStore(this.STORE_NAME);
      
      const request = store.get(assetId);
      
      return new Promise((resolve) => {
        request.onsuccess = () => {
          const result = request.result;
          if (result) {
            // Convert blob back to data URL
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(result.blob);
          } else {
            resolve(null);
          }
        };
        request.onerror = () => resolve(null);
      });

    } catch (error) {
      console.error('Failed to retrieve image from IndexedDB:', error);
      return null;
    }
  }

  /**
   * Remove image from IndexedDB
   */
  async removeImage(assetId: string): Promise<boolean> {
    try {
      await this.initDB();

      const transaction = this.db!.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      
      await store.delete(assetId);
      return true;

    } catch (error) {
      console.error('Failed to remove image from IndexedDB:', error);
      return false;
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<{ count: number; totalSize: number; compressedSize: number }> {
    try {
      await this.initDB();

      const transaction = this.db!.transaction([this.STORE_NAME], 'readonly');
      const store = transaction.objectStore(this.STORE_NAME);
      
      return new Promise((resolve) => {
        const request = store.getAll();
        request.onsuccess = () => {
          const images = request.result;
          const totalSize = images.reduce((sum, img) => sum + img.originalSize, 0);
          const compressedSize = images.reduce((sum, img) => sum + img.compressedSize, 0);
          resolve({ count: images.length, totalSize, compressedSize });
        };
        request.onerror = () => resolve({ count: 0, totalSize: 0, compressedSize: 0 });
      });

    } catch (error) {
      console.error('Failed to get storage stats:', error);
      return { count: 0, totalSize: 0, compressedSize: 0 };
    }
  }

  /**
   * Compress image using canvas
   */
  private async compressImage(file: File, targetWidth: number = 1920, targetHeight: number = 1080): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      img.onload = () => {
        try {
          // Calculate new dimensions while maintaining aspect ratio
          let { width, height } = img;
          const aspectRatio = width / height;

          if (width > targetWidth || height > targetHeight) {
            if (width > height) {
              width = targetWidth;
              height = width / aspectRatio;
            } else {
              height = targetHeight;
              width = height * aspectRatio;
            }
          }

          canvas.width = width;
          canvas.height = height;

          // Draw and compress
          ctx?.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error('Failed to compress image'));
              }
            },
            file.type,
            this.COMPRESSION_QUALITY
          );
        } catch (error) {
          reject(error);
        }
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * Clean up old images to prevent storage bloat
   */
  private async cleanupOldImages(keepCount: number = 50): Promise<void> {
    try {
      const transaction = this.db!.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      const index = store.index('lastModified');
      
      const request = index.getAll();
      request.onsuccess = () => {
        const images = request.result;
        
        if (images.length > keepCount) {
          // Sort by last modified and remove oldest
          images.sort((a, b) => a.lastModified - b.lastModified);
          const toRemove = images.slice(0, images.length - keepCount);
          
          toRemove.forEach(img => {
            store.delete(img.id);
          });
        }
      };

    } catch (error) {
      console.warn('Failed to cleanup old images:', error);
    }
  }

  /**
   * Clear all stored images
   */
  async clearAll(): Promise<boolean> {
    try {
      await this.initDB();

      const transaction = this.db!.transaction([this.STORE_NAME], 'readwrite');
      const store = transaction.objectStore(this.STORE_NAME);
      
      await store.clear();
      return true;

    } catch (error) {
      console.error('Failed to clear IndexedDB:', error);
      return false;
    }
  }
}

export const indexedDBStorage = IndexedDBStorage.getInstance();
