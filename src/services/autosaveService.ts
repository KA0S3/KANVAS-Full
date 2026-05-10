import { supabase } from '@/lib/supabase';
import { useAssetStore } from '@/stores/assetStore';
import { useBookStore } from '@/stores/bookStoreSimple';
import { useBackgroundStore } from '@/stores/backgroundStore';
import { useAuthStore } from '@/stores/authStore';
import { useCloudStore } from '@/stores/cloudStore';
import { documentMutationService, type SyncStatus } from './DocumentMutationService';
import { unifiedUploadService } from './UnifiedUploadService';
import { logAutosave, reportError } from '@/utils/logger';
import { performanceMonitor } from '@/utils/performanceMonitor';

export type AutosaveStatus = 'idle' | 'local-saving' | 'cloud-syncing' | 'saved' | 'error';
export type { SyncStatus };

interface AutosaveState {
  status: AutosaveStatus;
  lastSavedTime: Date | null;
  lastLocalSave: Date | null;
  lastCloudSync: Date | null;
  pendingChanges: boolean;
  errorMessage: string | null;
  pendingCloudSyncs: number;
}

interface AutosaveQueue {
  assets: boolean;
  backgrounds: boolean;
  worldData: boolean;
}

class AutosaveService {
  private static instance: AutosaveService;
  private state: AutosaveState;
  private queue: AutosaveQueue;
  private debounceTimer: number | null = null;
  private autosaveTimer: number | null = null;
  private visibilityChangeHandler: (() => void) | null = null;
  private subscribers: Set<(state: AutosaveState) => void> = new Set();
  
  // Configurable intervals (in milliseconds) - optimized to reduce Supabase I/O
  private readonly DEBOUNCE_DELAY = 10000; // 10 seconds (increased from 5s to reduce writes)
  private readonly AUTOSAVE_INTERVAL = 120000; // 2 minutes (increased from 60s to minimize DB requests)
  private readonly MANUAL_SAVE_INTERVAL = 10000; // 10 seconds for manual saves
  private readonly LOCAL_STORAGE_KEY = 'kanvas_autosave';

  // Batch storage operation configuration
  private readonly BATCH_SIZE_LIMIT = 50; // Maximum number of operations per batch
  private readonly BATCH_TIMEOUT_MS = 5000; // Force batch flush after 5 seconds
  private readonly BATCH_STORAGE_KEY = 'kanvas_batch_operations';
  private pendingBatchOperations: Array<{ id: string; type: string; data: any; timestamp: number }> = [];
  private batchFlushTimer: number | null = null;

  // Request deduplication configuration
  private readonly DEDUPLICATION_WINDOW_MS = 1000; // 1 second window for deduplication
  private pendingRequests: Map<string, { timestamp: number; abortController: AbortController }> = new Map();
  private ongoingSaveOperations: Set<string> = new Set();

  static getInstance(): AutosaveService {
    if (!AutosaveService.instance) {
      AutosaveService.instance = new AutosaveService();
    }
    return AutosaveService.instance;
  }

  private constructor() {
    this.state = {
      status: 'idle',
      lastSavedTime: null,
      lastLocalSave: null,
      lastCloudSync: null,
      pendingChanges: false,
      errorMessage: null,
      pendingCloudSyncs: 0,
    };
    this.queue = {
      assets: false,
      backgrounds: false,
      worldData: false,
    };

    this.setupStoreSubscriptions();
    this.setupVisibilityHandlers();
    // NOTE: Periodic autosave NOT started automatically to prevent idle DB requests
    // It will be started when there are pending changes
  }

  // Check if there are actual changes (both queue and DocumentMutationService)
  private hasActualChanges(): boolean {
    // Check autosave queue
    const hasQueueChanges = this.queue.assets || this.queue.backgrounds || this.queue.worldData;
    
    // Check DocumentMutationService changes
    const hasMutationChanges = documentMutationService.hasUnsavedChanges();
    
    return hasQueueChanges || hasMutationChanges;
  }

  // Smart change detection - only trigger autosave for meaningful changes
  private hasMeaningfulChanges(): boolean {
    // First check if there are any actual changes
    if (!this.hasActualChanges()) {
      return false;
    }

    // Check DocumentMutationService for meaningful changes
    const mutationChanges = this.getMeaningfulMutationChanges();
    if (mutationChanges.hasMetadataChanges || mutationChanges.hasPositionChanges) {
      return true;
    }

    // Check autosave queue for meaningful changes
    return this.hasMeaningfulQueueChanges();
  }

  // Get meaningful changes from DocumentMutationService
  private getMeaningfulMutationChanges(): { hasMetadataChanges: boolean; hasPositionChanges: boolean } {
    // For now, we'll consider any DocumentMutationService changes as meaningful
    // In a more sophisticated implementation, we could analyze the specific changes
    const hasUnsavedChanges = documentMutationService.hasUnsavedChanges();
    
    return {
      hasMetadataChanges: hasUnsavedChanges,
      hasPositionChanges: hasUnsavedChanges
    };
  }

  // Check if autosave queue has meaningful changes (not just UI state)
  private hasMeaningfulQueueChanges(): boolean {
    // Asset changes are always meaningful (they represent data changes)
    if (this.queue.assets) {
      return true;
    }

    // Background changes are meaningful (they affect visual state)
    if (this.queue.backgrounds) {
      return true;
    }

    // World data changes are meaningful (they affect project structure)
    if (this.queue.worldData) {
      return true;
    }

    return false;
  }

