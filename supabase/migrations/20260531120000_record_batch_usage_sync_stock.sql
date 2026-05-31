-- Fix: record_batch_usage records a batch_usage_record but never touches
-- stock_inventory / stock_transactions — the record-side mirror of the
-- delete-side bug fixed in useDeleteBatchUsage (2026-05-31).
--
-- Symptom: logging group-batch usage via RecordBatchUsageDialog
-- (useRecordBatchUsage → this RPC) updated the material_purchase_expenses
-- roll-up (via the AFTER-INSERT trigger on batch_usage_records) but left
-- stock_inventory.current_qty and stock_transactions untouched. The Material
-- Hub INVENTORY·STOCK block reads exactly those (Remaining = current_qty,
-- Used = Σ usage transactions), so it showed no change after recording usage.
--
-- Fix: after inserting the batch_usage_record, decrement the matching variant's
-- stock_inventory row and write a 'usage' stock_transaction tagged
-- reference_type='batch_usage_records' — mirroring what the inventory-page bulk
-- path (useMaterialUsage GROUP STOCK PATH) already does in JS.
--
-- Safety (no double-decrement): the ONLY caller of this 8-arg signature is
-- useRecordBatchUsage; it does not insert daily_material_usage, so the
-- update_stock_on_usage trigger does not also fire for the same consumption.
-- The own-stock sync callers (useMaterialUsage useCreate/FIFO) call a 6-arg
-- signature that no longer exists (they no-op) and ALSO insert
-- daily_material_usage first — so they must NOT be wired to this RPC without a
-- sync guard, or they would decrement twice. Everything above the stock-sync
-- block is preserved verbatim from 20260530240000 (landed-cost version).
--
-- created_by note: batch_usage_records.created_by → auth.users, but
-- stock_transactions.created_by → public.users. Map auth_id → public.users.id
-- (NULL when unmapped) so the stock tx insert does not violate the FK.

