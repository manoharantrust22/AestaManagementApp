-- Fix: group-stock deliveries fail on the 2nd+ installment.
--
-- `update_stock_on_verified_delivery` (AFTER INSERT on delivery_items) had a
-- group-stock branch that ALWAYS inserted a fresh stock_inventory row per
-- delivery. stock_inventory has a UNIQUE NULLS NOT DISTINCT
-- (site_id, location_id, material_id, brand_id, batch_code) constraint, so the
-- first installment of a batch inserts fine, but the SECOND installment
-- delivered to the same site collides on that key. The delivery_items insert
-- aborts — yet the parent `deliveries` row was already committed in a separate
-- statement, leaving an orphaned 0-item "phantom" GRN. Every retry made another.
--
-- This broke every advance/group PO delivered in more than one installment to
-- the same site (the whole point of an advance PO). Fix: make the group branch
-- UPSERT — find the existing per-batch row at this site and ADD to it, else
-- create it — mirroring the non-group branch but keyed on the full unique tuple
-- (including batch_code). Nothing else in the function changes.

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
      poi.po_id
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
    -- Group stock: ONE stock_inventory row per (site, material, brand, batch).
    -- An advance PO is delivered in installments that all share this batch_code,
    -- so find the existing batch row at this site and ADD to it; only create the
    -- row on the first installment. (Was an unconditional INSERT -> dup-key on
    -- the 2nd installment, which orphaned the delivery as a phantom 0-qty GRN.)
    SELECT id, pricing_mode, total_weight
    INTO v_inv_id, v_existing_pricing_mode, v_existing_weight
    FROM stock_inventory
    WHERE site_id = v_site_id
      AND (location_id = v_location_id OR (location_id IS NULL AND v_location_id IS NULL))
      AND material_id = NEW.material_id
      AND (brand_id = NEW.brand_id OR (brand_id IS NULL AND NEW.brand_id IS NULL))
      AND batch_code = v_batch_code
    LIMIT 1;

    IF v_inv_id IS NULL THEN
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
  ELSE
    -- Non-group stock: existing upsert logic
    -- FIX: "AND batch_code IS NULL" prevents merging with batch-coded group stock rows
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
