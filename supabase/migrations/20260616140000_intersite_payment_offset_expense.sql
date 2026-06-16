-- Hard-link an inter-site ADJUSTMENT payment to the material purchase it was
-- offset against. Two reasons:
--   (a) audit — the offset is traceable to the exact funded purchase, and
--   (b) integrity — the picker excludes purchases already referenced here, so
--       the same purchase can't be silently used to clear two different debts.
-- Additive + nullable; NULL for cash/UPI/bank payments and for net-settle
-- adjustment legs (which offset a reciprocal debt, not a purchase).
ALTER TABLE public.inter_site_settlement_payments
  ADD COLUMN IF NOT EXISTS offset_expense_id uuid
    REFERENCES public.material_purchase_expenses(id);

COMMENT ON COLUMN public.inter_site_settlement_payments.offset_expense_id IS
'For payment_mode=adjustment offsets: the material_purchase_expenses row the debtor funded that this payment offsets against. NULL for cash/UPI/bank payments and net-settle adjustment legs.';
