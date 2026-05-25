/**
 * SUPABASE STORAGE INTEGRATION
 * 
 * Handles all cloud storage operations with proper error handling
 * and follows the unified persistence architecture.
 * 
 * 🔒 CRITICAL: Must maintain zone separation principles
 * 
 * Updated to use TEXT-based IDs (v3 schema) instead of UUIDs
 * New ID format: {prefix}_{userShortId}_{timestampBase36}_{randomChars}
 */

import { USE_SUPABASE } from '@/config/features';
import { supabase } from '@/lib/supabase';
import { SupabaseClient } from '@supabase/supabase-js';
import { Asset } from '@/types/Asset';
import { Project } from '@/storage/indexeddb';
import { FileBlob } from '@/storage/indexeddb';

/**
 * Cloud storage operations for assets
 */
export class SupabaseStorage {
  private client: SupabaseClient;

  constructor() {
    this.client = supabase;
  }

  private assertEnabled(action: string): void {
    if (!USE_SUPABASE) {
      console.warn(`Supabase disabled; skipping ${action}`);
    }
  }

  /**
   * Upsert asset in cloud storage. This uses the v3 schema with TEXT-based IDs.
   * This is the sync primitive for both local creates and local updates because
   * queued updates can outlive reloads.
   */
  async upsertAsset(asset: Asset): Promise<void> {
    if (!USE_SUPABASE) {
      this.assertEnabled('upsertAsset');
      return;
    }

    try {
      const { error } = await this.client
        .from('assets_v3')
        .upsert({
          id: asset.id,
          project_id: asset.projectId,
          parent_id: asset.parentId || null,
          layout: asset.layout,
          content: asset.content,
          style: asset.style,
          behavior: asset.behavior,
          metadata: asset.metadata,
          updated_at: new Date().toISOString(),
          deleted_at: null,
        }, {
          onConflict: 'id',
        });

      if (error) {
        throw new Error(`Failed to upsert asset: ${error.message}`);
      }
    } catch (error) {
      console.error('Asset upsert failed:', error);
      throw error;
    }
  }

  /**
   * Create asset in cloud storage (v3 schema with TEXT-based IDs)
   */
  async createAsset(asset: Asset): Promise<void> {
    if (!USE_SUPABASE) {
      this.assertEnabled('createAsset');
      return;
    }

    try {
      const { error } = await this.client
        .from('assets_v3')
        .insert({
          id: asset.id,
          project_id: asset.projectId,
          parent_id: asset.parentId,
          layout: asset.layout,
          content: asset.content,
          style: asset.style,
          behavior: asset.behavior,
          metadata: asset.metadata,
        });

      if (error) {
        throw new Error(`Failed to create asset: ${error.message}`);
      }
    } catch (error) {
      console.error('Asset creation failed:', error);
      throw error;
    }
  }

  /**
   * Update asset in cloud storage (v3 schema with TEXT-based IDs)
   */
  async updateAsset(asset: Asset): Promise<void> {
    if (!USE_SUPABASE) {
      this.assertEnabled('updateAsset');
      return;
    }

    try {
      const { error } = await this.client
        .from('assets_v3')
        .update({
          parent_id: asset.parentId,
          layout: asset.layout,
          content: asset.content,
          style: asset.style,
          behavior: asset.behavior,
          metadata: asset.metadata,
          updated_at: new Date().toISOString(),
        })
        .eq('id', asset.id)
        .eq('project_id', asset.projectId);

      if (error) {
        throw new Error(`Failed to update asset: ${error.message}`);
      }
    } catch (error) {
      console.error('Asset update failed:', error);
      throw error;
    }
  }

  /**
   * Delete asset from cloud storage (v3 schema with TEXT-based IDs)
   */
  async deleteAsset(assetId: string, projectId: string): Promise<void> {
    if (!USE_SUPABASE) {
      this.assertEnabled('deleteAsset');
      return;
    }

    try {
      const { error } = await this.client
        .from('assets_v3')
        .delete()
        .eq('id', assetId)
        .eq('project_id', projectId);

      if (error) {
        throw new Error(`Failed to delete asset: ${error.message}`);
      }
    } catch (error) {
      console.error('Asset deletion failed:', error);
      throw error;
    }
  }

