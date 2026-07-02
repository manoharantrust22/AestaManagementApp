-- Exclude task-work-package attendance from the daily SALARY SETTLEMENT / pending.
--
-- Task-work / contract laborers are paid through their contract/package on the
-- contract page, NOT the per-day salary settlement. The pending/paid logic
-- already excludes laborer_type='contract', but it did NOT exclude daily_market
-- laborers tagged to a fixed-price task-work package (e.g. the "Chinnaiya Team"
-- lump-sum crew) — so those days wrongly appeared as per-day settleable and
-- could double-pay against the package's fixed price.
--
-- Rule: a daily_attendance row leaves the salary waterfall when
-- task_work_package_id IS NOT NULL (in addition to laborer_type='contract').
--
-- OVERVIEW figures stay all-inclusive (the user wants to visualise every laborer
-- and the full daily spend): total_salary / total_expense / total_laborers /
-- avg_per_day / daily_amount / contract_amount are UNCHANGED. Only the four
-- pending/paid daily-attendance fields (get_attendance_summary) and the
-- pending_da CTE (get_payments_ledger) gain the task-work exclusion. The tea
-- split denominator is untouched.

-- ── get_attendance_summary ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_attendance_summary(p_site_id uuid, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH
  da AS (
    SELECT
      d.date,
      d.daily_earnings,
      d.is_paid,
      d.task_work_package_id,
      l.laborer_type
    FROM public.daily_attendance d
    JOIN public.laborers l ON l.id = d.laborer_id
    WHERE d.site_id = p_site_id
      AND (p_date_from IS NULL OR d.date >= p_date_from)
      AND (p_date_to   IS NULL OR d.date <= p_date_to)
  ),
  ma AS (
    SELECT
      m.date,
      m.count,
      m.total_cost,
      m.is_paid
    FROM public.market_laborer_attendance m
    WHERE m.site_id = p_site_id
      AND (p_date_from IS NULL OR m.date >= p_date_from)
      AND (p_date_to   IS NULL OR m.date <= p_date_to)
  ),
  own_tea AS (
    SELECT COALESCE(SUM(t.total_amount), 0)::numeric AS amount
    FROM public.tea_shop_entries t
    WHERE t.site_id = p_site_id
      AND (p_date_from IS NULL OR t.date >= p_date_from)
      AND (p_date_to   IS NULL OR t.date <= p_date_to)
      AND NOT (
        t.is_group_entry = true
        AND EXISTS (
          SELECT 1 FROM public.tea_shop_entry_allocations a
          WHERE a.entry_id = t.id
            AND a.site_id = p_site_id
        )
      )
  ),
  alloc_tea AS (
    SELECT COALESCE(SUM(
      CASE
        WHEN a.allocation_percentage IS NOT NULL AND e.total_amount IS NOT NULL
          THEN ROUND((a.allocation_percentage / 100.0) * e.total_amount)
        ELSE COALESCE(a.allocated_amount, 0)
      END
    ), 0)::numeric AS amount
    FROM public.tea_shop_entry_allocations a
    JOIN public.tea_shop_entries e ON e.id = a.entry_id
    WHERE a.site_id = p_site_id
      AND (p_date_from IS NULL OR e.date >= p_date_from)
      AND (p_date_to   IS NULL OR e.date <= p_date_to)
  ),
  active_days AS (
    SELECT COUNT(DISTINCT d) AS n
    FROM (
      SELECT date AS d FROM da
      UNION
      SELECT date AS d FROM ma
    ) u
  ),
  da_totals AS (
    SELECT
      COALESCE(SUM(daily_earnings), 0)::numeric                                          AS salary_all,
      COALESCE(SUM(daily_earnings) FILTER (WHERE laborer_type <> 'contract'), 0)::numeric AS daily_amount,
      COALESCE(SUM(daily_earnings) FILTER (WHERE laborer_type  = 'contract'), 0)::numeric AS contract_amount,
      COALESCE(SUM(daily_earnings) FILTER (WHERE is_paid AND laborer_type <> 'contract' AND task_work_package_id IS NULL), 0)::numeric     AS paid_amount_da,
      COUNT(*) FILTER (WHERE is_paid AND laborer_type <> 'contract' AND task_work_package_id IS NULL)::bigint                              AS paid_count_da,
      COALESCE(SUM(daily_earnings) FILTER (WHERE NOT is_paid AND laborer_type <> 'contract' AND task_work_package_id IS NULL), 0)::numeric AS pending_amount_da,
      COUNT(*) FILTER (WHERE NOT is_paid AND laborer_type <> 'contract' AND task_work_package_id IS NULL)::bigint                          AS pending_count_da,
      COUNT(*)::bigint AS total_laborer_rows
    FROM da
  ),
  ma_totals AS (
    SELECT
      COALESCE(SUM(total_cost), 0)::numeric      AS market_amount,
      COALESCE(SUM(count), 0)::bigint            AS market_count,
      COALESCE(SUM(total_cost) FILTER (
        WHERE is_paid AND NOT EXISTS (
          SELECT 1 FROM da WHERE da.date = ma.date
        )
      ), 0)::numeric AS paid_amount_ma,
      COALESCE(SUM(count) FILTER (
        WHERE is_paid AND NOT EXISTS (
          SELECT 1 FROM da WHERE da.date = ma.date
        )
      ), 0)::bigint  AS paid_count_ma,
      COALESCE(SUM(total_cost) FILTER (
        WHERE NOT is_paid AND NOT EXISTS (
          SELECT 1 FROM da WHERE da.date = ma.date
        )
      ), 0)::numeric AS pending_amount_ma,
      COALESCE(SUM(count) FILTER (
        WHERE NOT is_paid AND NOT EXISTS (
          SELECT 1 FROM da WHERE da.date = ma.date
        )
      ), 0)::bigint  AS pending_count_ma
    FROM ma
  )
  SELECT jsonb_build_object(
    'total_salary',     (d.salary_all + m.market_amount),
    'total_tea_shop',   (o.amount + al.amount),
    'total_expense',    (d.salary_all + m.market_amount + o.amount + al.amount),
    'daily_amount',     d.daily_amount,
    'contract_amount',  d.contract_amount,
    'market_amount',    m.market_amount,
    'paid_amount',      (d.paid_amount_da + m.paid_amount_ma),
    'paid_count',       (d.paid_count_da  + m.paid_count_ma),
    'pending_amount',   (d.pending_amount_da + m.pending_amount_ma),
    'pending_count',    (d.pending_count_da  + m.pending_count_ma),
    'total_laborers',   (d.total_laborer_rows + m.market_count),
    'active_days',      ad.n,
    'avg_per_day',
      CASE WHEN ad.n > 0
        THEN ((d.salary_all + m.market_amount + o.amount + al.amount) / ad.n)
        ELSE 0
      END
  )
  FROM da_totals d
  CROSS JOIN ma_totals m
  CROSS JOIN own_tea o
  CROSS JOIN alloc_tea al
  CROSS JOIN active_days ad;
$function$;

-- ── get_payments_ledger ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_payments_ledger(p_site_id uuid, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_status text DEFAULT 'all'::text, p_type text DEFAULT 'all'::text, p_period text DEFAULT 'all'::text, p_subcontract_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id text, settlement_ref text, row_type text, subtype text, date_or_week_start date, week_end date, for_label text, amount numeric, is_paid boolean, is_pending boolean, laborer_id uuid, period text, payment_channel text, daily_cnt integer, contract_cnt integer, mkt_cnt integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH
  audit_state AS (
    SELECT s.data_started_at,
           (s.legacy_status = 'auditing' AND s.data_started_at IS NOT NULL) AS legacy_active
    FROM public.sites s WHERE s.id = p_site_id
  ),
  effective_period AS (
    SELECT
      CASE WHEN ast.legacy_active AND p_period IN ('all','legacy','current') THEN p_period ELSE 'all' END AS period,
      ast.data_started_at, ast.legacy_active
    FROM audit_state ast
  ),
  paid_dm AS (
    SELECT sg.id, sg.settlement_reference, sg.settlement_date, sg.total_amount, sg.payment_channel,
      (SELECT COUNT(DISTINCT da.laborer_id)
         FROM public.daily_attendance da
         JOIN public.laborers l ON l.id = da.laborer_id
         WHERE da.settlement_group_id = sg.id
           AND da.is_archived = false
           AND COALESCE(l.laborer_type, 'daily') <> 'contract') AS daily_cnt,
      (SELECT COUNT(DISTINCT da.laborer_id)
         FROM public.daily_attendance da
         JOIN public.laborers l ON l.id = da.laborer_id
         WHERE da.settlement_group_id = sg.id
           AND da.is_archived = false
           AND l.laborer_type = 'contract') AS contract_cnt,
      (SELECT COUNT(*) FROM public.market_laborer_attendance ma WHERE ma.settlement_group_id = sg.id) AS mkt_cnt
    FROM public.settlement_groups sg
    WHERE sg.site_id = p_site_id AND sg.is_cancelled = false AND sg.is_archived = false
      AND sg.settlement_date IS NOT NULL
      AND (p_subcontract_id IS NULL OR sg.subcontract_id = p_subcontract_id)
      AND (p_date_from IS NULL OR sg.settlement_date >= p_date_from)
      AND (p_date_to   IS NULL OR sg.settlement_date <= p_date_to)
      AND NOT EXISTS (SELECT 1 FROM public.labor_payments lp
                      WHERE lp.settlement_group_id = sg.id AND lp.is_under_contract = true)
      AND (EXISTS (SELECT 1 FROM public.daily_attendance da
                     WHERE da.settlement_group_id = sg.id AND da.is_archived = false)
           OR EXISTS (SELECT 1 FROM public.market_laborer_attendance ma WHERE ma.settlement_group_id = sg.id))
  ),
  paid_dm_rows AS (
    SELECT 'p:'||p.id::text AS id, p.settlement_reference AS settlement_ref,
      'daily-market'::text AS row_type, 'daily-market'::text AS subtype,
      p.settlement_date AS date_or_week_start, NULL::date AS week_end,
      (CASE WHEN p.daily_cnt > 0 THEN p.daily_cnt::text || ' daily' ELSE '' END
       || CASE WHEN p.daily_cnt > 0 AND (p.contract_cnt > 0 OR p.mkt_cnt > 0) THEN ' + ' ELSE '' END
       || CASE WHEN p.contract_cnt > 0 THEN p.contract_cnt::text || ' contract' ELSE '' END
       || CASE WHEN p.contract_cnt > 0 AND p.mkt_cnt > 0 THEN ' + ' ELSE '' END
       || CASE WHEN p.mkt_cnt > 0 THEN p.mkt_cnt::text || ' market' ELSE '' END) AS for_label,
      p.total_amount AS amount, TRUE AS is_paid, FALSE AS is_pending, NULL::uuid AS laborer_id,
      CASE WHEN ep.legacy_active AND p.settlement_date < ep.data_started_at THEN 'legacy' ELSE 'current' END AS period,
      p.payment_channel AS payment_channel,
      p.daily_cnt AS daily_cnt,
      p.contract_cnt AS contract_cnt,
      p.mkt_cnt AS mkt_cnt
    FROM paid_dm p CROSS JOIN effective_period ep
  ),
  paid_wk AS (
    SELECT sg.id, sg.settlement_reference, sg.settlement_date, sg.total_amount,
      sg.payment_type, sg.payment_channel,
      EXISTS (SELECT 1 FROM public.labor_payments lp
              WHERE lp.settlement_group_id = sg.id AND lp.is_under_contract = true
                AND lp.is_archived = false) AS has_contract
    FROM public.settlement_groups sg
    WHERE sg.site_id = p_site_id AND sg.is_cancelled = false AND sg.is_archived = false
      AND sg.settlement_date IS NOT NULL
      AND (p_subcontract_id IS NULL OR sg.subcontract_id = p_subcontract_id)
      AND (p_date_from IS NULL OR sg.settlement_date >= p_date_from)
      AND (p_date_to   IS NULL OR sg.settlement_date <= p_date_to)
      AND (EXISTS (SELECT 1 FROM public.labor_payments lp
                   WHERE lp.settlement_group_id = sg.id AND lp.is_under_contract = true)
           OR (NOT EXISTS (SELECT 1 FROM public.daily_attendance da
                          WHERE da.settlement_group_id = sg.id AND da.is_archived = false)
               AND NOT EXISTS (SELECT 1 FROM public.market_laborer_attendance ma
                              WHERE ma.settlement_group_id = sg.id)))
  ),
  paid_wk_with_lab AS (
    SELECT p.*,
      (SELECT lp.laborer_id FROM public.labor_payments lp
         WHERE lp.settlement_group_id = p.id AND lp.is_archived = false LIMIT 1) AS one_laborer_id,
      (SELECT COUNT(DISTINCT lp.laborer_id) FROM public.labor_payments lp
         WHERE lp.settlement_group_id = p.id AND lp.is_archived = false) AS distinct_lab_cnt,
      (SELECT l.name FROM public.laborers l
         JOIN public.labor_payments lp ON lp.laborer_id = l.id
         WHERE lp.settlement_group_id = p.id AND lp.is_archived = false LIMIT 1) AS one_laborer_name
    FROM paid_wk p
  ),
  paid_wk_rows AS (
    SELECT 'p:'||p.id::text AS id, p.settlement_reference AS settlement_ref,
      'weekly'::text AS row_type,
      CASE WHEN p.payment_type = 'salary' AND p.has_contract THEN 'salary-waterfall'
           WHEN p.payment_type = 'advance' THEN 'advance'
           WHEN p.payment_type = 'excess' THEN 'adjustment'
           ELSE 'unclassified' END AS subtype,
      (p.settlement_date - extract(dow FROM p.settlement_date)::int)::date AS date_or_week_start,
      ((p.settlement_date - extract(dow FROM p.settlement_date)::int)::date + 6) AS week_end,
      CASE WHEN p.payment_type = 'excess' THEN COALESCE(p.one_laborer_name || ' · excess return', 'Excess return')
           WHEN p.payment_type = 'advance' THEN COALESCE(p.one_laborer_name || ' · advance', 'Mestri · advance')
           WHEN p.payment_type = 'salary' AND p.has_contract AND p.distinct_lab_cnt = 1 THEN p.one_laborer_name
           WHEN p.payment_type = 'salary' AND p.has_contract AND p.distinct_lab_cnt > 1 THEN 'Group settlement (' || p.distinct_lab_cnt::text || ' laborers)'
           ELSE 'Unclassified settlement' END AS for_label,
      p.total_amount AS amount, TRUE AS is_paid, FALSE AS is_pending,
      CASE WHEN p.distinct_lab_cnt = 1 THEN p.one_laborer_id ELSE NULL END AS laborer_id,
      CASE WHEN ep.legacy_active AND p.settlement_date < ep.data_started_at THEN 'legacy' ELSE 'current' END AS period,
      p.payment_channel AS payment_channel,
      0::integer AS daily_cnt,
      0::integer AS contract_cnt,
      0::integer AS mkt_cnt
    FROM paid_wk_with_lab p CROSS JOIN effective_period ep
  ),
  pending_da AS (
    SELECT d.date AS d, SUM(d.daily_earnings)::numeric AS amt, COUNT(DISTINCT d.laborer_id) AS lab_cnt
    FROM public.daily_attendance d
    JOIN public.laborers l ON l.id = d.laborer_id
    WHERE d.site_id = p_site_id AND d.is_deleted = false AND d.is_archived = false
      AND d.is_paid = false AND d.settlement_group_id IS NULL AND l.laborer_type <> 'contract'
      AND d.task_work_package_id IS NULL
      AND (p_subcontract_id IS NULL OR d.subcontract_id = p_subcontract_id)
      AND d.date < CURRENT_DATE
      AND (p_date_from IS NULL OR d.date >= p_date_from)
      AND (p_date_to   IS NULL OR d.date <= p_date_to)
    GROUP BY d.date
  ),
  pending_ma AS (
    SELECT m.date AS d, SUM(m.total_cost)::numeric AS amt, COUNT(*) AS mkt_cnt
    FROM public.market_laborer_attendance m
    WHERE m.site_id = p_site_id AND m.is_paid = false AND m.settlement_group_id IS NULL
      AND (p_subcontract_id IS NULL OR m.subcontract_id = p_subcontract_id)
      AND m.date < CURRENT_DATE
      AND (p_date_from IS NULL OR m.date >= p_date_from)
      AND (p_date_to   IS NULL OR m.date <= p_date_to)
    GROUP BY m.date
  ),
  pending_dm_rows AS (
    SELECT 'pd:' || COALESCE(da.d, ma.d)::text AS id, NULL::text AS settlement_ref,
      'daily-market'::text AS row_type, 'daily-market'::text AS subtype,
      COALESCE(da.d, ma.d) AS date_or_week_start, NULL::date AS week_end,
      (CASE WHEN COALESCE(da.lab_cnt, 0) > 0 THEN da.lab_cnt::text || ' daily' ELSE '' END
       || CASE WHEN COALESCE(da.lab_cnt, 0) > 0 AND COALESCE(ma.mkt_cnt, 0) > 0 THEN ' + ' ELSE '' END
       || CASE WHEN COALESCE(ma.mkt_cnt, 0) > 0 THEN ma.mkt_cnt::text || ' market' ELSE '' END) AS for_label,
      (COALESCE(da.amt, 0) + COALESCE(ma.amt, 0))::numeric AS amount,
      FALSE AS is_paid, TRUE AS is_pending, NULL::uuid AS laborer_id,
      CASE WHEN ep.legacy_active AND COALESCE(da.d, ma.d) < ep.data_started_at THEN 'legacy' ELSE 'current' END AS period,
      NULL::text AS payment_channel,
      COALESCE(da.lab_cnt, 0)::integer AS daily_cnt,
      0::integer AS contract_cnt,
      COALESCE(ma.mkt_cnt, 0)::integer AS mkt_cnt
    FROM pending_da da FULL OUTER JOIN pending_ma ma ON ma.d = da.d
    CROSS JOIN effective_period ep
  ),
  all_rows AS (
    SELECT * FROM paid_dm_rows
    UNION ALL SELECT * FROM paid_wk_rows
    UNION ALL SELECT * FROM pending_dm_rows
  )
  SELECT r.id, r.settlement_ref, r.row_type, r.subtype, r.date_or_week_start, r.week_end,
    r.for_label, r.amount, r.is_paid, r.is_pending, r.laborer_id, r.period, r.payment_channel,
    r.daily_cnt, r.contract_cnt, r.mkt_cnt
  FROM all_rows r CROSS JOIN effective_period ep
  WHERE (p_status = 'all'
         OR (p_status = 'pending' AND r.is_pending)
         OR (p_status = 'completed' AND r.is_paid))
    AND (p_type = 'all'
         OR (p_type = 'daily-market' AND r.row_type = 'daily-market')
         OR (p_type = 'weekly' AND r.row_type = 'weekly'))
    AND (ep.period = 'all' OR r.period = ep.period)
  ORDER BY r.is_pending DESC, r.date_or_week_start DESC
  LIMIT 2000;
$function$;
