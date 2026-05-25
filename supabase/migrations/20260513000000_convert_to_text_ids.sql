-- MIGRATION: Convert UUID IDs to TEXT format for readable, user-containing IDs
-- 
-- This migration changes the ID fields from UUID to TEXT to support the new
-- centralized ID generation system that produces readable IDs containing
-- user information.
--
-- New ID format: {prefix}_{userShortId}_{timestampBase36}_{randomChars}
-- Example: prj_abc123_1k2m3n_x7k9p

-- Enable UUID extension (still needed for user_id references)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- STEP 1: Create new tables with TEXT-based IDs
-- ============================================================================

-- Create new projects_v3 table with TEXT IDs
CREATE TABLE IF NOT EXISTS projects_v3 (
    id TEXT PRIMARY KEY,
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
    deleted_at TIMESTAMPTZ
);

-- Create indexes for projects_v3
CREATE INDEX IF NOT EXISTS idx_projects_v3_user ON projects_v3(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_projects_v3_updated ON projects_v3(updated_at) WHERE deleted_at IS NULL;

-- Create new assets_v3 table with TEXT IDs
CREATE TABLE IF NOT EXISTS assets_v3 (
    project_id TEXT NOT NULL REFERENCES projects_v3(id) ON DELETE CASCADE,
    id TEXT PRIMARY KEY,
    
    -- Core identity (normalized)
    parent_id TEXT REFERENCES assets_v3(id) ON DELETE SET NULL,
    
    -- Layout & Position (normalized JSONB)
    layout JSONB NOT NULL DEFAULT '{}',
    
    -- Content (normalized JSONB)
    content JSONB NOT NULL DEFAULT '{}',
    
    -- Style (normalized JSONB)
    style JSONB NOT NULL DEFAULT '{}',
    
    -- Behavior (normalized JSONB)
    behavior JSONB NOT NULL DEFAULT '{}',
    
    -- Metadata (normalized JSONB)
    metadata JSONB NOT NULL DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- Create indexes for assets_v3 (optimized for large projects)
CREATE INDEX IF NOT EXISTS idx_assets_v3_project ON assets_v3(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_assets_v3_parent ON assets_v3(project_id, parent_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_assets_v3_updated ON assets_v3(project_id, updated_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_assets_v3_spatial ON assets_v3(project_id, (layout->>'x'), (layout->>'y')) WHERE deleted_at IS NULL;

-- Create files_v3 table with TEXT IDs
CREATE TABLE IF NOT EXISTS files_v3 (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects_v3(id) ON DELETE CASCADE,
    asset_id TEXT REFERENCES assets_v3(id) ON DELETE CASCADE,
    
    -- File metadata (no blob data)
    storage_key TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    cloud_url TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for files_v3
CREATE INDEX IF NOT EXISTS idx_files_v3_asset ON files_v3(asset_id);
CREATE INDEX IF NOT EXISTS idx_files_v3_project ON files_v3(project_id);

-- Create sync_queue_v3 table with TEXT IDs
CREATE TABLE IF NOT EXISTS sync_queue_v3 (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects_v3(id) ON DELETE CASCADE,
    asset_id TEXT REFERENCES assets_v3(id) ON DELETE CASCADE,
    
    -- Operation metadata (runtime only)
    operation TEXT NOT NULL, -- 'create', 'update', 'delete'
    asset_data JSONB,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    error_message TEXT,
    retry_count INT DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create FIFO ordering indexes for sync_queue_v3
CREATE INDEX IF NOT EXISTS idx_sync_queue_v3_fifo ON sync_queue_v3(project_id, created_at) WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_sync_queue_v3_asset ON sync_queue_v3(asset_id);

-- ============================================================================
-- STEP 2: Migrate data from v2 to v3 with new ID format
-- ============================================================================

-- Function to generate new TEXT IDs from existing UUIDs
CREATE OR REPLACE FUNCTION generate_text_id(prefix TEXT, existing_uuid UUID, user_id UUID)
RETURNS TEXT AS $$
DECLARE
    user_short_id TEXT;
    timestamp_base36 TEXT;
    random_chars TEXT;
BEGIN
    -- Extract first 6 chars from user_id
    user_short_id := SUBSTRING(REPLACE(user_id::TEXT, '-', ''), 1, 6);
    
    -- Use timestamp from UUID (extract from first 8 hex digits as timestamp approximation)
    timestamp_base36 := TO_HEX(EXTRACT(EPOCH FROM NOW())::BIGINT);
    
    -- Generate random chars
    random_chars := SUBSTRING(MD5(RANDOM()::TEXT), 1, 4);
    
    RETURN prefix || '_' || user_short_id || '_' || timestamp_base36 || '_' || random_chars;
END;
$$ LANGUAGE plpgsql;

-- Migrate projects from v2 to v3
INSERT INTO projects_v3 (
    id, user_id, name, description, settings, version, last_sync_at,
    created_at, updated_at, deleted_at
)
SELECT 
    generate_text_id('prj', p.id, p.user_id) as id,
    p.user_id,
    p.name,
    p.description,
    p.settings,
    p.version,
    p.last_sync_at,
    p.created_at,
    p.updated_at,
    p.deleted_at
FROM projects_v2 p
ON CONFLICT (id) DO NOTHING;

-- Create a mapping table for old UUID to new TEXT IDs
CREATE TEMP TABLE project_id_mapping AS
SELECT 
    p.id as old_uuid,
    generate_text_id('prj', p.id, p.user_id) as new_text_id
FROM projects_v2 p;

-- Migrate assets from v2 to v3 with new IDs and project ID mapping
INSERT INTO assets_v3 (
    project_id, id, parent_id, layout, content, style, behavior, metadata,
    created_at, updated_at, deleted_at
)
SELECT 
    m.new_text_id as project_id,
    generate_text_id('ast', a.id, (SELECT user_id FROM projects_v2 WHERE id = a.project_id)) as id,
    -- Map parent_id if it exists
    CASE 
        WHEN a.parent_id IS NOT NULL THEN (
            SELECT generate_text_id('ast', a2.id, (SELECT user_id FROM projects_v2 WHERE id = a2.project_id))
            FROM assets_v2 a2 
            WHERE a2.id = a.parent_id 
            LIMIT 1
        )
        ELSE NULL 
    END as parent_id,
    a.layout,
    a.content,
    a.style,
    a.behavior,
    a.metadata,
    a.created_at,
    a.updated_at,
    a.deleted_at
FROM assets_v2 a
JOIN project_id_mapping m ON a.project_id = m.old_uuid
ON CONFLICT (id) DO NOTHING;

-- Create asset ID mapping table
CREATE TEMP TABLE asset_id_mapping AS
SELECT 
    a.id as old_uuid,
    generate_text_id('ast', a.id, (SELECT user_id FROM projects_v2 WHERE id = a.project_id)) as new_text_id
FROM assets_v2 a;

-- Migrate files from v2 to v3 with new IDs
INSERT INTO files_v3 (
    id, project_id, asset_id, storage_key, mime_type, size_bytes,
    created_at, updated_at
)
SELECT
    generate_text_id('fil', f.id, (SELECT user_id FROM projects_v2 WHERE id = f.project_id)) as id,
    m.new_text_id as project_id,
    am.new_text_id as asset_id,
    f.storage_key,
    f.mime_type,
    f.size_bytes,
    f.created_at,
    f.created_at
FROM files_v2 f
JOIN project_id_mapping m ON f.project_id = m.old_uuid
LEFT JOIN asset_id_mapping am ON f.asset_id = am.old_uuid
ON CONFLICT (id) DO NOTHING;

-- Migrate sync queue from v2 to v3 with new IDs
INSERT INTO sync_queue_v3 (
    id, project_id, asset_id, operation, asset_data, status, error_message, retry_count,
    created_at, updated_at
)
SELECT 
    generate_text_id('sq', sq.id, (SELECT user_id FROM projects_v2 WHERE id = sq.project_id)) as id,
    m.new_text_id as project_id,
    am.new_text_id as asset_id,
    sq.operation,
    sq.asset_data,
    sq.status,
    sq.error_message,
    sq.retry_count,
    sq.created_at,
    sq.updated_at
FROM sync_queue_v2 sq
JOIN project_id_mapping m ON sq.project_id = m.old_uuid
LEFT JOIN asset_id_mapping am ON sq.asset_id = am.old_uuid
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- STEP 3: Enable Row Level Security (RLS) on new tables
-- ============================================================================

ALTER TABLE projects_v3 ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets_v3 ENABLE ROW LEVEL SECURITY;
ALTER TABLE files_v3 ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_queue_v3 ENABLE ROW LEVEL SECURITY;

-- Projects RLS policies
CREATE POLICY "Users can view their own projects"
ON projects_v3 FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own projects"
ON projects_v3 FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own projects"
ON projects_v3 FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own projects"
ON projects_v3 FOR DELETE
USING (auth.uid() = user_id);

-- Assets RLS policies
CREATE POLICY "Users can view assets in their projects"
ON assets_v3 FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM projects_v3 
        WHERE id = project_id AND user_id = auth.uid()
    )
);

CREATE POLICY "Users can insert assets in their projects"
ON assets_v3 FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM projects_v3 
        WHERE id = project_id AND user_id = auth.uid()
    )
);

CREATE POLICY "Users can update assets in their projects"
ON assets_v3 FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM projects_v3 
        WHERE id = project_id AND user_id = auth.uid()
    )
);

CREATE POLICY "Users can delete assets in their projects"
ON assets_v3 FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM projects_v3 
        WHERE id = project_id AND user_id = auth.uid()
    )
);

