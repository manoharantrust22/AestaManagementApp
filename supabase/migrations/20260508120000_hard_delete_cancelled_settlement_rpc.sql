-- Hard-delete a soft-cancelled settlement_groups row, atomically cleaning up
-- every FK-linked table. Refuses to operate on rows that aren't already
-- is_cancelled=true so the soft-cancel cascade (attendance unlock, refund
-- engineer wallet, etc.) is guaranteed to have already run.
--
-- Why an RPC instead of multiple client calls:
--   * rental_advances / rental_settlements reference settlement_groups with
--     RESTRICT (no ON DELETE clause); a naive client-side DELETE would either
--     be blocked or leave partial state if interleaved.
--   * Atomic transaction means a partial failure rolls back the whole thing.
--
-- Cleanup order (FK direction matters):
--   1. audit_log INSERT           — capture pre-delete snapshot
--   2. rental_advances DELETE     — RESTRICT FK → must clear before parent
--   3. rental_settlements DELETE  — RESTRICT FK → must clear before parent
--   4. site_engineer_transactions UPDATE … = NULL — preserve wallet history
--   5. labor_payments DELETE      — cascades payment_week_allocations
--   6. settlement_groups DELETE   — auto-nulls daily_attendance and
--                                   market_laborer_attendance via SET NULL
CREATE OR REPLACE FUNCTION public.hard_delete_cancelled_settlement(
  p_settlement_group_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row settlement_groups%ROWTYPE;
  v_audit_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_row
  FROM settlement_groups
  WHERE id = p_settlement_group_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Settlement % not found', p_settlement_group_id;
  END IF;

  IF v_row.is_cancelled IS NOT TRUE THEN
    RAISE EXCEPTION 'Settlement % is not cancelled; soft-cancel it before hard-deleting.', p_settlement_group_id;
  END IF;

  INSERT INTO audit_log (table_name, record_id, action, old_data, changed_by, notes)
  VALUES (
    'settlement_groups',
    p_settlement_group_id,
    'delete',
    to_jsonb(v_row),
    auth.uid(),
    COALESCE(NULLIF(p_reason, ''), 'Hard delete of cancelled settlement')
  )
  RETURNING id INTO v_audit_id;

  DELETE FROM rental_advances    WHERE settlement_group_id = p_settlement_group_id;
  DELETE FROM rental_settlements WHERE settlement_group_id = p_settlement_group_id;

  UPDATE site_engineer_transactions
  SET settlement_group_id = NULL
  WHERE settlement_group_id = p_settlement_group_id;

  DELETE FROM labor_payments WHERE settlement_group_id = p_settlement_group_id;

  DELETE FROM settlement_groups WHERE id = p_settlement_group_id;

  RETURN jsonb_build_object(
    'deleted', true,
    'settlement_reference', v_row.settlement_reference,
    'audit_log_id', v_audit_id
  );
END;
$$;

COMMENT ON FUNCTION public.hard_delete_cancelled_settlement(uuid, text) IS
'Permanently removes a soft-cancelled settlement_groups row and any orphaned FK-linked rows. Refuses non-cancelled rows. Writes a snapshot to audit_log before deletion.';

GRANT EXECUTE ON FUNCTION public.hard_delete_cancelled_settlement(uuid, text) TO authenticated;
