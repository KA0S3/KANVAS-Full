-- Fix load_assets function parameter order for PostgREST compatibility
-- PostgREST expects parameters in alphabetical order: p_load_all, p_parent_id, p_project_id

-- Drop and recreate the function with correct parameter order
DROP FUNCTION IF EXISTS load_assets(UUID, TEXT, BOOLEAN);

CREATE OR REPLACE FUNCTION load_assets(
  p_project_id UUID,
  p_load_all BOOLEAN DEFAULT FALSE,
  p_parent_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  asset_id TEXT,
  parent_id TEXT,
  name TEXT,
  type TEXT,
  x INT,
  y INT,
  width INT,
  height INT,
  z_index INT,
  is_expanded BOOLEAN,
  content TEXT,
  background_config JSONB,
  viewport_config JSONB,
  custom_fields JSONB,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- CRITICAL FIX: Use SET LOCAL to bypass RLS for this function only
  -- The function already has proper security via the EXISTS clause
  SET LOCAL row_security = off;
  
  RETURN QUERY
  SELECT
    a.asset_id,
    a.parent_id,
    a.name,
    a.type,
    a.x,
    a.y,
    a.width,
    a.height,
    a.z_index,
    a.is_expanded,
    a.content,
    a.background_config,
    a.viewport_config,
    a.custom_fields,
    a.updated_at
  FROM assets a
  WHERE a.project_id = p_project_id
  AND a.deleted_at IS NULL
  -- CRITICAL FIX: Split NULL condition to avoid loading all rows
  -- CRITICAL FIX: Add p_load_all flag to bypass hierarchy check for small projects
  AND (
    p_load_all = TRUE
    OR (p_parent_id IS NULL AND a.parent_id IS NULL)
    OR (p_parent_id IS NOT NULL AND a.parent_id = p_parent_id)
  )
  AND EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = a.project_id
    AND p.user_id = auth.uid()
    AND p.deleted_at IS NULL
  );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION load_assets(UUID, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION load_assets(UUID, BOOLEAN, TEXT) TO service_role;
