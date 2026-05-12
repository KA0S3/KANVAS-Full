-- KANVAS V2 Schema Migration
-- Single Canonical Asset Structure with Zone Separation
-- 
-- This migration implements the hardened architecture with:
-- - Single canonical asset structure
-- - Strict zone separation (assets, sync queue, files)
-- - No embedded files or runtime state in assets
-- - Simple last-write-wins conflict resolution

-- Step 1: Create new tables with safeguards

-- Simplified projects table
CREATE TABLE projects_v2 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    name TEXT NOT NULL,
    description TEXT,
    
    -- Project-level settings (normalized)
    settings JSONB DEFAULT '{}',
    
    -- Version control (simple integer only)
    version INT DEFAULT 1,
    last_sync_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    
    -- Performance indexes
    INDEX idx_projects_user (user_id) WHERE deleted_at IS NULL,
    INDEX idx_projects_updated (updated_at) WHERE deleted_at IS NULL
);

-- Single unified assets table (NO SYNC STATE)
CREATE TABLE assets_v2 (
    project_id UUID NOT NULL REFERENCES projects_v2(id) ON DELETE CASCADE,
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Core identity (normalized)
    parent_id UUID REFERENCES assets_v2(id) ON DELETE CASCADE,
    
    -- Canonical asset structure (single source of truth)
    -- NO runtime state, no sync status, no UI state
    layout JSONB NOT NULL,
    content JSONB NOT NULL,
    style JSONB NOT NULL,
    behavior JSONB NOT NULL,
    metadata JSONB NOT NULL,
    
    -- Timestamps only (no sync metadata)
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ,
    
    -- Performance indexes (optimized for large projects)
    INDEX idx_assets_project (project_id) WHERE deleted_at IS NULL,
    INDEX idx_assets_parent (project_id, parent_id) WHERE deleted_at IS NULL,
    INDEX idx_assets_updated (project_id, updated_at) WHERE deleted_at IS NULL,
    INDEX idx_assets_spatial (project_id, layout->>'x', layout->>'y') WHERE deleted_at IS NULL
);

-- Files table (separated from assets - NEVER embedded)
CREATE TABLE files_v2 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects_v2(id) ON DELETE CASCADE,
    asset_id UUID REFERENCES assets_v2(id) ON DELETE CASCADE,
    
    -- File metadata (no blob data)
    storage_key TEXT NOT NULL,
    mime_type TEXT,
    size_bytes BIGINT,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    
    -- Performance indexes
    INDEX idx_files_asset (asset_id),
    INDEX idx_files_project (project_id)
);

-- Sync queue table (runtime state ONLY - never mixed with assets)
CREATE TABLE sync_queue_v2 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects_v2(id) ON DELETE CASCADE,
    asset_id UUID REFERENCES assets_v2(id) ON DELETE CASCADE,
    
    -- Operation metadata (runtime only)
    operation TEXT NOT NULL, -- 'create', 'update', 'delete'
    asset_data JSONB, -- Full asset snapshot for updates
    retry_count INT DEFAULT 0,
    status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    error_message TEXT,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    processed_at TIMESTAMPTZ,
    
    -- FIFO ordering
    INDEX idx_sync_queue_fifo (project_id, created_at) WHERE status IN ('pending', 'failed'),
    INDEX idx_sync_queue_asset (asset_id)
);

-- Step 2: Add validation constraints

-- Ensure canonical asset structure
ALTER TABLE assets_v2 ADD CONSTRAINT chk_layout_structure 
    CHECK (
        jsonb_typeof(layout) = 'object' 
        AND layout ? 'x' AND layout ? 'y' AND layout ? 'width' AND layout ? 'height'
        AND (layout->>'x')::numeric IS NOT NULL 
        AND (layout->>'y')::numeric IS NOT NULL
        AND (layout->>'width')::numeric > 0 
        AND (layout->>'height')::numeric > 0
    );

ALTER TABLE assets_v2 ADD CONSTRAINT chk_content_structure 
    CHECK (jsonb_typeof(content) = 'object');

ALTER TABLE assets_v2 ADD CONSTRAINT chk_style_structure 
    CHECK (jsonb_typeof(style) = 'object');

ALTER TABLE assets_v2 ADD CONSTRAINT chk_behavior_structure 
    CHECK (jsonb_typeof(behavior) = 'object');

