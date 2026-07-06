-- Mesthri commission — Part B, Migration C: commission payout type + payable RPC.
--
-- A commission payout to a mesthri reuses settlement_groups (inherits idempotency,
-- the already-settled guard, wallet debit, v_all_expenses, and reversal) — we do NOT
-- build a parallel ledger. It is a settlement_groups row with payment_type='commission'
-- and commission_collector_laborer_id = the mesthri. Because the salary waterfalls filter
-- payment_type='salary', commission payouts never disturb the wages-due-vs-paid math.

-- 1. Allow the new payout type + record who collected it.
ALTER TABLE public.settlement_groups DROP CONSTRAINT IF EXISTS settlement_groups_payment_type_check;
ALTER TABLE public.settlement_groups ADD CONSTRAINT settlement_groups_payment_type_check
  CHECK (payment_type IN ('salary', 'advance', 'other', 'excess', 'commission'));

ALTER TABLE public.settlement_groups
  ADD COLUMN IF NOT EXISTS commission_collector_laborer_id uuid NULL
    REFERENCES public.laborers(id);

CREATE INDEX IF NOT EXISTS idx_settlement_groups_commission_collector
  ON public.settlement_groups (commission_collector_laborer_id, site_id)
  WHERE payment_type = 'commission';

COMMENT ON COLUMN public.settlement_groups.commission_collector_laborer_id IS
  'For payment_type=commission: the mesthri (laborer) this commission payout was made to.';

-- 2. Accrued vs paid commission per mesthri (collector). Settled attendance rows use
-- the locked snapshot; unsettled crew days use the live estimate. Paid = Σ of the
-- mesthri''s commission settlement_groups (not cancelled).
CREATE OR REPLACE FUNCTION public.get_mesthri_commission_payable(
  p_site_id uuid,
  p_collector_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
) RETURNS TABLE(
  collector_id uuid,
  collector_name text,
  accrued numeric,
  paid numeric,
  payable numeric,
  crew_day_count integer
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH accr AS (
    SELECT
      COALESCE(d.mesthri_commission_collector_id, vc.collector_id) AS coll,
      COALESCE(d.mesthri_commission_amount, vc.commission_amount)  AS comm
    FROM public.daily_attendance d
    JOIN public.laborers l ON l.id = d.laborer_id
    JOIN public.v_daily_attendance_commission vc ON vc.attendance_id = d.id
    WHERE d.site_id = p_site_id
      AND d.is_deleted = false
      AND d.is_archived = false
      -- either an unsettled crew day (live estimate) or an already-settled crew day (snapshot)
      AND (vc.is_commission_crew_day OR d.mesthri_commission_amount IS NOT NULL)
      AND (p_date_from IS NULL OR d.date >= p_date_from)
      AND (p_date_to   IS NULL OR d.date <= p_date_to)
  ),
  acc AS (
    SELECT coll, SUM(comm)::numeric AS accrued, COUNT(*)::int AS crew_day_count
    FROM accr WHERE coll IS NOT NULL GROUP BY coll
  ),
  pay AS (
    SELECT sg.commission_collector_laborer_id AS coll, SUM(sg.total_amount)::numeric AS paid
    FROM public.settlement_groups sg
    WHERE sg.site_id = p_site_id
      AND sg.payment_type = 'commission'
      AND sg.is_cancelled = false
      AND sg.is_archived  = false
      AND sg.commission_collector_laborer_id IS NOT NULL
      AND (p_date_from IS NULL OR sg.settlement_date >= p_date_from)
      AND (p_date_to   IS NULL OR sg.settlement_date <= p_date_to)
    GROUP BY sg.commission_collector_laborer_id
  )
  SELECT
    a.coll                                       AS collector_id,
    lb.name                                       AS collector_name,
    a.accrued                                     AS accrued,
    COALESCE(p.paid, 0)                           AS paid,
    (a.accrued - COALESCE(p.paid, 0))             AS payable,
    a.crew_day_count                              AS crew_day_count
  FROM acc a
  LEFT JOIN pay p ON p.coll = a.coll
  LEFT JOIN public.laborers lb ON lb.id = a.coll
  WHERE (p_collector_id IS NULL OR a.coll = p_collector_id)
  ORDER BY payable DESC;
$function$;

COMMENT ON FUNCTION public.get_mesthri_commission_payable(uuid, uuid, date, date) IS
  'Per-mesthri commission accrued (snapshot if settled, else estimate) vs paid (Σ payment_type=commission groups) → payable. Scoped by site + optional collector + date window.';

GRANT EXECUTE ON FUNCTION public.get_mesthri_commission_payable(uuid, uuid, date, date)
  TO authenticated, service_role;
