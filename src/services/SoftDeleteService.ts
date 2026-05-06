import { supabase } from '@/lib/supabase';
import { documentMutationService } from '@/services/DocumentMutationService';
import { undoService } from '@/services/UndoService';
import { useAssetStore } from '@/stores/assetStore';
import { useTagStore } from '@/stores/tagStore';
import { useBackgroundStore } from '@/stores/backgroundStore';

interface DeletionBatch {
  projectId: string;
  assetIds: string[];
  tagIds: string[];
  backgroundIds: string[];
  timestamp: number;
}

class SoftDeleteService {
  private static instance: SoftDeleteService;
  private pendingDeletions: Map<string, DeletionBatch> = new Map();
  private batchFlushTimer: any = null;
  private readonly BATCH_FLUSH_MS = 5000; // 5 seconds for batching deletions
  private readonly MAX_BATCH_SIZE = 100;

  static getInstance(): SoftDeleteService {
    if (!SoftDeleteService.instance) {
      SoftDeleteService.instance = new SoftDeleteService();
    }
    return SoftDeleteService.instance;
  }

  // Soft delete assets (follows MASTER_PLAN.md low IO philosophy)
  async softDeleteAssets(projectId: string, assetIds: string[]): Promise<void> {
    if (!projectId || assetIds.length === 0) return;

    console.log(`[SoftDeleteService] Queueing soft delete for ${assetIds.length} assets`);

    // Add to pending batch
    const batch = this.getOrCreateBatch(projectId);
    batch.assetIds.push(...assetIds);

    // Record for undo before actually deleting
    const assetStore = useAssetStore.getState();
    assetIds.forEach(assetId => {
      const asset = assetStore.getAssetById(assetId);
      if (asset) {
        undoService.recordAction('delete', 'asset', asset, asset);
      }
    });

    // Flush batch if it gets too large
    if (this.getBatchSize(batch) >= this.MAX_BATCH_SIZE) {
      await this.flushBatch(projectId);
    } else {
      this.scheduleBatchFlush();
    }
  }

  // Soft delete tags
  async softDeleteTags(projectId: string, tagIds: string[]): Promise<void> {
    if (!projectId || tagIds.length === 0) return;

    console.log(`[SoftDeleteService] Queueing soft delete for ${tagIds.length} tags`);

    // Add to pending batch
    const batch = this.getOrCreateBatch(projectId);
    batch.tagIds.push(...tagIds);

    // Record for undo before actually deleting
    const tagStore = useTagStore.getState();
    tagIds.forEach(tagId => {
      const tag = tagStore.tags[tagId];
      if (tag) {
        undoService.recordAction('delete', 'tag', tag, tag);
      }
    });

    // Flush batch if it gets too large
    if (this.getBatchSize(batch) >= this.MAX_BATCH_SIZE) {
      await this.flushBatch(projectId);
    } else {
      this.scheduleBatchFlush();
    }
  }

  // Soft delete backgrounds
  async softDeleteBackgrounds(projectId: string, backgroundIds: string[]): Promise<void> {
    if (!projectId || backgroundIds.length === 0) return;

    console.log(`[SoftDeleteService] Queueing soft delete for ${backgroundIds.length} backgrounds`);

    // Add to pending batch
    const batch = this.getOrCreateBatch(projectId);
    batch.backgroundIds.push(...backgroundIds);

    // Record for undo before actually deleting
    const backgroundStore = useBackgroundStore.getState();
    backgroundIds.forEach(backgroundId => {
      const background = backgroundStore.getBackground(backgroundId);
      if (background) {
        undoService.recordAction('delete', 'background', { id: backgroundId, ...background }, background);
      }
    });

    // Flush batch if it gets too large
    if (this.getBatchSize(batch) >= this.MAX_BATCH_SIZE) {
      await this.flushBatch(projectId);
    } else {
      this.scheduleBatchFlush();
    }
  }

  // Soft delete project (follows MASTER_PLAN.md - use deleted_at)
  async softDeleteProject(projectId: string): Promise<void> {
    console.log(`[SoftDeleteService] Soft deleting project: ${projectId}`);

    try {
      const { data, error } = await supabase.rpc('delete_project', {
        p_project_id: projectId
      });

      if (error) {
        console.error('[SoftDeleteService] Delete RPC error:', error);
        console.error('[SoftDeleteService] Error message:', error.message);
        console.error('[SoftDeleteService] Error details:', error.details);
        console.error('[SoftDeleteService] Error hint:', error.hint);
        console.error('[SoftDeleteService] Error code:', error.code);
        // If project not found or already deleted, that's okay - continue with local deletion
        if (error.message?.includes('not found') || error.message?.includes('unauthorized') || error.message?.includes('Project not found')) {
          console.log('[SoftDeleteService] Project not found or already deleted in Supabase, continuing with local deletion');
          return;
        }
        console.error('[SoftDeleteService] Failed to soft delete project:', error);
        throw error;
      }

      console.log('[SoftDeleteService] Successfully soft deleted project from Supabase');
    } catch (error) {
      console.error('[SoftDeleteService] Error soft deleting project:', error);
      throw error;
    }
  }

