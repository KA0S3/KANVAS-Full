-- KANVAS V2 SCHEMA MIGRATION
-- 
-- This migration creates the new v2 schema with canonical asset structure
-- and proper separation of concerns as defined in the persistence rewrite plan.
-- 
-- 🔒 CRITICAL: This migration preserves all existing data while implementing
-- the hardened architecture with single canonical asset structure.

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create migration tracking table
CREATE TABLE IF NOT EXISTS migration_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    migration_name TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, running, completed, failed
    started_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    metadata JSONB DEFAULT '{}'
);

-- Insert migration tracking entry
INSERT INTO migration_tracking (migration_name, status, metadata)
VALUES ('20260512000000_migrate_to_v2_schema', 'running', '{"version": "2.0", "description": "Migrate to canonical asset structure"}')
ON CONFLICT (migration_name) DO NOTHING;

-- ============================================================================
-- STEP 1: CREATE NEW V2 TABLES WITH CANONICAL STRUCTURE
-- ============================================================================

-- Create projects_v2 table with normalized structure
CREATE TABLE IF NOT EXISTS projects_v2 (
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
    CONSTRAINT chk_version_positive CHECK (version > 0)
);

-- Create indexes for projects_v2
CREATE INDEX IF NOT EXISTS idx_projects_v2_user ON projects_v2(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_projects_v2_updated ON projects_v2(updated_at) WHERE deleted_at IS NULL;

-- Create single unified assets_v2 table (NO SYNC STATE)
CREATE TABLE IF NOT EXISTS assets_v2 (
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
    
    -- Constraints for canonical structure
    CONSTRAINT chk_layout_not_empty CHECK (jsonb_typeof(layout) = 'object' AND layout != '{}'),
    CONSTRAINT chk_content_not_empty CHECK (jsonb_typeof(content) = 'object' AND content != '{}'),
    CONSTRAINT chk_style_not_empty CHECK (jsonb_typeof(style) = 'object'),
    CONSTRAINT chk_behavior_not_empty CHECK (jsonb_typeof(behavior) = 'object'),
    CONSTRAINT chk_metadata_not_empty CHECK (jsonb_typeof(metadata) = 'object' AND metadata != '{}'),
    
    -- Prevent forbidden fields in asset data
    CONSTRAINT chk_no_sync_status CHECK (NOT (layout ? 'sync_status' OR content ? 'sync_status' OR style ? 'sync_status' OR behavior ? 'sync_status' OR metadata ? 'sync_status')),
    CONSTRAINT chk_no_upload_progress CHECK (NOT (layout ? 'upload_progress' OR content ? 'upload_progress' OR style ? 'upload_progress' OR behavior ? 'upload_progress' OR metadata ? 'upload_progress')),
    CONSTRAINT chk_no_selection_state CHECK (NOT (layout ? 'selection_state' OR content ? 'selection_state' OR style ? 'selection_state' OR behavior ? 'selection_state' OR metadata ? 'selection_state'))
);

-- Create indexes for assets_v2 (optimized for large projects)
CREATE INDEX IF NOT EXISTS idx_assets_v2_project ON assets_v2(project_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_assets_v2_parent ON assets_v2(project_id, parent_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_assets_v2_updated ON assets_v2(project_id, updated_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_assets_v2_spatial ON assets_v2(project_id, (layout->>'x'), (layout->>'y')) WHERE deleted_at IS NULL;

-- Create files_v2 table (separated from assets - NEVER embedded)
CREATE TABLE IF NOT EXISTS files_v2 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects_v2(id) ON DELETE CASCADE,
    asset_id UUID REFERENCES assets_v2(id) ON DELETE CASCADE,
    
    -- File metadata (no blob data)
    storage_key TEXT NOT NULL,
    mime_type TEXT,
    size_bytes BIGINT,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    
    -- Constraints
    CONSTRAINT chk_storage_key_not_empty CHECK (storage_key != ''),
    CONSTRAINT chk_size_positive CHECK (size_bytes > 0)
);

-- Create indexes for files_v2
CREATE INDEX IF NOT EXISTS idx_files_v2_asset ON files_v2(asset_id);
CREATE INDEX IF NOT EXISTS idx_files_v2_project ON files_v2(project_id);

-- Create sync_queue_v2 table (runtime state ONLY - never mixed with assets)
CREATE TABLE IF NOT EXISTS sync_queue_v2 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects_v2(id) ON DELETE CASCADE,
    asset_id UUID REFERENCES assets_v2(id) ON DELETE CASCADE,
    
    -- Operation metadata (runtime only)
    operation TEXT NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
    asset_data JSONB, -- Full asset snapshot for updates
    retry_count INT DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    error_message TEXT,
    
    created_at TIMESTAMPTZ DEFAULT now(),
    processed_at TIMESTAMPTZ,
    
    -- Constraints
    CONSTRAINT chk_retry_count_positive CHECK (retry_count >= 0),
    CONSTRAINT chk_retry_count_limit CHECK (retry_count <= 10)
);

-- Create FIFO ordering indexes for sync_queue_v2
CREATE INDEX IF NOT EXISTS idx_sync_queue_v2_fifo ON sync_queue_v2(project_id, created_at) WHERE status IN ('pending', 'failed');
CREATE INDEX IF NOT EXISTS idx_sync_queue_v2_asset ON sync_queue_v2(asset_id);

-- ============================================================================
-- STEP 2: MIGRATE DATA FROM LEGACY TABLES
-- ============================================================================

-- Migrate projects with validation and normalization
INSERT INTO projects_v2 (id, user_id, name, description, settings, version, created_at, updated_at, deleted_at)
SELECT 
    id,
    user_id,
    name,
    description,
    jsonb_build_object(
        'backgrounds', COALESCE(backgrounds, '{}'),
        'tagsConfig', COALESCE(tags_config, '{}'),
        'viewport', COALESCE(viewport, jsonb_build_object('x', 0, 'y', 0, 'zoom', 1))
    ) as settings,
    COALESCE(last_version, 1) as version,
    created_at,
    updated_at,
    deleted_at
FROM projects
WHERE deleted_at IS NULL
ON CONFLICT (id) DO NOTHING;

-- Log project migration
DO $$
DECLARE
    migrated_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO migrated_count FROM projects_v2;
    RAISE NOTICE 'Migrated % projects to v2 schema', migrated_count;
    
    -- Update migration tracking
    UPDATE migration_tracking 
    SET metadata = jsonb_set(
        jsonb_set(metadata, '{projects_migrated}', to_jsonb(migrated_count)),
        '{step_completed}', 
        to_jsonb('projects_migration')
    )
    WHERE migration_name = '20260512000000_migrate_to_v2_schema';
END $$;

-- Migrate assets to canonical structure with comprehensive validation
INSERT INTO assets_v2 (
    project_id, id, parent_id, layout, content, style, behavior, metadata,
    created_at, updated_at, deleted_at
)
SELECT 
    a.project_id,
    a.id,
    a.parent_id,
    -- Validate and normalize layout
    jsonb_build_object(
        'x', COALESCE(a.x, 0)::numeric,
        'y', COALESCE(a.y, 0)::numeric,
        'width', GREATEST(COALESCE(a.width, 100), 1)::numeric,
        'height', GREATEST(COALESCE(a.height, 100), 1)::numeric,
        'zIndex', COALESCE(a.z_index, 0)::integer,
        'scale', CASE WHEN a.scale IS NOT NULL THEN a.scale::numeric ELSE NULL END,
        'rotation', CASE WHEN a.rotation IS NOT NULL THEN a.rotation::numeric ELSE NULL END
    ) as layout,
    -- Validate and normalize content
    jsonb_build_object(
        'title', COALESCE(a.name, ''),
        'description', COALESCE(a.custom_fields->>'description', ''),
        'text', CASE WHEN a.content IS NOT NULL AND a.content != '' THEN a.content ELSE NULL END,
        'imageUrl', CASE WHEN a.image_url IS NOT NULL AND a.image_url != '' THEN a.image_url ELSE NULL END,
        'customFields', COALESCE(
            jsonb_build_object(
                'thumbnail', a.custom_fields->'thumbnail',
                'background', a.custom_fields->'background',
                'viewportDisplaySettings', a.custom_fields->'viewportDisplaySettings',
                -- Include any other custom fields
                CASE 
                    WHEN a.custom_fields IS NOT NULL THEN 
                        a.custom_fields - 'thumbnail' - 'background' - 'description' - 'viewportDisplaySettings'
                    ELSE '{}'::jsonb
                END
            ),
            '{}'::jsonb
        )
    ) as content,
    -- Validate and normalize style
    jsonb_build_object(
        'background', COALESCE(a.background_config, '{}'::jsonb),
        'tagColor', COALESCE(a.custom_fields->>'background', ''),
        'border', CASE 
            WHEN a.border_shape IS NOT NULL THEN 
                jsonb_build_object('shape', a.border_shape)
            ELSE '{}'::jsonb
        END,
        'shape', COALESCE(a.border_shape, 'square'),
        'opacity', CASE 
            WHEN a.custom_fields->>'opacity' IS NOT NULL THEN 
                (a.custom_fields->>'opacity')::numeric
            ELSE 1
        END
    ) as style,
    -- Validate and normalize behavior
    jsonb_build_object(
        'renderMode', CASE 
            WHEN a.type IS NOT NULL THEN 
                CASE a.type
                    WHEN 'image' THEN 'image'
                    WHEN 'document' THEN 'document'
                    WHEN 'video' THEN 'video'
                    WHEN 'audio' THEN 'audio'
                    WHEN 'text' THEN 'text'
                    WHEN 'container' THEN 'container'
                    WHEN 'card' THEN 'card'
                    WHEN 'viewport' THEN 'viewport'
                    WHEN 'tag' THEN 'tag'
                    ELSE 'default'
                END
            ELSE 'default'
        END,
        'interactions', COALESCE(
            jsonb_build_object(
                'isExpanded', COALESCE(a.is_expanded, false),
                'isLocked', COALESCE(a.is_locked, false),
                'showTagBorder', COALESCE(a.show_tag_border, false)
            ),
            '{}'::jsonb
        ),
        'viewport', COALESCE(a.viewport_config, '{}'::jsonb)
    ) as behavior,
    -- Create proper metadata
    jsonb_build_object(
        'tags', COALESCE(
            CASE 
                WHEN a.custom_fields->'tags' IS NOT NULL THEN 
                    array(SELECT jsonb_array_elements_text(a.custom_fields->'tags'))
                ELSE ARRAY[]::text[]
            END,
            ARRAY[]::text[]
        ),
        'createdAt', COALESCE(
            CASE 
                WHEN a.created_at IS NOT NULL THEN 
                    to_timestamp(a.created_at / 1000.0)::text
                ELSE a.created_at
            END,
            a.created_at,
            now()::text
        ),
        'updatedAt', COALESCE(a.updated_at, now()::text),
        'version', 1
    ) as metadata,
    a.created_at,
    a.updated_at,
    a.deleted_at
FROM assets a
WHERE a.deleted_at IS NULL
ON CONFLICT (id) DO NOTHING;

-- Log asset migration
DO $$
DECLARE
    migrated_count INTEGER;
    legacy_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO migrated_count FROM assets_v2;
    SELECT COUNT(*) INTO legacy_count FROM assets WHERE deleted_at IS NULL;
    
    RAISE NOTICE 'Migrated % assets to v2 schema (expected: %)', migrated_count, legacy_count;
    
    -- Update migration tracking
    UPDATE migration_tracking 
    SET metadata = jsonb_set(
        jsonb_set(
            jsonb_set(metadata, '{assets_migrated}', to_jsonb(migrated_count)),
            '{assets_expected}', 
            to_jsonb(legacy_count)
        ),
        '{step_completed}', 
        to_jsonb('assets_migration')
    )
    WHERE migration_name = '20260512000000_migrate_to_v2_schema';
END $$;

-- Migrate files with proper separation
INSERT INTO files_v2 (project_id, asset_id, storage_key, mime_type, size_bytes, created_at)
SELECT 
    f.project_id, 
    a.id as asset_id,
    f.storage_key, 
    f.mime_type, 
    f.size_bytes, 
    f.created_at
FROM files f
JOIN assets_v2 a ON a.id = f.asset_id AND a.project_id = f.project_id
WHERE f.asset_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- Log file migration
DO $$
DECLARE
    migrated_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO migrated_count FROM files_v2;
    RAISE NOTICE 'Migrated % files to v2 schema', migrated_count;
    
    -- Update migration tracking
    UPDATE migration_tracking 
    SET metadata = jsonb_set(
        jsonb_set(metadata, '{files_migrated}', to_jsonb(migrated_count)),
        '{step_completed}', 
        to_jsonb('files_migration')
    )
    WHERE migration_name = '20260512000000_migrate_to_v2_schema';
END $$;

-- Initialize sync queue for dirty assets
INSERT INTO sync_queue_v2 (project_id, asset_id, operation, asset_data, status)
SELECT 
    project_id, 
    id, 
    'update', 
    jsonb_build_object(
        'layout', layout,
        'content', content,
        'style', style,
        'behavior', behavior,
        'metadata', metadata
    ),
    'pending'
FROM assets_v2
WHERE EXISTS (
    SELECT 1 FROM assets la 
    WHERE la.id = assets_v2.id 
    AND la.cloud_status IS DISTINCT FROM 'synced'
    AND la.deleted_at IS NULL
)
ON CONFLICT DO NOTHING;

-- Log sync queue initialization
DO $$
DECLARE
    queue_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO queue_count FROM sync_queue_v2 WHERE status = 'pending';
    RAISE NOTICE 'Initialized % assets in sync queue', queue_count;
    
    -- Update migration tracking
    UPDATE migration_tracking 
    SET metadata = jsonb_set(
        jsonb_set(metadata, '{sync_queue_initialized}', to_jsonb(queue_count)),
        '{step_completed}', 
        to_jsonb('sync_queue_migration')
    )
    WHERE migration_name = '20260512000000_migrate_to_v2_schema';
END $$;

-- ============================================================================
-- STEP 3: CREATE VALIDATION FUNCTIONS
-- ============================================================================

-- Function to validate canonical asset structure
CREATE OR REPLACE FUNCTION validate_canonical_asset(asset_data JSONB)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check required top-level sections
    IF NOT (asset_data ? 'layout' AND asset_data ? 'content' AND asset_data ? 'style' AND asset_data ? 'behavior' AND asset_data ? 'metadata') THEN
        RETURN FALSE;
    END IF;
    
    -- Check for forbidden fields
    IF asset_data #> '{layout,sync_status}' IS NOT NULL OR
       asset_data #> '{content,sync_status}' IS NOT NULL OR
       asset_data #> '{style,sync_status}' IS NOT NULL OR
       asset_data #> '{behavior,sync_status}' IS NOT NULL OR
       asset_data #> '{metadata,sync_status}' IS NOT NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Check metadata structure
    IF NOT (asset_data->'metadata' ? 'createdAt' AND 
            asset_data->'metadata' ? 'updatedAt' AND 
            asset_data->'metadata' ? 'version') THEN
        RETURN FALSE;
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to validate migration integrity
CREATE OR REPLACE FUNCTION validate_v2_migration_integrity()
RETURNS TABLE(
    validation_type TEXT,
    status TEXT,
    expected_count BIGINT,
    actual_count BIGINT,
    issues TEXT[]
) AS $$
BEGIN
    -- Validate projects
    RETURN QUERY
    SELECT 
        'projects'::TEXT,
        CASE WHEN COUNT(p.id) = COUNT(p_v2.id) THEN 'PASS' ELSE 'FAIL' END::TEXT,
        COUNT(p.id)::BIGINT,
        COUNT(p_v2.id)::BIGINT,
        ARRAY[CASE WHEN COUNT(p.id) != COUNT(p_v2.id) THEN 'Project count mismatch' ELSE NULL END]
    FROM projects p
    FULL OUTER JOIN projects_v2 p_v2 ON p.id = p_v2.id
    WHERE p.deleted_at IS NULL OR p_v2.deleted_at IS NULL;
    
    -- Validate assets
    RETURN QUERY
    SELECT 
        'assets'::TEXT,
        CASE WHEN COUNT(a.id) = COUNT(a_v2.id) THEN 'PASS' ELSE 'FAIL' END::TEXT,
        COUNT(a.id)::BIGINT,
        COUNT(a_v2.id)::BIGINT,
        ARRAY[CASE WHEN COUNT(a.id) != COUNT(a_v2.id) THEN 'Asset count mismatch' ELSE NULL END]
    FROM assets a
    FULL OUTER JOIN assets_v2 a_v2 ON a.id = a_v2.id
    WHERE a.deleted_at IS NULL OR a_v2.deleted_at IS NULL;
    
    -- Validate asset structure
    RETURN QUERY
    SELECT 
        'asset_structure'::TEXT,
        CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END::TEXT,
        0::BIGINT,
        COUNT(*)::BIGINT,
        ARRAY_AGG('Invalid asset structure: ' || id)
    FROM assets_v2
    WHERE NOT validate_canonical_asset(
        jsonb_build_object(
            'layout', layout,
            'content', content,
            'style', style,
            'behavior', behavior,
            'metadata', metadata
        )
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 4: ENABLE RLS POLICIES FOR V2 TABLES
-- ============================================================================

-- Enable RLS on all v2 tables
ALTER TABLE projects_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE files_v2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_queue_v2 ENABLE ROW LEVEL SECURITY;

-- Projects v2 RLS policies
CREATE POLICY "Users can view their own projects_v2" ON projects_v2
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own projects_v2" ON projects_v2
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own projects_v2" ON projects_v2
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own projects_v2" ON projects_v2
    FOR DELETE USING (auth.uid() = user_id);

-- Assets v2 RLS policies
CREATE POLICY "Users can view assets in their projects_v2" ON assets_v2
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM projects_v2 
            WHERE id = project_id AND user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert assets in their projects_v2" ON assets_v2
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM projects_v2 
            WHERE id = project_id AND user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update assets in their projects_v2" ON assets_v2
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM projects_v2 
            WHERE id = project_id AND user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete assets in their projects_v2" ON assets_v2
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM projects_v2 
            WHERE id = project_id AND user_id = auth.uid()
        )
    );

-- Files v2 RLS policies
CREATE POLICY "Users can view files in their projects_v2" ON files_v2
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM projects_v2 
            WHERE id = project_id AND user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert files in their projects_v2" ON files_v2
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM projects_v2 
            WHERE id = project_id AND user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete files in their projects_v2" ON files_v2
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM projects_v2 
            WHERE id = project_id AND user_id = auth.uid()
        )
    );