  // Batch storage operations
  private addToBatch(operation: { id: string; type: string; data: any }): void {
    this.pendingBatchOperations.push({
      ...operation,
      timestamp: Date.now()
    });

    // Check if batch should be flushed due to size limit
    if (this.pendingBatchOperations.length >= this.BATCH_SIZE_LIMIT) {
      this.flushBatch();
      return;
    }

    // Set timer to flush batch after timeout if not already set
    if (!this.batchFlushTimer) {
      this.batchFlushTimer = window.setTimeout(() => {
        this.flushBatch();
      }, this.BATCH_TIMEOUT_MS);
    }
  }

  private async flushBatch(): Promise<void> {
    if (this.batchFlushTimer) {
      clearTimeout(this.batchFlushTimer);
      this.batchFlushTimer = null;
    }

    if (this.pendingBatchOperations.length === 0) {
      return;
    }

    const startTime = Date.now();
    const operationsToProcess = [...this.pendingBatchOperations];
    this.pendingBatchOperations = [];

    // Track batch operation
    performanceMonitor.incrementBatchOperations();

    try {
      logAutosave(`Processing batch of ${operationsToProcess.length} operations`);
      
      // Group operations by type for efficient processing
      const groupedOps = this.groupOperationsByType(operationsToProcess);
      
      // Process each group
      for (const [type, operations] of Object.entries(groupedOps)) {
        await this.processBatchGroup(type, operations);
      }

      // Record timing metrics
      const duration = Date.now() - startTime;
      performanceMonitor.recordBatchTime(duration);
      logAutosave(`Batch processing completed in ${duration}ms`);
    } catch (error) {
      reportError(error, 'autosaveService.flushBatch', 'Batch processing failed');
      
      // Record timing metrics even for failed operations
      const duration = Date.now() - startTime;
      performanceMonitor.recordBatchTime(duration);
      logAutosave(`Batch processing failed after ${duration}ms`);
      
      // Re-add failed operations to batch for retry
      this.pendingBatchOperations.unshift(...operationsToProcess);
    }
  }

  private groupOperationsByType(operations: Array<{ id: string; type: string; data: any; timestamp: number }>): Record<string, Array<{ id: string; type: string; data: any; timestamp: number }>> {
    const grouped: Record<string, Array<{ id: string; type: string; data: any; timestamp: number }>> = {};
    
    for (const op of operations) {
      if (!grouped[op.type]) {
        grouped[op.type] = [];
      }
      grouped[op.type].push(op);
    }
    
    return grouped;
  }

  private async processBatchGroup(type: string, operations: Array<{ id: string; type: string; data: any; timestamp: number }>): Promise<void> {
    switch (type) {
      case 'asset_metadata':
        await this.processAssetMetadataBatch(operations);
        break;
      case 'asset_position':
        await this.processAssetPositionBatch(operations);
        break;
      case 'background_config':
        await this.processBackgroundConfigBatch(operations);
        break;
      case 'project_config':
        await this.processProjectConfigBatch(operations);
        break;
      default:
        logAutosave(`Unknown batch operation type: ${type}`);
    }
  }

  private async processAssetMetadataBatch(operations: Array<{ id: string; type: string; data: any; timestamp: number }>): Promise<void> {
    // Combine asset metadata changes into a single save_assets call
    const assetsData = operations.map(op => op.data);
    
    if (assetsData.length === 0) return;

    const { currentBookId } = useBookStore.getState();
    if (!currentBookId) return;

    const { error } = await supabase.rpc('save_assets', {
      p_project_id: currentBookId,
      p_assets: assetsData
    });

    if (error) {
      throw error;
    }

    logAutosave(`Batched ${assetsData.length} asset metadata changes`);
  }

  private async processAssetPositionBatch(operations: Array<{ id: string; type: string; data: any; timestamp: number }>): Promise<void> {
    // Combine position changes into a single save_positions call
    const positionsData = operations.map(op => op.data);
    
    if (positionsData.length === 0) return;

    const { currentBookId } = useBookStore.getState();
    if (!currentBookId) return;

    const { error } = await supabase.rpc('save_positions', {
      p_project_id: currentBookId,
      p_positions: positionsData
    });

    if (error) {
      throw error;
    }

    logAutosave(`Batched ${positionsData.length} position changes`);
  }

  private async processBackgroundConfigBatch(operations: Array<{ id: string; type: string; data: any; timestamp: number }>): Promise<void> {
    // Combine background config changes
    const { currentBookId } = useBookStore.getState();
    if (!currentBookId) return;

    // Merge all background configs
    const mergedConfigs: Record<string, any> = {};
    for (const op of operations) {
      Object.assign(mergedConfigs, op.data);
    }

    const { error } = await supabase.rpc('save_project', {
      p_project_id: currentBookId,
      p_backgrounds: mergedConfigs
    });

    if (error) {
      throw error;
    }

    logAutosave(`Batched ${operations.length} background config changes`);
  }

  private async processProjectConfigBatch(operations: Array<{ id: string; type: string; data: any; timestamp: number }>): Promise<void> {
    // Process project-level configuration changes
    const { currentBookId } = useBookStore.getState();
    if (!currentBookId) return;

    // Merge all project configs
    const mergedConfig: Record<string, any> = {};
    for (const op of operations) {
      Object.assign(mergedConfig, op.data);
    }

    const { error } = await supabase.rpc('save_project', {
      p_project_id: currentBookId,
      ...mergedConfig
    });

    if (error) {
      throw error;
    }

    logAutosave(`Batched ${operations.length} project config changes`);
  }

  // Request deduplication methods
  private generateRequestKey(type: string, data: any): string {
    // Generate a unique key for the request based on type and data hash
    const dataHash = this.hashData(data);
    return `${type}_${dataHash}`;
  }

