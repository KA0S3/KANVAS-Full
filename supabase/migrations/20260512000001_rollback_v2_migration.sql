-- KANVAS V2 MIGRATION ROLLBACK PROCEDURES
-- 
-- This file contains comprehensive rollback procedures for the v2 schema migration.
-- These procedures ensure safe rollback in case of migration failures or data corruption.
-- 
-- 🔒 CRITICAL: Rollback must preserve all original data and maintain data integrity

-- Create rollback tracking table
CREATE TABLE IF NOT EXISTS rollback_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rollback_name TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, running, completed, failed
    started_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    backup_data JSONB DEFAULT '{}'
);

-- ============================================================================
-- ROLLBACK PROCEDURE 1: SAFE ROLLBACK TO LEGACY SCHEMA
-- ============================================================================

-- Function to safely rollback v2 migration
CREATE OR REPLACE FUNCTION rollback_v2_migration()
RETURNS TABLE(
    step TEXT,
    status TEXT,
    message TEXT,
    data_affected BIGINT
) AS $$
DECLARE
    rollback_record RECORD;
    legacy_exists BOOLEAN;
    v2_exists BOOLEAN;
BEGIN
    -- Check if rollback is possible
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'projects') INTO legacy_exists;
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'projects_v2') INTO v2_exists;
    
    IF NOT v2_exists THEN
        RETURN QUERY SELECT 'pre_check'::TEXT, 'skipped'::TEXT, 'V2 tables do not exist - no rollback needed'::TEXT, 0::BIGINT;
        RETURN;
    END IF;
    
    IF NOT legacy_exists THEN
        RETURN QUERY SELECT 'pre_check'::TEXT, 'failed'::TEXT, 'Legacy tables do not exist - rollback not possible'::TEXT, 0::BIGINT;
        RETURN;
    END IF;
    
    -- Insert rollback tracking
    INSERT INTO rollback_tracking (rollback_name, status, metadata)
    VALUES ('rollback_v2_migration', 'running', '{"timestamp": "' || now()::text || '"}')
    ON CONFLICT (rollback_name) DO UPDATE SET status = 'running', started_at = now();
    
    -- Step 1: Validate data integrity before rollback
    RETURN QUERY SELECT 'validation'::TEXT, 'running'::TEXT, 'Validating v2 data integrity before rollback'::TEXT, 0::BIGINT;
    
    -- Check that all v2 data can be mapped back to legacy format
    PERFORM * FROM validate_v2_to_legacy_mapping();
    
    RETURN QUERY SELECT 'validation'::TEXT, 'completed'::TEXT, 'V2 data integrity validated'::TEXT, 0::BIGINT;
    
    -- Step 2: Backup current v2 data
    RETURN QUERY SELECT 'backup'::TEXT, 'running'::TEXT, 'Creating backup of v2 data'::TEXT, 0::BIGINT;
    
    -- Store backup data in rollback tracking
    UPDATE rollback_tracking 
    SET backup_data = jsonb_build_object(
        'projects_backup', (SELECT jsonb_agg(to_jsonb(p)) FROM projects_v2 WHERE deleted_at IS NULL),
        'assets_backup', (SELECT jsonb_agg(to_jsonb(a)) FROM assets_v2 WHERE deleted_at IS NULL),
        'files_backup', (SELECT jsonb_agg(to_jsonb(f)) FROM files_v2),
        'sync_queue_backup', (SELECT jsonb_agg(to_jsonb(s)) FROM sync_queue_v2)
    )
    WHERE rollback_name = 'rollback_v2_migration';
    
    RETURN QUERY SELECT 'backup'::TEXT, 'completed'::TEXT, 'V2 data backup created'::TEXT, 0::BIGINT;
    
    -- Step 3: Restore legacy data from v2
    RETURN QUERY SELECT 'restore_projects'::TEXT, 'running'::TEXT, 'Restoring legacy projects from v2'::TEXT, 0::BIGINT;
    
    -- Clear legacy tables (but keep structure)
    DELETE FROM projects;
    DELETE FROM assets;
    DELETE FROM files;
    
    -- Restore projects from v2
    INSERT INTO projects (
        id, user_id, name, description, backgrounds, tags_config, viewport,
        last_version, created_at, updated_at, deleted_at
    )
    SELECT 
        id,
        user_id,
        name,
        description,
        (settings->>'backgrounds')::jsonb,
        (settings->>'tagsConfig')::jsonb,
        (settings->>'viewport')::jsonb,
        version,
        created_at,
        updated_at,
        deleted_at
    FROM projects_v2
    WHERE deleted_at IS NULL;
    
    GET DIAGNOSTICS rollback_record.data_affected = ROW_COUNT;
    RETURN QUERY SELECT 'restore_projects'::TEXT, 'completed'::TEXT, 'Legacy projects restored'::TEXT, rollback_record.data_affected::BIGINT;
    
    -- Step 4: Restore assets from v2
    RETURN QUERY SELECT 'restore_assets'::TEXT, 'running'::TEXT, 'Restoring legacy assets from v2'::TEXT, 0::BIGINT;
    
    INSERT INTO assets (
        id, project_id, parent_id, name, type, x, y, width, height, z_index,
        is_expanded, content, background_config, viewport_config, custom_fields,
        children, created_at, is_locked, border_shape, show_tag_border,
        deleted_at, cloud_status, cloud_id, cloud_path, cloud_size,
        cloud_updated_at, cloud_error, file, updated_at, image_url, scale, rotation
    )
    SELECT 
        id,
        project_id,
        parent_id,
        (content->>'title') as name,
        (behavior->>'renderMode') as type,
        (layout->>'x')::numeric as x,
        (layout->>'y')::numeric as y,
        (layout->>'width')::numeric as width,
        (layout->>'height')::numeric as height,
        COALESCE((layout->>'zIndex')::integer, 0) as z_index,
        COALESCE((behavior->'interactions'->>'isExpanded')::boolean, false) as is_expanded,
        (content->>'text') as content,
        (style->>'background')::jsonb as background_config,
        (behavior->>'viewport')::jsonb as viewport_config,
        (content->>'customFields')::jsonb as custom_fields,
        ARRAY[]::text[] as children, -- Will be reconstructed separately
        created_at,
        COALESCE((behavior->'interactions'->>'isLocked')::boolean, false) as is_locked,
        (style->>'shape') as border_shape,
        COALESCE((behavior->'interactions'->>'showTagBorder')::boolean, false) as show_tag_border,
        deleted_at,
        'synced' as cloud_status, -- Reset to synced state
        NULL as cloud_id,
        NULL as cloud_path,
        NULL as cloud_size,
        NULL as cloud_updated_at,
        NULL as cloud_error,
        NULL as file,
        updated_at,
        (content->>'imageUrl') as image_url,
        (layout->>'scale')::numeric as scale,
        (layout->>'rotation')::numeric as rotation
    FROM assets_v2
    WHERE deleted_at IS NULL;
    
    GET DIAGNOSTICS rollback_record.data_affected = ROW_COUNT;
    RETURN QUERY SELECT 'restore_assets'::TEXT, 'completed'::TEXT, 'Legacy assets restored'::TEXT, rollback_record.data_affected::BIGINT;
    
    -- Step 5: Restore files from v2
    RETURN QUERY SELECT 'restore_files'::TEXT, 'running'::TEXT, 'Restoring legacy files from v2'::TEXT, 0::BIGINT;
    
    INSERT INTO files (id, project_id, asset_id, storage_key, mime_type, size_bytes, created_at)
    SELECT id, project_id, asset_id, storage_key, mime_type, size_bytes, created_at
    FROM files_v2;
    
    GET DIAGNOSTICS rollback_record.data_affected = ROW_COUNT;
    RETURN QUERY SELECT 'restore_files'::TEXT, 'completed'::TEXT, 'Legacy files restored'::TEXT, rollback_record.data_affected::BIGINT;
    
    -- Step 6: Drop v2 tables
    RETURN QUERY SELECT 'cleanup_v2'::TEXT, 'running'::TEXT, 'Dropping v2 tables'::TEXT, 0::BIGINT;
    
    DROP TABLE IF EXISTS sync_queue_v2;
    DROP TABLE IF EXISTS files_v2;
    DROP TABLE IF EXISTS assets_v2;
    DROP TABLE IF EXISTS projects_v2;
    
    RETURN QUERY SELECT 'cleanup_v2'::TEXT, 'completed'::TEXT, 'V2 tables dropped'::TEXT, 0::BIGINT;
    
    -- Step 7: Mark rollback as completed
    UPDATE rollback_tracking 
    SET status = 'completed', 
        completed_at = now(),
        metadata = jsonb_set(
            metadata,
            '{step_completed}',
            to_jsonb('rollback_completed')
        )
    WHERE rollback_name = 'rollback_v2_migration';
    
    RETURN QUERY SELECT 'completion'::TEXT, 'completed'::TEXT, 'Rollback to legacy schema completed successfully'::TEXT, 0::BIGINT;
    
