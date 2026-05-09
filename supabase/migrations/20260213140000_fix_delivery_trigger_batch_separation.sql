-- Fix: Delivery trigger merges group stock batches into a single stock_inventory row.
-- Root cause: The trigger finds existing stock by (site_id, location_id, material_id, brand_id)
-- without checking batch_code. When multiple Group POs for the same material deliver to
-- the same site, they UPDATE the existing row instead of creating separate rows.
--
-- Fix: Look up batch_code from material_purchase_expenses. If present (group stock),
-- always INSERT a new stock_inventory row. Otherwise, use existing upsert logic.

-- Part 1: Fix the trigger
CREATE OR REPLACE FUNCTION public.update_stock_on_verified_delivery()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_site_id UUID;
  v_location_id UUID;
  v_delivery_date DATE;
  v_verification_status TEXT;
  v_requires_verification BOOLEAN;
  v_inv_id UUID;
  v_pricing_mode TEXT;
  v_item_weight NUMERIC;
  v_existing_pricing_mode TEXT;
  v_existing_weight NUMERIC;
  v_batch_code TEXT;
  v_po_id UUID;
BEGIN
  -- Get delivery details
  SELECT d.site_id, d.location_id, d.delivery_date, d.verification_status, d.requires_verification
  INTO v_site_id, v_location_id, v_delivery_date, v_verification_status, v_requires_verification
  FROM deliveries d
  WHERE d.id = NEW.delivery_id;

  -- Only update stock if verified OR doesn't require verification
  IF v_verification_status != 'verified' AND v_requires_verification = TRUE THEN
    RETURN NEW;
  END IF;

  -- Get pricing_mode and weight from PO item if available
  IF NEW.po_item_id IS NOT NULL THEN
    SELECT
      COALESCE(poi.pricing_mode, 'per_piece'),
      COALESCE(poi.actual_weight, poi.calculated_weight),
      poi.purchase_order_id
    INTO v_pricing_mode, v_item_weight, v_po_id
    FROM purchase_order_items poi
    WHERE poi.id = NEW.po_item_id;
  ELSE
    v_pricing_mode := 'per_piece';
    v_item_weight := NULL;
    v_po_id := NULL;
  END IF;

  -- Look up batch_code from material_purchase_expenses if this is a group PO delivery
  v_batch_code := NULL;
  IF v_po_id IS NOT NULL THEN
    SELECT mpe.ref_code INTO v_batch_code
    FROM material_purchase_expenses mpe
    WHERE mpe.purchase_order_id = v_po_id
      AND mpe.purchase_type = 'group_stock'
    LIMIT 1;
  END IF;

  IF v_batch_code IS NOT NULL THEN
    -- Group stock: ALWAYS create a separate stock_inventory row per batch.
    -- This prevents multiple Group PO deliveries for the same material from
    -- merging into a single row. Each batch must stay separate for FIFO
    -- allocation and settlement tracking.
    INSERT INTO stock_inventory (
      site_id, location_id, material_id, brand_id,
      current_qty, avg_unit_cost, last_received_date,
      pricing_mode, total_weight, batch_code
    ) VALUES (
      v_site_id, v_location_id, NEW.material_id, NEW.brand_id,
      COALESCE(NEW.accepted_qty, NEW.received_qty),
      COALESCE(NEW.unit_price, 0),
      v_delivery_date,
      v_pricing_mode,
      v_item_weight,
      v_batch_code
    )
    RETURNING id INTO v_inv_id;
  ELSE
    -- Non-group stock: existing upsert logic (find by site+material+brand, update or insert)
    SELECT id, pricing_mode, total_weight
    INTO v_inv_id, v_existing_pricing_mode, v_existing_weight
    FROM stock_inventory
    WHERE site_id = v_site_id
      AND (location_id = v_location_id OR (location_id IS NULL AND v_location_id IS NULL))
      AND material_id = NEW.material_id
      AND (brand_id = NEW.brand_id OR (brand_id IS NULL AND NEW.brand_id IS NULL));

    IF v_inv_id IS NULL THEN
      -- Create new inventory record with pricing fields
      INSERT INTO stock_inventory (
        site_id, location_id, material_id, brand_id,
        current_qty, avg_unit_cost, last_received_date,
        pricing_mode, total_weight
      ) VALUES (
        v_site_id, v_location_id, NEW.material_id, NEW.brand_id,
        COALESCE(NEW.accepted_qty, NEW.received_qty),
        COALESCE(NEW.unit_price, 0),
        v_delivery_date,
        v_pricing_mode,
        v_item_weight
      )
      RETURNING id INTO v_inv_id;
    ELSE
      -- Update existing inventory with weighted average cost
      UPDATE stock_inventory
      SET
        current_qty = current_qty + COALESCE(NEW.accepted_qty, NEW.received_qty),
        avg_unit_cost = CASE
          WHEN current_qty + COALESCE(NEW.accepted_qty, NEW.received_qty) > 0 THEN
            ((current_qty * COALESCE(avg_unit_cost, 0)) +
             (COALESCE(NEW.accepted_qty, NEW.received_qty) * COALESCE(NEW.unit_price, 0)))
            / (current_qty + COALESCE(NEW.accepted_qty, NEW.received_qty))
          ELSE 0
        END,
        last_received_date = v_delivery_date,
        updated_at = NOW(),
        pricing_mode = CASE
          WHEN v_pricing_mode = 'per_kg' OR v_existing_pricing_mode = 'per_kg' THEN 'per_kg'
          ELSE 'per_piece'
        END,
        total_weight = CASE
          WHEN v_pricing_mode = 'per_kg' OR v_existing_pricing_mode = 'per_kg' THEN
            COALESCE(v_existing_weight, 0) + COALESCE(v_item_weight, 0)
          ELSE NULL
        END
      WHERE id = v_inv_id;
    END IF;
  END IF;

  -- Create stock transaction
  INSERT INTO stock_transactions (
    site_id, inventory_id, transaction_type, transaction_date,
    quantity, unit_cost, total_cost, reference_type, reference_id
  ) VALUES (
    v_site_id, v_inv_id, 'purchase', v_delivery_date,
    COALESCE(NEW.accepted_qty, NEW.received_qty),
    NEW.unit_price,
    COALESCE(NEW.accepted_qty, NEW.received_qty) * COALESCE(NEW.unit_price, 0),
    'delivery', NEW.delivery_id
  );

  -- Update PO item received quantity if linked
  IF NEW.po_item_id IS NOT NULL THEN
    UPDATE purchase_order_items
    SET received_qty = received_qty + COALESCE(NEW.accepted_qty, NEW.received_qty)
    WHERE id = NEW.po_item_id;
  END IF;

  RETURN NEW;
