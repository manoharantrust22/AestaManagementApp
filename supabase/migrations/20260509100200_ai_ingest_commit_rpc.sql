-- AI-Assisted Catalog Ingestion — Atomic commit RPCs
-- Spec: C:\Users\Haribabu\.claude\plans\so-since-this-application-vectorized-church.md
--
-- One transactional RPC per mode. The client builds a fully-resolved payload
-- (after preview-and-confirm) and hands it to one of these. Everything either
-- lands together or rolls back.
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
--
-- Why a single RPC instead of client-side sequencing:
--   The existing useCreateMaterialPurchase has known partial-failure issues
--   (purchase row can land before items if a hop fails). For AI ingest's N×4-table
--   fanout the risk is bigger; one transaction is the only safe answer.

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
-- Helper: resolve_item -> (material_id, brand_id, category_id)
-- Inlined into the main RPCs because PL/pgSQL doesn't have nice tuple returns.
-- =====================================================================

-- =====================================================================
-- Main RPC 1: ingest_purchase_atomic
-- =====================================================================
CREATE OR REPLACE FUNCTION public.ingest_purchase_atomic(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_site_id UUID;
  v_purchase_date DATE;
  v_total_amount NUMERIC;
  v_transport_cost NUMERIC;
  v_invoice_no TEXT;
  v_bill_url TEXT;
  v_payment_mode TEXT;
  v_purchase_type TEXT;
  v_vendor_id UUID;
  v_vendor_name TEXT;
  v_purchase_id UUID;
  v_ref_code TEXT;
  v_item JSONB;
  v_item_index INT := 0;
  v_items_array JSONB;
  v_category_id UUID;
  v_parent_cat_id UUID;
  v_material_id UUID;
  v_brand_id UUID;
  v_qty NUMERIC;
  v_unit TEXT;
  v_unit_price NUMERIC;
  v_item_ids UUID[] := ARRAY[]::UUID[];
  v_new_item_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Header validation
  v_site_id := (p_payload->>'site_id')::UUID;
  v_purchase_date := (p_payload->>'purchase_date')::DATE;
  v_total_amount := (p_payload->>'total_amount')::NUMERIC;
  v_transport_cost := COALESCE((p_payload->>'transport_cost')::NUMERIC, 0);
  v_invoice_no := NULLIF(TRIM(COALESCE(p_payload->>'invoice_no', '')), '');
  v_bill_url := NULLIF(TRIM(COALESCE(p_payload->>'bill_url', '')), '');
  v_payment_mode := NULLIF(TRIM(COALESCE(p_payload->>'payment_mode', '')), '');
  v_purchase_type := COALESCE(p_payload->>'purchase_type', 'own_site');
  v_items_array := p_payload->'items';

  IF v_site_id IS NULL THEN
    RAISE EXCEPTION 'site_id is required';
  END IF;
  IF v_purchase_date IS NULL THEN
    RAISE EXCEPTION 'purchase_date is required';
  END IF;
  IF v_total_amount IS NULL OR v_total_amount <= 0 THEN
    RAISE EXCEPTION 'total_amount must be > 0';
  END IF;
  IF v_items_array IS NULL OR jsonb_array_length(v_items_array) = 0 THEN
    RAISE EXCEPTION 'items array must be non-empty';
  END IF;
  IF v_purchase_type NOT IN ('own_site', 'group_stock') THEN
    RAISE EXCEPTION 'purchase_type must be own_site or group_stock';
  END IF;

  -- 1. Resolve vendor (always required for ingestion)
  v_vendor_id := _ai_ingest_resolve_vendor(p_payload->'vendor');
  SELECT name INTO v_vendor_name FROM vendors WHERE id = v_vendor_id;

  -- 2. Generate ref_code
  IF v_purchase_type = 'group_stock' THEN
    v_ref_code := generate_group_stock_purchase_reference(v_site_id);
  ELSE
    v_ref_code := generate_material_purchase_reference(v_site_id);
  END IF;

  -- 3. Insert purchase header (RLS check on site_id happens here)
  INSERT INTO material_purchase_expenses (
    site_id,
    ref_code,
    purchase_type,
    vendor_id,
    vendor_name,
    purchase_date,
    total_amount,
    transport_cost,
    payment_mode,
    payment_reference,
    bill_url,
    status,
    notes,
    created_by
  )
  VALUES (
    v_site_id,
    v_ref_code,
    v_purchase_type,
    v_vendor_id,
    v_vendor_name,
    v_purchase_date,
    v_total_amount,
    v_transport_cost,
    v_payment_mode,
    v_invoice_no,
    v_bill_url,
    'recorded',
    NULLIF(TRIM(COALESCE(p_payload->>'notes', '')), ''),
    auth.uid()
  )
  RETURNING id INTO v_purchase_id;

  -- 4. Items loop
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items_array)
  LOOP
    v_qty := (v_item->>'quantity')::NUMERIC;
    v_unit := COALESCE(v_item->>'unit', 'piece');
    v_unit_price := (v_item->>'unit_price')::NUMERIC;

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Item % has invalid quantity', v_item_index;
    END IF;
    IF v_unit_price IS NULL OR v_unit_price < 0 THEN
      RAISE EXCEPTION 'Item % has invalid unit_price', v_item_index;
    END IF;

    -- 4a. Resolve category tree (parent first, then child)
    v_parent_cat_id := NULL;
    v_category_id := NULL;
    IF v_item ? 'category' AND jsonb_typeof(v_item->'category') = 'object' THEN
      -- Caller pre-resolved the category id
      v_category_id := (v_item->'category'->>'id')::UUID;
      IF v_category_id IS NULL THEN
        IF (v_item->'category'->>'parent_name') IS NOT NULL THEN
          v_parent_cat_id := _ai_ingest_resolve_category(
            v_item->'category'->>'parent_name', NULL
          );
        END IF;
        IF (v_item->'category'->>'child_name') IS NOT NULL THEN
          v_category_id := _ai_ingest_resolve_category(
            v_item->'category'->>'child_name', v_parent_cat_id
          );
        ELSE
          v_category_id := v_parent_cat_id;
        END IF;
      END IF;
    END IF;

    -- 4b. Resolve material
    v_material_id := (v_item->>'material_id')::UUID;
    IF v_material_id IS NULL THEN
      v_material_id := _ai_ingest_resolve_material(
        v_item->>'name',
        v_item->>'local_name',
        v_category_id,
        v_unit,
        v_item->>'hsn_code',
        NULLIF(v_item->>'gst_rate', '')::NUMERIC
      );
    END IF;

    -- 4c. Resolve brand (optional)
    v_brand_id := NULL;
    IF v_item ? 'brand' AND jsonb_typeof(v_item->'brand') = 'object' THEN
      v_brand_id := (v_item->'brand'->>'id')::UUID;
      IF v_brand_id IS NULL THEN
        v_brand_id := _ai_ingest_resolve_brand(v_material_id, v_item->'brand'->>'name');
      END IF;
    END IF;

    -- 4d. Insert expense item
    INSERT INTO material_purchase_expense_items (
      purchase_expense_id, material_id, brand_id, quantity, unit_price, notes
    )
    VALUES (
      v_purchase_id, v_material_id, v_brand_id, v_qty, v_unit_price,
      NULLIF(TRIM(COALESCE(v_item->>'notes', '')), '')
    )
    RETURNING id INTO v_new_item_id;
    v_item_ids := array_append(v_item_ids, v_new_item_id);

    -- 4e. Append to price_history (source='bill')
    INSERT INTO price_history (
      vendor_id, material_id, brand_id, price, recorded_date, source,
      source_reference, quantity, unit, total_landed_cost,
      bill_url, bill_number, bill_date, recorded_by
    )
    VALUES (
      v_vendor_id, v_material_id, v_brand_id, v_unit_price, v_purchase_date, 'bill',
      v_ref_code, v_qty, v_unit, v_qty * v_unit_price,
      v_bill_url, v_invoice_no, v_purchase_date, auth.uid()
    );

    -- 4f. Upsert vendor_inventory. There's no enforced UNIQUE on
    --     (vendor_id, material_id, brand_id), so we do explicit find-then-update-or-insert.
    DECLARE v_inv_id UUID;
    BEGIN
      SELECT id INTO v_inv_id
      FROM vendor_inventory
      WHERE vendor_id = v_vendor_id
        AND material_id = v_material_id
        AND brand_id IS NOT DISTINCT FROM v_brand_id
      LIMIT 1;

      IF v_inv_id IS NOT NULL THEN
        UPDATE vendor_inventory
        SET current_price = v_unit_price,
            price_source = 'bill',
            unit = v_unit,
            last_price_update = NOW(),
            updated_at = NOW()
        WHERE id = v_inv_id;
      ELSE
        INSERT INTO vendor_inventory (
          vendor_id, material_id, brand_id, current_price, unit,
          price_source, last_price_update
        )
        VALUES (
          v_vendor_id, v_material_id, v_brand_id, v_unit_price, v_unit,
          'bill', NOW()
        );
      END IF;
    END;

    v_item_index := v_item_index + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'purchase_id', v_purchase_id,
    'ref_code', v_ref_code,
    'vendor_id', v_vendor_id,
    'item_ids', to_jsonb(v_item_ids),
    'items_count', v_item_index
  );