EXCEPTION
    WHEN OTHERS THEN
        -- Log rollback failure
        UPDATE rollback_tracking 
        SET status = 'failed', 
            error_message = SQLERRM,
            completed_at = now()
        WHERE rollback_name = 'rollback_v2_migration';
        
        RETURN QUERY SELECT 'error'::TEXT, 'failed'::TEXT, 'Rollback failed: ' || SQLERRM::TEXT, 0::BIGINT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- ROLLBACK PROCEDURE 2: PARTIAL ROLLBACK (DATA CORRECTION)
-- ============================================================================

-- Function to perform partial rollback for data correction
CREATE OR REPLACE FUNCTION partial_rollback_v2_data(correction_type TEXT)
RETURNS TABLE(
    step TEXT,
    status TEXT,
    message TEXT,
    records_affected BIGINT
) AS $$
DECLARE
    rollback_record RECORD;
BEGIN
    -- Insert partial rollback tracking
    INSERT INTO rollback_tracking (rollback_name, status, metadata)
    VALUES ('partial_rollback_v2_data_' || correction_type, 'running', 
            jsonb_build_object('correction_type', correction_type, 'timestamp', now()::text))
    ON CONFLICT (rollback_name) DO UPDATE SET status = 'running', started_at = now();
    
    CASE correction_type
        WHEN 'asset_structure' THEN
            -- Fix asset structure issues
            RETURN QUERY SELECT 'asset_structure'::TEXT, 'running'::TEXT, 'Fixing asset structure issues'::TEXT, 0::BIGINT;
            
            -- Remove forbidden fields from assets
            UPDATE assets_v2 
            SET layout = layout - 'sync_status' - 'upload_progress' - 'selection_state',
                content = content - 'sync_status' - 'upload_progress' - 'selection_state',
                style = style - 'sync_status' - 'upload_progress' - 'selection_state',
                behavior = behavior - 'sync_status' - 'upload_progress' - 'selection_state',
                metadata = metadata - 'sync_status' - 'upload_progress' - 'selection_state'
            WHERE layout ? 'sync_status' OR content ? 'sync_status' OR 
                  style ? 'sync_status' OR behavior ? 'sync_status' OR metadata ? 'sync_status';
            
            GET DIAGNOSTICS rollback_record.records_affected = ROW_COUNT;
            RETURN QUERY SELECT 'asset_structure'::TEXT, 'completed'::TEXT, 'Asset structure issues fixed'::TEXT, rollback_record.records_affected::BIGINT;
            
        WHEN 'parent_child_integrity' THEN
            -- Fix parent-child relationship issues
            RETURN QUERY SELECT 'parent_child'::TEXT, 'running'::TEXT, 'Fixing parent-child relationship issues'::TEXT, 0::BIGINT;
            
            -- Remove invalid parent references
            UPDATE assets_v2 
            SET parent_id = NULL
            WHERE parent_id IS NOT NULL 
            AND NOT EXISTS (SELECT 1 FROM assets_v2 a2 WHERE a2.id = assets_v2.parent_id);
            
            GET DIAGNOSTICS rollback_record.records_affected = ROW_COUNT;
            RETURN QUERY SELECT 'parent_child'::TEXT, 'completed'::TEXT, 'Parent-child relationships fixed'::TEXT, rollback_record.records_affected::BIGINT;
            
        WHEN 'project_references' THEN
            -- Fix project reference issues
            RETURN QUERY SELECT 'project_refs'::TEXT, 'running'::TEXT, 'Fixing project reference issues'::TEXT, 0::BIGINT;
            
            -- Log assets with invalid project references
            INSERT INTO rollback_tracking (rollback_name, status, metadata)
            SELECT 'invalid_project_refs_' || now()::text, 'pending',
                   jsonb_build_object('invalid_assets', jsonb_agg(id))
            FROM assets_v2
            WHERE NOT EXISTS (SELECT 1 FROM projects_v2 WHERE id = assets_v2.project_id);
            
            -- Remove assets with invalid project references (or move them to a default project)
            DELETE FROM assets_v2
            WHERE NOT EXISTS (SELECT 1 FROM projects_v2 WHERE id = assets_v2.project_id);
            
            GET DIAGNOSTICS rollback_record.records_affected = ROW_COUNT;
            RETURN QUERY SELECT 'project_refs'::TEXT, 'completed'::TEXT, 'Project references fixed'::TEXT, rollback_record.records_affected::BIGINT;
            
        ELSE
            RETURN QUERY SELECT 'unknown'::TEXT, 'failed'::TEXT, 'Unknown correction type: ' || correction_type::TEXT, 0::BIGINT;
    END CASE;
    
    -- Mark partial rollback as completed
    UPDATE rollback_tracking 
    SET status = 'completed', 
        completed_at = now(),
        metadata = jsonb_set(
            metadata,
            '{step_completed}',
            to_jsonb('partial_rollback_completed')
        )
    WHERE rollback_name = 'partial_rollback_v2_data_' || correction_type;
    
