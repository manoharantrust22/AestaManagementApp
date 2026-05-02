-- Trade Workspaces — Plan 01 schema migration.
--
-- Adds the trade dimension to subcontracts, role-rate card + per-role headcount
-- tables, the reconciliation view, the is_system_seed flag on labor_categories,
-- and creates a "Civil — In-house" subcontract per site that owns orphan civil
-- attendance + settlement rows so every trade — civil included — is a
-- first-class subcontract going forward.
--
-- Spec: docs/superpowers/specs/2026-05-02-trade-workspaces-design.md
-- Plan: docs/superpowers/plans/2026-05-02-trade-workspaces-01-schema-and-hub.md

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
  'True for the seven system-seeded trades (Civil, Painting, Tiling, Electrical, Plumbing, Carpentry, Other). System-seed rows can be deactivated (is_active=false) but never deleted by users.';

-- ---------------------------------------------------------------
-- 2. Seed trade categories (idempotent on the unique name index)
-- ---------------------------------------------------------------
INSERT INTO public.labor_categories (name, description, display_order, is_active, is_system_seed)
VALUES
  ('Civil',      'Civil construction work — masonry, concrete, foundation',     10, true, true),
  ('Painting',   'Surface preparation and painting',                             20, true, true),
  ('Tiling',     'Floor and wall tile laying',                                   30, true, true),
  ('Electrical', 'Wiring, switchgear, fixtures',                                 40, true, true),
  ('Plumbing',   'Water supply, drainage, fittings',                             50, true, true),
  ('Carpentry',  'Wood and panel work',                                          60, true, true),
  ('Other',      'Trades that do not fit the standard taxonomy',                 70, true, true)
ON CONFLICT (name) DO UPDATE SET
  is_system_seed = true,
  display_order  = EXCLUDED.display_order;

-- ---------------------------------------------------------------
-- 3. Seed default roles per non-civil trade (idempotent via NOT EXISTS guard)
-- Civil already has Mason / Helper / Centering Worker roles in production data.
-- ---------------------------------------------------------------
WITH cats AS (
  SELECT id, name FROM public.labor_categories
   WHERE name IN ('Painting','Tiling','Electrical','Plumbing','Carpentry')
)
INSERT INTO public.labor_roles (category_id, name, default_daily_rate, is_market_role, display_order, is_active)
SELECT c.id, r.name, r.rate, false, r.display_order, true
  FROM cats c
  JOIN (VALUES
    ('Painting',   'Technical Painter',      800::numeric, 10),
    ('Painting',   'Helper Painter',         500::numeric, 20),
    ('Tiling',     'Technical Tiler',       1000::numeric, 10),
    ('Tiling',     'Helper Tiler',           600::numeric, 20),
    ('Electrical', 'Technical Electrician', 1200::numeric, 10),
    ('Electrical', 'Wireman',                900::numeric, 20),
    ('Electrical', 'Helper Electrician',     600::numeric, 30),
    ('Plumbing',   'Plumber',               1000::numeric, 10),
    ('Plumbing',   'Helper Plumber',         600::numeric, 20),
    ('Carpentry',  'Carpenter',             1100::numeric, 10),
    ('Carpentry',  'Helper Carpenter',       600::numeric, 20)
  ) AS r(category_name, name, rate, display_order)
    ON r.category_name = c.name
 WHERE NOT EXISTS (
   SELECT 1 FROM public.labor_roles lr
    WHERE lr.category_id = c.id AND lr.name = r.name
 );

-- ---------------------------------------------------------------
-- 4. Trade dimension on subcontracts
-- ---------------------------------------------------------------
ALTER TABLE public.subcontracts
  ADD COLUMN IF NOT EXISTS trade_category_id uuid REFERENCES public.labor_categories(id),
  ADD COLUMN IF NOT EXISTS labor_tracking_mode text
    CHECK (labor_tracking_mode IN ('detailed','headcount','mesthri_only'))
    DEFAULT 'detailed',
  ADD COLUMN IF NOT EXISTS is_in_house boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.subcontracts.trade_category_id IS
  'FK to labor_categories — the trade this contract belongs to (Civil, Painting, etc). NULL on legacy rows; set by backfill for in-house Civil and required on new rows by application logic.';
COMMENT ON COLUMN public.subcontracts.labor_tracking_mode IS
  'How attendance is recorded: detailed (per-laborer + in/out time, today''s civil flow), headcount (per-role daily count via subcontract_headcount_attendance), mesthri_only (no daily count).';
COMMENT ON COLUMN public.subcontracts.is_in_house IS
  'True for the auto-created "Civil — In-house" contract per site that adopts orphan civil attendance + settlements. UI surfaces these without a mesthri name and without a "close contract" action.';

-- 4b. Relax contract_party_check so in-house contracts are exempt from
-- requiring a team_id or laborer_id. They represent the site's own labor
-- pool, not an external mesthri or specialist.
ALTER TABLE public.subcontracts DROP CONSTRAINT IF EXISTS contract_party_check;
ALTER TABLE public.subcontracts ADD CONSTRAINT contract_party_check CHECK (
  (is_in_house = true)
  OR (contract_type = 'mesthri'    AND team_id    IS NOT NULL)
  OR (contract_type = 'specialist' AND laborer_id IS NOT NULL)
);

-- ---------------------------------------------------------------
-- 5. Per-contract role rate card
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
-- 6. Per-day per-role headcount attendance
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
-- 7. Reconciliation snapshot view
-- ---------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_subcontract_reconciliation AS
SELECT
  sc.id                                       AS subcontract_id,
  sc.site_id,
  sc.trade_category_id,
  sc.labor_tracking_mode,
  sc.total_value                              AS quoted_amount,
  COALESCE(SUM(sp.amount), 0)                 AS amount_paid,
  COALESCE((
    SELECT SUM(sha.units * srr.daily_rate)
      FROM public.subcontract_headcount_attendance sha
      JOIN public.subcontract_role_rates srr
        ON srr.subcontract_id = sha.subcontract_id
       AND srr.role_id        = sha.role_id
     WHERE sha.subcontract_id = sc.id
  ), 0)                                       AS implied_labor_value_headcount,
  COALESCE((
    SELECT SUM(da.units_worked * COALESCE(da.daily_rate, l.daily_rate))
      FROM public.daily_attendance da
      LEFT JOIN public.laborers l ON l.id = da.laborer_id
     WHERE da.subcontract_id = sc.id
  ), 0)                                       AS implied_labor_value_detailed
FROM public.subcontracts sc
LEFT JOIN public.subcontract_payments sp ON sp.subcontract_id = sc.id
GROUP BY sc.id, sc.site_id, sc.trade_category_id, sc.labor_tracking_mode, sc.total_value;

COMMENT ON VIEW public.v_subcontract_reconciliation IS
  'One row per subcontract with quoted, paid, and implied labor value (both modes). Used by the reconciliation banner — Plan 03 wires the UI.';

-- ---------------------------------------------------------------
-- 8. Backfill: in-house Civil subcontract per site with orphan civil work
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
),
inserted_civil AS (
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
   )
  RETURNING id, site_id
)
SELECT 1;  -- materialise the CTE so the INSERT runs even though we don't read it.

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
