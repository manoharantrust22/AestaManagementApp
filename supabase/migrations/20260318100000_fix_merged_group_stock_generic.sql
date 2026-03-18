-- Generic fix: Split merged group stock inventory rows.
--
-- Root cause: Before the trigger fix (20260213140000) and constraint fix (20260215170000),
-- multiple group PO deliveries for the same material were merged into a single
-- stock_inventory row. Previous migrations repaired Cement data but missed M Sand
-- and potentially other materials.
--
-- This migration generically finds ALL group stock batch codes that have delivered POs
-- but no corresponding stock_inventory row, and splits them out from the merged row.

DO $$
DECLARE
  rec RECORD;
  v_merged_inv_id UUID;
  v_new_inv_id UUID;
BEGIN
  -- Find all group stock batches that have a delivered PO + delivery
  -- but NO matching stock_inventory row for that batch_code
  FOR rec IN
    SELECT DISTINCT ON (mpe.ref_code, d.site_id, di.material_id)
      mpe.ref_code AS batch_code,
      mpe.purchase_order_id,
      d.site_id,
      d.location_id,
      d.delivery_date,
      d.id AS delivery_id,
      di.material_id,
      di.brand_id,
      COALESCE(di.accepted_qty, di.received_qty) AS delivered_qty,
      COALESCE(di.unit_price, 0) AS unit_price,
      COALESCE(poi.pricing_mode, 'per_piece') AS pricing_mode,
      COALESCE(poi.actual_weight, poi.calculated_weight) AS item_weight
    FROM material_purchase_expenses mpe
    JOIN purchase_orders po ON po.id = mpe.purchase_order_id
    JOIN deliveries d ON d.po_id = po.id AND d.delivery_status = 'delivered'
    JOIN delivery_items di ON di.delivery_id = d.id
    LEFT JOIN purchase_order_items poi ON poi.id = di.po_item_id
    WHERE mpe.purchase_type = 'group_stock'
      -- No stock_inventory row exists for this batch_code + site + material
      AND NOT EXISTS (
        SELECT 1 FROM stock_inventory si
        WHERE si.batch_code = mpe.ref_code
          AND si.site_id = d.site_id
          AND si.material_id = di.material_id
      )
      -- Delivery item has a positive quantity
      AND COALESCE(di.accepted_qty, di.received_qty) > 0
    ORDER BY mpe.ref_code, d.site_id, di.material_id, d.delivery_date
  LOOP
    -- Find the merged stock_inventory row that absorbed this delivery.
    -- It's the same site+material+brand with a different batch_code (group stock).
    SELECT id INTO v_merged_inv_id
    FROM stock_inventory
    WHERE site_id = rec.site_id
      AND material_id = rec.material_id
      AND (brand_id = rec.brand_id OR (brand_id IS NULL AND rec.brand_id IS NULL))
      AND batch_code IS NOT NULL
      AND batch_code != rec.batch_code
      AND current_qty >= rec.delivered_qty  -- Must have enough qty to split off
    ORDER BY current_qty DESC
    LIMIT 1;

    IF v_merged_inv_id IS NOT NULL THEN
      -- Subtract the delivered qty from the merged row
      UPDATE stock_inventory
      SET current_qty = current_qty - rec.delivered_qty,
          updated_at = NOW()
      WHERE id = v_merged_inv_id;

      -- Insert new stock_inventory row for the correct batch
      INSERT INTO stock_inventory (
        site_id, location_id, material_id, brand_id,
        current_qty, avg_unit_cost, last_received_date,
        pricing_mode, total_weight, batch_code
      ) VALUES (
        rec.site_id, rec.location_id, rec.material_id, rec.brand_id,
        rec.delivered_qty, rec.unit_price, rec.delivery_date,
        rec.pricing_mode, rec.item_weight, rec.batch_code
      )
      RETURNING id INTO v_new_inv_id;

      -- Create stock_transaction for audit trail (if not already exists)
      INSERT INTO stock_transactions (
        site_id, inventory_id, transaction_type, transaction_date,
        quantity, unit_cost, total_cost, reference_type, reference_id
      )
      SELECT
        rec.site_id, v_new_inv_id, 'purchase', rec.delivery_date,
        rec.delivered_qty, rec.unit_price,
        rec.delivered_qty * rec.unit_price,
        'delivery', rec.delivery_id
      WHERE NOT EXISTS (
        SELECT 1 FROM stock_transactions st
        WHERE st.reference_id = rec.delivery_id
          AND st.reference_type = 'delivery'
          AND st.inventory_id = v_new_inv_id
      );

      RAISE NOTICE 'Split batch % from merged row % -> new row % (% units)',
        rec.batch_code, v_merged_inv_id, v_new_inv_id, rec.delivered_qty;
    ELSE
      -- No merged row with enough qty to split from.
      -- The delivery was confirmed (delivery_status='delivered', accepted_qty > 0)
      -- but stock was never recorded due to the old trigger bug.
      -- Insert the missing batch directly — the delivery confirmation is the source of truth.
      INSERT INTO stock_inventory (
        site_id, location_id, material_id, brand_id,
        current_qty, avg_unit_cost, last_received_date,
        pricing_mode, total_weight, batch_code
      ) VALUES (
        rec.site_id, rec.location_id, rec.material_id, rec.brand_id,
        rec.delivered_qty, rec.unit_price, rec.delivery_date,
        rec.pricing_mode, rec.item_weight, rec.batch_code
      )
      RETURNING id INTO v_new_inv_id;

      -- Create stock_transaction for audit trail
      INSERT INTO stock_transactions (
        site_id, inventory_id, transaction_type, transaction_date,
        quantity, unit_cost, total_cost, reference_type, reference_id
      )
      SELECT
        rec.site_id, v_new_inv_id, 'purchase', rec.delivery_date,
        rec.delivered_qty, rec.unit_price,
        rec.delivered_qty * rec.unit_price,
        'delivery', rec.delivery_id
      WHERE NOT EXISTS (
        SELECT 1 FROM stock_transactions st
        WHERE st.reference_id = rec.delivery_id
          AND st.reference_type = 'delivery'
          AND st.inventory_id = v_new_inv_id
      );

      RAISE NOTICE 'INSERTED missing batch % directly (no merged row to split from) -> new row % (% units)',
        rec.batch_code, v_new_inv_id, rec.delivered_qty;
    END IF;
  END LOOP;
END $$;
