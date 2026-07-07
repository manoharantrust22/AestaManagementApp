-- Contract pay console (iteration 2) — per-laborer PAID state on the ledger.
--
-- Direct-pay mode settles each company laborer INSIDE the contract pane, so the
-- ledger now needs to show, per laborer, how much of their net is already paid vs
-- still owed. `daily_attendance.is_paid` is the source of truth (a settled row is
-- linked to a settlement_group by settle_contract_laborer); no separate payable RPC.
--
-- Return shape changes (two new columns), so this must DROP + CREATE rather than
-- CREATE OR REPLACE. Additive for existing callers (they read columns by name).

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
  net_paid numeric,      -- Σ net over rows already settled (is_paid = true)
  net_unpaid numeric,    -- Σ net over rows still owed (is_paid = false)
  is_mesthri boolean
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT
    d.laborer_id,
    l.name                                                            AS laborer_name,
    COALESCE(lr.name, 'Unknown')                                      AS role_name,
    COALESCE(SUM(COALESCE(d.work_days, 1)), 0)::numeric               AS man_days,
    COUNT(*)::int                                                     AS day_count,
    COALESCE(SUM(d.daily_earnings), 0)::numeric                       AS gross,
    -- settled rows: snapshot; unsettled crew rows: live estimate; else 0.
    COALESCE(SUM(COALESCE(d.mesthri_commission_amount, vc.commission_amount)), 0)::numeric AS commission,
    COALESCE(SUM(d.daily_earnings
                 - COALESCE(d.mesthri_commission_amount, vc.commission_amount)), 0)::numeric AS net,
    COALESCE(SUM(CASE WHEN d.is_paid THEN
                 d.daily_earnings - COALESCE(d.mesthri_commission_amount, vc.commission_amount)
                 ELSE 0 END), 0)::numeric                             AS net_paid,
    COALESCE(SUM(CASE WHEN NOT d.is_paid THEN
                 d.daily_earnings - COALESCE(d.mesthri_commission_amount, vc.commission_amount)
                 ELSE 0 END), 0)::numeric                             AS net_unpaid,
    bool_or(vc.collector_id = d.laborer_id)                           AS is_mesthri
  FROM public.daily_attendance d
  JOIN public.laborers l ON l.id = d.laborer_id
  LEFT JOIN public.labor_roles lr ON lr.id = l.role_id
  JOIN public.v_daily_attendance_commission vc ON vc.attendance_id = d.id
  WHERE d.is_deleted = false
    AND d.is_archived = false
    AND l.laborer_type = 'contract'                 -- company laborers only
    AND (p_date_from IS NULL OR d.date >= p_date_from)
    AND (p_date_to   IS NULL OR d.date <= p_date_to)
    AND (
      (p_kind = 'task_work'  AND d.task_work_package_id = p_ref_id)
      OR
      (p_kind = 'subcontract' AND d.subcontract_id = p_ref_id AND d.task_work_package_id IS NULL)
    )
  GROUP BY d.laborer_id, l.name, lr.name
  ORDER BY is_mesthri DESC, net DESC, l.name;
$function$;

COMMENT ON FUNCTION public.get_contract_labor_ledger(text, uuid, date, date) IS
  'Per-company-laborer earnings ledger for one contract (task_work package or subcontract) over a date window: man-days, gross, mesthri commission (snapshot if settled, else estimate), net, net_paid / net_unpaid (in-pane direct-pay progress), and an is_mesthri flag. Read-only.';

GRANT EXECUTE ON FUNCTION public.get_contract_labor_ledger(text, uuid, date, date)
  TO authenticated, service_role;
