import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import Index from '@/pages/Index';
import { useBookStore } from '@/stores/bookStoreSimple';
import { useAssetStore } from '@/stores/assetStore';
import { useTagStore } from '@/stores/tagStore';
import { useBackgroundStore } from '@/stores/backgroundStore';
import { documentMutationService } from '@/services/DocumentMutationService';
import { listProjects, createProject, deleteProject } from '@/services/ProjectService';
import { supabase } from '@/lib/supabase';
import type { Asset } from '@/components/AssetItem';
import type { BackgroundConfig } from '@/types/background';

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'test-token' } }
      })
    },
    rpc: vi.fn()
  }
}));

// Mock services
vi.mock('@/services/ProjectService', () => ({
  listProjects: vi.fn().mockResolvedValue([]),
  createProject: vi.fn().mockResolvedValue('test-project-id'),
  deleteProject: vi.fn().mockResolvedValue(true)
}));

vi.mock('@/services/DocumentMutationService', () => ({
  documentMutationService: {
    loadDocument: vi.fn(),
    createProject: vi.fn(),
    setProjectId: vi.fn(),
    saveGlobalBackgrounds: vi.fn(),
    getCurrentProjectId: vi.fn().mockReturnValue(null),
    setupAuthListener: vi.fn(),
    setupBeforeUnloadHandler: vi.fn(),
    removeBeforeUnloadHandler: vi.fn()
  }
}));

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>
    <TooltipProvider>
      <BrowserRouter>
        {children}
        <Toaster />
        <Sonner />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

describe('Project CRUD Operations', () => {
  beforeEach(() => {
    // Clear all stores - use available methods
    const bookStore = useBookStore.getState();
    const assetStore = useAssetStore.getState();
    const tagStore = useTagStore.getState();
    const backgroundStore = useBackgroundStore.getState();
    
    // Clear world data where available
    tagStore.clearWorldData();
    assetStore.clearWorldData();
    
    // Reset mocks and set up default implementations
    vi.clearAllMocks();
    
    // Set up default mock implementations
    (listProjects as any).mockResolvedValue([]);
    (createProject as any).mockResolvedValue('test-project-id');
    (deleteProject as any).mockResolvedValue(true);
  });

  describe('Project Creation', () => {
    it('should create a new project successfully', async () => {
      const mockProjectId = 'test-project-id';
      (createProject as any).mockResolvedValue(mockProjectId);
      (documentMutationService.createProject as any).mockResolvedValue(true);

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>
      );

      // Wait for app to load (increased timeout for splash screen)
      await waitFor(() => {
        expect(screen.getByText(/Create New World/i)).toBeInTheDocument();
      }, { timeout: 5000 });

      // Click create world button
      const createButton = screen.getByText(/Create New World/i);
      fireEvent.click(createButton);

      // Wait for dialog to open
      await waitFor(() => {
        expect(screen.getByText(/Create New World/i, { selector: 'h2' })).toBeInTheDocument();
      }, { timeout: 3000 });

      // Fill in project details
      const titleInput = screen.getByLabelText(/Title/i);
      fireEvent.change(titleInput, { target: { value: 'Test Project' } });

      // Submit form
      const submitButton = screen.getByText(/Create/i);
      fireEvent.click(submitButton);

      // Verify project creation was called
      await waitFor(() => {
        expect(createProject).toHaveBeenCalledWith('Test Project');
      }, { timeout: 3000 });
      await waitFor(() => {
        expect(documentMutationService.createProject).toHaveBeenCalled();
      }, { timeout: 3000 });
    });

    it('should handle project creation failure', async () => {
      (createProject as any).mockRejectedValue(new Error('Creation failed'));

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText(/Create New World/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/Create New World/i));

      await waitFor(() => {
        expect(screen.getByText(/Create New World/i, { selector: 'h2' })).toBeInTheDocument();
      });

      const titleInput = screen.getByLabelText(/Title/i);
      fireEvent.change(titleInput, { target: { value: 'Test Project' } });

      const submitButton = screen.getByText(/Create/i);
      fireEvent.click(submitButton);

      // Should show error message
      await waitFor(() => {
        expect(screen.getByText(/Failed to create project/i)).toBeInTheDocument();
      });
    });
  });

  describe('Project Loading', () => {
    it('should load existing projects on mount', async () => {
      const mockProjects = [
        {
          id: 'project-1',
          name: 'Test Project 1',
          color: '#3b82f6',
          asset_count: 5,
          updated_at: '2024-01-01T00:00:00Z'
        },
        {
          id: 'project-2',
          name: 'Test Project 2',
          color: '#10b981',
          asset_count: 3,
          updated_at: '2024-01-02T00:00:00Z'
        }
      ];
      (listProjects as any).mockResolvedValue(mockProjects);

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(listProjects).toHaveBeenCalled();
      });
    });

    it('should handle project loading gracefully when no projects exist', async () => {
      (listProjects as any).mockResolvedValue([]);

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(listProjects).toHaveBeenCalled();
      });

      // Should still show create button
      expect(screen.getByText(/Create New World/i)).toBeInTheDocument();
    });
  });

  describe('Project Deletion', () => {
    it('should delete a project successfully', async () => {
      const mockProjects = [
        {
          id: 'project-1',
          name: 'Test Project 1',
          color: '#3b82f6',
          asset_count: 5,
          updated_at: '2024-01-01T00:00:00Z'
        }
      ];
      (listProjects as any).mockResolvedValue(mockProjects);
      (deleteProject as any).mockResolvedValue();

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText(/Test Project 1/i)).toBeInTheDocument();
      });

      // Find and click delete button
      const deleteButton = screen.getByLabelText(/Delete/i);
      fireEvent.click(deleteButton);

      // Confirm deletion
      await waitFor(() => {
        expect(screen.getByText(/Delete/i, { selector: 'button' })).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText(/Delete/i, { selector: 'button' }));

      await waitFor(() => {
        expect(deleteProject).toHaveBeenCalledWith('project-1');
      });
    });
  });

  describe('Project Editing', () => {
    it('should open edit dialog for existing project', async () => {
      const mockProjects = [
        {
          id: 'project-1',
          name: 'Test Project 1',
          color: '#3b82f6',
          asset_count: 5,
          updated_at: '2024-01-01T00:00:00Z'
        }
      ];
      (listProjects as any).mockResolvedValue(mockProjects);

      render(
        <TestWrapper>
          <Index />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText(/Test Project 1/i)).toBeInTheDocument();
      });

      // Select the project first
      fireEvent.click(screen.getByText(/Test Project 1/i));

      // Click edit button
      const editButton = screen.getByText(/Edit/i);
      fireEvent.click(editButton);

      await waitFor(() => {
        expect(screen.getByText(/Edit Book/i)).toBeInTheDocument();
      });
    });
  });
});

