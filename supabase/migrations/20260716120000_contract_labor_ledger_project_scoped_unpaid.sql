-- Fix scope mixing in get_contract_labor_ledger.
--
-- Before: gross/commission/net were windowed by p_date_from/p_date_to but net_paid was
-- project-wide, so net_unpaid = windowed_net - project_paid. Only correct at Project view
-- (the old header admitted as much). On Day/Week it clamped rows to 0 and produced
-- captions like "₹5,200 paid of ₹3,600".
--
-- After: net_total is the laborer's PROJECT-scoped net; net_unpaid = net_total - net_paid,
-- so paid/remaining are project-scoped on every tab and the UI labels them "in total".
-- gross/commission/net stay windowed — they are the honest "earned in this window".
--
-- Also: the paid CTE now excludes payment_type='commission'. Commission payouts gain a
-- contract tag in a later migration; without this filter one would be miscounted as the
-- mesthri's own wages paid, inflating net_paid and hiding real debt.

-- ---------------------------------------------------------------------------
-- Shared building blocks. Both this RPC and get_contract_labor_ledger_weekly
-- (next migration) select from these, so the contract-matching rule, the
-- settled-snapshot-vs-live-estimate rule, and the payment_type guard have ONE
-- definition. Duplicating them would let a later fix land in the Project view
-- but not the Week view, making the two tabs disagree about the same money.
-- ---------------------------------------------------------------------------

