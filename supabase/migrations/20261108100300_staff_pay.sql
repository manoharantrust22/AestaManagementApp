-- Migration: Private staff pay ledger (Phase 3)
-- Purpose: Track what the company pays its own staff (site engineers /
--          supervisors / office) — monthly salary, incentives, Diwali bonus,
--          advances — and charge that cost to the sites they work on.
--
-- Privacy (deliberate): staff pay is NOT added to v_all_expenses (that view
-- bypasses RLS and is visible to every logged-in user). Instead:
--   * staff_payments            — admin: all rows; a staff member: own rows only
--   * staff_payment_allocations — admin only (per-site split)
--   * v_site_staff_costs        — security_invoker view over allocations, so
--                                 non-admins simply get zero rows
-- Site engineers therefore never see anyone's pay in site expense screens.

DO $$ BEGIN
  CREATE TYPE public.staff_payment_type AS ENUM ('salary', 'incentive', 'bonus', 'advance', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_salary_profiles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  monthly_salary  numeric(12,2) NOT NULL CHECK (monthly_salary >= 0),
  effective_from  date NOT NULL,
  notes           text,
  created_by      uuid REFERENCES public.users(id) ON DELETE SET NULL DEFAULT public.get_current_user_id(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_user_id, effective_from)
);

CREATE TABLE IF NOT EXISTS public.staff_payments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  payment_type     public.staff_payment_type NOT NULL,
  amount           numeric(12,2) NOT NULL CHECK (amount > 0),
  paid_on          date NOT NULL,
  period_month     date CHECK (period_month IS NULL OR period_month = date_trunc('month', period_month)::date),
  payment_mode     text NOT NULL DEFAULT 'upi' CHECK (payment_mode IN ('cash', 'upi', 'bank')),
  notes            text,
  proof_path       text,
  allocation_mode  text NOT NULL DEFAULT 'equal_assigned'
                     CHECK (allocation_mode IN ('equal_assigned', 'custom', 'none')),
  created_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_payments_staff ON public.staff_payments (staff_user_id, paid_on DESC);