END;
$function$;


-- Part 2: Fix existing data — split merged MAT-260213-E541 batch
-- Current state: stock_inventory row 99fedf4e has batch_code=MAT-260213-E541 with
-- current_qty=120 (merged from 3 deliveries: E541=30, FBFA=30, FD81=60)
-- Expected: 3 separate rows (30, 30, 60)
--
-- Guarded so a fresh local DB (without the referenced material/brand/site UUIDs)
-- can replay this migration without hitting FK violations. On production all
-- referenced rows exist, so the original behaviour is preserved.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM stock_inventory
    WHERE id = '99fedf4e-6cb3-472f-9ea3-83b106727ddf'
      AND batch_code = 'MAT-260213-E541'
  ) AND EXISTS (
    SELECT 1 FROM material_brands WHERE id = '76eecfa0-96b5-412d-a718-b9fee274368f'
  ) THEN
    -- Step 2a: Reduce E541 from 120 to its correct 30 bags, fix last_received_date
    UPDATE stock_inventory
    SET current_qty = 30,
        last_received_date = '2025-12-17',
        updated_at = NOW()
    WHERE id = '99fedf4e-6cb3-472f-9ea3-83b106727ddf'
      AND batch_code = 'MAT-260213-E541';

    -- Step 2b: Insert MAT-260213-FBFA (30 bags, PO dated 2026-01-22)
    INSERT INTO stock_inventory (
      site_id, location_id, material_id, brand_id,
      current_qty, avg_unit_cost, last_received_date,
      pricing_mode, total_weight, batch_code
    ) VALUES (
      '79bfcfb3-4b0d-4240-8fce-d1ab584ef972', NULL,
      'e03e4bf1-17de-4070-8f4d-262b83d0843d',
      '76eecfa0-96b5-412d-a718-b9fee274368f',
      30, 280.00, '2026-01-22',
      'per_piece', NULL, 'MAT-260213-FBFA'
    );

    -- Step 2c: Insert MAT-260213-FD81 (60 bags, PO dated 2026-02-07)
    INSERT INTO stock_inventory (
      site_id, location_id, material_id, brand_id,
      current_qty, avg_unit_cost, last_received_date,
      pricing_mode, total_weight, batch_code
    ) VALUES (
      '79bfcfb3-4b0d-4240-8fce-d1ab584ef972', NULL,
      'e03e4bf1-17de-4070-8f4d-262b83d0843d',
      '76eecfa0-96b5-412d-a718-b9fee274368f',
      60, 280.00, '2026-02-07',
      'per_piece', NULL, 'MAT-260213-FD81'
    );
  END IF;
END $$;
