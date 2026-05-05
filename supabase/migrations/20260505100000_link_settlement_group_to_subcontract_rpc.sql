-- Atomic helper: link a single settlement_group to a subcontract and cascade
-- the link to every downstream row that the group represents. Used by the
-- "Unlinked settlements" inline picker on /site/payments to fix settlements
-- that were created without a subcontract (rare user mistake).
--
-- Cascade targets (all keyed by settlement_group_id):
--   1. settlement_groups.subcontract_id
--   2. daily_attendance.subcontract_id
--   3. market_laborer_attendance.subcontract_id
--   4. labor_payments.subcontract_id
--   5. site_engineer_transactions.related_subcontract_id
--      (only when the group has an engineer_transaction_id)
--
-- Atomic: function body runs in a single transaction. On any error the entire
-- link is rolled back, so we never end up with a half-linked group.
--
-- Passing p_subcontract_id = NULL is allowed: it un-links the group (sets
-- everything back to NULL). Useful for correcting a wrong link without a
-- second mutation.

CREATE OR REPLACE FUNCTION public.link_settlement_group_to_subcontract(
  p_group_id uuid,
  p_subcontract_id uuid
) RETURNS jsonb
  LANGUAGE plpgsql VOLATILE
  SECURITY INVOKER
  SET search_path = public
AS $$
DECLARE
  v_site_id                uuid;
  v_engineer_transaction   uuid;
  v_attendance_updated     integer := 0;
  v_market_updated         integer := 0;
  v_payments_updated       integer := 0;
  v_engineer_tx_updated    integer := 0;
BEGIN
  -- 1. Validate the group exists, capture its site_id and engineer link.
  SELECT sg.site_id, sg.engineer_transaction_id
    INTO v_site_id, v_engineer_transaction
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

  -- 3. The cascade. All five tables share the settlement_group_id key, so
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

  IF v_engineer_transaction IS NOT NULL THEN
    UPDATE public.site_engineer_transactions
       SET related_subcontract_id = p_subcontract_id
     WHERE id = v_engineer_transaction;
    GET DIAGNOSTICS v_engineer_tx_updated = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'group_id', p_group_id,
    'subcontract_id', p_subcontract_id,
    'attendance_updated', v_attendance_updated,
    'market_updated', v_market_updated,
    'payments_updated', v_payments_updated,
    'engineer_tx_updated', v_engineer_tx_updated
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_settlement_group_to_subcontract(uuid, uuid)
  TO authenticated, service_role;
