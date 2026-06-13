-- record_reconciliation_usage: atomic "delete & refill" bulk usage reconciliation
-- across a cluster's group-stock pool, in ONE transaction.
--
-- WHY: for historical group purchases the engineer knows only date-windowed
-- per-site TOTALS ("before Feb 1 Srinivasan used 120 bags"), never per batch. The
-- Reconcile dialog's client allocator turns those windows into explicit per-batch
-- allocations (own-paid-first FIFO, capped at delivered stock as of the window's
-- as-of date) and the ids of the pending records inside those windows to REPLACE.
-- This RPC performs the replace atomically: delete the named pending/self_use
-- records (reversing their stock), then insert the new allocations. Doing it in
-- one function makes it all-or-nothing AND lets the insert-phase remaining checks
-- see the freed capacity from the delete-phase.
--
-- material_id + brand_id travel PER ALLOCATION (not per call): a "PPC Cement" pool
-- is heterogeneous — parent-material batches, child-grade batches (e.g. 43 Grade),
-- and null/branded items all coexist. Each allocation names the exact variant.
--
-- SECURITY DEFINER (like reassign_batch_usage 20260601120000): the
-- batch_usage_records INSERT policy is WITH CHECK (can_access_site(usage_site_id))
-- and can_access_site is NOT group-aware, so an engineer assigned to only one
-- cluster site cannot write the sibling site's usage via a direct insert. We
-- authorize on CLUSTER MEMBERSHIP instead (caller can access at least one site in
-- the group; every target site is in that group), which is the correct boundary.
--
-- Per-allocation INSERT semantics are IDENTICAL to record_batch_usage_waterfall
-- (20260602120000): per-variant remaining check, landed unit cost, is_self_use,
-- the batch_usage_records insert, and the stock_inventory decrement +
-- stock_transactions 'usage' row (guarded on a matching inventory row existing).
-- The DELETE mirrors useDeleteBatchUsage's stock reversal (restore current_qty by
-- the audit row, drop the audit row; FK cascade removes delivery allocations).
-- Roll-ups (used_qty/remaining_qty/status/self_used_*) stay owned by the AFTER
-- trigger update_batch_quantities_on_usage_change — do NOT touch used_qty here.

DROP FUNCTION IF EXISTS public.record_reconciliation_usage(uuid, uuid, uuid, uuid[], jsonb);

