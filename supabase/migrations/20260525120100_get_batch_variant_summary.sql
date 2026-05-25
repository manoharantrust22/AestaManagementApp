-- =====================================================
-- get_batch_variant_summary: per-variant breakdown for a group batch
-- =====================================================
-- Returns one row per (material_id, brand_id) in the batch with
-- variant-scoped used / remaining computed by summing batch_usage_records.
-- Sibling to get_batch_settlement_summary (which stays batch-scoped).

DROP FUNCTION IF EXISTS get_batch_variant_summary(TEXT);

CREATE OR REPLACE FUNCTION get_batch_variant_summary(p_batch_ref_code TEXT)
RETURNS TABLE (
  material_id UUID,
  brand_id UUID,
  material_name TEXT,
  brand_name TEXT,
  unit TEXT,
  unit_cost NUMERIC,
  original_qty NUMERIC,
  used_qty NUMERIC,
  remaining_qty NUMERIC
) AS $$
  SELECT
    mpei.material_id,
    mpei.brand_id,
    m.name AS material_name,
    mb.brand_name,
    m.unit,
    mpei.unit_price AS unit_cost,
    mpei.quantity AS original_qty,
    COALESCE(bur_agg.used_qty, 0) AS used_qty,
    mpei.quantity - COALESCE(bur_agg.used_qty, 0) AS remaining_qty
  FROM material_purchase_expenses mpe
  JOIN material_purchase_expense_items mpei ON mpei.purchase_expense_id = mpe.id
  JOIN materials m ON m.id = mpei.material_id
  LEFT JOIN material_brands mb ON mb.id = mpei.brand_id
  LEFT JOIN LATERAL (
    SELECT SUM(bur.quantity) AS used_qty
    FROM batch_usage_records bur
    WHERE bur.batch_ref_code = mpe.ref_code
      AND bur.material_id = mpei.material_id
      AND COALESCE(bur.brand_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = COALESCE(mpei.brand_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) bur_agg ON true
  WHERE mpe.ref_code = p_batch_ref_code
    AND mpe.purchase_type = 'group_stock'
  ORDER BY m.name, mb.brand_name NULLS FIRST;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION get_batch_variant_summary(TEXT) IS
'Returns per-(material_id, brand_id) original/used/remaining for a group_stock
batch. used_qty is summed from batch_usage_records filtered by material+brand,
not from material_purchase_expenses.used_qty (which is batch-aggregate).';
