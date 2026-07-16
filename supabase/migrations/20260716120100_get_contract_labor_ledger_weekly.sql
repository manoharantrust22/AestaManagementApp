-- Per-week, per-laborer ledger for one contract — powers the Week tab's list of
-- separate weeks (wages are paid weekly, so each past week is its own event).
--
-- week_start is Sunday-aligned to match src/lib/utils/weekUtils.ts (weekStartOf = .day(0))
-- and the salary waterfall: date_trunc('week', ...) alone yields Monday, so shift +1 day
-- before truncating and -1 day after. Verified equal to weekUtils across 400 days.
--
-- gross/commission/net are the WEEK's earnings. net_total/net_paid/net_unpaid are
-- PROJECT-scoped — payments are never recorded against a week, so a per-week "remaining"
-- cannot exist. The UI labels these "owed in total".

CREATE OR REPLACE FUNCTION public.get_contract_labor_ledger_weekly(
  p_kind text,                       -- 'task_work' | 'subcontract'
  p_ref_id uuid
) RETURNS TABLE(
  week_start date,
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
    -- Shared with get_contract_labor_ledger (previous migration): one definition of
    -- the contract-matching + commission-resolution rules, so Week and Project can
    -- never drift apart on the same money.
    SELECT
      (date_trunc('week', cld.day_date::timestamp + interval '1 day')::date - 1) AS week_start,
      cld.*
    FROM public.contract_labor_days(p_kind, p_ref_id) cld
  ),
  lifetime AS (
    SELECT base.laborer_id,
           COALESCE(SUM(base.daily_earnings - base.comm), 0)::numeric AS net_total
    FROM base
    GROUP BY base.laborer_id
  ),
  paid AS (
    SELECT * FROM public.contract_laborer_paid(p_kind, p_ref_id)
  ),
  wk AS (
    SELECT
      base.week_start, base.laborer_id, base.laborer_name, base.role_name,
      COALESCE(SUM(base.work_days), 0)::numeric                  AS man_days,
      COUNT(*)::int                                              AS day_count,
      COALESCE(SUM(base.daily_earnings), 0)::numeric             AS gross,
      COALESCE(SUM(base.comm), 0)::numeric                       AS commission,
      COALESCE(SUM(base.daily_earnings - base.comm), 0)::numeric AS net,
      bool_or(base.is_mesthri_day)                               AS is_mesthri
    FROM base
    GROUP BY base.week_start, base.laborer_id, base.laborer_name, base.role_name
  )
  SELECT
    wk.week_start, wk.laborer_id, wk.laborer_name, wk.role_name, wk.man_days, wk.day_count,
    wk.gross, wk.commission, wk.net,
    COALESCE(lt.net_total, 0)::numeric                                        AS net_total,
    COALESCE(p.net_paid, 0)::numeric                                          AS net_paid,
    GREATEST(COALESCE(lt.net_total, 0) - COALESCE(p.net_paid, 0), 0)::numeric AS net_unpaid,
    wk.is_mesthri
  FROM wk
  LEFT JOIN lifetime lt ON lt.laborer_id = wk.laborer_id
  LEFT JOIN paid p      ON p.laborer_id  = wk.laborer_id
  ORDER BY wk.week_start DESC, wk.is_mesthri DESC, wk.net DESC, wk.laborer_name;
$function$;

COMMENT ON FUNCTION public.get_contract_labor_ledger_weekly(text, uuid) IS
  'Per-week per-laborer ledger for one contract, weeks Sunday-aligned (matches weekUtils + the salary waterfall). gross/commission/net are the week''s earnings; net_total/net_paid/net_unpaid are project-scoped. Read-only.';

GRANT EXECUTE ON FUNCTION public.get_contract_labor_ledger_weekly(text, uuid)
  TO authenticated, service_role;
