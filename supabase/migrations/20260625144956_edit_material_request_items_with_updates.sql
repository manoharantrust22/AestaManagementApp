-- Restore + extend edit_material_request_items.
--
-- WHY THIS MIGRATION EXISTS:
-- The original migration 20260227110000_edit_material_request_items.sql is recorded
-- in supabase_migrations.schema_migrations on production, but the function itself was
-- absent from the prod database (recorded-but-missing drift). Every item add/remove on
-- the Edit Request dialog therefore 404'd with "Could not find the function". Because the
-- old version is already recorded, db push/apply skips it — so this fresh-timestamp
-- migration re-creates the function (and extends it).
--
-- WHAT'S NEW: a p_items_to_update bucket so existing items' requested_qty/notes can be
-- edited in place (no delete + re-add needed). A qty/notes change reverts any linked,
-- non-delivered PO back to draft, mirroring the removal cascade.
--
-- We DROP the old 4-arg signature first (no-op in prod where it's absent) so adding the
-- 5th param doesn't create a co-existing overload that PostgREST can't disambiguate.

DROP FUNCTION IF EXISTS edit_material_request_items(UUID, UUID, UUID[], JSONB);

CREATE OR REPLACE FUNCTION edit_material_request_items(
  p_request_id UUID,
  p_site_id UUID,
  p_items_to_remove UUID[] DEFAULT ARRAY[]::UUID[],
  p_items_to_add JSONB DEFAULT '[]'::JSONB,
  p_items_to_update JSONB DEFAULT '[]'::JSONB
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_items_with_deliveries UUID[];
  v_affected_po_ids UUID[];
  v_po_id UUID;
  v_remaining_links INT;
  v_removed_count INT := 0;
  v_added_count INT := 0;
  v_updated_count INT := 0;
  v_pos_deleted INT := 0;
  v_pos_reverted INT := 0;
  v_item JSONB;
  v_upd JSONB;
  v_old_qty NUMERIC;
  v_qty_changed_ids UUID[] := ARRAY[]::UUID[];
  v_update_po_ids UUID[];
  v_cascade_result JSON;
BEGIN
  -- ===== Validate: check items to remove don't have delivery records =====
  IF array_length(p_items_to_remove, 1) > 0 THEN
    SELECT ARRAY_AGG(DISTINCT pori.request_item_id)
    INTO v_items_with_deliveries
    FROM purchase_order_request_items pori
    INNER JOIN purchase_order_items poi ON poi.id = pori.po_item_id
    INNER JOIN delivery_items di ON di.po_item_id = poi.id
    WHERE pori.request_item_id = ANY(p_items_to_remove);

    -- Remove NULLs
    IF v_items_with_deliveries IS NOT NULL THEN
      v_items_with_deliveries := array_remove(v_items_with_deliveries, NULL);
    END IF;

    IF v_items_with_deliveries IS NOT NULL AND array_length(v_items_with_deliveries, 1) > 0 THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Cannot remove items that have delivery records',
        'blocked_items', to_json(v_items_with_deliveries)
      );
    END IF;

    -- ===== Collect affected PO IDs before removing junction records =====
    SELECT ARRAY_AGG(DISTINCT poi.po_id)
    INTO v_affected_po_ids
    FROM purchase_order_request_items pori
    INNER JOIN purchase_order_items poi ON poi.id = pori.po_item_id
    WHERE pori.request_item_id = ANY(p_items_to_remove);

    IF v_affected_po_ids IS NULL THEN
      v_affected_po_ids := ARRAY[]::UUID[];
    END IF;

    -- ===== Remove junction records for items being removed =====
    DELETE FROM purchase_order_request_items
    WHERE request_item_id = ANY(p_items_to_remove);

    -- ===== Delete the material_request_items =====
    DELETE FROM material_request_items
    WHERE id = ANY(p_items_to_remove)
      AND request_id = p_request_id;

    GET DIAGNOSTICS v_removed_count = ROW_COUNT;

    -- ===== Handle affected POs =====
    IF array_length(v_affected_po_ids, 1) > 0 THEN
      FOREACH v_po_id IN ARRAY v_affected_po_ids
      LOOP
        -- Check if this PO still has any junction links
        SELECT COUNT(*) INTO v_remaining_links
        FROM purchase_order_request_items pori
        INNER JOIN purchase_order_items poi ON poi.id = pori.po_item_id
        WHERE poi.po_id = v_po_id;

        IF v_remaining_links = 0 THEN
          -- PO has no remaining linked request items
          -- Check if PO has any deliveries - if so, just revert to draft
          IF EXISTS (SELECT 1 FROM deliveries WHERE po_id = v_po_id) THEN
            UPDATE purchase_orders SET status = 'draft', updated_at = now()
            WHERE id = v_po_id;
            v_pos_reverted := v_pos_reverted + 1;
          ELSE
            -- No deliveries, safe to delete this orphaned PO
            SELECT cascade_delete_purchase_order(v_po_id, p_site_id) INTO v_cascade_result;
            v_pos_deleted := v_pos_deleted + 1;
          END IF;
        ELSE
          -- PO still has some linked items, revert to draft for re-processing
          UPDATE purchase_orders SET status = 'draft', updated_at = now()
          WHERE id = v_po_id
            AND status NOT IN ('delivered', 'partially_delivered');
          v_pos_reverted := v_pos_reverted + 1;
        END IF;
      END LOOP;
    END IF;
  END IF;

  -- ===== Add new items =====
  IF p_items_to_add IS NOT NULL AND jsonb_array_length(p_items_to_add) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items_to_add)
    LOOP
      INSERT INTO material_request_items (
        request_id,
        material_id,
        brand_id,
        requested_qty,
        notes
      ) VALUES (
        p_request_id,
        (v_item->>'material_id')::UUID,
        CASE WHEN v_item->>'brand_id' IS NOT NULL AND v_item->>'brand_id' != ''
          THEN (v_item->>'brand_id')::UUID
          ELSE NULL
        END,
        (v_item->>'requested_qty')::NUMERIC,
        v_item->>'notes'
      );
      v_added_count := v_added_count + 1;
    END LOOP;
  END IF;

  -- ===== Update existing items (requested_qty / notes) in place =====
  IF p_items_to_update IS NOT NULL AND jsonb_array_length(p_items_to_update) > 0 THEN
    FOR v_upd IN SELECT * FROM jsonb_array_elements(p_items_to_update)
    LOOP
      -- Capture old qty first: only a real qty change should revert linked POs;
      -- a notes-only edit must leave PO processing untouched.
      SELECT requested_qty INTO v_old_qty
      FROM material_request_items
      WHERE id = (v_upd->>'id')::UUID
        AND request_id = p_request_id;

      UPDATE material_request_items
      SET
        requested_qty = (v_upd->>'requested_qty')::NUMERIC,
        notes = v_upd->>'notes'
      WHERE id = (v_upd->>'id')::UUID
        AND request_id = p_request_id;   -- guard: only this request's items
      IF FOUND THEN
        v_updated_count := v_updated_count + 1;
        IF v_old_qty IS DISTINCT FROM (v_upd->>'requested_qty')::NUMERIC THEN
          v_qty_changed_ids := array_append(v_qty_changed_ids, (v_upd->>'id')::UUID);
        END IF;
      END IF;
    END LOOP;

    -- A qty change drives PO line totals — revert any linked, non-delivered PO to draft
    -- so it gets re-processed (mirrors the removal cascade above). Notes-only edits skip this.
    IF array_length(v_qty_changed_ids, 1) > 0 THEN
      SELECT ARRAY_AGG(DISTINCT poi.po_id)
      INTO v_update_po_ids
      FROM purchase_order_request_items pori
      INNER JOIN purchase_order_items poi ON poi.id = pori.po_item_id
      WHERE pori.request_item_id = ANY(v_qty_changed_ids);

      IF v_update_po_ids IS NOT NULL AND array_length(v_update_po_ids, 1) > 0 THEN
        UPDATE purchase_orders SET status = 'draft', updated_at = now()
        WHERE id = ANY(v_update_po_ids)
          AND status NOT IN ('delivered', 'partially_delivered');
      END IF;
    END IF;
  END IF;

  -- ===== Update request's updated_at timestamp =====
  UPDATE material_requests
  SET updated_at = now()
  WHERE id = p_request_id;

  RETURN json_build_object(
    'success', true,
    'removed_items', v_removed_count,
    'added_items', v_added_count,
    'updated_items', v_updated_count,
    'pos_deleted', v_pos_deleted,
    'pos_reverted', v_pos_reverted
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM,
      'error_detail', SQLSTATE
    );
END;
$$;

GRANT EXECUTE ON FUNCTION edit_material_request_items(UUID, UUID, UUID[], JSONB, JSONB) TO authenticated;

COMMENT ON FUNCTION edit_material_request_items(UUID, UUID, UUID[], JSONB, JSONB) IS
'Edit material request items with cascade effects. Validates no delivery records exist
for removed items, cleans up junction records, deletes orphaned POs, reverts affected POs
to draft, inserts new items, and updates existing items'' requested_qty/notes in place
(reverting any linked non-delivered PO to draft).';