  // Restore soft deleted items (for undo functionality)
  async restoreAssets(projectId: string, assetIds: string[]): Promise<void> {
    if (!projectId || assetIds.length === 0) return;

    console.log(`[SoftDeleteService] Restoring ${assetIds.length} assets`);

    try {
      // Build assets array for save_assets RPC
      const assets = assetIds.map(assetId => {
        const assetStore = useAssetStore.getState();
        const asset = assetStore.getAssetById(assetId);
        if (!asset) return null;

        // Convert to database format
        return {
          asset_id: asset.id,
          parent_id: asset.parentId || null,
          name: asset.name,
          type: asset.type,
          x: asset.x,
          y: asset.y,
          width: asset.width,
          height: asset.height,
          z_index: (() => {
            // CRITICAL FIX: Calculate z-index using same logic as AssetItem.tsx
            const area = (asset.width || 200) * (asset.height || 150);
            const maxArea = 500 * 400;
            const minArea = 50 * 50;
            const normalizedArea = Math.max(minArea, Math.min(maxArea, area));
            const zIndexRange = 900;
            return 1000 - Math.floor(((normalizedArea - minArea) / (maxArea - minArea)) * zIndexRange);
          })(),
          is_expanded: false,
          content: asset.content || null,
          background_config: asset.backgroundConfig || {},
          viewport_config: asset.viewportConfig || {},
          custom_fields: {}
        };
      }).filter(Boolean);

      if (assets.length === 0) return;

      // Call save_assets to restore (deleted_at will be set to NULL)
      const { error } = await supabase.rpc('save_assets', {
        p_project_id: projectId,
        p_assets: assets
      });

      if (error) {
        console.error('[SoftDeleteService] Failed to restore assets:', error);
        throw error;
      }

      console.log('[SoftDeleteService] Successfully restored assets');
    } catch (error) {
      console.error('[SoftDeleteService] Error restoring assets:', error);
      throw error;
    }
  }

  // Restore soft deleted tags
  async restoreTags(projectId: string, tagIds: string[]): Promise<void> {
    if (!projectId || tagIds.length === 0) return;

    console.log(`[SoftDeleteService] Restoring ${tagIds.length} tags`);

    try {
      // Tags are stored in project metadata, so we need to update the project
      const tagStore = useTagStore.getState();
      const currentTags = { ...tagStore.tags };

      // Ensure tags exist in store
      tagIds.forEach(tagId => {
        if (!currentTags[tagId]) {
          console.warn(`[SoftDeleteService] Tag ${tagId} not found in store, skipping restore`);
        }
      });

      // Update project metadata with restored tags
      const { error } = await supabase.rpc('save_project', {
        p_project_id: projectId,
        p_tags_config: currentTags
      });

      if (error) {
        console.error('[SoftDeleteService] Failed to restore tags:', error);
        throw error;
      }

      console.log('[SoftDeleteService] Successfully restored tags');
    } catch (error) {
      console.error('[SoftDeleteService] Error restoring tags:', error);
      throw error;
    }
  }

  // Restore soft deleted backgrounds
  async restoreBackgrounds(projectId: string, backgroundIds: string[]): Promise<void> {
    if (!projectId || backgroundIds.length === 0) return;

    console.log(`[SoftDeleteService] Restoring ${backgroundIds.length} backgrounds`);

    try {
      // Backgrounds are stored in project metadata, need to load current backgrounds first
      const { data: projectData, error: loadError } = await supabase
        .rpc('load_project', {
          p_project_id: projectId
        });

      if (loadError || !projectData || projectData.length === 0) {
        console.error('[SoftDeleteService] Failed to load project for background restore:', loadError);
        throw loadError || new Error('Project not found');
      }

      const project = projectData[0];
      const currentBackgrounds = project.backgrounds || {};
      
      // Get background store to retrieve deleted background data
      const backgroundStore = useBackgroundStore.getState();
      
      // Restore each background from localStorage if available
      backgroundIds.forEach(backgroundId => {
        const storedBackground = localStorage.getItem(`kanvas-background-${backgroundId}`);
        if (storedBackground) {
          try {
            currentBackgrounds[backgroundId] = JSON.parse(storedBackground);
            console.log(`[SoftDeleteService] Restored background ${backgroundId} from localStorage`);
          } catch (parseError) {
            console.warn(`[SoftDeleteService] Failed to parse background ${backgroundId}:`, parseError);
          }
        } else {
          console.warn(`[SoftDeleteService] Background ${backgroundId} not found in localStorage, skipping restore`);
        }
      });

      // Update project metadata with restored backgrounds
      const { error } = await supabase.rpc('save_project', {
        p_project_id: projectId,
        p_backgrounds: currentBackgrounds
      });

      if (error) {
        console.error('[SoftDeleteService] Failed to restore backgrounds:', error);
        throw error;
      }

      console.log('[SoftDeleteService] Successfully restored backgrounds');
    } catch (error) {
      console.error('[SoftDeleteService] Error restoring backgrounds:', error);
      throw error;
    }
  }

