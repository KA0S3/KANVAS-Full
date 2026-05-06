-- Migration: Asset Pagination Support
-- Enables efficient loading of assets with pagination for scalability

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_assets_book_id_updated_at ON assets(book_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_assets_book_id_position ON assets(book_id, x, y);
CREATE INDEX IF NOT EXISTS idx_assets_parent_id ON assets(parent_id) WHERE parent_id IS NOT NULL;

-- Function to get paginated assets with metadata only (lightweight)
CREATE OR REPLACE FUNCTION get_assets_paginated(
  p_book_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_include_content BOOLEAN DEFAULT FALSE,
  p_parent_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  type TEXT,
  x INTEGER,
  y INTEGER,
  width INTEGER,
  height INTEGER,
  parent_id UUID,
  updated_at TIMESTAMP WITH TIME ZONE,
  content JSONB
)
LANGUAGE sql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
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
  WHERE a.book_id = p_book_id
    AND (p_parent_id IS NULL OR a.parent_id = p_parent_id)
    AND a.deleted_at IS NULL
  ORDER BY a.updated_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Function to get assets within viewport bounds (for virtualization)
CREATE OR REPLACE FUNCTION get_assets_in_viewport(
  p_book_id UUID,
  p_viewport_x INTEGER,
  p_viewport_y INTEGER,
  p_viewport_width INTEGER,
  p_viewport_height INTEGER,
  p_buffer INTEGER DEFAULT 200,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  type TEXT,
  x INTEGER,
  y INTEGER,
  width INTEGER,
  height INTEGER,
  parent_id UUID,
  updated_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE sql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.name,
    a.type,
    a.x,
    a.y,
    a.width,
    a.height,
    a.parent_id,
    a.updated_at
  FROM assets a
  WHERE a.book_id = p_book_id
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
END;
$$;

-- Function to batch create assets (for efficient sync)
CREATE OR REPLACE FUNCTION batch_create_assets(
  p_assets JSONB
)
RETURNS TABLE (
  success BOOLEAN,
  id UUID,
  error TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  asset_record JSONB;
  asset_id UUID;
  asset_name TEXT;
  asset_type TEXT;
  asset_x INTEGER;
  asset_y INTEGER;
  asset_width INTEGER;
  asset_height INTEGER;
  asset_parent_id UUID;
  asset_content JSONB;
  asset_book_id UUID;
  error_msg TEXT;
BEGIN
  -- Create a temporary table for batch processing
  CREATE TEMPORARY TABLE temp_assets (
    id UUID,
    name TEXT,
    type TEXT,
    x INTEGER,
    y INTEGER,
    width INTEGER,
    height INTEGER,
    parent_id UUID,
    content JSONB,
    book_id UUID
  ) ON COMMIT DROP;
  
  -- Insert all assets into temp table
  INSERT INTO temp_assets
  SELECT 
    (value->>'id')::UUID,
    value->>'name',
    value->>'type',
    (value->>'x')::INTEGER,
    (value->>'y')::INTEGER,
    (value->>'width')::INTEGER,
    (value->>'height')::INTEGER,
    NULLIF(value->>'parent_id', '')::UUID,
    value->'content',
    (value->>'book_id')::UUID
  FROM jsonb_array_elements(p_assets) as value;
  
  -- Batch insert into main assets table
  FOR asset_record IN 
    SELECT * FROM temp_assets
  LOOP
    BEGIN
      -- Extract fields
      asset_id := asset_record.id;
      asset_name := asset_record.name;
      asset_type := asset_record.type;
      asset_x := asset_record.x;
      asset_y := asset_record.y;
      asset_width := asset_record.width;
      asset_height := asset_record.height;
      asset_parent_id := asset_record.parent_id;
      asset_content := asset_record.content;
      asset_book_id := asset_record.book_id;
      
      -- Insert asset
      INSERT INTO assets (
        id, name, type, x, y, width, height, parent_id, content, book_id, updated_at
      ) VALUES (
        asset_id, asset_name, asset_type, asset_x, asset_y, asset_width, asset_height,
        asset_parent_id, asset_content, asset_book_id, NOW()
      );
      
      -- Return success
      RETURN QUERY SELECT TRUE, asset_id, NULL::TEXT;
      
    EXCEPTION WHEN OTHERS THEN
      error_msg := SQLERRM;
      RETURN QUERY SELECT FALSE, asset_id, error_msg;
    END;
  END LOOP;
  
  DROP TABLE temp_assets;
END;
$$;

-- Function to get asset count for pagination info
CREATE OR REPLACE FUNCTION get_asset_count(
  p_book_id UUID,
  p_parent_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM assets
    WHERE book_id = p_book_id
      AND (p_parent_id IS NULL OR parent_id = p_parent_id)
      AND deleted_at IS NULL
  );
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_assets_paginated TO authenticated;
GRANT EXECUTE ON FUNCTION get_assets_in_viewport TO authenticated;
GRANT EXECUTE ON FUNCTION batch_create_assets TO authenticated;
GRANT EXECUTE ON FUNCTION get_asset_count TO authenticated;

-- Add RLS policies for the new functions
ALTER POLICY "Users can view their own assets" ON assets
USING (auth.uid() = (SELECT user_id FROM projects WHERE id = book_id));

ALTER POLICY "Users can insert their own assets" ON assets
WITH CHECK (auth.uid() = (SELECT user_id FROM projects WHERE id = book_id));

ALTER POLICY "Users can update their own assets" ON assets
USING (auth.uid() = (SELECT user_id FROM projects WHERE id = book_id))
WITH CHECK (auth.uid() = (SELECT user_id FROM projects WHERE id = book_id));

ALTER POLICY "Users can delete their own assets" ON assets
USING (auth.uid() = (SELECT user_id FROM projects WHERE id = book_id));