CREATE TABLE IF NOT EXISTS public.staff_payment_allocations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id  uuid NOT NULL REFERENCES public.staff_payments(id) ON DELETE CASCADE,
  site_id     uuid NOT NULL REFERENCES public.sites(id) ON DELETE RESTRICT,
  amount      numeric(12,2) NOT NULL CHECK (amount >= 0),
  UNIQUE (payment_id, site_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_payment_alloc_site ON public.staff_payment_allocations (site_id);

-- ---------------------------------------------------------------------------
-- 2. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.staff_salary_profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_payments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_payment_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_salary_profiles_select ON public.staff_salary_profiles;
CREATE POLICY staff_salary_profiles_select ON public.staff_salary_profiles
  FOR SELECT TO authenticated
  USING (public.is_admin() OR staff_user_id = public.get_current_user_id());

DROP POLICY IF EXISTS staff_salary_profiles_admin_write ON public.staff_salary_profiles;
CREATE POLICY staff_salary_profiles_admin_write ON public.staff_salary_profiles
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS staff_payments_select ON public.staff_payments;
CREATE POLICY staff_payments_select ON public.staff_payments
  FOR SELECT TO authenticated
  USING (public.is_admin() OR staff_user_id = public.get_current_user_id());

-- Writes go through record_staff_payment(); direct update/delete admin-only.
DROP POLICY IF EXISTS staff_payments_admin_update ON public.staff_payments;
CREATE POLICY staff_payments_admin_update ON public.staff_payments
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS staff_payments_admin_delete ON public.staff_payments;
CREATE POLICY staff_payments_admin_delete ON public.staff_payments
  FOR DELETE TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS staff_payment_allocations_admin ON public.staff_payment_allocations;
CREATE POLICY staff_payment_allocations_admin ON public.staff_payment_allocations
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. RPC: record a payment + split it across sites atomically
--    p_allocation: NULL → equal split across the staff member's current
--                  assigned_sites (none assigned → company overhead, no split)
--                  '[{"site_id": "...", "pct": 60}, ...]' → custom (must sum to 100)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_staff_payment(
  p_staff_user_id uuid,
  p_payment_type  public.staff_payment_type,
  p_amount        numeric,
  p_paid_on       date,
  p_period_month  date DEFAULT NULL,
  p_payment_mode  text DEFAULT 'upi',
  p_notes         text DEFAULT NULL,
  p_allocation    jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment_id uuid;
  v_sites      uuid[];
  v_pcts       numeric[];
  v_n          int;
  v_total_pct  numeric;
  v_share      numeric;
  v_alloc_sum  numeric := 0;
  v_mode       text;
  i            int;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can record staff payments' USING ERRCODE = '42501';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_staff_user_id) THEN
    RAISE EXCEPTION 'Staff user not found';
  END IF;

  IF p_allocation IS NULL OR jsonb_typeof(p_allocation) <> 'array' OR jsonb_array_length(p_allocation) = 0 THEN
    SELECT COALESCE(array_agg(s.id ORDER BY s.name), '{}')
      INTO v_sites
      FROM users u
      JOIN sites s ON s.id = ANY (u.assigned_sites)
     WHERE u.id = p_staff_user_id;
    v_n := COALESCE(array_length(v_sites, 1), 0);
    v_mode := CASE WHEN v_n = 0 THEN 'none' ELSE 'equal_assigned' END;
    IF v_n > 0 THEN
      v_pcts := array_fill(100.0 / v_n, ARRAY[v_n]);
    END IF;
  ELSE
    SELECT array_agg((e->>'site_id')::uuid ORDER BY ord), array_agg((e->>'pct')::numeric ORDER BY ord)
      INTO v_sites, v_pcts
      FROM jsonb_array_elements(p_allocation) WITH ORDINALITY AS t(e, ord);
    v_n := array_length(v_sites, 1);
    SELECT sum(x) INTO v_total_pct FROM unnest(v_pcts) AS x;
    IF abs(v_total_pct - 100) > 0.01 THEN
      RAISE EXCEPTION 'Site percentages must add up to 100 (got %)', v_total_pct;
    END IF;
    IF (SELECT count(*) FROM sites WHERE id = ANY (v_sites)) <> v_n THEN
      RAISE EXCEPTION 'Unknown or duplicate site in allocation';
    END IF;
    v_mode := 'custom';
  END IF;

  INSERT INTO staff_payments (
    staff_user_id, payment_type, amount, paid_on, period_month,
    payment_mode, notes, allocation_mode, created_by
  ) VALUES (
    p_staff_user_id, p_payment_type, round(p_amount, 2), p_paid_on,
    CASE WHEN p_period_month IS NULL THEN NULL ELSE date_trunc('month', p_period_month)::date END,
    COALESCE(p_payment_mode, 'upi'), NULLIF(btrim(p_notes), ''), v_mode, public.get_current_user_id()
  )
  RETURNING id INTO v_payment_id;

  -- Split in paise; any rounding remainder goes to the first site.
  IF v_n > 0 THEN
    FOR i IN 2..v_n LOOP
      v_share := floor(round(p_amount, 2) * v_pcts[i]) / 100.0;
      v_alloc_sum := v_alloc_sum + v_share;
      INSERT INTO staff_payment_allocations (payment_id, site_id, amount) VALUES (v_payment_id, v_sites[i], v_share);
    END LOOP;
    INSERT INTO staff_payment_allocations (payment_id, site_id, amount)
      VALUES (v_payment_id, v_sites[1], round(p_amount, 2) - v_alloc_sum);
  END IF;

  RETURN v_payment_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_staff_payment(uuid, public.staff_payment_type, numeric, date, date, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_staff_payment(uuid, public.staff_payment_type, numeric, date, date, text, text, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Per-site staff cost (admin-only by way of the allocations RLS)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_site_staff_costs
WITH (security_invoker = true) AS
SELECT
  a.site_id,
  date_trunc('month', p.paid_on)::date AS month,
  p.payment_type,
  p.staff_user_id,
  sum(a.amount)::numeric(14,2)        AS amount
FROM public.staff_payment_allocations a
JOIN public.staff_payments p ON p.id = a.payment_id
GROUP BY a.site_id, date_trunc('month', p.paid_on), p.payment_type, p.staff_user_id;

GRANT SELECT ON public.v_site_staff_costs TO authenticated;