CREATE OR REPLACE FUNCTION public.record_reconciliation_usage(
  p_created_by  uuid,
  p_delete_ids  uuid[] DEFAULT ARRAY[]::uuid[],
  p_entries     jsonb  DEFAULT '[]'::jsonb
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_group_id        uuid;
  v_created_public  uuid;
  v_ids             uuid[] := ARRAY[]::uuid[];
  v_del_id          uuid;
  v_del             batch_usage_records%ROWTYPE;
  v_del_group       uuid;
  v_tx              RECORD;
  v_entry           jsonb;
  v_alloc           jsonb;
  v_usage_site_id   uuid;
  v_usage_date      date;
  v_work_desc       text;
  v_ref             text;
  v_qty             numeric;
  v_material_id     uuid;
  v_brand_id        uuid;
  v_batch           RECORD;
  v_variant_item    RECORD;
  v_variant_used    numeric;
  v_variant_remaining numeric;
  v_is_self_use     boolean;
  v_settlement_status text;
  v_usage_id        uuid;
  v_unit_cost       numeric;
  v_unit            text;
  v_items_total     numeric;
  v_items_qty       numeric;
  v_final_payment   numeric;
  v_inv_id          uuid;
BEGIN
  IF p_delete_ids IS NULL THEN
    p_delete_ids := ARRAY[]::uuid[];
  END IF;
  IF p_entries IS NULL OR jsonb_typeof(p_entries) <> 'array' THEN
    p_entries := '[]'::jsonb;
  END IF;

  -- ── Resolve the cluster: first from an entry allocation, else a delete row ──
  IF jsonb_array_length(p_entries) > 0
     AND jsonb_array_length(p_entries->0->'allocations') > 0 THEN
    SELECT mpe.site_group_id INTO v_group_id
    FROM material_purchase_expenses mpe
    WHERE mpe.ref_code = (p_entries->0->'allocations'->0->>'batch_ref_code')
      AND mpe.purchase_type = 'group_stock';
  ELSIF array_length(p_delete_ids, 1) IS NOT NULL THEN
    SELECT mpe.site_group_id INTO v_group_id
    FROM batch_usage_records bur
    JOIN material_purchase_expenses mpe ON mpe.ref_code = bur.batch_ref_code
    WHERE bur.id = p_delete_ids[1];
  END IF;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Could not resolve cluster (no group_stock batch found)';
  END IF;

  -- ── Authorize on cluster membership (the boundary RLS can't express) ──
  IF NOT EXISTS (
    SELECT 1 FROM sites WHERE site_group_id = v_group_id AND can_access_site(id)
  ) THEN
    RAISE EXCEPTION 'Not authorized for this cluster';
  END IF;

  SELECT id INTO v_created_public FROM users WHERE auth_id = p_created_by LIMIT 1;

  -- ════════════════ DELETE PHASE (replace-in-range) ════════════════
  FOREACH v_del_id IN ARRAY p_delete_ids
  LOOP
    SELECT * INTO v_del FROM batch_usage_records WHERE id = v_del_id FOR UPDATE;
    IF NOT FOUND THEN
      CONTINUE;  -- already gone; idempotent
    END IF;

    IF v_del.settlement_status IN ('settled', 'in_settlement')
       OR v_del.settlement_id IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot replace a settled/in-settlement usage record (%).', v_del_id;
    END IF;

    SELECT mpe.site_group_id INTO v_del_group
    FROM material_purchase_expenses mpe
    WHERE mpe.ref_code = v_del.batch_ref_code;
    IF v_del_group IS DISTINCT FROM v_group_id THEN
      RAISE EXCEPTION 'Delete target % belongs to a different cluster', v_del_id;
    END IF;

    -- Reverse the stock side exactly as recorded (keyed by reference_id, so a
    -- record made without a stock row is left untouched — no over-restore).
    FOR v_tx IN
      SELECT id, inventory_id, quantity
      FROM stock_transactions
      WHERE reference_type = 'batch_usage_records' AND reference_id = v_del_id
    LOOP
      IF v_tx.inventory_id IS NOT NULL AND ABS(COALESCE(v_tx.quantity, 0)) > 0 THEN
        UPDATE stock_inventory
        SET current_qty = COALESCE(current_qty, 0) + ABS(v_tx.quantity),
            updated_at  = now()
        WHERE id = v_tx.inventory_id;
      END IF;
      DELETE FROM stock_transactions WHERE id = v_tx.id;
    END LOOP;

    -- FK cascade drops batch_usage_delivery_allocations; AFTER DELETE trigger
    -- recomputes the batch roll-ups.
    DELETE FROM batch_usage_records WHERE id = v_del_id;
  END LOOP;

  -- ════════════════ INSERT PHASE ════════════════
  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
  LOOP
    v_usage_site_id := (v_entry->>'usage_site_id')::uuid;
    v_usage_date    := (v_entry->>'usage_date')::date;
    v_work_desc     := v_entry->>'work_description';

    PERFORM 1 FROM sites WHERE id = v_usage_site_id AND site_group_id = v_group_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Usage site % is not a member of cluster %', v_usage_site_id, v_group_id;
    END IF;

    FOR v_alloc IN SELECT * FROM jsonb_array_elements(v_entry->'allocations')
    LOOP
      v_ref         := v_alloc->>'batch_ref_code';
      v_qty         := (v_alloc->>'quantity')::numeric;
      v_material_id := (v_alloc->>'material_id')::uuid;
      v_brand_id    := NULLIF(v_alloc->>'brand_id', '')::uuid;
      IF v_qty IS NULL OR v_qty <= 0 OR v_material_id IS NULL THEN
        CONTINUE;
      END IF;

      SELECT mpe.* INTO v_batch
      FROM material_purchase_expenses mpe
      WHERE mpe.ref_code = v_ref AND mpe.purchase_type = 'group_stock';
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Batch not found: %', v_ref;
      END IF;
      IF v_batch.site_group_id IS DISTINCT FROM v_group_id THEN
        RAISE EXCEPTION 'Batch % belongs to a different cluster', v_ref;
      END IF;
      IF v_batch.status = 'completed' THEN
        RAISE EXCEPTION 'Cannot add usage to completed batch: %', v_ref;
      END IF;

      SELECT mpei.*, m.unit AS material_unit INTO v_variant_item
      FROM material_purchase_expense_items mpei
      JOIN materials m ON m.id = mpei.material_id
      WHERE mpei.purchase_expense_id = v_batch.id
        AND mpei.material_id = v_material_id
        AND COALESCE(mpei.brand_id, '00000000-0000-0000-0000-000000000000'::uuid)
            = COALESCE(v_brand_id, '00000000-0000-0000-0000-000000000000'::uuid);
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Variant (material=%, brand=%) not in batch %',
          v_material_id, v_brand_id, v_ref;
      END IF;

      -- Per-variant remaining (re-read inside txn → sees the delete-phase frees).
      SELECT COALESCE(SUM(bur.quantity), 0) INTO v_variant_used
      FROM batch_usage_records bur
      WHERE bur.batch_ref_code = v_ref
        AND bur.material_id = v_material_id
        AND COALESCE(bur.brand_id, '00000000-0000-0000-0000-000000000000'::uuid)
            = COALESCE(v_brand_id, '00000000-0000-0000-0000-000000000000'::uuid);

      v_variant_remaining := v_variant_item.quantity - v_variant_used;
      IF v_variant_remaining < v_qty THEN
        RAISE EXCEPTION 'Insufficient variant qty in batch %. Available: %, Requested: %',
          v_ref, v_variant_remaining, v_qty;
      END IF;

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
      v_is_self_use := (v_usage_site_id = v_batch.paying_site_id);
      v_settlement_status := CASE WHEN v_is_self_use THEN 'self_use' ELSE 'pending' END;

      INSERT INTO batch_usage_records (
        batch_ref_code, site_group_id, usage_site_id, material_id, brand_id,
        quantity, unit, unit_cost, usage_date, work_description,
        is_self_use, settlement_status, created_by
      ) VALUES (
        v_ref, v_batch.site_group_id, v_usage_site_id, v_material_id, v_brand_id,
        v_qty, v_unit, v_unit_cost, v_usage_date, v_work_desc,
        v_is_self_use, v_settlement_status, p_created_by
      )
      RETURNING id INTO v_usage_id;

      SELECT id INTO v_inv_id
      FROM stock_inventory
      WHERE batch_code = v_ref AND material_id = v_material_id
      ORDER BY (brand_id IS NOT DISTINCT FROM v_brand_id) DESC,
               (current_qty > 0) DESC,
               current_qty DESC
      LIMIT 1;

      IF v_inv_id IS NOT NULL THEN
        UPDATE stock_inventory
        SET current_qty      = GREATEST(current_qty - v_qty, 0),
            last_issued_date = v_usage_date,
            updated_at       = now()
        WHERE id = v_inv_id;

        INSERT INTO stock_transactions (
          site_id, inventory_id, transaction_type, transaction_date,
          quantity, unit_cost, total_cost, reference_type, reference_id, created_by
        ) VALUES (
          v_usage_site_id, v_inv_id, 'usage', v_usage_date,
          -v_qty, v_unit_cost, v_qty * v_unit_cost,
          'batch_usage_records', v_usage_id, v_created_public
        );
      END IF;

      v_ids := array_append(v_ids, v_usage_id);
    END LOOP;
  END LOOP;

  RETURN v_ids;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.record_reconciliation_usage(uuid, uuid[], jsonb) TO authenticated;

COMMENT ON FUNCTION public.record_reconciliation_usage(uuid, uuid[], jsonb) IS
'Atomic delete-&-refill bulk usage reconciliation across a cluster''s group-stock
pool. Deletes the named pending/self_use records (reversing stock) then inserts the
new per-batch allocations (material_id/brand_id per allocation), all in one
transaction. SECURITY DEFINER to bypass the can_access_site WITH CHECK that blocks
cross-site usage writes; authorizes on cluster membership. Insert semantics mirror
record_batch_usage_waterfall; roll-ups owned by update_batch_quantities_on_usage_change.';
