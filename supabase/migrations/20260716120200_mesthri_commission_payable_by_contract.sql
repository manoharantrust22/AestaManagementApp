-- Scope commission accrued/paid to ONE contract, so a contract pane can show
-- "commission still owed on THIS contract" instead of the mesthri's whole-site pot.
--
-- Accrual has always been per-contract (daily_attendance carries the contract). Paid
-- was not: a commission payout is a settlement_groups row keyed only by site + collector.
-- Payouts now optionally carry contract_ref_kind/contract_ref_id (see settlementService),
-- so paid can be scoped too — but only for payouts recorded AFTER that change.
--
-- untagged_paid reports commission paid to this collector at this site with NO contract
-- tag (i.e. every legacy payout). The UI shows it as an explicit caveat. It is deliberately
-- NOT subtracted from payable: we cannot know which contract it settled, and guessing
-- would write fiction into the money ledger.

-- RETURNS TABLE gains untagged_paid → drop before create.
DROP FUNCTION IF EXISTS public.get_mesthri_commission_payable(uuid, uuid, date, date);

CREATE FUNCTION public.get_mesthri_commission_payable(
  p_site_id uuid,
  p_collector_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_contract_ref_kind text DEFAULT NULL,   -- 'task_work' | 'subcontract' | NULL = whole site
  p_contract_ref_id uuid DEFAULT NULL
) RETURNS TABLE(
  collector_id uuid,
  collector_name text,
  accrued numeric,
  paid numeric,
  payable numeric,
  crew_day_count integer,
  untagged_paid numeric
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
      AND (vc.is_commission_crew_day OR d.mesthri_commission_amount IS NOT NULL)
      AND (p_date_from IS NULL OR d.date >= p_date_from)
      AND (p_date_to   IS NULL OR d.date <= p_date_to)
      AND (
        p_contract_ref_kind IS NULL
        OR (p_contract_ref_kind = 'task_work'   AND d.task_work_package_id = p_contract_ref_id)
        OR (p_contract_ref_kind = 'subcontract' AND d.subcontract_id = p_contract_ref_id
                                                AND d.task_work_package_id IS NULL)
      )
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
      AND (
        p_contract_ref_kind IS NULL
        OR (sg.contract_ref_kind = p_contract_ref_kind AND sg.contract_ref_id = p_contract_ref_id)
      )
    GROUP BY sg.commission_collector_laborer_id
  ),
  untagged AS (
    SELECT sg.commission_collector_laborer_id AS coll, SUM(sg.total_amount)::numeric AS untagged_paid
    FROM public.settlement_groups sg
    WHERE sg.site_id = p_site_id
      AND sg.payment_type = 'commission'
      AND sg.is_cancelled = false
      AND sg.is_archived  = false
      AND sg.commission_collector_laborer_id IS NOT NULL
      AND sg.contract_ref_id IS NULL
    GROUP BY sg.commission_collector_laborer_id
  )
  SELECT
    a.coll                                        AS collector_id,
    lb.name                                       AS collector_name,
    a.accrued                                     AS accrued,
    COALESCE(p.paid, 0)                           AS paid,
    (a.accrued - COALESCE(p.paid, 0))             AS payable,
    a.crew_day_count                              AS crew_day_count,
    -- Only meaningful when scoped to a contract; site-wide mode already counts everything.
    CASE WHEN p_contract_ref_kind IS NULL THEN 0 ELSE COALESCE(u.untagged_paid, 0) END
                                                  AS untagged_paid
  FROM acc a
  LEFT JOIN pay p        ON p.coll = a.coll
  LEFT JOIN untagged u   ON u.coll = a.coll
  LEFT JOIN public.laborers lb ON lb.id = a.coll
  WHERE (p_collector_id IS NULL OR a.coll = p_collector_id)
  ORDER BY payable DESC;
$function$;

COMMENT ON FUNCTION public.get_mesthri_commission_payable(uuid, uuid, date, date, text, uuid) IS
  'Per-mesthri commission accrued vs paid → payable. Scoped by site + optional collector + date window + optional contract ref. With a contract ref, paid counts only payouts tagged to that contract and untagged_paid reports legacy site-wide payouts (surfaced as a UI caveat, never subtracted — which contract they settled is unknowable).';

GRANT EXECUTE ON FUNCTION public.get_mesthri_commission_payable(uuid, uuid, date, date, text, uuid)
  TO authenticated, service_role;
