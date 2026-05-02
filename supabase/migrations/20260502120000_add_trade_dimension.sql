-- Trade Workspaces — Plan 01 schema migration.
--
-- Adds the trade dimension to subcontracts, role-rate card + per-role headcount
-- tables, the reconciliation view, the is_system_seed flag on labor_categories,
-- and creates a "Civil — In-house" subcontract per site that owns orphan civil
-- attendance + settlement rows so every trade — civil included — is a
-- first-class subcontract going forward.
--
-- ADOPT-YOURS strategy: production already has 10 active labor_categories
-- (Civil, Electrical, Plumbing, Carpentry, Painting, Scaffolding, Fabrication,
-- Flooring, Waterproofing, General) each with 2-7 labor_roles already seeded.
-- This migration does NOT insert any new categories or roles; it only adds
-- the is_system_seed flag and marks the existing 10 categories as system-seed.
--
-- Spec: docs/superpowers/specs/2026-05-02-trade-workspaces-design.md
-- Plan: docs/superpowers/plans/2026-05-02-trade-workspaces-01-schema-and-hub.md
--
-- This file is the canonical source of the migration. It was applied to
-- production via mcp__supabase__apply_migration on 2026-05-02 after read-only
-- pre-flight checks confirmed clean state and 723 orphan attendance + 39
-- orphan settlement rows would be backfilled across 3 sites.

BEGIN;

-- ---------------------------------------------------------------
-- 1. Lifecycle flag on labor_categories
-- (We reuse the existing is_active column for "archived/hidden from picker"
-- semantics. is_system_seed is a new flag so the admin UI can enforce
-- "system-seed rows can be deactivated but not deleted".)
-- ---------------------------------------------------------------
ALTER TABLE public.labor_categories
  ADD COLUMN IF NOT EXISTS is_system_seed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.labor_categories.is_system_seed IS
  'True for system-seeded trades. System-seed rows can be deactivated (is_active=false) but never deleted by users. Custom rows added later can be deleted if unused.';

-- ---------------------------------------------------------------
-- 2. Mark all currently-active categories as system-seed
-- (adopt-yours strategy — no new INSERTs, no display_order overwrite)
-- ---------------------------------------------------------------
UPDATE public.labor_categories
   SET is_system_seed = true
 WHERE is_active = true
   AND is_system_seed = false;

-- ---------------------------------------------------------------
-- 3. Trade dimension on subcontracts
-- ---------------------------------------------------------------
ALTER TABLE public.subcontracts
  ADD COLUMN IF NOT EXISTS trade_category_id uuid REFERENCES public.labor_categories(id),
  ADD COLUMN IF NOT EXISTS labor_tracking_mode text
    CHECK (labor_tracking_mode IN ('detailed','headcount','mesthri_only'))
    DEFAULT 'detailed',
  ADD COLUMN IF NOT EXISTS is_in_house boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.subcontracts.trade_category_id IS
  'FK to labor_categories — the trade this contract belongs to (Civil, Painting, etc).';
COMMENT ON COLUMN public.subcontracts.labor_tracking_mode IS
  'How attendance is recorded: detailed (per-laborer + in/out time, today''s civil flow), headcount (per-role daily count via subcontract_headcount_attendance), mesthri_only (no daily count).';
COMMENT ON COLUMN public.subcontracts.is_in_house IS
  'True for the auto-created Civil — In-house contract per site that adopts orphan civil attendance + settlements. UI surfaces these without a mesthri name and without a "close contract" action.';

-- 3b. Relax contract_party_check so in-house contracts are exempt from
-- requiring a team_id or laborer_id. They represent the site's own labor
-- pool, not an external mesthri or specialist.
ALTER TABLE public.subcontracts DROP CONSTRAINT IF EXISTS contract_party_check;
ALTER TABLE public.subcontracts ADD CONSTRAINT contract_party_check CHECK (
  (is_in_house = true)
  OR (contract_type = 'mesthri'    AND team_id    IS NOT NULL)
  OR (contract_type = 'specialist' AND laborer_id IS NOT NULL)
);

-- ---------------------------------------------------------------
-- 4. Per-contract role rate card
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subcontract_role_rates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontract_id  uuid NOT NULL REFERENCES public.subcontracts(id) ON DELETE CASCADE,
  role_id         uuid NOT NULL REFERENCES public.labor_roles(id),
  daily_rate      numeric(10,2) NOT NULL CHECK (daily_rate >= 0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subcontract_id, role_id)
);

COMMENT ON TABLE public.subcontract_role_rates IS
  'Per-contract daily rate per role. Defaults sourced from labor_roles.default_daily_rate at creation; engineer can override per contract. Drives the reconciliation calculation (units × rate).';

-- ---------------------------------------------------------------
-- 5. Per-day per-role headcount attendance
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subcontract_headcount_attendance (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontract_id  uuid NOT NULL REFERENCES public.subcontracts(id) ON DELETE CASCADE,
  attendance_date date NOT NULL,
  role_id         uuid NOT NULL REFERENCES public.labor_roles(id),
  units           numeric(4,2) NOT NULL CHECK (units >= 0),
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES public.users(id),
  UNIQUE (subcontract_id, attendance_date, role_id)
);
CREATE INDEX IF NOT EXISTS subcontract_headcount_attendance_contract_date_idx
  ON public.subcontract_headcount_attendance (subcontract_id, attendance_date);