  private hashData(data: any): string {
    // Simple hash function for deduplication
    const str = JSON.stringify(data, Object.keys(data).sort());
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  private shouldDeduplicateRequest(requestKey: string): boolean {
    const existing = this.pendingRequests.get(requestKey);
    if (!existing) {
      return false;
    }

    // Check if the request is within the deduplication window
    const now = Date.now();
    if (now - existing.timestamp < this.DEDUPLICATION_WINDOW_MS) {
      return true;
    }

    // Clean up expired request
    this.pendingRequests.delete(requestKey);
    return false;
  }

  private async executeWithDeduplication<T>(
    requestKey: string,
    operation: () => Promise<T>,
    abortSignal?: AbortSignal
  ): Promise<T> {
    // Check if request should be deduplicated
    if (this.shouldDeduplicateRequest(requestKey)) {
      logAutosave(`Request deduplicated: ${requestKey}`);
      throw new Error('Request deduplicated');
    }

    // Create abort controller for this request
    const abortController = new AbortController();
    
    // Track the request
    this.pendingRequests.set(requestKey, {
      timestamp: Date.now(),
      abortController
    });

    // Set up abort signal handling
    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        abortController.abort();
      });
    }

    try {
      const result = await operation();
      return result;
    } finally {
      // Clean up request tracking
      this.pendingRequests.delete(requestKey);
    }
  }

  private cancelPendingRequests(): void {
    logAutosave('Cancelling pending requests due to new save operation');
    
    for (const [key, request] of this.pendingRequests.entries()) {
      request.abortController.abort();
      logAutosave(`Cancelled request: ${key}`);
    }
    
    this.pendingRequests.clear();
  }

  private trackSaveOperation(operationId: string): void {
    this.ongoingSaveOperations.add(operationId);
  }

  private untrackSaveOperation(operationId: string): void {
    this.ongoingSaveOperations.delete(operationId);
  }

  private hasOngoingSaveOperation(operationId: string): boolean {
    return this.ongoingSaveOperations.has(operationId);
  }

  private cancelOngoingSaveOperations(): void {
    logAutosave(`Cancelling ${this.ongoingSaveOperations.size} ongoing save operations`);
    
    for (const operationId of this.ongoingSaveOperations) {
      // Cancel the corresponding request if it exists
      const request = this.pendingRequests.get(operationId);
      if (request) {
        request.abortController.abort();
      }
    }
    
    this.ongoingSaveOperations.clear();
  }

  private setupStoreSubscriptions(): void {
    // Subscribe to asset store changes with throttling
    let lastAssetChange = 0;
    const ASSET_THROTTLE_MS = 1000; // Throttle asset changes to 1 second
    
    const unsubscribeAssets = useAssetStore.subscribe(
      (state) => state,
      (state, prevState) => {
        if (state.bookAssets !== prevState.bookAssets) {
          const now = Date.now();
          if (now - lastAssetChange > ASSET_THROTTLE_MS) {
            lastAssetChange = now;
            this.queue.assets = true;
            this.queue.worldData = true;
            this.updateState({ pendingChanges: true });
            this.debounceAutosave();
          }
        }
      }
    );

    // Subscribe to background store changes with throttling
    let lastBackgroundChange = 0;
    const BACKGROUND_THROTTLE_MS = 1000; // Throttle background changes to 1 second
    
    const unsubscribeBackgrounds = useBackgroundStore.subscribe(
      (state) => state,
      (state, prevState) => {
        if (state.configs !== prevState.configs) {
          const now = Date.now();
          if (now - lastBackgroundChange > BACKGROUND_THROTTLE_MS) {
            lastBackgroundChange = now;
            this.queue.backgrounds = true;
            this.updateState({ pendingChanges: true });
            this.debounceAutosave();
          }
        }
      }
    );

    // Cleanup on service destruction (not typically needed in single-page apps)
    // return () => {
    //   unsubscribeAssets();
    //   unsubscribeBackgrounds();
    // };
  }

  private setupVisibilityHandlers(): void {
    const handleVisibilityChange = () => {
      if (document.hidden && this.state.pendingChanges) {
        logAutosave('Page hidden, performing emergency save');
        this.performAutosave();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Store handler for cleanup
    this.visibilityChangeHandler = handleVisibilityChange;

    // Cleanup on page unload to prevent memory leak
    window.addEventListener('beforeunload', () => {
      if (this.visibilityChangeHandler) {
        document.removeEventListener('visibilitychange', this.visibilityChangeHandler);
      }
    });
  }

  private debounceAutosave(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Cancel any pending save operations when new changes are detected
    this.cancelPendingRequests();

    this.debounceTimer = window.setTimeout(() => {
      this.performAutosave();
    }, this.DEBOUNCE_DELAY);

    // Start periodic autosave when there are pending changes
    if (!this.autosaveTimer && this.state.pendingChanges) {
      this.startPeriodicAutosave();
    }
  }

  // Cloud-first autosave with smart queuing and local backup
  private async performAutosave(): Promise<void> {
    const startTime = Date.now();
    const { isAuthenticated, user } = useAuthStore.getState();
    const { isOnline } = useCloudStore.getState();
    const { currentBookId } = useBookStore.getState();
    
    // CRITICAL: Only save if there are meaningful changes to minimize I/O
    if (!this.hasMeaningfulChanges()) {
      logAutosave('No meaningful changes detected, skipping autosave');
      return;
    }
    
    // Track autosave operation
    performanceMonitor.incrementAutosaveOperations();
    performanceMonitor.updateRequestsPerMinute();
    
    this.updateState({ 
      status: 'local-saving', 
      errorMessage: null 
    });

    try {
      logAutosave('Starting autosave cycle');

      // Step 1: Always save to localStorage first (instant backup)
      if (isAuthenticated && user) {
        await this.performLocalSave(user.id, currentBookId);
      }

      // Step 2: Cloud sync for authenticated users
      if (isAuthenticated) {
        this.updateState({ status: 'cloud-syncing' });
        
        if (isOnline) {
          logAutosave('User authenticated and online, syncing to cloud');
          
          // CRITICAL: Ensure project exists on server before syncing
          if (currentBookId && documentMutationService.getCurrentProjectId() !== currentBookId) {
            logAutosave('Setting project ID for sync:', currentBookId);
            documentMutationService.setProjectId(currentBookId);
            
            // Try to load the document to ensure it exists
            if (currentBookId && currentBookId !== 'null') {
              const loadResult = await documentMutationService.loadDocument(currentBookId);
              if (!loadResult.success && loadResult.error === 'Project not found') {
                logAutosave('Project not found, creating...');
                const bookStore = useBookStore.getState();
                const book = bookStore.books[currentBookId];
                if (book) {
                  const created = await documentMutationService.createProject(
                    currentBookId,
                    book.title,
                    book.coverPageSettings
                  );
                  if (created) {
                    logAutosave('Created project for sync');
                  }
                }
              }
            }
          }
          
          // Sync via DocumentMutationService
          const cloudSyncSuccess = await documentMutationService.syncNow();
          
          // Upload pending assets to R2
          if (currentBookId) {
            await this.syncPendingAssets(currentBookId);
          }
          
          if (cloudSyncSuccess) {
            logAutosave('Cloud sync successful');
            this.updateState({
              status: 'saved',
              lastSavedTime: new Date(),
              lastCloudSync: new Date(),
              pendingChanges: false,
              errorMessage: null,
              pendingCloudSyncs: 0,
            });
            // Clear queue only after successful sync
            this.queue = {
              assets: false,
              backgrounds: false,
              worldData: false,
            };
            // Stop periodic autosave when no pending changes
            if (!this.state.pendingChanges) {
              this.stopPeriodicAutosave();
            }
          } else {
            logAutosave('Cloud sync failed, data queued for retry');
            this.updateState({
              status: 'error',
              lastSavedTime: new Date(),
              pendingChanges: true,
              errorMessage: 'Cloud sync failed - data queued for retry',
            });
            // Don't clear queue on failure - keep for retry
          }
        } else {
          logAutosave('User authenticated but offline, local save only');
          this.updateState({
            status: 'saved',
            lastSavedTime: new Date(),
            pendingChanges: true,
            errorMessage: 'Offline - changes queued for sync',
          });
        }
      } else {
        // For guest users: local save only (handled by zustand persist)
        logAutosave('Guest user - local save only');
        this.updateState({
          status: 'saved',
          lastSavedTime: new Date(),
          pendingChanges: false,
          errorMessage: null,
        });
        // Clear queue for guest users
        this.queue = {
          assets: false,
          backgrounds: false,
          worldData: false,
        };
        // Stop periodic autosave when no pending changes
        if (!this.state.pendingChanges) {
          this.stopPeriodicAutosave();
        }
      }

      logAutosave('Autosave completed successfully');

      // Record timing metrics
      const duration = Date.now() - startTime;
      performanceMonitor.recordAutosaveTime(duration);
      logAutosave(`Autosave completed in ${duration}ms`);

      // Reset to idle after showing saved status
      setTimeout(() => {
        if (this.state.status === 'saved') {
          this.updateState({ status: 'idle' });
        }
      }, 2000);

    } catch (error) {
      reportError(error, 'autosaveService.performAutosave', 'Autosave failed');
      
      // Record timing metrics even for failed operations
      const duration = Date.now() - startTime;
      performanceMonitor.recordAutosaveTime(duration);
      logAutosave(`Autosave failed after ${duration}ms`);
      
      this.updateState({
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Autosave failed',
        pendingChanges: true,
      });

      // Reset to idle after error
      setTimeout(() => {
        this.updateState({ status: 'idle' });
      }, 5000);
    }
  }

  // Manual save with shorter interval
  async triggerManualSave(): Promise<boolean> {
    logAutosave('Manual save triggered');
    
    // CRITICAL: Only save if there are meaningful changes to minimize I/O
    if (!this.hasMeaningfulChanges()) {
      logAutosave('No meaningful changes detected, skipping save');
      return true; // Return true since nothing needed saving
    }
    
    // Temporarily use shorter interval for manual save
    const originalInterval = this.AUTOSAVE_INTERVAL;
    if (this.autosaveTimer) {
      clearInterval(this.autosaveTimer);
    }
    
    this.autosaveTimer = window.setInterval(() => {
      this.performPeriodicAutosave();
    }, this.MANUAL_SAVE_INTERVAL);

    // Clear debounce and trigger immediate save
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    
    await this.performAutosave();
    
    // Restore original interval after manual save
    setTimeout(() => {
      if (this.autosaveTimer) {
        clearInterval(this.autosaveTimer);
      }
      this.autosaveTimer = window.setInterval(() => {
        this.performPeriodicAutosave();
      }, originalInterval);
    }, 5000);

    return this.state.status === 'saved';
  }

  private async saveWorldData(userId: string, bookId: string, worldData: any): Promise<void> {
    // DocumentMutationService handles saving via RPC - no direct table writes
    // This method is kept for compatibility but now delegates to DocumentMutationService
    const assetStore = useAssetStore.getState();
    const assets = assetStore.getWorldData();

    // Track all asset changes using state-based tracking (MASTER_PLAN.md)
    const bookAssets = assets.assets || {};
    Object.values(bookAssets).forEach((asset: any) => {
      documentMutationService.markAssetChanged(asset.id, asset);
    });

    // Trigger immediate sync
    await documentMutationService.syncNow();
  }

  private async saveBackgroundData(userId: string, bookId: string, configs: any): Promise<void> {
    // DocumentMutationService handles saving via RPC - no direct table writes
    // Background configs are now stored in world_document via state-based tracking (MASTER_PLAN.md)
    const assetStore = useAssetStore.getState();
    const currentBookId = assetStore.getCurrentBookId();
    if (currentBookId) {
      const bookAssets = assetStore.bookAssets[currentBookId] || {};
      Object.entries(configs).forEach(([assetId, config]: [string, any]) => {
        if (assetId.startsWith('asset:')) {
          const realAssetId = assetId.replace('asset:', '');
          const asset = bookAssets[realAssetId];
          if (asset) {
            const updatedAsset = { ...asset, backgroundConfig: config };
            documentMutationService.markAssetChanged(realAssetId, updatedAsset);
          }
        }
      });
    }

    // Trigger immediate sync
    await documentMutationService.syncNow();
  }

  public startPeriodicAutosave(): void {
    if (this.autosaveTimer) return; // Already running
    this.autosaveTimer = window.setInterval(() => {
      this.performPeriodicAutosave();
    }, this.AUTOSAVE_INTERVAL);
  }

  // Alias for backward compatibility with useAutosave hook
  public startAutosave(): void {
    // NOTE: This is a no-op now - periodic autosave starts automatically when there are pending changes
    logAutosave('startAutosave called - periodic autosave now auto-starts on pending changes');
  }

  private async performPeriodicAutosave(): Promise<void> {
    // Only perform periodic save if there are pending changes
    if (this.state.pendingChanges) {
      await this.performAutosave();
    }
  }

  stopPeriodicAutosave(): void {
    if (this.autosaveTimer) {
      clearInterval(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private updateState(updates: Partial<AutosaveState>): void {
    this.state = { ...this.state, ...updates };
    this.notifySubscribers();
  }

  subscribe(callback: (state: AutosaveState) => void): () => void {
    this.subscribers.add(callback);
    callback(this.state); // Send current state immediately
    return () => this.subscribers.delete(callback);
  }

  private notifySubscribers(): void {
    this.subscribers.forEach(callback => callback(this.state));
  }

  getState(): AutosaveState {
    return { ...this.state };
  }

  // Force save regardless of pending changes
  async forceSave(): Promise<boolean> {
    this.updateState({ pendingChanges: true });
    return await this.triggerManualSave();
  }

  // Check if there are unsaved changes
  hasUnsavedChanges(): boolean {
    return this.state.pendingChanges;
  }

  // Get save status for UI display
  getSaveStatus(): {
    status: 'idle' | 'local-saving' | 'cloud-syncing' | 'saved' | 'error';
    lastSavedTime: Date | null;
    lastLocalSave: Date | null;
    lastCloudSync: Date | null;
    errorMessage: string | null;
    pendingChanges: boolean;
    pendingCloudSyncs: number;
    isOnline: boolean;
    isAuthenticated: boolean;
  } {
    const { isOnline } = useCloudStore.getState();
    const { isAuthenticated } = useAuthStore.getState();
    
    return {
      ...this.state,
      isOnline,
      isAuthenticated,
    };
  }

  isOnline(): boolean {
    return navigator.onLine;
  }

  async checkConnectivity(): Promise<boolean> {
    try {
      const response = await fetch('/api/health', { 
        method: 'HEAD',
        cache: 'no-cache'
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  // Local storage backup (from localAutosaveService)
  private async performLocalSave(userId: string, projectId?: string): Promise<void> {
    try {
      const assetStore = useAssetStore.getState();
      const backgroundStore = useBackgroundStore.getState();
      const bookStore = useBookStore.getState();

      const userData = {
        userId,
        projectId,
        assets: assetStore.bookAssets[projectId || ''] || {},
        backgrounds: backgroundStore.configs,
        worldData: {
          globalCustomFields: assetStore.bookGlobalCustomFields[projectId || ''] || [],
          currentBook: bookStore.currentBookId,
        },
        screenPositions: this.extractScreenPositions(assetStore.bookAssets[projectId || ''] || {}),
        lastLocalSave: new Date().toISOString(),
        lastCloudSync: this.state.lastCloudSync?.toISOString(),
      };

      await this.saveToLocalStorage(userData);
      
      this.updateState({ 
        lastLocalSave: new Date(),
      });

      logAutosave('Local save completed');
    } catch (error) {
      reportError(error, 'autosaveService.performLocalSave', 'Local save failed');
      throw error;
    }
  }

  private async saveToLocalStorage(userData: any): Promise<void> {
    try {
      // Track localStorage write
      performanceMonitor.incrementLocalStorageWrites();
      
      // Check available storage space before writing
      if (!this.hasStorageSpace()) {
        logAutosave('Storage space low, performing cleanup');
        await this.cleanupOldStorageData();
      }
      
      const storageData = localStorage.getItem(this.LOCAL_STORAGE_KEY);
      const allData: Record<string, any> = storageData ? JSON.parse(storageData) : {};
      
      const userKey = `${userData.userId}_${userData.projectId || 'default'}`;
      allData[userKey] = userData;

      // Try to save with quota management
      try {
        localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(allData));
      } catch (quotaError) {
        // If still exceeds quota after cleanup, implement emergency cleanup
        logAutosave('Quota still exceeded after cleanup, performing emergency cleanup');
        await this.emergencyStorageCleanup();
        
        // Retry with minimal data
        const minimalData = this.createMinimalUserData(userData);
        const minimalAllData: Record<string, any> = { [userKey]: minimalData };
        localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(minimalAllData));
        
        logAutosave('Saved with minimal data after emergency cleanup');
      }
    } catch (error) {
      reportError(error, 'autosaveService.saveToLocalStorage', 'LocalStorage write failed');
      // Don't throw - local save failure shouldn't block cloud sync
    }
  }

  // Storage quota management methods
  private hasStorageSpace(): boolean {
    try {
      // Check if we have reasonable space available (keep under 4MB to be safe)
      const storageData = localStorage.getItem(this.LOCAL_STORAGE_KEY);
      const currentSize = storageData ? new Blob([storageData]).size : 0;
      const maxSize = 4 * 1024 * 1024; // 4MB limit
      
      // Consider storage full if using more than 80% of max size
      return currentSize < (maxSize * 0.8);
    } catch {
      return false;
    }
  }

  private async cleanupOldStorageData(): Promise<void> {
    try {
      const storageData = localStorage.getItem(this.LOCAL_STORAGE_KEY);
      if (!storageData) return;

      const allData: Record<string, any> = JSON.parse(storageData);
      const entries = Object.entries(allData);
      
      // Sort by last save time, oldest first
      entries.sort(([, a], [, b]) => {
        const timeA = new Date(a.lastLocalSave || 0).getTime();
        const timeB = new Date(b.lastLocalSave || 0).getTime();
        return timeA - timeB;
      });

      // Keep only the most recent 10 entries
      const keepCount = 10;
      const recentEntries = entries.slice(-keepCount);
      const cleanedData: Record<string, any> = {};
      
      recentEntries.forEach(([key, value]) => {
        cleanedData[key] = value;
      });

      localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(cleanedData));
      logAutosave(`Cleaned storage: kept ${keepCount} most recent entries`);
    } catch (error) {
      reportError(error, 'autosaveService.cleanupOldStorageData', 'Storage cleanup failed');
    }
  }

  private async emergencyStorageCleanup(): Promise<void> {
    try {
      const storageData = localStorage.getItem(this.LOCAL_STORAGE_KEY);
      if (!storageData) return;

      const allData: Record<string, any> = JSON.parse(storageData);
      const entries = Object.entries(allData);
      
      // Keep only the most recent 3 entries in emergency
      const keepCount = 3;
      
      // Sort by last save time, newest first
      entries.sort(([, a], [, b]) => {
        const timeA = new Date(a.lastLocalSave || 0).getTime();
        const timeB = new Date(b.lastLocalSave || 0).getTime();
        return timeB - timeA;
      });

      const recentEntries = entries.slice(0, keepCount);
      const cleanedData: Record<string, any> = {};
      
      recentEntries.forEach(([key, value]) => {
        cleanedData[key] = value;
      });

      localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(cleanedData));
      logAutosave(`Emergency cleanup: kept only ${keepCount} most recent entries`);
    } catch (error) {
      reportError(error, 'autosaveService.emergencyStorageCleanup', 'Emergency cleanup failed');
      // If even emergency cleanup fails, clear everything except current user
      try {
        localStorage.removeItem(this.LOCAL_STORAGE_KEY);
        logAutosave('Cleared all storage due to quota error');
      } catch (clearError) {
        reportError(clearError, 'autosaveService.emergencyStorageCleanup', 'Failed to clear storage');
      }
    }
  }

  private createMinimalUserData(userData: any): any {
    // Create minimal version of user data with only essential info
    return {
      userId: userData.userId,
      projectId: userData.projectId,
      assets: userData.assets ? Object.fromEntries(
        Object.entries(userData.assets).slice(0, 5) // Keep only 5 most recent assets
      ) : {},
      backgrounds: userData.backgrounds ? Object.fromEntries(
        Object.entries(userData.backgrounds).slice(0, 3) // Keep only 3 background configs
      ) : {},
      worldData: {
        currentBook: userData.worldData?.currentBook,
        // Skip global custom fields to save space
      },
      lastLocalSave: new Date().toISOString(),
      lastCloudSync: userData.lastCloudSync,
      // Skip screen positions to save space
    };
  }

  // Load user data from localStorage on startup
  async loadUserData(userId: string, projectId?: string): Promise<any | null> {
    try {
      // Track localStorage read
      performanceMonitor.incrementLocalStorageReads();
      
      const storageData = localStorage.getItem(this.LOCAL_STORAGE_KEY);
      if (!storageData) return null;

      const allData: Record<string, any> = JSON.parse(storageData);
      const userKey = `${userId}_${projectId || 'default'}`;
      
      return allData[userKey] || null;
    } catch (error) {
      reportError(error, 'autosaveService.loadUserData', 'Failed to load user data');
      return null;
    }
  }

  // R2 asset sync (from hybridAutosaveService)
  private async syncPendingAssets(projectId: string): Promise<void> {
    const assetStore = useAssetStore.getState();
    const pendingUploads = this.getPendingUploads(assetStore.bookAssets[projectId] || {});
    
    if (pendingUploads.length > 0) {
      logAutosave(`Syncing ${pendingUploads.length} assets to R2`);
      this.updateState({ pendingCloudSyncs: pendingUploads.length });
      
      for (const assetId of pendingUploads) {
        const asset = assetStore.bookAssets[projectId]?.[assetId];
        if (asset.file && asset.cloudStatus !== 'synced') {
          try {
            await this.uploadAssetToCloud(asset, projectId);
          } catch (error) {
            reportError(error, 'autosaveService.syncPendingAssets', `Failed to upload asset ${assetId}`);
          }
        }
      }
    }
  }

  private async uploadAssetToCloud(asset: any, projectId: string): Promise<void> {
    if (!asset.file) return;

    try {
      const result = await unifiedUploadService.uploadWithVariants(
        asset.file,
        {
          assetId: asset.id,
          projectId,
          generateVariants: true,
          generateThumbnail: true,
          generatePreview: true,
          onProgress: (progress) => {
            logAutosave(`Asset ${asset.id}: ${progress.percentage}%`);
          }
        }
      );
      
      if (result.success) {
        const assetStore = useAssetStore.getState();
        assetStore.updateAsset(asset.id, {
          cloudStatus: 'synced',
          cloudPath: result.r2Key,
          cloudSize: asset.file.size,
          cloudUpdatedAt: new Date().toISOString(),
          cloudError: undefined
        });
        
        logAutosave(`Asset ${asset.id} uploaded to cloud: ${result.r2Key}`);
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    } catch (error) {
      reportError(error, 'autosaveService.uploadAssetToCloud', `Asset upload failed: ${error.message}`);
      throw error;
    }
  }

  private getPendingUploads(assets: Record<string, any>): string[] {
    return Object.values(assets)
      .filter(asset => asset.file && asset.cloudStatus !== 'synced')
      .map(asset => asset.id);
  }

  private extractScreenPositions(assets: Record<string, any>): Record<string, { x: number; y: number; width: number; height: number }> {
    const positions: Record<string, { x: number; y: number; width: number; height: number }> = {};
    
    Object.values(assets).forEach((asset: any) => {
      positions[asset.id] = {
        x: asset.x || 0,
        y: asset.y || 0,
        width: asset.width || 200,
        height: asset.height || 150,
      };
    });
    
    return positions;
  }

  // Data restoration functionality (from useHybridAutosave)
  private validateRestoredData = (savedData: any): { isValid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    if (!savedData || typeof savedData !== 'object') {
      errors.push('Invalid saved data format');
      return { isValid: false, errors };
    }
    
    // Validate assets if present
    if (savedData.assets) {
      if (typeof savedData.assets !== 'object') {
        errors.push('Assets must be an object');
      } else {
        Object.entries(savedData.assets).forEach(([id, asset]) => {
          if (!asset || typeof asset !== 'object') {
            errors.push(`Invalid asset format for ${id}`);
          } else {
            const assetObj = asset as any;
            if (!assetObj.id || !assetObj.name || !assetObj.type) {
              errors.push(`Asset ${id} missing required fields`);
            }
          }
        });
      }
    }
    
    // Validate global custom fields if present
    if (savedData.worldData?.globalCustomFields) {
      if (!Array.isArray(savedData.worldData.globalCustomFields)) {
        errors.push('Global custom fields must be an array');
      } else {
        savedData.worldData.globalCustomFields.forEach((field: any, index: number) => {
          if (!field || typeof field !== 'object') {
            errors.push(`Invalid global custom field format at index ${index}`);
          } else if (!field.id || !field.label || !field.type) {
            errors.push(`Global custom field at index ${index} missing required fields`);
          }
        });
      }
    }
    
    return { isValid: errors.length === 0, errors };
  };

  private checkVersionCompatibility = (savedData: any): boolean => {
    const currentVersion = '3.9.7'; // Get from package.json or app version
    const savedVersion = savedData.version || 'unknown';
    
    // For now, assume compatibility - can be enhanced later
    logAutosave(`Version check: saved=${savedVersion}, current=${currentVersion}`);
    return true;
  };

  private attemptPartialRestoration = (savedData: any, errors: string[]): void => {
    logAutosave('Data validation failed, attempting partial restoration:', errors);
    
    const assetStore = useAssetStore.getState();
    const backgroundStore = useBackgroundStore.getState();
    const bookStore = useBookStore.getState();
    
    try {
      // Attempt to restore valid assets
      if (savedData.assets && typeof savedData.assets === 'object') {
        const validAssets: Record<string, any> = {};
        Object.entries(savedData.assets).forEach(([id, asset]) => {
          if (asset && typeof asset === 'object') {
            const assetObj = asset as any;
            if (assetObj.id && assetObj.name && assetObj.type) {
              validAssets[id] = asset;
            }
          }
        });
        
        if (Object.keys(validAssets).length > 0) {
          logAutosave(`Partially restoring ${Object.keys(validAssets).length} valid assets`);
          assetStore.restoreAssets(validAssets);
        }
      }
      
      // Attempt to restore valid global custom fields
      if (savedData.worldData?.globalCustomFields && Array.isArray(savedData.worldData.globalCustomFields)) {
        const validFields = savedData.worldData.globalCustomFields.filter((field: any) => 
          field && typeof field === 'object' && field.id && field.label && field.type
        );
        
        if (validFields.length > 0) {
          logAutosave(`Partially restoring ${validFields.length} valid global custom fields`);
          assetStore.restoreGlobalCustomFields(validFields);
        }
      }
      
      // Restore backgrounds (they're simpler and less prone to corruption)
      if (savedData.backgrounds && typeof savedData.backgrounds === 'object') {
        logAutosave('Restoring backgrounds');
        Object.entries(savedData.backgrounds).forEach(([key, config]) => {
          backgroundStore.setBackground(key, config as any);
        });
      }
      
      // Restore current book
      if (savedData.worldData?.currentBook) {
        logAutosave('Setting current book:', savedData.worldData.currentBook);
        bookStore.setCurrentBook(savedData.worldData.currentBook);
      }
      
      logAutosave('Partial restoration completed');
    } catch (error) {
      reportError(error, 'autosaveService.attemptPartialRestoration', 'Partial restoration failed');
    }
  };

  private detectConflicts = (savedData: any, currentData: any): any[] => {
    const conflicts: any[] = [];
    
    // Check for asset conflicts
    if (savedData.assets && currentData.assets) {
      Object.keys(savedData.assets).forEach(assetId => {
        if (currentData.assets[assetId]) {
          const savedAsset = savedData.assets[assetId];
          const currentAsset = currentData.assets[assetId];
          
          // Simple conflict detection based on timestamps
          if (savedAsset.updatedAt && currentAsset.updatedAt) {
            const savedTime = new Date(savedAsset.updatedAt);
            const currentTime = new Date(currentAsset.updatedAt);
            
            if (currentTime > savedTime) {
              conflicts.push({
                type: 'asset',
                id: assetId,
                localData: currentAsset,
                remoteData: savedAsset,
                resolution: 'local-wins' // Default strategy
              });
            }
          }
        }
      });
    }
    
    return conflicts;
  };

  // Public restoration methods
  async restoreUserData(userId: string, projectId?: string): Promise<boolean> {
    try {
      const savedData = await this.loadUserData(userId, projectId);
      if (!savedData) {
        logAutosave('No saved data found for restoration');
        return false;
      }

      logAutosave('Restoring saved data:', savedData);
      
      // Check version compatibility
      if (!this.checkVersionCompatibility(savedData)) {
        logAutosave('Version compatibility check failed, proceeding anyway');
      }
      
      // Validate data first
      const validation = this.validateRestoredData(savedData);
      if (!validation.isValid) {
        logAutosave('Data validation failed:', validation.errors);
        // Attempt partial restoration with valid data
        this.attemptPartialRestoration(savedData, validation.errors);
        return false;
      }
      
      // Check for conflicts with current data
      const assetStore = useAssetStore.getState();
      const currentData = {
        assets: assetStore.getCurrentBookAssets(),
      };
      
      const conflicts = this.detectConflicts(savedData, currentData);
      if (conflicts.length > 0) {
        logAutosave(`Detected ${conflicts.length} conflicts, using server-wins strategy`);
        // For now, proceed with restoration (server-wins strategy)
        // TODO: Add user notification for conflicts
      }
      
      // Proceed with full restoration
      await this.performFullRestoration(savedData);
      return true;
    } catch (error) {
      reportError(error, 'autosaveService.restoreUserData', 'Critical restoration failure');
      return false;
    }
  }

  private async performFullRestoration(savedData: any): Promise<void> {
    try {
      const assetStore = useAssetStore.getState();
      const backgroundStore = useBackgroundStore.getState();
      const bookStore = useBookStore.getState();

      // Step 1: Restore assets
      if (savedData.assets && Object.keys(savedData.assets).length > 0) {
        logAutosave('Restoring assets:', Object.keys(savedData.assets).length);
        try {
          assetStore.restoreAssets(savedData.assets);
          logAutosave('Assets restored successfully');
        } catch (error) {
          reportError(error, 'autosaveService.performFullRestoration', 'Failed to restore assets');
          // Continue with other restoration to prevent complete failure
        }
      }

      // Step 2: Restore backgrounds
      if (savedData.backgrounds && Object.keys(savedData.backgrounds).length > 0) {
        logAutosave('Restoring backgrounds');
        Object.entries(savedData.backgrounds).forEach(([key, config]) => {
          // Type assertion to ensure config matches BackgroundConfig interface
          backgroundStore.setBackground(key, config as any);
        });
      }

      // Step 3: Restore world data
      if (savedData.worldData) {
        logAutosave('Restoring world data');
        
        // Restore current book if different
        if (savedData.worldData.currentBook && savedData.worldData.currentBook !== bookStore.currentBookId) {
          logAutosave('Setting current book:', savedData.worldData.currentBook);
          bookStore.setCurrentBook(savedData.worldData.currentBook);
        }

        // Restore global custom fields if available
        if (savedData.worldData.globalCustomFields && Array.isArray(savedData.worldData.globalCustomFields)) {
          logAutosave('Restoring global custom fields:', savedData.worldData.globalCustomFields.length);
          try {
            assetStore.restoreGlobalCustomFields(savedData.worldData.globalCustomFields);
            logAutosave('Global custom fields restored successfully');
          } catch (error) {
            reportError(error, 'autosaveService.performFullRestoration', 'Failed to restore global custom fields');
            // Continue with other restoration to prevent complete failure
          }
        }
      }

      // Step 4: Restore screen positions
      if (savedData.screenPositions && Object.keys(savedData.screenPositions).length > 0) {
        logAutosave('Restoring screen positions');
        Object.entries(savedData.screenPositions).forEach(([assetId, position]: [string, any]) => {
          const asset = assetStore.getAssetById(assetId);
          if (asset) {
            assetStore.updateAssetPosition(assetId, position.x, position.y);
            if (position.width && position.height) {
              assetStore.updateAssetSize(assetId, position.width, position.height);
            }
          }
        });
      }

      logAutosave('Data restoration completed successfully');
    } catch (error) {
      reportError(error, 'autosaveService.performFullRestoration', 'Failed to restore saved data');
      throw error;
    }
  }
}

export const autosaveService = AutosaveService.getInstance();
