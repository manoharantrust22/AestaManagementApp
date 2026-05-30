-- =====================================================
-- One-time backfill: re-derive batch_usage_records.unit_cost to the landed
-- basis (variant item-line price scaled to COALESCE(amount_paid, total_amount))
-- for every existing group-stock batch. Pairs with 20260530230000 which fixes
-- the going-forward record/trigger logic.
--
-- Safe to run wholesale: at time of writing there are 0 rows in
-- inter_site_material_settlements and 0 batch_usage_records with
-- settlement_status='settled', so no historical settlement amounts are frozen.
-- =====================================================

-- 1) batch_usage_records — total_cost is GENERATED, so updating unit_cost
--    cascades. Matched variant uses its own unit_price; any unmatched row falls
--    back to the batch average item price; both scaled by amount_paid/items_total.
UPDATE batch_usage_records bur
SET
  unit_cost = CASE
    WHEN COALESCE(it.items_total, 0) > 0 THEN
      COALESCE(
        (SELECT mpei.unit_price
           FROM material_purchase_expense_items mpei
          WHERE mpei.purchase_expense_id = mpe.id
            AND mpei.material_id = bur.material_id
            AND COALESCE(mpei.brand_id, '00000000-0000-0000-0000-000000000000'::uuid)
                = COALESCE(bur.brand_id, '00000000-0000-0000-0000-000000000000'::uuid)
          LIMIT 1),
        it.items_total / NULLIF(COALESCE(mpe.original_qty, it.items_qty), 0)
      ) * (COALESCE(mpe.amount_paid, mpe.total_amount) / it.items_total)
    ELSE
      COALESCE(mpe.amount_paid, mpe.total_amount)
        / NULLIF(COALESCE(mpe.original_qty, it.items_qty), 0)
  END,
  updated_at = now()
FROM material_purchase_expenses mpe
LEFT JOIN LATERAL (
  SELECT SUM(total_price) AS items_total, SUM(quantity) AS items_qty
  FROM material_purchase_expense_items
  WHERE purchase_expense_id = mpe.id
) it ON true
WHERE mpe.ref_code = bur.batch_ref_code
  AND mpe.purchase_type = 'group_stock';

-- 2) Re-snapshot self_used_amount from the corrected self-use rows.
UPDATE material_purchase_expenses mpe
SET self_used_amount = COALESCE((
  SELECT SUM(bur.total_cost)
  FROM batch_usage_records bur
  WHERE bur.batch_ref_code = mpe.ref_code
    AND bur.is_self_use = true
), 0)
WHERE mpe.purchase_type = 'group_stock';

-- 3) Mirror onto legacy group_stock_transactions usage rows (stored total_cost).
UPDATE group_stock_transactions gst
SET
  unit_cost = CASE
    WHEN COALESCE(it.items_total, 0) > 0 THEN
      COALESCE(
        (SELECT mpei.unit_price
           FROM material_purchase_expense_items mpei
          WHERE mpei.purchase_expense_id = mpe.id
            AND mpei.material_id = gst.material_id
            AND COALESCE(mpei.brand_id, '00000000-0000-0000-0000-000000000000'::uuid)
                = COALESCE(gst.brand_id, '00000000-0000-0000-0000-000000000000'::uuid)
          LIMIT 1),
        it.items_total / NULLIF(COALESCE(mpe.original_qty, it.items_qty), 0)
      ) * (COALESCE(mpe.amount_paid, mpe.total_amount) / it.items_total)
    ELSE
      COALESCE(mpe.amount_paid, mpe.total_amount)
        / NULLIF(COALESCE(mpe.original_qty, it.items_qty), 0)
  END,
  updated_at = now()
FROM material_purchase_expenses mpe
LEFT JOIN LATERAL (
  SELECT SUM(total_price) AS items_total, SUM(quantity) AS items_qty
  FROM material_purchase_expense_items
  WHERE purchase_expense_id = mpe.id
) it ON true
WHERE mpe.ref_code = gst.batch_ref_code
  AND mpe.purchase_type = 'group_stock'
  AND gst.transaction_type = 'usage';

UPDATE group_stock_transactions gst
SET total_cost = gst.quantity * gst.unit_cost
WHERE gst.transaction_type = 'usage'
  AND EXISTS (
    SELECT 1 FROM material_purchase_expenses mpe
    WHERE mpe.ref_code = gst.batch_ref_code
      AND mpe.purchase_type = 'group_stock'
  );
