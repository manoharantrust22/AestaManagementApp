-- =====================================================
-- v_audit_misattributed_batch_usage: read-only audit view
-- =====================================================
-- Surfaces every batch_usage_records row that was written against a
-- multi-variant batch by the legacy LIMIT 1 record_batch_usage().
--
-- Strict read-only — no UPDATE happens here. The repair workflow is:
--   1. Query this view, group by batch_ref_code
--   2. Hand the row list to the user for variant-by-variant decision
--   3. Run targeted UPDATE batch_usage_records SET material_id = $new
--      WHERE id = $row via MCP after user sign-off
--
-- A row is included when the parent batch has more than one distinct
-- material_id. For single-variant batches the LIMIT 1 was harmless.

CREATE OR REPLACE VIEW v_audit_misattributed_batch_usage AS
WITH batch_variant_counts AS (
  SELECT
    mpe.ref_code,
    mpe.id AS expense_id,
    COUNT(DISTINCT mpei.material_id) AS variant_count
  FROM material_purchase_expenses mpe
  JOIN material_purchase_expense_items mpei ON mpei.purchase_expense_id = mpe.id
  WHERE mpe.purchase_type = 'group_stock'
  GROUP BY mpe.ref_code, mpe.id
  HAVING COUNT(DISTINCT mpei.material_id) > 1
)
SELECT
  bur.id AS batch_usage_id,
  bur.batch_ref_code,
  bur.usage_site_id,
  s.name AS usage_site_name,
  bur.material_id AS current_material_id,
  m.name AS current_material_name,
  bur.brand_id AS current_brand_id,
  bur.quantity,
  bur.unit,
  bur.usage_date,
  bur.work_description,
  bur.created_at,
  bvc.variant_count AS variant_count_in_batch,
  (
    SELECT jsonb_agg(
      jsonb_build_object(
        'material_id', mpei.material_id,
        'material_name', m2.name,
        'brand_id', mpei.brand_id,
        'brand_name', mb.brand_name,
        'item_quantity', mpei.quantity,
        'unit_price', mpei.unit_price
      )
      ORDER BY m2.name
    )
    FROM material_purchase_expense_items mpei
    JOIN materials m2 ON m2.id = mpei.material_id
    LEFT JOIN material_brands mb ON mb.id = mpei.brand_id
    WHERE mpei.purchase_expense_id = bvc.expense_id
  ) AS variant_options
FROM batch_usage_records bur
JOIN batch_variant_counts bvc ON bvc.ref_code = bur.batch_ref_code
JOIN materials m ON m.id = bur.material_id
LEFT JOIN sites s ON s.id = bur.usage_site_id
ORDER BY bur.batch_ref_code, bur.usage_date, bur.created_at;

COMMENT ON VIEW v_audit_misattributed_batch_usage IS
'Lists batch_usage_records rows on multi-variant group_stock batches whose
material_id may have been mechanically picked by the legacy LIMIT 1 record_batch_usage()
RPC (replaced 2026-05-25). Used to drive a manual repair workflow — never as
basis for a blind backfill.';
