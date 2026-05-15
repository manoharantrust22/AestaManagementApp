-- Add `is_historical` to rental_orders so the detail page can lock down
-- live-order actions (Activate, Record Return, Advance) for backfilled records.
-- Backfill repairs orders that came out of HistoricalRentalDialog but never got tagged,
-- including those accidentally activated to status='active'.

ALTER TABLE rental_orders
  ADD COLUMN is_historical BOOLEAN NOT NULL DEFAULT false;

-- Partial index: the column is highly skewed (most rows are live).
CREATE INDEX idx_rental_orders_is_historical
  ON rental_orders (is_historical) WHERE is_historical = true;

-- Backfill: an order is historical iff it has no rental_returns rows
-- (live flow always inserts there via useRecordRentalReturn) AND either
-- it's already completed OR it was entered on a later calendar day than the rental started.
WITH historical_orders AS (
  SELECT ro.id
  FROM rental_orders ro
  WHERE NOT EXISTS (
    SELECT 1 FROM rental_returns rr WHERE rr.rental_order_id = ro.id
  )
  AND (
    ro.status = 'completed'
    OR ro.created_at::date > ro.start_date
  )
)
UPDATE rental_orders
SET is_historical = true,
    status = 'completed',
    actual_return_date = COALESCE(actual_return_date, expected_return_date, CURRENT_DATE)
WHERE id IN (SELECT id FROM historical_orders);

-- Items: mark everything returned. quantity_outstanding is a GENERATED column
-- (quantity - quantity_returned), so it recomputes to 0 automatically.
UPDATE rental_order_items
SET quantity_returned = quantity
WHERE rental_order_id IN (
  SELECT id FROM rental_orders WHERE is_historical = true
);
