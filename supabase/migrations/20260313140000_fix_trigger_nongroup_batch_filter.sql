-- Fix: Non-group stock path in delivery trigger can accidentally merge with batch-coded rows.
-- Root cause: The non-group SELECT at lines 85-91 of the previous trigger version searches
-- by (site_id, location_id, material_id, brand_id) without filtering batch_code IS NULL.
-- This means it can find and UPDATE a row that already has a batch_code from a group PO,
-- effectively merging non-group deliveries into group stock batches.
--
-- Fix: Add "AND batch_code IS NULL" to the non-group path's SELECT query.

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
    -- FIX: Added "AND batch_code IS NULL" to prevent accidentally merging with batch-coded
    -- group stock rows when this is a non-group delivery.
    SELECT id, pricing_mode, total_weight
    INTO v_inv_id, v_existing_pricing_mode, v_existing_weight
    FROM stock_inventory
    WHERE site_id = v_site_id
      AND (location_id = v_location_id OR (location_id IS NULL AND v_location_id IS NULL))
      AND material_id = NEW.material_id
      AND (brand_id = NEW.brand_id OR (brand_id IS NULL AND NEW.brand_id IS NULL))
      AND batch_code IS NULL
    LIMIT 1;

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


-- ============================================================================
-- Data Repair: Fix Padmavathy Apartments Mukkal (0.9) Jalli batch merging
-- ============================================================================
-- Current state:
--   Site ff893992 (Padmavathy): stock 9c6c0e46 has batch_code=MAT-260303-413E, current_qty=6
--     (PO 5fba9259 was double-delivered: 2 GRNs of 3 CFT each merged into one stock row)
--   Site 79bfcfb3 (Srinivasan): NO stock_inventory row for batch MAT-260303-A895
--     (PO ea6c731f delivery verified but stock never created)
--
-- Expected state:
--   Site ff893992: MAT-260303-413E should have current_qty=3 (single PO's delivery)
--   Site 79bfcfb3: MAT-260303-A895 should have current_qty=3 (Srinivasan PO's delivery)

-- Step 1: Reduce MAT-260303-413E from 6 to 3 CFT (correct the double-delivery merge)
UPDATE stock_inventory
SET current_qty = 3,
    avg_unit_cost = 3800.00,
    updated_at = NOW()
WHERE id = '9c6c0e46-b462-470a-84e0-5e3675732af8'
  AND batch_code = 'MAT-260303-413E'
  AND current_qty = 6;

-- Step 2: Create missing stock for Srinivasan site batch MAT-260303-A895
-- (Idempotent: skip if already exists from earlier REST API fix)
INSERT INTO stock_inventory (
  site_id, location_id, material_id, brand_id,
  current_qty, avg_unit_cost, last_received_date,
  pricing_mode, total_weight, batch_code
) VALUES (
  '79bfcfb3-4b0d-4240-8fce-d1ab584ef972', NULL,
  '352040f8-dea3-4c61-a147-b916927466a8', NULL,
  3, 3800.00, '2025-11-21',
  'per_piece', NULL, 'MAT-260303-A895'
) ON CONFLICT (site_id, location_id, material_id, brand_id, batch_code) DO NOTHING;

-- Step 3: Create stock_transaction for the Srinivasan delivery so it's properly tracked
INSERT INTO stock_transactions (
  site_id, inventory_id, transaction_type, transaction_date,
  quantity, unit_cost, total_cost, reference_type, reference_id
)
SELECT
  '79bfcfb3-4b0d-4240-8fce-d1ab584ef972',
  si.id,
  'purchase',
  '2025-11-21',
  3,
  3800.00,
  11400.00,
  'delivery',
  '3e1c35d5-d8c0-44d6-ab70-d18683e5a270'
FROM stock_inventory si
WHERE si.batch_code = 'MAT-260303-A895'
  AND si.site_id = '79bfcfb3-4b0d-4240-8fce-d1ab584ef972'
LIMIT 1;

-- Step 4: Fix PO item received_qty (was 12, should be 6 from 2 actual deliveries)
UPDATE purchase_order_items
SET received_qty = 6
WHERE id = '8938f426-cf1f-44ba-a736-cccf3caede24'
  AND received_qty = 12;
