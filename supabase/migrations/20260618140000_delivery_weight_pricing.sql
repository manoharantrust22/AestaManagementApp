-- TMT two-stage pricing — Phase 1a: capture ACTUAL weight + the gross bill at delivery.
--
-- BACKGROUND: TMT rods are ordered in pieces but priced per kg. The vendor rate/kg
-- is known up front (the PO estimate), but the exact weight only arrives on the
-- paper "yellow bill" at delivery. Until now nothing captured the delivered weight
-- or the bill amount at delivery time, so the recorded cost was a PO-time estimate.
--
-- These columns let the delivery screen record the bill's exact weight per line
-- (this installment) and the gross bill total. All additive + backward compatible:
-- legacy rows keep NULL and the stock trigger falls back to the PO-item weight.

-- Per-line ACTUAL weight / rate / mode for this delivery installment.
ALTER TABLE public.delivery_items
  ADD COLUMN IF NOT EXISTS pricing_mode text DEFAULT 'per_piece'
    CHECK (pricing_mode IN ('per_piece', 'per_kg')),
  ADD COLUMN IF NOT EXISTS actual_weight numeric(12,3),
  ADD COLUMN IF NOT EXISTS line_amount   numeric(14,2);

COMMENT ON COLUMN public.delivery_items.pricing_mode IS
  'Copied from the PO item at delivery. per_kg lines value = actual_weight * unit_price (rate/kg).';
COMMENT ON COLUMN public.delivery_items.actual_weight IS
  'Actual delivered weight (kg) for THIS delivery installment, from the vendor bill.';
COMMENT ON COLUMN public.delivery_items.line_amount IS
  'Net line value for this delivery line (rate-derived). Drives stock value + expense total.';

-- Gross bill total + GST treatment for the whole delivery (yellow bill is gross/inclusive).
ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS bill_total        numeric(14,2),
  ADD COLUMN IF NOT EXISTS bill_includes_gst boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS bill_gst_rate     numeric(5,2);

COMMENT ON COLUMN public.deliveries.bill_total IS
  'Gross bill total entered at delivery (line sum + handling/rounding). Authoritative expense total when set.';
COMMENT ON COLUMN public.deliveries.bill_includes_gst IS
  'Default true for weight-based bills (TMT bills are gross/inclusive of GST).';
COMMENT ON COLUMN public.deliveries.bill_gst_rate IS
  'GST rate (%) recorded on the delivery bill, copied from the PO line (default 18 for TMT).';
