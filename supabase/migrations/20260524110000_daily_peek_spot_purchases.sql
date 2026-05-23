-- Task M-4: extend get_company_daily_peek with two per-site spot-purchase fields:
--   * spot_purchase_count_today — int, count of material_purchase_expenses rows
--     with purchase_type='spot' AND purchase_date = p_date for the site
--   * spot_purchase_total_today — numeric, sum of total_amount for the same rows
--
-- We re-declare CREATE OR REPLACE FUNCTION with the SAME signature as the
-- definition in 20260512160000_pending_exclude_today_and_contract_count.sql
-- (the latest production version). Function body is identical except for:
--   * a new spot_agg CTE that aggregates material_purchase_expenses per site
--   * two new keys in the jsonb_build_object output
--   * the LEFT JOIN to spot_agg
--
-- Spot purchases are scoped per-site via material_purchase_expenses.site_id,
-- so the values surface inside each site card. The dashboard renders an
-- additional company-wide rollup row by summing across the returned array.

CREATE OR REPLACE FUNCTION public.get_company_daily_peek(
  p_company_id UUID,
  p_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH active_sites AS (
    SELECT s.id, s.name, s.status::text AS status, s.engineer_phone, s.city
    FROM public.sites s
    WHERE s.company_id = p_company_id
      AND s.status = 'active'
  ),
  dws AS (
    SELECT
      d.site_id,
      d.work_description,
      d.comments,
      d.work_updates,
      d.entered_by_user_id
    FROM public.daily_work_summary d
    WHERE d.date = p_date
      AND d.site_id IN (SELECT id FROM active_sites)
  ),
  da_agg AS (
    SELECT
      da.site_id,
      COUNT(*) FILTER (WHERE da.subcontract_id IS NULL AND da.is_archived = false) AS daily_count,
      COALESCE(SUM(da.daily_earnings) FILTER (WHERE da.subcontract_id IS NULL AND da.is_archived = false), 0) AS daily_total,
      COUNT(DISTINCT da.laborer_id) FILTER (WHERE da.subcontract_id IS NOT NULL AND da.is_archived = false) AS contract_from_da,
      MIN(da.morning_entry_at) AS first_morning_at,
      MAX(da.confirmed_at) AS last_confirmed_at,
      (ARRAY_AGG(da.recorded_by_user_id ORDER BY da.morning_entry_at DESC NULLS LAST)
        FILTER (WHERE da.recorded_by_user_id IS NOT NULL))[1] AS recorded_by_user_id
    FROM public.daily_attendance da
    WHERE da.date = p_date
      AND da.site_id IN (SELECT id FROM active_sites)
      AND da.is_deleted = false
    GROUP BY da.site_id
  ),
  contract_agg AS (
    SELECT
      sc.site_id,
      COUNT(DISTINCT sme.subcontract_id) AS contract_crews,
      COALESCE(SUM(COALESCE(array_length(sme.laborer_ids, 1), 0)), 0)::int AS contract_from_mid,
      COALESCE(SUM(sme.day_total_amount), 0) AS contract_total
    FROM public.subcontract_mid_entries sme
    JOIN public.subcontracts sc ON sc.id = sme.subcontract_id
    WHERE sme.attendance_date = p_date
      AND sc.site_id IN (SELECT id FROM active_sites)
    GROUP BY sc.site_id
  ),
  -- Task M-4: spot-purchase per-site rollup for today's purchase_date.
  spot_agg AS (
    SELECT
      mpe.site_id,
      COUNT(*)::int AS spot_count,
      COALESCE(SUM(mpe.total_amount), 0)::numeric AS spot_total
    FROM public.material_purchase_expenses mpe
    WHERE mpe.purchase_date = p_date
      AND mpe.purchase_type = 'spot'
      AND mpe.site_id IN (SELECT id FROM active_sites)
    GROUP BY mpe.site_id
  ),
  recorder_lookup AS (
    SELECT u.id, u.name, u.display_name, u.phone
    FROM public.users u
    WHERE u.id IN (
      SELECT recorded_by_user_id FROM da_agg WHERE recorded_by_user_id IS NOT NULL
      UNION
      SELECT entered_by_user_id FROM dws WHERE entered_by_user_id IS NOT NULL
    )
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'site_id', a.id,
      'site_name', a.name,
      'site_city', a.city,
      'site_status', a.status,
      'engineer_phone', a.engineer_phone,
      'morning_plan_text', COALESCE(dws.work_updates->'morning'->>'description', dws.work_description),
      'evening_summary_text', COALESCE(dws.work_updates->'evening'->>'summary', dws.comments),
      'morning_photos', COALESCE(dws.work_updates->'morning'->'photos', '[]'::jsonb),
      'evening_photos', COALESCE(dws.work_updates->'evening'->'photos', '[]'::jsonb),
      'has_morning', COALESCE(jsonb_typeof(dws.work_updates->'morning') = 'object', false),
      'has_evening', COALESCE(jsonb_typeof(dws.work_updates->'evening') = 'object', false),
      'recorded_at', COALESCE(da_agg.last_confirmed_at, da_agg.first_morning_at),
      'morning_at', da_agg.first_morning_at,
      'evening_at', da_agg.last_confirmed_at,
      'recorded_by_name', rec.display_name,
      'recorded_by_phone', rec.phone,
      'daily_count', COALESCE(da_agg.daily_count, 0),
      'daily_total', COALESCE(da_agg.daily_total, 0),
      'contract_count', GREATEST(
        COALESCE(da_agg.contract_from_da, 0),
        COALESCE(contract_agg.contract_from_mid, 0)
      ),
      'contract_crews', COALESCE(contract_agg.contract_crews, 0),
      'contract_total', COALESCE(contract_agg.contract_total, 0),
      -- Task M-4: new spot-purchase fields.
      'spot_purchase_count_today', COALESCE(spot_agg.spot_count, 0),
      'spot_purchase_total_today', COALESCE(spot_agg.spot_total, 0),
      'recorded_status',
        CASE
          WHEN da_agg.site_id IS NULL AND dws.site_id IS NULL THEN 'waiting'
          WHEN da_agg.last_confirmed_at IS NOT NULL OR jsonb_typeof(dws.work_updates->'evening') = 'object' THEN 'recorded'
          ELSE 'in_progress'
        END
    )
    ORDER BY a.name
  )
  INTO v_result
  FROM active_sites a
  LEFT JOIN dws ON dws.site_id = a.id
  LEFT JOIN da_agg ON da_agg.site_id = a.id
  LEFT JOIN contract_agg ON contract_agg.site_id = a.id
  LEFT JOIN spot_agg ON spot_agg.site_id = a.id
  LEFT JOIN recorder_lookup rec ON rec.id = COALESCE(da_agg.recorded_by_user_id, dws.entered_by_user_id);

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_company_daily_peek(UUID, DATE) TO authenticated;
