-- Fix `link_settlement_group_to_subcontract`: drop the now-dead cascade to
-- site_engineer_transactions.related_subcontract_id.
--
-- That column was removed by 20260509120100_wallet_v2_simplify_transactions
-- four days after the original RPC migration (20260505100000) was written.
-- Wallet v2 deliberately removed the per-row subcontract linkage from the
-- engineer ledger; there is no replacement column to cascade to.
--
-- Symptom before this fix: PostgREST returned 400 with
--   "column related_subcontract_id of relation site_engineer_transactions
--    does not exist"
-- whenever the user clicked "Link to subcontract" on an unlinked settlement
-- that had a non-NULL engineer_transaction_id. CREATE OR REPLACE FUNCTION
-- with plpgsql doesn't validate column references at DDL time, so the
-- function deployed cleanly back in May and only fires the error on actual
-- execution of the dead UPDATE branch.
--
-- Cascade targets after this fix (all keyed by settlement_group_id):
--   1. settlement_groups.subcontract_id
--   2. daily_attendance.subcontract_id
--   3. market_laborer_attendance.subcontract_id
--   4. labor_payments.subcontract_id
-- (Engineer-transactions branch removed.)

CREATE OR REPLACE FUNCTION public.link_settlement_group_to_subcontract(
  p_group_id uuid,
  p_subcontract_id uuid
) RETURNS jsonb
  LANGUAGE plpgsql VOLATILE
  SECURITY INVOKER
  SET search_path = public
AS $$
DECLARE
  v_site_id              uuid;
  v_attendance_updated   integer := 0;
  v_market_updated       integer := 0;
  v_payments_updated     integer := 0;
BEGIN
  -- 1. Validate the group exists and capture its site_id.
  SELECT sg.site_id
    INTO v_site_id
    FROM public.settlement_groups sg
   WHERE sg.id = p_group_id;

  IF v_site_id IS NULL THEN
    RAISE EXCEPTION 'link_settlement_group_to_subcontract: settlement_group % not found', p_group_id;
  END IF;

  -- 2. If a target subcontract was given, sanity-check it belongs to the
  --    same site. (NULL is allowed for unlink.)
  IF p_subcontract_id IS NOT NULL THEN
    PERFORM 1
       FROM public.subcontracts sc
      WHERE sc.id = p_subcontract_id
        AND sc.site_id = v_site_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'link_settlement_group_to_subcontract: subcontract % does not belong to site %',
        p_subcontract_id, v_site_id;
    END IF;
  END IF;

  -- 3. The cascade. All four tables share the settlement_group_id key, so
  --    each UPDATE is keyed off it and runs in this transaction.
  UPDATE public.settlement_groups
     SET subcontract_id = p_subcontract_id
   WHERE id = p_group_id;

  UPDATE public.daily_attendance
     SET subcontract_id = p_subcontract_id
   WHERE settlement_group_id = p_group_id;
  GET DIAGNOSTICS v_attendance_updated = ROW_COUNT;

  UPDATE public.market_laborer_attendance
     SET subcontract_id = p_subcontract_id
   WHERE settlement_group_id = p_group_id;
  GET DIAGNOSTICS v_market_updated = ROW_COUNT;

  UPDATE public.labor_payments
     SET subcontract_id = p_subcontract_id
   WHERE settlement_group_id = p_group_id;
  GET DIAGNOSTICS v_payments_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'group_id', p_group_id,
    'subcontract_id', p_subcontract_id,
    'attendance_updated', v_attendance_updated,
    'market_updated', v_market_updated,
    'payments_updated', v_payments_updated
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_settlement_group_to_subcontract(uuid, uuid)
  TO authenticated, service_role;
