-- Fix: get_batch_settlement_summary(text) 400s on every group-stock batch.
--
-- The function declares `paying_site_name TEXT` in its RETURNS TABLE, but projects
-- `sites.name` which is `character varying(255)`. PostgreSQL raises
--   42804: structure of query does not match function result type
--          (Returned type character varying(255) does not match expected type text in column 3)
-- whenever a group_stock row is actually returned. The Hub's useBatchSettlementSummary
-- swallows the error (returns null) but the RPC still HTTP 400s once per group batch.
--
-- Fix: cast ps.name::text. ref_code is already text; the site_allocations JSONB block
-- coerces names through jsonb_agg, so column 3 (paying_site_name) is the only offender.
-- The unrelated (uuid) engineer-wallet overload is left untouched.

CREATE OR REPLACE FUNCTION public.get_batch_settlement_summary(p_batch_ref_code TEXT)
RETURNS TABLE (
  batch_ref_code TEXT,
  paying_site_id UUID,
  paying_site_name TEXT,
  total_amount NUMERIC,
  original_qty NUMERIC,
  used_qty NUMERIC,
  remaining_qty NUMERIC,
  site_allocations JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    mpe.ref_code,
    mpe.paying_site_id,
    ps.name::text AS paying_site_name,
    mpe.total_amount,
    COALESCE(mpe.original_qty, (SELECT SUM(quantity) FROM material_purchase_expense_items WHERE purchase_expense_id = mpe.id)),
    COALESCE(mpe.used_qty, 0),
    COALESCE(mpe.remaining_qty, mpe.original_qty, (SELECT SUM(quantity) FROM material_purchase_expense_items WHERE purchase_expense_id = mpe.id)),
    COALESCE(
      (
        SELECT jsonb_agg(site_data ORDER BY is_payer DESC, site_name)
        FROM (
          SELECT
            bur.usage_site_id as site_id,
            s.name as site_name,
            SUM(bur.quantity) as quantity_used,
            SUM(bur.total_cost) as amount,
            bur.is_self_use as is_payer,
            MAX(bur.settlement_status) as settlement_status
          FROM batch_usage_records bur
          JOIN sites s ON s.id = bur.usage_site_id
          WHERE bur.batch_ref_code = mpe.ref_code
          GROUP BY bur.usage_site_id, s.name, bur.is_self_use
        ) site_data
      ),
      '[]'::JSONB
    )
  FROM material_purchase_expenses mpe
  LEFT JOIN sites ps ON ps.id = mpe.paying_site_id
  WHERE mpe.ref_code = p_batch_ref_code
    AND mpe.purchase_type = 'group_stock';
END;
$$ LANGUAGE plpgsql;
