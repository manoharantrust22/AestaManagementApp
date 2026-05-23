-- Tea-shop settlements: separate shop receipt photo from UPI/bank transfer screenshot.
-- proof_url has historically held the transfer screenshot (still does). receipt_url is
-- the new optional column for a photo of the shop's paper bill / notebook page so site
-- engineers can attach both at settlement time.

ALTER TABLE public.tea_shop_settlements
  ADD COLUMN IF NOT EXISTS receipt_url text;

ALTER TABLE public.tea_shop_group_settlements
  ADD COLUMN IF NOT EXISTS receipt_url text;

COMMENT ON COLUMN public.tea_shop_settlements.receipt_url IS
  'Photo of shop receipt / notebook page. Optional. Distinct from proof_url which is the UPI/bank transfer screenshot.';
COMMENT ON COLUMN public.tea_shop_group_settlements.receipt_url IS
  'Photo of shop receipt / notebook page. Optional. Distinct from proof_url which is the UPI/bank transfer screenshot.';
