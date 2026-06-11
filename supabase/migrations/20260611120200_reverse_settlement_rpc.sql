-- Atomic settlement reversal — the safe "delete this record" backend.
--
-- Today reversal is split + incomplete: cancelSettlement() (TS) resets attendance
-- and marks the settlement_group cancelled but NEVER soft-cancels the wallet-v2
-- spend, so reversing a settlement leaves the wallet debit live (a second money
-- bug). DeleteDailySettlementDialog does cancel the spend but via 4 non-atomic
-- sequential awaits that can half-apply on a network drop.
--
-- This RPC does the whole reversal in ONE transaction:
--   1. Lock the group; missing -> RAISE; already cancelled -> idempotent no-op.
--   2. AUTHORIZE: caller (auth.uid() -> users row) must be the recorder
--      (users.id = group.created_by) OR have role office/admin. No client-supplied
--      identity is trusted — the gate reads auth.uid() only.
--   3. Reset linked daily + market attendance back to unpaid (same field set as
--      the legacy cancelSettlement).
--   4. Soft-cancel the linked wallet spend (cancelled_at). The wallet balance view
--      and the spend-allocation pool math both filter cancelled_at IS NULL, so this
--      alone restores the engineer's balance — allocation rows are left for audit.
--   5. Mark the group cancelled AND NULL its idempotency_key, so a legitimate
--      re-settle of the same records (same deterministic key) is allowed afterwards.
--
-- Works for engineer-wallet settlements (cancels the spend) and direct settlements
-- (no spend — step 4 is skipped). Idempotent: a second call returns a no-op summary.

CREATE OR REPLACE FUNCTION reverse_settlement(
  p_settlement_group_id uuid,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_group         settlement_groups%ROWTYPE;
  v_caller_id     uuid;
  v_caller_role   user_role;
  v_caller_name   text;
  v_spend_cancelled boolean := false;
  v_daily_reset   int := 0;
  v_market_reset  int := 0;
BEGIN
  IF p_settlement_group_id IS NULL THEN
    RAISE EXCEPTION 'reverse_settlement requires a settlement_group_id' USING ERRCODE = '22023';
  END IF;

  -- Resolve + lock the settlement group.
  SELECT * INTO v_group
  FROM settlement_groups
  WHERE id = p_settlement_group_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Settlement % not found', p_settlement_group_id USING ERRCODE = 'P0002';
  END IF;

  -- Idempotent: already reversed -> no-op.
  IF v_group.is_cancelled THEN
    RETURN jsonb_build_object(
      'group_id', v_group.id,
      'already_cancelled', true,
      'spend_cancelled', false,
      'daily_reset', 0,
      'market_reset', 0
    );
  END IF;

  -- AUTHORIZATION — derive the caller from auth.uid() (never from a client arg).
  SELECT id, role, name INTO v_caller_id, v_caller_role, v_caller_name
  FROM users
  WHERE auth_id = auth.uid();

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized: no application user for the current session' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    v_caller_role IN ('admin', 'office')
    OR v_caller_id = v_group.created_by
  ) THEN
    RAISE EXCEPTION 'Not authorized to reverse this settlement (only the recorder or office/admin may reverse).'
      USING ERRCODE = '42501';
  END IF;

  -- Reset linked attendance back to unpaid (mirror of cancelSettlement resetData).
  UPDATE daily_attendance
  SET is_paid = false,
      payment_date = NULL,
      payment_mode = NULL,
      paid_via = NULL,
      engineer_transaction_id = NULL,
      payment_proof_url = NULL,
      payment_notes = NULL,
      payer_source = NULL,
      payer_name = NULL,
      expense_id = NULL,
      settlement_group_id = NULL
  WHERE settlement_group_id = v_group.id;
  GET DIAGNOSTICS v_daily_reset = ROW_COUNT;

  UPDATE market_laborer_attendance
  SET is_paid = false,
      payment_date = NULL,
      payment_mode = NULL,
      paid_via = NULL,
      engineer_transaction_id = NULL,
      payment_proof_url = NULL,
      payment_notes = NULL,
      payer_source = NULL,
      payer_name = NULL,
      expense_id = NULL,
      settlement_group_id = NULL
  WHERE settlement_group_id = v_group.id;
  GET DIAGNOSTICS v_market_reset = ROW_COUNT;

  -- Soft-cancel the linked wallet spend (if any). Predicate makes it idempotent.
  IF v_group.engineer_transaction_id IS NOT NULL THEN
    UPDATE site_engineer_transactions
    SET cancelled_at = now(),
        cancelled_by = v_caller_name,
        cancelled_by_user_id = v_caller_id,
        cancellation_reason = COALESCE(p_reason, 'Settlement reversed')
    WHERE id = v_group.engineer_transaction_id
      AND cancelled_at IS NULL;
    IF FOUND THEN
      v_spend_cancelled := true;
    END IF;
  END IF;

  -- Mark the group cancelled and FREE the idempotency key so the same records can
  -- be legitimately re-settled later (deterministic key would otherwise collide).
  UPDATE settlement_groups
  SET is_cancelled = true,
      cancelled_at = now(),
      cancelled_by = v_caller_name,
      cancelled_by_user_id = v_caller_id,
      cancellation_reason = COALESCE(p_reason, 'Settlement reversed'),
      idempotency_key = NULL
  WHERE id = v_group.id;

  RETURN jsonb_build_object(
    'group_id', v_group.id,
    'already_cancelled', false,
    'spend_cancelled', v_spend_cancelled,
    'daily_reset', v_daily_reset,
    'market_reset', v_market_reset
  );
END;
$$;

GRANT EXECUTE ON FUNCTION reverse_settlement(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION reverse_settlement(uuid, text) TO service_role;

COMMENT ON FUNCTION reverse_settlement(uuid, text) IS
  'Atomically reverses a settlement: resets linked daily+market attendance to unpaid, soft-cancels the linked wallet spend (restoring balance), marks the group cancelled and NULLs its idempotency_key. Authorization (recorder OR office/admin) is derived from auth.uid() only. Idempotent. Returns a jsonb summary.';