-- Files RLS policies
CREATE POLICY "Users can view files in their projects"
ON files_v3 FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM projects_v3 
        WHERE id = project_id AND user_id = auth.uid()
    )
);

CREATE POLICY "Users can insert files in their projects"
ON files_v3 FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM projects_v3 
        WHERE id = project_id AND user_id = auth.uid()
    )
);

CREATE POLICY "Users can delete files in their projects"
ON files_v3 FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM projects_v3 
        WHERE id = project_id AND user_id = auth.uid()
    )
);

-- Sync Queue RLS policies
CREATE POLICY "Users can view sync queue for their projects"
ON sync_queue_v3 FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM projects_v3 
        WHERE id = project_id AND user_id = auth.uid()
    )
);

CREATE POLICY "Users can insert sync queue for their projects"
ON sync_queue_v3 FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM projects_v3 
        WHERE id = project_id AND user_id = auth.uid()
    )
);

CREATE POLICY "Users can update sync queue for their projects"
ON sync_queue_v3 FOR UPDATE
USING (
    EXISTS (
        SELECT 1 FROM projects_v3 
        WHERE id = project_id AND user_id = auth.uid()
    )
);

CREATE POLICY "Users can delete sync queue for their projects"
ON sync_queue_v3 FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM projects_v3 
        WHERE id = project_id AND user_id = auth.uid()
    )
);