-- One row per attendance day on this contract, commission resolved.
CREATE OR REPLACE FUNCTION public.contract_labor_days(
  p_kind text,                       -- 'task_work' | 'subcontract'
  p_ref_id uuid
) RETURNS TABLE(
  day_date date,
  laborer_id uuid,
  laborer_name text,
  role_name text,
  work_days numeric,
  daily_earnings numeric,
  comm numeric,
  is_mesthri_day boolean
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT
    d.date                                                        AS day_date,
    d.laborer_id,
    l.name                                                        AS laborer_name,
    COALESCE(lr.name, 'Unknown')                                  AS role_name,
    COALESCE(d.work_days, 1)::numeric                             AS work_days,
    d.daily_earnings,
    -- settled rows: locked snapshot; unsettled crew rows: live estimate.
    COALESCE(d.mesthri_commission_amount, vc.commission_amount)   AS comm,
    (vc.collector_id = d.laborer_id)                              AS is_mesthri_day
  FROM public.daily_attendance d
  JOIN public.laborers l ON l.id = d.laborer_id
  LEFT JOIN public.labor_roles lr ON lr.id = l.role_id
  JOIN public.v_daily_attendance_commission vc ON vc.attendance_id = d.id
  WHERE d.is_deleted = false
    AND d.is_archived = false
    AND l.laborer_type = 'contract'                 -- company laborers only
    AND (
      (p_kind = 'task_work'   AND d.task_work_package_id = p_ref_id)
      OR
      (p_kind = 'subcontract' AND d.subcontract_id = p_ref_id AND d.task_work_package_id IS NULL)
    );
$function$;

COMMENT ON FUNCTION public.contract_labor_days(text, uuid) IS
  'Per-day company-laborer projection for one contract, commission resolved (snapshot if settled, else estimate). Shared base for get_contract_labor_ledger and get_contract_labor_ledger_weekly so the contract-matching and commission rules have one definition.';

GRANT EXECUTE ON FUNCTION public.contract_labor_days(text, uuid) TO authenticated, service_role;

-- Rupee settlements credited to each laborer on this contract.
CREATE OR REPLACE FUNCTION public.contract_laborer_paid(
  p_kind text,
  p_ref_id uuid
) RETURNS TABLE(
  laborer_id uuid,
  net_paid numeric
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT sg.contract_laborer_id AS laborer_id,
         COALESCE(SUM(sg.total_amount), 0)::numeric AS net_paid
  FROM public.settlement_groups sg
  WHERE sg.contract_ref_kind = p_kind
    AND sg.contract_ref_id = p_ref_id
    AND sg.contract_laborer_id IS NOT NULL
    AND sg.payment_type <> 'commission'   -- commission is not own-wages
    AND sg.is_cancelled = false
    AND sg.is_archived = false
  GROUP BY sg.contract_laborer_id;
$function$;

COMMENT ON FUNCTION public.contract_laborer_paid(text, uuid) IS
  'Project-scoped ₹ settled per laborer on one contract. Excludes payment_type=commission: commission payouts carry a contract ref too, and counting one here would inflate the mesthri''s own-wages paid and hide real debt.';

GRANT EXECUTE ON FUNCTION public.contract_laborer_paid(text, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The ledger itself.
-- ---------------------------------------------------------------------------

-- RETURNS TABLE gains net_total → the function must be dropped, not replaced.
DROP FUNCTION IF EXISTS public.get_contract_labor_ledger(text, uuid, date, date);

CREATE FUNCTION public.get_contract_labor_ledger(
  p_kind text,                       -- 'task_work' | 'subcontract'
  p_ref_id uuid,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
) RETURNS TABLE(
  laborer_id uuid,
  laborer_name text,
  role_name text,
  man_days numeric,
  day_count integer,
  gross numeric,
  commission numeric,
  net numeric,
  net_total numeric,
  net_paid numeric,
  net_unpaid numeric,
  is_mesthri boolean
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT * FROM public.contract_labor_days(p_kind, p_ref_id)
  ),
  windowed AS (
    SELECT
      base.laborer_id, base.laborer_name, base.role_name,
      COALESCE(SUM(base.work_days), 0)::numeric              AS man_days,
      COUNT(*)::int                                          AS day_count,
      COALESCE(SUM(base.daily_earnings), 0)::numeric         AS gross,
      COALESCE(SUM(base.comm), 0)::numeric                   AS commission,
      COALESCE(SUM(base.daily_earnings - base.comm), 0)::numeric AS net,
      bool_or(base.is_mesthri_day)                           AS is_mesthri
    FROM base
    WHERE (p_date_from IS NULL OR base.day_date >= p_date_from)
      AND (p_date_to   IS NULL OR base.day_date <= p_date_to)
    GROUP BY base.laborer_id, base.laborer_name, base.role_name
  ),
  lifetime AS (
    SELECT base.laborer_id,
           COALESCE(SUM(base.daily_earnings - base.comm), 0)::numeric AS net_total
    FROM base
    GROUP BY base.laborer_id
  ),
  paid AS (
    SELECT * FROM public.contract_laborer_paid(p_kind, p_ref_id)
  )
  SELECT
    w.laborer_id, w.laborer_name, w.role_name, w.man_days, w.day_count,
    w.gross, w.commission, w.net,
    COALESCE(lt.net_total, 0)::numeric                                        AS net_total,
    COALESCE(p.net_paid, 0)::numeric                                          AS net_paid,
    GREATEST(COALESCE(lt.net_total, 0) - COALESCE(p.net_paid, 0), 0)::numeric AS net_unpaid,
    w.is_mesthri
  FROM windowed w
  LEFT JOIN lifetime lt ON lt.laborer_id = w.laborer_id
  LEFT JOIN paid p      ON p.laborer_id  = w.laborer_id
  ORDER BY w.is_mesthri DESC, w.net DESC, w.laborer_name;
$function$;

COMMENT ON FUNCTION public.get_contract_labor_ledger(text, uuid, date, date) IS
  'Per-company-laborer ledger for one contract. man_days/gross/commission/net are WINDOWED by p_date_from/p_date_to (earned in the window). net_total/net_paid/net_unpaid are PROJECT-scoped (lifetime) because payments are only ever project-scoped — the UI must label them "in total". Read-only.';

GRANT EXECUTE ON FUNCTION public.get_contract_labor_ledger(text, uuid, date, date)
  TO authenticated, service_role;
