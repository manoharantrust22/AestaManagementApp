-- Migration: Add get_payments_ledger RPC
-- Purpose: Power the unified PaymentsLedger DataTable on /site/payments. Returns
--          one row per "settlement-shaped" entity, paid or pending, suitable
--          for direct rendering in the new unified ledger surface (Tasks 3.4 +
--          3.5 of the Salary Settlement UX redesign).
--
-- Output shape (one row per entry):
--   id text                  - synthetic unique id ('p:<sg_uuid>' for paid,
--                              'pd:<YYYY-MM-DD>' for pending daily-market).
--   settlement_ref text      - settlement_groups.settlement_reference for paid;
--                              NULL for pending.
--   row_type text            - 'daily-market' or 'weekly'.
--   date_or_week_start date  - settlement_date for paid; attendance date for
--                              pending. The ORDER BY column.
--   week_end date            - Sunday of the ISO week containing
--                              settlement_date for paid weekly rows; NULL
--                              otherwise.
--   for_label text           - human-readable descriptor:
--                                paid daily-market: "<N> lab + <M> mkt"
--                                paid weekly (1 lab): laborers.name
--                                paid weekly (multi): "Group settlement (N laborers)"
--                                pending daily-market: "<N> daily lab + <M> mkt"
--   amount numeric           - total amount for the row.
--   is_paid boolean          - true for paid streams.
--   is_pending boolean       - opposite of is_paid.
--   laborer_id uuid          - laborers.id for single-laborer weekly settlements;
--                              NULL otherwise (NULL for daily-market and groups).
--
-- Bucketing rules (mirrors get_payment_summary):
--   * Paid daily-market = non-cancelled settlement_groups with at least one
--     linked daily_attendance OR market_laborer_attendance row.
--   * Paid weekly = non-cancelled settlement_groups with NO attendance link
--     (covers contract weekly settlements via labor_payments + advance/excess
--     settlements that the UX groups under the contract bucket).
--   * Pending daily-market = distinct attendance dates within scope where
--     daily_attendance.is_paid=false (excluding contract laborers, mirroring
--     get_payment_summary) or market_laborer_attendance.is_paid=false.
--
-- Paid weekly date range:
--   date_or_week_start and week_end are derived from settlement_date via
--   date_trunc('week', ...) (ISO Monday) + 6 days (Sunday). This gives the
--   InspectPane weekly view a real Mon-Sun range to render the 7-day strip
--   against. The settlement_date itself is preserved in audit/settlement
--   contexts via settlement_ref.
--
-- STUB - Pending weekly:
--   The pending-weekly stream (per-laborer-per-week unsettled contract money)
--   is intentionally NOT included in this dispatch. Cleanly aggregating it
--   requires a per-laborer-week view that doesn't exist today: contract
--   laborer "owed money" derives from work_logs/subcontracts vs labor_payments
--   without a per-week join key, and the UX's weekly bucket also folds in
--   advance/excess settlements that aren't naturally per-week. Pending
--   daily-market is the higher-traffic surface (10 dates open on the
--   reference site at validation time vs all weekly buckets being paid via
--   settlement_groups), so we ship that and add pending-weekly in a follow-up
--   once the laborer-week aggregation is designed. Until then, p_status =
--   'pending' returns only daily-market pending rows.
--
-- Filter semantics:
--   p_status: 'pending' returns only is_pending rows
--             'completed' returns only is_paid rows
--             'all' returns both (default)
--   p_type:   'daily-market' returns only row_type='daily-market'
--             'weekly' returns only row_type='weekly' (paid only — see stub)
--             'all' returns both (default)
--
-- NULL settlement_date is filtered out of paid streams entirely (same
-- invariant as get_payment_summary; see migration
-- 20260111215210_fix_orphaned_settlement_groups.sql).
--
-- Order: pending rows first (is_pending DESC), then date_or_week_start DESC.
--
-- Cap: LIMIT 2000 matches the existing /site/expenses ceiling. This is a
-- heavy view — the spec calls out that filters narrow the scope before the
-- user paginates further.
--
-- Validation:
--   The function body was validated against production via read-only inlined
--   WITH...SELECT before this migration was applied. Smoke tests on the
--   Srinivasan House & Shop site:
--     1. (site, NULL, NULL, 'all', 'all')           -> 225 rows
--                                                       (10 pending +
--                                                        99 paid daily-market +
--                                                        116 paid weekly)
--     2. (site, '2026-04-01', '2026-04-30',
--         'pending', 'all')                          -> 3 rows
--     3. (site, NULL, NULL, 'completed', 'weekly')  -> 116 rows
--   The pending count matches Phase 1's get_payment_summary
--   pending_dates_count for the same site.

