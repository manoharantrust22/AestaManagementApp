-- Fix: "Delete batch" is wrongly blocked on multi-installment group POs.
--
-- reverse_delivery() refused to reverse ANY installment of a group PO whenever the PO's group
-- batch had ANY logged usage ("Usage has been logged against this batch — delete the usage
-- events before reversing this delivery."). On an advance/group PO that is delivered in many
-- installments and partly consumed, that blanket guard locks the user out of deleting a wrong
-- installment whose OWN stock is still sitting in inventory.
--
-- FIX (only the group usage guard changes; everything else is the current live body verbatim):
--   • Keep the inter-site SETTLEMENT guard (never reverse a settled batch).
--   • Narrow the batch_usage_records guard to fire ONLY when this is the SOLE delivery
--     (v_other_deliveries = 0) — i.e. the full-batch teardown in step 5, where leftover usage
--     rows would orphan a deleted batch. There it must still block.
--   • For multi-installment POs (other deliveries remain) drop the blanket usage guard and rely
--     on the existing PER-INSTALLMENT negative-pool guard below (current_qty < this delivery's
--     quantity → "Delivered stock has already been used"). That refuses reversal precisely when
--     THIS installment's own stock was already consumed, at the inventory-row grain.

CREATE OR REPLACE FUNCTION public.reverse_delivery(p_delivery_id uuid, p_reason text DEFAULT NULL::text, p_actor uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_po_id UUID;
  v_site_id UUID;
  v_batch_codes TEXT[];
  v_is_group BOOLEAN := false;
  v_other_deliveries INT := 0;
  v_touched_inventory UUID[] := ARRAY[]::UUID[];
  v_reversed_txns INT := 0;
  v_total_received NUMERIC := 0;
  v_total_ordered NUMERIC := 0;
  v_new_status TEXT;
  v_group_cleanup BOOLEAN := false;
  v_item_count INT := 0;
  v_stock_txn_count INT := 0;
  st RECORD;
  di RECORD;
BEGIN
  -- 1. Load the delivery
  SELECT po_id, site_id INTO v_po_id, v_site_id
  FROM deliveries WHERE id = p_delivery_id;

  IF v_po_id IS NULL THEN
    RAISE EXCEPTION 'Delivery % not found (or has no PO)', p_delivery_id;
  END IF;

  -- 1a. Empty-delivery short-circuit: a row with no line items and no stock
  -- transactions added nothing (e.g. a phantom GRN). There is nothing to
  -- reverse, and the usage/settlement guards below key off the BATCH (shared by
  -- sibling installments), so they must not block deleting this unrelated row.
  SELECT COUNT(*) INTO v_item_count FROM delivery_items WHERE delivery_id = p_delivery_id;
  SELECT COUNT(*) INTO v_stock_txn_count
  FROM stock_transactions
  WHERE reference_type = 'delivery' AND reference_id = p_delivery_id;

  IF v_item_count = 0 AND v_stock_txn_count = 0 THEN
    DELETE FROM deliveries WHERE id = p_delivery_id;

    SELECT COALESCE(SUM(received_qty), 0), COALESCE(SUM(quantity), 0)
    INTO v_total_received, v_total_ordered
    FROM purchase_order_items WHERE po_id = v_po_id;

    v_new_status := CASE
      WHEN v_total_received <= 0 THEN 'ordered'
      WHEN v_total_received < v_total_ordered THEN 'partial_delivered'
      ELSE 'delivered'
    END;
    -- v_new_status is text; purchase_orders.status is enum po_status — cast explicitly.
    UPDATE purchase_orders SET status = v_new_status::po_status, updated_at = now() WHERE id = v_po_id;

    RETURN json_build_object(
      'success', true,
      'delivery_id', p_delivery_id,
      'po_id', v_po_id,
      'empty_delivery', true,
      'reversed_stock_txns', 0,
      'group_cleanup', false,
      'new_po_status', v_new_status,
      'reason', p_reason,
      'actor', p_actor
    );
  END IF;

  -- 2. Resolve group-stock batch codes for this PO
  SELECT array_remove(ARRAY_AGG(DISTINCT ref_code), NULL)
  INTO v_batch_codes
  FROM material_purchase_expenses
  WHERE purchase_order_id = v_po_id
    AND purchase_type = 'group_stock';

  v_batch_codes := COALESCE(v_batch_codes, ARRAY[]::TEXT[]);
  v_is_group := array_length(v_batch_codes, 1) > 0;

  SELECT COUNT(*) INTO v_other_deliveries
  FROM deliveries WHERE po_id = v_po_id AND id <> p_delivery_id;

  -- 3. Guards (checked before any mutation)
  IF v_is_group THEN
    IF EXISTS (
      SELECT 1 FROM inter_site_material_settlements
      WHERE batch_ref_code = ANY(v_batch_codes)
    ) THEN
      RAISE EXCEPTION 'Batch has an inter-site settlement — reverse the settlement before reversing this delivery.';
    END IF;

    -- Usage guard ONLY for the sole-delivery FULL-batch teardown (step 5). When other
    -- installments remain, per-installment reversal is allowed — the negative-pool guard
    -- below precisely refuses if THIS installment's own stock was already consumed.
    IF v_other_deliveries = 0 AND EXISTS (
      SELECT 1 FROM batch_usage_records WHERE batch_ref_code = ANY(v_batch_codes)
    ) THEN
      RAISE EXCEPTION 'Usage has been logged against this batch — delete the usage events before reversing this delivery.';
    END IF;

    -- NOTE: the former "group PO has other deliveries -> refuse" guard is removed.
    -- Per-installment reversal is supported: step 4 reverses only THIS delivery's
    -- per-site stock, and the full batch cleanup in step 5 still only runs when
    -- this is the sole delivery.
  END IF;

  -- Own/pooled: refuse if reversing would drive any touched pool negative
  -- (means delivered stock was already consumed by daily usage).
  FOR st IN
    SELECT inventory_id, quantity
    FROM stock_transactions
    WHERE reference_type = 'delivery'
      AND reference_id = p_delivery_id
      AND transaction_type = 'purchase'
  LOOP
    IF (SELECT current_qty FROM stock_inventory WHERE id = st.inventory_id) < st.quantity THEN
      RAISE EXCEPTION 'Delivered stock has already been used — delete the usage events before reversing this delivery.';
    END IF;
  END LOOP;

  -- Last delivery on the PO + vendor expense already paid => settlement first
  IF v_other_deliveries = 0 AND EXISTS (
    SELECT 1 FROM material_purchase_expenses
    WHERE purchase_order_id = v_po_id AND is_paid = true
  ) THEN
    RAISE EXCEPTION 'Vendor for this PO is already settled — reverse the settlement before reversing the delivery.';
  END IF;

  -- 4. Reverse the stock this delivery added
  FOR st IN
    SELECT id, inventory_id, quantity
    FROM stock_transactions
    WHERE reference_type = 'delivery'
      AND reference_id = p_delivery_id
      AND transaction_type = 'purchase'
  LOOP
    UPDATE stock_inventory
    SET current_qty = current_qty - st.quantity,
        updated_at = now()
    WHERE id = st.inventory_id;

    v_touched_inventory := array_append(v_touched_inventory, st.inventory_id);
    DELETE FROM stock_transactions WHERE id = st.id;
    v_reversed_txns := v_reversed_txns + 1;
  END LOOP;

  -- 5. Group-stock cleanup — only when this is the sole delivery (full batch undo)
  IF v_is_group AND v_other_deliveries = 0 THEN
    DELETE FROM group_stock_transactions WHERE batch_ref_code = ANY(v_batch_codes);
    DELETE FROM group_stock_transactions
      WHERE inventory_id IN (SELECT id FROM group_stock_inventory WHERE batch_code = ANY(v_batch_codes));
    DELETE FROM group_stock_inventory WHERE batch_code = ANY(v_batch_codes);

    -- Derived (debtor / self-use) expenses, then the batch expense itself
    DELETE FROM material_purchase_expenses WHERE original_batch_code = ANY(v_batch_codes);
    DELETE FROM material_purchase_expense_items
      WHERE purchase_expense_id IN (
        SELECT id FROM material_purchase_expenses
        WHERE purchase_order_id = v_po_id AND purchase_type = 'group_stock'
      );
    DELETE FROM material_purchase_expenses
      WHERE purchase_order_id = v_po_id AND purchase_type = 'group_stock';
    v_group_cleanup := true;

  -- Own/pooled cleanup — drop this PO's vendor expense on full reversal
  ELSIF NOT v_is_group AND v_other_deliveries = 0 THEN
    DELETE FROM material_purchase_expense_items
      WHERE purchase_expense_id IN (
        SELECT id FROM material_purchase_expenses WHERE purchase_order_id = v_po_id
      );
    DELETE FROM material_purchase_expenses WHERE purchase_order_id = v_po_id;
  END IF;

  -- 6. Roll back PO-item received quantities.
  -- NOTE: pending_qty is a GENERATED column (quantity - received_qty) — never assign it
  -- directly (Postgres errors 428C9 "column can only be updated to DEFAULT"). It recomputes
  -- automatically from received_qty. (Assigning it here was a latent bug, harmless only while
  -- the coarse usage guard above short-circuited before this step.)
  FOR di IN
    SELECT po_item_id, received_qty
    FROM delivery_items
    WHERE delivery_id = p_delivery_id AND po_item_id IS NOT NULL
  LOOP
    UPDATE purchase_order_items
    SET received_qty = GREATEST(0, COALESCE(received_qty, 0) - COALESCE(di.received_qty, 0))
    WHERE id = di.po_item_id;
  END LOOP;

  -- 7. Delete the delivery rows
  DELETE FROM delivery_items WHERE delivery_id = p_delivery_id;
  DELETE FROM deliveries WHERE id = p_delivery_id;

  -- 8. Recompute PO status from remaining received quantities
  SELECT COALESCE(SUM(received_qty), 0), COALESCE(SUM(quantity), 0)
  INTO v_total_received, v_total_ordered
  FROM purchase_order_items WHERE po_id = v_po_id;

  v_new_status := CASE
    WHEN v_total_received <= 0 THEN 'ordered'
    WHEN v_total_received < v_total_ordered THEN 'partial_delivered'
    ELSE 'delivered'
  END;

  -- v_new_status is text; purchase_orders.status is enum po_status — cast explicitly.
  UPDATE purchase_orders SET status = v_new_status::po_status, updated_at = now() WHERE id = v_po_id;

  -- 9. Remove only the inventory rows WE emptied (never blanket-delete shared pools)
  IF array_length(v_touched_inventory, 1) > 0 THEN
    DELETE FROM stock_inventory
    WHERE id = ANY(v_touched_inventory) AND current_qty <= 0;
  END IF;

  RETURN json_build_object(
    'success', true,
    'delivery_id', p_delivery_id,
    'po_id', v_po_id,
    'reversed_stock_txns', v_reversed_txns,
    'group_cleanup', v_group_cleanup,
    'new_po_status', v_new_status,
    'reason', p_reason,
    'actor', p_actor
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM,
      'error_detail', SQLSTATE
    );
END;
$function$;
