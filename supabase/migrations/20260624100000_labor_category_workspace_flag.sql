-- Workspace-per-trade — Phase 1 foundation.
--
-- A "workspace" is the full Civil-style operating surface for a trade:
-- per-labourer attendance + salary settlement + tea-shop settlements + holidays.
-- Make it a property of the TRADE (labor_categories), not of each contract/section/task.
--
-- `has_workspace = true`  → the trade exposes the full workspace surface (Civil today).
-- `has_workspace = false` → the trade shows ONLY the Contract ▸ Section ▸ Task ladder
--                           (organise + cost + payouts); no attendance/salary/tea/holiday.
--
-- Turning a workspace OFF is HIDE-ONLY and NEVER deletes data; the UI restricts the
-- toggle when the trade already holds workspace data (see v_trade_workspace_usage).

-- ── 1. The flag ──────────────────────────────────────────────────────────────
ALTER TABLE public.labor_categories
  ADD COLUMN IF NOT EXISTS has_workspace boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.labor_categories.has_workspace IS
  'When true, this trade exposes the full workspace surface (per-labourer attendance, '
  'salary settlements, tea-shop, holidays). When false, only the Contract>Section>Task '
  'ladder is shown. Hide-only: turning it off never deletes data.';

-- Existing rows are covered by DEFAULT true on ADD COLUMN; set explicitly so Civil
-- and every current trade unambiguously keep their surface.
UPDATE public.labor_categories SET has_workspace = true WHERE has_workspace IS NULL;

-- ── 2. Per-trade workspace-data usage (drives the guarded toggle) ─────────────
-- One row per trade with counts of workspace data linked to that trade's subcontracts.
-- The settings page reads this once to decide whether a trade's workspace can be turned
-- off (any data > 0 → locked ON). `security_invoker = true` so the existing company-scoped
-- RLS on the base tables applies to the CALLER (Postgres 15 views default to the view
-- owner's privileges, which would bypass RLS and count rows across every company).
CREATE OR REPLACE VIEW public.v_trade_workspace_usage
WITH (security_invoker = true) AS
SELECT
  lc.id AS trade_category_id,
  COALESCE(da.n, 0)  AS attendance_count,
  COALESCE(mla.n, 0) AS market_attendance_count,
  COALESCE(hc.n, 0)  AS headcount_count,
  COALESCE(sg.n, 0)  AS settlement_count,
  COALESCE(lp.n, 0)  AS labor_payment_count,
  COALESCE(tea.n, 0) AS tea_settlement_count,
  (
    COALESCE(da.n, 0) + COALESCE(mla.n, 0) + COALESCE(hc.n, 0)
    + COALESCE(sg.n, 0) + COALESCE(lp.n, 0) + COALESCE(tea.n, 0)
  ) AS total_workspace_rows
FROM public.labor_categories lc
LEFT JOIN LATERAL (
  SELECT count(*) AS n FROM public.daily_attendance d
  JOIN public.subcontracts s ON s.id = d.subcontract_id
  WHERE s.trade_category_id = lc.id AND d.is_deleted = false
) da ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS n FROM public.market_laborer_attendance d
  JOIN public.subcontracts s ON s.id = d.subcontract_id
  WHERE s.trade_category_id = lc.id
) mla ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS n FROM public.subcontract_headcount_attendance d
  JOIN public.subcontracts s ON s.id = d.subcontract_id
  WHERE s.trade_category_id = lc.id
) hc ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS n FROM public.settlement_groups d
  JOIN public.subcontracts s ON s.id = d.subcontract_id
  WHERE s.trade_category_id = lc.id
) sg ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS n FROM public.labor_payments d
  JOIN public.subcontracts s ON s.id = d.subcontract_id
  WHERE s.trade_category_id = lc.id
) lp ON true
LEFT JOIN LATERAL (
  SELECT count(*) AS n FROM public.tea_shop_settlements d
  JOIN public.subcontracts s ON s.id = d.subcontract_id
  WHERE s.trade_category_id = lc.id
) tea ON true;

COMMENT ON VIEW public.v_trade_workspace_usage IS
  'Per-trade counts of workspace data (attendance / market attendance / headcount / '
  'settlements / labour payments / tea settlements) linked via subcontracts. Used by '
  'Trade Management to lock the Workspace toggle ON when a trade already holds data.';

GRANT SELECT ON public.v_trade_workspace_usage TO authenticated;
