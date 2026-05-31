-- Fix: Void & Redo (reverse_delivery RPC) double-reverses stock.
--
-- reverse_delivery() reverses stock precisely in its step 4 (UPDATE stock_inventory by
-- stock_transactions.inventory_id, then DELETE those 'delivery' purchase txns) and THEN,
-- in step 7, deletes delivery_items WHILE the parent delivery row still exists. That fires
-- BEFORE DELETE trigger reverse_stock_on_delivery_item_delete, which reverses the SAME
-- quantity a SECOND time. Masked by GREATEST(0, ...) when the voided delivery is the only
-- stock of that material, but silently over-removes when commingled stock exists.
--
-- Fix: the trigger now stands down when the delivery's 'delivery' purchase stock_transaction
-- no longer exists — i.e., reverse_delivery already handled the reversal in step 4. Direct
-- delivery_items deletes (editing a delivery) keep their txn, so the trigger still reverses
-- exactly once there. Verified via rolled-back tests for both paths.
CREATE OR REPLACE FUNCTION public.reverse_stock_on_delivery_item_delete()
RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE
  v_site_id UUID;
  v_location_id UUID;
  v_delivery_date DATE;
  v_verification_status TEXT;
  v_requires_verification BOOLEAN;
  v_qty_to_remove DECIMAL;
BEGIN
  -- Get delivery details
  SELECT d.site_id, d.location_id, d.delivery_date, d.verification_status, d.requires_verification
  INTO v_site_id, v_location_id, v_delivery_date, v_verification_status, v_requires_verification
  FROM deliveries d
  WHERE d.id = OLD.delivery_id;

  -- Skip if reverse_delivery() already reversed this delivery's stock. It deletes the
  -- 'delivery' purchase stock_transactions (step 4) BEFORE deleting delivery_items (step 7),
  -- so their absence means the reversal is already done — reversing again would double-count.
  IF NOT EXISTS (
    SELECT 1 FROM stock_transactions
    WHERE reference_type = 'delivery'
      AND reference_id = OLD.delivery_id
      AND transaction_type = 'purchase'
  ) THEN
    RETURN OLD;
  END IF;

  -- Only reverse stock if this delivery had verified stock (or didn't require verification)
  IF v_verification_status = 'verified' OR v_requires_verification = FALSE THEN
    v_qty_to_remove := COALESCE(OLD.accepted_qty, OLD.received_qty);

    UPDATE stock_inventory
    SET
      current_qty = GREATEST(0, current_qty - v_qty_to_remove),
      updated_at = NOW()
    WHERE site_id = v_site_id
      AND (location_id = v_location_id OR (location_id IS NULL AND v_location_id IS NULL))
      AND material_id = OLD.material_id
      AND (brand_id = OLD.brand_id OR (brand_id IS NULL AND OLD.brand_id IS NULL));
  END IF;

  RETURN OLD;
END;
$function$;
