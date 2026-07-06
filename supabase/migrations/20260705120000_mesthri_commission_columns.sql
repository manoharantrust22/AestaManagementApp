-- Mesthri commission — Part A, Migration A: config + snapshot columns (additive only).
--
-- Feature: company laborers (laborers.laborer_type = 'contract') working under a
-- trade contract / task-work package pass a per-day cut (laborers.commission_per_day,
-- default ₹50; ₹25 for a half-day) UP to the contract's mesthri. Commission is
-- DEDUCTED from the laborer (net = daily_earnings − commission; company total
-- unchanged) and accrues to the mesthri. It is turned on/off PER CONTRACT.
--
-- This migration only adds columns — no view, no RPC, no behaviour change. The
-- computation view + read RPC come in later migrations; the settlement (write) path
-- that consumes the snapshot columns comes in Part B. All columns are nullable or
-- defaulted, so existing rows and every current query are unaffected.
--
-- Commission rate basis note: commission scales by daily_attendance.work_days (the
-- SAME fraction that computes daily_earnings = work_days × daily_rate_applied), so a
-- half work-day (work_days 0.5) gives half the commission — NOT day_units (a display
-- multiplier that defaults to 1 and can diverge from the pay basis).

-- Per-contract toggle + cutover date (BOTH contract kinds).
ALTER TABLE public.task_work_packages
  ADD COLUMN IF NOT EXISTS mesthri_commission_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mesthri_commission_effective_from date NULL;

ALTER TABLE public.subcontracts
  ADD COLUMN IF NOT EXISTS mesthri_commission_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mesthri_commission_effective_from date NULL;

COMMENT ON COLUMN public.task_work_packages.mesthri_commission_enabled IS
  'When true, company laborers on this package are paid directly by the week (net of commission) and the maistry (maistry_laborer_id) collects the per-day commission. Their days are then INCLUDED in the company salary settlement instead of being paid via the fixed-price package.';
COMMENT ON COLUMN public.task_work_packages.mesthri_commission_effective_from IS
  'Cutover date. Days before this stay on the old model (paid via the package). Days on/after are paid directly (net) with commission accrual. Align to a Sunday (company week bucket). Required when mesthri_commission_enabled (enforced app-side + CHECK in the Part B migration).';
COMMENT ON COLUMN public.subcontracts.mesthri_commission_enabled IS
  'When true, company laborers on this subcontract are paid directly by the week (net of commission) and the contract mesthri (team leader / specialist laborer) collects the per-day commission.';
COMMENT ON COLUMN public.subcontracts.mesthri_commission_effective_from IS
  'Cutover date for direct-pay + commission accrual on this subcontract (see task_work_packages column of the same name).';

-- Per-day SNAPSHOT written at settle time (Part B). Immunises already-settled money
-- from later edits to commission_per_day or the toggle: pending weeks compute live
-- (estimate), settled rows read these locked values.
ALTER TABLE public.daily_attendance
  ADD COLUMN IF NOT EXISTS mesthri_commission_amount numeric(10,2) NULL,
  ADD COLUMN IF NOT EXISTS mesthri_commission_collector_id uuid NULL
    REFERENCES public.laborers(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.daily_attendance.mesthri_commission_amount IS
  'Snapshot of the mesthri commission ₹ deducted from this day, written when the day is settled. NULL = not a settled commission-crew day.';
COMMENT ON COLUMN public.daily_attendance.mesthri_commission_collector_id IS
  'Snapshot of the mesthri (laborer) this day''s commission accrued to, written at settle time.';

CREATE INDEX IF NOT EXISTS idx_daily_att_commission_collector
  ON public.daily_attendance (mesthri_commission_collector_id, site_id, date)
  WHERE mesthri_commission_collector_id IS NOT NULL;
