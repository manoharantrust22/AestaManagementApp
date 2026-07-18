-- /site/expenses (v_all_expenses): attribute tea settlements to the site whose work
-- the tea fed, not the site the tea shop happens to sit on.
--
-- The tea branch reads its site straight off the shop:
--     SELECT ts.id, tsa.site_id, ... FROM tea_shop_settlements ts
--       JOIN tea_shop_accounts tsa ON ts.tea_shop_id = tsa.id
-- so a settlement paid at one site's shop but linked to another site's subcontract
-- lands on the shop's site and vanishes from the real site's expenses. On Srinivasan
-- House & Shop that hid 17 of 31 settlements (Rs 7,409): tea from the Padmavathy
-- Apartments shop, linked to Srinivasan's "Jithin Civil" subcontract.
--
-- This restores the COALESCE chain that 20260120110000_fix_tea_shop_settlements_in_
-- expenses_view.sql established and that 20260509120500_wallet_v2_recreate_v_all_
-- expenses.sql reverted when it rebuilt the view from a dumped body.
--
-- Precedence — sc.site_id, then ts.site_id, then tsa.site_id:
--   * ts.site_id is the per-site stamp added by 20260105100000 for exactly this; it
--     and sc.site_id never conflict in the data (55 agree, 0 disagree of 65 rows).
--     6 rows predate that column and rely on sc.site_id; 1 row has no subcontract
--     and relies on ts.site_id. tsa.site_id remains the last resort.
--   * Matches how /site/tea-shop derives site (useCombinedTeaShop.ts), so the
--     Settlements tab and the expenses page finally agree.
--
-- Surgical patch over the LIVE view body (pg_get_viewdef + CREATE OR REPLACE), the
-- 20260619190100 / 20260708100200 / 20260714100400 technique — the live body holds
-- transfer predicates and the contract-linked salary branch that exist in no single
-- migration file, so a full-body rewrite would silently drop them.
-- RAISES if the patch fails to match (no silent no-op).

DO $$
DECLARE
  v_def text;
  v_new text;
BEGIN
  v_def := pg_get_viewdef('public.v_all_expenses'::regclass, true);

  -- The tea branch's "SELECT ts.id, tsa.site_id," opener is unique in the body
  -- (`tsa.site_id` and `SELECT ts.id` each appear exactly once). `sc` is already
  -- LEFT JOINed in this branch, so the COALESCE resolves without a new join.
  v_new := regexp_replace(
    v_def,
    'SELECT ts\.id,\s+tsa\.site_id,',
    'SELECT ts.id,' || E'\n            ' ||
    'COALESCE(sc.site_id, ts.site_id, tsa.site_id) AS site_id,'
  );

  IF v_new = v_def THEN
    RAISE EXCEPTION 'v_all_expenses tea-branch site attribution patch did not match — aborting.';
  END IF;

  EXECUTE 'CREATE OR REPLACE VIEW public.v_all_expenses AS ' || v_new;
END $$;
