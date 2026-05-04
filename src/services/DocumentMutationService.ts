import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useCloudStore } from '@/stores/cloudStore';
import { useBookStore } from '@/stores/bookStoreSimple';
import { connectivityService } from '@/services/connectivityService';
import { performanceMonitor } from '@/utils/performanceMonitor';
import { TextStorageOptimizer } from '@/utils/textStorageOptimizer';
import { ConflictResolver, type Conflict, type ConflictResolution, type ConflictStrategy } from './ConflictResolver';
import type { Asset } from '@/components/AssetItem';
import type { BackgroundConfig } from '@/types/background';
import { compressBase64Thumbnail, isThumbnailTooLarge } from '@/utils/thumbnailCompression';
import { logDocument, reportError } from '@/utils/logger';
import { withApiRateLimit } from '@/services/rateLimitMiddleware';

// Document operation types
export type DocumentOperation =
  | { op: 'CREATE_ASSET'; assetId: string; parentId?: string; name: string; type: string; position?: AssetPosition; children?: string[]; isExpanded?: boolean; customFields?: Record<string, any> }
  | { op: 'DELETE_ASSET'; assetId: string; parentId?: string }
  | { op: 'MOVE_ASSET'; assetId: string; oldParentId?: string; newParentId?: string }
  | { op: 'UPDATE_POSITION'; assetId: string; x: number; y: number; width: number; height: number; zIndex: number }
  | { op: 'UPDATE_METADATA'; assetId: string; name: string }
  | { op: 'UPDATE_VIEWPORT'; offsetX: number; offsetY: number; scale: number; currentAssetId?: string }
  | { op: 'UPDATE_BACKGROUND_CONFIG'; assetId: string; config: Record<string, any> }
  | { op: 'UPDATE_GLOBAL_BACKGROUNDS'; backgrounds: Record<string, Record<string, any>> }
  | { op: 'UPDATE_ASSET_BACKGROUND'; assetId: string; config: Record<string, any> }
  | { op: 'UPDATE_CUSTOM_FIELDS'; assetId: string; customFields: Record<string, any> }
  | { op: 'UPDATE_GLOBAL_TAGS'; tags: Record<string, any>; assetTags: Record<string, string[]> }
  | { op: 'UPDATE_ASSET_TAGS'; assetId: string; tagIds: string[] };

interface AssetPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

export interface SyncStatus {
  lastSyncTime: Date | null;
  syncEnabled: boolean;
  pendingChanges: boolean;
  onlineMode: boolean;
  quotaExceeded: boolean;
  storageUsed: number;
  storageLimit: number;
  syncInProgress: boolean;
  queuedItems: number;
  documentVersion: number;
}

interface PendingOperation {
  id: string;
  operation: DocumentOperation;
  retryCount: number;
  lastRetryTime: number;
}

const MAX_BATCH_SIZE = 100;
const MAX_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 1000; // 1 second base delay for exponential backoff

// Cloud sync retry configuration
const CLOUD_RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 5000,      // 5 seconds base delay
  maxDelayMs: 300000,     // 5 minutes max delay
  checkIntervalMs: 60000, // Check every minute
  backoffMultiplier: 2      // Exponential backoff multiplier
};

class DocumentMutationService {
  private static instance: DocumentMutationService;
  private subscribers: Set<(status: SyncStatus) => void> = new Set();
  private currentVersion: number = 1;
  private currentProjectId: string | null = null;
  private syncInProgress: boolean = false;
  private syncStartTime: number = 0;
  private syncTimeoutMs: number = 30000; // 30 second timeout for sync operations
  private conflictResolver: ConflictResolver;
  private lastServerDocument: any = null;
  private conflictHistory: ConflictResolution[] = [];

  // NOTE: Following MASTER_PLAN.md - state-based tracking (NO operation queue)
  private changedAssets: Record<string, Asset> = {};
  private changedPositions: Record<string, { x: number; y: number; z_index: number }> = {};
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private positionSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private isPositionSaveScheduled: boolean = false;
  private readonly AUTO_SAVE_MS = 40000; // 40 seconds
  private readonly MAX_BATCH_SIZE = 500; // Soft cap - flush if exceeded
  private readonly POSITION_SAVE_THROTTLE = 2000; // 2 seconds minimum (CRITICAL)

  // Cloud sync retry tracking (Phase 10)
  private cloudRetryCounts: Map<string, { count: number; lastRetry: number }> = new Map();
  private cloudRetryInterval: number | null = null;
  private isCloudRetryRunning: boolean = false;
  private onlineHandler: (() => void) | null = null;

  // RAM caching to reduce Supabase reads
  private documentCache: Map<string, { data: any; timestamp: number; version: number }> = new Map();
  private backgroundsCache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_TTL_MS = 60000; // 1 minute cache TTL

  // Compatibility layer fields
  private beforeUnloadHandler: ((e: BeforeUnloadEvent) => void) | null = null;
  private onSaveError: ((error: Error) => void) | null = null;

  private constructor() {
    // Initialize with server-wins strategy for MVP
    // Future: Make this configurable per-project or per-user
    this.conflictResolver = new ConflictResolver({
      strategy: 'server-wins',
      maxRetries: 3
    });

    // Listen for online/offline events to trigger sync
    const handleOnline = () => {
      logDocument('Connection restored, triggering sync');
      this.syncNow();
      // NOTE: Cloud retry polling NOT started automatically to prevent idle DB requests
      // It will be started only when there are failed uploads to retry
    };
    window.addEventListener('online', handleOnline);

    // Store handler reference for cleanup
    this.onlineHandler = handleOnline;

    // Cleanup on page unload to prevent memory leak
    window.addEventListener('beforeunload', () => {
      if (this.onlineHandler) {
        window.removeEventListener('online', this.onlineHandler);
      }
    });

    // NOTE: Cloud retry polling NOT started automatically to prevent Supabase quota flood
    // Call startCloudRetryPolling() explicitly when needed
  }

  static getInstance(): DocumentMutationService {
    if (!DocumentMutationService.instance) {
      DocumentMutationService.instance = new DocumentMutationService();
    }
    return DocumentMutationService.instance;
  }

  /**
   * Set conflict resolution strategy
   */
  setConflictStrategy(strategy: ConflictStrategy): void {
    this.conflictResolver.setOptions({ strategy });
    logDocument(`Conflict strategy set to: ${strategy}`);
  }

  /**
   * Get current conflict resolution strategy
   */
  getConflictStrategy(): ConflictStrategy {
    return this.conflictResolver.getStrategy();
  }

  /**
   * Get conflict history for debugging/monitoring
   */
  getConflictHistory(): ConflictResolution[] {
    return [...this.conflictHistory];
  }

  /**
   * Clear conflict history
   */
  clearConflictHistory(): void {
    this.conflictHistory = [];
  }

