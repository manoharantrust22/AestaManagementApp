-- AI-Assisted Catalog Ingestion — Resolve helpers
-- Spec: C:\Users\Haribabu\.claude\plans\so-since-this-application-vectorized-church.md
--
-- Originally bundled the 4 helpers + 3 main RPCs in one file. The local
-- supabase CLI's SQL splitter folded everything into a single prepared
-- statement and choked with "cannot insert multiple commands into a prepared
-- statement". The 3 main RPCs were split into 20260509100210_*_purchase,
-- *_quotation, and *_warranty so each migration applies cleanly.
--
-- Resolution rules for "find or create":
--   * vendor    : match by case-insensitive trimmed name (vendors.name has no UNIQUE)
--   * category  : match by case-insensitive name AND parent_id (NULL-safe). Parent
--                 created first if a "parent_name" is supplied.
--   * material  : match by case-insensitive name AND category_id (NULL-safe)
--   * brand     : material_brands has UNIQUE (material_id, brand_name, variant_name);
--                 we always insert with variant_name=NULL so dedup is on (mat,brand).
--                 But because PostgreSQL UNIQUE treats NULL as distinct, dedup is
--                 done explicitly via SELECT-then-INSERT.

-- =====================================================================
-- Helper: resolve_or_create_category(name, parent_id) -> uuid
-- =====================================================================
CREATE OR REPLACE FUNCTION public._ai_ingest_resolve_category(
  p_name TEXT,
  p_parent_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_name IS NULL OR LENGTH(TRIM(p_name)) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_id
  FROM material_categories
  WHERE LOWER(TRIM(name)) = LOWER(TRIM(p_name))
    AND parent_id IS NOT DISTINCT FROM p_parent_id
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO material_categories (name, parent_id, is_active, display_order)
  VALUES (TRIM(p_name), p_parent_id, TRUE, 0)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- =====================================================================
-- Helper: resolve_or_create_material(name, local_name, category_id, unit, ...)
-- =====================================================================
CREATE OR REPLACE FUNCTION public._ai_ingest_resolve_material(
  p_name TEXT,
  p_local_name TEXT,
  p_category_id UUID,
  p_unit TEXT,
  p_hsn_code TEXT DEFAULT NULL,
  p_gst_rate NUMERIC DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_name IS NULL OR LENGTH(TRIM(p_name)) = 0 THEN
    RAISE EXCEPTION 'Material name is required';
  END IF;

  -- Match by case-insensitive name within the same category (NULL-safe).
  SELECT id INTO v_id
  FROM materials
  WHERE LOWER(TRIM(name)) = LOWER(TRIM(p_name))
    AND category_id IS NOT DISTINCT FROM p_category_id
    AND is_active = TRUE
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO materials (
    name, local_name, category_id, unit, hsn_code, gst_rate, is_active
  )
  VALUES (
    TRIM(p_name),
    NULLIF(TRIM(COALESCE(p_local_name, '')), ''),
    p_category_id,
    COALESCE(p_unit, 'piece')::material_unit,
    NULLIF(TRIM(COALESCE(p_hsn_code, '')), ''),
    COALESCE(p_gst_rate, 18.00),
    TRUE
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- =====================================================================
-- Helper: resolve_or_create_brand(material_id, brand_name)
-- =====================================================================
CREATE OR REPLACE FUNCTION public._ai_ingest_resolve_brand(
  p_material_id UUID,
  p_brand_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_brand_name IS NULL OR LENGTH(TRIM(p_brand_name)) = 0 OR p_material_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Dedup explicitly because UNIQUE (material_id, brand_name, variant_name)
  -- treats NULL variant_name as distinct.
  SELECT id INTO v_id
  FROM material_brands
  WHERE material_id = p_material_id
    AND LOWER(TRIM(brand_name)) = LOWER(TRIM(p_brand_name))
    AND variant_name IS NULL
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO material_brands (material_id, brand_name, is_active)
  VALUES (p_material_id, TRIM(p_brand_name), TRUE)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- =====================================================================
-- Helper: resolve_or_create_vendor(payload jsonb)
-- =====================================================================
CREATE OR REPLACE FUNCTION public._ai_ingest_resolve_vendor(p_vendor JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_name TEXT;
  v_existing_id UUID;
BEGIN
  IF p_vendor IS NULL OR jsonb_typeof(p_vendor) <> 'object' THEN
    RAISE EXCEPTION 'Vendor object is required';
  END IF;

  -- Caller may have already resolved the vendor in the preview UI.
  v_existing_id := (p_vendor->>'id')::UUID;
  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  v_name := TRIM(p_vendor->>'name');
  IF v_name IS NULL OR LENGTH(v_name) = 0 THEN
    RAISE EXCEPTION 'Vendor name is required';
  END IF;

  -- Case-insensitive dedup against existing vendors.
  SELECT id INTO v_id
  FROM vendors
  WHERE LOWER(TRIM(name)) = LOWER(v_name)
    AND is_active = TRUE
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO vendors (
    name,
    phone,
    gst_number,
    city,
    vendor_type,
    is_active
  )
  VALUES (
    v_name,
    NULLIF(TRIM(COALESCE(p_vendor->>'phone', '')), ''),
    NULLIF(TRIM(COALESCE(p_vendor->>'gst_number', '')), ''),
    NULLIF(TRIM(COALESCE(p_vendor->>'city', '')), ''),
    COALESCE((p_vendor->>'vendor_type')::vendor_type, 'dealer'::vendor_type),
    TRUE
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- =====================================================================
-- Grants for the helpers (main-RPC grants live in their own files)
-- =====================================================================
GRANT EXECUTE ON FUNCTION public._ai_ingest_resolve_category(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public._ai_ingest_resolve_material(TEXT, TEXT, UUID, TEXT, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public._ai_ingest_resolve_brand(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public._ai_ingest_resolve_vendor(JSONB) TO authenticated;
