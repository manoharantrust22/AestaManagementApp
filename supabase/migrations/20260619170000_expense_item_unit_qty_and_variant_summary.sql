-- Fix: the "BY VARIANT" breakdown on the Material Hub printed KILOGRAMS labeled
-- "piece" for per-kg (TMT) group batches.
--
-- ROOT CAUSE: per-kg expense lines store quantity = delivered KG and
-- unit_price = rate/kg, so the GENERATED total_price (= quantity × unit_price)
-- is correct money. But get_batch_variant_summary returns mpei.quantity AS
-- original_qty, and the material's unit is "piece" → the UI shows e.g.
-- "102.2 left · 102.2 piece" instead of the 14 pieces actually ordered.
-- The piece count cannot be derived from kg: materials.weight_per_unit is
-- kg-per-METER, and the actual per-piece weight varies bill to bill. The piece
-- count is only known at delivery time, so it must be STORED, not computed.
--
-- FIX:
--   1) Add material_purchase_expense_items.quantity_in_unit — the quantity in the
--      material's stocking unit (pieces / bags). For per_piece lines it equals
--      `quantity`; for per_kg lines `quantity` holds KG and this holds PIECES.
--      Additive + nullable; the money column total_price is untouched.
--   2) Re-issue get_batch_variant_summary to return COALESCE(quantity_in_unit,
--      quantity) for original_qty and remaining_qty. used_qty stays sourced from
--      batch_usage_records (logged in pieces) → original/used/remaining are now
--      all in the same unit (pieces), removing a latent unit mismatch too.

-- 1) Additive column ---------------------------------------------------------
ALTER TABLE material_purchase_expense_items
  ADD COLUMN IF NOT EXISTS quantity_in_unit NUMERIC(12,3);

COMMENT ON COLUMN material_purchase_expense_items.quantity_in_unit IS
'Quantity in the material''s stocking unit (pieces/bags). For per_piece lines this
equals quantity; for per_kg lines quantity holds KG (so total_price = kg × rate/kg
stays correct) and this holds the piece count. NULL for legacy rows → readers use
COALESCE(quantity_in_unit, quantity).';

-- 2) Re-issue the per-variant summary to prefer quantity_in_unit -------------
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
    -- Prefer the stocking-unit qty (pieces); fall back to quantity for legacy
    -- rows. For per_kg lines quantity is KG, so COALESCE keeps the display in
    -- pieces once quantity_in_unit is populated (forward + backfilled).
    COALESCE(mpei.quantity_in_unit, mpei.quantity) AS original_qty,
    COALESCE(bur_agg.used_qty, 0) AS used_qty,
    COALESCE(mpei.quantity_in_unit, mpei.quantity) - COALESCE(bur_agg.used_qty, 0) AS remaining_qty
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
batch. original/remaining use COALESCE(quantity_in_unit, quantity) so per_kg
(TMT) batches report PIECES, not the KG stored in quantity. used_qty is summed
from batch_usage_records filtered by material+brand (also in pieces).';
