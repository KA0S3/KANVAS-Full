import { connectivityService } from './connectivityService';
import { useAssetStore } from '@/stores/assetStore';
import { useBackgroundStore } from '@/stores/backgroundStore';
import { useBookStore } from '@/stores/bookStoreSimple';
import { documentMutationService } from './DocumentMutationService';
import { logEmergency, reportError } from '@/utils/logger';

interface EmergencyBackup {
  assets: Record<string, any>;
  backgrounds: Record<string, any>;
  projectId: string | null;
  timestamp: number;
}

class EmergencySaveService {
  private static instance: EmergencySaveService;
  private isInitialized: boolean = false;
  private beforeUnloadHandler: ((e: Event) => void) | null = null;
  private pageHideHandler: ((e: Event) => void) | null = null;
  private visibilityChangeHandler: (() => void) | null = null;

  static getInstance(): EmergencySaveService {
    if (!EmergencySaveService.instance) {
      EmergencySaveService.instance = new EmergencySaveService();
    }
    return EmergencySaveService.instance;
  }

  private constructor() {
    // Don't initialize immediately - wait for explicit call
  }

  initialize(): void {
    if (this.isInitialized) return;
    
    this.setupEmergencyHandlers();
    this.isInitialized = true;
    logEmergency('Service initialized');
  }

  private setupEmergencyHandlers(): void {
    // Save on beforeunload (works in most browsers)
    const handleBeforeUnload = (e: Event) => {
      this.performEmergencySave();
      // Note: Modern browsers ignore custom messages, but the save will execute
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Save on pagehide (more reliable, especially on mobile)
    const handlePageHide = (e: Event) => {
      this.performEmergencySave();
    };
    window.addEventListener('pagehide', handlePageHide);

    // Save on visibility change (user switches tabs)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        this.performEmergencySave();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Store handlers for cleanup
    this.beforeUnloadHandler = handleBeforeUnload;
    this.pageHideHandler = handlePageHide;
    this.visibilityChangeHandler = handleVisibilityChange;

    // Cleanup on page unload to prevent memory leak
    window.addEventListener('beforeunload', () => {
      if (this.beforeUnloadHandler) {
        window.removeEventListener('beforeunload', this.beforeUnloadHandler);
      }
      if (this.pageHideHandler) {
        window.removeEventListener('pagehide', this.pageHideHandler);
      }
      if (this.visibilityChangeHandler) {
        document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
      }
    });

    logEmergency('Event handlers registered');
  }

  private async performEmergencySave(): Promise<void> {
    try {
      logEmergency('Performing emergency save');
      
      // 1. Save to localStorage immediately (fast, synchronous-ish)
      this.saveToLocalStorage();
      
      // 2. If online, attempt sync to Supabase via DocumentMutationService
      if (connectivityService.isOnline()) {
        // Use sendBeacon for reliable delivery during unload
        this.sendBeaconSync();
        
        // Also try immediate sync (may not complete during unload)
        documentMutationService.syncNow().catch(err => {
          logEmergency('Immediate sync failed (expected during unload):', err);
        });
      }
    } catch (error) {
      reportError(error, 'emergencySaveService.performEmergencySave', 'Emergency save failed');
    }
  }

  private saveToLocalStorage(): void {
    try {
      const assetStore = useAssetStore.getState();
      const backgroundStore = useBackgroundStore.getState();
      const bookStore = useBookStore.getState();
      
      const emergencyData: EmergencyBackup = {
        assets: assetStore.getCurrentBookAssets(),
        backgrounds: backgroundStore.configs || {},
        projectId: bookStore.currentBookId || null,
        timestamp: Date.now()
      };
      
      localStorage.setItem('kanvas-emergency-backup', JSON.stringify(emergencyData));
      logEmergency('Emergency backup saved to localStorage');
    } catch (error) {
      reportError(error, 'emergencySaveService.saveToLocalStorage', 'Failed to save to localStorage');
    }
  }

  private sendBeaconSync(): void {
    try {
      const bookStore = useBookStore.getState();
      const projectId = bookStore.currentBookId;
      
      if (!projectId) {
        logEmergency('No project ID, skipping beacon sync');
        return;
      }

      const data = {
        projectId,
        timestamp: Date.now(),
        type: 'emergency-sync'
      };
      
      // Use Supabase Edge Function URL for emergency-sync
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const functionUrl = `${supabaseUrl}/functions/v1/emergency-sync`;
      
      const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
      const sent = navigator.sendBeacon(functionUrl, blob);
      
      logEmergency(`Beacon sync ${sent ? 'sent' : 'failed'} to ${functionUrl}`);
    } catch (error) {
      reportError(error, 'emergencySaveService.beaconSync', 'Beacon sync failed');
    }
  }

  /**
   * Load emergency backup if available
   * Call this on app startup to recover from unexpected closure
   */
  loadEmergencyBackup(): EmergencyBackup | null {
    try {
      const backup = localStorage.getItem('kanvas-emergency-backup');
      if (!backup) return null;

      const data = JSON.parse(backup) as EmergencyBackup;
      
      // Only restore if backup is recent (within 24 hours)
      const hoursSinceBackup = (Date.now() - data.timestamp) / (1000 * 60 * 60);
      if (hoursSinceBackup > 24) {
        logEmergency('Backup too old, ignoring');
        localStorage.removeItem('kanvas-emergency-backup');
        return null;
      }

      logEmergency(`Emergency backup found, age: ${hoursSinceBackup.toFixed(2)} hours`);
      return data;
    } catch (error) {
      reportError(error, 'emergencySaveService.loadEmergencyBackup', 'Failed to load emergency backup');
      return null;
    }
  }

  /**
   * Clear emergency backup after successful sync
   */
  clearEmergencyBackup(): void {
    localStorage.removeItem('kanvas-emergency-backup');
    logEmergency('Emergency backup cleared');
  }

  /**
   * Check if emergency backup exists
   */
  hasEmergencyBackup(): boolean {
    return localStorage.getItem('kanvas-emergency-backup') !== null;
  }
}

export const emergencySaveService = EmergencySaveService.getInstance();
