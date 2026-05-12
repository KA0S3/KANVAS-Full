-- Review Database Structure for Cleanup
-- This script will help identify outdated tables and policies

-- 1. Check current tables
SELECT 
    schemaname,
    tablename,
    tableowner
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- 2. Check current RLS policies
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 3. Check for duplicate/legacy tables that might need cleanup
SELECT 
    tablename,
    'Potential legacy table' as status
FROM pg_tables 
WHERE schemaname = 'public'
AND (
    tablename LIKE '%_v1%' OR 
    tablename LIKE '%_old%' OR 
    tablename LIKE '%_backup%' OR
    tablename LIKE '%_legacy%'
);

-- 4. Check for orphaned policies (policies on non-existent tables)
SELECT 
    p.policyname,
    p.tablename,
    'Orphaned policy' as status
FROM pg_policies p
LEFT JOIN pg_tables t ON p.tablename = t.tablename AND p.schemaname = t.schemaname
WHERE p.schemaname = 'public'
AND t.tablename IS NULL;

-- 5. Check table sizes to identify large unused tables
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
    pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- 6. Check for indexes that might need cleanup
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public'
AND NOT (indexname LIKE '%_pkey' OR indexname LIKE '%_idx')
ORDER BY tablename, indexname;
