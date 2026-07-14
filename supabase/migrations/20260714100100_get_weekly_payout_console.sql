-- Weekly Payout Console — cross-site per-laborer read model.
--
-- Returns, for a Sun–Sat week and a set of sites, one row per COMPANY laborer
-- (laborers.laborer_type='contract') with their site × bucket money breakdown:
--   * kind='company_salary'  — days on the site weekly page (one bucket per site)
--   * kind='contract'        — direct-pay task-work / subcontract days
--     (v_daily_attendance_commission crew/own-day flags; one bucket per contract)
-- plus any existing payout batches for the week (paid state / receipts).
--
-- DAY-FLAG PARTITION (no double counting, byte-parity with the weekly page):
-- every eligible attendance day lands in EXACTLY one bucket —
--   company_salary : task_work_package_id IS NULL, Civil, NOT commission crew/own day
--   contract       : commission crew/own day (keyed to its package, else subcontract)
--   (lump-mode contract days match neither: the maistry settles those, they are not a
--    per-laborer company obligation and never appear here)
--
-- PREDICATE PIN: the company branch predicate must stay identical to
-- company_week_laborer_unpaid / settle_company_week_laborer (20260714100200) and to
-- the unscoped branch of get_salary_waterfall (20260707130000).
--
-- SITE-WEEK FILL CAP: historic mesthri payments fill weeks at SITE level (the
-- waterfall's read-time oldest-first allocation) with no per-laborer attribution.
-- Per-laborer company unpaid is therefore capped by the week's unfilled remainder,
-- distributed proportionally across the week's laborers — so the console's total
-- for a week always equals what the site weekly page says is still pending.
-- Closed form of the oldest-first fill: week_paid = LEAST(week_due, GREATEST(0,
-- pool - prior_weeks_due)), pool = current-period company salary settlements
-- (lp-gated, the waterfall's settlements predicate).
--
-- Arrears: company arrears are per-week capped remainders summed over weeks
-- < p_week_start. Contract arrears decompose the all-time link-sum ledger:
-- total_unpaid clamps to net(<= week_end) - paid(all-time); this-week share =
-- LEAST(total_unpaid, net of the week). Legacy band (auditing, before
-- data_started_at) is sealed and excluded entirely.

CREATE OR REPLACE FUNCTION public.get_weekly_payout_console(
  p_site_ids uuid[],
  p_week_start date,
  p_week_end date
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_caller_id   uuid;
  v_caller_role user_role;
  v_site        uuid;
  v_result      jsonb;
BEGIN
  IF p_site_ids IS NULL OR array_length(p_site_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'get_weekly_payout_console: p_site_ids is required' USING ERRCODE = '22023';
  END IF;
  IF p_week_start IS NULL OR p_week_end IS NULL OR p_week_end < p_week_start THEN
    RAISE EXCEPTION 'get_weekly_payout_console: invalid week range' USING ERRCODE = '22023';
  END IF;

  SELECT u.id, u.role INTO v_caller_id, v_caller_role
  FROM users u WHERE u.auth_id = auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized: no application user for the current session' USING ERRCODE = '42501';
  END IF;
  IF v_caller_role NOT IN ('admin', 'office') THEN
    FOREACH v_site IN ARRAY p_site_ids LOOP
      IF NOT public.can_access_site(v_site) THEN
        RAISE EXCEPTION 'Not authorized for one or more selected sites' USING ERRCODE = '42501';
      END IF;
    END LOOP;
  END IF;

  WITH
  -- ---------------------------------------------------------------- company
  company_days AS (
    SELECT
      d.laborer_id,
      d.site_id,
      (d.date - extract(dow FROM d.date)::int)::date AS w_start,
      d.work_days,
      d.daily_earnings,
      (d.is_paid = false
        AND NOT EXISTS (
          SELECT 1 FROM settlement_groups g
          WHERE g.id = d.settlement_group_id
            AND g.is_cancelled = false
            AND g.is_archived = false
            AND g.transferred_out_at IS NULL)) AS unconsumed
    FROM daily_attendance d
    JOIN laborers l ON l.id = d.laborer_id
    JOIN v_daily_attendance_commission vc ON vc.attendance_id = d.id
    JOIN sites s ON s.id = d.site_id
    WHERE d.site_id = ANY (p_site_ids)
      AND d.date <= p_week_end
      AND d.is_deleted = false
      AND d.is_archived = false
      AND l.laborer_type = 'contract'
      -- unscoped company-week branch (20260707130000)
      AND d.task_work_package_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM subcontracts sc
        JOIN labor_categories lc ON lc.id = sc.trade_category_id
        WHERE sc.id = d.subcontract_id AND lc.name <> 'Civil')
      AND NOT vc.is_commission_crew_day
      AND NOT vc.is_commission_mesthri_own_day
      -- legacy band sealed while auditing
      AND NOT (s.legacy_status = 'auditing'
               AND s.data_started_at IS NOT NULL
               AND (d.date - extract(dow FROM d.date)::int)::date < s.data_started_at)
  ),
  company_weeks AS (
    SELECT
      laborer_id, site_id, w_start,
      COALESCE(SUM(daily_earnings) FILTER (WHERE unconsumed), 0)::numeric AS due_unconsumed,
      COALESCE(SUM(daily_earnings), 0)::numeric                            AS gross_all,
      COALESCE(SUM(work_days), 0)::numeric                                 AS days_all
    FROM company_days
    GROUP BY 1, 2, 3
  ),
  pwa_weeks AS (
    SELECT
      pwa.laborer_id, pwa.site_id, pwa.week_start AS w_start,
      COALESCE(SUM(pwa.allocated_amount), 0)::numeric AS paid
    FROM payment_week_allocations pwa
    JOIN labor_payments lp
      ON lp.id = pwa.labor_payment_id AND lp.is_archived = false
    JOIN settlement_groups g
      ON g.id = lp.settlement_group_id
     AND g.is_cancelled = false
     AND g.is_archived = false
     AND g.transferred_out_at IS NULL
    WHERE pwa.site_id = ANY (p_site_ids)
      AND pwa.week_start <= p_week_start
      AND pwa.is_archived = false
    GROUP BY 1, 2, 3
  ),
  -- site-level week fill (waterfall closed form) — see header
  site_week_due AS (
    SELECT site_id, w_start, SUM(daily_earnings)::numeric AS due
    FROM company_days
    GROUP BY 1, 2
  ),
  site_pool AS (
    SELECT
      sg.site_id,
      COALESCE(SUM(sg.total_amount), 0)::numeric AS pool
    FROM settlement_groups sg
    JOIN sites s ON s.id = sg.site_id
    WHERE sg.site_id = ANY (p_site_ids)
      AND sg.is_cancelled = false
      AND sg.is_archived = false
      AND sg.transferred_out_at IS NULL
      AND sg.settlement_date IS NOT NULL
      AND sg.payment_type = 'salary'
      AND (NOT (s.legacy_status = 'auditing' AND s.data_started_at IS NOT NULL)
           OR sg.settlement_date >= s.data_started_at)
      AND NOT EXISTS (
        SELECT 1 FROM subcontracts sc
        JOIN labor_categories lc ON lc.id = sc.trade_category_id
        WHERE sc.id = sg.subcontract_id AND lc.name <> 'Civil')
      AND EXISTS (
        SELECT 1 FROM labor_payments lp
        WHERE lp.settlement_group_id = sg.id
          AND lp.is_under_contract = true
          AND lp.is_archived = false)
    GROUP BY 1
  ),
  site_week_fill AS (
    SELECT
      swd.site_id,
      swd.w_start,
      GREATEST(0, swd.due - LEAST(swd.due, GREATEST(0,
        COALESCE(sp.pool, 0)
        - (SUM(swd.due) OVER (PARTITION BY swd.site_id ORDER BY swd.w_start) - swd.due)
      ))) AS remaining
    FROM site_week_due swd
    LEFT JOIN site_pool sp ON sp.site_id = swd.site_id
  ),
  company_week_state AS (
    SELECT
      cw.laborer_id, cw.site_id, cw.w_start,
      cw.days_all, cw.gross_all,
      GREATEST(0, cw.due_unconsumed - COALESCE(pw.paid, 0)) AS unpaid_raw,
      COALESCE(pw.paid, 0)                                  AS paid
    FROM company_weeks cw
    LEFT JOIN pwa_weeks pw
      ON pw.laborer_id = cw.laborer_id AND pw.site_id = cw.site_id AND pw.w_start = cw.w_start
  ),
  week_unpaid_sums AS (
    SELECT site_id, w_start, SUM(unpaid_raw) AS sum_unpaid
    FROM company_week_state
    GROUP BY 1, 2
  ),
  company_week_capped AS (
    SELECT
      cws.laborer_id, cws.site_id, cws.w_start, cws.days_all, cws.gross_all, cws.paid,
      CASE
        WHEN cws.unpaid_raw <= 0 THEN 0
        WHEN swf.remaining <= 0 THEN 0
        WHEN wus.sum_unpaid <= swf.remaining THEN cws.unpaid_raw
        ELSE ROUND(cws.unpaid_raw * swf.remaining / wus.sum_unpaid, 2)
      END AS unpaid
    FROM company_week_state cws
    JOIN week_unpaid_sums wus
      ON wus.site_id = cws.site_id AND wus.w_start = cws.w_start
    JOIN site_week_fill swf
      ON swf.site_id = cws.site_id AND swf.w_start = cws.w_start
  ),
  company_buckets AS (
    SELECT
      laborer_id, site_id,
      COALESCE(SUM(days_all)  FILTER (WHERE w_start = p_week_start), 0) AS days_week,
      COALESCE(SUM(gross_all) FILTER (WHERE w_start = p_week_start), 0) AS gross_week,
      COALESCE(SUM(unpaid)    FILTER (WHERE w_start = p_week_start), 0) AS this_week_unpaid,
      COALESCE(SUM(unpaid)    FILTER (WHERE w_start < p_week_start), 0) AS earlier_unpaid,
      COALESCE(SUM(paid)      FILTER (WHERE w_start = p_week_start), 0) AS paid_week
    FROM company_week_capped
    GROUP BY 1, 2
  ),
  -- ---------------------------------------------------------------- contracts
  contract_days AS (
    SELECT
      d.laborer_id,
      d.site_id,
      CASE WHEN d.task_work_package_id IS NOT NULL THEN 'task_work' ELSE 'subcontract' END AS ref_kind,
      COALESCE(d.task_work_package_id, d.subcontract_id) AS ref_id,
      (d.date >= p_week_start) AS in_week,
      d.work_days,
      d.daily_earnings,
      COALESCE(d.mesthri_commission_amount, vc.commission_amount, 0)::numeric AS commission
    FROM daily_attendance d
    JOIN laborers l ON l.id = d.laborer_id
    JOIN v_daily_attendance_commission vc ON vc.attendance_id = d.id
    WHERE d.site_id = ANY (p_site_ids)
      AND d.date <= p_week_end
      AND d.is_deleted = false
      AND d.is_archived = false
      AND l.laborer_type = 'contract'
      AND (vc.is_commission_crew_day OR vc.is_commission_mesthri_own_day)
      AND COALESCE(d.task_work_package_id, d.subcontract_id) IS NOT NULL
  ),
  contract_sums AS (
    SELECT
      laborer_id, site_id, ref_kind, ref_id,
      COALESCE(SUM(work_days)                    FILTER (WHERE in_week), 0)::numeric AS days_week,
      COALESCE(SUM(daily_earnings)               FILTER (WHERE in_week), 0)::numeric AS gross_week,
      COALESCE(SUM(commission)                   FILTER (WHERE in_week), 0)::numeric AS commission_week,
      COALESCE(SUM(daily_earnings - commission)  FILTER (WHERE in_week), 0)::numeric AS net_week,
      COALESCE(SUM(daily_earnings - commission), 0)::numeric                          AS net_upto
    FROM contract_days
    GROUP BY 1, 2, 3, 4
  ),
  contract_paid AS (
    -- same predicate as record_contract_laborer_payment / get_contract_labor_ledger
    SELECT
      sg.contract_ref_kind AS ref_kind,
      sg.contract_ref_id   AS ref_id,
      sg.contract_laborer_id AS laborer_id,
      COALESCE(SUM(sg.total_amount), 0)::numeric AS paid
    FROM settlement_groups sg
    WHERE sg.contract_ref_kind IS NOT NULL
      AND sg.is_cancelled = false
      AND sg.is_archived = false
    GROUP BY 1, 2, 3
  ),
  contract_buckets AS (
    SELECT
      cs.laborer_id, cs.site_id, cs.ref_kind, cs.ref_id,
      cs.days_week, cs.gross_week, cs.commission_week, cs.net_week,
      COALESCE(cp.paid, 0) AS paid_total,
      GREATEST(0, cs.net_upto - COALESCE(cp.paid, 0)) AS total_unpaid
    FROM contract_sums cs
    LEFT JOIN contract_paid cp
      ON cp.ref_kind = cs.ref_kind AND cp.ref_id = cs.ref_id AND cp.laborer_id = cs.laborer_id
  ),
  contract_meta AS (
    SELECT 'task_work'::text AS ref_kind, twp.id AS ref_id, twp.title,
           lc.name AS trade, COALESCE(twp.mesthri_commission_applies, true) AS commission_applies
    FROM task_work_packages twp
    LEFT JOIN labor_categories lc ON lc.id = twp.labor_category_id
    UNION ALL
    SELECT 'subcontract', sc.id, sc.title,
           lc.name, COALESCE(sc.mesthri_commission_applies, true)
    FROM subcontracts sc
    LEFT JOIN labor_categories lc ON lc.id = sc.trade_category_id
  ),
  -- ---------------------------------------------------------------- union
  bucket_rows AS (
    SELECT
      cb.laborer_id,
      jsonb_build_object(
        'site_id', cb.site_id,
        'site_name', s.name,
        'kind', 'company_salary',
        'ref_kind', NULL,
        'ref_id', NULL,
        'title', 'Company salary',
        'trade', NULL,
        'commission_applies', NULL,
        'days_week', cb.days_week,
        'gross_week', cb.gross_week,
        'commission_week', 0,
        'net_week', cb.gross_week,
        'this_week_unpaid', cb.this_week_unpaid,
        'earlier_unpaid', cb.earlier_unpaid,
        'total_unpaid', cb.this_week_unpaid + cb.earlier_unpaid,
        'paid_total', cb.paid_week
      ) AS bucket,
      (cb.this_week_unpaid + cb.earlier_unpaid) AS total_unpaid,
      cb.days_week
    FROM company_buckets cb
    JOIN sites s ON s.id = cb.site_id
    WHERE cb.days_week > 0 OR (cb.this_week_unpaid + cb.earlier_unpaid) > 0.005
    UNION ALL
    SELECT
      cb.laborer_id,
      jsonb_build_object(
        'site_id', cb.site_id,
        'site_name', s.name,
        'kind', 'contract',
        'ref_kind', cb.ref_kind,
        'ref_id', cb.ref_id,
        'title', COALESCE(cm.title, 'Contract'),
        'trade', cm.trade,
        'commission_applies', cm.commission_applies,
        'days_week', cb.days_week,
        'gross_week', cb.gross_week,
        'commission_week', cb.commission_week,
        'net_week', cb.net_week,
        'this_week_unpaid', LEAST(cb.total_unpaid, GREATEST(cb.net_week, 0)),
        'earlier_unpaid', cb.total_unpaid - LEAST(cb.total_unpaid, GREATEST(cb.net_week, 0)),
        'total_unpaid', cb.total_unpaid,
        'paid_total', cb.paid_total
      ) AS bucket,
      cb.total_unpaid,
      cb.days_week
    FROM contract_buckets cb
    JOIN sites s ON s.id = cb.site_id
    LEFT JOIN contract_meta cm ON cm.ref_kind = cb.ref_kind AND cm.ref_id = cb.ref_id
    WHERE cb.days_week > 0 OR cb.total_unpaid > 0.005
  ),
  batches AS (
    SELECT
      b.laborer_id,
      jsonb_agg(jsonb_build_object(
        'id', b.id,
        'payment_date', b.payment_date,
        'total_amount', b.total_amount,
        'payment_mode', b.payment_mode,
        'notes', b.notes,
        'created_by_name', b.created_by_name,
        'created_at', b.created_at,
        'buckets_result', b.buckets_result
      ) ORDER BY b.created_at) AS batches
    FROM laborer_payout_batches b
    WHERE b.week_start = p_week_start
      AND b.is_reversed = false
    GROUP BY b.laborer_id
  ),
  laborer_rollup AS (
    SELECT
      br.laborer_id,
      jsonb_agg(br.bucket ORDER BY br.bucket ->> 'site_name', br.bucket ->> 'kind', br.bucket ->> 'title') AS buckets,
      SUM(br.total_unpaid) AS total_unpaid,
      SUM(br.days_week)    AS days_week
    FROM bucket_rows br
    GROUP BY br.laborer_id
  )
  SELECT jsonb_build_object(
    'week_start', p_week_start,
    'week_end', p_week_end,
    'laborers', COALESCE(jsonb_agg(
      jsonb_build_object(
        'laborer_id', l.id,
        'name', l.name,
        'role', lr.name,
        'photo_url', l.photo_url,
        'advance_outstanding', GREATEST(0, COALESCE(l.total_advance_given, 0) - COALESCE(l.total_advance_deducted, 0)),
        'total_unpaid', COALESCE(r.total_unpaid, 0),
        'days_week', COALESCE(r.days_week, 0),
        'buckets', COALESCE(r.buckets, '[]'::jsonb),
        'batches', COALESCE(bt.batches, '[]'::jsonb)
      ) ORDER BY l.name
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM laborers l
  LEFT JOIN labor_roles lr ON lr.id = l.role_id
  LEFT JOIN laborer_rollup r ON r.laborer_id = l.id
  LEFT JOIN batches bt ON bt.laborer_id = l.id
  WHERE r.laborer_id IS NOT NULL OR bt.laborer_id IS NOT NULL;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_weekly_payout_console(uuid[], date, date)
  TO authenticated, service_role;
