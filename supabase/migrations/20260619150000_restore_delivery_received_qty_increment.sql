-- Fix: deliveries created stock but never advanced the PO (card stuck on DELIVER) and
-- the over-receipt guard never fired, so re-clicking produced duplicate GRNs + phantom
-- stock (one 100-pc Jaalli delivery became 13 GRNs / 1300 pcs on prod).
--
-- ROOT CAUSE: the TMT two-stage-pricing ship (20260618140100_stock_prefer_delivery_weight)
-- rewrote update_stock_on_verified_delivery() from the STALE Feb-4 base
-- (20260204150000_add_inventory_pricing_fields). That base lacked BOTH the correct enum
-- (fixed separately in 20260619140000_fix_delivery_stock_transaction_type) AND the
-- purchase_order_items.received_qty increment that the real pre-ship body had
-- (20260613150000_fix_group_delivery_stock_upsert, lines 192-197). The enum fix restored
-- only the enum, so received_qty stayed 0 forever:
--   • the mutation's PO-status step + over-receipt guard both read received_qty → PO never
--     flips to 'delivered', the Hub card never advances, no expense is created, and every
--     retry writes another full delivery (pending = ordered - 0 = ordered, never exceeded).
--
-- FIX: re-add the received_qty increment to the CURRENT live body (which already has the
-- enum invariant + the TMT pricing_mode/actual_weight logic). Body is copied from the live
-- prod definition — NOT from any older migration (copying an old body is what caused this).
--
-- NO DOUBLE-COUNT: the top guard returns early for requires_verification=true (the legacy
-- record-then-verify path, where fn_stock_delivery_items increments received_qty at
-- verify-time behind an idempotency guard). This increment only runs on the
-- record-and-verify / no-verification path — exactly the path that is currently missing it.
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
-- and keep the final INSERT + the received_qty increment below — never copy an older body.
-- ──────────────────────────────────────────────────────────────────────────────────────

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

  -- Bump the PO line's received qty. The record-and-verify mutation, the over-receipt
  -- guard, and the PO-status advance ALL read purchase_order_items.received_qty, so this
  -- increment is what flips the PO to delivered/partial and blocks duplicate GRNs.
  -- Dropped by 20260618140100 (stale base); restored from 20260613150000 (lines 192-197).
  IF NEW.po_item_id IS NOT NULL THEN
    UPDATE purchase_order_items
    SET received_qty = received_qty + COALESCE(NEW.accepted_qty, NEW.received_qty)
    WHERE id = NEW.po_item_id;
  END IF;

  RETURN NEW;
END;
$function$;