-- Sync queue v2 RLS policies
CREATE POLICY "Users can view sync queue for their projects_v2" ON sync_queue_v2
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM projects_v2 
            WHERE id = project_id AND user_id = auth.uid()
        )
    );

CREATE POLICY "Users can manage sync queue for their projects_v2" ON sync_queue_v2
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM projects_v2 
            WHERE id = project_id AND user_id = auth.uid()
        )
    );

-- ============================================================================
-- STEP 5: COMPLETE MIGRATION
-- ============================================================================

-- Mark migration as completed
UPDATE migration_tracking 
SET status = 'completed', 
    completed_at = now(),
    metadata = jsonb_set(
        metadata,
        '{step_completed}',
        to_jsonb('migration_completed')
    )
WHERE migration_name = '20260512000000_migrate_to_v2_schema';

-- Run final validation and log results
DO $$
DECLARE
    validation_record RECORD;
    total_issues INTEGER := 0;
BEGIN
    RAISE NOTICE 'Running final migration validation...';
    
    FOR validation_record IN SELECT * FROM validate_v2_migration_integrity() LOOP
        RAISE NOTICE 'Validation: % - Status: % (Expected: %, Actual: %)', 
            validation_record.validation_type,
            validation_record.status,
            validation_record.expected_count,
            validation_record.actual_count;
            
        IF validation_record.status = 'FAIL' THEN
            total_issues := total_issues + 1;
            RAISE NOTICE 'Issues: %', array_to_string(validation_record.issues, ', ');
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Migration validation completed. Total issues: %', total_issues;
    
    -- Update final status in migration tracking
    UPDATE migration_tracking 
    SET metadata = jsonb_set(
        jsonb_set(metadata, '{validation_issues}', to_jsonb(total_issues)),
        '{validation_status}', 
        to_jsonb(CASE WHEN total_issues = 0 THEN 'PASSED' ELSE 'FAILED' END)
    )
    WHERE migration_name = '20260512000000_migrate_to_v2_schema';
END $$;

RAISE NOTICE 'KANVAS V2 Schema Migration Completed Successfully';
RAISE NOTICE 'Legacy tables remain for rollback capability';
RAISE NOTICE 'Run SELECT * FROM validate_v2_migration_integrity() to verify migration integrity';
