-- Mode B reconcile: roll up legacy data into per-laborer opening balances.
--
-- Atomic stored procedure called by the Reconcile dialog when the user picks
-- the "Roll up to opening balance" mode. Steps:
--   1. Validate the site is in 'auditing' state with a cutoff set
--   2. Compute per-laborer (opening_wages_owed, opening_paid) for dates < cutoff
--   3. INSERT one row per active contract laborer into laborer_opening_balances
--   4. Mark legacy daily_attendance, settlement_groups, labor_payments,
--      payment_week_allocations rows as is_archived = true
--   5. Flip sites.legacy_status to 'reconciled'
--
-- All in one transaction (function body runs in a single tx). On any error,
-- the entire reconcile is rolled back.
--
-- Reversibility: see reopen_audit_after_opening_balance_reconcile RPC below
-- (admin-only — un-archives all the rows + deletes the opening balance rows
-- + flips status back to 'auditing'). Provided for safety; no UI button yet.

CREATE OR REPLACE FUNCTION public.reconcile_site_with_opening_balance(
  p_site_id uuid
) RETURNS jsonb
  LANGUAGE plpgsql VOLATILE
  SECURITY INVOKER
  SET search_path = public
AS $$
DECLARE
  v_legacy_status            text;
  v_data_started_at          date;
  v_balances_inserted        integer := 0;
  v_attendance_archived      integer := 0;
  v_settlements_archived     integer := 0;
  v_payments_archived        integer := 0;
  v_allocations_archived     integer := 0;
BEGIN
  -- 0. Validate state
  SELECT s.legacy_status, s.data_started_at
    INTO v_legacy_status, v_data_started_at
    FROM public.sites s
   WHERE s.id = p_site_id;

  IF v_legacy_status IS NULL THEN
    RAISE EXCEPTION 'reconcile_site_with_opening_balance: site % not found', p_site_id;
  END IF;
  IF v_legacy_status <> 'auditing' THEN
    RAISE EXCEPTION 'reconcile_site_with_opening_balance: site % is not in auditing state (current: %)',
      p_site_id, v_legacy_status;
  END IF;
  IF v_data_started_at IS NULL THEN
    RAISE EXCEPTION 'reconcile_site_with_opening_balance: site % has no data_started_at set', p_site_id;
  END IF;

  -- 1. Compute per-laborer opening balances and INSERT.
  --    Only contract laborers (others settle 1:1 via attendance.is_paid).
  --    opening_wages_owed = max(0, total_wages_pre_cutoff - total_paid_pre_cutoff)
  --    opening_paid       = total_paid_pre_cutoff (gross — informational only)
  WITH per_laborer_wages AS (
    SELECT
      d.laborer_id,
      COALESCE(SUM(d.daily_earnings), 0)::numeric AS wages
    FROM public.daily_attendance d
    JOIN public.laborers l ON l.id = d.laborer_id
    WHERE d.site_id    = p_site_id
      AND d.is_deleted = false
      AND d.is_archived = false
      AND l.laborer_type = 'contract'
      AND d.date < v_data_started_at
    GROUP BY d.laborer_id
  ),
  per_laborer_paid AS (
    SELECT
      lp.laborer_id,
      COALESCE(SUM(lp.amount), 0)::numeric AS paid
    FROM public.labor_payments lp
    JOIN public.settlement_groups sg ON sg.id = lp.settlement_group_id
    WHERE sg.site_id        = p_site_id
      AND sg.is_cancelled   = false
      AND sg.is_archived    = false
      AND lp.is_archived    = false
      AND lp.is_under_contract = true
      AND sg.settlement_date < v_data_started_at
    GROUP BY lp.laborer_id
  ),
  combined AS (
    SELECT
      COALESCE(w.laborer_id, p.laborer_id) AS laborer_id,
      COALESCE(w.wages, 0)                  AS wages,
      COALESCE(p.paid,  0)                  AS paid
    FROM per_laborer_wages w
    FULL OUTER JOIN per_laborer_paid p ON p.laborer_id = w.laborer_id
  ),
  inserted AS (
    INSERT INTO public.laborer_opening_balances
      (site_id, laborer_id, as_of_date, opening_wages_owed, opening_paid)
    SELECT
      p_site_id,
      c.laborer_id,
      v_data_started_at,
      GREATEST(0, c.wages - c.paid),
      c.paid
    FROM combined c
    WHERE c.wages > 0 OR c.paid > 0
    ON CONFLICT (site_id, laborer_id) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) FROM inserted INTO v_balances_inserted;

  -- 2. Archive legacy daily_attendance for this site
  UPDATE public.daily_attendance
     SET is_archived = true
   WHERE site_id     = p_site_id
     AND is_deleted  = false
     AND is_archived = false
     AND date < v_data_started_at;
  GET DIAGNOSTICS v_attendance_archived = ROW_COUNT;

  -- 3. Archive legacy settlement_groups for this site
  UPDATE public.settlement_groups
     SET is_archived = true
   WHERE site_id      = p_site_id
     AND is_cancelled = false
     AND is_archived  = false
     AND settlement_date < v_data_started_at;
  GET DIAGNOSTICS v_settlements_archived = ROW_COUNT;

  -- 4. Archive labor_payments tied to those archived settlements
  UPDATE public.labor_payments lp
     SET is_archived = true
    FROM public.settlement_groups sg
   WHERE lp.settlement_group_id = sg.id
     AND sg.site_id    = p_site_id
     AND sg.is_archived = true
     AND lp.is_archived = false
     AND sg.settlement_date < v_data_started_at;
  GET DIAGNOSTICS v_payments_archived = ROW_COUNT;

  -- 5. Archive payment_week_allocations for this site whose week_start < cutoff
  UPDATE public.payment_week_allocations
     SET is_archived = true
   WHERE site_id     = p_site_id
     AND is_archived = false
     AND week_start  < v_data_started_at;
  GET DIAGNOSTICS v_allocations_archived = ROW_COUNT;

  -- 6. Flip site state
  UPDATE public.sites
     SET legacy_status = 'reconciled'
   WHERE id = p_site_id;

  -- 7. Return audit summary (caller logs / displays this)
  RETURN jsonb_build_object(
    'site_id',                          p_site_id,
    'data_started_at',                  v_data_started_at,
    'balances_inserted',                v_balances_inserted,
    'attendance_archived',              v_attendance_archived,
    'settlements_archived',             v_settlements_archived,
    'labor_payments_archived',          v_payments_archived,
    'payment_week_allocations_archived', v_allocations_archived
  );
