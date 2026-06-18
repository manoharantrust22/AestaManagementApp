-- Migration: Task Work (piece-rate labour) module — core tables
--
-- Purpose:
--   A "Task Work" package is a defined chunk of work given to a maistry/mason
--   for a FIXED price. The maistry brings his own crew and self-supervises; we
--   pay ad-hoc ADVANCES during the work and a FINAL SETTLEMENT at completion —
--   never daily wages. This is standard piece-rate ("naka") labour contracting.
--
--   This is a SEPARATE first-class module (not folded into `subcontracts`) but
--   each package may OPTIONALLY link to a parent subcontract for rollup.
--
--   Three tables + one additive column:
--     1. task_work_packages   — the package (scope, price, maistry, estimate/benchmark).
--     2. task_work_day_logs    — daily headcount effort log (man-days; NOT attendance, NEVER paid).
--     3. task_work_payments    — advances + final settlement (mirrors subcontract_payments + payer-source).
--     +  site_engineer_transactions.related_task_work_id — wallet ledger link.
--
--   Profitability is computed by a SQL view (v_task_work_profitability, separate
--   migration). RLS gates every verb on can_access_site(site_id), the current
--   standard (see 20260618120000_checklist_tables.sql).

-- ============================================================
-- Reference generator: TW-YYMMDD-NNN, per-site sequence
-- (mirrors generate_misc_expense_reference, 20260108200000)
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_task_work_reference(p_site_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_date_code TEXT;
  v_next_seq INT;
  v_reference TEXT;
  v_lock_key BIGINT;
BEGIN
  -- Unique advisory lock per site to serialize sequence allocation
  v_lock_key := ('x' || substr(md5(p_site_id::text || 'task_work_package'), 1, 15))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  v_date_code := TO_CHAR(CURRENT_DATE, 'YYMMDD');

  SELECT COALESCE(MAX(
    CAST(
      SUBSTRING(package_number FROM 'TW-' || v_date_code || '-(\d+)')
      AS INTEGER
    )
  ), 0) + 1
  INTO v_next_seq
  FROM public.task_work_packages
  WHERE site_id = p_site_id
    AND package_number LIKE 'TW-' || v_date_code || '-%';

  v_reference := 'TW-' || v_date_code || '-' || LPAD(v_next_seq::TEXT, 3, '0');
  RETURN v_reference;
END;
$$;

COMMENT ON FUNCTION public.generate_task_work_reference(uuid) IS
  'Generates unique task-work package reference in TW-YYMMDD-NNN format with advisory lock for concurrency.';

GRANT EXECUTE ON FUNCTION public.generate_task_work_reference(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_task_work_reference(uuid) TO service_role;

-- ============================================================
-- 1. task_work_packages
-- ============================================================
CREATE TABLE IF NOT EXISTS public.task_work_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id),
  package_number text NOT NULL,
  title text NOT NULL,
  scope_of_work text,
  -- Work-type grouping for the rate book
  labor_category_id uuid REFERENCES public.labor_categories(id),
  -- Maistry: a known laborer OR an outside maistry (denormalized snapshot)
  maistry_laborer_id uuid REFERENCES public.laborers(id) ON DELETE SET NULL,
  maistry_name text,
  maistry_phone text,
  -- Pricing
  pricing_mode text NOT NULL DEFAULT 'lump_sum'
    CHECK (pricing_mode IN ('lump_sum', 'rate_based')),
  total_value numeric(14,2) NOT NULL DEFAULT 0,
  rate_per_unit numeric(10,2),
  measurement_unit public.measurement_unit,
  total_units numeric(12,2),
  -- Estimate / daywage benchmark (the basis the price was arrived at)
  estimated_crew_size integer,
  estimated_days numeric(6,1),
  benchmark_daily_rate numeric(10,2),
  -- Schedule
  planned_start_date date,
  planned_end_date date,
  actual_start_date date,
  actual_end_date date,
  -- Quality hold-back
  retention_percent numeric(5,2) NOT NULL DEFAULT 0
    CHECK (retention_percent >= 0 AND retention_percent <= 100),
  -- Lifecycle (reuse the existing contract_status enum)
  status public.contract_status NOT NULL DEFAULT 'draft',
  -- Optional rollup into a parent subcontract
  parent_subcontract_id uuid REFERENCES public.subcontracts(id) ON DELETE SET NULL,
  notes text,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_task_work_packages_site_ref UNIQUE (site_id, package_number),
  -- Rate-based packages must carry the unit fields
  CONSTRAINT chk_task_work_rate_based CHECK (
    pricing_mode = 'lump_sum'
    OR (rate_per_unit IS NOT NULL AND total_units IS NOT NULL AND measurement_unit IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_task_work_packages_site_id ON public.task_work_packages (site_id);
CREATE INDEX IF NOT EXISTS idx_task_work_packages_status ON public.task_work_packages (status);
CREATE INDEX IF NOT EXISTS idx_task_work_packages_parent ON public.task_work_packages (parent_subcontract_id);
CREATE INDEX IF NOT EXISTS idx_task_work_packages_category ON public.task_work_packages (labor_category_id);

CREATE TRIGGER trg_task_work_packages_updated_at
  BEFORE UPDATE ON public.task_work_packages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 2. task_work_day_logs (daily headcount; man-days only)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.task_work_day_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.task_work_packages(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.sites(id),
  log_date date NOT NULL,
  worker_count integer NOT NULL CHECK (worker_count >= 0),
  worker_note text,
  -- Default 0; the service sets man_days = worker_count unless a fractional
  -- (half-day) value is entered. SQL defaults cannot reference another column.
  man_days numeric(6,2) NOT NULL DEFAULT 0 CHECK (man_days >= 0),
  recorded_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_task_work_day_logs UNIQUE (package_id, log_date)
);

CREATE INDEX IF NOT EXISTS idx_task_work_day_logs_package ON public.task_work_day_logs (package_id, log_date);

-- ============================================================
-- 3. task_work_payments (advances + final settlement)
-- (mirrors subcontract_payments + misc payer-source columns)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.task_work_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.task_work_packages(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.sites(id),
  payment_type text NOT NULL
    CHECK (payment_type IN ('advance', 'part_payment', 'final_settlement', 'retention_release')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  payment_date date NOT NULL,
  payment_mode public.payment_mode NOT NULL,
  payment_channel text CHECK (payment_channel IN ('direct', 'engineer_wallet')),
  -- Payer source (reuses the same vocabulary as settlements / misc_expenses)
  payer_source text,
  payer_name text,
  payer_source_split jsonb,
  engineer_transaction_id uuid REFERENCES public.site_engineer_transactions(id),
  balance_after_payment numeric(14,2),
  reference_number text,
  proof_url text,
  is_deleted boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.users(id),
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_work_payments_package
  ON public.task_work_payments (package_id) WHERE is_deleted = false;
CREATE INDEX IF NOT EXISTS idx_task_work_payments_txn
  ON public.task_work_payments (engineer_transaction_id);

-- ============================================================
-- 4. Additive: wallet ledger link to a task-work package
-- ============================================================
ALTER TABLE public.site_engineer_transactions
  ADD COLUMN IF NOT EXISTS related_task_work_id uuid REFERENCES public.task_work_packages(id);

CREATE INDEX IF NOT EXISTS idx_set_related_task_work_id
  ON public.site_engineer_transactions (related_task_work_id);

-- ============================================================
-- RLS — gate every verb on can_access_site(site_id).
-- site_id is present on all three tables, so no joins are needed.
-- Rows with maistry_laborer_id IS NULL (outside maistries) are fully
-- covered because no policy references the laborer.
-- ============================================================
ALTER TABLE public.task_work_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_work_day_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_work_payments ENABLE ROW LEVEL SECURITY;

-- task_work_packages
CREATE POLICY task_work_packages_select ON public.task_work_packages
  FOR SELECT TO authenticated USING (public.can_access_site(site_id));
CREATE POLICY task_work_packages_insert ON public.task_work_packages
  FOR INSERT TO authenticated WITH CHECK (public.can_access_site(site_id));
CREATE POLICY task_work_packages_update ON public.task_work_packages
  FOR UPDATE TO authenticated
  USING (public.can_access_site(site_id)) WITH CHECK (public.can_access_site(site_id));
CREATE POLICY task_work_packages_delete ON public.task_work_packages
  FOR DELETE TO authenticated USING (public.can_access_site(site_id));

-- task_work_day_logs
CREATE POLICY task_work_day_logs_select ON public.task_work_day_logs
  FOR SELECT TO authenticated USING (public.can_access_site(site_id));
CREATE POLICY task_work_day_logs_insert ON public.task_work_day_logs
  FOR INSERT TO authenticated WITH CHECK (public.can_access_site(site_id));
CREATE POLICY task_work_day_logs_update ON public.task_work_day_logs
  FOR UPDATE TO authenticated
  USING (public.can_access_site(site_id)) WITH CHECK (public.can_access_site(site_id));
CREATE POLICY task_work_day_logs_delete ON public.task_work_day_logs
  FOR DELETE TO authenticated USING (public.can_access_site(site_id));

-- task_work_payments
CREATE POLICY task_work_payments_select ON public.task_work_payments
  FOR SELECT TO authenticated USING (public.can_access_site(site_id));
CREATE POLICY task_work_payments_insert ON public.task_work_payments
  FOR INSERT TO authenticated WITH CHECK (public.can_access_site(site_id));
CREATE POLICY task_work_payments_update ON public.task_work_payments
  FOR UPDATE TO authenticated
  USING (public.can_access_site(site_id)) WITH CHECK (public.can_access_site(site_id));
CREATE POLICY task_work_payments_delete ON public.task_work_payments
  FOR DELETE TO authenticated USING (public.can_access_site(site_id));

-- ============================================================
-- Grants
-- ============================================================
GRANT ALL ON TABLE public.task_work_packages TO authenticated, service_role;
GRANT ALL ON TABLE public.task_work_day_logs TO authenticated, service_role;
GRANT ALL ON TABLE public.task_work_payments TO authenticated, service_role;

COMMENT ON TABLE public.task_work_packages IS 'Piece-rate ("naka") labour task-work packages: fixed-price work given to a maistry crew. Separate from subcontracts; optional parent_subcontract_id rollup.';
COMMENT ON TABLE public.task_work_day_logs IS 'Daily headcount effort log for a task-work package (man-days). NOT attendance and never paid daily; used only for profitability analysis.';
COMMENT ON TABLE public.task_work_payments IS 'Advances + final settlement for a task-work package. Mirrors subcontract_payments and reuses the payer-source / engineer-wallet machinery.';
