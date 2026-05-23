-- 2026-05-23: For legacy rental orders that carry a transport cost but no
-- explicit handler, record the implicit truth — the rental vendor handled it.
-- Idempotent: only writes where handler is NULL AND a cost exists.

UPDATE rental_orders
SET outward_by = 'vendor'
WHERE transport_cost_outward > 0
  AND outward_by IS NULL;

UPDATE rental_orders
SET return_by = 'vendor'
WHERE transport_cost_return > 0
  AND return_by IS NULL;
