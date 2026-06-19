-- Phase 3 (contracts overhaul): show a subcontract payment under its TRADE
-- (e.g. "Electrical") in all-site expenses, instead of the generic "Contract Payment".
--
-- Only the DISPLAY `category_name` of the subcontract_payments branch changes; the
-- `expense_type` ('Direct Payment') and `category_id` are untouched so the expenses
-- page's group filter (which keys on expense_type) keeps working. Untagged contracts
-- (trade_category_id IS NULL) still read "Contract Payment".
--
-- Implemented as a patch over the LIVE view body (pg_get_viewdef) + CREATE OR REPLACE,
-- which preserves every output column, grant, and dependent. Two regex patches:
--   1. add a LEFT JOIN labor_categories on the contract's trade
--   2. derive category_name = COALESCE(trade name, 'Contract Payment')
-- The migration RAISES if either patch fails to apply (no silent no-op).

DO $$
DECLARE
  v_def  text;
  v_new  text;
BEGIN
  v_def := pg_get_viewdef('public.v_all_expenses'::regclass, true);

  -- 1) Add the trade join to ONLY the subcontract_payments branch
  --    (it is the sole branch selecting "FROM subcontract_payments sp").
  v_new := regexp_replace(
    v_def,
    'FROM\s+subcontract_payments\s+sp\s+JOIN\s+subcontracts\s+sc\s+ON\s+sp\.contract_id\s*=\s*sc\.id',
    E'FROM subcontract_payments sp\n     JOIN subcontracts sc ON sp.contract_id = sc.id\n     LEFT JOIN labor_categories lc_trade ON lc_trade.id = sc.trade_category_id'
  );

  IF v_new = v_def THEN
    RAISE EXCEPTION 'Phase 3 patch 1 (subcontract_payments JOIN) did not match — aborting to avoid a silent no-op.';
  END IF;

  -- 2) Derive category_name from the trade for that same branch. The branch is
  --    uniquely identified by its "Direct Payment" expense_type that follows.
  v_new := regexp_replace(
    v_new,
    '''Contract Payment''::character varying AS category_name,(\s+)''labor''::text AS module,(\s+)''Direct Payment''::text AS expense_type',
    E'COALESCE(lc_trade.name, ''Contract Payment''::character varying) AS category_name,\\1''labor''::text AS module,\\2''Direct Payment''::text AS expense_type'
  );

  IF position('COALESCE(lc_trade.name' in v_new) = 0 THEN
    RAISE EXCEPTION 'Phase 3 patch 2 (category_name) did not match — aborting.';
  END IF;

  EXECUTE 'CREATE OR REPLACE VIEW public.v_all_expenses AS ' || v_new;
END $$;