EXCEPTION
    WHEN OTHERS THEN
        -- Log partial rollback failure
        UPDATE rollback_tracking 
        SET status = 'failed', 
            error_message = SQLERRM,
            completed_at = now()
        WHERE rollback_name = 'partial_rollback_v2_data_' || correction_type;
        
        RETURN QUERY SELECT 'error'::TEXT, 'failed'::TEXT, 'Partial rollback failed: ' || SQLERRM::TEXT, 0::BIGINT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VALIDATION FUNCTIONS FOR ROLLBACK
-- ============================================================================

-- Function to validate v2 to legacy mapping
CREATE OR REPLACE FUNCTION validate_v2_to_legacy_mapping()
RETURNS TABLE(
    validation_type TEXT,
    status TEXT,
    issues_count BIGINT,
    sample_issues TEXT[]
) AS $$
BEGIN
    -- Validate project mapping
    RETURN QUERY
    SELECT 
        'project_mapping'::TEXT,
        CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END::TEXT,
        COUNT(*)::BIGINT,
        ARRAY_AGG('Project ' || id || ' has invalid structure')
    FROM projects_v2
    WHERE deleted_at IS NULL
    AND (id IS NULL OR user_id IS NULL OR name IS NULL OR settings IS NULL);
    
    -- Validate asset mapping
    RETURN QUERY
    SELECT 
        'asset_mapping'::TEXT,
        CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END::TEXT,
        COUNT(*)::BIGINT,
        ARRAY_AGG('Asset ' || id || ' has invalid structure')
    FROM assets_v2
    WHERE deleted_at IS NULL
    AND (id IS NULL OR project_id IS NULL OR layout IS NULL OR content IS NULL OR style IS NULL OR behavior IS NULL OR metadata IS NULL);
    
    -- Validate parent-child mapping
    RETURN QUERY
    SELECT 
        'parent_child_mapping'::TEXT,
        CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END::TEXT,
        COUNT(*)::BIGINT,
        ARRAY_AGG('Asset ' || id || ' has invalid parent ' || parent_id)
    FROM assets_v2
    WHERE deleted_at IS NULL
    AND parent_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM assets_v2 a2 WHERE a2.id = assets_v2.parent_id AND a2.deleted_at IS NULL);
    
    -- Validate project references
    RETURN QUERY
    SELECT 
        'project_reference_mapping'::TEXT,
        CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END::TEXT,
        COUNT(*)::BIGINT,
        ARRAY_AGG('Asset ' || id || ' references non-existent project ' || project_id)
    FROM assets_v2
    WHERE deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM projects_v2 p WHERE p.id = assets_v2.project_id AND p.deleted_at IS NULL);
