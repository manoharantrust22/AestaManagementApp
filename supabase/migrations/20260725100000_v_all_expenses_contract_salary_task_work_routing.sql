-- /site/expenses (v_all_expenses): when a settled attendance day is re-attributed
-- to a fixed-price task-work package (settlement_groups.contract_ref_kind='task_work'),
-- the ledger line must move onto the package instead of staying under its old
-- daily/subcontract booking.
--
-- Three salary branches decide where a settlement surfaces:
--   * "Daily Salary"    - settlements backed by attendance, no is_under_contract pay.
--   * "Contract Salary" (labor_payments) - settlements WITH an is_under_contract pay,
--                         rendered generically as "Salary settlement (N laborers)"
--                         and attributed to sg.subcontract_id.
--   * "Contract Salary" (direct-pay)     - contract_ref settlements, rendered as
--                         "Contract wages - <laborer> - <package/subcontract title>",
--                         attributed via the contract_ref (task_work -> package parent).
--
-- A task-work-stamped settlement must land ONLY in the direct-pay branch (which names
-- the package). Without guards it would ALSO match Daily Salary and/or the
-- labor_payments Contract Salary branch and double-count the same rupees. This patch:
--   1. Daily Salary        -> add `AND sg.contract_ref_kind IS NULL`.
--   2. labor_payments C.S.  -> add `AND sg.contract_ref_kind IS DISTINCT FROM 'task_work'`
--                              so task-work settlements leave this generic branch.
--   3. direct-pay C.S.      -> broaden its `NOT EXISTS(is_under_contract)` guard to
--                              `(contract_ref_kind='task_work' OR NOT EXISTS(...))` so a
--                              task-work settlement that carries an is_under_contract
--                              labor_payment (the crew-weekly-pay case) is caught here
--                              and named by its package.
--
-- Net effect on existing data: a VERIFIED NO-OP. Today no daily/market-backed
-- settlement carries contract_ref_kind, and all 16 task_work settlements are pure
-- direct-pay (already in branch 3), so branches 1/2/3 match exactly the same rows as
-- before. The change only takes effect for settlements moved by
-- move_settled_day_to_package (next migration).
--
-- Surgical patch over the LIVE view body (pg_get_viewdef + CREATE OR REPLACE), the
-- 20260714100400 / 20260717140000 technique — the live body holds transfer predicates
-- and the contract-linked salary branch that exist in no single migration file, so a
-- full-body rewrite would silently drop them. RAISES if any anchor fails to match.

DO $$
DECLARE
  v_def text;
  v_new text;
BEGIN
  v_def := pg_get_viewdef('public.v_all_expenses'::regclass, true);

  -- Idempotent: if the routing guards are already present (re-run, or a prod where
  -- the patch was applied out-of-band), do nothing rather than fail on missing anchors.
  IF v_def LIKE '%IS DISTINCT FROM ''task_work''::text%'
     AND v_def LIKE '%contract_ref_kind = ''task_work''::text OR NOT%' THEN
    RETURN;
  END IF;

  -- (1) Daily Salary branch — its unique tail is the market_laborer_attendance
  -- EXISTS closed by three parens (the OR-wrapped pair). Append the contract_ref guard.
  v_new := regexp_replace(
    v_def,
    '(FROM market_laborer_attendance ma\s+WHERE ma\.settlement_group_id = sg\.id\)\)\))',
    '\1 AND sg.contract_ref_kind IS NULL');
  IF v_new = v_def THEN
    RAISE EXCEPTION 'v_all_expenses patch: Daily Salary anchor not found — aborting.';
  END IF;
  v_def := v_new;

  -- (2) labor_payments Contract Salary branch — uniquely, `sg.is_cancelled = false`
  -- is followed immediately by a positive `AND (EXISTS ( ... labor_payments ... ))`
  -- (no is_archived / payment_type in between). Insert the guard before it.
  v_new := regexp_replace(
    v_def,
    '(sg\.is_cancelled = false)(\s+AND \(EXISTS \( SELECT 1\s+FROM labor_payments lp\s+WHERE lp\.settlement_group_id = sg\.id AND lp\.is_under_contract = true\)\))',
    '\1 AND sg.contract_ref_kind IS DISTINCT FROM ''task_work''::text\2');
  IF v_new = v_def THEN
    RAISE EXCEPTION 'v_all_expenses patch: labor_payments Contract Salary anchor not found — aborting.';
  END IF;
  v_def := v_new;

  -- (3) direct-pay Contract Salary branch — uniquely gated by
  -- `contract_ref_kind IS NOT NULL AND NOT (EXISTS ( ... labor_payments ... ))`.
  -- Broaden so task_work settlements are caught here regardless of labor_payments.
  v_new := regexp_replace(
    v_def,
    '(sg\.contract_ref_kind IS NOT NULL AND )(NOT \(EXISTS \( SELECT 1\s+FROM labor_payments lp\s+WHERE lp\.settlement_group_id = sg\.id AND lp\.is_under_contract = true\)\))',
    '\1(sg.contract_ref_kind = ''task_work''::text OR \2)');
  IF v_new = v_def THEN
    RAISE EXCEPTION 'v_all_expenses patch: direct-pay Contract Salary anchor not found — aborting.';
  END IF;
  v_def := v_new;

  EXECUTE 'CREATE OR REPLACE VIEW public.v_all_expenses AS ' || v_def;
END $$;
