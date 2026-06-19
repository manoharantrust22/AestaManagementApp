-- Migration: get_mesthri_commission_summary RPC
--
-- Project/month rollup of the informal mesthri commission (estimate only --
-- see 20260619180000_laborers_commission_per_day). For each mesthri (the
-- leader of a laborer's associated team), sums the estimated commission their
-- laborers pass to them (rate x days worked in range) and adds the mesthri's
-- OWN attendance salary -> total = own_salary + commission_collected.
--
-- "how much the mesthri earns because of us -- the other laborers' commission
-- plus their own salary." Commission is attributed only when the laborer has a
-- resolvable mesthri, so daily-market workers without one are excluded.
--
-- Mirrors the other reporting RPCs: LANGUAGE sql STABLE, SECURITY INVOKER,
-- returns jsonb, GRANT EXECUTE to authenticated + service_role.

CREATE OR REPLACE FUNCTION public.get_mesthri_commission_summary(
  p_date_from date,
  p_date_to date,
  p_site_id uuid DEFAULT NULL
) RETURNS jsonb
  LANGUAGE sql STABLE
  SECURITY INVOKER
  SET search_path = public
AS $$
  WITH
  -- Laborers with a resolvable mesthri via their associated team.
  attributed AS (
    SELECT
      l.id   AS laborer_id,
      l.name AS laborer_name,
      l.commission_per_day,
      t.leader_laborer_id,
      NULLIF(trim(coalesce(t.leader_name, '')), '') AS leader_name,
      COALESCE(t.leader_laborer_id::text,
               'name:' || lower(trim(t.leader_name))) AS mesthri_key
    FROM public.laborers l
    JOIN public.teams t ON t.id = l.associated_team_id
    WHERE (t.leader_laborer_id IS NOT NULL
           OR NULLIF(trim(coalesce(t.leader_name, '')), '') IS NOT NULL)
      -- Exclude the mesthri themselves: a leader who is also a member of their
      -- own team does not pay commission to themselves.
      AND (t.leader_laborer_id IS NULL OR l.id <> t.leader_laborer_id)
  ),
  -- Days each attributed laborer worked in range (+ optional site filter).
  laborer_days AS (
    SELECT
      a.laborer_id, a.laborer_name, a.commission_per_day, a.mesthri_key,
      a.leader_laborer_id, a.leader_name,
      COALESCE(SUM(d.work_days), 0)::numeric AS days
    FROM attributed a
    LEFT JOIN public.daily_attendance d
      ON d.laborer_id = a.laborer_id
     AND d.is_deleted = false
     AND d.date >= p_date_from AND d.date <= p_date_to
     AND (p_site_id IS NULL OR d.site_id = p_site_id)
    GROUP BY a.laborer_id, a.laborer_name, a.commission_per_day,
             a.mesthri_key, a.leader_laborer_id, a.leader_name
  ),
  laborer_comm AS (
    SELECT *, (commission_per_day * days)::numeric AS commission_est
    FROM laborer_days
  ),
  -- One display row per mesthri; prefer the leader laborer's own name.
  mesthri_meta AS (
    SELECT DISTINCT ON (lc.mesthri_key)
      lc.mesthri_key,
      lc.leader_laborer_id,
      COALESCE(ml.name, lc.leader_name) AS mesthri_name
    FROM laborer_comm lc
    LEFT JOIN public.laborers ml ON ml.id = lc.leader_laborer_id
  ),
  -- The mesthri's own attendance salary in range (when a tracked laborer).
  mesthri_salary AS (
    SELECT
      mm.mesthri_key,
      COALESCE(SUM(d.daily_earnings), 0)::numeric AS own_salary,
      COALESCE(SUM(d.work_days), 0)::numeric      AS own_days
    FROM mesthri_meta mm
    LEFT JOIN public.daily_attendance d
      ON d.laborer_id = mm.leader_laborer_id
     AND d.is_deleted = false
     AND d.date >= p_date_from AND d.date <= p_date_to
     AND (p_site_id IS NULL OR d.site_id = p_site_id)
    GROUP BY mm.mesthri_key
  ),
  per_mesthri AS (
    SELECT
      mm.mesthri_key,
      mm.mesthri_name,
      mm.leader_laborer_id,
      COALESCE(ms.own_salary, 0) AS own_salary,
      COALESCE(ms.own_days, 0)   AS own_days,
      COALESCE(SUM(lc.commission_est), 0) AS commission_collected,
      jsonb_agg(jsonb_build_object(
        'laborer_id',     lc.laborer_id,
        'laborer_name',   lc.laborer_name,
        'days',           lc.days,
        'rate',           lc.commission_per_day,
        'commission_est', lc.commission_est
      ) ORDER BY lc.commission_est DESC, lc.laborer_name) AS laborers
    FROM mesthri_meta mm
    JOIN laborer_comm lc ON lc.mesthri_key = mm.mesthri_key
    LEFT JOIN mesthri_salary ms ON ms.mesthri_key = mm.mesthri_key
    GROUP BY mm.mesthri_key, mm.mesthri_name, mm.leader_laborer_id,
             ms.own_salary, ms.own_days
  )
  SELECT jsonb_build_object(
    'date_from', p_date_from,
    'date_to',   p_date_to,
    'grand_total_commission',
      COALESCE((SELECT SUM(commission_collected) FROM per_mesthri), 0),
    'mesthris', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'mesthri_key',          mesthri_key,
        'mesthri_name',         mesthri_name,
        'leader_laborer_id',    leader_laborer_id,
        'own_salary',           own_salary,
        'own_days',             own_days,
        'commission_collected', commission_collected,
        'total',                own_salary + commission_collected,
        'laborers',             laborers
      ) ORDER BY commission_collected DESC, mesthri_name)
      FROM per_mesthri
    ), '[]'::jsonb)
  );
$$;

COMMENT ON FUNCTION public.get_mesthri_commission_summary(date, date, uuid) IS
  'Per-mesthri rollup of estimated commission collected from their laborers (rate x days) plus the mesthri''s own attendance salary, over a date range and optional site. Estimate/reporting only.';

GRANT EXECUTE ON FUNCTION public.get_mesthri_commission_summary(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mesthri_commission_summary(date, date, uuid) TO service_role;