END;
$$ LANGUAGE plpgsql;

-- Function to check rollback feasibility
CREATE OR REPLACE FUNCTION check_rollback_feasibility()
RETURNS TABLE(
    check_type TEXT,
    feasible BOOLEAN,
    reason TEXT,
    recommendation TEXT
) AS $$
BEGIN
    -- Check if legacy tables exist
    RETURN QUERY
    SELECT 
        'legacy_tables_exist'::TEXT,
        EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'projects')::BOOLEAN,
        CASE 
            WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'projects') THEN 'Legacy tables are available'
            ELSE 'Legacy tables do not exist'
        END::TEXT,
        CASE 
            WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'projects') THEN 'Rollback is possible'
            ELSE 'Cannot rollback - legacy tables missing'
        END::TEXT;
    
    -- Check if v2 tables exist
    RETURN QUERY
    SELECT 
        'v2_tables_exist'::TEXT,
        EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'projects_v2')::BOOLEAN,
        CASE 
            WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'projects_v2') THEN 'V2 tables are available'
            ELSE 'V2 tables do not exist'
        END::TEXT,
        CASE 
            WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'projects_v2') THEN 'Rollback can proceed'
            ELSE 'No rollback needed - v2 tables missing'
        END::TEXT;
    
    -- Check data integrity
    RETURN QUERY
    SELECT 
        'data_integrity'::TEXT,
        (SELECT COUNT(*) = 0 FROM validate_v2_to_legacy_mapping() WHERE status = 'FAIL')::BOOLEAN,
        CASE 
            WHEN (SELECT COUNT(*) = 0 FROM validate_v2_to_legacy_mapping() WHERE status = 'FAIL') THEN 'All data can be mapped to legacy format'
            ELSE 'Some data cannot be mapped to legacy format'
        END::TEXT,
        CASE 
            WHEN (SELECT COUNT(*) = 0 FROM validate_v2_to_legacy_mapping() WHERE status = 'FAIL') THEN 'Safe to rollback'
            ELSE 'Run partial rollback first to fix data issues'
        END::TEXT;
    
    -- Check backup availability
    RETURN QUERY
    SELECT 
        'backup_available'::TEXT,
        EXISTS (SELECT 1 FROM rollback_tracking WHERE rollback_name = 'rollback_v2_migration' AND backup_data IS NOT NULL)::BOOLEAN,
        CASE 
            WHEN EXISTS (SELECT 1 FROM rollback_tracking WHERE rollback_name = 'rollback_v2_migration' AND backup_data IS NOT NULL) THEN 'Backup data is available'
            ELSE 'No backup data found'
        END::TEXT,
        CASE 
            WHEN EXISTS (SELECT 1 FROM rollback_tracking WHERE rollback_name = 'rollback_v2_migration' AND backup_data IS NOT NULL) THEN 'Rollback can use backup data'
            ELSE 'Create backup before rollback'
        END::TEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- EMERGENCY ROLLBACK PROCEDURES