  /**
   * Get project assets from cloud storage (v3 schema with TEXT-based IDs)
   */
  async getProjectAssets(projectId: string): Promise<Asset[]> {
    if (!USE_SUPABASE) {
      this.assertEnabled('getProjectAssets');
      return [];
    }

    try {
      const { data, error } = await this.client
        .from('assets_v3')
        .select('*')
        .eq('project_id', projectId)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch assets: ${error.message}`);
      }

      return data?.map(this.mapDbAssetToAsset) || [];
    } catch (error) {
      console.error('Failed to fetch project assets:', error);
      throw error;
    }
  }

  /**
   * Create project in cloud storage (v3 schema with TEXT-based IDs)
   */
  async createProject(project: Project): Promise<void> {
    if (!USE_SUPABASE) {
      this.assertEnabled('createProject');
      return;
    }

    try {
      const { error } = await this.client
        .from('projects_v3')
        .insert({
          id: project.id,
          user_id: project.userId,
          name: project.name,
          description: project.description,
          settings: project.settings,
          version: project.version,
        });

      if (error) {
        throw new Error(`Failed to create project: ${error.message}`);
      }
    } catch (error) {
      console.error('Project creation failed:', error);
      throw error;
    }
  }

  /**
   * Update project in cloud storage (v3 schema with TEXT-based IDs)
   */
  async updateProject(project: Project): Promise<void> {
    if (!USE_SUPABASE) {
      this.assertEnabled('updateProject');
      return;
    }

    try {
      const { error } = await this.client
        .from('projects_v3')
        .update({
          name: project.name,
          description: project.description,
          settings: project.settings,
          version: project.version,
          last_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', project.id)
        .eq('user_id', project.userId);

      if (error) {
        throw new Error(`Failed to update project: ${error.message}`);
      }
    } catch (error) {
      console.error('Project update failed:', error);
      throw error;
    }
  }

  /**
   * Delete project in cloud storage (v3 schema with TEXT-based IDs)
   */
  async deleteProject(projectId: string): Promise<void> {
    if (!USE_SUPABASE) {
      this.assertEnabled('deleteProject');
      return;
    }

    try {
      const { error } = await this.client
        .from('projects_v3')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', projectId);

      if (error) {
        throw new Error(`Failed to delete project: ${error.message}`);
      }
    } catch (error) {
      console.error('Project deletion failed:', error);
      throw error;
    }
  }

  /**
   * Get user projects from cloud storage (v3 schema with TEXT-based IDs)
   */
  async getUserProjects(userId: string): Promise<Project[]> {
    if (!USE_SUPABASE) {
      this.assertEnabled('getUserProjects');
      return [];
    }

    try {
      const { data, error } = await this.client
        .from('projects_v3')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch projects: ${error.message}`);
      }