END;
$$;

COMMENT ON FUNCTION public.ingest_purchase_atomic IS
  'AI ingest mode=Purchase. Resolves vendor/category/material/brand (find-or-create), then inserts purchase header + items + price_history rows in one transaction.';

-- =====================================================================
-- Main RPC 2: ingest_quotation_atomic
-- =====================================================================
CREATE OR REPLACE FUNCTION public.ingest_quotation_atomic(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_quoted_on DATE;
  v_quote_no TEXT;
  v_screenshot_url TEXT;
  v_vendor_id UUID;
  v_item JSONB;
  v_item_index INT := 0;
  v_items_array JSONB;
  v_category_id UUID;
  v_parent_cat_id UUID;
  v_material_id UUID;
  v_brand_id UUID;
  v_qty NUMERIC;
  v_unit TEXT;
  v_unit_price NUMERIC;
  v_price_history_ids UUID[] := ARRAY[]::UUID[];
  v_new_ph_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  v_quoted_on := COALESCE((p_payload->>'quoted_on')::DATE, CURRENT_DATE);
  v_quote_no := NULLIF(TRIM(COALESCE(p_payload->>'quote_no', '')), '');
  v_screenshot_url := NULLIF(TRIM(COALESCE(p_payload->>'bill_url', '')), '');
  v_items_array := p_payload->'items';

  IF v_items_array IS NULL OR jsonb_array_length(v_items_array) = 0 THEN
    RAISE EXCEPTION 'items array must be non-empty';
  END IF;

  v_vendor_id := _ai_ingest_resolve_vendor(p_payload->'vendor');

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items_array)
  LOOP
    v_qty := NULLIF(v_item->>'quantity', '')::NUMERIC;
    v_unit := COALESCE(v_item->>'unit', 'piece');
    v_unit_price := (v_item->>'unit_price')::NUMERIC;

    IF v_unit_price IS NULL OR v_unit_price < 0 THEN
      RAISE EXCEPTION 'Item % has invalid unit_price', v_item_index;
    END IF;

    -- Category resolution
    v_parent_cat_id := NULL;
    v_category_id := NULL;
    IF v_item ? 'category' AND jsonb_typeof(v_item->'category') = 'object' THEN
      v_category_id := (v_item->'category'->>'id')::UUID;
      IF v_category_id IS NULL THEN
        IF (v_item->'category'->>'parent_name') IS NOT NULL THEN
          v_parent_cat_id := _ai_ingest_resolve_category(
            v_item->'category'->>'parent_name', NULL
          );
        END IF;
        IF (v_item->'category'->>'child_name') IS NOT NULL THEN
          v_category_id := _ai_ingest_resolve_category(
            v_item->'category'->>'child_name', v_parent_cat_id
          );
        ELSE
          v_category_id := v_parent_cat_id;
        END IF;
      END IF;
    END IF;

    v_material_id := (v_item->>'material_id')::UUID;
    IF v_material_id IS NULL THEN
      v_material_id := _ai_ingest_resolve_material(
        v_item->>'name',
        v_item->>'local_name',
        v_category_id,
        v_unit,
        v_item->>'hsn_code',
        NULLIF(v_item->>'gst_rate', '')::NUMERIC
      );
    END IF;

    v_brand_id := NULL;
    IF v_item ? 'brand' AND jsonb_typeof(v_item->'brand') = 'object' THEN
      v_brand_id := (v_item->'brand'->>'id')::UUID;
      IF v_brand_id IS NULL THEN
        v_brand_id := _ai_ingest_resolve_brand(v_material_id, v_item->'brand'->>'name');
      END IF;
    END IF;

    INSERT INTO price_history (
      vendor_id, material_id, brand_id, price, recorded_date, source,
      source_reference, quantity, unit, total_landed_cost,
      bill_url, bill_number, bill_date, recorded_by, notes
    )
    VALUES (
      v_vendor_id, v_material_id, v_brand_id, v_unit_price, v_quoted_on, 'quotation',
      v_quote_no, v_qty, v_unit,
      CASE WHEN v_qty IS NOT NULL THEN v_qty * v_unit_price ELSE NULL END,
      v_screenshot_url, v_quote_no, v_quoted_on, auth.uid(),
      NULLIF(TRIM(COALESCE(v_item->>'notes', '')), '')
    )
    RETURNING id INTO v_new_ph_id;
    v_price_history_ids := array_append(v_price_history_ids, v_new_ph_id);

    -- Upsert vendor_inventory (price_source='quotation'). Same find-then-update-or-insert
    -- pattern as the purchase RPC.
    DECLARE v_inv_id UUID;
    BEGIN
      SELECT id INTO v_inv_id
      FROM vendor_inventory
      WHERE vendor_id = v_vendor_id
        AND material_id = v_material_id
        AND brand_id IS NOT DISTINCT FROM v_brand_id
      LIMIT 1;

      IF v_inv_id IS NOT NULL THEN
        UPDATE vendor_inventory
        SET current_price = v_unit_price,
            price_source = 'quotation',
            unit = v_unit,
            last_price_update = NOW(),
            updated_at = NOW()
        WHERE id = v_inv_id;
      ELSE
        INSERT INTO vendor_inventory (
          vendor_id, material_id, brand_id, current_price, unit,
          price_source, last_price_update
        )
        VALUES (
          v_vendor_id, v_material_id, v_brand_id, v_unit_price, v_unit,
          'quotation', NOW()
        );
      END IF;
    END;

    v_item_index := v_item_index + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'vendor_id', v_vendor_id,
    'price_history_ids', to_jsonb(v_price_history_ids),
    'items_count', v_item_index
  );
