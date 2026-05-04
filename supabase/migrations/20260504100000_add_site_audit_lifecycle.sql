-- Per-site legacy audit lifecycle. See plan: Closing the Books on Pre-App Data.
-- Adds:
--   1. sites.data_started_at + sites.legacy_status        (lifecycle state machine)
--   2. is_archived flag on 4 waterfall tables             (Mode B reconcile soft-delete)
--   3. laborer_opening_balances table                     (Mode B carry-forward)
-- Backfills Padmavathy + Mathur to 'auditing' @ 2025-11-09 (Sunday — first day of the
-- live-app week). Srinivasan stays default 'none'.
-- Idempotent: safe to replay on a fresh local DB.

BEGIN;

-- ─── 1. Sites lifecycle columns ────────────────────────────────────────────
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS data_started_at date NULL,
  ADD COLUMN IF NOT EXISTS legacy_status   text NOT NULL DEFAULT 'none';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'sites_legacy_status_check'
       AND conrelid = 'public.sites'::regclass
  ) THEN
    ALTER TABLE public.sites
      ADD CONSTRAINT sites_legacy_status_check
      CHECK (legacy_status IN ('none','auditing','reconciled'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'sites_audit_state_consistency_check'
       AND conrelid = 'public.sites'::regclass
  ) THEN
    ALTER TABLE public.sites
      ADD CONSTRAINT sites_audit_state_consistency_check
      CHECK (
        (legacy_status = 'none' AND data_started_at IS NULL)
        OR (legacy_status IN ('auditing','reconciled') AND data_started_at IS NOT NULL)
      );
  END IF;
END $$;

COMMENT ON COLUMN public.sites.data_started_at IS
  'Date the Aesta app went live for this site. Settlement payments and attendance with date < this value are treated as legacy while legacy_status = auditing. NULL when legacy_status = none.';
COMMENT ON COLUMN public.sites.legacy_status IS
  'none = no pre-app data; auditing = pre-app data sealed in legacy band, period-gating active in waterfall RPCs; reconciled = audit complete, gating lifted (opening balance row may exist for Mode B).';

-- ─── 2. is_archived soft-delete on the 4 waterfall tables ──────────────────
ALTER TABLE public.daily_attendance         ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.settlement_groups        ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.labor_payments           ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.payment_week_allocations ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.daily_attendance.is_archived IS
  'Set true by the Mode B roll-up reconcile path. Read paths must AND is_archived = false.';
COMMENT ON COLUMN public.settlement_groups.is_archived IS
  'Set true by the Mode B roll-up reconcile path. Read paths must AND is_archived = false.';
COMMENT ON COLUMN public.labor_payments.is_archived IS
  'Set true by the Mode B roll-up reconcile path. Read paths must AND is_archived = false.';
COMMENT ON COLUMN public.payment_week_allocations.is_archived IS
  'Set true by the Mode B roll-up reconcile path. Read paths must AND is_archived = false.';

-- ─── 3. Per-laborer opening balance carry-forward ──────────────────────────
CREATE TABLE IF NOT EXISTS public.laborer_opening_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id    uuid NOT NULL REFERENCES public.sites(id)    ON DELETE CASCADE,
  laborer_id uuid NOT NULL REFERENCES public.laborers(id) ON DELETE CASCADE,
  as_of_date date NOT NULL,
  opening_wages_owed numeric NOT NULL CHECK (opening_wages_owed >= 0),
  opening_paid       numeric NOT NULL CHECK (opening_paid       >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT laborer_opening_balances_unique UNIQUE (site_id, laborer_id)
);

COMMENT ON TABLE public.laborer_opening_balances IS
  'Per-laborer carry-forward seeded by a Mode B reconcile. One row per (site, laborer). The live waterfall seeds wages_owed for the first eligible week from this table. Removing a row + un-archiving legacy rows reverses the reconcile.';

ALTER TABLE public.laborer_opening_balances ENABLE ROW LEVEL SECURITY;

-- Mirrors the open RLS shape used by daily_attendance / labor_payments.
DROP POLICY IF EXISTS allow_anon_select_laborer_opening_balances           ON public.laborer_opening_balances;
DROP POLICY IF EXISTS allow_authenticated_select_laborer_opening_balances  ON public.laborer_opening_balances;
DROP POLICY IF EXISTS allow_anon_insert_laborer_opening_balances           ON public.laborer_opening_balances;
DROP POLICY IF EXISTS allow_authenticated_insert_laborer_opening_balances  ON public.laborer_opening_balances;
DROP POLICY IF EXISTS allow_anon_update_laborer_opening_balances           ON public.laborer_opening_balances;
DROP POLICY IF EXISTS allow_authenticated_update_laborer_opening_balances  ON public.laborer_opening_balances;
DROP POLICY IF EXISTS allow_anon_delete_laborer_opening_balances           ON public.laborer_opening_balances;
DROP POLICY IF EXISTS allow_authenticated_delete_laborer_opening_balances  ON public.laborer_opening_balances;

CREATE POLICY allow_anon_select_laborer_opening_balances           ON public.laborer_opening_balances FOR SELECT TO anon          USING (true);
CREATE POLICY allow_authenticated_select_laborer_opening_balances  ON public.laborer_opening_balances FOR SELECT TO authenticated USING (true);
CREATE POLICY allow_anon_insert_laborer_opening_balances           ON public.laborer_opening_balances FOR INSERT TO anon          WITH CHECK (true);
CREATE POLICY allow_authenticated_insert_laborer_opening_balances  ON public.laborer_opening_balances FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY allow_anon_update_laborer_opening_balances           ON public.laborer_opening_balances FOR UPDATE TO anon          USING (true) WITH CHECK (true);
CREATE POLICY allow_authenticated_update_laborer_opening_balances  ON public.laborer_opening_balances FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_anon_delete_laborer_opening_balances           ON public.laborer_opening_balances FOR DELETE TO anon          USING (true);
CREATE POLICY allow_authenticated_delete_laborer_opening_balances  ON public.laborer_opening_balances FOR DELETE TO authenticated USING (true);

-- ─── 4. Backfill audit state for the two known legacy sites ────────────────
-- Padmavathy Apartments + Mathur went live with the app the week of 2025-11-09
-- (Sunday — first day of the Sun-Sat week containing the launch). Picking the
-- Sunday boundary avoids straddle bucketing (a week is fully legacy or fully
-- current; never half-and-half).
-- Srinivasan House & Shop has no pre-app data, so it stays at the 'none' default.
UPDATE public.sites
   SET legacy_status   = 'auditing',
       data_started_at = DATE '2025-11-09'
 WHERE name IN ('Padmavathy Apartments', 'Mathur')
   AND legacy_status = 'none';   -- idempotent: do not clobber a manually-set state

COMMIT;
