import { create } from 'zustand';
import { tagPersistence, type LocalTag } from '@/persistence/tags';
import type { GlobalTag, ProjectTag } from '@/storage/indexeddb';
import { useKanvasStore } from './kanvasStore';

type TagRecord = Record<string, LocalTag>;
type TagScope = 'project' | 'global';

interface CreateTagInput {
  name: string;
  color?: string;
  scope?: TagScope;
}

interface TagStoreState {
  tags: TagRecord;
  projectTags: TagRecord;
  globalTags: TagRecord;
  popularTags: string[];
  activeFilters: Set<string>;
  currentProjectId: string | null;
  currentUserId: string;

  hydrateTags: (projectTags: ProjectTag[], globalTags: GlobalTag[], projectId: string | null, userId?: string) => void;
  loadForProject: (projectId: string, userId?: string) => Promise<void>;
  clearTags: () => void;
  createTag: (tag: CreateTagInput) => string;
  addTag: (tag: CreateTagInput & { id: string; scope?: TagScope }) => void;
  deleteTag: (tagId: string) => Promise<void>;
  removeTag: (tagId: string) => Promise<void>;
  updateTag: (tagId: string, updates: Partial<LocalTag>) => Promise<void>;
  getTag: (tagId: string) => LocalTag | undefined;
  getAllTags: () => LocalTag[];
  getPopularTags: () => string[];
  updatePopularTags: () => void;
  addTagToAsset: (assetId: string, tagId: string) => Promise<void>;
  removeTagFromAsset: (assetId: string, tagId: string) => Promise<void>;
  getAssetTags: (assetId: string) => LocalTag[];
  isAssetFiltered: (assetId: string) => boolean;
  toggleFilter: (tagId: string) => void;
  clearFilters: () => void;
}

const DEFAULT_USER_ID = 'local-user';

const buildTagMaps = (projectTags: ProjectTag[], globalTags: GlobalTag[]) => {
  const projectTagMap = Object.fromEntries(projectTags.map(tag => [tag.id, tag]));
  const globalTagMap = Object.fromEntries(globalTags.map(tag => [tag.id, tag]));

  return {
    projectTagMap,
    globalTagMap,
    merged: {
      ...globalTagMap,
      ...projectTagMap,
    },
  };
};

