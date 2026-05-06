-- Migration: Asset Pagination Support
-- Enables efficient loading of assets with pagination for scalability

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_assets_project_id_updated_at ON assets(project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_assets_project_id_position ON assets(project_id, x, y);
CREATE INDEX IF NOT EXISTS idx_assets_parent_id ON assets(parent_id) WHERE parent_id IS NOT NULL;

-- Function to get paginated assets with metadata only (lightweight)
CREATE OR REPLACE FUNCTION get_assets_paginated(
  p_project_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_include_content BOOLEAN DEFAULT FALSE,
  p_parent_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  project_id UUID,
  asset_id TEXT,
  name TEXT,
  type TEXT,
  x INTEGER,
  y INTEGER,
  width INTEGER,
  height INTEGER,
  parent_id TEXT,
  updated_at TIMESTAMP WITH TIME ZONE,
  content TEXT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    a.project_id,
    a.asset_id,
    a.name,
    a.type,
    a.x,
    a.y,
    a.width,
    a.height,
    a.parent_id,
    a.updated_at,
    CASE 
      WHEN p_include_content THEN a.content 
      ELSE NULL 
    END as content
  FROM assets a
  WHERE a.project_id = p_project_id
    AND (p_parent_id IS NULL OR a.parent_id = p_parent_id)
    AND a.deleted_at IS NULL
  ORDER BY a.updated_at DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;

-- Function to get assets within viewport bounds (for virtualization)
CREATE OR REPLACE FUNCTION get_assets_in_viewport(
  p_project_id UUID,
  p_viewport_x INTEGER,
  p_viewport_y INTEGER,
  p_viewport_width INTEGER,
  p_viewport_height INTEGER,
  p_buffer INTEGER DEFAULT 200,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  project_id UUID,
  asset_id TEXT,
  name TEXT,
  type TEXT,
  x INTEGER,
  y INTEGER,
  width INTEGER,
  height INTEGER,
  parent_id TEXT,
  updated_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    a.project_id,
    a.asset_id,
    a.name,
    a.type,
    a.x,
    a.y,
    a.width,
    a.height,
    a.parent_id,
    a.updated_at
  FROM assets a
  WHERE a.project_id = p_project_id
    AND a.deleted_at IS NULL
    AND (
      -- Asset intersects with viewport + buffer
      a.x < (p_viewport_x + p_viewport_width + p_buffer)
      AND (a.x + a.width) > (p_viewport_x - p_buffer)
      AND a.y < (p_viewport_y + p_viewport_height + p_buffer)
      AND (a.y + a.height) > (p_viewport_y - p_buffer)
    )
  ORDER BY 
    -- Prioritize assets in viewport center
    CASE 
      WHEN a.x >= p_viewport_x AND a.x < (p_viewport_x + p_viewport_width)
       AND a.y >= p_viewport_y AND a.y < (p_viewport_y + p_viewport_height)
      THEN 0
      ELSE 1
    END,
    a.updated_at DESC
  LIMIT p_limit;
$$;

-- Function to batch create assets (for efficient sync)
CREATE OR REPLACE FUNCTION batch_create_assets(
  p_assets JSONB
)
RETURNS TABLE (
  success BOOLEAN,
  asset_id TEXT,
  error TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  asset_record JSONB;
  asset_id_val TEXT;
  asset_name TEXT;
  asset_type TEXT;
  asset_x INTEGER;
  asset_y INTEGER;
  asset_width INTEGER;
  asset_height INTEGER;
  asset_parent_id TEXT;
  asset_content TEXT;
  asset_project_id UUID;
  error_msg TEXT;
BEGIN
  -- Create a temporary table for batch processing
  CREATE TEMPORARY TABLE temp_assets (
    project_id UUID,
    asset_id TEXT,
    name TEXT,
    type TEXT,
    x INTEGER,
    y INTEGER,
    width INTEGER,
    height INTEGER,
    parent_id TEXT,
    content TEXT
  ) ON COMMIT DROP;
  
  -- Insert all assets into temp table
  INSERT INTO temp_assets
  SELECT 
    (value->>'project_id')::UUID,
    value->>'asset_id',
    value->>'name',
    value->>'type',
    (value->>'x')::INTEGER,
    (value->>'y')::INTEGER,
    (value->>'width')::INTEGER,
    (value->>'height')::INTEGER,
    NULLIF(value->>'parent_id', '')::TEXT,
    value->>'content'
  FROM jsonb_array_elements(p_assets) as value;
  
  -- Batch insert into main assets table
  FOR asset_record IN 
    SELECT * FROM temp_assets
  LOOP
    BEGIN
      -- Extract fields
      asset_project_id := asset_record.project_id;
      asset_id_val := asset_record.asset_id;
      asset_name := asset_record.name;
      asset_type := asset_record.type;
      asset_x := asset_record.x;
      asset_y := asset_record.y;
      asset_width := asset_record.width;
      asset_height := asset_record.height;
      asset_parent_id := asset_record.parent_id;
      asset_content := asset_record.content;
      
      -- Insert asset
      INSERT INTO assets (
        project_id, asset_id, name, type, x, y, width, height, parent_id, content, updated_at
      ) VALUES (
        asset_project_id, asset_id_val, asset_name, asset_type, asset_x, asset_y, asset_width, asset_height,
        asset_parent_id, asset_content, NOW()
      );
      
      -- Return success
      RETURN QUERY SELECT TRUE, asset_id_val, NULL::TEXT;
      
    EXCEPTION WHEN OTHERS THEN
      error_msg := SQLERRM;
      RETURN QUERY SELECT FALSE, asset_id_val, error_msg;
    END;
  END LOOP;
  
  DROP TABLE temp_assets;
END;
$$;

-- Function to get asset count for pagination info
CREATE OR REPLACE FUNCTION get_asset_count(
  p_project_id UUID,
  p_parent_id TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COUNT(*)
  FROM assets
  WHERE project_id = p_project_id
    AND (p_parent_id IS NULL OR parent_id = p_parent_id)
    AND deleted_at IS NULL;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_assets_paginated TO authenticated;
GRANT EXECUTE ON FUNCTION get_assets_in_viewport TO authenticated;
GRANT EXECUTE ON FUNCTION batch_create_assets TO authenticated;
GRANT EXECUTE ON FUNCTION get_asset_count TO authenticated;

-- Note: RLS policies already exist in setup migration (users_own_assets)
-- No need to alter existing policies as they already handle all operations