-- ============================================================================
-- STEP 4: Create helper function for load_assets with TEXT IDs
-- ============================================================================

CREATE OR REPLACE FUNCTION load_assets_v3(
    p_project_id TEXT,
    p_parent_id TEXT DEFAULT NULL,
    p_load_all BOOLEAN DEFAULT FALSE
)
RETURNS SETOF assets_v3 AS $$
BEGIN
    IF p_load_all THEN
        RETURN QUERY
        SELECT * FROM assets_v3
        WHERE project_id = p_project_id
        AND deleted_at IS NULL
        ORDER BY created_at ASC;
    ELSE
        RETURN QUERY
        SELECT * FROM assets_v3
        WHERE project_id = p_project_id
        AND (parent_id = p_parent_id OR (parent_id IS NULL AND p_parent_id IS NULL))
        AND deleted_at IS NULL
        ORDER BY created_at ASC;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- STEP 5: Add validation constraints for ID format
-- ============================================================================

-- Add check constraint to validate project ID format
ALTER TABLE projects_v3 
ADD CONSTRAINT valid_project_id_format 
CHECK (id ~ '^prj_[a-z0-9]{6}_[a-z0-9]+_[a-z0-9]{4}$');

-- Add check constraint to validate asset ID format
ALTER TABLE assets_v3 
ADD CONSTRAINT valid_asset_id_format 
CHECK (id ~ '^ast_[a-z0-9]{6}_[a-z0-9]+_[a-z0-9]{4}$');

-- Add check constraint to validate file ID format
ALTER TABLE files_v3 
ADD CONSTRAINT valid_file_id_format 
CHECK (id ~ '^fil_[a-z0-9]{6}_[a-z0-9]+_[a-z0-9]{4}$');

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Log migration completion
DO $$
BEGIN
    RAISE NOTICE 'Migration to TEXT-based IDs completed successfully';
    RAISE NOTICE 'New tables: projects_v3, assets_v3, files_v3, sync_queue_v3';
    RAISE NOTICE 'Old tables (v2) preserved for rollback if needed';
END $$;
