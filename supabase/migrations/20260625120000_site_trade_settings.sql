-- Per-site trade settings: make a trade's WORKSPACE (attendance/salary/tea/holidays
-- surface) and OFFERED-for-new-contracts state site-specific.
--
-- A trade is still defined once company-wide in labor_categories (name, tea, order,
-- existence via is_active = "in catalog"). This table holds only per-site OVERRIDES:
--   has_workspace  NULL/absent -> inherit company default (true) = today's behaviour
--   is_offered     NULL/absent -> inherit (offered) = today's behaviour
-- No backfill: every existing site has no row -> resolves to defaults -> byte-for-byte
-- identical to today (Civil-safe by construction).

CREATE TABLE IF NOT EXISTS public.site_trade_settings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id           uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  trade_category_id uuid NOT NULL REFERENCES public.labor_categories(id) ON DELETE CASCADE,
  has_workspace     boolean,   -- NULL = inherit company default (true)
  is_offered        boolean,   -- NULL = inherit (offered, still gated by catalog is_active)
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid,
  UNIQUE (site_id, trade_category_id)
);

CREATE INDEX IF NOT EXISTS site_trade_settings_site_idx  ON public.site_trade_settings (site_id);
CREATE INDEX IF NOT EXISTS site_trade_settings_trade_idx ON public.site_trade_settings (trade_category_id);

COMMENT ON TABLE public.site_trade_settings IS
  'Per-(site,trade) overrides for a trade''s workspace surface and offered-for-new-contracts '
  'state. Missing row / NULL column inherits the company default (workspace on, offered).';

-- RLS — mirror site_holidays: scope by can_access_site(); site engineers manage their
-- own site, so writers are admin/office/site_engineer with site access.
ALTER TABLE public.site_trade_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY site_trade_settings_select ON public.site_trade_settings
  FOR SELECT USING (public.can_access_site(site_id));

CREATE POLICY site_trade_settings_write ON public.site_trade_settings
  FOR ALL
  USING (
    public.get_user_role() = ANY (ARRAY['admin','office','site_engineer']::public.user_role[])
    AND public.can_access_site(site_id)
  )
  WITH CHECK (
    public.get_user_role() = ANY (ARRAY['admin','office','site_engineer']::public.user_role[])
    AND public.can_access_site(site_id)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_trade_settings TO authenticated;

-- Per-(site,trade) workspace-data counts — powers the "can't switch workspace OFF
-- while this site holds data for this trade" lock on the per-site settings tab.
-- Same six base tables as v_trade_workspace_usage, grouped by subcontracts.site_id.
CREATE OR REPLACE VIEW public.v_site_trade_workspace_usage
WITH (security_invoker = true) AS
SELECT s.site_id, s.trade_category_id, count(*) AS total_workspace_rows
FROM (
  SELECT sc.site_id, sc.trade_category_id FROM public.daily_attendance d
    JOIN public.subcontracts sc ON sc.id = d.subcontract_id WHERE d.is_deleted = false
  UNION ALL
  SELECT sc.site_id, sc.trade_category_id FROM public.market_laborer_attendance d
    JOIN public.subcontracts sc ON sc.id = d.subcontract_id
  UNION ALL
  SELECT sc.site_id, sc.trade_category_id FROM public.subcontract_headcount_attendance d
    JOIN public.subcontracts sc ON sc.id = d.subcontract_id
  UNION ALL
  SELECT sc.site_id, sc.trade_category_id FROM public.settlement_groups d
    JOIN public.subcontracts sc ON sc.id = d.subcontract_id
  UNION ALL
  SELECT sc.site_id, sc.trade_category_id FROM public.labor_payments d
    JOIN public.subcontracts sc ON sc.id = d.subcontract_id
  UNION ALL
  SELECT sc.site_id, sc.trade_category_id FROM public.tea_shop_settlements d
    JOIN public.subcontracts sc ON sc.id = d.subcontract_id
) s
WHERE s.trade_category_id IS NOT NULL
GROUP BY s.site_id, s.trade_category_id;

GRANT SELECT ON public.v_site_trade_workspace_usage TO authenticated;
