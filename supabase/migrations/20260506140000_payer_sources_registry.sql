-- Payer Sources Registry — Slice 1 (Foundation)
-- Spec: docs/superpowers/specs/2026-05-06-payer-sources-registry-slice-1-design.md
--
-- Per-site registry of payment-source pools (Own Money, Amma Money,
-- Trust Account, etc.). Slice 1 seeds the 6 canonical built-ins for
-- every existing site and self-heals any non-canonical values already
-- in settlement_groups.payer_source by materialising them as
-- non-built-in registry rows. Permissive RLS mirrors settlement_groups —
-- auth happens at the app/proxy layer, not in DB policies. Slice 2
-- adds INSERT/UPDATE/DELETE policies (still permissive) when the
-- settings page lands.

-- 1. Schema
CREATE TABLE IF NOT EXISTS payer_sources (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  key           text NOT NULL,
  label         text NOT NULL,
  icon          text,
  color         text,
  sort_order    int  NOT NULL DEFAULT 0,
  requires_name boolean NOT NULL DEFAULT false,
  is_built_in   boolean NOT NULL DEFAULT false,
  is_hidden     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, key)
);

-- 2. Index for picker reads (visible rows ordered by sort)
CREATE INDEX IF NOT EXISTS payer_sources_site_id_visible_idx
  ON payer_sources (site_id, sort_order)
  WHERE is_hidden = false;

-- 3. Seed the 6 built-ins for every existing site (idempotent)
INSERT INTO payer_sources (site_id, key, label, icon, sort_order, requires_name, is_built_in)
SELECT s.id, b.key, b.label, b.icon, b.sort_order, b.requires_name, true
FROM sites s
CROSS JOIN (VALUES
  ('own_money',        'Own Money',     'AccountBalance', 10, false),
  ('amma_money',       'Amma Money',    'Person',         20, false),
  ('client_money',     'Client Money',  'Business',       30, false),
  ('trust_account',    'Trust Account', 'Savings',        40, false),
  ('other_site_money', 'Other Site',    'LocationOn',     50, true),
  ('custom',           'Other',         'Edit',           60, true)
) AS b(key, label, icon, sort_order, requires_name)
ON CONFLICT (site_id, key) DO NOTHING;

-- 4. Self-heal: materialize any non-canonical payer_source value already
--    present in settlement_groups as a non-built-in registry row scoped
--    to its site. In production this primarily picks up Srinivasan's
--    41 'site_cash' rows from the Audit Mode reconcile work. Defensive
--    against any other latent values.
INSERT INTO payer_sources (site_id, key, label, sort_order, is_built_in)
SELECT DISTINCT
  sg.site_id,
  sg.payer_source,
  INITCAP(REPLACE(sg.payer_source, '_', ' ')) AS label,
  999 AS sort_order,
  false AS is_built_in
FROM settlement_groups sg
WHERE sg.payer_source IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM payer_sources ps
    WHERE ps.site_id = sg.site_id AND ps.key = sg.payer_source
  )
ON CONFLICT (site_id, key) DO NOTHING;

-- 5. Trigger to seed built-ins for new sites
CREATE OR REPLACE FUNCTION seed_payer_sources_for_new_site()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO payer_sources (site_id, key, label, icon, sort_order, requires_name, is_built_in)
  VALUES
    (NEW.id, 'own_money',        'Own Money',     'AccountBalance', 10, false, true),
    (NEW.id, 'amma_money',       'Amma Money',    'Person',         20, false, true),
    (NEW.id, 'client_money',     'Client Money',  'Business',       30, false, true),
    (NEW.id, 'trust_account',    'Trust Account', 'Savings',        40, false, true),
    (NEW.id, 'other_site_money', 'Other Site',    'LocationOn',     50, true,  true),
    (NEW.id, 'custom',           'Other',         'Edit',           60, true,  true)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS seed_payer_sources_after_site_insert ON sites;
CREATE TRIGGER seed_payer_sources_after_site_insert
  AFTER INSERT ON sites
  FOR EACH ROW EXECUTE FUNCTION seed_payer_sources_for_new_site();

-- 6. RLS — permissive, mirrors settlement_groups. Auth happens at the
--    app/proxy layer. Slice 2 will add INSERT/UPDATE/DELETE policies
--    (also permissive) when the settings page can write to this table.
ALTER TABLE payer_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_anon_select_payer_sources"
  ON payer_sources FOR SELECT TO anon USING (true);

CREATE POLICY "allow_authenticated_select_payer_sources"
  ON payer_sources FOR SELECT TO authenticated USING (true);
