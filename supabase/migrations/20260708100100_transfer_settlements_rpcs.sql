-- Inter-site salary settlement transfer — the write RPCs.
--
-- transfer_settlements_to_site(): move salary settlements (whole rows or an exact
--   amount) from one site to a sibling site in the same group. Double-entry:
--   origin rows are stamped out of the money readers (kept as a read-only trace),
--   destination twins are created on the other site.
-- reverse_settlement_transfer(): undo a transfer, lossless via the lp snapshot.
--
-- Both SECURITY DEFINER: the caller is typically assigned only to the ORIGIN
-- site, not the destination — the same RLS gap reassign_batch_usage() documents.
-- Group membership (same site_group_id) is the real authorization boundary.

-- ===========================================================================
-- transfer_settlements_to_site
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.transfer_settlements_to_site(
  p_to_site_id          uuid,
  p_mode                text,                          -- 'rows' | 'amount'
  p_settlement_ids      uuid[]  DEFAULT NULL,          -- rows mode: explicit origin ids
  p_target_amount       numeric DEFAULT NULL,          -- amount mode: exact rupees to move
  p_from_site_id        uuid    DEFAULT NULL,          -- required for amount mode
  p_from_subcontract_id uuid    DEFAULT NULL,          -- amount mode scope (matches the hero)
  p_dest_subcontract_id uuid    DEFAULT NULL,          -- NULL = unlinked (still contract salary)
  p_payer_source        text    DEFAULT 'own_money',
  p_payer_name          text    DEFAULT NULL,
  p_payer_source_split  jsonb   DEFAULT NULL,
  p_reason              text    DEFAULT NULL,
  p_idempotency_key     uuid    DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id     uuid;
  v_caller_role   user_role;
  v_caller_name   text;
  v_from_site     uuid;
  v_from_name     text;
  v_from_group    uuid;
  v_to_name       text;
  v_to_group      uuid;
  v_payer_name    text;
  v_transfer_id   uuid;
  v_candidates    uuid[];
  v_origin_id     uuid;
  v_sg            settlement_groups%ROWTYPE;
  v_remaining     numeric;
  v_move          numeric;
  v_keep          numeric;
  v_has_attn      boolean;
  v_twin_id       uuid;
  v_ref           text;
  v_date_code     text;
  v_seq           int;
  v_moved         numeric := 0;
  v_twin_ids      uuid[] := '{}';
  v_origin_ids    uuid[] := '{}';
  v_snapshot      jsonb := '[]'::jsonb;
  v_existing      settlement_transfers%ROWTYPE;
BEGIN
  -- 0. Idempotency ---------------------------------------------------------
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing FROM settlement_transfers WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'transfer_id', v_existing.id, 'idempotent_replay', true,
        'moved_amount', v_existing.moved_amount, 'mode', v_existing.mode);
    END IF;
  END IF;

  IF p_mode NOT IN ('rows','amount') THEN
    RAISE EXCEPTION 'transfer_settlements_to_site: p_mode must be rows or amount' USING ERRCODE = '22023';
  END IF;

  -- 1. Caller --------------------------------------------------------------
  SELECT id, role, name INTO v_caller_id, v_caller_role, v_caller_name
  FROM users WHERE auth_id = auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized: no application user for the current session' USING ERRCODE = '42501';
  END IF;

  -- 2. Resolve the origin site --------------------------------------------
  IF p_mode = 'rows' THEN
    IF p_settlement_ids IS NULL OR array_length(p_settlement_ids, 1) IS NULL THEN
      RAISE EXCEPTION 'rows mode requires p_settlement_ids' USING ERRCODE = '22023';
    END IF;
    SELECT array_agg(DISTINCT site_id) INTO v_candidates
    FROM settlement_groups WHERE id = ANY(p_settlement_ids);
    IF v_candidates IS NULL OR array_length(v_candidates, 1) <> 1 THEN
      RAISE EXCEPTION 'All selected settlements must belong to a single origin site' USING ERRCODE = '22023';
    END IF;
    v_from_site := v_candidates[1];
  ELSE
    IF p_from_site_id IS NULL THEN
      RAISE EXCEPTION 'amount mode requires p_from_site_id' USING ERRCODE = '22023';
    END IF;
    IF p_target_amount IS NULL OR p_target_amount <= 0 THEN
      RAISE EXCEPTION 'amount mode requires a positive p_target_amount' USING ERRCODE = '22023';
    END IF;
    v_from_site := p_from_site_id;
  END IF;

  IF v_from_site = p_to_site_id THEN
    RAISE EXCEPTION 'Cannot transfer to the same site' USING ERRCODE = '22023';
  END IF;

  -- 3. Group guard (the real authorization boundary) ----------------------
  SELECT name, site_group_id INTO v_from_name, v_from_group FROM sites WHERE id = v_from_site;
  SELECT name, site_group_id INTO v_to_name,   v_to_group   FROM sites WHERE id = p_to_site_id;
  IF v_to_group IS NULL OR v_from_group IS NULL OR v_from_group IS DISTINCT FROM v_to_group THEN
    RAISE EXCEPTION 'Both sites must belong to the same group' USING ERRCODE = '22023';
  END IF;

  -- 4. Authorize on the ORIGIN site only ----------------------------------
  IF NOT (v_caller_role IN ('admin','office') OR public.can_access_site(v_from_site)) THEN
    RAISE EXCEPTION 'Not authorized to move settlements from this site' USING ERRCODE = '42501';
  END IF;

  -- 5. Destination subcontract must live on the destination site ----------
  IF p_dest_subcontract_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM subcontracts sc WHERE sc.id = p_dest_subcontract_id AND sc.site_id = p_to_site_id) THEN
      RAISE EXCEPTION 'Destination contract does not belong to the destination site' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- 6. Resolve the twin payer label (so custom sources render correctly in
  --    v_all_expenses, whose CASE falls through to payer_name for non-builtins)
  v_payer_name := COALESCE(
    p_payer_name,
    (SELECT label FROM payer_sources WHERE site_id = p_to_site_id AND key = p_payer_source)
  );

  -- 7. Build the ordered candidate set ------------------------------------
  IF p_mode = 'rows' THEN
    -- validate every id is movable
    FOREACH v_origin_id IN ARRAY p_settlement_ids LOOP
      SELECT * INTO v_sg FROM settlement_groups WHERE id = v_origin_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Settlement % not found', v_origin_id USING ERRCODE = 'P0002';
      END IF;
      IF v_sg.is_cancelled OR v_sg.is_archived OR v_sg.transferred_out_at IS NOT NULL
         OR v_sg.transfer_id IS NOT NULL OR COALESCE(v_sg.payment_type,'salary') <> 'salary'
         OR NOT EXISTS (SELECT 1 FROM labor_payments lp WHERE lp.settlement_group_id = v_sg.id
                        AND lp.is_under_contract = true AND lp.is_archived = false) THEN
        RAISE EXCEPTION 'Settlement % is not a movable contract-salary settlement', v_sg.settlement_reference
          USING ERRCODE = '22023';
      END IF;
    END LOOP;
    v_candidates := p_settlement_ids;
  ELSE
    SELECT array_agg(sg.id ORDER BY sg.settlement_date DESC, sg.id DESC) INTO v_candidates
    FROM settlement_groups sg
    WHERE sg.site_id = v_from_site
      AND sg.is_cancelled = false AND sg.is_archived = false
      AND sg.transferred_out_at IS NULL AND sg.transfer_id IS NULL
      AND COALESCE(sg.payment_type,'salary') = 'salary'
      AND (p_from_subcontract_id IS NULL OR sg.subcontract_id = p_from_subcontract_id)
      AND EXISTS (SELECT 1 FROM labor_payments lp WHERE lp.settlement_group_id = sg.id
                  AND lp.is_under_contract = true AND lp.is_archived = false);
  END IF;

  IF v_candidates IS NULL OR array_length(v_candidates, 1) IS NULL THEN
    RAISE EXCEPTION 'No movable settlements found' USING ERRCODE = '22023';
  END IF;

  -- 8. Header --------------------------------------------------------------
  INSERT INTO settlement_transfers (
    site_group_id, from_site_id, to_site_id, mode, target_amount,
    dest_subcontract_id, payer_source, payer_name, payer_source_split, reason,
    transferred_by, transferred_by_name, idempotency_key)
  VALUES (
    v_from_group, v_from_site, p_to_site_id, p_mode, p_target_amount,
    p_dest_subcontract_id, p_payer_source, v_payer_name, p_payer_source_split, p_reason,
    v_caller_id, v_caller_name, p_idempotency_key)
  RETURNING id INTO v_transfer_id;

  v_remaining := p_target_amount;   -- NULL for rows mode

  -- 9. Process each candidate ---------------------------------------------
  FOREACH v_origin_id IN ARRAY v_candidates LOOP
    EXIT WHEN p_mode = 'amount' AND v_remaining <= 0.005;

    SELECT * INTO v_sg FROM settlement_groups WHERE id = v_origin_id FOR UPDATE;

    -- re-validate under the row lock (guards against a concurrent transfer /
    -- cancel between candidate selection and processing)
    IF v_sg.is_cancelled OR v_sg.is_archived OR v_sg.transferred_out_at IS NOT NULL
       OR v_sg.transfer_id IS NOT NULL THEN
      CONTINUE;
    END IF;

    v_has_attn := EXISTS (SELECT 1 FROM daily_attendance da
                          WHERE da.settlement_group_id = v_sg.id AND da.is_archived = false);

    IF p_mode = 'amount' AND v_remaining < v_sg.total_amount THEN
      -- boundary row: only split an attendance-free row (a split of an
      -- attendance-linked row would be clobbered by the recompute trigger)
      IF v_has_attn OR v_remaining <= 0.005 THEN
        CONTINUE;
      END IF;
      v_move := round(v_remaining, 2);
    ELSE
      v_move := v_sg.total_amount;     -- full move
    END IF;

    v_date_code := to_char(COALESCE(v_sg.settlement_date, CURRENT_DATE), 'YYMMDD');

    -- snapshot the origin labor_payments we are about to touch (for reversal)
    v_snapshot := v_snapshot || COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', lp.id, 'amount', lp.amount, 'is_archived', lp.is_archived))
      FROM labor_payments lp
      WHERE lp.settlement_group_id = v_sg.id AND lp.is_under_contract = true AND lp.is_archived = false
    ), '[]'::jsonb);

    -- create the destination twin settlement (fresh SET- ref, retry on race)
    LOOP
      SELECT COALESCE(MAX((substring(settlement_reference from '^SET-' || v_date_code || '-(\d+)$'))::int), 0) + 1
        INTO v_seq
      FROM settlement_groups
      WHERE settlement_reference LIKE 'SET-' || v_date_code || '-%';
      v_ref := 'SET-' || v_date_code || '-' || lpad(v_seq::text, 3, '0');
      BEGIN
        INSERT INTO settlement_groups (
          settlement_reference, site_id, settlement_date, actual_payment_date, total_amount,
          laborer_count, payment_channel, payment_mode, payment_type,
          payer_source, payer_name, payer_source_split, subcontract_id,
          engineer_transaction_id, notes, created_by, created_by_name,
          transfer_id, transfer_role, transfer_from_settlement_id, transfer_from_site_id)
        VALUES (
          v_ref, p_to_site_id, v_sg.settlement_date,
          COALESCE(v_sg.actual_payment_date, v_sg.settlement_date), v_move,
          v_sg.laborer_count, 'direct', v_sg.payment_mode, 'salary',
          p_payer_source, v_payer_name, p_payer_source_split, p_dest_subcontract_id,
          NULL, 'Moved from ' || v_from_name || ' (' || v_sg.settlement_reference || ')',
          v_caller_id, v_caller_name,
          v_transfer_id, 'destination', v_sg.id, v_from_site)
        RETURNING id INTO v_twin_id;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        -- another writer took this ref; recompute and retry
      END;
    END LOOP;

    -- mirror labor_payments onto the twin (scaled to the moved portion) so it
    -- classifies as CONTRACT salary on the destination (expenses + slice)
    INSERT INTO labor_payments (
      laborer_id, site_id, subcontract_id, amount, payment_date, payment_for_date,
      payment_mode, payment_channel, paid_by, paid_by_user_id, is_under_contract,
      recorded_by, recorded_by_user_id, settlement_group_id, payment_type,
      actual_payment_date, is_archived, notes)
    SELECT
      lp.laborer_id, p_to_site_id, p_dest_subcontract_id,
      round(lp.amount * v_move / NULLIF(v_sg.total_amount,0), 2),
      COALESCE(lp.payment_date, v_sg.settlement_date), lp.payment_for_date,
      COALESCE(lp.payment_mode, v_sg.payment_mode, 'cash'), 'direct',
      v_caller_name, v_caller_id, true, v_caller_name, v_caller_id, v_twin_id, 'salary',
      COALESCE(lp.actual_payment_date, lp.payment_for_date), false,
      'Moved from ' || v_from_name
    FROM labor_payments lp
    WHERE lp.settlement_group_id = v_sg.id AND lp.is_under_contract = true AND lp.is_archived = false;

    -- fix rounding so the twin lp sum equals v_move exactly
    UPDATE labor_payments SET amount = amount + (v_move - (
        SELECT COALESCE(SUM(amount),0) FROM labor_payments WHERE settlement_group_id = v_twin_id AND is_archived = false))
    WHERE id = (SELECT id FROM labor_payments WHERE settlement_group_id = v_twin_id AND is_archived = false
                ORDER BY amount DESC NULLS LAST LIMIT 1);

    IF v_move >= v_sg.total_amount THEN
      -- FULL move: stamp origin out, archive its labor_payments (kept for the
      -- read-only trace; excluded from money readers)
      UPDATE labor_payments SET is_archived = true
      WHERE settlement_group_id = v_sg.id AND is_under_contract = true AND is_archived = false;

      UPDATE settlement_groups
      SET transferred_out_at = now(), transfer_id = v_transfer_id,
          transfer_role = 'origin', transfer_to_site_id = p_to_site_id
      WHERE id = v_sg.id;
    ELSE
      -- PARTIAL move: reduce the origin in place; scale its labor_payments to
      -- the remainder (v_keep) so labor_payment-summing readers stay consistent
      v_keep := v_sg.total_amount - v_move;

      UPDATE labor_payments SET amount = round(amount * v_keep / NULLIF(v_sg.total_amount,0), 2)
      WHERE settlement_group_id = v_sg.id AND is_under_contract = true AND is_archived = false;

      UPDATE labor_payments SET amount = amount + (v_keep - (
          SELECT COALESCE(SUM(amount),0) FROM labor_payments
          WHERE settlement_group_id = v_sg.id AND is_under_contract = true AND is_archived = false))
      WHERE id = (SELECT id FROM labor_payments WHERE settlement_group_id = v_sg.id
                  AND is_under_contract = true AND is_archived = false
                  ORDER BY amount DESC NULLS LAST LIMIT 1);

      UPDATE settlement_groups
      SET total_amount = v_keep, transfer_original_total = v_sg.total_amount,
          transfer_id = v_transfer_id, transfer_role = 'origin', transfer_to_site_id = p_to_site_id
      WHERE id = v_sg.id;
    END IF;

    v_moved       := v_moved + v_move;
    v_twin_ids    := v_twin_ids || v_twin_id;
    v_origin_ids  := v_origin_ids || v_sg.id;
    IF p_mode = 'amount' THEN
      v_remaining := v_remaining - v_move;
    END IF;
  END LOOP;

  IF v_moved <= 0.005 THEN
    RAISE EXCEPTION 'Nothing could be moved (no eligible rows for the requested amount)' USING ERRCODE = '22023';
  END IF;

  UPDATE settlement_transfers
  SET moved_amount = v_moved, origin_lp_snapshot = v_snapshot
  WHERE id = v_transfer_id;

  RETURN jsonb_build_object(
    'transfer_id',  v_transfer_id,
    'mode',         p_mode,
    'moved_amount', v_moved,
    'target_amount', p_target_amount,
    'shortfall',    CASE WHEN p_mode = 'amount' THEN GREATEST(p_target_amount - v_moved, 0) ELSE 0 END,
    'twin_ids',     to_jsonb(v_twin_ids),
    'origin_ids',   to_jsonb(v_origin_ids),
    'from_site_id', v_from_site,
    'to_site_id',   p_to_site_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.transfer_settlements_to_site(uuid,text,uuid[],numeric,uuid,uuid,uuid,text,text,jsonb,text,uuid)
  TO authenticated, service_role;

-- ===========================================================================
-- reverse_settlement_transfer
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.reverse_settlement_transfer(
  p_transfer_id uuid,
  p_reason      text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_t             settlement_transfers%ROWTYPE;
  v_caller_id     uuid;
  v_caller_role   user_role;
  v_caller_name   text;
  v_snap          jsonb;
  v_origins       int := 0;
  v_twins         int := 0;
BEGIN
  SELECT * INTO v_t FROM settlement_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer % not found', p_transfer_id USING ERRCODE = 'P0002';
  END IF;
  IF v_t.is_reversed THEN
    RETURN jsonb_build_object('transfer_id', v_t.id, 'already_reversed', true);
  END IF;

  SELECT id, role, name INTO v_caller_id, v_caller_role, v_caller_name
  FROM users WHERE auth_id = auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized: no application user for the current session' USING ERRCODE = '42501';
  END IF;
  IF NOT (v_caller_role IN ('admin','office') OR v_caller_id = v_t.transferred_by) THEN
    RAISE EXCEPTION 'Not authorized to reverse this transfer (only the recorder or office/admin).' USING ERRCODE = '42501';
  END IF;

  -- 1. Restore origin settlements (full: clear stamp; partial: restore total)
  UPDATE settlement_groups
  SET transferred_out_at = NULL,
      total_amount = COALESCE(transfer_original_total, total_amount),
      transfer_original_total = NULL,
      transfer_id = NULL, transfer_role = NULL, transfer_to_site_id = NULL
  WHERE transfer_id = v_t.id AND transfer_role = 'origin';
  GET DIAGNOSTICS v_origins = ROW_COUNT;

  -- 2. Restore origin labor_payments exactly from the snapshot
  FOR v_snap IN SELECT * FROM jsonb_array_elements(v_t.origin_lp_snapshot) LOOP
    UPDATE labor_payments
    SET amount = (v_snap->>'amount')::numeric,
        is_archived = (v_snap->>'is_archived')::boolean
    WHERE id = (v_snap->>'id')::uuid;
  END LOOP;

  -- 3. Soft-cancel the destination twins + archive their labor_payments
  UPDATE labor_payments SET is_archived = true
  WHERE settlement_group_id IN (
    SELECT id FROM settlement_groups WHERE transfer_id = v_t.id AND transfer_role = 'destination');

  UPDATE settlement_groups
  SET is_cancelled = true, cancelled_at = now(), cancelled_by = v_caller_name,
      cancelled_by_user_id = v_caller_id,
      cancellation_reason = COALESCE(p_reason, 'Transfer reversed')
  WHERE transfer_id = v_t.id AND transfer_role = 'destination' AND is_cancelled = false;
  GET DIAGNOSTICS v_twins = ROW_COUNT;

  UPDATE settlement_transfers
  SET is_reversed = true, reversed_at = now(), reversed_by = v_caller_id, reversal_reason = p_reason
  WHERE id = v_t.id;

  RETURN jsonb_build_object(
    'transfer_id', v_t.id, 'already_reversed', false,
    'origins_restored', v_origins, 'twins_cancelled', v_twins);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reverse_settlement_transfer(uuid,text) TO authenticated, service_role;
