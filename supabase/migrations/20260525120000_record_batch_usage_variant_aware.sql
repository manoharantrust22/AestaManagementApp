-- =====================================================
-- Variant-aware record_batch_usage
-- =====================================================
-- Replaces 20260120120000 version which silently LIMIT 1'd the variant
-- and mis-attributed every multi-variant batch usage to whichever item
-- happened to come first in the table.
--
-- New signature requires p_material_id (and optional p_brand_id) so the
-- INSERT writes the correct variant, and the qty check is per-variant
-- (not batch-aggregate) so over-deduction on one size is caught.

DROP FUNCTION IF EXISTS record_batch_usage(TEXT, UUID, NUMERIC, DATE, TEXT, UUID);
DROP FUNCTION IF EXISTS record_batch_usage(TEXT, UUID, UUID, UUID, NUMERIC, DATE, TEXT, UUID);

CREATE OR REPLACE FUNCTION record_batch_usage(
  p_batch_ref_code TEXT,
  p_usage_site_id UUID,
  p_material_id UUID,
  p_brand_id UUID,
  p_quantity NUMERIC,
  p_usage_date DATE,
  p_work_description TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_batch RECORD;
  v_variant_item RECORD;
  v_variant_used NUMERIC;
  v_variant_remaining NUMERIC;
  v_is_self_use BOOLEAN;
  v_settlement_status TEXT;
  v_usage_id UUID;
  v_unit_cost NUMERIC;
  v_unit TEXT;
BEGIN
  -- Get batch details
  SELECT mpe.*
  INTO v_batch
  FROM material_purchase_expenses mpe
  WHERE mpe.ref_code = p_batch_ref_code
    AND mpe.purchase_type = 'group_stock';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch not found: %', p_batch_ref_code;
  END IF;

  IF v_batch.status = 'completed' THEN
    RAISE EXCEPTION 'Cannot add usage to completed batch: %', p_batch_ref_code;
  END IF;

  -- Validate variant belongs to this batch & fetch its row + unit
  SELECT mpei.*, m.unit AS material_unit
  INTO v_variant_item
  FROM material_purchase_expense_items mpei
  JOIN materials m ON m.id = mpei.material_id
  WHERE mpei.purchase_expense_id = v_batch.id
    AND mpei.material_id = p_material_id
    AND COALESCE(mpei.brand_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(p_brand_id, '00000000-0000-0000-0000-000000000000'::uuid);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Variant (material=%, brand=%) not in batch %',
      p_material_id, p_brand_id, p_batch_ref_code;
  END IF;

  -- Sum prior usage on the SAME variant (not the whole batch)
  SELECT COALESCE(SUM(bur.quantity), 0)
  INTO v_variant_used
  FROM batch_usage_records bur
  WHERE bur.batch_ref_code = p_batch_ref_code
    AND bur.material_id = p_material_id
    AND COALESCE(bur.brand_id, '00000000-0000-0000-0000-000000000000'::uuid)
        = COALESCE(p_brand_id, '00000000-0000-0000-0000-000000000000'::uuid);

  v_variant_remaining := v_variant_item.quantity - v_variant_used;

  IF v_variant_remaining < p_quantity THEN
    RAISE EXCEPTION 'Insufficient variant qty in batch %. Variant available: %, Requested: %',
      p_batch_ref_code, v_variant_remaining, p_quantity;
  END IF;

  -- Unit cost is per-variant (each item has its own unit_price)
  v_unit_cost := v_variant_item.unit_price;
  v_unit := COALESCE(v_variant_item.material_unit, 'nos');

  -- Determine self-use
  v_is_self_use := (p_usage_site_id = v_batch.paying_site_id);
  v_settlement_status := CASE WHEN v_is_self_use THEN 'self_use' ELSE 'pending' END;

  -- Insert usage record tagged with the correct variant
  INSERT INTO batch_usage_records (
    batch_ref_code,
    site_group_id,
    usage_site_id,
    material_id,
    brand_id,
    quantity,
    unit,
    unit_cost,
    usage_date,
    work_description,
    is_self_use,
    settlement_status,
    created_by
  ) VALUES (
    p_batch_ref_code,
    v_batch.site_group_id,
    p_usage_site_id,
    p_material_id,
    p_brand_id,
    p_quantity,
    v_unit,
    v_unit_cost,
    p_usage_date,
    p_work_description,
    v_is_self_use,
    v_settlement_status,
    p_created_by
  )
  RETURNING id INTO v_usage_id;

  -- Update batch-level aggregates (these remain whole-batch totals)
  UPDATE material_purchase_expenses
  SET
    used_qty = COALESCE(used_qty, 0) + p_quantity,
    remaining_qty = COALESCE(remaining_qty,
      original_qty,
      (SELECT SUM(quantity) FROM material_purchase_expense_items WHERE purchase_expense_id = material_purchase_expenses.id)
    ) - p_quantity,
    self_used_qty = CASE WHEN v_is_self_use THEN COALESCE(self_used_qty, 0) + p_quantity ELSE self_used_qty END,
    self_used_amount = CASE WHEN v_is_self_use THEN COALESCE(self_used_amount, 0) + (p_quantity * v_unit_cost) ELSE self_used_amount END,
    status = CASE
      WHEN COALESCE(remaining_qty, original_qty, 0) - p_quantity <= 0 THEN 'partial_used'
      ELSE status
    END,
    updated_at = now()
  WHERE ref_code = p_batch_ref_code;

  RETURN v_usage_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION record_batch_usage(TEXT, UUID, UUID, UUID, NUMERIC, DATE, TEXT, UUID) IS
'Records per-variant usage against a group-stock batch. Required: p_batch_ref_code,
p_usage_site_id, p_material_id, p_quantity, p_usage_date. p_brand_id may be NULL.
Validates (material_id, brand_id) belongs to the batch and that variant has enough
remaining quantity (variant-scoped, not batch-aggregate). Supersedes the legacy
LIMIT 1 implementation from 20260120120000 which silently mis-attributed variants.';
