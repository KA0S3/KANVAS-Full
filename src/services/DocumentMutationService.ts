/**
 * DOCUMENT MUTATION SERVICE - COMPATIBILITY LAYER
 * 
 * This file provides backward compatibility for the old DocumentMutationService
 * while redirecting calls to the new persistence architecture.
 * 
 * 🚨 DEPRECATED: This service is replaced by:
 * - Asset persistence operations: src/persistence/assets.ts
 * - Sync operations: src/stores/syncStore.ts + src/sync/processor.ts
 * - Project operations: src/persistence/projects.ts
 * 
 * Please migrate to the new architecture as soon as possible.
 */

import { useSyncStore } from '@/stores/syncStore';
import { syncProcessor } from '@/sync/processor';
import { assetPersistence } from '@/persistence/assets';
import { projectPersistence } from '@/persistence/projects';
import { Asset } from '@/types/Asset';

// Legacy types for compatibility
export interface DocumentOperation {
  op: 'CREATE_ASSET' | 'UPDATE_METADATA' | 'UPDATE_POSITION' | 'DELETE_ASSET';
  assetId: string;
  name?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  content?: string;
  type?: string;
  projectId?: string;
  parentId?: string;
}

export interface LoadResult {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Compatibility layer for DocumentMutationService
 * 
 * Maps old service methods to new architecture
 */
class DocumentMutationServiceCompat {
  private currentProjectId: string | null = null;

  /**
   * Set current project ID (legacy method)
   */
  setProjectId(projectId: string | null): void {
    this.currentProjectId = projectId;
    // In new architecture, this would be handled by project store
    if (projectId) {
      localStorage.setItem('currentProjectId', projectId);
    } else {
      localStorage.removeItem('currentProjectId');
    }
  }

  /**
   * Get current project ID (legacy method)
   */
  getCurrentProjectId(): string | null {
    if (this.currentProjectId) {
      return this.currentProjectId;
    }
    // Fallback to localStorage (matches new sync processor behavior)
    return localStorage.getItem('currentProjectId');
  }

  /**
   * Queue operation (legacy method)
   * Now redirects to sync store
   */
  queueOperation(operation: DocumentOperation): void {
    const projectId = operation.projectId || this.getCurrentProjectId();
    if (!projectId) {
      console.warn('Cannot queue operation: no project ID set');
      return;
    }

    // Convert legacy operation to new sync queue format
    const syncOperation = this.legacyOpToSyncOp(operation.op);
    
    // For create/update operations, we need asset data
    if (operation.op === 'CREATE_ASSET' || operation.op === 'UPDATE_METADATA') {
      const assetData = this.legacyOpToAsset(operation);
      if (assetData) {
        // Mark for sync with asset data
        useSyncStore.getState().markForSync(operation.assetId, syncOperation, projectId);
      }
    } else {
      // For delete/position operations, just mark for sync
      useSyncStore.getState().markForSync(operation.assetId, syncOperation, projectId);
    }
  }

  /**
   * Sync now (legacy method)
   * Now uses sync processor
   */
  async syncNow(): Promise<boolean> {
    try {
      await syncProcessor.forceProcess();
      return true;
    } catch (error) {
      console.error('Sync failed:', error);
      return false;
    }
  }

  /**
   * Load document (legacy method)
   * Now uses project persistence
   */
  async loadDocument(projectId: string): Promise<LoadResult> {
    try {
      const project = await projectPersistence.get(projectId);
      const assets = await assetPersistence.getProjectAssets(projectId);
      
      return {
        success: true,
        data: {
          project,
          assets
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Set conflict strategy (legacy method)
   * Note: New architecture uses simple last-write-wins
   */
  setConflictStrategy(strategy: 'server-wins' | 'client-wins'): void {
    console.warn('Conflict strategy setting is deprecated. New architecture uses last-write-wins.');
  }

  /**
   * Setup auth listener (legacy method)
   * Now handled by sync processor
   */
  setupAuthListener(): void {
    // Auth listeners are now handled automatically by the sync processor
    console.log('Auth listener setup - now handled automatically by sync processor');
  }

  /**
   * Setup before unload handler (legacy method)
   * Now handled by App.tsx with sync processor
   */
  setupBeforeUnloadHandler(): void {
    console.log('Before unload handler setup - now handled by App.tsx');
  }

  /**
   * Remove before unload handler (legacy method)
   */
  removeBeforeUnloadHandler(): void {
    console.log('Before unload handler removal - now handled by App.tsx');
  }

  /**
   * Convert legacy operation type to sync operation
   */
  private legacyOpToSyncOp(legacyOp: string): 'create' | 'update' | 'delete' {
    switch (legacyOp) {
      case 'CREATE_ASSET':
        return 'create';
      case 'UPDATE_METADATA':
      case 'UPDATE_POSITION':
        return 'update';
      case 'DELETE_ASSET':
        return 'delete';
      default:
        console.warn(`Unknown legacy operation: ${legacyOp}`);
        return 'update';
    }
  }

  /**
   * Convert legacy operation to asset data
   */
  private legacyOpToAsset(operation: DocumentOperation): Partial<Asset> | null {
    const projectId = operation.projectId || this.getCurrentProjectId();
    if (!projectId) return null;

    // Map legacy operation fields to canonical asset structure
    const asset: Partial<Asset> = {
      projectId,
      id: operation.assetId,
      parentId: operation.parentId,
      layout: {
        x: operation.x || 0,
        y: operation.y || 0,
        width: operation.width || 100,
        height: operation.height || 100,
      },
      content: {
        title: operation.name,
        text: operation.content,
      },
      style: {},
      behavior: {},
      metadata: {
        tags: operation.type ? [operation.type] : [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      }
    };

    return asset;
  }

  // Legacy properties for backward compatibility
  get offlineQueue(): DocumentOperation[] {
    // Return empty array - sync queue is now handled by sync store
    return [];
  }

  set offlineQueue(queue: DocumentOperation[]) {
    // Convert legacy queue operations to new sync queue
    queue.forEach(op => this.queueOperation(op));
  }

  get syncInProgress(): boolean {
    const stats = syncProcessor.getStats();
    return stats.isRunning && stats.currentBatch.length > 0;
  }

  set syncInProgress(inProgress: boolean) {
    // This property is now read-only in the new architecture
    console.warn('syncInProgress is now read-only');
  }

  get currentVersion(): number {
    // Version tracking is now per-asset in metadata
    console.warn('currentVersion is deprecated. Version is now per-asset in metadata');
    return 0;
  }

  set currentVersion(version: number) {
    // Version tracking is now per-asset in metadata
    console.warn('currentVersion is deprecated. Version is now per-asset in metadata');
  }
}

// Export singleton instance for backward compatibility
export const documentMutationService = new DocumentMutationServiceCompat();
