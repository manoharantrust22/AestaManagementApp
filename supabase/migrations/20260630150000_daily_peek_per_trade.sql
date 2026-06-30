-- Make get_company_daily_peek "all-trade aware".
--
-- Before: the `dws` CTE pulled EVERY daily_work_summary row for the date (Civil +
-- per-trade) with no subcontract_id filter, then `LEFT JOIN dws ON site_id`. On a
-- site with more than one scope that row-MULTIPLIED the site (one array entry per
-- scope) and/or surfaced an arbitrary scope's photos. It only looked correct because
-- most sites have a single site-wide row. This rewrite:
--   1. splits `dws` into `dws_civil` (subcontract_id IS NULL) for the existing
--      top-level Civil fields + recorder lookup — so there is exactly ONE row per
--      site again (the multiplication bug is gone), and
--   2. adds per-site aggregation across ALL scopes so a site counts as
--      recorded / in_progress and shows photos when ANY scope (Civil or a trade)
--      logged today, plus
--   3. returns a new `trades` array: one entry per scope (Civil first) with its
--      label, status and photos, for the per-trade breakdown in the modal.
--
-- Same signature as 20260524110000_daily_peek_spot_purchases.sql (the latest prod
-- version); only the work-summary handling changes. Pre-migration callers that
-- don't read `trades` are unaffected; new callers default an absent key to [].

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
  -- Site-wide (Civil) row only — feeds the existing top-level fields + recorder.
  -- The partial unique index uq_dws_sitewide guarantees <= 1 row per (site, date).
  dws_civil AS (
    SELECT
      d.site_id,
      d.work_description,
      d.comments,
      d.work_updates,
      d.entered_by_user_id
    FROM public.daily_work_summary d
    WHERE d.date = p_date
      AND d.subcontract_id IS NULL
      AND d.site_id IN (SELECT id FROM active_sites)
  ),
  -- Every scope for the date (Civil NULL + each trade contract) — drives the
  -- cross-scope aggregation and the per-trade breakdown array.
  dws_all AS (
    SELECT d.site_id, d.subcontract_id, d.work_updates
    FROM public.daily_work_summary d
    WHERE d.date = p_date
      AND d.site_id IN (SELECT id FROM active_sites)
  ),
  -- Per-site OR across all scopes: any morning / any evening / any row logged.
  dws_scope_agg AS (
    SELECT
      site_id,
      bool_or(jsonb_typeof(work_updates->'morning') = 'object') AS any_morning,
      bool_or(jsonb_typeof(work_updates->'evening') = 'object') AS any_evening,
      bool_or(true) AS any_logged
    FROM dws_all
    GROUP BY site_id
  ),
  -- Union every scope's photos for the card strip (morning then evening). Guarded
  -- with jsonb_typeof so a malformed (non-array) photos value can't error the RPC.
  dws_photos AS (
    SELECT d.site_id, 'morning' AS phase, elem
    FROM dws_all d
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(d.work_updates->'morning'->'photos') = 'array'
           THEN d.work_updates->'morning'->'photos' ELSE '[]'::jsonb END
    ) AS elem
    UNION ALL
    SELECT d.site_id, 'evening' AS phase, elem
    FROM dws_all d
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(d.work_updates->'evening'->'photos') = 'array'
           THEN d.work_updates->'evening'->'photos' ELSE '[]'::jsonb END
    ) AS elem
  ),
  dws_photo_agg AS (
    SELECT
      site_id,
      COALESCE(jsonb_agg(elem) FILTER (WHERE phase = 'morning'), '[]'::jsonb) AS morning_photos,
      COALESCE(jsonb_agg(elem) FILTER (WHERE phase = 'evening'), '[]'::jsonb) AS evening_photos
    FROM dws_photos
    GROUP BY site_id
  ),
  -- Per-scope breakdown array (Civil first), labelled by trade category / title.
  dws_trades AS (
    SELECT
      d.site_id,
      jsonb_agg(
        jsonb_build_object(
          'subcontract_id', d.subcontract_id,
          'scope_label', CASE
            WHEN d.subcontract_id IS NULL THEN 'Civil'
            ELSE COALESCE(NULLIF(lc.name, ''), NULLIF(sc.title, ''), 'Trade')
          END,
          'status', CASE
            WHEN jsonb_typeof(d.work_updates->'evening') = 'object' THEN 'recorded'
            ELSE 'in_progress'
          END,
          'morning_photos', COALESCE(d.work_updates->'morning'->'photos', '[]'::jsonb),
          'evening_photos', COALESCE(d.work_updates->'evening'->'photos', '[]'::jsonb)
        )
        ORDER BY (d.subcontract_id IS NOT NULL), sc.title NULLS FIRST
      ) AS trades
    FROM dws_all d
    LEFT JOIN public.subcontracts sc ON sc.id = d.subcontract_id
    LEFT JOIN public.labor_categories lc ON lc.id = sc.trade_category_id
    GROUP BY d.site_id
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
      SELECT entered_by_user_id FROM dws_civil WHERE entered_by_user_id IS NOT NULL
    )
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'site_id', a.id,
      'site_name', a.name,
      'site_city', a.city,
      'site_status', a.status,
      'engineer_phone', a.engineer_phone,
      'morning_plan_text', COALESCE(dws_civil.work_updates->'morning'->>'description', dws_civil.work_description),
      'evening_summary_text', COALESCE(dws_civil.work_updates->'evening'->>'summary', dws_civil.comments),
      -- Card strip = union of every scope's photos (so a trade-only day still shows photos).
      'morning_photos', COALESCE(dpa.morning_photos, '[]'::jsonb),
      'evening_photos', COALESCE(dpa.evening_photos, '[]'::jsonb),
      -- Badge matches recorded_status: any scope's morning/evening counts.
      'has_morning', COALESCE(dsa.any_morning, false),
      'has_evening', COALESCE(dsa.any_evening, false),
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
      'spot_purchase_count_today', COALESCE(spot_agg.spot_count, 0),
      'spot_purchase_total_today', COALESCE(spot_agg.spot_total, 0),
      -- Per-trade breakdown (Civil first). Absent on pre-migration callers → [].
      'trades', COALESCE(dt.trades, '[]'::jsonb),
      'recorded_status',
        CASE
          WHEN da_agg.site_id IS NULL AND COALESCE(dsa.any_logged, false) = false THEN 'waiting'
          WHEN da_agg.last_confirmed_at IS NOT NULL OR COALESCE(dsa.any_evening, false) THEN 'recorded'
          ELSE 'in_progress'
        END
    )
    ORDER BY a.name
  )
  INTO v_result
  FROM active_sites a
  LEFT JOIN dws_civil ON dws_civil.site_id = a.id
  LEFT JOIN dws_scope_agg dsa ON dsa.site_id = a.id
  LEFT JOIN dws_photo_agg dpa ON dpa.site_id = a.id
  LEFT JOIN dws_trades dt ON dt.site_id = a.id
  LEFT JOIN da_agg ON da_agg.site_id = a.id
  LEFT JOIN contract_agg ON contract_agg.site_id = a.id
  LEFT JOIN spot_agg ON spot_agg.site_id = a.id
  LEFT JOIN recorder_lookup rec ON rec.id = COALESCE(da_agg.recorded_by_user_id, dws_civil.entered_by_user_id);

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_company_daily_peek(UUID, DATE) TO authenticated;