describe('Asset CRUD Operations', () => {
  beforeEach(() => {
    useAssetStore.getState().clearWorldData();
    vi.clearAllMocks();
  });

  it('should create a new asset', async () => {
    // Mock asset creation
    const mockAsset = {
      id: 'asset-1',
      name: 'Test Asset',
      type: 'character',
      x: 100,
      y: 100,
      width: 200,
      height: 150,
      children: []
    };

    render(
      <TestWrapper>
        <Index />
      </TestWrapper>
    );

    // This would need to be implemented based on the actual asset creation UI
    // For now, we'll test the store directly
    const { createAsset } = useAssetStore.getState();
    const assetId = createAsset({
      name: 'Test Asset',
      type: 'card',
      x: 100,
      y: 100,
      width: 200,
      height: 150,
      customFields: [],
      customFieldValues: []
    });

    expect(assetId).toBeDefined();
    
    const { getAssetById } = useAssetStore.getState();
    const createdAsset = getAssetById(assetId);
    expect(createdAsset).toMatchObject(mockAsset);
  });

  it('should update asset position', async () => {
    const mockAsset = {
      id: 'asset-1',
      name: 'Test Asset',
      type: 'character',
      x: 100,
      y: 100,
      width: 200,
      height: 150,
      children: []
    };

    const { createAsset, updateAssetPosition, getAssetById: getAssetByIdFunc } = useAssetStore.getState();
    const assetId = createAsset({
      name: 'Test Asset',
      type: 'card',
      x: 100,
      y: 100,
      width: 200,
      height: 150,
      customFields: [],
      customFieldValues: []
    });

    updateAssetPosition(assetId, 200, 150);

    const updatedAsset = getAssetByIdFunc(assetId);
    expect(updatedAsset.x).toBe(200);
    expect(updatedAsset.y).toBe(150);
  });

  it('should delete an asset', async () => {
    const mockAsset = {
      id: 'asset-1',
      name: 'Test Asset',
      type: 'character',
      x: 100,
      y: 100,
      width: 200,
      height: 150,
      children: []
    };

    const { createAsset, deleteAsset, getAssetById: getAssetByIdFunc } = useAssetStore.getState();
    const assetId = createAsset({
      name: 'Test Asset',
      type: 'card',
      x: 100,
      y: 100,
      width: 200,
      height: 150,
      customFields: [],
      customFieldValues: []
    });

    deleteAsset(assetId);

    const deletedAsset = getAssetByIdFunc(assetId);
    expect(deletedAsset).toBeNull();
  });
});