export const useTagStore = create<TagStoreState>()((set, get) => ({
  tags: {},
  projectTags: {},
  globalTags: {},
  popularTags: [],
  activeFilters: new Set(),
  currentProjectId: null,
  currentUserId: DEFAULT_USER_ID,

  hydrateTags: (projectTags, globalTags, projectId, userId = DEFAULT_USER_ID) => {
    const { projectTagMap, globalTagMap, merged } = buildTagMaps(projectTags, globalTags);
    set({
      tags: merged,
      projectTags: projectTagMap,
      globalTags: globalTagMap,
      currentProjectId: projectId,
      currentUserId: userId,
    });
    get().updatePopularTags();
  },

  loadForProject: async (projectId, userId = DEFAULT_USER_ID) => {
    const [projectTags, globalTags] = await Promise.all([
      tagPersistence.loadProjectTags(projectId),
      tagPersistence.loadGlobalTags(userId),
    ]);

    get().hydrateTags(projectTags, globalTags, projectId, userId);
  },

  clearTags: () => {
    set({
      tags: {},
      projectTags: {},
      globalTags: {},
      popularTags: [],
      activeFilters: new Set(),
      currentProjectId: null,
    });
  },

  createTag: (tag) => {
    const scope = tag.scope || 'project';
    const currentProjectId = get().currentProjectId;
    const currentUserId = get().currentUserId;
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    const nextTag: LocalTag = scope === 'global'
      ? {
          id,
          userId: currentUserId,
          name: tag.name.trim(),
          color: tag.color,
          scope: 'global',
          createdAt: now,
          updatedAt: now,
        }
      : {
          id,
          projectId: currentProjectId || 'default-project',
          name: tag.name.trim(),
          color: tag.color,
          scope: 'project',
          createdAt: now,
          updatedAt: now,
        };

    set(state => {
      const tags = { ...state.tags, [id]: nextTag };
      const scopedKey = scope === 'global' ? 'globalTags' : 'projectTags';
      return {
        tags,
        [scopedKey]: {
          ...state[scopedKey],
          [id]: nextTag,
        },
      } as Partial<TagStoreState>;
    });

    void (scope === 'global'
      ? tagPersistence.createGlobalTag(currentUserId, { name: nextTag.name, color: nextTag.color })
      : tagPersistence.createProjectTag(currentProjectId || 'default-project', { name: nextTag.name, color: nextTag.color }));

    get().updatePopularTags();
    return id;
  },

  addTag: (tag) => {
    get().createTag(tag);
  },

  deleteTag: async (tagId) => {
    const tag = get().tags[tagId];
    if (!tag) return;

    if (tag.scope === 'global') {
      await tagPersistence.deleteGlobalTag(get().currentUserId, tagId);
    } else {
      await tagPersistence.deleteProjectTag(tag.projectId, tagId);
    }

    set(state => {
      const tags = { ...state.tags };
      const projectTags = { ...state.projectTags };
      const globalTags = { ...state.globalTags };
      delete tags[tagId];
      delete projectTags[tagId];
      delete globalTags[tagId];
      return { tags, projectTags, globalTags };
    });
    get().updatePopularTags();
  },

  removeTag: async (tagId) => {
    await get().deleteTag(tagId);
  },

  updateTag: async (tagId, updates) => {
    const tag = get().tags[tagId];
    if (!tag) return;

    const nextTag = {
      ...tag,
      ...updates,
      updatedAt: new Date().toISOString(),
    } as LocalTag;

    await tagPersistence.updateTag(tag, {
      name: nextTag.name,
      color: nextTag.color,
    });

    set(state => {
      const tags = { ...state.tags, [tagId]: nextTag };
      if (tag.scope === 'global') {
        return {
          tags,
          globalTags: { ...state.globalTags, [tagId]: nextTag },
        };
      }

      return {
        tags,
        projectTags: { ...state.projectTags, [tagId]: nextTag },
      };
    });
    get().updatePopularTags();
  },

  getTag: (tagId) => get().tags[tagId],
  getAllTags: () => Object.values(get().tags),
  getPopularTags: () => get().popularTags,

  updatePopularTags: () => {
    const assets = Array.from(useKanvasStore.getState().assets.values());
    const tags = Object.values(get().tags)
      .map(tag => ({
        ...tag,
        count: assets.filter(asset => asset.metadata?.tags?.includes(tag.id)).length,
      }))
      .filter(tag => tag.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map(tag => tag.name);

    set({ popularTags: tags });
  },

  addTagToAsset: async (assetId, tagId) => {
    const asset = useKanvasStore.getState().getAsset(assetId);
    if (!asset) return;

    const tags = Array.from(new Set([...(asset.metadata.tags || []), tagId]));
    await useKanvasStore.getState().updateAsset(assetId, {
      metadata: {
        ...asset.metadata,
        tags,
      },
    });
    get().updatePopularTags();
  },

  removeTagFromAsset: async (assetId, tagId) => {
    const asset = useKanvasStore.getState().getAsset(assetId);
    if (!asset) return;

    await useKanvasStore.getState().updateAsset(assetId, {
      metadata: {
        ...asset.metadata,
        tags: (asset.metadata.tags || []).filter(id => id !== tagId),
      },
    });
    get().updatePopularTags();
  },

  getAssetTags: (assetId) => {
    const asset = useKanvasStore.getState().getAsset(assetId);
    if (!asset) return [];
    return (asset.metadata.tags || [])
      .map(tagId => get().tags[tagId])
      .filter(Boolean);
  },

  isAssetFiltered: (assetId) => {
    const filters = get().activeFilters;
    if (filters.size === 0) return true;
    const asset = useKanvasStore.getState().getAsset(assetId);
    if (!asset) return false;
    return (asset.metadata.tags || []).some(tagId => filters.has(tagId));
  },

  toggleFilter: (tagId) => {
    set(state => {
      const activeFilters = new Set(state.activeFilters);
      if (activeFilters.has(tagId)) {
        activeFilters.delete(tagId);
      } else {
        activeFilters.add(tagId);
      }
      return { activeFilters };
    });
  },

  clearFilters: () => set({ activeFilters: new Set() }),
}));
