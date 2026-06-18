-- Migration: Daily Compliance Checklist — core tables
--
-- Purpose:
--   Adds the configurable, per-role daily checklist that lets the office
--   see, every day, whether each site engineer completed their recurring
--   duties (and whether they filled them on the same date or late).
--
--   Three tables:
--     1. checklist_templates       — admin-configurable item definitions per role.
--     2. checklist_entries         — the engineer's manual overlay (done / defer / na + note).
--     3. daily_stock_confirmations — fills the one gap (morning stock confirmation has
--                                    no existing record), making stock_confirmation a real
--                                    auto-detected source.
--
--   The single source of truth for "auto" items stays the real activity tables
--   (attendance, usage, deliveries, transactions). Detection is computed on read
--   by get_checklist_compliance (see 20260618120200). Templates only describe WHAT
--   to track; the closed detection_source CHECK below is the guardrail that keeps
--   admins from inventing un-backed "auto" items — every admin-added item is forced
--   to detection_type='manual' unless it maps to a known resolver branch in the RPC.

-- ============================================================
-- Helper: can_access_company (mirrors can_access_site)
-- ============================================================
CREATE OR REPLACE FUNCTION public.can_access_company(p_company_id uuid)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_role public.user_role;
  v_sites uuid[];
BEGIN
  SELECT role, assigned_sites INTO v_role, v_sites
  FROM public.users
  WHERE auth_id = auth.uid();

  IF v_role = 'admin' THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.sites s
    WHERE s.company_id = p_company_id
      AND s.id = ANY(COALESCE(v_sites, '{}'::uuid[]))
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_access_company(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_company(uuid) TO service_role;

-- Helper: is the caller admin or office (write gate for templates)
CREATE OR REPLACE FUNCTION public.is_admin_or_office()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE auth_id = auth.uid()
      AND role IN ('admin', 'office')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin_or_office() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_office() TO service_role;

-- ============================================================
-- 1. checklist_templates
-- ============================================================
CREATE TABLE public.checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role public.user_role NOT NULL,
  item_key text NOT NULL,
  label text NOT NULL,
  description text,
  detection_type text NOT NULL DEFAULT 'manual'
    CHECK (detection_type IN ('auto', 'manual')),
  -- Closed registry: every value here must have a matching branch in
  -- get_checklist_compliance. Adding a new auto source = code + this CHECK.
  detection_source text
    CHECK (detection_source IN (
      'attendance_morning', 'attendance_evening', 'stock_confirmation',
      'material_usage', 'wallet_settlement', 'delivery_status'
    )),
  deep_link_path text,
  applies_scope text NOT NULL DEFAULT 'per_site'
    CHECK (applies_scope IN ('per_site', 'per_user')),
  allow_defer boolean NOT NULL DEFAULT true,
  requires_defer_reason boolean NOT NULL DEFAULT true,
  expected_by_time time,            -- advisory only; we track same-day/late, not intraday cutoffs
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- auto requires a source; manual must not have one
  CONSTRAINT chk_detection_consistency CHECK (
    (detection_type = 'auto' AND detection_source IS NOT NULL) OR
    (detection_type = 'manual' AND detection_source IS NULL)
  ),
  CONSTRAINT uq_checklist_templates UNIQUE (company_id, role, item_key)
);

CREATE INDEX idx_checklist_templates_company_role
  ON public.checklist_templates (company_id, role) WHERE is_active;

CREATE TRIGGER trg_checklist_templates_updated_at
  BEFORE UPDATE ON public.checklist_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 2. checklist_entries (manual overlay)
-- ============================================================
CREATE TABLE public.checklist_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.checklist_templates(id) ON DELETE CASCADE,
  item_key text NOT NULL,           -- denormalized so the grid survives template rename/delete
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  site_id uuid REFERENCES public.sites(id) ON DELETE CASCADE,  -- NULL for per_user items
  business_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('done', 'deferred', 'na')),
  completed_at timestamptz,
  deferred_to date,
  defer_reason text,
  note text,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Postgres treats NULL site_id as distinct, so a single UNIQUE wouldn't dedupe
-- per_user rows. Two partial unique indexes cover both scopes.
CREATE UNIQUE INDEX uq_checklist_entries_site
  ON public.checklist_entries (template_id, user_id, site_id, business_date)
  WHERE site_id IS NOT NULL;
CREATE UNIQUE INDEX uq_checklist_entries_nosite
  ON public.checklist_entries (template_id, user_id, business_date)
  WHERE site_id IS NULL;

CREATE INDEX idx_checklist_entries_lookup
  ON public.checklist_entries (business_date, site_id, item_key);

CREATE TRIGGER trg_checklist_entries_updated_at
  BEFORE UPDATE ON public.checklist_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 3. daily_stock_confirmations
-- ============================================================
CREATE TABLE public.daily_stock_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  business_date date NOT NULL,
  confirmed_by uuid REFERENCES public.users(id),
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  stock_matches boolean NOT NULL DEFAULT true,
  discrepancy_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_daily_stock_confirmation UNIQUE (site_id, business_date)
);

CREATE INDEX idx_daily_stock_confirmations_site_date
  ON public.daily_stock_confirmations (site_id, business_date);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_stock_confirmations ENABLE ROW LEVEL SECURITY;

