-- TMT two-stage pricing — Phase 1b: stock functions prefer the DELIVERY-LINE weight.
--
-- Both stock functions previously read pricing_mode + weight from the PO item
-- (purchase_order_items.actual_weight / calculated_weight). That weight is the
-- whole-PO estimate, so on partial deliveries stock_inventory.total_weight
-- over-counted, and it never reflected the bill's actual delivered weight.
--
-- FIX: prefer the delivery_item's own pricing_mode / actual_weight (the bill
-- actual for THIS installment); fall back to the PO item only when the delivery
-- line has no weight (legacy deliveries written before delivery-time capture).
-- This makes per-installment accumulation correct AND uses real delivered weight.
-- Full CREATE OR REPLACE of each body (Postgres has no partial replace); the
-- triggers stay bound to these function names.

-- ── 1. AFTER INSERT on delivery_items (the normal live path) ──────────────────
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

  -- Prefer the delivery line's own pricing/weight (the bill actual for THIS
  -- installment); fall back to the PO item for legacy rows with no line weight.
  v_pricing_mode := COALESCE(NEW.pricing_mode, 'per_piece');
  v_item_weight  := NEW.actual_weight;

  IF (NEW.pricing_mode IS NULL OR NEW.actual_weight IS NULL) AND NEW.po_item_id IS NOT NULL THEN
    SELECT
      COALESCE(NEW.pricing_mode, poi.pricing_mode, 'per_piece'),
      COALESCE(NEW.actual_weight, poi.actual_weight, poi.calculated_weight)
    INTO v_pricing_mode, v_item_weight
    FROM purchase_order_items poi
    WHERE poi.id = NEW.po_item_id;
  END IF;

  -- Find or create stock inventory record
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
    -- Also update pricing_mode (prefer per_kg if any item is per_kg) and accumulate weight
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
      -- Set pricing_mode to per_kg if this item is per_kg (or keep existing if already per_kg)
      pricing_mode = CASE
        WHEN v_pricing_mode = 'per_kg' OR v_existing_pricing_mode = 'per_kg' THEN 'per_kg'
        ELSE 'per_piece'
      END,
      -- Accumulate total weight for per_kg items (this installment's weight)
      total_weight = CASE
        WHEN v_pricing_mode = 'per_kg' OR v_existing_pricing_mode = 'per_kg' THEN
          COALESCE(v_existing_weight, 0) + COALESCE(v_item_weight, 0)
        ELSE NULL
      END
    WHERE id = v_inv_id;
  END IF;

  -- Create stock transaction
  INSERT INTO stock_transactions (
    site_id, inventory_id, transaction_type, transaction_date,
    quantity, unit_cost, total_cost, reference_type, reference_id
  ) VALUES (
    v_site_id, v_inv_id, 'received', v_delivery_date,
    COALESCE(NEW.accepted_qty, NEW.received_qty),
    COALESCE(NEW.unit_price, 0),
    COALESCE(NEW.accepted_qty, NEW.received_qty) * COALESCE(NEW.unit_price, 0),
    'delivery_item', NEW.id
  );

  RETURN NEW;
END;
$function$;

-- ── 2. AFTER UPDATE replay (stock-on-verify safety net) ───────────────────────
CREATE OR REPLACE FUNCTION public.fn_stock_delivery_items(p_delivery_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_site_id UUID;
  v_location_id UUID;
  v_delivery_date DATE;
  v_verification_status TEXT;
  v_requires_verification BOOLEAN;
  v_item RECORD;
  v_inv_id UUID;
  v_pricing_mode TEXT;
  v_item_weight NUMERIC;
  v_existing_pricing_mode TEXT;
  v_existing_weight NUMERIC;
  v_batch_code TEXT;
  v_po_id UUID;
  v_qty NUMERIC;
BEGIN
  SELECT d.site_id, d.location_id, d.delivery_date,
         d.verification_status, d.requires_verification
  INTO v_site_id, v_location_id, v_delivery_date,
       v_verification_status, v_requires_verification
  FROM deliveries d
  WHERE d.id = p_delivery_id;

  -- Only stock a delivery that is actually accepted.
  IF NOT (v_verification_status = 'verified' OR v_requires_verification = FALSE) THEN
    RETURN;
  END IF;

  -- Idempotency guard: if ANY purchase transaction already references this
  -- delivery, the normal INSERT path handled it — do nothing.
  IF EXISTS (
    SELECT 1 FROM stock_transactions st
    WHERE st.transaction_type = 'purchase'
      AND st.reference_type = 'delivery'
      AND st.reference_id = p_delivery_id
  ) THEN
    RETURN;
  END IF;

  FOR v_item IN
    SELECT * FROM delivery_items WHERE delivery_id = p_delivery_id
  LOOP
    v_qty := COALESCE(v_item.accepted_qty, v_item.received_qty);

    -- Prefer the delivery line's own pricing/weight; fall back to the PO item.
    -- (po_id is always sourced from the PO item for the batch-code lookup below.)
    v_pricing_mode := COALESCE(v_item.pricing_mode, 'per_piece');
    v_item_weight  := v_item.actual_weight;
    v_po_id := NULL;

    IF v_item.po_item_id IS NOT NULL THEN
      SELECT COALESCE(v_item.pricing_mode, poi.pricing_mode, 'per_piece'),
             COALESCE(v_item.actual_weight, poi.actual_weight, poi.calculated_weight),
             poi.po_id
      INTO v_pricing_mode, v_item_weight, v_po_id
      FROM purchase_order_items poi
      WHERE poi.id = v_item.po_item_id;
    END IF;

    -- Group-stock batch code (so the row separates per batch like the live path).
    v_batch_code := NULL;
    IF v_po_id IS NOT NULL THEN
      SELECT mpe.ref_code INTO v_batch_code
      FROM material_purchase_expenses mpe
      WHERE mpe.purchase_order_id = v_po_id
        AND mpe.purchase_type = 'group_stock'
      LIMIT 1;
    END IF;

    IF v_batch_code IS NOT NULL THEN
      INSERT INTO stock_inventory (
        site_id, location_id, material_id, brand_id,
        current_qty, avg_unit_cost, last_received_date,
        pricing_mode, total_weight, batch_code
      ) VALUES (
        v_site_id, v_location_id, v_item.material_id, v_item.brand_id,
        v_qty, COALESCE(v_item.unit_price, 0), v_delivery_date,
        v_pricing_mode, v_item_weight, v_batch_code
      )
      RETURNING id INTO v_inv_id;
    ELSE
      SELECT id, pricing_mode, total_weight
      INTO v_inv_id, v_existing_pricing_mode, v_existing_weight
      FROM stock_inventory
      WHERE site_id = v_site_id
        AND (location_id = v_location_id OR (location_id IS NULL AND v_location_id IS NULL))
        AND material_id = v_item.material_id
        AND (brand_id = v_item.brand_id OR (brand_id IS NULL AND v_item.brand_id IS NULL))
        AND batch_code IS NULL
      LIMIT 1;

      IF v_inv_id IS NULL THEN
        INSERT INTO stock_inventory (
          site_id, location_id, material_id, brand_id,
          current_qty, avg_unit_cost, last_received_date,
          pricing_mode, total_weight
        ) VALUES (
          v_site_id, v_location_id, v_item.material_id, v_item.brand_id,
          v_qty, COALESCE(v_item.unit_price, 0), v_delivery_date,
          v_pricing_mode, v_item_weight
        )
        RETURNING id INTO v_inv_id;
      ELSE
        UPDATE stock_inventory
        SET current_qty = current_qty + v_qty,
            avg_unit_cost = CASE
              WHEN current_qty + v_qty > 0 THEN
                ((current_qty * COALESCE(avg_unit_cost, 0)) +
                 (v_qty * COALESCE(v_item.unit_price, 0)))
                / (current_qty + v_qty)
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

    INSERT INTO stock_transactions (
      site_id, inventory_id, transaction_type, transaction_date,
      quantity, unit_cost, total_cost, reference_type, reference_id
    ) VALUES (
      v_site_id, v_inv_id, 'purchase', v_delivery_date,
      v_qty, v_item.unit_price, v_qty * COALESCE(v_item.unit_price, 0),
      'delivery', p_delivery_id
    );

    -- Catch up the PO item received qty (the INSERT path bailed before this).
    IF v_item.po_item_id IS NOT NULL THEN
      UPDATE purchase_order_items
      SET received_qty = received_qty + v_qty
      WHERE id = v_item.po_item_id;
    END IF;
  END LOOP;
END;
$function$;
