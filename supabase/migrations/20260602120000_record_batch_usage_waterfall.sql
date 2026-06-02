-- record_batch_usage_waterfall: atomically record usage across MANY group-stock
-- batches in ONE transaction — the engine behind the smart waterfall "Log usage".
--
-- WHY: for long-back purchases the engineer only knows a site's TOTAL consumption
-- (e.g. "Srinivasan used 210 of 250 bags") and never logged per batch. The dialog
-- splits that total across the material's batches oldest→newest and submits N
-- allocations. Doing N separate record_batch_usage calls from the client is
-- NON-ATOMIC: a mid-loop failure (a concurrent edit consumed remaining, a dropped
-- connection) leaves earlier batches decremented — and possibly an auto-posted
-- self-use expense — with no rollback, breaking the "sum == total or nothing"
-- promise. A single plpgsql function with a loop is atomic for free: any RAISE
-- aborts the whole function. (The old useRecordGroupStockUsageFIFO did the bad
-- client loop AND called a dead 6-arg signature — it is being retired.)
--
-- Per-allocation semantics are IDENTICAL to record_batch_usage (8-arg,
-- 20260531120000): per-variant remaining check, landed unit cost, is_self_use,
-- batch_usage_records insert, stock_inventory decrement + stock_transactions
-- 'usage' row. A 1-allocation waterfall is byte-identical to one legacy call.
-- Roll-ups stay owned by the AFTER trigger update_batch_quantities_on_usage_change
-- (do NOT touch used_qty here — the 2026-05-30 double-count fix). No
-- daily_material_usage insert, so update_stock_on_usage does not also fire.
--
-- SECURITY INVOKER (like record_batch_usage): relies on the SAME RLS that already
-- permits cross-site group usage via the single-batch dialog. The group-consistency
-- checks below are DATA-integrity guards, not the authorization boundary.