  // Flush pending deletions immediately
  async flushBatch(projectId: string): Promise<void> {
    const batch = this.pendingDeletions.get(projectId);
    if (!batch || this.getBatchSize(batch) === 0) return;

    console.log(`[SoftDeleteService] Flushing deletion batch for project ${projectId}`);

    try {
      await this.processBatch(batch);
      this.pendingDeletions.delete(projectId);
      console.log('[SoftDeleteService] Successfully flushed deletion batch');
    } catch (error) {
      console.error('[SoftDeleteService] Failed to flush deletion batch:', error);
      throw error;
    }
  }

  // Flush all pending deletions
  async flushAllBatches(): Promise<void> {
    const projectIds = Array.from(this.pendingDeletions.keys());
    await Promise.all(projectIds.map(id => this.flushBatch(id)));
  }

  // Get pending deletion count
  getPendingDeletionCount(projectId: string): number {
    const batch = this.pendingDeletions.get(projectId);
    return batch ? this.getBatchSize(batch) : 0;
  }

  // Private methods

  private getOrCreateBatch(projectId: string): DeletionBatch {
    let batch = this.pendingDeletions.get(projectId);
    if (!batch) {
      batch = {
        projectId,
        assetIds: [],
        tagIds: [],
        backgroundIds: [],
        timestamp: Date.now()
      };
      this.pendingDeletions.set(projectId, batch);
    }
    return batch;
  }

  private getBatchSize(batch: DeletionBatch): number {
    return batch.assetIds.length + batch.tagIds.length + batch.backgroundIds.length;
  }

  private scheduleBatchFlush(): void {
    if (this.batchFlushTimer) return;

    this.batchFlushTimer = setTimeout(async () => {
      try {
        await this.flushAllBatches();
      } catch (error) {
        console.error('[SoftDeleteService] Error in scheduled batch flush:', error);
      } finally {
        this.batchFlushTimer = null;
      }
    }, this.BATCH_FLUSH_MS);
  }

  private async processBatch(batch: DeletionBatch): Promise<void> {
    const { projectId, assetIds, tagIds, backgroundIds } = batch;

    // Process assets in batches
    if (assetIds.length > 0) {
      await this.processAssetDeletions(projectId, assetIds);
    }

    // Process tag deletions
    if (tagIds.length > 0) {
      await this.processTagDeletions(projectId, tagIds);
    }

    // Process background deletions
    if (backgroundIds.length > 0) {
      await this.processBackgroundDeletions(projectId, backgroundIds);
    }
  }

  private async processAssetDeletions(projectId: string, assetIds: string[]): Promise<void> {
    // Process in chunks to avoid payload size limits
    const chunkSize = 50;
    for (let i = 0; i < assetIds.length; i += chunkSize) {
      const chunk = assetIds.slice(i, i + chunkSize);
      
      // Mark assets as deleted using save_assets with deleted_at
      const assetsToDelete = chunk.map(assetId => ({
        asset_id: assetId,
        deleted_at: new Date().toISOString()
      }));

      const { error } = await supabase.rpc('save_assets', {
        p_project_id: projectId,
        p_assets: assetsToDelete
      });

      if (error) {
        console.error('[SoftDeleteService] Failed to delete assets chunk:', error);
        throw error;
      }
    }
  }

  private async processTagDeletions(projectId: string, tagIds: string[]): Promise<void> {
    // Tags are stored in project metadata, so we need to update the project
    const tagStore = useTagStore.getState();
    const currentTags = { ...tagStore.tags };

    // Remove tags from metadata
    tagIds.forEach(tagId => {
      delete currentTags[tagId];
    });

    const { error } = await supabase.rpc('save_project', {
      p_project_id: projectId,
      p_tags_config: currentTags
    });

    if (error) {
      console.error('[SoftDeleteService] Failed to delete tags:', error);
      throw error;
    }
  }

  private async processBackgroundDeletions(projectId: string, backgroundIds: string[]): Promise<void> {
    // Backgrounds are stored in project metadata, need to load current backgrounds first
    const { data: projectData, error: loadError } = await supabase
      .rpc('load_project', {
        p_project_id: projectId
      });

    if (loadError || !projectData || projectData.length === 0) {
      console.warn('[SoftDeleteService] Failed to load project for background deletion, may not exist yet');
      // Don't throw - backgrounds may not exist yet for new projects
      return;
    }

    const project = projectData[0];
    const currentBackgrounds = project.backgrounds || {};

    // Remove backgrounds from metadata
    backgroundIds.forEach(backgroundId => {
      delete currentBackgrounds[backgroundId];
    });

    const { error } = await supabase.rpc('save_project', {
      p_project_id: projectId,
      p_backgrounds: currentBackgrounds
    });

    if (error) {
      console.error('[SoftDeleteService] Failed to delete backgrounds:', error);
      throw error;
    }
  }
}

export const softDeleteService = SoftDeleteService.getInstance();