ALTER TABLE assets_v2 ADD CONSTRAINT chk_metadata_structure 
    CHECK (
        jsonb_typeof(metadata) = 'object' 
        AND metadata ? 'createdAt' AND metadata ? 'updatedAt' AND metadata ? 'version'
        AND (metadata->>'version')::integer >= 0
    );

-- Prevent forbidden fields in asset data
ALTER TABLE assets_v2 ADD CONSTRAINT chk_no_forbidden_fields
    CHECK (
        NOT (
            layout ? 'sync_status' OR layout ? 'upload_progress' OR layout ? 'selection_state' OR
            content ? 'sync_status' OR content ? 'upload_progress' OR content ? 'selection_state' OR
            style ? 'sync_status' OR style ? 'upload_progress' OR style ? 'selection_state' OR
            behavior ? 'sync_status' OR behavior ? 'upload_progress' OR behavior ? 'selection_state' OR
            metadata ? 'sync_status' OR metadata ? 'upload_progress' OR metadata ? 'selection_state'
        )
    );

-- Ensure sync queue operation validity
ALTER TABLE sync_queue_v2 ADD CONSTRAINT chk_operation_valid
    CHECK (operation IN ('create', 'update', 'delete'));

ALTER TABLE sync_queue_v2 ADD CONSTRAINT chk_status_valid
    CHECK (status IN ('pending', 'processing', 'completed', 'failed'));

ALTER TABLE sync_queue_v2 ADD CONSTRAINT chk_retry_count_valid
    CHECK (retry_count >= 0 AND retry_count <= 10);

-- Step 3: Create migration functions

-- Function to migrate projects with validation
CREATE OR REPLACE FUNCTION migrate_projects_v2()
RETURNS TABLE(
    success BOOLEAN,
    project_id UUID,
    error_message TEXT
) AS $$
DECLARE
    project_record RECORD;
    migration_result RECORD;
BEGIN
    -- Migrate projects
    FOR project_record IN 
        SELECT id, user_id, name, description, backgrounds, tags_config, viewport, last_version, created_at, updated_at, deleted_at
        FROM projects 
        WHERE deleted_at IS NULL
    LOOP
        BEGIN
            INSERT INTO projects_v2 (
                id, user_id, name, description, settings, version, created_at, updated_at, deleted_at
            ) VALUES (
                project_record.id,
                project_record.user_id,
                project_record.name,
                project_record.description,
                jsonb_build_object(
                    'backgrounds', COALESCE(project_record.backgrounds, '{}'),
                    'tagsConfig', COALESCE(project_record.tags_config, '{}'),
                    'viewport', COALESCE(project_record.viewport, '{"x": 0, "y": 0, "zoom": 1}')
                ),
                COALESCE(project_record.last_version, 1),
                project_record.created_at,
                project_record.updated_at,
                project_record.deleted_at
            );
            
            success := TRUE;
            project_id := project_record.id;
            error_message := NULL;
            RETURN NEXT;
            
        EXCEPTION WHEN OTHERS THEN
            success := FALSE;
            project_id := project_record.id;
            error_message := SQLERRM;
            RETURN NEXT;
        END;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to migrate assets with validation
CREATE OR REPLACE FUNCTION migrate_assets_v2()
RETURNS TABLE(
    success BOOLEAN,
    asset_id UUID,
    legacy_id TEXT,
    error_message TEXT
) AS $$
DECLARE
    asset_record RECORD;
    migration_result RECORD;
    new_id UUID;
