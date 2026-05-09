-- AI-Assisted Catalog Ingestion — ingest_quotation_atomic
-- Split from 20260509100200_ai_ingest_commit_rpc.sql so the local supabase
-- CLI's SQL splitter doesn't fold the 4 RPCs into one prepared statement.

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
