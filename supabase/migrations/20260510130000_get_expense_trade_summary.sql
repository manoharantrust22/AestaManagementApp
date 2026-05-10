-- Per-trade expense summary RPC for the All-Site Expenses trade dashboard.
-- Returns one row per labor trade (joined via subcontracts → labor_categories)
-- plus one "Site-wide" row for non-contract expenses (materials, machinery, misc).
-- Frontend metric cards consume this to show accurate totals even when the main
-- table is paginated.
--
-- SECURITY DEFINER: required so the cross-table JOIN (v_all_expenses → subcontracts
-- → labor_categories) succeeds regardless of the caller's RLS context.

CREATE OR REPLACE FUNCTION public.get_expense_trade_summary(
  p_site_id   uuid,
  p_date_from date DEFAULT NULL,
  p_date_to   date DEFAULT NULL
)
RETURNS TABLE (
  trade_category_id   uuid,
  trade_name          text,
  total_amount        numeric,
  record_count        bigint,
  daily_amount        numeric,
  contract_amount     numeric,
  material_amount     numeric,
  machinery_amount    numeric,
  site_wide_amount    numeric,
  site_wide_count     bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Labor trades: rows with contract_id → join to subcontracts → labor_categories
  SELECT
    lc.id                                                                          AS trade_category_id,
    lc.name::text                                                                  AS trade_name,
    SUM(e.amount)                                                                  AS total_amount,
    COUNT(*)                                                                       AS record_count,
    SUM(CASE WHEN e.expense_type = 'Daily Salary'    THEN e.amount ELSE 0 END)    AS daily_amount,
    SUM(CASE WHEN e.expense_type = 'Contract Salary' THEN e.amount ELSE 0 END)    AS contract_amount,
    0::numeric                                                                     AS material_amount,
    0::numeric                                                                     AS machinery_amount,
    0::numeric                                                                     AS site_wide_amount,
    0::bigint                                                                      AS site_wide_count
  FROM v_all_expenses e
  JOIN subcontracts sc ON e.contract_id = sc.id
  JOIN labor_categories lc ON sc.trade_category_id = lc.id
  WHERE e.site_id = p_site_id
    AND e.is_deleted = false
    AND (p_date_from IS NULL OR e.date >= p_date_from)
    AND (p_date_to   IS NULL OR e.date <= p_date_to)
  GROUP BY lc.id, lc.name

  UNION ALL

  -- Site-wide row: rows with no contract_id (materials, machinery, misc, unlinked daily)
  SELECT
    NULL::uuid           AS trade_category_id,
    'Site-wide'::text    AS trade_name,
    SUM(e.amount)        AS total_amount,
    COUNT(*)             AS record_count,
    0::numeric           AS daily_amount,
    0::numeric           AS contract_amount,
    SUM(CASE WHEN e.expense_type = 'Material'   THEN e.amount ELSE 0 END) AS material_amount,
    SUM(CASE WHEN e.expense_type = 'Machinery'  THEN e.amount ELSE 0 END) AS machinery_amount,
    SUM(e.amount)        AS site_wide_amount,
    COUNT(*)             AS site_wide_count
  FROM v_all_expenses e
  WHERE e.site_id = p_site_id
    AND e.is_deleted = false
    AND e.contract_id IS NULL
    AND (p_date_from IS NULL OR e.date >= p_date_from)
    AND (p_date_to   IS NULL OR e.date <= p_date_to)
$$;

GRANT EXECUTE ON FUNCTION public.get_expense_trade_summary(uuid, date, date) TO authenticated;

COMMENT ON FUNCTION public.get_expense_trade_summary IS
  'Per-trade expense totals for the expenses dashboard metric cards. Returns one row per labor trade (via subcontracts → labor_categories) plus a Site-wide row for non-contract expenses. Respects optional date range filters.';
