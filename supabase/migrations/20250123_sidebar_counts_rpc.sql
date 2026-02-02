-- ============================================
-- Sidebar Counts RPC Functions (V2 - Schema Aligned)
-- Purpose: Provide subjects and tags with question counts for sidebar display
-- Security: Uses SECURITY INVOKER to respect RLS (multi-tenant safe)
-- ============================================

-- RPC: Get subjects with question counts for sidebar
-- Returns subjects sorted by question count DESC, then by name ASC
-- Field names aligned with frontend: questionCount (camelCase)
CREATE OR REPLACE FUNCTION get_subjects_with_counts()
RETURNS TABLE (
    id UUID,
    name TEXT,
    color TEXT,
    "questionCount" BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER  -- Respects RLS, filters by current user automatically
AS $$
    SELECT
        s.id,
        s.name,
        s.color,
        COALESCE(COUNT(eq.id), 0) AS "questionCount"
    FROM subjects s
    LEFT JOIN error_questions eq ON eq.subject_id = s.id
        AND eq.is_archived = false
        -- Note: error_questions doesn't have deleted_at, uses is_archived only
    WHERE s.deleted_at IS NULL  -- Exclude soft-deleted subjects
    GROUP BY s.id, s.name, s.color
    ORDER BY "questionCount" DESC, s.name ASC;
$$;

-- RPC: Get tags with question counts for sidebar
-- Returns tags sorted by question count DESC, then by name ASC
-- Field names aligned with frontend: nodeCount (camelCase)
CREATE OR REPLACE FUNCTION get_tags_with_counts()
RETURNS TABLE (
    id UUID,
    name TEXT,
    color TEXT,
    "nodeCount" BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER  -- Respects RLS, filters by current user automatically
AS $$
    SELECT
        t.id,
        t.name,
        t.color,
        COALESCE(COUNT(DISTINCT eq.id), 0) AS "nodeCount"
    FROM tags t
    LEFT JOIN error_question_tags eqt ON eqt.tag_id = t.id
    LEFT JOIN error_questions eq ON eq.id = eqt.question_id
        AND eq.is_archived = false
        -- Note: error_questions doesn't have deleted_at, uses is_archived only
    WHERE t.deleted_at IS NULL  -- Exclude soft-deleted tags
    GROUP BY t.id, t.name, t.color
    ORDER BY "nodeCount" DESC, t.name ASC;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION get_subjects_with_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION get_tags_with_counts() TO authenticated;

COMMENT ON FUNCTION get_subjects_with_counts() IS 'Returns user''s subjects with active question counts (RLS-enforced), sorted by count DESC';
COMMENT ON FUNCTION get_tags_with_counts() IS 'Returns user''s tags with active question counts (RLS-enforced), sorted by count DESC';
