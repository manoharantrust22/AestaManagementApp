-- Fix: record_batch_usage double-counts material_purchase_expenses roll-ups.
--
-- Problem (found 2026-05-30 via rolled-back prod trace on MAT-260323-1902):
-- a qty-1 usage moved used_qty 8 -> 10 (+2). Two writers update the same
-- material_purchase_expenses columns on every record_batch_usage call:
--   1. the AFTER-INSERT trigger `update_batch_quantities_on_usage_change` on
--      batch_usage_records — recalculates used_qty/remaining_qty/self_used_qty/
--      self_used_amount/status from the ABSOLUTE SUM of batch_usage_records
--      (correct; also handles UPDATE/DELETE), and
--   2. this function's trailing UPDATE — which ADDS p_quantity again on top.
-- Net: used_qty over by p_quantity, remaining_qty under by p_quantity, per call.
--
-- The trigger is the correct sole maintainer (absolute recalc; its status logic
-- is also more correct — it sets 'completed' at zero remaining, whereas the
-- function body set 'partial_used'). So we DROP the redundant function-body
-- UPDATE entirely. Everything else (landed-cost unit_cost math, variant
-- validation, the batch_usage_records insert) is preserved verbatim from the
-- landed-cost version (migration 20260530231000_batch_usage_unit_cost_landed).
--
-- No data repair: a steady-state audit on 2026-05-30 showed used_qty == SUM(bur)
-- for every group batch (historical rows predate this function/trigger combo or
-- were backfilled), so no drift has accrued yet. This fix prevents future drift.

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

  -- NOTE: material_purchase_expenses roll-ups (used_qty, remaining_qty,
  -- self_used_qty, self_used_amount, status) are maintained SOLELY by the
  -- AFTER INSERT/UPDATE/DELETE trigger `update_batch_quantities_on_usage_change`
  -- on batch_usage_records, which recalculates them from the absolute SUM of
  -- batch_usage_records. The previous in-body incremental UPDATE here was
  -- redundant and double-counted on top of that trigger — removed.

  RETURN v_usage_id;
END;
$function$;
