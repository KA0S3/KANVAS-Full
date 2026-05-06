-- Add missing query_assets_by_parent_paginated function
-- This function is called by documentMutationService.queryAssetsPaginated

CREATE OR REPLACE FUNCTION query_assets_by_parent_paginated(
    p_parent_id UUID DEFAULT NULL,
    p_limit INTEGER DEFAULT 100,
    p_offset INTEGER DEFAULT 0
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
LANGUAGE plpgsql
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
        a.content
    FROM assets a
    WHERE (p_parent_id IS NULL AND a.parent_id IS NULL) OR (a.parent_id = p_parent_id)
    ORDER BY a.updated_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION query_assets_by_parent_paginated TO authenticated;
