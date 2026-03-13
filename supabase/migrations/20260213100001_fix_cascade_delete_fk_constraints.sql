-- Fix FK constraints to enable proper cascade deletion chain
-- Prevents orphaned records when parent records are deleted

-- 1. purchase_orders.source_request_id: SET NULL → CASCADE
-- When a material request is deleted, its linked POs should also be deleted
ALTER TABLE purchase_orders
  DROP CONSTRAINT purchase_orders_source_request_id_fkey,
  ADD CONSTRAINT purchase_orders_source_request_id_fkey
    FOREIGN KEY (source_request_id) REFERENCES material_requests(id) ON DELETE CASCADE;

-- 2. material_requests.converted_to_po_id: NO ACTION → SET NULL
-- When a PO is deleted, just unlink it from the request (don't block deletion)
ALTER TABLE material_requests
  DROP CONSTRAINT material_requests_converted_to_po_id_fkey,
  ADD CONSTRAINT material_requests_converted_to_po_id_fkey
    FOREIGN KEY (converted_to_po_id) REFERENCES purchase_orders(id) ON DELETE SET NULL;

-- 3. purchase_payment_allocations.po_id: NO ACTION → CASCADE
-- When a PO is deleted, its payment allocations should also be deleted
ALTER TABLE purchase_payment_allocations
  DROP CONSTRAINT purchase_payment_allocations_po_id_fkey,
  ADD CONSTRAINT purchase_payment_allocations_po_id_fkey
    FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE;

-- 4. purchase_payment_allocations.delivery_id: NO ACTION → CASCADE
-- When a delivery is deleted, its payment allocations should also be deleted
ALTER TABLE purchase_payment_allocations
  DROP CONSTRAINT purchase_payment_allocations_delivery_id_fkey,
  ADD CONSTRAINT purchase_payment_allocations_delivery_id_fkey
    FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE;