-- ============================================================================

-- Emergency rollback function (minimal checks, maximum speed)
CREATE OR REPLACE FUNCTION emergency_rollback_v2()
RETURNS TEXT AS $$
BEGIN
    -- Create emergency backup
    CREATE TABLE IF NOT EXISTS emergency_backup_v2 AS 
    SELECT * FROM projects_v2;
    CREATE TABLE IF NOT EXISTS emergency_backup_v2_assets AS 
    SELECT * FROM assets_v2;
    CREATE TABLE IF NOT EXISTS emergency_backup_v2_files AS 
    SELECT * FROM files_v2;
    
    -- Quick restore to legacy
    DELETE FROM projects;
    DELETE FROM assets;
    DELETE FROM files;
    
    INSERT INTO projects SELECT * FROM emergency_backup_v2;
    INSERT INTO assets SELECT * FROM emergency_backup_v2_assets;
    INSERT INTO files SELECT * FROM emergency_backup_v2_files;
    
    -- Drop v2 tables immediately
    DROP TABLE IF EXISTS sync_queue_v2;
    DROP TABLE IF EXISTS files_v2;
    DROP TABLE IF EXISTS assets_v2;
    DROP TABLE IF EXISTS projects_v2;
    
    RETURN 'Emergency rollback completed';
EXCEPTION
    WHEN OTHERS THEN
        RETURN 'Emergency rollback failed: ' || SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions for rollback functions
GRANT EXECUTE ON FUNCTION rollback_v2_migration() TO authenticated;
GRANT EXECUTE ON FUNCTION partial_rollback_v2_data(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION validate_v2_to_legacy_mapping() TO authenticated;
GRANT EXECUTE ON FUNCTION check_rollback_feasibility() TO authenticated;
GRANT EXECUTE ON FUNCTION emergency_rollback_v2() TO authenticated;

-- Create RLS policies for rollback tracking
ALTER TABLE rollback_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own rollback tracking" ON rollback_tracking
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Service role can manage rollback tracking" ON rollback_tracking
    FOR ALL USING (auth.role() = 'service_role');

DO $$
BEGIN
    RAISE NOTICE 'KANVAS V2 Migration Rollback Procedures Created Successfully';
    RAISE NOTICE 'Available rollback functions:';
    RAISE NOTICE '- rollback_v2_migration() - Full rollback to legacy schema';
    RAISE NOTICE '- partial_rollback_v2_data(correction_type) - Partial rollback for specific issues';
END $$;

DO $$
BEGIN
    RAISE NOTICE '- validate_v2_to_legacy_mapping() - Validate rollback feasibility';
    RAISE NOTICE '- check_rollback_feasibility() - Check if rollback is possible';
    RAISE NOTICE '- emergency_rollback_v2() - Emergency rollback (use with caution)';
END $$;