describe('Tag Operations', () => {
  beforeEach(() => {
    useTagStore.getState().clearWorldData();
    vi.clearAllMocks();
  });

  it('should create and manage tags', () => {
    const { createTag, updateTag, deleteTag } = useTagStore.getState();
    const tagId = createTag({ name: 'Test Tag', color: '#ff0000' });
    expect(tagId).toBeDefined();

    const { tags } = useTagStore.getState();
    const tag = tags[tagId];
    expect(tag).toMatchObject({
      name: 'Test Tag',
      color: '#ff0000'
    });

    updateTag(tagId, { name: 'Updated Tag' });
    const { tags: updatedTags } = useTagStore.getState();
    const updatedTag = updatedTags[tagId];
    expect(updatedTag.name).toBe('Updated Tag');

    deleteTag(tagId);
    const { tags: finalTags } = useTagStore.getState();
    expect(finalTags[tagId]).toBeUndefined();
  });

  it('should assign tags to assets', () => {
    const { createTag, addTagToAsset, getAssetTags, removeTagFromAsset } = useTagStore.getState();
    const { createAsset } = useAssetStore.getState();

    const tagId = createTag({ name: 'Test Tag', color: '#ff0000' });
    const assetId = createAsset({
      name: 'Test Asset',
      type: 'card',
      x: 100,
      y: 100,
      width: 200,
      height: 150,
      customFields: [],
      customFieldValues: []
    });

    addTagToAsset(assetId, tagId);
    const assetTags = getAssetTags(assetId);
    expect(assetTags).toHaveLength(1);
    expect(assetTags[0].id).toBe(tagId);

    removeTagFromAsset(assetId, tagId);
    const updatedAssetTags = getAssetTags(assetId);
    expect(updatedAssetTags).toHaveLength(0);
  });
});

describe('Background Operations', () => {
  beforeEach(() => {
    // Clear backgrounds by setting empty configs
    const { configs } = useBackgroundStore.getState();
    Object.keys(configs).forEach(key => {
      useBackgroundStore.getState().setBackground(key, null as any);
    });
    vi.clearAllMocks();
  });

  it('should create and manage background configs', () => {
    const { setBackground, getBackground } = useBackgroundStore.getState();

    const config: BackgroundConfig = {
      mode: 'glass',
      color: '#ff0000',
      imageUrl: null
    };

    setBackground('asset-1', config);

    const retrievedConfig = getBackground('asset-1');
    expect(retrievedConfig).toMatchObject(config);

    // Update background by setting new config
    const updatedConfig: BackgroundConfig = {
      mode: 'color',
      color: '#0000ff',
      imageUrl: null
    };
    
    setBackground('asset-1', updatedConfig);
    const finalConfig = getBackground('asset-1');
    expect(finalConfig.mode).toBe('color');
    expect(finalConfig.color).toBe('#0000ff');

    // Remove background by setting null
    setBackground('asset-1', null as any);
    const removedConfig = getBackground('asset-1');
    expect(removedConfig).toBeNull();
  });
});

describe('Supabase Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle authentication state changes', async () => {
    (supabase.auth.getSession as any).mockResolvedValue({
      data: { session: { access_token: 'test-token' } }
    });

    render(
      <TestWrapper>
        <Index />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(supabase.auth.getSession).toHaveBeenCalled();
    });
  });

  it('should sync data with Supabase when authenticated', async () => {
    const mockProjects = [
      {
        id: 'project-1',
        name: 'Test Project 1',
        color: '#3b82f6',
        asset_count: 5,
        updated_at: '2024-01-01T00:00:00Z'
      }
    ];

    (listProjects as any).mockResolvedValue(mockProjects);
    (documentMutationService.loadDocument as any).mockResolvedValue({
      success: true,
      data: {
        world_document: {
          assets: {},
          tags: {},
          backgrounds: {}
        }
      }
    });

    render(
      <TestWrapper>
        <Index />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(listProjects).toHaveBeenCalled();
      expect(documentMutationService.loadDocument).toHaveBeenCalled();
    });
  });

  it('should handle Supabase connection errors gracefully', async () => {
    (listProjects as any).mockRejectedValue(new Error('Connection failed'));

    render(
      <TestWrapper>
        <Index />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(listProjects).toHaveBeenCalled();
    }, { timeout: 5000 });

    // App should still load and show create button
    expect(screen.getByText(/Create New World/i)).toBeInTheDocument();
  });
});
