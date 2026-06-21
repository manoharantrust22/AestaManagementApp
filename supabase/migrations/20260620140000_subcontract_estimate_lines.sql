-- Workforce Ship 2a: multi-worker estimate for a task work (subcontract).
--
-- The owner flagged the old single-rate estimate as wrong: a task work uses
-- several worker TYPES (Mason ×2 × 6d × ₹900, Helper ×1 × 6d × ₹600). Each row
-- here is one such line; the day-wage benchmark = Σ(worker_count × days × daily_rate),
-- which the agreed lump sum is compared against to show the expected saving and,
-- alongside attendance-implied labour value, the over/under-paid monitor.
--
-- Additive only: new child table of subcontracts. RLS mirrors the sibling child
-- tables (subcontract_scopes / work_stages): permissive, access enforced in-app.

CREATE TABLE IF NOT EXISTS public.subcontract_estimate_lines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontract_id  uuid NOT NULL REFERENCES public.subcontracts(id) ON DELETE CASCADE,
  -- Optional link to a labor_role (prefills the rate); role_label always holds the
  -- display name so free-typed worker types work too.
  role_id         uuid REFERENCES public.labor_roles(id) ON DELETE SET NULL,
  role_label      text NOT NULL,
  worker_count    numeric(8,2) NOT NULL DEFAULT 0,
  days            numeric(8,2) NOT NULL DEFAULT 0,
  daily_rate      numeric(12,2) NOT NULL DEFAULT 0,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.subcontract_estimate_lines IS
  'Multi-worker day-wage estimate lines for a task work (subcontract). Benchmark = Σ(worker_count × days × daily_rate); drives the expected-saving + over/under-paid monitor.';

CREATE INDEX IF NOT EXISTS idx_subcontract_estimate_lines_contract
  ON public.subcontract_estimate_lines (subcontract_id);

ALTER TABLE public.subcontract_estimate_lines ENABLE ROW LEVEL SECURITY;

-- Permissive policies (match sibling subcontract child tables; access enforced in-app)
CREATE POLICY allow_authenticated_select_subcontract_estimate_lines ON public.subcontract_estimate_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY allow_anon_select_subcontract_estimate_lines          ON public.subcontract_estimate_lines FOR SELECT TO anon          USING (true);
CREATE POLICY allow_authenticated_insert_subcontract_estimate_lines ON public.subcontract_estimate_lines FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY allow_anon_insert_subcontract_estimate_lines          ON public.subcontract_estimate_lines FOR INSERT TO anon          WITH CHECK (true);
CREATE POLICY allow_authenticated_update_subcontract_estimate_lines ON public.subcontract_estimate_lines FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_anon_update_subcontract_estimate_lines          ON public.subcontract_estimate_lines FOR UPDATE TO anon          USING (true) WITH CHECK (true);
CREATE POLICY allow_authenticated_delete_subcontract_estimate_lines ON public.subcontract_estimate_lines FOR DELETE TO authenticated USING (true);
CREATE POLICY allow_anon_delete_subcontract_estimate_lines          ON public.subcontract_estimate_lines FOR DELETE TO anon          USING (true);