  /**
   * Load document from Supabase with caching
   * NOTE: Following MASTER_PLAN.md - use load_project + load_assets instead of load_project_document
   * Reconstruct tree client-side using parent_id (NO giant JSON documents)
   */
  async loadDocument(projectId: string): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      // Check cache first
      const cached = this.documentCache.get(projectId);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
        logDocument('Cache hit for document:', projectId);
        return { success: true, data: cached.data };
      }

      performanceMonitor.incrementDatabaseRequests();

      // Load project metadata (MASTER_PLAN.md Rule 1)
      const { data: projectData, error: projectError } = await supabase
        .rpc('load_project', {
          p_project_id: projectId
        });

      if (projectError || !projectData || projectData.length === 0) {
        reportError(projectError || new Error('No project data found'), 'DocumentMutation.loadDocument', 'Failed to load project');
        return { success: false, error: String(projectError) };
      }

      const project = projectData[0];
      const assetCount = project.asset_count || 0;

      // Load flat asset rows (MASTER_PLAN.md Rule 2)
      const { data: assetsData, error: assetsError } = await supabase
        .rpc('load_assets', {
          p_project_id: projectId,
          p_parent_id: null,
          p_load_all: assetCount < 100 // Load all if small project
        });

      if (assetsError) {
        reportError(assetsError, 'DocumentMutation.loadDocument', 'Failed to load assets');
        return { success: false, error: String(assetsError) };
      }

      // Build result matching expected structure
      // Restore compressed text fields from storage
      const restoredAssetsData = TextStorageOptimizer.restoreAssetsFromStorage(assetsData || []);
      
      const result = {
        world_document: {
          assets: restoredAssetsData,
          backgrounds: project.backgrounds || {},
          tags: project.tags_config || {}
        },
        version: project.last_version || 0,
        cover_config: {
          coverImage: project.cover_image,
          color: project.color,
          gradient: project.gradient,
          leatherColor: project.leather_color,
          isLeatherMode: project.is_leather_mode,
          coverPageSettings: project.cover_page_settings
        },
        updated_at: project.updated_at
      };

      // Cache the result
      this.documentCache.set(projectId, {
        data: result,
        timestamp: Date.now(),
        version: result.version
      });

      this.currentProjectId = projectId;
      this.currentVersion = result.version;

      return { success: true, data: result };
    } catch (error) {
      reportError(error, 'DocumentMutation.loadDocument', 'Failed to load document');
      return { success: false, error: String(error) };
    }
  }

  /**
   * Create a new project on the server if it doesn't exist
   * This is needed for new books created locally that need to be synced
   */
  async createProject(projectId: string, projectName: string, coverConfig?: any): Promise<boolean> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        reportError(new Error('Not authenticated'), 'DocumentMutation.createProject', 'Cannot create project - not authenticated');
        return false;
      }

      // First try to load the project to see if it exists
      const loadResult = await this.loadDocument(projectId);
      if (loadResult.success && loadResult.data) {
        logDocument('Project already exists:', projectId);
        return true;
      }

      // Create new project using RPC (bypasses RLS)
      logDocument('Creating project via RPC:', projectId);
      const { data, error } = await supabase
        .rpc('create_project', {
          p_name: projectName,
          p_project_id: projectId
        });

      if (error) {
        reportError(error, 'DocumentMutation.createProject', 'Failed to create project via RPC');
        return false;
      }

      logDocument('Created new project:', data);
      this.currentProjectId = projectId;
      this.currentVersion = 1;
      return true;
    } catch (error) {
      reportError(error, 'DocumentMutation.createProject', 'Error creating project');
      return false;
    }
  }

  /**
   * Set project ID directly (for cases where we know the project exists or was just created)
   */
  setProjectId(projectId: string): void {
    this.currentProjectId = projectId;
  }

  /**
   * Get current project ID - used to check if a project is loaded before operations
   */
  getCurrentProjectId(): string | null {
    return this.currentProjectId;
  }

  // NOTE: Following MASTER_PLAN.md - state-based tracking (NO operation queue)
  // Mark asset as changed (metadata)
  markAssetChanged(assetId: string, asset: Asset): void {
    // Migrate 'other' type to 'card' for database compatibility
    const migratedAsset = asset.type === 'other' ? { ...asset, type: 'card' as const } : asset;
    this.changedAssets[assetId] = migratedAsset;
    
    // CRITICAL FIX: Trigger auto-save for asset changes (like position changes do)
    if (!this.autoSaveTimer) {
      this.autoSaveTimer = setTimeout(async () => {
        try {
          await this.saveMetadataChanges();
        } finally {
          this.autoSaveTimer = null;
        }
      }, this.AUTO_SAVE_MS);
    }
    
    this.notifySubscribers();
  }

  // Mark position changes (for hot updates) - TRUE THROTTLE (not debounce)
  markPositionChanged(assetId: string, x: number, y: number, z_index: number = 0): void {
    this.changedPositions[assetId] = { x, y, z_index };

    if (!this.isPositionSaveScheduled) {
      this.isPositionSaveScheduled = true;
      this.positionSaveTimer = setTimeout(async () => {
        try {
          await this.savePositionChanges();
        } finally {
          this.isPositionSaveScheduled = false;
          this.positionSaveTimer = null;
        }
      }, this.POSITION_SAVE_THROTTLE);
    }

    this.notifySubscribers();
  }

  // Clear the change buffers
  clearChanges(): void {
    this.changedAssets = {};
    this.changedPositions = {};
  }

  // Mark asset as deleted (soft delete with deleted_at)
  markAssetDeleted(assetId: string): void {
    this.changedAssets[assetId] = {
      id: assetId,
      parentId: null,
      name: '',
      type: '',
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      zIndex: 0,
      isExpanded: false,
      deleted_at: new Date().toISOString()
    } as any;
    this.notifySubscribers();
  }

  // Handle global project operations (backgrounds, viewport, tags) directly
  // NOTE: Following MASTER_PLAN.md - global operations use save_project RPC directly
  async saveGlobalBackgrounds(backgrounds: Record<string, any>): Promise<boolean> {
    if (!this.currentProjectId) return false;

    // Check if the current book still exists locally (might have been deleted)
    const bookStore = useBookStore.getState();
    if (!bookStore.books[this.currentProjectId]) {
      logDocument('Project no longer exists locally, skipping save');
      this.currentProjectId = null;
      return false;
    }

    try {
      performanceMonitor.incrementDatabaseRequests();
      logDocument('saveGlobalBackgrounds - Sending to RPC:', {
        p_project_id: this.currentProjectId,
        p_backgrounds: backgrounds
      });
      const { error } = await supabase.rpc('save_project', {
        p_project_id: this.currentProjectId,
        p_backgrounds: backgrounds
      });

      if (error) {
        reportError(error, 'DocumentMutation.saveGlobalBackgrounds', 'Failed to save global backgrounds');
        logDocument('Error details:', JSON.stringify(error, null, 2));

        // Invalidate cache on any error
        this.documentCache.delete(this.currentProjectId);
        this.backgroundsCache.delete(this.currentProjectId);

        // If error is "Unauthorized", the project may have been deleted - don't retry
        if (error.message?.includes('Unauthorized')) {
          logDocument('Project may have been deleted, clearing currentProjectId');
          this.currentProjectId = null;
          return false;
        }

        // If version conflict, reload and retry
        if (error.message?.includes('Version conflict')) {
          logDocument('Version conflict detected, reloading document...');
          const loadResult = await this.loadDocument(this.currentProjectId);
          if (loadResult.success && loadResult.data) {
            this.currentVersion = loadResult.data.version;
            logDocument('Reloaded version:', this.currentVersion);

            // Retry with correct version
            logDocument('Retrying saveGlobalBackgrounds with correct version');
            const { error: retryError } = await supabase.rpc('save_project', {
              p_project_id: this.currentProjectId,
              p_backgrounds: backgrounds
            });
            if (retryError) {
              reportError(retryError, 'DocumentMutation.saveGlobalBackgrounds', 'Retry failed');
              return false;
            }
            this.currentVersion += 1;
            return true;
          }
        }
        return false;
      }

      this.currentVersion += 1;
      this.documentCache.delete(this.currentProjectId);
      this.backgroundsCache.delete(this.currentProjectId);

      return true;
    } catch (error) {
      reportError(error, 'DocumentMutation.saveGlobalBackgrounds', 'Error saving global backgrounds');
      return false;
    }
  }

  async saveViewport(offsetX: number, offsetY: number, scale: number): Promise<boolean> {
    if (!this.currentProjectId) return false;

    // Check if the current book still exists locally (might have been deleted)
    const bookStore = useBookStore.getState();
    if (!bookStore.books[this.currentProjectId]) {
      logDocument('Project no longer exists locally, skipping save');
      this.currentProjectId = null;
      return false;
    }

    const authStore = useAuthStore.getState();
    const userId = authStore.user?.id;
    
    if (!userId) {
      logDocument('No user ID available for rate limiting');
      return false;
    }

    try {
      return await withApiRateLimit(userId, async () => {
        performanceMonitor.incrementDatabaseRequests();
        const { error } = await supabase.rpc('save_project', {
          p_project_id: this.currentProjectId,
          p_viewport: { offsetX, offsetY, scale }
        });

        if (error) {
          reportError(error, 'DocumentMutation.saveViewport', 'Failed to save viewport');
          this.documentCache.delete(this.currentProjectId);
          this.backgroundsCache.delete(this.currentProjectId);

          // If error is "Unauthorized", the project may have been deleted - don't retry
          if (error.message?.includes('Unauthorized')) {
            logDocument('Project may have been deleted, clearing currentProjectId');
            this.currentProjectId = null;
            return false;
          }

          // If version conflict, reload and retry
          if (error.message?.includes('Version conflict')) {
            logDocument('Version conflict detected, reloading document...');
            const loadResult = await this.loadDocument(this.currentProjectId);
            if (loadResult.success && loadResult.data) {
              this.currentVersion = loadResult.data.version;
              logDocument('Reloaded version:', this.currentVersion);

              // Retry with correct version
              const { error: retryError } = await supabase.rpc('save_project', {
                p_project_id: this.currentProjectId,
                p_viewport: { offsetX, offsetY, scale }
              });
              if (retryError) {
                reportError(retryError, 'DocumentMutation.saveViewport', 'Retry failed');
                return false;
              }
              this.currentVersion += 1;
              return true;
            }
          }
          return false;
        }

        this.currentVersion += 1;
        this.documentCache.delete(this.currentProjectId);
        this.backgroundsCache.delete(this.currentProjectId);

        return true;
      });
    } catch (error) {
      // Check if this is a rate limit error
      if ((error as any).rateLimitExceeded) {
        logDocument('Rate limit exceeded for saveViewport:', (error as any).message);
        return false;
      }
      
      reportError(error, 'DocumentMutation.saveViewport', 'Error saving viewport');
      return false;
    }
  }

  async saveGlobalTags(tags: Record<string, any>): Promise<boolean> {
    if (!this.currentProjectId) return false;

    // Check if the current book still exists locally (might have been deleted)
    const bookStore = useBookStore.getState();
    if (!bookStore.books[this.currentProjectId]) {
      logDocument('Project no longer exists locally, skipping save');
      this.currentProjectId = null;
      return false;
    }

    const authStore = useAuthStore.getState();
    const userId = authStore.user?.id;
    
    if (!userId) {
      logDocument('No user ID available for rate limiting');
      return false;
    }

    try {
      return await withApiRateLimit(userId, async () => {
        performanceMonitor.incrementDatabaseRequests();
        const { error } = await supabase.rpc('save_project', {
          p_project_id: this.currentProjectId,
          p_tags_config: tags
        });

        if (error) {
          reportError(error, 'DocumentMutation.saveGlobalTags', 'Failed to save global tags');

          // Invalidate cache on any error
          this.documentCache.delete(this.currentProjectId);
          this.backgroundsCache.delete(this.currentProjectId);

          // If error is "Unauthorized", the project may have been deleted - don't retry
          if (error.message?.includes('Unauthorized')) {
            logDocument('Project may have been deleted, clearing currentProjectId');
            this.currentProjectId = null;
            return false;
          }

          // If version conflict, reload and retry
          if (error.message?.includes('Version conflict')) {
            logDocument('Version conflict detected, reloading document...');
            const loadResult = await this.loadDocument(this.currentProjectId);
            if (loadResult.success && loadResult.data) {
              this.currentVersion = loadResult.data.version;
              logDocument('Reloaded version:', this.currentVersion);

              // Retry with correct version
              const { error: retryError } = await supabase.rpc('save_project', {
                p_project_id: this.currentProjectId,
                p_tags_config: tags
              });
              if (retryError) {
                reportError(retryError, 'DocumentMutation.saveGlobalTags', 'Retry failed');
                return false;
              }
              this.currentVersion += 1;
              return true;
            }
          }
          return false;
        }

        this.currentVersion += 1;
        this.documentCache.delete(this.currentProjectId);
        this.backgroundsCache.delete(this.currentProjectId);

        return true;
      });
    } catch (error) {
      // Check if this is a rate limit error
      if ((error as any).rateLimitExceeded) {
        logDocument('Rate limit exceeded for saveGlobalTags:', (error as any).message);
        return false;
      }
      
      reportError(error, 'DocumentMutation.saveGlobalTags', 'Error saving global tags');
      return false;
    }
  }

  // Save cover metadata (cover image, color, gradient, leather mode, etc.)
  // Phase 2 Fix: Dedicated method for cover metadata with batching
  async saveCoverMetadata(coverConfig: {
    coverImage?: string;
    color?: string;
    gradient?: string;
    leatherColor?: string;
    isLeatherMode?: boolean;
    coverPageSettings?: any;
    coverPresetId?: string;
  }): Promise<boolean> {
    if (!this.currentProjectId) return false;

    // Check if the current book still exists locally (might have been deleted)
    const bookStore = useBookStore.getState();
    if (!bookStore.books[this.currentProjectId]) {
      logDocument('Project no longer exists locally, skipping save');
      this.currentProjectId = null;
      return false;
    }

    try {
      performanceMonitor.incrementDatabaseRequests();
      logDocument('saveCoverMetadata - Sending to RPC:', {
        p_project_id: this.currentProjectId,
        p_cover_config: coverConfig
      });

      const { error } = await supabase.rpc('save_project', {
        p_project_id: this.currentProjectId,
        p_cover_image: coverConfig.coverImage,
        p_color: coverConfig.color,
        p_gradient: coverConfig.gradient,
        p_leather_color: coverConfig.leatherColor,
        p_is_leather_mode: coverConfig.isLeatherMode,
        p_cover_page_settings: coverConfig.coverPageSettings
      });

      if (error) {
        reportError(error, 'DocumentMutation.saveCoverMetadata', 'Failed to save cover metadata');
        logDocument('Error details:', JSON.stringify(error, null, 2));

        // Invalidate cache on any error
        this.documentCache.delete(this.currentProjectId);
        this.backgroundsCache.delete(this.currentProjectId);

        // If error is "Unauthorized", the project may have been deleted - don't retry
        if (error.message?.includes('Unauthorized')) {
          logDocument('Project may have been deleted, clearing currentProjectId');
          this.currentProjectId = null;
          return false;
        }

        // If version conflict, reload and retry
        if (error.message?.includes('Version conflict')) {
          logDocument('Version conflict detected, reloading document...');
          const loadResult = await this.loadDocument(this.currentProjectId);
          if (loadResult.success && loadResult.data) {
            this.currentVersion = loadResult.data.version;
            logDocument('Reloaded version:', this.currentVersion);

            // Retry with correct version
            logDocument('Retrying saveCoverMetadata with correct version');
            const { error: retryError } = await supabase.rpc('save_project', {
              p_project_id: this.currentProjectId,
              p_cover_image: coverConfig.coverImage,
              p_color: coverConfig.color,
              p_gradient: coverConfig.gradient,
              p_leather_color: coverConfig.leatherColor,
              p_is_leather_mode: coverConfig.isLeatherMode,
              p_cover_page_settings: coverConfig.coverPageSettings
            });
            if (retryError) {
              reportError(retryError, 'DocumentMutation.saveViewport', 'Retry failed');
              return false;
            }
            this.currentVersion += 1;
            return true;
          }
        }
        return false;
      }

      this.currentVersion += 1;
      this.documentCache.delete(this.currentProjectId);
      this.backgroundsCache.delete(this.currentProjectId);

      logDocument('Cover metadata saved successfully');
      return true;
    } catch (error) {
      reportError(error, 'DocumentMutation.saveCoverMetadata', 'Error saving cover metadata');
      return false;
    }
  }

  // Clear stuck sync flag (for recovery)
  clearSyncInProgress(): void {
    this.syncInProgress = false;
    logDocument('Cleared stuck sync flag');
  }

  // Immediate sync (for critical operations)
  async syncNow(): Promise<boolean> {
    if (this.syncInProgress) {
      logDocument('syncNow: sync in progress, skipping');
      return false;
    }
    if (!connectivityService.isOnline()) {
      logDocument('syncNow: offline, skipping');
      return false;
    }
    if (!this.currentProjectId) {
      logDocument('syncNow: no project loaded, skipping');
      return false;
    }

    const totalChanges = Object.keys(this.changedAssets).length + Object.keys(this.changedPositions).length;
    if (totalChanges === 0) {
      logDocument('syncNow: no changes, nothing to sync');
      return true;
    }

    logDocument(`syncNow: syncing ${totalChanges} changes`);
    return this.performSync();
  }

  // Main sync method
  private async performSync(): Promise<boolean> {
    if (!this.currentProjectId) {
      reportError(new Error('No project loaded'), 'DocumentMutation.performSync', 'No project loaded');
      return false;
    }

    this.syncInProgress = true;
    this.syncStartTime = Date.now();
    this.notifySubscribers();

    // Set timeout to clear stuck sync flag
    const syncTimeout = setTimeout(() => {
      if (this.syncInProgress) {
        logDocument(`Sync timeout - clearing stuck flag after ${this.syncTimeoutMs}ms`);
        this.syncInProgress = false;
        this.notifySubscribers();
      }
    }, this.syncTimeoutMs);

    try {
      // NOTE: Following MASTER_PLAN.md - save positions first (HOT updates), then metadata
      if (Object.keys(this.changedPositions).length > 0) {
        await this.savePositionChanges();
      }

      if (Object.keys(this.changedAssets).length > 0) {
        await this.saveMetadataChanges();
      }

      this.notifySubscribers();
      return true;
    } catch (error) {
      reportError(error, 'DocumentMutation.performSync', 'Sync failed');
      return false;
    } finally {
      clearTimeout(syncTimeout);
      this.syncInProgress = false;
      const syncDuration = Date.now() - this.syncStartTime;
      logDocument(`Sync completed in ${syncDuration}ms`);
    }
  }

  // Save position changes to Supabase (hot update - cheap)
  private async savePositionChanges(): Promise<void> {
    if (!this.currentProjectId || Object.keys(this.changedPositions).length === 0) return;

    const positions = Object.entries(this.changedPositions).map(([asset_id, pos]) => ({
      asset_id,
      x: Math.round(pos.x || 0),
      y: Math.round(pos.y || 0),
      z_index: Math.round(pos.z_index || 0)
    }));

    performanceMonitor.incrementDatabaseRequests();
    const { error } = await supabase.rpc('save_positions', {
      p_project_id: this.currentProjectId,
      p_positions: positions
    });

    // Only clear changes after successful save
    if (!error) {
      const keysSaved = Object.keys(this.changedPositions);
      keysSaved.forEach(key => delete this.changedPositions[key]);
    }

    if (error) {
      reportError(error, 'DocumentMutation.savePositionChanges', 'Failed to save position changes');
      
      // Invalidate cache on any error
      this.documentCache.delete(this.currentProjectId);
      this.backgroundsCache.delete(this.currentProjectId);
      
      // If error is "Unauthorized", the project might not exist yet
      // Try to create it and retry
      if (error.message?.includes('Unauthorized')) {
        logDocument('Project might not exist, attempting to create...');
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const created = await this.createProject(this.currentProjectId, 'Untitled Project');
          if (created) {
            logDocument('Project created, retrying position save');
            const { error: retryError } = await supabase.rpc('save_positions', {
              p_project_id: this.currentProjectId,
              p_positions: positions
            });
            if (retryError) {
              reportError(retryError, 'DocumentMutation.savePositionChanges', 'Retry failed');
              throw retryError;
            }
            // Clear changes after successful save
            const keysSaved = Object.keys(this.changedPositions);
            keysSaved.forEach(key => delete this.changedPositions[key]);
            return;
          }
        }
      }
      throw error;
    }
  }

  // Save metadata changes to Supabase (full upsert)
  private async saveMetadataChanges(): Promise<void> {
    if (!this.currentProjectId || Object.keys(this.changedAssets).length === 0) return;

    // Process assets and compress thumbnails if needed
    const processedAssets = await Promise.all(
      Object.values(this.changedAssets).map(async (asset) => {
        // CRITICAL FIX: Store thumbnail in content field (TEXT, unbounded via TOAST)
        // custom_fields has 2KB limit, content is unbounded
        let content = asset.content || null;
        let thumbnail = null;
        
        // If asset has cloudPath (R2), use that as thumbnail reference and exclude content
        // This prevents sending 13MB base64 data to database on every sync
        if (asset.cloudPath) {
          thumbnail = asset.cloudPath;
          content = null; // Don't send content to DB if stored in R2
        } else if (asset.thumbnail) {
          // Store base64 thumbnail in content field (unbounded TEXT via TOAST)
          // This avoids the 2KB custom_fields constraint
          if (!content) {
            content = asset.thumbnail;
          } else {
            // If content already exists, prepend thumbnail with delimiter
            content = `__THUMBNAIL__${asset.thumbnail}__END_THUMBNAIL__${content}`;
          }
        }
        
        // custom_fields should only contain lightweight metadata (< 2KB)
        const customFieldsObj: Record<string, any> = {
          customFields: asset.customFields || [],
          customFieldValues: asset.customFieldValues || [],
          tags: asset.tags || [],
          thumbnail, // Only R2 path reference, never base64
          background: asset.background || null,
          description: asset.description || null,
          viewportDisplaySettings: asset.viewportDisplaySettings || {}
        };

        // Migrate 'other' type to 'card' for database compatibility
        const assetType = asset.type === 'other' ? 'card' : asset.type;

        return {
          asset_id: asset.id,
          parent_id: asset.parentId || null,
          name: asset.name,
          type: assetType,
          x: Math.round(asset.x || 0),
          y: Math.round(asset.y || 0),
          width: Math.round(asset.width || 0),
          height: Math.round(asset.height || 0),
          z_index: 0,
          is_expanded: asset.isExpanded || false,
          content,
          background_config: asset.backgroundConfig || {},
          viewport_config: asset.viewportConfig || {},
          custom_fields: customFieldsObj
        };
      })
    );

    const changes = processedAssets;

    // Optimize text fields for low IO storage
    const optimizedChanges = TextStorageOptimizer.optimizeAssetsForStorage(changes);
    
    // Log storage savings
    const savings = TextStorageOptimizer.estimateSavings(changes[0]);
    if (savings.savings > 0) {
      logDocument('Text storage optimization:', {
        originalSize: savings.originalSize,
        optimizedSize: savings.optimizedSize,
        savings: savings.savings,
        savingsPercent: Math.round((savings.savings / savings.originalSize) * 100)
      });
    }

    performanceMonitor.incrementDatabaseRequests();
    logDocument('saveMetadataChanges - Sending to RPC:', {
      p_project_id: this.currentProjectId,
      p_assets_count: optimizedChanges.length,
      p_assets: optimizedChanges
    });
    const { error } = await supabase.rpc('save_assets', {
      p_project_id: this.currentProjectId,
      p_assets: optimizedChanges
    });

    // Only clear changes after successful save
    if (!error) {
      const keysSaved = Object.keys(this.changedAssets);
      keysSaved.forEach(key => delete this.changedAssets[key]);
    }

    if (error) {
      reportError(error, 'DocumentMutation.saveMetadataChanges', 'Failed to save metadata changes');
      logDocument('Error details:', JSON.stringify(error, null, 2));
      logDocument('Asset save context:', {
        projectId: this.currentProjectId,
        assetCount: changes.length,
        currentVersion: this.currentVersion
      });
      
      // Invalidate cache on any error
      this.documentCache.delete(this.currentProjectId);
      this.backgroundsCache.delete(this.currentProjectId);
      
      // If error is "Unauthorized", the project might not exist yet
      // Try to create it and retry
      if (error.message?.includes('Unauthorized')) {
        logDocument('Project might not exist, attempting to create...');
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const created = await this.createProject(this.currentProjectId, 'Untitled Project');
          if (created) {
            logDocument('Project created, retrying metadata save');
            const { error: retryError } = await supabase.rpc('save_assets', {
              p_project_id: this.currentProjectId,
              p_assets: changes
              // No p_expected_version - let server handle it
            });
            if (retryError) {
              reportError(retryError, 'DocumentMutation.saveMetadataChanges', 'Retry failed');
              throw retryError;
            }
            // Reload version from server after successful save
            const loadResult = await this.loadDocument(this.currentProjectId);
            if (loadResult.success && loadResult.data) {
              this.currentVersion = loadResult.data.version;
            }
            // Clear changes after successful save
            const keysSaved = Object.keys(this.changedAssets);
            keysSaved.forEach(key => delete this.changedAssets[key]);
            return;
          }
        }
      }
      if (error.message?.includes('Version conflict')) {
        logDocument('Version conflict detected, reloading document...');
        const loadResult = await this.loadDocument(this.currentProjectId);
        if (loadResult.success && loadResult.data) {
          this.currentVersion = loadResult.data.version;
          logDocument('Reloaded version:', this.currentVersion);
          
          // Retry with correct version
          logDocument('Retrying saveMetadataChanges with correct version');
          const { error: retryError } = await supabase.rpc('save_assets', {
            p_project_id: this.currentProjectId,
            p_assets: changes
          });
          if (retryError) {
            reportError(retryError, 'DocumentMutation.saveMetadataChanges', 'Retry failed');
            throw retryError;
          }
          this.currentVersion += 1;
          // Clear changes after successful save
          const keysSaved = Object.keys(this.changedAssets);
          keysSaved.forEach(key => delete this.changedAssets[key]);
          return;
        }
        throw error;
      }
      throw error;
    }

    // Update local version
    this.currentVersion += 1;

    // Invalidate document cache on successful write
    if (this.currentProjectId) {
      this.documentCache.delete(this.currentProjectId);
      this.backgroundsCache.delete(this.currentProjectId);
    }
  }

  // Check if an error is retryable (network errors, timeouts, rate limits)
  private isRetryableError(error: any): boolean {
    if (!error) return false;
    
    const errorMessage = String(error.message || error).toLowerCase();
    
    // Retry on network errors
    if (errorMessage.includes('network') || 
        errorMessage.includes('timeout') ||
        errorMessage.includes('connection') ||
        errorMessage.includes('econnrefused') ||
        errorMessage.includes('etimedout')) {
      return true;
    }
    
    // Retry on rate limits (429) or server errors (5xx)
    if (error.code === '429' || 
        (error.code && error.code >= 500 && error.code < 600)) {
      return true;
    }
    
    // Don't retry on auth errors (401), not found (404), or version conflicts
    if (error.code === '401' || 
        error.code === '403' || 
        error.code === '404' ||
        errorMessage.includes('conflict')) {
      return false;
    }
    
    // Default: retry unknown errors
    return true;
  }

  // Utility: Sleep for delays
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Enhanced conflict handling with three-way merge
   * NOTE: Following MASTER_PLAN.md - simplified conflict resolution with state-based tracking
   */
  private async handleConflict(): Promise<boolean> {
    logDocument('Resolving conflict...');

    if (!this.currentProjectId) {
      reportError(new Error('No project loaded'), 'DocumentMutation.handleConflict', 'No project loaded for conflict resolution');
      return false;
    }

    try {
      // 1. Reload server document
      const serverDoc = await this.loadDocument(this.currentProjectId);
      if (!serverDoc.success || !serverDoc.data) {
        reportError(new Error('Failed to load server document'), 'DocumentMutation.handleConflict', 'Failed to load server document for conflict resolution');
        return false;
      }

      this.lastServerDocument = serverDoc.data;

      // 2. Apply server document to local state (server-wins strategy)
      await this.applyServerDocument(serverDoc.data);

      // 3. Clear local changes (server-wins)
      this.clearChanges();

      // 4. Log resolution
      const totalChanges = Object.keys(this.changedAssets).length + Object.keys(this.changedPositions).length;
      logDocument(`Conflict resolved (server-wins): cleared ${totalChanges} local changes`);

      // 5. Notify user/system
      this.notifyConflictResolved({
        strategy: 'server-wins',
        appliedOperations: [],
        discardedOperations: [],
        conflicts: [],
        resolved: true
      });

      return true;
    } catch (error) {
      reportError(error, 'DocumentMutation.handleConflict', 'Conflict resolution failed');

      // Fallback: simple server-wins
      if (this.lastServerDocument) {
        await this.applyServerDocument(this.lastServerDocument);
        this.clearChanges();
      }

      // Notify of failure
      this.notifyConflictFailed(error);

      return false;
    }
  }

  /**
   * Apply server document to local stores
   */
  private async applyServerDocument(serverDoc: any): Promise<void> {
    logDocument('Applying server document to local state');

    // Update version
    this.currentVersion = serverDoc.version;

    // Update asset store with server data
    const assetStore = (await import('@/stores/assetStore')).useAssetStore.getState();
    assetStore.loadWorldData(serverDoc.world_document);

    // Restore backgrounds from world_document.backgrounds to backgroundStore
    if (serverDoc.world_document?.backgrounds) {
      const backgroundStore = (await import('@/stores/backgroundStore')).useBackgroundStore.getState();
      const backgrounds = serverDoc.world_document.backgrounds;
      logDocument(`Restoring ${Object.keys(backgrounds).length} backgrounds from server`);

      Object.entries(backgrounds).forEach(([key, config]) => {
        // Don't trigger cloud sync when restoring from cloud (avoid loop)
        // Directly update store state and localStorage
        const clonedConfig = backgroundStore.cloneConfig(config as BackgroundConfig);
        backgroundStore.setBackground(key, clonedConfig);
      });
    }

    // Dispatch event for other components
    window.dispatchEvent(new CustomEvent('document-synced', {
      detail: {
        version: serverDoc.version,
        assetCount: Object.keys(serverDoc.world_document?.assets || {}).length
      }
    }));
  }

  /**
   * Filter non-conflicting operations
   * Delegates to ConflictResolver
   */
  private filterNonConflictingOps(
    ops: DocumentOperation[],
    serverDoc: any
  ): DocumentOperation[] {
    return this.conflictResolver.filterNonConflictingOps(ops, serverDoc);
  }

  /**
   * Notify that conflict was resolved
   */
  private notifyConflictResolved(resolution: ConflictResolution): void {
    // Dispatch event for UI notification
    const event = new CustomEvent('sync-conflict-resolved', {
      detail: {
        strategy: resolution.strategy,
        appliedCount: resolution.appliedOperations.length,
        discardedCount: resolution.discardedOperations.length,
        conflictCount: resolution.conflicts.length,
        conflicts: resolution.conflicts.map(c => ({
          operation: c.operation.op,
          reason: c.reason,
          field: c.field
        }))
      }
    });
    
    window.dispatchEvent(event);
    
    // Also notify subscribers
    this.notifySubscribers();
  }

  /**
   * Notify that conflict resolution failed
   */
  private notifyConflictFailed(error: any): void {
    const totalChanges = Object.keys(this.changedAssets).length + Object.keys(this.changedPositions).length;
    window.dispatchEvent(new CustomEvent('sync-conflict-failed', {
      detail: {
        error: String(error),
        projectId: this.currentProjectId,
        pendingChanges: totalChanges
      }
    }));
  }

  // Check if an operation is still valid given the current server state
  private async isOperationStillValid(
    op: DocumentOperation, 
    worldDocument: any
  ): Promise<boolean> {
    const assets = worldDocument?.assets || {};
    
    switch (op.op) {
      case 'CREATE_ASSET':
        // CREATE is always valid (might recreate if deleted)
        return true;
        
      case 'DELETE_ASSET':
        // Only valid if asset still exists
        return !!assets[op.assetId];
        
      case 'MOVE_ASSET':
        // Only valid if asset still exists
        return !!assets[op.assetId];
        
      case 'UPDATE_POSITION':
      case 'UPDATE_METADATA':
      case 'UPDATE_BACKGROUND_CONFIG':
      case 'UPDATE_ASSET_BACKGROUND':
      case 'UPDATE_CUSTOM_FIELDS':
        // Only valid if asset still exists
        return !!assets[op.assetId];
        
      case 'UPDATE_VIEWPORT':
      case 'UPDATE_GLOBAL_BACKGROUNDS':
        // These are always valid (not asset-specific)
        return true;
        
      default:
        return false;
    }
  }

  // Query assets for viewport
  async queryAssetsByParent(parentId?: string): Promise<any[]> {
    if (!this.currentProjectId) return [];

    try {
      const { data, error } = await supabase
        .rpc('query_assets_by_parent', {
          p_project_id: this.currentProjectId,
          p_parent_asset_id: parentId || null
        });

      if (error) throw error;
      return data || [];
    } catch (error) {
      reportError(error, 'DocumentMutation.query', 'Query failed');
      return [];
    }
  }

  // =====================================================
  // COMPATIBILITY LAYER FOR changeTrackingService
  // =====================================================
  // These methods provide the same API as changeTrackingService
  // to allow gradual migration without breaking existing code

  /**
   * Check if there are unsaved changes
   */
  hasUnsavedChanges(): boolean {
    return Object.keys(this.changedAssets).length > 0 || Object.keys(this.changedPositions).length > 0;
  }

  /**
   * Manual save trigger (flush immediately)
   */
  async manualSave(): Promise<void> {
    await this.syncNow();
  }

  /**
   * Set error callback for UI feedback on save failures
   */
  setOnErrorCallback(callback: (error: Error) => void): void {
    this.onSaveError = callback;
  }

  /**
   * Start auto-save with project ID
   */
  startAutoSave(projectId: string): void {
    this.setProjectId(projectId);
    // Auto-save is now handled by autosaveService which calls syncNow()
    logDocument('Auto-save started for project:', projectId);
  }

  /**
   * Set current project version (called after loading project)
   */
  setCurrentProjectVersion(version: number): void {
    this.currentVersion = version;
  }

  /**
   * Get current project version
   */
  getCurrentProjectVersion(): number {
    return this.currentVersion;
  }

  /**
   * Set up auth state listener to save before session expires
   */
  setupAuthListener(): void {
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'TOKEN_REFRESHED') {
        logDocument('Auth token refreshed');
      } else if (event === 'SIGNED_OUT') {
        logDocument('User signed out, attempting to save unsaved changes before clearing');
        try {
          await this.manualSave();
        } catch (error) {
          reportError(error, 'DocumentMutation.setupAuthListener', 'Failed to save on sign-out');
        }
        this.clearChanges();
      }
    });
  }

  /**
   * Set up beforeunload handler for unsaved changes warning
   */
  setupBeforeUnloadHandler(): void {
    const handler = (e: BeforeUnloadEvent) => {
      if (this.hasUnsavedChanges()) {
        e.preventDefault();
        e.returnValue = 'SAVE CHANGES BEFORE EXITING TAB';
      }
    };

    this.beforeUnloadHandler = handler;
    window.addEventListener('beforeunload', handler);
  }

  /**
   * Remove beforeunload handler
   */
  removeBeforeUnloadHandler(): void {
    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
      this.beforeUnloadHandler = null;
    }
  }

  // Load backgrounds from server document (Phase 7) with RAM caching
  async loadBackgrounds(forceRefresh: boolean = false): Promise<Record<string, any> | null> {
    if (!this.currentProjectId) return null;

    const cacheKey = this.currentProjectId;

    // Check cache first
    if (!forceRefresh) {
      const cached = this.backgroundsCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL_MS) {
        logDocument('Loading backgrounds from RAM cache:', cacheKey);
        return cached.data;
      }
    }

    try {
      const { data, error } = await supabase
        .rpc('load_backgrounds', {
          p_project_id: this.currentProjectId
        });

      if (error) throw error;
      if (!data || data.length === 0) return null;
      
      const backgrounds = data[0].backgrounds || {};

      // Update cache
      this.backgroundsCache.set(cacheKey, {
        data: backgrounds,
        timestamp: Date.now()
      });

      // Limit cache size
      if (this.backgroundsCache.size > 10) {
        const oldestKey = [...this.backgroundsCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
        this.backgroundsCache.delete(oldestKey);
      }

      return backgrounds;
    } catch (error) {
      reportError(error, 'DocumentMutation.loadBackgrounds', 'Failed to load backgrounds');
      return null;
    }
  }

  // Register file after R2 upload
  async registerFile(
    assetId: string,
    r2Key: string,
    sizeBytes: number,
    mimeType: string,
    variants?: any[]
  ): Promise<boolean> {
    if (!this.currentProjectId) return false;

    try {
      const { data, error } = await supabase
        .rpc('register_file', {
          p_project_id: this.currentProjectId,
          p_asset_id: assetId,
          p_r2_key: r2Key,
          p_size_bytes: sizeBytes,
          p_mime_type: mimeType,
          p_variants: variants || []
        });

      if (error) throw error;
      return !!data;
    } catch (error) {
      reportError(error, 'DocumentMutation.registerFile', 'File registration failed');
      return false;
    }
  }

  // =====================================================
  // PHASE 9: QUERY OPTIMIZATION & LARGE BOOK HANDLING
  // =====================================================

  /**
   * Query assets with cursor-based pagination (Phase 9)
   * For large books, use this instead of queryAssetsByParent
   * Returns paginated results with next_cursor for infinite scroll
   */
  async queryAssetsPaginated(
    parentId: string | null = null,
    cursor: string | null = null,
    limit: number = 100
  ): Promise<{
    assets: any[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    if (!this.currentProjectId) {
      return { assets: [], nextCursor: null, hasMore: false };
    }

    try {
      performanceMonitor.incrementDatabaseRequests();

      const { data, error } = await supabase
        .rpc('query_assets_by_parent_paginated', {
          p_project_id: this.currentProjectId,
          p_parent_asset_id: parentId,
          p_cursor: cursor,
          p_limit: Math.min(limit, 500) // Max 500 per page
        });

      if (error) throw error;

      if (!data || data.length === 0) {
        return { assets: [], nextCursor: null, hasMore: false };
      }

      // Extract pagination info from last row
      const lastRow = data[data.length - 1];
      const nextCursor = lastRow?.next_cursor || null;
      const hasMore = lastRow?.has_more || false;

      // Remove pagination fields from assets
      const assets = data.map(row => ({
        asset_id: row.asset_id,
        parent_asset_id: row.parent_asset_id,
        name: row.name,
        type: row.type,
        x: row.x,
        y: row.y,
        width: row.width,
        height: row.height,
        z_index: row.z_index,
        is_expanded: row.is_expanded,
        background_config: row.background_config,
        viewport_config: row.viewport_config,
        cloud_status: row.cloud_status,
        cloud_path: row.cloud_path
      }));

      return { assets, nextCursor, hasMore };
    } catch (error) {
      reportError(error, 'DocumentMutation.paginatedQuery', 'Paginated query failed');
      return { assets: [], nextCursor: null, hasMore: false };
    }
  }

  /**
   * Load partial document for viewport (Phase 9)
   * For large books, only loads assets visible in viewport
   * Falls back to full document for books < 1000 assets
   */
  async loadDocumentViewport(
    viewport?: {
      x: number;
      y: number;
      width: number;
      height: number;
    },
    options: {
      rootOnly?: boolean;
    } = {}
  ): Promise<{
    success: boolean;
    data?: {
      world_document: any;
      version: number;
      cover_config: any;
      updated_at: string;
    };
    partial?: boolean;
    totalAssets?: number;
    loadedAssets?: number;
    error?: string;
  }> {
    if (!this.currentProjectId) {
      return { success: false, error: 'No project loaded' };
    }

    try {
      performanceMonitor.incrementDatabaseRequests();

      const { data, error } = await supabase
        .rpc('load_document_viewport', {
          p_project_id: this.currentProjectId,
          p_viewport_x: viewport?.x ?? null,
          p_viewport_y: viewport?.y ?? null,
          p_viewport_width: viewport?.width ?? null,
          p_viewport_height: viewport?.height ?? null,
          p_root_only: options.rootOnly ?? false
        });

      if (error) throw error;

      if (!data || data.length === 0) {
        return { success: false, error: 'Project not found' };
      }

      const doc = data[0];
      this.currentVersion = doc.version;

      return {
        success: true,
        data: {
          world_document: doc.world_document,
          version: doc.version,
          cover_config: doc.cover_config,
          updated_at: doc.updated_at
        },
        partial: doc.partial_load,
        totalAssets: doc.total_assets,
        loadedAssets: doc.loaded_assets
      };
    } catch (error) {
      reportError(error, 'DocumentMutation.loadDocumentViewport', 'Viewport load failed');
      return { success: false, error: String(error) };
    }
  }

  /**
   * Load specific asset chunk (Phase 9)
   * Used for segmented document loading
   */
  async loadAssetChunk(assetIds: string[]): Promise<{
    success: boolean;
    assets?: Record<string, any>;
    error?: string;
  }> {
    if (!this.currentProjectId) {
      return { success: false, error: 'No project loaded' };
    }

    if (!assetIds.length || assetIds.length > 1000) {
      return { success: false, error: 'Invalid chunk size (max 1000)' };
    }

    try {
      performanceMonitor.incrementDatabaseRequests();

      const { data, error } = await supabase
        .rpc('load_asset_chunk', {
          p_project_id: this.currentProjectId,
          p_asset_ids: assetIds
        });

      if (error) throw error;

      // Convert array to record
      const assets: Record<string, any> = {};
      (data || []).forEach((row: { asset_id: string; asset_data: any }) => {
        assets[row.asset_id] = row.asset_data;
      });

      return { success: true, assets };
    } catch (error) {
      reportError(error, 'DocumentMutation.loadDocumentChunk', 'Load chunk failed');
      return { success: false, error: String(error) };
    }
  }

  /**
   * Get document manifest for segmented loading (Phase 9)
   * Returns chunk information for large documents
   */
  async getDocumentManifest(chunkSize: number = 1000): Promise<{
    success: boolean;
    manifest?: {
      chunks: Array<{
        index: number;
        size: number;
        assetIds: string[];
      }>;
      totalChunks: number;
      totalAssets: number;
      documentSizeBytes: number;
    };
    error?: string;
  }> {
    if (!this.currentProjectId) {
      return { success: false, error: 'No project loaded' };
    }

    try {
      performanceMonitor.incrementDatabaseRequests();

      const { data, error } = await supabase
        .rpc('get_document_manifest', {
          p_project_id: this.currentProjectId,
          p_chunk_size: chunkSize
        });

      if (error) throw error;

      if (!data || data.length === 0) {
        return { success: false, error: 'Project not found' };
      }

      const chunks = data.map((row: any) => ({
        index: row.chunk_index,
        size: row.chunk_size,
        assetIds: row.asset_ids
      }));

      return {
        success: true,
        manifest: {
          chunks,
          totalChunks: data[0]?.total_chunks || 0,
          totalAssets: data[0]?.total_assets || 0,
          documentSizeBytes: data[0]?.document_size_bytes || 0
        }
      };
    } catch (error) {
      reportError(error, 'DocumentMutation.getManifest', 'Get manifest failed');
      return { success: false, error: String(error) };
    }
  }

  /**
   * Queue operation on server for execution with concurrency control (Phase 9)
   * Prevents connection pool exhaustion
   * Note: Different from local queueOperation - this queues on the server
   */
  async queueServerOperation(
    operationType: string,
    operationData: Record<string, any>,
    priority: number = 5
  ): Promise<{
    success: boolean;
    queueId?: string;
    status?: string;
    error?: string;
  }> {
    if (!this.currentProjectId) {
      return { success: false, error: 'No project loaded' };
    }

    try {
      const { data, error } = await supabase
        .rpc('queue_operation', {
          p_project_id: this.currentProjectId,
          p_operation_type: operationType,
          p_operation_data: operationData,
          p_priority: Math.max(1, Math.min(10, priority)) // Clamp 1-10
        });

      if (error) throw error;

      return {
        success: true,
        queueId: data,
        status: 'queued'
      };
    } catch (error) {
      reportError(error, 'DocumentMutation.queueServerOperation', 'Queue server operation failed');
      return { success: false, error: String(error) };
    }
  }

  /**
   * Get queued operations status from server (Phase 9)
   */
  async getQueuedOperations(projectId?: string, limit: number = 50): Promise<{
    success: boolean;
    operations?: Array<{
      queueId: string;
      operationType: string;
      status: string;
      priority: number;
      createdAt: string;
      startedAt?: string;
      retryCount: number;
    }>;
    error?: string;
  }> {
    try {
      const { data, error } = await supabase
        .rpc('get_queued_operations', {
          p_project_id: projectId || this.currentProjectId,
          p_limit: limit
        });

      if (error) throw error;

      return {
        success: true,
        operations: (data || []).map((row: any) => ({
          queueId: row.queue_id,
          operationType: row.operation_type,
          status: row.status,
          priority: row.priority,
          createdAt: row.created_at,
          startedAt: row.started_at,
          retryCount: row.retry_count
        }))
      };
    } catch (error) {
      reportError(error, 'DocumentMutation.getQueue', 'Get queue failed');
      return { success: false, error: String(error) };
    }
  }

  /**
   * Query asset tree recursively (Phase 9)
   * Efficient for rendering large trees
   */
  async queryAssetTree(
    rootAssetId?: string,
    maxDepth: number = 10
  ): Promise<{
    success: boolean;
    tree?: Array<{
      assetId: string;
      parentAssetId: string | null;
      name: string;
      type: string;
      depth: number;
      path: string;
      hasChildren: boolean;
    }>;
    error?: string;
  }> {
    if (!this.currentProjectId) {
      return { success: false, error: 'No project loaded' };
    }

    try {
      performanceMonitor.incrementDatabaseRequests();

      const { data, error } = await supabase
        .rpc('query_asset_tree', {
          p_project_id: this.currentProjectId,
          p_root_asset_id: rootAssetId || null,
          p_max_depth: maxDepth
        });

      if (error) throw error;

      return {
        success: true,
        tree: (data || []).map((row: any) => ({
          assetId: row.asset_id,
          parentAssetId: row.parent_asset_id,
          name: row.name,
          type: row.type,
          depth: row.depth,
          path: row.path,
          hasChildren: row.has_children
        }))
      };
    } catch (error) {
      reportError(error, 'DocumentMutation.queryTree', 'Query tree failed');
      return { success: false, error: String(error) };
    }
  }

  /**
   * Get large book metrics and recommendations (Phase 9)
   * Monitor performance and get loading strategy recommendations
   */
  async getLargeBookMetrics(): Promise<{
    success: boolean;
    metrics?: Record<string, {
      value: string;
      warningLevel: 'ok' | 'warning' | 'critical';
    }>;
    recommendedStrategy?: 'full_load' | 'viewport_load' | 'segmented_load';
    error?: string;
  }> {
    if (!this.currentProjectId) {
      return { success: false, error: 'No project loaded' };
    }

    try {
      const { data, error } = await supabase
        .rpc('get_large_book_metrics', {
          p_project_id: this.currentProjectId
        });

      if (error) throw error;

      const metrics: Record<string, { value: string; warningLevel: 'ok' | 'warning' | 'critical' }> = {};
      let recommendedStrategy: 'full_load' | 'viewport_load' | 'segmented_load' = 'full_load';

      (data || []).forEach((row: any) => {
        metrics[row.metric_name] = {
          value: row.metric_value,
          warningLevel: row.warning_level
        };
        if (row.metric_name === 'recommended_strategy') {
          recommendedStrategy = row.metric_value;
        }
      });

      return { success: true, metrics, recommendedStrategy };
    } catch (error) {
      reportError(error, 'DocumentMutation.getMetrics', 'Get metrics failed');
      return { success: false, error: String(error) };
    }
  }

  /**
   * Determine optimal loading strategy based on book size (Phase 9)
   */
  async getOptimalLoadingStrategy(): Promise<{
    strategy: 'full' | 'viewport' | 'segmented';
    reason: string;
    assetCount?: number;
    documentSizeMB?: number;
  }> {
    const metrics = await this.getLargeBookMetrics();

    if (!metrics.success) {
      // Default to full load if metrics unavailable
      return {
        strategy: 'full',
        reason: 'Failed to get metrics, defaulting to full load'
      };
    }

    const assetCount = parseInt(metrics.metrics?.asset_count?.value || '0');
    const docSizeMB = parseFloat(metrics.metrics?.document_size_mb?.value || '0');
    const recommended = metrics.recommendedStrategy;

    if (recommended === 'segmented_load' || docSizeMB > 4) {
      return {
        strategy: 'segmented',
        reason: `Document size ${docSizeMB.toFixed(2)}MB exceeds 4MB threshold`,
        assetCount,
        documentSizeMB: docSizeMB
      };
    }

    if (recommended === 'viewport_load' || assetCount > 1000) {
      return {
        strategy: 'viewport',
        reason: `Asset count ${assetCount} exceeds 1000 threshold`,
        assetCount,
        documentSizeMB: docSizeMB
      };
    }

    return {
      strategy: 'full',
      reason: `Small book: ${assetCount} assets, ${docSizeMB.toFixed(2)}MB`,
      assetCount,
      documentSizeMB: docSizeMB
    };
  }

  // =====================================================
  // PHASE 10: CLOUD SYNC TRACKING
  // =====================================================

  /**
   * Start periodic cloud retry polling
   * Runs every minute to check for failed uploads
   * Call explicitly when needed (not auto-started to prevent quota flood)
   */
  startCloudRetryPolling(): void {
    if (this.cloudRetryInterval) return; // Already running
    
    logDocument('Starting cloud retry polling');
    
    this.cloudRetryInterval = window.setInterval(async () => {
      if (!connectivityService.isOnline() || !this.currentProjectId) return;
      
      await this.processCloudRetryQueue();
    }, CLOUD_RETRY_CONFIG.checkIntervalMs);
  }

  /**
   * Stop cloud retry polling
   */
  stopCloudRetryPolling(): void {
    if (this.cloudRetryInterval) {
      window.clearInterval(this.cloudRetryInterval);
      this.cloudRetryInterval = null;
      logDocument('Stopped cloud retry polling');
    }
  }

  /**
   * Process cloud retry queue
   * Fetches failed uploads and retries them with exponential backoff
   */
  private async processCloudRetryQueue(): Promise<void> {
    if (this.isCloudRetryRunning) return;
    this.isCloudRetryRunning = true;

    try {
      const syncQueue = await this.getSyncQueue(50);
      
      for (const item of syncQueue) {
        // Check retry count to prevent infinite loops
        const retryInfo = this.cloudRetryCounts.get(item.asset_id);
        const retryCount = retryInfo?.count || 0;
        
        if (retryCount >= CLOUD_RETRY_CONFIG.maxRetries) {
          logDocument(`Max retries exceeded for asset ${item.asset_id}, skipping`);
          continue;
        }

        // Check if enough time has passed since last retry (exponential backoff)
        const now = Date.now();
        const lastRetry = retryInfo?.lastRetry || 0;
        const delayMs = Math.min(
          CLOUD_RETRY_CONFIG.baseDelayMs * Math.pow(CLOUD_RETRY_CONFIG.backoffMultiplier, retryCount),
          CLOUD_RETRY_CONFIG.maxDelayMs
        );
        
        if (now - lastRetry < delayMs) {
          continue; // Too soon, skip this item
        }

        // Update retry tracking
        this.cloudRetryCounts.set(item.asset_id, {
          count: retryCount + 1,
          lastRetry: now
        });

        // Dispatch retry event for R2UploadService to handle
        window.dispatchEvent(new CustomEvent('cloud-retry-upload', {
          detail: {
            assetId: item.asset_id,
            retryCount: retryCount + 1,
            cloudError: item.cloud_error
          }
        }));
      }
    } catch (error) {
      reportError(error, 'DocumentMutation.processCloudRetryQueue', 'Cloud retry queue processing failed');
    } finally {
      this.isCloudRetryRunning = false;
    }
  }

  /**
   * Get sync queue for retry
   * Returns assets with 'failed' or 'uploading' status
   */
  async getSyncQueue(limit: number = 50): Promise<Array<{
    asset_id: string;
    name: string;
    cloud_status: string;
    cloud_error: string | null;
    retry_count: number;
  }>> {
    if (!this.currentProjectId) return [];

    try {
      const { data, error } = await supabase
        .rpc('get_sync_queue', {
          p_project_id: this.currentProjectId,
          p_limit: limit
        });

      if (error) throw error;
      
      // Merge with local retry counts
      return (data || []).map(item => {
        const retryInfo = this.cloudRetryCounts.get(item.asset_id);
        return {
          ...item,
          retry_count: retryInfo?.count || 0
        };
      });
    } catch (error) {
      reportError(error, 'DocumentMutation.getSyncQueue', 'Get sync queue failed');
      return [];
    }
  }

  /**
   * Get failed uploads
   * Returns assets with 'failed' status only
   */
  async getFailedUploads(): Promise<Array<{
    assetId: string;
    name: string;
    cloudStatus: string;
    cloudError: string | null;
  }>> {
    if (!this.currentProjectId) return [];

    try {
      const { data, error } = await supabase
        .rpc('get_failed_uploads', {
          p_project_id: this.currentProjectId
        });

      if (error) throw error;
      
      return (data || []).map(item => ({
        assetId: item.asset_id,
        name: item.name,
        cloudStatus: item.cloud_status,
        cloudError: item.cloud_error
      }));
    } catch (error) {
      reportError(error, 'DocumentMutation.getFailedUploads', 'Get failed uploads failed');
      return [];
    }
  }

  /**
   * Update cloud status for an asset
   * Called after upload success/failure
   */
  async updateCloudStatus(
    assetId: string,
    status: 'local' | 'uploading' | 'synced' | 'failed',
    error?: string
  ): Promise<boolean> {
    try {
      const { error: rpcError } = await supabase
        .rpc('update_cloud_status', {
          p_asset_id: assetId,
          p_status: status,
          p_error: error || null
        });

      if (rpcError) throw rpcError;

      // Clear retry count on successful sync
      if (status === 'synced') {
        this.cloudRetryCounts.delete(assetId);
      }

      return true;
    } catch (err) {
      reportError(err, 'DocumentMutation.updateCloudStatus', 'Update cloud status failed');
      return false;
    }
  }

  /**
   * Get uploads by status
   * Useful for manual retry UI
   */
  async getUploadsByStatus(
    status: 'local' | 'uploading' | 'synced' | 'failed',
    limit: number = 100
  ): Promise<Array<{
    assetId: string;
    name: string;
    type: string;
    cloudStatus: string;
    cloudError: string | null;
    updatedAt: string;
  }>> {
    if (!this.currentProjectId) return [];

    try {
      const { data, error } = await supabase
        .rpc('get_uploads_by_status', {
          p_project_id: this.currentProjectId,
          p_status: status,
          p_limit: limit
        });

      if (error) throw error;
      
      return (data || []).map(item => ({
        assetId: item.asset_id,
        name: item.name,
        type: item.type,
        cloudStatus: item.cloud_status,
        cloudError: item.cloud_error,
        updatedAt: item.updated_at
      }));
    } catch (error) {
      reportError(error, 'DocumentMutation.getUploadsByStatus', 'Get uploads by status failed');
      return [];
    }
  }

  /**
   * Get cloud sync summary for current project
   * Useful for status indicators
   */
  async getCloudSyncSummary(): Promise<{
    totalAssets: number;
    localCount: number;
    uploadingCount: number;
    syncedCount: number;
    failedCount: number;
    lastFailedAt: string | null;
  } | null> {
    if (!this.currentProjectId) return null;

    try {
      const { data, error } = await supabase
        .rpc('get_cloud_sync_summary', {
          p_project_id: this.currentProjectId
        });

      if (error) throw error;
      if (!data || data.length === 0) return null;

      const row = data[0];
      return {
        totalAssets: Number(row.total_assets),
        localCount: Number(row.local_count),
        uploadingCount: Number(row.uploading_count),
        syncedCount: Number(row.synced_count),
        failedCount: Number(row.failed_count),
        lastFailedAt: row.last_failed_at
      };
    } catch (error) {
      reportError(error, 'DocumentMutation.getCloudSyncSummary', 'Get cloud sync summary failed');
      return null;
    }
  }

  /**
   * Bulk update cloud status for multiple assets
   * Used when batch operations complete
   */
  async bulkUpdateCloudStatus(
    assetIds: string[],
    status: 'local' | 'uploading' | 'synced' | 'failed',
    error?: string
  ): Promise<number> {
    if (!this.currentProjectId) return 0;
    
    // Limit to 100 per batch
    if (assetIds.length > 100) {
      logDocument('Bulk update limited to 100 assets');
      assetIds = assetIds.slice(0, 100);
    }

    try {
      const { data, error: rpcError } = await supabase
        .rpc('bulk_update_cloud_status', {
          p_project_id: this.currentProjectId,
          p_asset_ids: assetIds,
          p_status: status,
          p_error: error || null
        });

      if (rpcError) throw rpcError;

      // Clear retry counts for successfully synced assets
      if (status === 'synced') {
        assetIds.forEach(id => this.cloudRetryCounts.delete(id));
      }

      return data || 0;
    } catch (err) {
      reportError(err, 'DocumentMutation.bulkUpdateCloudStatus', 'Bulk update cloud status failed');
      return 0;
    }
  }

  /**
   * Reset retry count for an asset
   * Called before manual retry
   */
  resetCloudRetryCount(assetId: string): void {
    this.cloudRetryCounts.delete(assetId);
    logDocument(`Reset retry count for asset ${assetId}`);
  }

  /**
   * Get retry information for debugging
   */
  getCloudRetryInfo(): Map<string, { count: number; lastRetry: number }> {
    return new Map(this.cloudRetryCounts);
  }

  // Utility: Chunk operations
  private chunkOperations(ops: DocumentOperation[], size: number): DocumentOperation[][] {
    const chunks: DocumentOperation[][] = [];
    for (let i = 0; i < ops.length; i += size) {
      chunks.push(ops.slice(i, i + size));
    }
    return chunks;
  }

  // Utility: Debounced sync scheduling
  private syncTimeout: number | null = null;
  private scheduleSync(): void {
    if (this.syncTimeout) {
      window.clearTimeout(this.syncTimeout);
    }
    // Increased from 1s to 2s to reduce Supabase call frequency
    this.syncTimeout = window.setTimeout(() => {
      this.syncNow();
    }, 2000); // 2 second debounce
  }

  // Subscribe to status changes
  subscribe(callback: (status: SyncStatus) => void): () => void {
    this.subscribers.add(callback);
    callback(this.getStatus()); // Initial state
    return () => this.subscribers.delete(callback);
  }

  private notifySubscribers(): void {
    const status = this.getStatus();
    this.subscribers.forEach(cb => cb(status));
  }

  getStatus(): SyncStatus {
    const { syncEnabled, quota } = useCloudStore.getState();
    const isOnline = connectivityService.isOnline();
    const { isAuthenticated } = useAuthStore.getState();
    const totalChanges = Object.keys(this.changedAssets).length + Object.keys(this.changedPositions).length;

    return {
      lastSyncTime: this.syncInProgress ? null : new Date(),
      syncEnabled: isAuthenticated && syncEnabled,
      pendingChanges: totalChanges > 0,
      onlineMode: isOnline,
      quotaExceeded: false,
      storageUsed: quota.used,
      storageLimit: quota.available,
      syncInProgress: this.syncInProgress,
      queuedItems: totalChanges,
      documentVersion: this.currentVersion
    };
  }
}

export const documentMutationService = DocumentMutationService.getInstance();

// Re-export conflict types for convenience
export type { Conflict, ConflictResolution, ConflictStrategy } from './ConflictResolver';