COMMENT ON TABLE public.subcontract_headcount_attendance IS
  'One row per role per day per contract. Used when subcontracts.labor_tracking_mode = ''headcount''. Units can be fractional (e.g. 1.5 = one full + one half day).';

-- ---------------------------------------------------------------
-- 6. Reconciliation snapshot view
--
-- Real schema notes:
--  - subcontract_payments uses contract_id (NOT subcontract_id) and has is_deleted
--  - daily_attendance has daily_earnings (precomputed; respects salary_override) and is_deleted
--  - settlement_groups has total_amount and is_cancelled
--
-- amount_paid sums BOTH subcontract_payments (mesthri-direct) AND settlement_groups
-- (multi-laborer settlements). For in-house Civil contracts all money flows
-- through settlement_groups; for external mesthri contracts mostly through
-- subcontract_payments. The view captures both so the banner is accurate
-- regardless of which path the engineer used.
-- ---------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_subcontract_reconciliation AS
WITH
  payments AS (
    SELECT contract_id AS subcontract_id, SUM(amount) AS amount
      FROM public.subcontract_payments
     WHERE is_deleted = false
     GROUP BY contract_id
  ),
  settlements AS (
    SELECT subcontract_id, SUM(total_amount) AS amount
      FROM public.settlement_groups
     WHERE is_cancelled = false AND subcontract_id IS NOT NULL
     GROUP BY subcontract_id
  ),
  detailed_labor AS (
    SELECT subcontract_id, SUM(daily_earnings) AS amount
      FROM public.daily_attendance
     WHERE is_deleted = false AND subcontract_id IS NOT NULL
     GROUP BY subcontract_id
  ),
  headcount_labor AS (
    SELECT sha.subcontract_id, SUM(sha.units * srr.daily_rate) AS amount
      FROM public.subcontract_headcount_attendance sha
      JOIN public.subcontract_role_rates srr
        ON srr.subcontract_id = sha.subcontract_id
       AND srr.role_id        = sha.role_id
     GROUP BY sha.subcontract_id
  )
SELECT
  sc.id                                       AS subcontract_id,
  sc.site_id,
  sc.trade_category_id,
  sc.labor_tracking_mode,
  sc.total_value                              AS quoted_amount,
  COALESCE(p.amount, 0) + COALESCE(s.amount, 0) AS amount_paid,
  COALESCE(p.amount, 0)                       AS amount_paid_subcontract_payments,
  COALESCE(s.amount, 0)                       AS amount_paid_settlements,
  COALESCE(hl.amount, 0)                      AS implied_labor_value_headcount,
  COALESCE(dl.amount, 0)                      AS implied_labor_value_detailed
FROM public.subcontracts sc
LEFT JOIN payments        p  ON p.subcontract_id  = sc.id
LEFT JOIN settlements     s  ON s.subcontract_id  = sc.id
LEFT JOIN detailed_labor  dl ON dl.subcontract_id = sc.id
LEFT JOIN headcount_labor hl ON hl.subcontract_id = sc.id;

COMMENT ON VIEW public.v_subcontract_reconciliation IS
  'One row per subcontract: quoted vs paid (payments + settlements) vs implied labor value (both modes). Drives the reconciliation banner — Plan 03 wires the UI.';

-- ---------------------------------------------------------------
-- 7. Backfill: in-house Civil subcontract per site with orphan civil work
--
-- For every site that has daily_attendance or settlement_groups rows with
-- NULL subcontract_id, create one "Civil — In-house" subcontract
-- (is_in_house=true, trade=Civil, mode=detailed, status=active) and re-link
-- the orphan rows to it. Idempotent — guarded by NOT EXISTS.
-- ---------------------------------------------------------------
WITH civil_cat AS (
  SELECT id FROM public.labor_categories WHERE name = 'Civil' LIMIT 1
),
sites_needing_backfill AS (
  SELECT DISTINCT u.site_id
    FROM (
      SELECT site_id FROM public.daily_attendance  WHERE subcontract_id IS NULL
      UNION
      SELECT site_id FROM public.settlement_groups WHERE subcontract_id IS NULL
    ) u
   WHERE u.site_id IS NOT NULL
)
INSERT INTO public.subcontracts (
  id, site_id, trade_category_id, contract_type,
  title, is_in_house, labor_tracking_mode, status, total_value, is_rate_based
)
SELECT
  gen_random_uuid(),
  s.site_id,
  (SELECT id FROM civil_cat),
  'mesthri',                 -- nominal; in_house exempts the party-check
  'Civil — In-house',
  true,
  'detailed',
  'active',
  0,
  false
  FROM sites_needing_backfill s
 WHERE NOT EXISTS (
   SELECT 1 FROM public.subcontracts sc
    WHERE sc.site_id = s.site_id AND sc.is_in_house = true
 );

-- Re-link orphan attendance to the in-house Civil contract for that site.
UPDATE public.daily_attendance da
   SET subcontract_id = ih.id
  FROM (
    SELECT id, site_id FROM public.subcontracts WHERE is_in_house = true
  ) ih
 WHERE da.site_id = ih.site_id
   AND da.subcontract_id IS NULL;

-- Re-link orphan settlement_groups likewise.
UPDATE public.settlement_groups sg
   SET subcontract_id = ih.id
  FROM (
    SELECT id, site_id FROM public.subcontracts WHERE is_in_house = true
  ) ih
 WHERE sg.site_id = ih.site_id
   AND sg.subcontract_id IS NULL;

COMMIT;