-- templates: readable by any company member; writable by admin/office of the company.
CREATE POLICY checklist_templates_select ON public.checklist_templates
  FOR SELECT TO authenticated
  USING (public.can_access_company(company_id));

CREATE POLICY checklist_templates_insert ON public.checklist_templates
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_company(company_id) AND public.is_admin_or_office());

CREATE POLICY checklist_templates_update ON public.checklist_templates
  FOR UPDATE TO authenticated
  USING (public.can_access_company(company_id) AND public.is_admin_or_office())
  WITH CHECK (public.can_access_company(company_id) AND public.is_admin_or_office());

CREATE POLICY checklist_templates_delete ON public.checklist_templates
  FOR DELETE TO authenticated
  USING (public.can_access_company(company_id) AND public.is_admin_or_office());

-- entries: the engineer manages their own overlays. Office reads the cross-user
-- grid through the SECURITY DEFINER RPC (which bypasses RLS), so table RLS only
-- needs to let a user read/write rows for sites they can access (per_site) or
-- their own per_user rows.
CREATE POLICY checklist_entries_select ON public.checklist_entries
  FOR SELECT TO authenticated
  USING (
    (site_id IS NOT NULL AND public.can_access_site(site_id))
    OR user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
  );

CREATE POLICY checklist_entries_insert ON public.checklist_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    (site_id IS NOT NULL AND public.can_access_site(site_id))
    OR user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
  );

CREATE POLICY checklist_entries_update ON public.checklist_entries
  FOR UPDATE TO authenticated
  USING (
    (site_id IS NOT NULL AND public.can_access_site(site_id))
    OR user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
  )
  WITH CHECK (
    (site_id IS NOT NULL AND public.can_access_site(site_id))
    OR user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
  );

CREATE POLICY checklist_entries_delete ON public.checklist_entries
  FOR DELETE TO authenticated
  USING (
    (site_id IS NOT NULL AND public.can_access_site(site_id))
    OR user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid())
  );

-- stock confirmations: manage where you can access the site.
CREATE POLICY daily_stock_confirmations_select ON public.daily_stock_confirmations
  FOR SELECT TO authenticated
  USING (public.can_access_site(site_id));

CREATE POLICY daily_stock_confirmations_insert ON public.daily_stock_confirmations
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_site(site_id));

CREATE POLICY daily_stock_confirmations_update ON public.daily_stock_confirmations
  FOR UPDATE TO authenticated
  USING (public.can_access_site(site_id))
  WITH CHECK (public.can_access_site(site_id));

-- ============================================================
-- Seed: default checklists for every existing company
-- ============================================================
-- site_engineer role — all auto, per_site
INSERT INTO public.checklist_templates
  (company_id, role, item_key, label, description, detection_type, detection_source, deep_link_path, applies_scope, sort_order)
SELECT c.id, 'site_engineer', v.item_key, v.label, v.description, 'auto', v.detection_source, v.deep_link_path, 'per_site', v.sort_order
FROM public.companies c
CROSS JOIN (VALUES
  ('attendance_morning', 'Morning attendance',          'Record this morning''s attendance for the site',                'attendance_morning', '/site/attendance',            1),
  ('attendance_evening', 'Evening closing',             'Confirm / close today''s attendance at end of day',             'attendance_evening', '/site/attendance',            2),
  ('stock_confirmation', 'Morning stock confirmation',  'Confirm the system stock matches the physical stock on site',   'stock_confirmation', '/site/inventory',             3),
  ('material_usage',     'Material usage logged',       'Log today''s material usage (or mark nothing to log)',          'material_usage',     '/site/inventory?tab=usage',   4),
  ('delivery_status',    'Update delivery status',      'Mark pending deliveries as delivered or yet-to-deliver',        'delivery_status',    '/site/delivery-verification',  5),
  ('wallet_settlement',  'Wallet settlements',          'Clear any pending settlements from your wallet',                'wallet_settlement',  '/site/my-wallet',             6)
) AS v(item_key, label, description, detection_source, deep_link_path, sort_order)
ON CONFLICT (company_id, role, item_key) DO NOTHING;

-- office role — manual, per_user (no backing activity table yet)
INSERT INTO public.checklist_templates
  (company_id, role, item_key, label, description, detection_type, detection_source, deep_link_path, applies_scope, sort_order)
SELECT c.id, 'office', v.item_key, v.label, v.description, 'manual', NULL, v.deep_link_path, 'per_user', v.sort_order
FROM public.companies c
CROSS JOIN (VALUES
  ('review_settlements', 'Review pending settlements', 'Review and action engineer wallet settlements', '/company/engineer-wallet', 1),
  ('confirm_purchases',  'Confirm day''s purchases',   'Verify and confirm purchases recorded today',   '/company/materials',       2)
) AS v(item_key, label, description, deep_link_path, sort_order)
ON CONFLICT (company_id, role, item_key) DO NOTHING;

COMMENT ON TABLE public.checklist_templates IS 'Admin-configurable per-role daily checklist item definitions. detection_source is a closed registry mapped to resolver branches in get_checklist_compliance.';
COMMENT ON TABLE public.checklist_entries IS 'Per-user/site/date manual overlay (done/deferred/na + reason + note) on top of auto-detected compliance.';
COMMENT ON TABLE public.daily_stock_confirmations IS 'Morning physical-vs-system stock confirmation per site/date. Backs the stock_confirmation checklist source.';
