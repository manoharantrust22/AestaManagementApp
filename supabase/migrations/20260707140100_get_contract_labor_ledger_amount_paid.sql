-- Amount-based per-laborer paid ledger: net_paid = Σ linked non-cancelled settlement_groups
-- (project-wide), net_unpaid = max(0, net - net_paid). Windowed gross/commission/net for display
-- are unchanged; at the default Project view windowed net = project net so net_unpaid is exact.
CREATE OR REPLACE FUNCTION public.get_contract_labor_ledger(
  p_kind text, p_ref_id uuid, p_date_from date DEFAULT NULL, p_date_to date DEFAULT NULL
)
RETURNS TABLE(laborer_id uuid, laborer_name text, role_name text, man_days numeric,
              day_count integer, gross numeric, commission numeric, net numeric,
              net_paid numeric, net_unpaid numeric, is_mesthri boolean)
LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH days AS (
    SELECT
      d.laborer_id,
      l.name                                                             AS laborer_name,
      COALESCE(lr.name, 'Unknown')                                       AS role_name,
      COALESCE(SUM(COALESCE(d.work_days, 1)), 0)::numeric                AS man_days,
      COUNT(*)::int                                                      AS day_count,
      COALESCE(SUM(d.daily_earnings), 0)::numeric                        AS gross,
      COALESCE(SUM(COALESCE(d.mesthri_commission_amount, vc.commission_amount)), 0)::numeric AS commission,
      COALESCE(SUM(d.daily_earnings
                   - COALESCE(d.mesthri_commission_amount, vc.commission_amount)), 0)::numeric AS net,
      bool_or(vc.collector_id = d.laborer_id)                            AS is_mesthri
    FROM public.daily_attendance d
    JOIN public.laborers l ON l.id = d.laborer_id
    LEFT JOIN public.labor_roles lr ON lr.id = l.role_id
    JOIN public.v_daily_attendance_commission vc ON vc.attendance_id = d.id
    WHERE d.is_deleted = false
      AND d.is_archived = false
      AND l.laborer_type = 'contract'
      AND (p_date_from IS NULL OR d.date >= p_date_from)
      AND (p_date_to   IS NULL OR d.date <= p_date_to)
      AND (
        (p_kind = 'task_work'  AND d.task_work_package_id = p_ref_id)
        OR
        (p_kind = 'subcontract' AND d.subcontract_id = p_ref_id AND d.task_work_package_id IS NULL)
      )
    GROUP BY d.laborer_id, l.name, lr.name
  ),
  paid AS (
    SELECT sg.contract_laborer_id AS laborer_id,
           COALESCE(SUM(sg.total_amount), 0)::numeric AS net_paid
    FROM public.settlement_groups sg
    WHERE sg.contract_ref_kind = p_kind
      AND sg.contract_ref_id = p_ref_id
      AND sg.contract_laborer_id IS NOT NULL
      AND sg.is_cancelled = false
      AND sg.is_archived = false
    GROUP BY sg.contract_laborer_id
  )
  SELECT
    days.laborer_id, days.laborer_name, days.role_name, days.man_days, days.day_count,
    days.gross, days.commission, days.net,
    COALESCE(paid.net_paid, 0)::numeric                                   AS net_paid,
    GREATEST(days.net - COALESCE(paid.net_paid, 0), 0)::numeric           AS net_unpaid,
    days.is_mesthri
  FROM days
  LEFT JOIN paid ON paid.laborer_id = days.laborer_id
  ORDER BY days.is_mesthri DESC, days.net DESC, days.laborer_name;
$function$;
