-- Fix: AI ingest catalog helpers blocked by RLS for non-admin/office users.
-- vendors, material_brands, and material_categories all restrict INSERT to admin/office.
-- Site engineers use AI ingest and must be able to create unknown catalog entries.
-- Changing these helpers to SECURITY DEFINER lets them bypass RLS (run as function owner).
-- The main ingest RPC stays SECURITY INVOKER so site-level writes are still RLS-gated.

-- =====================================================================
-- Helper: resolve_or_create_category
-- =====================================================================
CREATE OR REPLACE FUNCTION public._ai_ingest_resolve_category(
  p_name TEXT,
  p_parent_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
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
-- Helper: resolve_or_create_brand
-- =====================================================================
CREATE OR REPLACE FUNCTION public._ai_ingest_resolve_brand(
  p_material_id UUID,
  p_brand_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_brand_name IS NULL OR LENGTH(TRIM(p_brand_name)) = 0 OR p_material_id IS NULL THEN
    RETURN NULL;
  END IF;

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
-- Helper: resolve_or_create_vendor
-- =====================================================================
CREATE OR REPLACE FUNCTION public._ai_ingest_resolve_vendor(p_vendor JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
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

GRANT EXECUTE ON FUNCTION public._ai_ingest_resolve_category(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public._ai_ingest_resolve_brand(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public._ai_ingest_resolve_vendor(JSONB) TO authenticated;