      return data?.map(this.mapDbProjectToProject) || [];
    } catch (error) {
      console.error('Failed to fetch user projects:', error);
      throw error;
    }
  }

  /**
   * Upload file to R2 storage
   */
  async uploadFile(file: File, storageKey: string): Promise<string> {
    if (!USE_SUPABASE) {
      this.assertEnabled('uploadFile');
      return storageKey;
    }

    try {
      const { data, error } = await this.client.storage
        .from('assets')
        .upload(storageKey, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (error) {
        throw new Error(`Failed to upload file: ${error.message}`);
      }

      // Get public URL
      const { data: { publicUrl } } = this.client.storage
        .from('assets')
        .getPublicUrl(storageKey);

      return publicUrl;
    } catch (error) {
      console.error('File upload failed:', error);
      throw error;
    }
  }

  /**
   * Delete file from R2 storage
   */
  async deleteFile(storageKey: string): Promise<void> {
    if (!USE_SUPABASE) {
      this.assertEnabled('deleteFile');
      return;
    }

    try {
      const { error } = await this.client.storage
        .from('assets')
        .remove([storageKey]);

      if (error) {
        throw new Error(`Failed to delete file: ${error.message}`);
      }
    } catch (error) {
      console.error('File deletion failed:', error);
      throw error;
    }
  }

  /**
   * Get file info from R2 storage
   */
  async getFileInfo(storageKey: string): Promise<{
    size: number;
    contentType: string;
    lastModified: string;
  } | null> {
    if (!USE_SUPABASE) {
      this.assertEnabled('getFileInfo');
      return null;
    }

    try {
      const { data, error } = await this.client.storage
        .from('assets')
        .list('', {
          search: storageKey,
          limit: 1,
        });

      if (error || !data || data.length === 0) {
        return null;
      }

      const file = data[0];
      return {
        size: (file as any).size || 0,
        contentType: (file as any).content_type || 'application/octet-stream',
        lastModified: (file as any).last_modified || new Date().toISOString(),
      };
    } catch (error) {
      console.error('Failed to get file info:', error);
      return null;
    }
  }

  /**
   * Create multiple assets in batch (v3 schema with TEXT-based IDs)
   */
  async createAssetsBatch(assets: Asset[]): Promise<void> {
    if (!USE_SUPABASE) {
      this.assertEnabled('createAssetsBatch');
      return;
    }

    if (assets.length === 0) return;

    try {
      const payload = assets.map(asset => ({
        id: asset.id,
        project_id: asset.projectId,
        parent_id: asset.parentId,
        layout: asset.layout,
        content: asset.content,
        style: asset.style,
        behavior: asset.behavior,
        metadata: asset.metadata,
      }));

      const { error } = await this.client
        .from('assets_v3')
        .insert(payload);

      if (error) {
        throw new Error(`Failed to create assets batch: ${error.message}`);
      }
    } catch (error) {
      console.error('Batch asset creation failed:', error);
      throw error;
    }
  }

  /**
   * Update multiple assets in batch
   */
  async updateAssetsBatch(assets: Asset[]): Promise<void> {
    if (!USE_SUPABASE) {
      this.assertEnabled('updateAssetsBatch');
      return;
    }

    if (assets.length === 0) return;

    try {
      // Process in chunks to avoid request size limits
      const chunkSize = 50;
      const chunks = [];
      for (let i = 0; i < assets.length; i += chunkSize) {
        chunks.push(assets.slice(i, i + chunkSize));
      }

      for (const chunk of chunks) {
        const operations = chunk.map(asset => 
          this.client.rpc('update_asset', {
            asset_id: asset.id,
            project_id: asset.projectId,
            parent_id: asset.parentId,
            asset_layout: asset.layout,
            asset_content: asset.content,
            asset_style: asset.style,
            asset_behavior: asset.behavior,
            asset_metadata: asset.metadata,
          })
        );

        const { error } = await this.client.rpc('batch_update_assets', {
          operations: chunk.map(asset => ({
            id: asset.id,
            project_id: asset.projectId,
            parent_id: asset.parentId,
            layout: asset.layout,
            content: asset.content,
            style: asset.style,
            behavior: asset.behavior,
            metadata: asset.metadata,
            updated_at: new Date().toISOString(),
          }))
        });

        if (error) {
          throw new Error(`Failed to update assets batch: ${error.message}`);
        }
      }
    } catch (error) {
      console.error('Batch asset update failed:', error);
      throw error;
    }
  }

  /**
   * Delete multiple assets in batch (v3 schema with TEXT-based IDs)
   */
  async deleteAssetsBatch(assetIds: string[], projectId: string): Promise<void> {
    if (!USE_SUPABASE) {
      this.assertEnabled('deleteAssetsBatch');
      return;
    }

    if (assetIds.length === 0) return;

    try {
      const { error } = await this.client
        .from('assets_v3')
        .delete()
        .in('id', assetIds)
        .eq('project_id', projectId);

      if (error) {
        throw new Error(`Failed to delete assets batch: ${error.message}`);
      }
    } catch (error) {
      console.error('Batch asset deletion failed:', error);
      throw error;
    }
  }

  /**
   * Get project with full asset tree (v3 schema with TEXT-based IDs)
   */
  async getProjectWithAssets(projectId: string): Promise<{
    project: Project;
    assets: Asset[];
    files: Array<{
      id: string;
      assetId: string;
      storageKey: string;
      mimeType: string;
      sizeBytes: number;
      cloudUrl?: string;
    }>;
  }> {
    if (!USE_SUPABASE) {
      this.assertEnabled('getProjectWithAssets');
      throw new Error('Supabase is disabled; cannot fetch project with assets');
    }

    try {
      // Get project
      const { data: projectData, error: projectError } = await this.client
        .from('projects_v3')
        .select('*')
        .eq('id', projectId)
        .is('deleted_at', null)
        .single();

      if (projectError) {
        throw new Error(`Failed to fetch project: ${projectError.message}`);
      }

      // Get assets
      const { data: assetsData, error: assetsError } = await this.client
        .from('assets_v3')
        .select('*')
        .eq('project_id', projectId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });

      if (assetsError) {
        throw new Error(`Failed to fetch assets: ${assetsError.message}`);
      }

      // Get files
      const { data: filesData, error: filesError } = await this.client
        .from('files_v3')
        .select('*')
        .eq('project_id', projectId);

      if (filesError) {
        throw new Error(`Failed to fetch files: ${filesError.message}`);
      }

      return {
        project: this.mapDbProjectToProject(projectData),
        assets: assetsData?.map(this.mapDbAssetToAsset) || [],
        files: filesData || [],
      };
    } catch (error) {
      console.error('Failed to fetch project with assets:', error);
      throw error;
    }
  }

  /**
   * Sync project state (assets + files)
   */
  async syncProjectState(projectId: string): Promise<{
    assets: { created: Asset[]; updated: Asset[]; deleted: string[] };
    files: { uploaded: Array<{ id: string; url: string }>; deleted: string[] };
  }> {
    if (!USE_SUPABASE) {
      this.assertEnabled('syncProjectState');
      return {
        assets: { created: [], updated: [], deleted: [] },
        files: { uploaded: [], deleted: [] },
      };
    }

    try {
      // This would implement delta sync based on last_sync_at
      // For now, return full sync
      const { assets, files } = await this.getProjectWithAssets(projectId);

      return {
        assets: {
          created: assets,
          updated: [],
          deleted: [],
        },
        files: {
          uploaded: files.map(f => ({ id: f.id, url: f.cloudUrl || '' })),
          deleted: [],
        },
      };
    } catch (error) {
      console.error('Project state sync failed:', error);
      throw error;
    }
  }

  /**
   * Batch file operations
   */
  async uploadFilesBatch(files: Array<{
    file: File;
    storageKey: string;
  }>): Promise<Array<{ storageKey: string; url: string }>> {
    if (!USE_SUPABASE) {
      this.assertEnabled('uploadFilesBatch');
      return [];
    }

    if (files.length === 0) return [];

    try {
      const results = await Promise.allSettled(
        files.map(({ file, storageKey }) => this.uploadFile(file, storageKey))
      );

      const successes = results
        .filter((result): result is PromiseFulfilledResult<string> => result.status === 'fulfilled')
        .map((result, index) => ({
          storageKey: files[index].storageKey,
          url: result.value,
        }));

      const failures = results
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected');

      if (failures.length > 0) {
        console.warn(`${failures.length} files failed to upload:`, failures);
      }

      return successes;
    } catch (error) {
      console.error('Batch file upload failed:', error);
      throw error;
    }
  }

  /**
   * Delete multiple files
   */
  async deleteFilesBatch(storageKeys: string[]): Promise<void> {
    if (!USE_SUPABASE) {
      this.assertEnabled('deleteFilesBatch');
      return;
    }

    if (storageKeys.length === 0) return;

    try {
      const { error } = await this.client.storage
        .from('assets')
        .remove(storageKeys);

      if (error) {
        throw new Error(`Failed to delete files batch: ${error.message}`);
      }
    } catch (error) {
      console.error('Batch file deletion failed:', error);
      throw error;
    }
  }

  /**
   * Get file metadata in batch
   */
  async getFilesMetadataBatch(storageKeys: string[]): Promise<Array<{
    storageKey: string;
    size: number;
    contentType: string;
    lastModified: string;
  } | null>> {
    if (!USE_SUPABASE) {
      this.assertEnabled('getFilesMetadataBatch');
      return [];
    }

    if (storageKeys.length === 0) return [];

    try {
      const results = await Promise.allSettled(
        storageKeys.map(key => this.getFileInfo(key))
      );

      return results.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value ? {
            storageKey: storageKeys[index],
            ...result.value,
          } : null;
        }
        return null;
      });
    } catch (error) {
      console.error('Batch file metadata fetch failed:', error);
      throw error;
    }
  }

  /**
   * Test connection to Supabase (v3 schema with TEXT-based IDs)
   */
  async testConnection(): Promise<boolean> {
    if (!USE_SUPABASE) {
      this.assertEnabled('testConnection');
      return false;
    }

    try {
      const { data, error } = await this.client
        .from('projects_v3')
        .select('id')
        .limit(1);

      return !error;
    } catch {
      return false;
    }
  }

  /**
   * Map database asset to canonical Asset interface
   */
  private mapDbAssetToAsset(dbAsset: any): Asset {
    return {
      id: dbAsset.id,
      projectId: dbAsset.project_id,
      parentId: dbAsset.parent_id,
      layout: dbAsset.layout,
      content: dbAsset.content,
      style: dbAsset.style,
      behavior: dbAsset.behavior,
      metadata: dbAsset.metadata,
    };
  }

  /**
   * Map database project to Project interface
   */
  private mapDbProjectToProject(dbProject: any): Project {
    return {
      id: dbProject.id,
      userId: dbProject.user_id,
      name: dbProject.name,
      description: dbProject.description,
      settings: dbProject.settings,
      version: dbProject.version,
      lastSyncAt: dbProject.last_sync_at,
      createdAt: dbProject.created_at,
      updatedAt: dbProject.updated_at,
      deletedAt: dbProject.deleted_at,
    };
  }
}

// Singleton instance
export const supabaseStorage = new SupabaseStorage();
