-- Migration: reassign_batch_usage RPC
--
-- Lets an authorized user change which site consumed a group-batch usage record
-- (usage_site_id) plus quantity / work_description, atomically.
--
-- WHY AN RPC: the batch_usage_records UPDATE RLS policy is
--   USING (can_access_site(usage_site_id))  -- no separate WITH CHECK
-- so Postgres reuses USING as the WITH CHECK and requires access to the *new*
-- usage_site_id. can_access_site is admin->all else = ANY(assigned_sites) and is
-- NOT group-aware, so a site engineer assigned only to their own site cannot
-- reassign usage to a sibling cluster site via a direct client UPDATE. Inserts
-- already dodge this via the SECURITY DEFINER record_batch_usage RPC; we mirror it.
--
-- Batch roll-ups (used_qty, remaining_qty, status, self_used_qty, self_used_amount)
-- are recomputed by the AFTER INSERT/UPDATE/DELETE trigger
-- update_batch_quantities_on_usage_change() (migration 20260215100000), which does a
-- full absolute recompute filtered on is_self_use. So we only flip the row and, on a
-- quantity change, adjust stock_inventory.current_qty.

DROP FUNCTION IF EXISTS reassign_batch_usage(uuid, uuid, numeric, text);

CREATE OR REPLACE FUNCTION reassign_batch_usage(
  p_usage_id          uuid,
  p_new_usage_site_id uuid,
  p_new_quantity      numeric DEFAULT NULL,
  p_work_description  text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row          batch_usage_records%ROWTYPE;
  v_batch        RECORD;
  v_new_qty      numeric;
  v_delta        numeric;
  v_payer        uuid;
  v_is_self_use  boolean;
  v_new_status   text;
  v_target_group uuid;
  v_result       jsonb;
BEGIN
  -- 1. Lock the usage row
  SELECT * INTO v_row FROM batch_usage_records WHERE id = p_usage_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usage record not found: %', p_usage_id;
  END IF;

  -- 2. Load its group batch
  SELECT mpe.id, mpe.site_group_id, mpe.paying_site_id, mpe.site_id,
         mpe.original_qty, mpe.remaining_qty
  INTO v_batch
  FROM material_purchase_expenses mpe
  WHERE mpe.ref_code = v_row.batch_ref_code
    AND mpe.purchase_type = 'group_stock';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group batch not found for usage record: %', v_row.batch_ref_code;
  END IF;

  -- 3. Authorize: caller must be able to see the record (its current site).
  --    We deliberately do NOT require access to the new site -- that is the exact
  --    RLS limitation this RPC bypasses; group membership is the correct boundary.
  IF NOT can_access_site(v_row.usage_site_id) THEN
    RAISE EXCEPTION 'Not authorized to edit this usage record';
  END IF;

  -- 4. Target site must be in the same group as the batch
  SELECT site_group_id INTO v_target_group FROM sites WHERE id = p_new_usage_site_id;
  IF v_target_group IS NULL OR v_target_group IS DISTINCT FROM v_batch.site_group_id THEN
    RAISE EXCEPTION 'Target site is not in this batch''s group';
  END IF;

  -- 5. Reject rows already in / past settlement
  IF v_row.settlement_status IN ('settled', 'in_settlement')
     OR v_row.settlement_id IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot edit a usage record that is in or has completed settlement (status=%). Reverse the settlement first.',
      v_row.settlement_status;
  END IF;

  -- 6. Quantity + delta-aware remaining check
  v_new_qty := COALESCE(p_new_quantity, v_row.quantity);
  IF v_new_qty <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than 0';
  END IF;
  v_delta := v_new_qty - v_row.quantity;
  IF v_delta > 0 AND COALESCE(v_batch.remaining_qty, v_batch.original_qty, 0) < v_delta THEN
    RAISE EXCEPTION 'Not enough batch stock. Available: %, additional needed: %',
      COALESCE(v_batch.remaining_qty, v_batch.original_qty, 0), v_delta;
  END IF;

  -- 7. Recompute self-use / settlement status for the new site
  v_payer := COALESCE(v_batch.paying_site_id, v_batch.site_id);
  v_is_self_use := (p_new_usage_site_id = v_payer);
  v_new_status  := CASE WHEN v_is_self_use THEN 'self_use' ELSE 'pending' END;

  -- 8. Single row update (AFTER UPDATE trigger recomputes batch roll-ups)
  UPDATE batch_usage_records
  SET usage_site_id     = p_new_usage_site_id,
      quantity          = v_new_qty,
      work_description  = COALESCE(p_work_description, work_description),
      is_self_use       = v_is_self_use,
      settlement_status = v_new_status,
      updated_at        = now()
  WHERE id = p_usage_id;

  -- 9. Adjust physical batch stock only when quantity changed
  IF v_delta <> 0 THEN
    UPDATE stock_inventory
    SET current_qty = GREATEST(COALESCE(current_qty, 0) - v_delta, 0),
        updated_at  = now()
    WHERE batch_code = v_row.batch_ref_code;
  END IF;

  -- 10. Return the updated row's settlement-relevant fields
  SELECT jsonb_build_object(
           'usage_id', id,
           'usage_site_id', usage_site_id,
           'quantity', quantity,
           'is_self_use', is_self_use,
           'settlement_status', settlement_status,
           'total_cost', total_cost
         )
  INTO v_result
  FROM batch_usage_records
  WHERE id = p_usage_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION reassign_batch_usage(uuid, uuid, numeric, text) TO authenticated;

COMMENT ON FUNCTION reassign_batch_usage(uuid, uuid, numeric, text) IS
'Reassigns a group-batch usage record to a different site in the same group (and
optionally updates quantity/work_description) atomically. SECURITY DEFINER to bypass
the RLS WITH CHECK that blocks moving a row to a sibling site the caller is not
directly assigned to. Recomputes is_self_use/settlement_status; the AFTER UPDATE
trigger update_batch_quantities_on_usage_change recomputes batch self_used totals.
Rejects settled / in_settlement records.';
