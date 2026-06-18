-- Fix: delivery recording failed with
--   "invalid input value for enum stock_transaction_type: 'received'"
--
-- The stock_transaction_type enum has NO 'received' value (valid: purchase, usage,
-- transfer_in, transfer_out, adjustment, return, wastage, initial). The TMT two-stage
-- pricing ship (20260618140100_stock_prefer_delivery_weight) rewrote this trigger
-- function on top of the stale Feb-4 base (20260204150000_add_inventory_pricing_fields),
-- which inserted transaction_type='received' + reference_type='delivery_item'/NEW.id.
-- That regressed the correct body that was live May–June (canonical:
-- 20260317100000_fix_unverified_deliveries_add_stock), so every delivery recorded after
-- the ship failed at the delivery_items INSERT.
--
-- ─── INVARIANT — DO NOT CHANGE WHEN REWRITING THIS FUNCTION ───────────────────────────
-- The stock_transactions row written by the delivery path MUST be:
--     transaction_type = 'purchase'   (a valid stock_transaction_type enum value)
--     reference_type    = 'delivery'
--     reference_id      = the delivery id (NEW.delivery_id), NOT the delivery_item id
-- These exact values are depended on by:
--   • reverse_stock_on_delivery_item_delete() — only reverses stock when it finds a
--     ('purchase','delivery',delivery_id) row; a different shape silently skips reversal.
--   • fn_stock_delivery_items() — verify-time safety net, same idempotency guard.
--   • reverse_delivery() — deletes the ('purchase','delivery') rows on reversal.
-- If you rewrite this body (e.g. for pricing/weight changes), copy the CURRENT live body
-- and keep the final INSERT below — never copy an older migration's body.
-- ──────────────────────────────────────────────────────────────────────────────────────
--
-- This re-applies the current (weight-preferring) body verbatim and only corrects the
-- final stock_transactions INSERT back to the canonical values.

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

  -- Create stock transaction.
  -- INVARIANT (see header): transaction_type='purchase', reference_type='delivery',
  -- reference_id=NEW.delivery_id. Required by reverse_stock_on_delivery_item_delete,
  -- fn_stock_delivery_items, and reverse_delivery.
  INSERT INTO stock_transactions (
    site_id, inventory_id, transaction_type, transaction_date,
    quantity, unit_cost, total_cost, reference_type, reference_id
  ) VALUES (
    v_site_id, v_inv_id, 'purchase', v_delivery_date,
    COALESCE(NEW.accepted_qty, NEW.received_qty),
    COALESCE(NEW.unit_price, 0),
    COALESCE(NEW.accepted_qty, NEW.received_qty) * COALESCE(NEW.unit_price, 0),
    'delivery', NEW.delivery_id
  );

  RETURN NEW;
END;
$function$;
