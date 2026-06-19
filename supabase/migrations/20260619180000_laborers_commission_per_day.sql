-- Migration: add laborers.commission_per_day (mesthri commission estimate)
--
-- Informal cut a laborer passes to the mesthri who brought them to site
-- (commonly ~INR 50/day for Hindi contract crews; "sometimes they give,
-- sometimes not -- it's their internal"). This is ESTIMATE / REPORTING ONLY:
-- it never touches settlements, labor_payments, or any wallet/money flow.
--
-- The estimate (rate x days worked) is computed in the work-history and
-- mesthri-commission RPCs, and is only ATTRIBUTED when the laborer has a
-- resolvable mesthri (associated_team_id -> teams leader). So daily-market /
-- Tamil workers with no mesthri contribute zero even though the column
-- defaults to 50. Editable per laborer (may differ and change over time).
--
-- NOT to be confused with subcontracts.maestri_margin_per_day, which is the
-- contractor's contract margin -- a different concept.

ALTER TABLE public.laborers
  ADD COLUMN IF NOT EXISTS commission_per_day numeric(10,2) NOT NULL DEFAULT 50;

COMMENT ON COLUMN public.laborers.commission_per_day IS
  'Estimated daily commission (INR) this laborer passes to the mesthri who brought them (resolved via associated_team_id -> team leader). Estimate/reporting only -- never deducted from pay. Counted only when a mesthri is resolvable; editable per laborer (0 = none).';