BEGIN
    -- Migrate assets
    FOR asset_record IN 
        SELECT asset_id, parent_id, name, type, x, y, width, height, z_index, is_expanded, 
               content, background_config, viewport_config, custom_fields, 
               created_at, updated_at, deleted_at
        FROM assets 
        WHERE deleted_at IS NULL
    LOOP
        BEGIN
            new_id := gen_random_uuid();
            
            INSERT INTO assets_v2 (
                id, project_id, parent_id, layout, content, style, behavior, metadata,
                created_at, updated_at, deleted_at
            ) VALUES (
                new_id,
                -- Extract project_id from legacy data (this would need to be adjusted based on actual schema)
                (SELECT project_id FROM projects WHERE id = asset_record.asset_id LIMIT 1),
                asset_record.parent_id,
                -- Validate and normalize layout
                jsonb_build_object(
                    'x', COALESCE(asset_record.x, 0), 
                    'y', COALESCE(asset_record.y, 0), 
                    'width', GREATEST(asset_record.width, 1), 
                    'height', GREATEST(asset_record.height, 1), 
                    'zIndex', COALESCE(asset_record.z_index, 0)
                ),
                -- Validate and normalize content
                jsonb_build_object(
                    'title', COALESCE(asset_record.name, ''),
                    'text', asset_record.content, 
                    'customFields', COALESCE(asset_record.custom_fields, '{}')
                ),
                -- Validate and normalize style
                COALESCE(asset_record.background_config, '{}'),
                -- Validate and normalize behavior
                jsonb_build_object(
                    'renderMode', asset_record.type,
                    'viewport', COALESCE(asset_record.viewport_config, '{}')
                ),
                -- Create proper metadata
                jsonb_build_object(
                    'createdAt', COALESCE(asset_record.created_at, now()), 
                    'updatedAt', COALESCE(asset_record.updated_at, now()), 
                    'version', 1
                ),
                asset_record.created_at,
                asset_record.updated_at,
                asset_record.deleted_at
            );
            
            success := TRUE;
            asset_id := new_id;
            legacy_id := asset_record.asset_id;
            error_message := NULL;
            RETURN NEXT;
            
        EXCEPTION WHEN OTHERS THEN
            success := FALSE;
            asset_id := NULL;
            legacy_id := asset_record.asset_id;
            error_message := SQLERRM;
            RETURN NEXT;
        END;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to migrate files with proper separation
CREATE OR REPLACE FUNCTION migrate_files_v2()
RETURNS TABLE(
    success BOOLEAN,
    file_id UUID,
    legacy_id TEXT,
    error_message TEXT
) AS $$
DECLARE
    file_record RECORD;
BEGIN
    -- Migrate files
    FOR file_record IN 
        SELECT id, project_id, asset_id, storage_key, mime_type, size_bytes, created_at
        FROM files
    LOOP
        BEGIN
            INSERT INTO files_v2 (
                id, project_id, asset_id, storage_key, mime_type, size_bytes, created_at
            ) VALUES (
                gen_random_uuid(),
                file_record.project_id,
                file_record.asset_id,
                file_record.storage_key,
                file_record.mime_type,
                file_record.size_bytes,
                file_record.created_at
            );
            
            success := TRUE;
            file_id := gen_random_uuid();
            legacy_id := file_record.id;
            error_message := NULL;
            RETURN NEXT;
            
        EXCEPTION WHEN OTHERS THEN
            success := FALSE;
            file_id := NULL;
            legacy_id := file_record.id;
            error_message := SQLERRM;
            RETURN NEXT;
        END;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Create RLS policies

-- Projects RLS
ALTER TABLE projects_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own projects" ON projects_v2
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own projects" ON projects_v2
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own projects" ON projects_v2
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own projects" ON projects_v2
    FOR DELETE USING (auth.uid() = user_id);

-- Assets RLS
ALTER TABLE assets_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view assets in their projects" ON assets_v2
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM projects_v2 
            WHERE projects_v2.id = assets_v2.project_id 
            AND projects_v2.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert assets in their projects" ON assets_v2
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM projects_v2 
            WHERE projects_v2.id = assets_v2.project_id 
            AND projects_v2.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update assets in their projects" ON assets_v2
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM projects_v2 
            WHERE projects_v2.id = assets_v2.project_id 
            AND projects_v2.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete assets in their projects" ON assets_v2
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM projects_v2 
            WHERE projects_v2.id = assets_v2.project_id 
            AND projects_v2.user_id = auth.uid()
        )
    );

-- Files RLS
ALTER TABLE files_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view files in their projects" ON files_v2
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM projects_v2 
            WHERE projects_v2.id = files_v2.project_id 
            AND projects_v2.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert files in their projects" ON files_v2
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM projects_v2 
            WHERE projects_v2.id = files_v2.project_id 
            AND projects_v2.user_id = auth.uid()
        )
    );

-- Sync Queue RLS (service access only)
ALTER TABLE sync_queue_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service can manage sync queue" ON sync_queue_v2
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM projects_v2 
            WHERE projects_v2.id = sync_queue_v2.project_id 
            AND projects_v2.user_id = auth.uid()
        )
    );

-- Step 5: Create triggers for automatic timestamp updates

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_projects_v2_updated_at 
    BEFORE UPDATE ON projects_v2 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_assets_v2_updated_at 
    BEFORE UPDATE ON assets_v2 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Step 6: Create utility functions for the new system

