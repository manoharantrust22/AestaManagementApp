-- Data cleanup for the PPC cement variant + duplicate brand.
--
-- 1. Rename the grade-variant material "43" → "43 Grade" so it reads clearly
--    wherever it surfaces (ledger drill-down, catalog). It stays a variant of
--    PPC Cement (50kg bag) via materials.parent_id — only the label changes.
--
-- 2. Merge the duplicate "Chettinad" brand. PPC Cement (50kg bag) carries TWO
--    "Chettinad" material_brands rows (22271489 and 76eecfa0); usage/stock got
--    split across both. Re-point everything from the duplicate (22271489) to the
--    canonical one (76eecfa0), then delete the orphan.
--
-- Verified against prod before writing (2026-06-06): re-pointing 22271489 → 76eecfa0
-- causes NO unique-key collisions in stock_inventory
-- (site_id, location_id, material_id, brand_id, batch_code) or vendor_inventory
-- (vendor_id, material_id, brand_id); the duplicate brand has no
-- material_brand_variant_links rows, so the final DELETE is not FK-blocked.
-- All statements are idempotent (a second run matches zero rows).

-- ── 1. Rename "43" → "43 Grade" ──────────────────────────────────────────────
UPDATE materials
SET name = '43 Grade'
WHERE id = '6cd89738-bfca-4e59-a96c-96291cd9e946'
  AND name = '43';

-- ── 2. Merge duplicate Chettinad brand (22271489 → 76eecfa0) ──────────────────
DO $$
DECLARE
  dup  uuid := '22271489-5dee-469a-93df-364e5c9ffac1';  -- duplicate (remove)
  keep uuid := '76eecfa0-96b5-412d-a718-b9fee274368f';  -- canonical (keep)
BEGIN
  -- Re-point every brand_id reference. No-op UPDATEs (zero matching rows) are
  -- harmless; listed for completeness/future-proofing. material_brand_variant_links
  -- is intentionally excluded — it has no rows for the duplicate, and its
  -- (brand_id, variant_id) uniqueness makes a blind re-point risky.
  UPDATE batch_usage_records             SET brand_id = keep WHERE brand_id = dup;
  UPDATE daily_material_usage            SET brand_id = keep WHERE brand_id = dup;
  UPDATE delivery_items                  SET brand_id = keep WHERE brand_id = dup;
  UPDATE purchase_order_items            SET brand_id = keep WHERE brand_id = dup;
  UPDATE material_request_items          SET brand_id = keep WHERE brand_id = dup;
  UPDATE material_purchase_expense_items SET brand_id = keep WHERE brand_id = dup;
  UPDATE price_history                   SET brand_id = keep WHERE brand_id = dup;
  UPDATE price_alerts                    SET brand_id = keep WHERE brand_id = dup;
  UPDATE company_vendor_prices           SET brand_id = keep WHERE brand_id = dup;
  UPDATE material_vendors                SET brand_id = keep WHERE brand_id = dup;
  UPDATE stock_inventory                 SET brand_id = keep WHERE brand_id = dup;
  UPDATE stock_transfer_items            SET brand_id = keep WHERE brand_id = dup;
  UPDATE vendor_inventory                SET brand_id = keep WHERE brand_id = dup;
  UPDATE group_stock_inventory           SET brand_id = keep WHERE brand_id = dup;
  UPDATE group_stock_transactions        SET brand_id = keep WHERE brand_id = dup;
  UPDATE inter_site_settlement_items     SET brand_id = keep WHERE brand_id = dup;
  UPDATE tmt_weight_history              SET brand_id = keep WHERE brand_id = dup;

  -- Remove the now-orphaned duplicate brand.
  DELETE FROM material_brands WHERE id = dup;
END $$;