END;
$$;

COMMENT ON FUNCTION public.ingest_quotation_atomic IS
  'AI ingest mode=Quotation. Resolves vendor/category/material/brand, then writes price_history rows with source=quotation. No purchase row.';

-- =====================================================================
-- Main RPC 3: ingest_warranty_attach
-- =====================================================================
CREATE OR REPLACE FUNCTION public.ingest_warranty_attach(
  p_purchase_id UUID,
  p_warranty JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_months INTEGER;
  v_start_date DATE;
  v_serials JSONB;
  v_notes TEXT;
  v_doc_url TEXT;
  v_existing_purchase_date DATE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_purchase_id IS NULL THEN
    RAISE EXCEPTION 'purchase_id is required';
  END IF;

  v_months := NULLIF(p_warranty->>'warranty_months', '')::INTEGER;
  v_start_date := NULLIF(p_warranty->>'warranty_start_date', '')::DATE;
  v_serials := p_warranty->'warranty_serial_numbers';
  v_notes := NULLIF(TRIM(COALESCE(p_warranty->>'warranty_notes', '')), '');
  v_doc_url := NULLIF(TRIM(COALESCE(p_warranty->>'warranty_doc_url', '')), '');

  IF v_months IS NULL OR v_months <= 0 THEN
    RAISE EXCEPTION 'warranty_months must be > 0';
  END IF;

  -- Default warranty_start_date to purchase_date if missing
  IF v_start_date IS NULL THEN
    SELECT purchase_date INTO v_existing_purchase_date
    FROM material_purchase_expenses
    WHERE id = p_purchase_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Purchase % not found or not accessible', p_purchase_id;
    END IF;
    v_start_date := v_existing_purchase_date;
  END IF;

  UPDATE material_purchase_expenses
  SET warranty_months = v_months,
      warranty_start_date = v_start_date,
      warranty_serial_numbers = v_serials,
      warranty_notes = v_notes,
      warranty_doc_url = v_doc_url,
      updated_at = NOW()
  WHERE id = p_purchase_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase % not found or not accessible', p_purchase_id;
  END IF;

  RETURN jsonb_build_object(
    'purchase_id', p_purchase_id,
    'warranty_months', v_months,
    'warranty_start_date', v_start_date,
    'warranty_expiry', v_start_date + (v_months || ' months')::INTERVAL
  );
END;
$$;

COMMENT ON FUNCTION public.ingest_warranty_attach IS
  'AI ingest mode=Warranty. Attaches warranty info to an existing material_purchase_expenses row.';

-- =====================================================================
-- Grants
-- =====================================================================
GRANT EXECUTE ON FUNCTION public._ai_ingest_resolve_category(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public._ai_ingest_resolve_material(TEXT, TEXT, UUID, TEXT, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public._ai_ingest_resolve_brand(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public._ai_ingest_resolve_vendor(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_purchase_atomic(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_quotation_atomic(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_warranty_attach(UUID, JSONB) TO authenticated;
