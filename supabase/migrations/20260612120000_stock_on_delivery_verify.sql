-- Stock-on-verify safety net.
--
-- PROBLEM: trg_update_stock_on_delivery (update_stock_on_verified_delivery)
-- fires ONLY on delivery_items INSERT, and bails when the parent delivery is
-- still pending verification (verification_status <> 'verified' AND
-- requires_verification = TRUE). If the delivery is verified LATER — after its
-- items were inserted — nothing re-fires, so stock_inventory and the purchase
-- stock_transactions row are never created. A production sweep found a delivery
-- (GRN-7A9085788A15) stuck exactly this way: verified, items present, zero stock.
--
-- FIX: fn_stock_delivery_items(delivery_id) replays the per-item stocking logic
-- for one delivery, idempotently — it does NOTHING if the delivery already has
-- purchase transactions, so it never double-counts the normal INSERT path. An
-- AFTER UPDATE trigger on deliveries calls it the moment a delivery becomes
-- verified (or requires_verification drops to false). The same function repairs
-- the historical row via a one-off SELECT (run separately, with approval).
--
-- The body mirrors update_stock_on_verified_delivery's group-stock vs
-- non-group branches; the INSERT trigger is left untouched.

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

    -- Pricing mode / weight / po_id from the PO item, if linked.
    IF v_item.po_item_id IS NOT NULL THEN
      SELECT COALESCE(poi.pricing_mode, 'per_piece'),
             COALESCE(poi.actual_weight, poi.calculated_weight),
             poi.po_id
      INTO v_pricing_mode, v_item_weight, v_po_id
      FROM purchase_order_items poi
      WHERE poi.id = v_item.po_item_id;
    ELSE
      v_pricing_mode := 'per_piece';
      v_item_weight := NULL;
      v_po_id := NULL;
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

CREATE OR REPLACE FUNCTION public.trg_stock_on_delivery_verify()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM fn_stock_delivery_items(NEW.id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_stock_on_delivery_verify ON public.deliveries;
CREATE TRIGGER trg_stock_on_delivery_verify
AFTER UPDATE ON public.deliveries
FOR EACH ROW
WHEN (
  (NEW.verification_status = 'verified' AND OLD.verification_status IS DISTINCT FROM 'verified')
  OR (NEW.requires_verification = FALSE AND OLD.requires_verification IS DISTINCT FROM FALSE)
)
EXECUTE FUNCTION trg_stock_on_delivery_verify();

-- One-off repair for the historical stuck delivery (already verified, so the
-- trigger above cannot retroactively fire). Run with approval during deploy:
--   SELECT public.fn_stock_delivery_items('9fa0f4bf-75fa-4bbe-9f1b-e315092290f2');
-- It is idempotent (the EXISTS guard makes a re-run a no-op).
