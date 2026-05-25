import { createId } from '@/utils/id';
import { db, type GlobalTag, type ProjectTag } from '@/storage/indexeddb';

export type LocalTag = ProjectTag | GlobalTag;

export class TagPersistence {
  static async loadProjectTags(projectId: string): Promise<ProjectTag[]> {
    return await db.getProjectTags(projectId);
  }

  static async loadGlobalTags(userId: string): Promise<GlobalTag[]> {
    return await db.getGlobalTags(userId);
  }

  static async createProjectTag(
    projectId: string,
    tag: Omit<ProjectTag, 'id' | 'projectId' | 'scope' | 'createdAt' | 'updatedAt'>
  ): Promise<ProjectTag> {
    const now = new Date().toISOString();
    const projectTag: ProjectTag = {
      id: createId(),
      projectId,
      name: tag.name,
      color: tag.color,
      scope: 'project',
      createdAt: now,
      updatedAt: now,
    };

    await db.createProjectTag(projectTag);
    return projectTag;
  }

  static async createGlobalTag(
    userId: string,
    tag: Omit<GlobalTag, 'id' | 'userId' | 'scope' | 'createdAt' | 'updatedAt'>
  ): Promise<GlobalTag> {
    const now = new Date().toISOString();
    const globalTag: GlobalTag = {
      id: createId(),
      userId,
      name: tag.name,
      color: tag.color,
      scope: 'global',
      createdAt: now,
      updatedAt: now,
    };

    await db.createGlobalTag(globalTag);
    return globalTag;
  }

  static async updateTag(tag: LocalTag, updates: Partial<Pick<LocalTag, 'name' | 'color'>>): Promise<void> {
    if (tag.scope === 'global') {
      await db.updateGlobalTag(tag.id, updates);
      return;
    }

    await db.updateProjectTag(tag.id, updates);
  }

  static async deleteProjectTag(projectId: string, tagId: string): Promise<void> {
    await db.transaction('rw', db.projectTags, db.assets, async () => {
      await db.deleteProjectTag(tagId);

      const assets = await db.getProjectAssets(projectId);
      for (const asset of assets) {
        const tags = (asset.metadata.tags || []).filter(id => id !== tagId);
        if (tags.length !== (asset.metadata.tags || []).length) {
          await db.updateAsset(asset.id, {
            ...asset,
            metadata: {
              ...asset.metadata,
              tags,
              updatedAt: new Date().toISOString(),
              version: (asset.metadata.version || 0) + 1,
            },
          });
        }
      }
    });
  }

  static async deleteGlobalTag(userId: string, tagId: string): Promise<void> {
    await db.transaction('rw', db.globalTags, db.assets, async () => {
      await db.deleteGlobalTag(tagId);

      const projects = await db.getUserProjects(userId);
      for (const project of projects) {
        const assets = await db.getProjectAssets(project.id);
        for (const asset of assets) {
          const tags = (asset.metadata.tags || []).filter(id => id !== tagId);
          if (tags.length !== (asset.metadata.tags || []).length) {
            await db.updateAsset(asset.id, {
              ...asset,
              metadata: {
                ...asset.metadata,
                tags,
                updatedAt: new Date().toISOString(),
                version: (asset.metadata.version || 0) + 1,
              },
            });
          }
        }
      }
    });
  }
}

export const tagPersistence = TagPersistence;
