-- Migration: Task Work variations (extras / change orders)
--
-- Purpose:
--   A maistry agrees a base fixed price up front. As scope grows he asks for
--   EXTRA money. Each request carries a reason, gets reviewed, and once APPROVED
--   it is added to the agreed amount. This table records those requests so the
--   "Money vs work" view can use the EFFECTIVE agreed price:
--       effective_agreed = task_work_packages.total_value
--                          + Σ(amount WHERE status = 'approved')
--
--   Mirrors the RLS / grants pattern of task_work_day_logs (gate every verb on
--   can_access_site(site_id); site_id is on the row so no joins needed).
--   Purely additive — a brand-new table; nothing existing is touched.

CREATE TABLE IF NOT EXISTS public.task_work_variations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.task_work_packages(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.sites(id),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_date date NOT NULL DEFAULT CURRENT_DATE,
  decided_date date,
  decided_note text,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_work_variations_package
  ON public.task_work_variations (package_id);

-- ============================================================
-- RLS — gate every verb on can_access_site(site_id).
-- ============================================================
ALTER TABLE public.task_work_variations ENABLE ROW LEVEL SECURITY;

CREATE POLICY task_work_variations_select ON public.task_work_variations
  FOR SELECT TO authenticated USING (public.can_access_site(site_id));
CREATE POLICY task_work_variations_insert ON public.task_work_variations
  FOR INSERT TO authenticated WITH CHECK (public.can_access_site(site_id));
CREATE POLICY task_work_variations_update ON public.task_work_variations
  FOR UPDATE TO authenticated
  USING (public.can_access_site(site_id)) WITH CHECK (public.can_access_site(site_id));
CREATE POLICY task_work_variations_delete ON public.task_work_variations
  FOR DELETE TO authenticated USING (public.can_access_site(site_id));

GRANT ALL ON TABLE public.task_work_variations TO authenticated, service_role;

COMMENT ON TABLE public.task_work_variations IS
  'Extra-money requests (change orders) against a task-work package. Approved rows add to the package total_value to form the effective agreed price.';