CREATE OR REPLACE FUNCTION public.record_batch_usage(
  p_batch_ref_code text,
  p_usage_site_id uuid,
  p_material_id uuid,
  p_brand_id uuid,
  p_quantity numeric,
  p_usage_date date,
  p_work_description text DEFAULT NULL::text,
  p_created_by uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
AS $function$
DECLARE
  v_batch RECORD;
  v_variant_item RECORD;
  v_variant_used NUMERIC;
  v_variant_remaining NUMERIC;
  v_is_self_use BOOLEAN;
  v_settlement_status TEXT;
  v_usage_id UUID;
  v_unit_cost NUMERIC;
  v_unit TEXT;
  v_items_total NUMERIC;
  v_items_qty NUMERIC;
  v_final_payment NUMERIC;
  v_inv_id UUID;
BEGIN
  SELECT mpe.*
  INTO v_batch
  FROM material_purchase_expenses mpe
  WHERE mpe.ref_code = p_batch_ref_code
    AND mpe.purchase_type = 'group_stock';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch not found: %', p_batch_ref_code;
  END IF;

  IF v_batch.status = 'completed' THEN
    RAISE EXCEPTION 'Cannot add usage to completed batch: %', p_batch_ref_code;
  END IF;

  SELECT mpei.*, m.unit AS material_unit
  INTO v_variant_item
  FROM material_purchase_expense_items mpei
  JOIN materials m ON m.id = mpei.material_id
  WHERE mpei.purchase_expense_id = v_batch.id
    AND mpei.material_id = p_material_id
    AND COALESCE(mpei.brand_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(p_brand_id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Variant (material=%, brand=%) not in batch %',
      p_material_id, p_brand_id, p_batch_ref_code;
  END IF;

  SELECT COALESCE(SUM(bur.quantity), 0)
  INTO v_variant_used
  FROM batch_usage_records bur
  WHERE bur.batch_ref_code = p_batch_ref_code
    AND bur.material_id = p_material_id
    AND COALESCE(bur.brand_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(p_brand_id, '00000000-0000-0000-0000-000000000000'::uuid);

  v_variant_remaining := v_variant_item.quantity - v_variant_used;

  IF v_variant_remaining < p_quantity THEN
    RAISE EXCEPTION 'Insufficient variant qty in batch %. Variant available: %, Requested: %',
      p_batch_ref_code, v_variant_remaining, p_quantity;
  END IF;

  -- Landed unit cost: scale the variant item-line price to the actual amount
  -- paid for the whole batch (incl. transport/loading), keeping per-variant
  -- proportions. Flat per-unit fallback when item lines are missing.
  SELECT SUM(mpei.total_price), SUM(mpei.quantity)
  INTO v_items_total, v_items_qty
  FROM material_purchase_expense_items mpei
  WHERE mpei.purchase_expense_id = v_batch.id;

  v_final_payment := COALESCE(v_batch.amount_paid, v_batch.total_amount);

  IF COALESCE(v_items_total, 0) > 0 AND v_variant_item.unit_price IS NOT NULL THEN
    v_unit_cost := v_variant_item.unit_price * (v_final_payment / v_items_total);
  ELSE
    v_unit_cost := v_final_payment
      / NULLIF(COALESCE(v_batch.original_qty, v_items_qty), 0);
  END IF;

  v_unit := COALESCE(v_variant_item.material_unit, 'nos');

  v_is_self_use := (p_usage_site_id = v_batch.paying_site_id);
  v_settlement_status := CASE WHEN v_is_self_use THEN 'self_use' ELSE 'pending' END;

  INSERT INTO batch_usage_records (
    batch_ref_code, site_group_id, usage_site_id, material_id, brand_id,
    quantity, unit, unit_cost, usage_date, work_description,
    is_self_use, settlement_status, created_by
  ) VALUES (
    p_batch_ref_code, v_batch.site_group_id, p_usage_site_id, p_material_id, p_brand_id,
    p_quantity, v_unit, v_unit_cost, p_usage_date, p_work_description,
    v_is_self_use, v_settlement_status, p_created_by
  )
  RETURNING id INTO v_usage_id;

  -- material_purchase_expenses roll-ups are maintained SOLELY by the AFTER
  -- INSERT/UPDATE/DELETE trigger update_batch_quantities_on_usage_change.

  -- ── Sync stock_inventory + stock_transactions ─────────────────────────────
  -- The Hub INVENTORY·STOCK block reads current_qty (Remaining) and the sum of
  -- 'usage' transactions (Used). Decrement the matching variant's inventory row
  -- and write the audit tx so the Hub reflects the consumption. The DELETE-side
  -- reversal (useDeleteBatchUsage) replays this tx by reference_id.
  SELECT id INTO v_inv_id
  FROM stock_inventory
  WHERE batch_code = p_batch_ref_code
    AND material_id = p_material_id
  ORDER BY (brand_id IS NOT DISTINCT FROM p_brand_id) DESC,
           (current_qty > 0) DESC,
           current_qty DESC
  LIMIT 1;

  IF v_inv_id IS NOT NULL THEN
    -- available_qty is a GENERATED column (derived from current_qty) — do not set it.
    UPDATE stock_inventory
    SET current_qty      = GREATEST(current_qty - p_quantity, 0),
        last_issued_date = p_usage_date,
        updated_at       = now()
    WHERE id = v_inv_id;

    INSERT INTO stock_transactions (
      site_id, inventory_id, transaction_type, transaction_date,
      quantity, unit_cost, total_cost, reference_type, reference_id, created_by
    ) VALUES (
      p_usage_site_id, v_inv_id, 'usage', p_usage_date,
      -p_quantity, v_unit_cost, p_quantity * v_unit_cost,
      'batch_usage_records', v_usage_id,
      (SELECT id FROM users WHERE auth_id = p_created_by LIMIT 1)
    );
  END IF;

  RETURN v_usage_id;
END;
$function$;