CREATE OR REPLACE FUNCTION public.record_batch_usage_waterfall(
  p_usage_site_id uuid,
  p_material_id uuid,
  p_brand_id uuid,
  p_usage_date date,
  p_work_description text DEFAULT NULL::text,
  p_created_by uuid DEFAULT NULL::uuid,
  p_allocations jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid[]
LANGUAGE plpgsql
AS $function$
DECLARE
  v_group_id uuid;
  v_alloc jsonb;
  v_ref text;
  v_qty numeric;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_created_public uuid;
  -- per-iteration scratch (mirrors record_batch_usage)
  v_batch RECORD;
  v_variant_item RECORD;
  v_variant_used numeric;
  v_variant_remaining numeric;
  v_is_self_use boolean;
  v_settlement_status text;
  v_usage_id uuid;
  v_unit_cost numeric;
  v_unit text;
  v_items_total numeric;
  v_items_qty numeric;
  v_final_payment numeric;
  v_inv_id uuid;
BEGIN
  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array'
     OR jsonb_array_length(p_allocations) = 0 THEN
    RAISE EXCEPTION 'No allocations provided';
  END IF;

  -- Resolve the group from the first batch; assert the usage site is a member.
  SELECT mpe.site_group_id INTO v_group_id
  FROM material_purchase_expenses mpe
  WHERE mpe.ref_code = (p_allocations->0->>'batch_ref_code')
    AND mpe.purchase_type = 'group_stock';

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'First batch % not found or not group_stock',
      (p_allocations->0->>'batch_ref_code');
  END IF;

  PERFORM 1 FROM sites WHERE id = p_usage_site_id AND site_group_id = v_group_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usage site % is not a member of group %', p_usage_site_id, v_group_id;
  END IF;

  -- Map auth.uid → public.users.id once for the stock_transactions.created_by FK.
  SELECT id INTO v_created_public FROM users WHERE auth_id = p_created_by LIMIT 1;

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(p_allocations)
  LOOP
    v_ref := v_alloc->>'batch_ref_code';
    v_qty := (v_alloc->>'quantity')::numeric;

    IF v_qty IS NULL OR v_qty <= 0 THEN
      CONTINUE;  -- skip zero / blank rows
    END IF;

    -- ── Batch lookup + same-group assertion (no cross-group bleed) ──
    SELECT mpe.* INTO v_batch
    FROM material_purchase_expenses mpe
    WHERE mpe.ref_code = v_ref
      AND mpe.purchase_type = 'group_stock';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Batch not found: %', v_ref;
    END IF;
    IF v_batch.site_group_id IS DISTINCT FROM v_group_id THEN
      RAISE EXCEPTION 'Batch % belongs to a different group', v_ref;
    END IF;
    IF v_batch.status = 'completed' THEN
      RAISE EXCEPTION 'Cannot add usage to completed batch: %', v_ref;
    END IF;

    -- ── Variant lookup (material+brand, COALESCE sentinel) ──
    SELECT mpei.*, m.unit AS material_unit INTO v_variant_item
    FROM material_purchase_expense_items mpei
    JOIN materials m ON m.id = mpei.material_id
    WHERE mpei.purchase_expense_id = v_batch.id
      AND mpei.material_id = p_material_id
      AND COALESCE(mpei.brand_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = COALESCE(p_brand_id, '00000000-0000-0000-0000-000000000000'::uuid);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Variant (material=%, brand=%) not in batch %',
        p_material_id, p_brand_id, v_ref;
    END IF;

    -- ── Per-variant remaining check (re-read inside txn → concurrency-safe) ──
    SELECT COALESCE(SUM(bur.quantity), 0) INTO v_variant_used
    FROM batch_usage_records bur
    WHERE bur.batch_ref_code = v_ref
      AND bur.material_id = p_material_id
      AND COALESCE(bur.brand_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = COALESCE(p_brand_id, '00000000-0000-0000-0000-000000000000'::uuid);

    v_variant_remaining := v_variant_item.quantity - v_variant_used;
    IF v_variant_remaining < v_qty THEN
      RAISE EXCEPTION 'Insufficient variant qty in batch %. Available: %, Requested: %',
        v_ref, v_variant_remaining, v_qty;
    END IF;

    -- ── Landed unit cost (verbatim from record_batch_usage) ──
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
      v_ref, v_batch.site_group_id, p_usage_site_id, p_material_id, p_brand_id,
      v_qty, v_unit, v_unit_cost, p_usage_date, p_work_description,
      v_is_self_use, v_settlement_status, p_created_by
    )
    RETURNING id INTO v_usage_id;

    -- material_purchase_expenses roll-ups are maintained SOLELY by the AFTER
    -- trigger update_batch_quantities_on_usage_change.

    -- ── Sync stock_inventory + stock_transactions (mirror record_batch_usage) ──
    SELECT id INTO v_inv_id
    FROM stock_inventory
    WHERE batch_code = v_ref
      AND material_id = p_material_id
    ORDER BY (brand_id IS NOT DISTINCT FROM p_brand_id) DESC,
             (current_qty > 0) DESC,
             current_qty DESC
    LIMIT 1;

    IF v_inv_id IS NOT NULL THEN
      -- available_qty is a GENERATED column — do not set it.
      UPDATE stock_inventory
      SET current_qty      = GREATEST(current_qty - v_qty, 0),
          last_issued_date = p_usage_date,
          updated_at       = now()
      WHERE id = v_inv_id;

      INSERT INTO stock_transactions (
        site_id, inventory_id, transaction_type, transaction_date,
        quantity, unit_cost, total_cost, reference_type, reference_id, created_by
      ) VALUES (
        p_usage_site_id, v_inv_id, 'usage', p_usage_date,
        -v_qty, v_unit_cost, v_qty * v_unit_cost,
        'batch_usage_records', v_usage_id,
        v_created_public
      );
    END IF;

    v_ids := array_append(v_ids, v_usage_id);
  END LOOP;

  IF array_length(v_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No usable allocations (every quantity was zero)';
  END IF;

  RETURN v_ids;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.record_batch_usage_waterfall(
  uuid, uuid, uuid, date, text, uuid, jsonb
) TO authenticated;
