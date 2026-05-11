import { useAuthStore } from '@/stores/authStore';
import { shouldMonitorQuota } from '@/config/plans';

interface StorageQuotaInfo {
  used: number;
  available: number;
  percentage: number;
  isNearLimit: boolean;
  isOverLimit: boolean;
}

interface StorageCleanupStrategy {
  removeLargeImages: boolean;
  compressAssets: boolean;
  removeOldAssets: boolean;
  removeUnusedAssets: boolean;
}

export class StorageQuotaMonitor {
  private static instance: StorageQuotaMonitor;
  private monitoringInterval: number | null = null;
  private readonly CHECK_INTERVAL_MS = 30000; // 30 seconds
  private readonly WARNING_THRESHOLD = 0.8; // 80%
  private readonly CRITICAL_THRESHOLD = 0.95; // 95%
  private readonly GUEST_QUOTA_BYTES = 5 * 1024 * 1024; // 5MB for guest users

  static getInstance(): StorageQuotaMonitor {
    if (!StorageQuotaMonitor.instance) {
      StorageQuotaMonitor.instance = new StorageQuotaMonitor();
    }
    return StorageQuotaMonitor.instance;
  }

  private constructor() {
    // Defer monitoring start to prevent startup logs
    // Monitoring will start when first accessed
  }

  /**
   * Get current localStorage quota information
   */
  getStorageQuota(): StorageQuotaInfo {
    // Start monitoring on first access
    if (!this.monitoringInterval) {
      this.startMonitoring();
    }

    try {
      // Estimate localStorage usage
      let totalUsed = 0;
      for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          totalUsed += localStorage[key].length + key.length;
        }
      }

      // Get available quota (localStorage typically has 5-10MB limit)
      const estimatedQuota = 5 * 1024 * 1024; // 5MB conservative estimate
      const available = Math.max(0, estimatedQuota - totalUsed);
      const percentage = (totalUsed / estimatedQuota) * 100;

