-- Migration: get_laborer_work_history RPC
--
-- Powers the "Work history" section of the LaborerProfileDrawer. Laborers
-- cycle active -> inactive -> active as they come and go; there is no status
-- history table, so we reconstruct work spans ("stints") from gaps in
-- daily_attendance: a new stint starts after a gap of more than STINT_GAP_DAYS
-- (30) with no attendance.
--
-- Returns lifetime (or range-scoped) totals + per-site rollup + per-stint
-- breakdown, plus an estimated mesthri commission (rate x days, gated on a
-- resolvable mesthri -- see 20260619180000_laborers_commission_per_day).
--
-- Mirrors get_laborer_profile_summary: LANGUAGE sql STABLE, SECURITY INVOKER,
-- returns jsonb, GRANT EXECUTE to authenticated + service_role. paid_total /
-- outstanding are 0 for contract laborers by design (they settle via the
-- mesthri's subcontract, not their own attendance.is_paid).

CREATE OR REPLACE FUNCTION public.get_laborer_work_history(
  p_laborer_id uuid,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
) RETURNS jsonb
  LANGUAGE sql STABLE
  SECURITY INVOKER
  SET search_path = public
AS $$
  WITH
  laborer AS (
    SELECT
      l.id,
      l.laborer_type,
      l.commission_per_day,
      l.associated_team_id,
      t.leader_laborer_id,
      NULLIF(trim(coalesce(t.leader_name, '')), '') AS leader_name,
      -- A laborer who leads their own associated team has no mesthri above them
      -- (they don't pay commission to themselves).
      ((t.leader_laborer_id IS NOT NULL AND t.leader_laborer_id <> l.id)
        OR (t.leader_laborer_id IS NULL
            AND NULLIF(trim(coalesce(t.leader_name, '')), '') IS NOT NULL)) AS has_mesthri
    FROM public.laborers l
    LEFT JOIN public.teams t ON t.id = l.associated_team_id
    WHERE l.id = p_laborer_id
  ),
  l_one AS (SELECT * FROM laborer LIMIT 1),
  -- Effective commission rate: 0 unless the laborer has a resolvable mesthri.
  rate AS (
    SELECT CASE WHEN (SELECT has_mesthri FROM l_one)
                THEN COALESCE((SELECT commission_per_day FROM l_one), 0)
                ELSE 0 END AS per_day
  ),
  scoped AS (
    SELECT d.date, d.work_days, d.daily_earnings, d.is_paid, d.site_id
    FROM public.daily_attendance d
    WHERE d.laborer_id = p_laborer_id
      AND d.is_deleted = false
      AND (p_date_from IS NULL OR d.date >= p_date_from)
      AND (p_date_to   IS NULL OR d.date <= p_date_to)
  ),
  totals AS (
    SELECT
      COALESCE(SUM(work_days), 0)::numeric    AS days_worked,
      COALESCE(SUM(daily_earnings), 0)::numeric AS earnings_total,
      COALESCE(SUM(daily_earnings) FILTER (WHERE is_paid = true), 0)::numeric
                                              AS paid_via_attendance,
      MIN(date) AS first_day,
      MAX(date) AS last_day
    FROM scoped
  ),
  by_site AS (
    SELECT
      s.site_id,
      st.name AS site_name,
      COALESCE(SUM(s.work_days), 0)::numeric     AS days,
      COALESCE(SUM(s.daily_earnings), 0)::numeric AS earnings
    FROM scoped s
    JOIN public.sites st ON st.id = s.site_id
    GROUP BY s.site_id, st.name
    ORDER BY days DESC, st.name
  ),
  -- One row per date (a laborer can have rows at multiple sites on a day).
  per_date AS (
    SELECT date,
           SUM(work_days)::numeric     AS work_days,
           SUM(daily_earnings)::numeric AS earned
    FROM scoped
    GROUP BY date
  ),
  flagged AS (
    SELECT date, work_days, earned,
      CASE WHEN date - LAG(date) OVER (ORDER BY date) > 30 THEN 1 ELSE 0 END AS new_stint
    FROM per_date
  ),
  grouped AS (
    SELECT date, work_days, earned,
      SUM(new_stint) OVER (ORDER BY date) AS stint_no
    FROM flagged
  ),
  stints AS (
    SELECT
      stint_no,
      MIN(date) AS start_date,
      MAX(date) AS end_date,
      SUM(work_days)::numeric AS days,
      SUM(earned)::numeric    AS earned
    FROM grouped
    GROUP BY stint_no
    ORDER BY start_date
  )
  SELECT jsonb_build_object(
    'laborer_type',   (SELECT laborer_type FROM l_one),
    'has_mesthri',    COALESCE((SELECT has_mesthri FROM l_one), false),
    'mesthri_name',
      CASE WHEN (SELECT has_mesthri FROM l_one)
           THEN COALESCE(
                  (SELECT name FROM public.laborers
                    WHERE id = (SELECT leader_laborer_id FROM l_one)),
                  (SELECT leader_name FROM l_one))
           ELSE NULL END,
    'commission_per_day', (SELECT per_day FROM rate),
    'days_worked',    t.days_worked,
    'earnings_total', t.earnings_total,
    'paid_total',
      CASE WHEN (SELECT laborer_type FROM l_one) = 'contract' THEN 0
           ELSE t.paid_via_attendance END,
    'outstanding',
      CASE WHEN (SELECT laborer_type FROM l_one) = 'contract' THEN 0
           ELSE GREATEST(0, t.earnings_total - t.paid_via_attendance) END,
    'commission_est', ((SELECT per_day FROM rate) * t.days_worked)::numeric,
    'first_day',      t.first_day,
    'last_day',       t.last_day,
    'stint_count',    (SELECT COUNT(*) FROM stints),
    'sites', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'site_id', site_id, 'site_name', site_name,
        'days', days, 'earnings', earnings)) FROM by_site),
      '[]'::jsonb),
    'stints', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'start_date', start_date,
        'end_date',   end_date,
        'days',       days,
        'earned',     earned,
        'commission_est', ((SELECT per_day FROM rate) * days)::numeric
      ) ORDER BY start_date DESC) FROM stints),
      '[]'::jsonb)
  )
  FROM totals t;
$$;

COMMENT ON FUNCTION public.get_laborer_work_history(uuid, date, date) IS
  'Lifetime/range work history for the LaborerProfileDrawer: totals (days_worked, earnings_total, paid_total, outstanding), per-site rollup, and work stints inferred from >30-day gaps in daily_attendance, plus an estimated mesthri commission (rate x days, gated on a resolvable mesthri).';

GRANT EXECUTE ON FUNCTION public.get_laborer_work_history(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_laborer_work_history(uuid, date, date) TO service_role;
