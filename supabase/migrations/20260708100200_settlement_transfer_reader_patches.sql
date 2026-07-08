-- Inter-site salary settlement transfer — teach every money reader the flag.
--
-- A moved ORIGIN settlement must disappear from expenses / excess / ledgers
-- (its `transferred_out_at` is set) while staying visible as a read-only trace
-- in the settlements list (useSettlementsList, a client query, keeps it).
--
-- Technique (mirrors the repo's view-patch precedent): pull the LIVE definition,
-- inject `sg.transferred_out_at IS NULL AND` before each `sg.is_cancelled = false`
-- settlement scan, guard the match count, and re-EXECUTE. Idempotent: skips if
-- the flag is already present.

-- Helper pattern is inlined per object so each carries its own match-count guard.

-- 1. v_all_expenses (5 settlement branches) ---------------------------------
DO $mig$
DECLARE d text; n int;
BEGIN
  SELECT pg_get_viewdef('public.v_all_expenses'::regclass, true) INTO d;
  IF strpos(d, 'transferred_out_at IS NULL AND sg.is_cancelled') = 0 THEN
    n := (char_length(d) - char_length(replace(d, 'sg.is_cancelled = false', ''))) / char_length('sg.is_cancelled = false');
    IF n <> 5 THEN RAISE EXCEPTION 'v_all_expenses: expected 5 sg.is_cancelled scans, found %', n; END IF;
    d := replace(d, 'sg.is_cancelled = false', 'sg.transferred_out_at IS NULL AND sg.is_cancelled = false');
    EXECUTE 'CREATE OR REPLACE VIEW public.v_all_expenses AS ' || d;
  END IF;
END $mig$;

-- 2. get_salary_slice_summary (setts + advs) --------------------------------
DO $mig$
DECLARE d text; n int;
BEGIN
  SELECT pg_get_functiondef('public.get_salary_slice_summary(uuid,uuid,date,date,text)'::regprocedure) INTO d;
  IF strpos(d, 'transferred_out_at IS NULL AND sg.is_cancelled') = 0 THEN
    n := (char_length(d) - char_length(replace(d, 'sg.is_cancelled = false', ''))) / char_length('sg.is_cancelled = false');
    IF n <> 2 THEN RAISE EXCEPTION 'get_salary_slice_summary: expected 2 scans, found %', n; END IF;
    d := replace(d, 'sg.is_cancelled = false', 'sg.transferred_out_at IS NULL AND sg.is_cancelled = false');
    EXECUTE d;
  END IF;
END $mig$;

-- 3. get_salary_waterfall (_settlements) ------------------------------------
DO $mig$
DECLARE d text; n int;
BEGIN
  SELECT pg_get_functiondef('public.get_salary_waterfall(uuid,uuid,date,date,text)'::regprocedure) INTO d;
  IF strpos(d, 'transferred_out_at IS NULL AND sg.is_cancelled') = 0 THEN
    n := (char_length(d) - char_length(replace(d, 'sg.is_cancelled = false', ''))) / char_length('sg.is_cancelled = false');
    IF n <> 1 THEN RAISE EXCEPTION 'get_salary_waterfall: expected 1 scan, found %', n; END IF;
    d := replace(d, 'sg.is_cancelled = false', 'sg.transferred_out_at IS NULL AND sg.is_cancelled = false');
    EXECUTE d;
  END IF;
END $mig$;

-- 4. get_payments_ledger (paid_dm + paid_wk) --------------------------------
DO $mig$
DECLARE d text; n int;
BEGIN
  SELECT pg_get_functiondef('public.get_payments_ledger(uuid,date,date,text,text,text,uuid)'::regprocedure) INTO d;
  IF strpos(d, 'transferred_out_at IS NULL AND sg.is_cancelled') = 0 THEN
    n := (char_length(d) - char_length(replace(d, 'sg.is_cancelled = false', ''))) / char_length('sg.is_cancelled = false');
    IF n <> 2 THEN RAISE EXCEPTION 'get_payments_ledger: expected 2 scans, found %', n; END IF;
    d := replace(d, 'sg.is_cancelled = false', 'sg.transferred_out_at IS NULL AND sg.is_cancelled = false');
    EXECUTE d;
  END IF;
END $mig$;

-- 5. get_payment_summary (paid_groups) --------------------------------------
DO $mig$
DECLARE d text; n int;
BEGIN
  SELECT pg_get_functiondef('public.get_payment_summary(uuid,date,date,text,uuid)'::regprocedure) INTO d;
  IF strpos(d, 'transferred_out_at IS NULL AND sg.is_cancelled') = 0 THEN
    n := (char_length(d) - char_length(replace(d, 'sg.is_cancelled = false', ''))) / char_length('sg.is_cancelled = false');
    IF n <> 1 THEN RAISE EXCEPTION 'get_payment_summary: expected 1 scan, found %', n; END IF;
    d := replace(d, 'sg.is_cancelled = false', 'sg.transferred_out_at IS NULL AND sg.is_cancelled = false');
    EXECUTE d;
  END IF;
END $mig$;

-- 6. get_contract_payment_history (laborer_settlement + commission) ---------
DO $mig$
DECLARE d text; n int;
BEGIN
  SELECT pg_get_functiondef('public.get_contract_payment_history(text,uuid)'::regprocedure) INTO d;
  IF strpos(d, 'transferred_out_at IS NULL AND sg.is_cancelled') = 0 THEN
    n := (char_length(d) - char_length(replace(d, 'sg.is_cancelled = false', ''))) / char_length('sg.is_cancelled = false');
    IF n <> 2 THEN RAISE EXCEPTION 'get_contract_payment_history: expected 2 scans, found %', n; END IF;
    d := replace(d, 'sg.is_cancelled = false', 'sg.transferred_out_at IS NULL AND sg.is_cancelled = false');
    EXECUTE d;
  END IF;
END $mig$;

-- 7. get_contract_labor_ledger (paid CTE) -----------------------------------
DO $mig$
DECLARE d text; n int;
BEGIN
  SELECT pg_get_functiondef('public.get_contract_labor_ledger(text,uuid,date,date)'::regprocedure) INTO d;
  IF strpos(d, 'transferred_out_at IS NULL AND sg.is_cancelled') = 0 THEN
    n := (char_length(d) - char_length(replace(d, 'sg.is_cancelled = false', ''))) / char_length('sg.is_cancelled = false');
    IF n <> 1 THEN RAISE EXCEPTION 'get_contract_labor_ledger: expected 1 scan, found %', n; END IF;
    d := replace(d, 'sg.is_cancelled = false', 'sg.transferred_out_at IS NULL AND sg.is_cancelled = false');
    EXECUTE d;
  END IF;
END $mig$;

-- 8. get_multi_site_settlement_report — this one sums labor_payments.amount
--    directly, so exclude ARCHIVED lp (a moved origin's lp are archived; the
--    twin's are fresh). Also latently correct: archived lp never mean "paid".
DO $mig$
DECLARE d text; n int;
BEGIN
  SELECT pg_get_functiondef('public.get_multi_site_settlement_report(uuid[],date,date,uuid)'::regprocedure) INTO d;
  IF strpos(d, 'lp.is_under_contract = true AND lp.is_archived = false') = 0 THEN
    n := (char_length(d) - char_length(replace(d, 'lp.is_under_contract = true', ''))) / char_length('lp.is_under_contract = true');
    IF n <> 1 THEN RAISE EXCEPTION 'get_multi_site_settlement_report: expected 1 lp scan, found %', n; END IF;
    d := replace(d, 'lp.is_under_contract = true', 'lp.is_under_contract = true AND lp.is_archived = false');
    EXECUTE d;
  END IF;
END $mig$;

-- 9. Guard reverse_settlement against reversing a row that is part of a live
--    transfer (must reverse the transfer first, else the twin is orphaned).
DO $mig$
DECLARE d text; n int;
BEGIN
  SELECT pg_get_functiondef('public.reverse_settlement(uuid,text)'::regprocedure) INTO d;
  IF strpos(d, 'part of an inter-site transfer') = 0 THEN
    n := (char_length(d) - char_length(replace(d, 'IF v_group.is_cancelled THEN', ''))) / char_length('IF v_group.is_cancelled THEN');
    IF n <> 1 THEN RAISE EXCEPTION 'reverse_settlement: expected 1 anchor, found %', n; END IF;
    d := replace(d,
      'IF v_group.is_cancelled THEN',
      'IF v_group.transfer_id IS NOT NULL THEN' || chr(10) ||
      '    RAISE EXCEPTION ''This settlement is part of an inter-site transfer. Reverse the transfer first.'' USING ERRCODE = ''22023'';' || chr(10) ||
      '  END IF;' || chr(10) || chr(10) ||
      '  IF v_group.is_cancelled THEN');
    EXECUTE d;
  END IF;
END $mig$;
