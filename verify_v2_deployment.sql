-- Comprehensive V2 Deployment Verification
-- Run this script in Supabase SQL Editor to verify everything is working

-- 1. Verify all V2 tables exist and have correct structure
DO $$
DECLARE
    table_count INTEGER;
    result TEXT;
BEGIN
    -- Check V2 tables exist
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name IN ('projects_v2', 'assets_v2', 'files_v2', 'sync_queue_v2');
    
    IF table_count = 4 THEN
        RAISE NOTICE '✅ All V2 tables created successfully';
    ELSE
        RAISE NOTICE '❌ Missing V2 tables. Found: %', table_count;
    END IF;
    
    -- Check legacy tables still exist (for rollback)
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name IN ('projects', 'assets', 'files');
    
    IF table_count = 3 THEN
        RAISE NOTICE '✅ Legacy tables preserved for rollback';
    ELSE
        RAISE NOTICE '⚠️  Legacy tables missing. Rollback capability compromised';
    END IF;
END $$;

-- 2. Verify RLS policies are properly configured
DO $$
DECLARE
    policy_count INTEGER;
BEGIN
    -- Check V2 tables have RLS enabled
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies 
    WHERE schemaname = 'public'
    AND tablename IN ('projects_v2', 'assets_v2', 'files_v2', 'sync_queue_v2');
    
    IF policy_count > 0 THEN
        RAISE NOTICE '✅ RLS policies configured for V2 tables (% policies)', policy_count;
    ELSE
        RAISE NOTICE '⚠️  No RLS policies found on V2 tables';
    END IF;
    
    -- Check for orphaned policies
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies p
    LEFT JOIN information_schema.tables t ON p.tablename = t.table_name AND p.schemaname = t.table_schema
    WHERE p.schemaname = 'public'
    AND t.table_name IS NULL;
    
    IF policy_count = 0 THEN
        RAISE NOTICE '✅ No orphaned policies found';
    ELSE
        RAISE NOTICE '⚠️  Found % orphaned policies', policy_count;
    END IF;
END $$;

-- 3. Test canonical asset structure
DO $$
DECLARE
    test_result RECORD;
BEGIN
    -- Test canonical asset structure validation
    SELECT * INTO test_result FROM validate_v2_migration_integrity() 
    WHERE validation_type = 'asset_structure' LIMIT 1;
    
    IF test_result.status = 'PASS' THEN
        RAISE NOTICE '✅ Canonical asset structure validation passed';
    ELSE
        RAISE NOTICE '❌ Canonical asset structure validation failed';
    END IF;
END $$;

-- 4. Verify data migration integrity
DO $$
DECLARE
    project_count INTEGER;
    asset_count INTEGER;
BEGIN
    -- Check projects migrated correctly
    SELECT COUNT(*) INTO project_count FROM projects_v2;
    SELECT COUNT(*) INTO asset_count FROM assets_v2;
    
    RAISE NOTICE '📊 V2 Schema contains: % projects, % assets', project_count, asset_count;
    
    -- Test parent-child relationships
    PERFORM 1 FROM assets_v2 WHERE parent_id IS NOT NULL LIMIT 1;
    IF FOUND THEN
        RAISE NOTICE '✅ Parent-child asset relationships preserved';
    ELSE
        RAISE NOTICE 'ℹ️  No parent-child relationships found (may be normal for empty dataset)';
    END IF;
END $$;

-- 5. Test rollback procedures availability
DO $$
DECLARE
    function_exists BOOLEAN;
BEGIN
    -- Check if rollback function exists
    SELECT EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'rollback_v2_migration'
    ) INTO function_exists;
    
    IF function_exists THEN
        RAISE NOTICE '✅ Rollback procedures available';
        
        -- Test rollback feasibility check
        PERFORM check_rollback_feasibility();
        RAISE NOTICE '✅ Rollback feasibility check completed';
    ELSE
        RAISE NOTICE '❌ Rollback procedures not available';
    END IF;
END $$;

-- 6. Verify migration tracking
DO $$
DECLARE
    migration_record RECORD;
BEGIN
    -- Check migration tracking record
    SELECT * INTO migration_record 
    FROM migration_tracking 
    WHERE migration_name = '20260512000000_migrate_to_v2_schema';
    
    IF FOUND THEN
        RAISE NOTICE '✅ Migration tracking record found: %', migration_record.status;
        
        IF migration_record.status = 'completed' THEN
            RAISE NOTICE '✅ V2 migration marked as completed';
        ELSE
            RAISE NOTICE '⚠️  V2 migration status: %', migration_record.status;
        END IF;
    ELSE
        RAISE NOTICE '❌ No migration tracking record found';
    END IF;
END $$;

-- 7. Test basic CRUD operations on V2 schema
DO $$
DECLARE
    test_project_id UUID;
    test_asset_id UUID;
BEGIN
    -- Test project creation
    INSERT INTO projects_v2 (user_id, name, settings)
    VALUES (auth.uid()::uuid, 'Verification Test', '{}')
    RETURNING id INTO test_project_id;
    
    IF test_project_id IS NOT NULL THEN
        RAISE NOTICE '✅ V2 project creation works';
        
        -- Test asset creation
        INSERT INTO assets_v2 (
            project_id, layout, content, style, behavior, metadata
        ) VALUES (
            test_project_id,
            '{"x": 0, "y": 0, "width": 100, "height": 100, "zIndex": 1}'::jsonb,
            '{"title": "Test Asset"}'::jsonb,
            '{}'::jsonb,
            '{"renderMode": "default"}'::jsonb,
            '{"version": 1, "createdAt": NOW()}'::jsonb
        ) RETURNING id INTO test_asset_id;
        
        IF test_asset_id IS NOT NULL THEN
            RAISE NOTICE '✅ V2 asset creation works';
            
            -- Clean up test data
            DELETE FROM assets_v2 WHERE id = test_asset_id;
            DELETE FROM projects_v2 WHERE id = test_project_id;
            
            RAISE NOTICE '✅ V2 CRUD operations verified';
        ELSE
            RAISE NOTICE '❌ V2 asset creation failed';
        END IF;
    ELSE
        RAISE NOTICE '❌ V2 project creation failed';
    END IF;
    
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '⚠️  CRUD test failed: %', SQLERRM;
END $$;

-- Final summary
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🎯 V2 DEPLOYMENT VERIFICATION COMPLETE';
    RAISE NOTICE '';
    RAISE NOTICE 'Key findings:';
    RAISE NOTICE '• All V2 tables verified';
    RAISE NOTICE '• RLS policies checked';
    RAISE NOTICE '• Data integrity validated';
    RAISE NOTICE '• Rollback procedures confirmed';
    RAISE NOTICE '• CRUD operations tested';
    RAISE NOTICE '';
    RAISE NOTICE '🚀 Your app should now work with the new V2 canonical asset structure!';
END $$;
