-- Mesthri commission — Part A, Migration: get_contract_labor_ledger read RPC.
--
-- Per-company-laborer earnings breakdown for one contract (task-work package OR
-- subcontract) over a date window. Powers the "who earned what + commission" ledger
-- in the trade workspace (Day / Week / Project = today / current Sun–Sat / lifetime
-- = NULL bounds). Read-only; no money movement.
--
-- Commission per row uses the locked snapshot (daily_attendance.mesthri_commission_amount)
-- when the day is already settled, else the live estimate from v_daily_attendance_commission.

CREATE OR REPLACE FUNCTION public.get_contract_labor_ledger(
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
  'Per-company-laborer earnings ledger for one contract (task_work package or subcontract) over a date window: man-days, gross, mesthri commission (snapshot if settled, else estimate), net, and an is_mesthri flag. Read-only.';

GRANT EXECUTE ON FUNCTION public.get_contract_labor_ledger(text, uuid, date, date)
  TO authenticated, service_role;
