-- Fix: Delivered POs were not adding stock to inventory because
-- requires_verification was TRUE and verification_status was 'pending'.
-- The trigger update_stock_on_verified_delivery skips stock creation
-- when verification is pending, causing inventory to show less than
-- what was actually delivered.
--
-- This migration:
-- 1. Marks all pending-verification delivered deliveries as verified
-- 2. Creates missing stock_inventory rows for delivery items that never got stock
-- 3. Creates corresponding stock_transactions

-- Step 1: Update all unverified deliveries to verified
UPDATE deliveries
SET
  verification_status = 'verified',
  requires_verification = false,
  updated_at = NOW()
WHERE delivery_status = 'delivered'
  AND (verification_status = 'pending' OR verification_status IS NULL)
  AND requires_verification = true;

-- Step 2: Create missing stock for delivery items that have no corresponding stock_transactions
-- (meaning the trigger skipped them because verification was pending)
DO $$
DECLARE
  rec RECORD;
  v_inv_id UUID;
  v_batch_code TEXT;
  v_po_id UUID;
BEGIN
  -- Find all delivery items from delivered+verified deliveries that have no stock_transaction
  FOR rec IN
    SELECT
      di.id AS delivery_item_id,
      di.delivery_id,
      di.material_id,
      di.brand_id,
      di.received_qty,
      di.accepted_qty,
      di.unit_price,
      di.po_item_id,
      d.site_id,
      d.location_id,
      d.delivery_date,
      d.po_id
    FROM delivery_items di
    JOIN deliveries d ON d.id = di.delivery_id
    WHERE d.delivery_status = 'delivered'
      AND d.verification_status = 'verified'
      AND NOT EXISTS (
        SELECT 1 FROM stock_transactions st
        WHERE st.reference_id = di.delivery_id
          AND st.reference_type = 'delivery'
          AND st.site_id = d.site_id
      )
  LOOP
    -- Get batch_code for group stock POs
    v_batch_code := NULL;
    v_po_id := rec.po_id;

    IF v_po_id IS NOT NULL THEN
      SELECT mpe.ref_code INTO v_batch_code
      FROM material_purchase_expenses mpe
      WHERE mpe.purchase_order_id = v_po_id
        AND mpe.purchase_type = 'group_stock'
      LIMIT 1;
    END IF;

    IF v_batch_code IS NOT NULL THEN
      -- Group stock: always create separate row per batch
      INSERT INTO stock_inventory (
        site_id, location_id, material_id, brand_id,
        current_qty, avg_unit_cost, last_received_date, batch_code
      ) VALUES (
        rec.site_id, rec.location_id, rec.material_id, rec.brand_id,
        COALESCE(rec.accepted_qty, rec.received_qty),
        COALESCE(rec.unit_price, 0),
        rec.delivery_date,
        v_batch_code
      )
      RETURNING id INTO v_inv_id;
    ELSE
      -- Non-group stock: upsert (merge with existing row)
      SELECT id INTO v_inv_id
      FROM stock_inventory
      WHERE site_id = rec.site_id
        AND (location_id = rec.location_id OR (location_id IS NULL AND rec.location_id IS NULL))
        AND material_id = rec.material_id
        AND (brand_id = rec.brand_id OR (brand_id IS NULL AND rec.brand_id IS NULL))
        AND batch_code IS NULL
      LIMIT 1;

      IF v_inv_id IS NULL THEN
        INSERT INTO stock_inventory (
          site_id, location_id, material_id, brand_id,
          current_qty, avg_unit_cost, last_received_date
        ) VALUES (
          rec.site_id, rec.location_id, rec.material_id, rec.brand_id,
          COALESCE(rec.accepted_qty, rec.received_qty),
          COALESCE(rec.unit_price, 0),
          rec.delivery_date
        )
        RETURNING id INTO v_inv_id;
      ELSE
        UPDATE stock_inventory
        SET
          current_qty = current_qty + COALESCE(rec.accepted_qty, rec.received_qty),
          avg_unit_cost = CASE
            WHEN current_qty + COALESCE(rec.accepted_qty, rec.received_qty) > 0 THEN
              ((current_qty * COALESCE(avg_unit_cost, 0)) +
               (COALESCE(rec.accepted_qty, rec.received_qty) * COALESCE(rec.unit_price, 0)))
              / (current_qty + COALESCE(rec.accepted_qty, rec.received_qty))
            ELSE 0
          END,
          last_received_date = rec.delivery_date,
          updated_at = NOW()
        WHERE id = v_inv_id;
      END IF;
    END IF;

    -- Create stock transaction record
    INSERT INTO stock_transactions (
      site_id, inventory_id, transaction_type, transaction_date,
      quantity, unit_cost, total_cost, reference_type, reference_id
    ) VALUES (
      rec.site_id, v_inv_id, 'purchase', rec.delivery_date,
      COALESCE(rec.accepted_qty, rec.received_qty),
      rec.unit_price,
      COALESCE(rec.accepted_qty, rec.received_qty) * COALESCE(rec.unit_price, 0),
      'delivery', rec.delivery_id
    );

    -- Update PO item received quantity if linked
    IF rec.po_item_id IS NOT NULL THEN
      UPDATE purchase_order_items
      SET received_qty = received_qty + COALESCE(rec.accepted_qty, rec.received_qty)
      WHERE id = rec.po_item_id;
    END IF;
  END LOOP;
END $$;