-- Function to get assets in viewport (optimized)
CREATE OR REPLACE FUNCTION get_assets_in_viewport(
    p_project_id UUID,
    p_viewport_x NUMERIC,
    p_viewport_y NUMERIC,
    p_viewport_width NUMERIC,
    p_viewport_height NUMERIC,
    p_zoom NUMERIC DEFAULT 1.0
)
RETURNS TABLE (
    id UUID,
    layout JSONB,
    content JSONB,
    style JSONB,
    behavior JSONB,
    metadata JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        id, layout, content, style, behavior, metadata
    FROM assets_v2
    WHERE 
        project_id = p_project_id
        AND deleted_at IS NULL
        AND (
            -- Simple spatial check for viewport culling
            (layout->>'x')::numeric < (p_viewport_x / p_zoom) + (p_viewport_width / p_zoom)
            AND (layout->>'x')::numeric + (layout->>'width')::numeric > (p_viewport_x / p_zoom)
            AND (layout->>'y')::numeric < (p_viewport_y / p_zoom) + (p_viewport_height / p_zoom)
            AND (layout->>'y')::numeric + (layout->>'height')::numeric > (p_viewport_y / p_zoom)
        )
    ORDER BY 
        (layout->>'zIndex')::numeric ASC,
        updated_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get project statistics
CREATE OR REPLACE FUNCTION get_project_stats(p_project_id UUID)
RETURNS TABLE (
    asset_count BIGINT,
    file_count BIGINT,
    total_file_size BIGINT,
    sync_queue_size BIGINT,
    last_updated TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT COUNT(*) FROM assets_v2 WHERE project_id = p_project_id AND deleted_at IS NULL),
        (SELECT COUNT(*) FROM files_v2 WHERE project_id = p_project_id),
        (SELECT COALESCE(SUM(size_bytes), 0) FROM files_v2 WHERE project_id = p_project_id),
        (SELECT COUNT(*) FROM sync_queue_v2 WHERE project_id = p_project_id AND status IN ('pending', 'failed')),
        (SELECT MAX(updated_at) FROM assets_v2 WHERE project_id = p_project_id AND deleted_at IS NULL);
END;
$$ LANGUAGE plpgsql;

-- Step 7: Create view for backward compatibility (optional)

-- Create a view that mimics the old asset structure for compatibility
CREATE OR REPLACE VIEW assets_legacy_view AS
SELECT 
    id as asset_id,
    parent_id,
    content->>'title' as name,
    behavior->>'renderMode' as type,
    (layout->>'x')::numeric as x,
    (layout->>'y')::numeric as y,
    (layout->>'width')::numeric as width,
    (layout->>'height')::numeric as height,
    (layout->>'zIndex')::numeric as z_index,
    false as is_expanded, -- Default value
    content->>'text' as content,
    style as background_config,
    behavior->'viewport' as viewport_config,
    content->'customFields' as custom_fields,
    ARRAY[]::text[] as children, -- Computed separately
    metadata->>'createdAt' as created_at,
    updated_at,
    deleted_at
FROM assets_v2
WHERE deleted_at IS NULL;

-- Step 8: Add comments for documentation

COMMENT ON TABLE projects_v2 IS 'KANVAS V2 Projects - Simplified project metadata';
COMMENT ON TABLE assets_v2 IS 'KANVAS V2 Assets - Single canonical asset structure with zone separation';
COMMENT ON TABLE files_v2 IS 'KANVAS V2 Files - Separated file storage (never embedded in assets)';
COMMENT ON TABLE sync_queue_v2 IS 'KANVAS V2 Sync Queue - Runtime sync state only';

COMMENT ON COLUMN assets_v2.layout IS 'Asset position and dimensions (normalized)';
COMMENT ON COLUMN assets_v2.content IS 'Asset content and data (highly dynamic fields nested)';
COMMENT ON COLUMN assets_v2.style IS 'Asset visual style (normalized)';
COMMENT ON COLUMN assets_v2.behavior IS 'Asset behavior configuration (controlled extensibility)';
COMMENT ON COLUMN assets_v2.metadata IS 'Asset system metadata (persistent only)';

COMMENT ON COLUMN sync_queue_v2.operation IS 'Sync operation: create, update, delete';
COMMENT ON COLUMN sync_queue_v2.asset_data IS 'Full asset snapshot for updates (runtime only)';
COMMENT ON COLUMN sync_queue_v2.status IS 'Sync status: pending, processing, completed, failed';

-- Migration completed successfully
SELECT 'KANVAS V2 Schema Migration Completed' as status;