END;
$$;

COMMENT ON FUNCTION public.reconcile_site_with_opening_balance(uuid) IS
'Mode B reconcile: collapses legacy data into per-laborer opening balances and soft-archives the granular rows. Atomic. Validates site is in auditing state before proceeding. Returns counts of rows inserted/archived.';

GRANT EXECUTE ON FUNCTION public.reconcile_site_with_opening_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_site_with_opening_balance(uuid) TO service_role;


-- Reverse path (admin-only — no UI button). Un-archives the rows for the
-- site, deletes its laborer_opening_balances, flips status back to 'auditing'.
-- Use only when a Mode B reconcile needs to be undone for diagnostics.
CREATE OR REPLACE FUNCTION public.reopen_audit_after_opening_balance_reconcile(
  p_site_id uuid
) RETURNS jsonb
  LANGUAGE plpgsql VOLATILE
  SECURITY INVOKER
  SET search_path = public
AS $$
DECLARE
  v_legacy_status      text;
  v_data_started_at    date;
  v_balances_deleted   integer := 0;
  v_attendance_unarchived  integer := 0;
  v_settlements_unarchived integer := 0;
  v_payments_unarchived    integer := 0;
  v_allocations_unarchived integer := 0;
BEGIN
  SELECT s.legacy_status, s.data_started_at
    INTO v_legacy_status, v_data_started_at
    FROM public.sites s
   WHERE s.id = p_site_id;

  IF v_legacy_status IS NULL THEN
    RAISE EXCEPTION 'reopen_audit: site % not found', p_site_id;
  END IF;
  IF v_legacy_status <> 'reconciled' THEN
    RAISE EXCEPTION 'reopen_audit: site % is not in reconciled state (current: %)',
      p_site_id, v_legacy_status;
  END IF;
  IF v_data_started_at IS NULL THEN
    RAISE EXCEPTION 'reopen_audit: site % has no data_started_at set', p_site_id;
  END IF;

  DELETE FROM public.laborer_opening_balances WHERE site_id = p_site_id;
  GET DIAGNOSTICS v_balances_deleted = ROW_COUNT;

  UPDATE public.daily_attendance
     SET is_archived = false
   WHERE site_id     = p_site_id
     AND is_archived = true
     AND date < v_data_started_at;
  GET DIAGNOSTICS v_attendance_unarchived = ROW_COUNT;

  UPDATE public.settlement_groups
     SET is_archived = false
   WHERE site_id     = p_site_id
     AND is_archived = true
     AND settlement_date < v_data_started_at;
  GET DIAGNOSTICS v_settlements_unarchived = ROW_COUNT;

  UPDATE public.labor_payments lp
     SET is_archived = false
    FROM public.settlement_groups sg
   WHERE lp.settlement_group_id = sg.id
     AND sg.site_id     = p_site_id
     AND lp.is_archived = true
     AND sg.settlement_date < v_data_started_at;
  GET DIAGNOSTICS v_payments_unarchived = ROW_COUNT;

  UPDATE public.payment_week_allocations
     SET is_archived = false
   WHERE site_id     = p_site_id
     AND is_archived = true
     AND week_start  < v_data_started_at;
  GET DIAGNOSTICS v_allocations_unarchived = ROW_COUNT;

  UPDATE public.sites
     SET legacy_status = 'auditing'
   WHERE id = p_site_id;

  RETURN jsonb_build_object(
    'site_id',                            p_site_id,
    'balances_deleted',                   v_balances_deleted,
    'attendance_unarchived',              v_attendance_unarchived,
    'settlements_unarchived',             v_settlements_unarchived,
    'labor_payments_unarchived',          v_payments_unarchived,
    'payment_week_allocations_unarchived', v_allocations_unarchived
  );
END;
$$;

COMMENT ON FUNCTION public.reopen_audit_after_opening_balance_reconcile(uuid) IS
'Reverse of reconcile_site_with_opening_balance. Admin-only — no UI button. Un-archives the soft-deleted rows + deletes the laborer_opening_balances rows + flips site back to auditing.';

GRANT EXECUTE ON FUNCTION public.reopen_audit_after_opening_balance_reconcile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_audit_after_opening_balance_reconcile(uuid) TO service_role;
