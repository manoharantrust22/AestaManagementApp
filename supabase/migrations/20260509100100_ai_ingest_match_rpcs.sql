-- AI-Assisted Catalog Ingestion — Trigram match RPCs
-- Spec: C:\Users\Haribabu\.claude\plans\so-since-this-application-vectorized-church.md
--
-- pg_trgm 1.6 is already installed in public. These RPCs front the AI ingest
-- preview UI so it can show "best fuzzy match" candidates before the user
-- confirms (auto-create-after-preview policy).
--
-- Score buckets the client uses:
--   * score >= 0.7  → "matched" (auto-pick top result)
--   * 0.5–0.7       → "ambiguous" (show top-3 in dropdown)
--   * < 0.5         → "new" (pre-fill create-form with AI-suggested fields)

-- 1. Indexes — speeds up the % operator (pg_trgm GIN)
CREATE INDEX IF NOT EXISTS idx_materials_name_trgm
  ON materials USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_materials_local_name_trgm
  ON materials USING GIN (local_name gin_trgm_ops)
  WHERE local_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vendors_name_trgm
  ON vendors USING GIN (name gin_trgm_ops);

-- 2. Match a material by name (and optionally constrain to a category)
CREATE OR REPLACE FUNCTION public.match_material_by_name(
  p_query TEXT,
  p_category_id UUID DEFAULT NULL,
  p_threshold REAL DEFAULT 0.3,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  local_name TEXT,
  category_id UUID,
  unit TEXT,
  score REAL
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    m.id,
    m.name,
    m.local_name,
    m.category_id,
    m.unit::TEXT,
    GREATEST(
      similarity(m.name, p_query),
      COALESCE(similarity(m.local_name, p_query), 0)
    ) AS score
  FROM materials m
  WHERE m.is_active = TRUE
    AND (p_category_id IS NULL OR m.category_id = p_category_id)
    AND (
      m.name % p_query
      OR (m.local_name IS NOT NULL AND m.local_name % p_query)
    )
    AND GREATEST(
      similarity(m.name, p_query),
      COALESCE(similarity(m.local_name, p_query), 0)
    ) >= p_threshold
  ORDER BY score DESC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION public.match_material_by_name IS
  'Trigram fuzzy-match against materials.name and materials.local_name. Used by AI ingest preview to suggest existing catalog matches before creating NEW rows.';

-- 3. Match a vendor by name
CREATE OR REPLACE FUNCTION public.match_vendor_by_name(
  p_query TEXT,
  p_threshold REAL DEFAULT 0.3,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  city TEXT,
  phone TEXT,
  gst_number TEXT,
  score REAL
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    v.id,
    v.name,
    v.city,
    v.phone,
    v.gst_number,
    similarity(v.name, p_query) AS score
  FROM vendors v
  WHERE v.is_active = TRUE
    AND v.name % p_query
    AND similarity(v.name, p_query) >= p_threshold
  ORDER BY score DESC
  LIMIT p_limit;
$$;

COMMENT ON FUNCTION public.match_vendor_by_name IS
  'Trigram fuzzy-match against vendors.name. Used by AI ingest preview to dedupe vendor entries.';

-- 4. Grants
GRANT EXECUTE ON FUNCTION public.match_material_by_name(TEXT, UUID, REAL, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_vendor_by_name(TEXT, REAL, INTEGER) TO authenticated;