      return {
        used: totalUsed,
        available,
        percentage,
        isNearLimit: percentage >= this.WARNING_THRESHOLD * 100,
        isOverLimit: percentage >= this.CRITICAL_THRESHOLD * 100
      };
    } catch (error) {
      console.error('[StorageQuotaMonitor] Failed to get storage quota:', error);
      return {
        used: 0,
        available: 0,
        percentage: 0,
        isNearLimit: false,
        isOverLimit: false
      };
    }
  }

  /**
   * Check if quota monitoring should be enabled for current user
   */
  shouldMonitor(): boolean {
    const authStore = useAuthStore.getState();
    const planId = authStore.plan;
    
    // Only monitor if plan requires it
    if (!shouldMonitorQuota(planId)) {
      return false;
    }

    // Always monitor guest users (they have localStorage-only storage)
    if (planId === 'guest') {
      return true;
    }

    return authStore.isAuthenticated;
  }

  /**
   * Start quota monitoring for eligible users
   */
  startMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = window.setInterval(() => {
      if (this.shouldMonitor()) {
        this.checkQuotaAndCleanup();
      }
    }, this.CHECK_INTERVAL_MS);
  }

  /**
   * Stop quota monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  /**
   * Check quota and perform intelligent cleanup if needed
   */
  async checkQuotaAndCleanup(): Promise<void> {
    const quota = this.getStorageQuota();
    
    console.log('[StorageQuotaMonitor] Storage quota check:', {
      used: `${(quota.used / 1024 / 1024).toFixed(2)}MB`,
      available: `${(quota.available / 1024 / 1024).toFixed(2)}MB`,
      percentage: `${quota.percentage.toFixed(1)}%`,
      isNearLimit: quota.isNearLimit,
      isOverLimit: quota.isOverLimit
    });

    if (quota.isOverLimit) {
      console.warn('[StorageQuotaMonitor] Storage quota exceeded, performing emergency cleanup');
      await this.performCleanup({
        removeLargeImages: true,
        compressAssets: true,
        removeOldAssets: true,
        removeUnusedAssets: true
      });
    } else if (quota.isNearLimit) {
      console.warn('[StorageQuotaMonitor] Storage quota near limit, performing preventive cleanup');
      await this.performCleanup({
        removeLargeImages: true,
        compressAssets: false,
        removeOldAssets: false,
        removeUnusedAssets: true
      });
    }
  }

  /**
   * Perform intelligent cleanup based on strategy
   */
  private async performCleanup(strategy: StorageCleanupStrategy): Promise<void> {
    console.log('[StorageQuotaMonitor] Performing cleanup with strategy:', strategy);
    
    try {
      // 1. Remove large images from localStorage
      if (strategy.removeLargeImages) {
        await this.removeLargeImages();
      }

      // 2. Remove unused assets (assets not in current book)
      if (strategy.removeUnusedAssets) {
        await this.removeUnusedAssets();
      }

      // 3. Remove old assets (for guest users with single book limit)
      if (strategy.removeOldAssets) {
        await this.removeOldAssets();
      }

      // 4. Compress remaining assets if needed
      if (strategy.compressAssets) {
        await this.compressAssets();
      }

      console.log('[StorageQuotaMonitor] Cleanup completed');
      
      // Check quota after cleanup
      const newQuota = this.getStorageQuota();
      console.log('[StorageQuotaMonitor] Storage quota after cleanup:', {
        used: `${(newQuota.used / 1024 / 1024).toFixed(2)}MB`,
        available: `${(newQuota.available / 1024 / 1024).toFixed(2)}MB`,
        percentage: `${newQuota.percentage.toFixed(1)}%`
      });

    } catch (error) {
      console.error('[StorageQuotaMonitor] Cleanup failed:', error);
    }
  }

  /**
   * Remove large images from localStorage
   */
  private async removeLargeImages(): Promise<void> {
    const kanvasStorage = localStorage.getItem('kanvas-world-storage');
    if (!kanvasStorage) return;

    try {
      const parsed = JSON.parse(kanvasStorage);
      let modified = false;

      if (parsed.state && parsed.state.books) {
        Object.keys(parsed.state.books).forEach(bookId => {
          const book = parsed.state.books[bookId];
          
          // Remove large cover images
          if (book.coverImage && book.coverImage.startsWith('data:image/') && book.coverImage.length > 50000) {
            console.log(`[StorageQuotaMonitor] Removing large cover image for book: ${bookId}`);
            delete book.coverImage;
            modified = true;
          }

          // Remove large cover page images
          if (book.coverPageSettings && book.coverPageSettings.coverImageData && book.coverPageSettings.coverImageData.length > 50000) {
            console.log(`[StorageQuotaMonitor] Removing large cover page image for book: ${bookId}`);
            delete book.coverPageSettings.coverImageData;
            modified = true;
          }
        });
      }

      if (modified) {
        localStorage.setItem('kanvas-world-storage', JSON.stringify(parsed));
        console.log('[StorageQuotaMonitor] Large images removed from localStorage');
      }
    } catch (error) {
      console.error('[StorageQuotaMonitor] Failed to remove large images:', error);
    }
  }

  /**
   * Remove unused assets from localStorage
   */
  private async removeUnusedAssets(): Promise<void> {
    const authStore = useAuthStore.getState();
    const bookStore = (await import('@/stores/bookStoreSimple')).useBookStore.getState();
    const currentBookId = bookStore.currentBookId;

    if (!currentBookId) return;

    try {
      const kanvasStorage = localStorage.getItem('kanvas-world-storage');
      if (!kanvasStorage) return;

      const parsed = JSON.parse(kanvasStorage);
      let modified = false;

      if (parsed.state && parsed.state.books) {
        Object.keys(parsed.state.books).forEach(bookId => {
          // For guest users, only keep current book
          if (authStore.plan === 'guest' && bookId !== currentBookId) {
            console.log(`[StorageQuotaMonitor] Removing unused book for guest user: ${bookId}`);
            delete parsed.state.books[bookId];
            modified = true;
          }
        });
      }

      if (modified) {
        localStorage.setItem('kanvas-world-storage', JSON.stringify(parsed));
        console.log('[StorageQuotaMonitor] Unused assets removed from localStorage');
      }
    } catch (error) {
      console.error('[StorageQuotaMonitor] Failed to remove unused assets:', error);
    }
  }

  /**
   * Remove old assets (for guest users who exceed single book limit)
   */
  private async removeOldAssets(): Promise<void> {
    const authStore = useAuthStore.getState();
    if (authStore.plan !== 'guest') return;

    const bookStore = (await import('@/stores/bookStoreSimple')).useBookStore.getState();
    const books = bookStore.getAllBooks();

    // Guest users should only have 1 book
    if (books.length <= 1) return;

    try {
      const kanvasStorage = localStorage.getItem('kanvas-world-storage');
      if (!kanvasStorage) return;

      const parsed = JSON.parse(kanvasStorage);
      let modified = false;

      if (parsed.state && parsed.state.books) {
        // Sort books by last updated time, keep only the most recent
        const sortedBooks = Object.entries(parsed.state.books)
          .sort(([, a], [, b]) => ((b as any).updatedAt || 0) - ((a as any).updatedAt || 0));

        // Keep only the first (most recent) book
        const booksToKeep = sortedBooks.slice(0, 1);
        const booksToRemove = sortedBooks.slice(1);

        booksToRemove.forEach(([bookId, book]) => {
          const bookData = book as any;
          console.log(`[StorageQuotaMonitor] Removing old book for guest user: ${bookId} (${bookData.name || 'Unnamed'})`);
          delete parsed.state.books[bookId];
          modified = true;
        });

        // Update current book ID if needed
        if (booksToRemove.length > 0 && parsed.state.currentBookId) {
          const currentBookStillExists = booksToKeep.some(([id]) => id === parsed.state.currentBookId);
          if (!currentBookStillExists) {
            parsed.state.currentBookId = booksToKeep[0][0];
          }
        }
      }

      if (modified) {
        localStorage.setItem('kanvas-world-storage', JSON.stringify(parsed));
        console.log('[StorageQuotaMonitor] Old assets removed for guest user');
      }
    } catch (error) {
      console.error('[StorageQuotaMonitor] Failed to remove old assets:', error);
    }
  }

  /**
   * Compress assets (placeholder for future implementation)
   */
  private async compressAssets(): Promise<void> {
    // This would implement asset compression logic
    // For now, just log that compression would happen
    console.log('[StorageQuotaMonitor] Asset compression not yet implemented');
  }

  /**
   * Get storage recommendations for user
   */
  getStorageRecommendations(): string[] {
    const quota = this.getStorageQuota();
    const recommendations: string[] = [];

    if (quota.isOverLimit) {
      recommendations.push('Storage quota exceeded. Consider upgrading to a paid plan for cloud storage.');
      recommendations.push('Remove unused assets and large images to free up space.');
    } else if (quota.isNearLimit) {
      recommendations.push('Storage quota nearly full. Consider upgrading for more storage.');
      recommendations.push('Remove unused assets to prevent data loss.');
    }

    const authStore = useAuthStore.getState();
    if (authStore.plan === 'guest') {
      recommendations.push('Guest users have limited local storage. Sign up for a free account with 100MB cloud storage.');
    }

    return recommendations;
  }

  /**
   * Cleanup method for component unmount
   */
  destroy(): void {
    this.stopMonitoring();
  }
}

export const storageQuotaMonitor = StorageQuotaMonitor.getInstance();