CREATE OR REPLACE FUNCTION public.get_payments_ledger(
  p_site_id   uuid,
  p_date_from date    DEFAULT NULL,
  p_date_to   date    DEFAULT NULL,
  p_status    text    DEFAULT 'all',
  p_type      text    DEFAULT 'all'
) RETURNS TABLE (
  id                  text,
  settlement_ref      text,
  row_type            text,
  date_or_week_start  date,
  week_end            date,
  for_label           text,
  amount              numeric,
  is_paid             boolean,
  is_pending          boolean,
  laborer_id          uuid
)
  LANGUAGE sql STABLE
  SECURITY INVOKER
  SET search_path = public
AS $$
  WITH
  -- Paid daily-market rows: settlement_groups with at least one attendance link.
  -- Counts of distinct daily laborers + market entries are computed inline so
  -- the for_label like "12 lab + 3 mkt" can be generated server-side.
  paid_dm AS (
    SELECT
      sg.id,
      sg.settlement_reference,
      sg.settlement_date,
      sg.total_amount,
      (SELECT COUNT(DISTINCT da.laborer_id)
         FROM public.daily_attendance da
         WHERE da.settlement_group_id = sg.id) AS daily_lab,
      (SELECT COUNT(*)
         FROM public.market_laborer_attendance ma
         WHERE ma.settlement_group_id = sg.id) AS mkt_cnt
    FROM public.settlement_groups sg
    WHERE sg.site_id = p_site_id
      AND sg.is_cancelled = false
      AND sg.settlement_date IS NOT NULL
      AND (p_date_from IS NULL OR sg.settlement_date >= p_date_from)
      AND (p_date_to   IS NULL OR sg.settlement_date <= p_date_to)
      AND (
        EXISTS (SELECT 1 FROM public.daily_attendance da
                  WHERE da.settlement_group_id = sg.id)
        OR EXISTS (SELECT 1 FROM public.market_laborer_attendance ma
                  WHERE ma.settlement_group_id = sg.id)
      )
  ),
  paid_dm_rows AS (
    SELECT
      'p:'||p.id::text                                   AS id,
      p.settlement_reference                             AS settlement_ref,
      'daily-market'::text                               AS row_type,
      p.settlement_date                                  AS date_or_week_start,
      NULL::date                                         AS week_end,
      (
        CASE WHEN p.daily_lab > 0 THEN p.daily_lab::text || ' lab' ELSE '' END
        || CASE WHEN p.daily_lab > 0 AND p.mkt_cnt > 0 THEN ' + ' ELSE '' END
        || CASE WHEN p.mkt_cnt   > 0 THEN p.mkt_cnt::text || ' mkt' ELSE '' END
      )                                                   AS for_label,
      p.total_amount                                      AS amount,
      TRUE                                                AS is_paid,
      FALSE                                               AS is_pending,
      NULL::uuid                                          AS laborer_id
    FROM paid_dm p
  ),
  -- Paid weekly rows: settlement_groups with NO attendance link. for_label
  -- comes from a join to labor_payments -> laborers; if exactly one distinct
  -- laborer is linked we surface the name + populate laborer_id; otherwise
  -- we render a generic "Group settlement (N laborers)" descriptor and leave
  -- laborer_id NULL.
  paid_wk AS (
    SELECT
      sg.id,
      sg.settlement_reference,
      sg.settlement_date,
      sg.total_amount
    FROM public.settlement_groups sg
    WHERE sg.site_id = p_site_id
      AND sg.is_cancelled = false
      AND sg.settlement_date IS NOT NULL
      AND (p_date_from IS NULL OR sg.settlement_date >= p_date_from)
      AND (p_date_to   IS NULL OR sg.settlement_date <= p_date_to)
      AND NOT EXISTS (SELECT 1 FROM public.daily_attendance da
                        WHERE da.settlement_group_id = sg.id)
      AND NOT EXISTS (SELECT 1 FROM public.market_laborer_attendance ma
                        WHERE ma.settlement_group_id = sg.id)
  ),
  paid_wk_with_lab AS (
    SELECT
      p.*,
      (
        SELECT lp.laborer_id
        FROM public.labor_payments lp
        WHERE lp.settlement_group_id = p.id
        LIMIT 1
      ) AS one_laborer_id,
      (
        SELECT COUNT(DISTINCT lp.laborer_id)
        FROM public.labor_payments lp
        WHERE lp.settlement_group_id = p.id
      ) AS distinct_lab_cnt
    FROM paid_wk p
  ),
  paid_wk_rows AS (
    SELECT
      'p:'||p.id::text                                                          AS id,
      p.settlement_reference                                                    AS settlement_ref,
      'weekly'::text                                                            AS row_type,
      date_trunc('week', p.settlement_date)::date                               AS date_or_week_start,
      (date_trunc('week', p.settlement_date)::date + 6)                         AS week_end,
      COALESCE(
        CASE
          WHEN p.distinct_lab_cnt = 1 THEN
            (SELECT l.name FROM public.laborers l WHERE l.id = p.one_laborer_id)
          WHEN p.distinct_lab_cnt > 1 THEN
            'Group settlement (' || p.distinct_lab_cnt::text || ' laborers)'
          ELSE NULL
        END,
        'Settlement'
      )                                                                         AS for_label,
      p.total_amount                                                            AS amount,
      TRUE                                                                      AS is_paid,
      FALSE                                                                     AS is_pending,
      CASE WHEN p.distinct_lab_cnt = 1 THEN p.one_laborer_id ELSE NULL END      AS laborer_id
    FROM paid_wk_with_lab p
  ),
  -- Pending daily-market rows: distinct attendance dates with unpaid daily
  -- (non-contract) or market money. Mirrors get_payment_summary's pending_da
  -- + pending_ma CTEs.
  pending_da AS (
    SELECT
      d.date AS d,
      SUM(d.daily_earnings)::numeric AS amt,
      COUNT(DISTINCT d.laborer_id) AS lab_cnt
    FROM public.daily_attendance d
    JOIN public.laborers l ON l.id = d.laborer_id
    WHERE d.site_id = p_site_id
      AND d.is_deleted = false
      AND d.is_paid = false
      AND l.laborer_type <> 'contract'
      AND (p_date_from IS NULL OR d.date >= p_date_from)
      AND (p_date_to   IS NULL OR d.date <= p_date_to)
    GROUP BY d.date
  ),
  pending_ma AS (
    SELECT
      m.date AS d,
      SUM(m.total_cost)::numeric AS amt,
      COUNT(*) AS mkt_cnt
    FROM public.market_laborer_attendance m
    WHERE m.site_id = p_site_id
      AND m.is_paid = false
      AND (p_date_from IS NULL OR m.date >= p_date_from)
      AND (p_date_to   IS NULL OR m.date <= p_date_to)
    GROUP BY m.date
  ),
  pending_dm_rows AS (
    SELECT
      'pd:' || COALESCE(da.d, ma.d)::text                                       AS id,
      NULL::text                                                                AS settlement_ref,
      'daily-market'::text                                                      AS row_type,
      COALESCE(da.d, ma.d)                                                      AS date_or_week_start,
      NULL::date                                                                AS week_end,
      (
        CASE WHEN COALESCE(da.lab_cnt, 0) > 0
          THEN da.lab_cnt::text || ' daily lab' ELSE '' END
        || CASE WHEN COALESCE(da.lab_cnt, 0) > 0 AND COALESCE(ma.mkt_cnt, 0) > 0
          THEN ' + ' ELSE '' END
        || CASE WHEN COALESCE(ma.mkt_cnt, 0) > 0
          THEN ma.mkt_cnt::text || ' mkt' ELSE '' END
      )                                                                         AS for_label,
      (COALESCE(da.amt, 0) + COALESCE(ma.amt, 0))::numeric                      AS amount,
      FALSE                                                                     AS is_paid,
      TRUE                                                                      AS is_pending,
      NULL::uuid                                                                AS laborer_id
    FROM pending_da da
    FULL OUTER JOIN pending_ma ma ON ma.d = da.d
  ),
  -- UNION all streams. Pending-weekly stream is intentionally absent (see
  -- the STUB note in the header).
  all_rows AS (
    SELECT * FROM paid_dm_rows
    UNION ALL
    SELECT * FROM paid_wk_rows
    UNION ALL
    SELECT * FROM pending_dm_rows
  )
  SELECT
    id,
    settlement_ref,
    row_type,
    date_or_week_start,
    week_end,
    for_label,
    amount,
    is_paid,
    is_pending,
    laborer_id
  FROM all_rows
  WHERE
    -- p_status filter: 'pending' / 'completed' / 'all'
    (
      p_status = 'all'
      OR (p_status = 'pending'   AND is_pending)
      OR (p_status = 'completed' AND is_paid)
    )
    -- p_type filter: 'daily-market' / 'weekly' / 'all'
    AND (
      p_type = 'all'
      OR (p_type = 'daily-market' AND row_type = 'daily-market')
      OR (p_type = 'weekly'        AND row_type = 'weekly')
    )
  ORDER BY
    is_pending DESC,           -- pending rows first
    date_or_week_start DESC    -- newest first within each group
  LIMIT 2000;
$$;

COMMENT ON FUNCTION public.get_payments_ledger(uuid, date, date, text, text) IS
'Unified ledger feed for /site/payments PaymentsLedger DataTable. UNIONs paid daily-market settlement_groups (with attendance link), paid weekly settlement_groups (no attendance link), and pending daily-market attendance dates (unpaid daily/market money). Pending-weekly stream is currently stubbed -- p_status=pending returns daily-market only. Filters: p_status (pending/completed/all), p_type (daily-market/weekly/all). Pending rows ordered first; capped at 2000 rows.';

GRANT EXECUTE ON FUNCTION public.get_payments_ledger(uuid, date, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_payments_ledger(uuid, date, date, text, text) TO service_role;
