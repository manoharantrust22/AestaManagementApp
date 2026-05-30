-- Material requests: capture the PAYER at request time for group purchases.
--
-- A group/cluster request keeps its `site_id` as the originating / debtor site
-- (who raised it and ultimately owes for what they consume). The site whose
-- money funds the buy — the payer — can be a different cluster-mate. We let the
-- engineer pick that payer when creating the request so it pre-fills the PO
-- dialog's "Paying Site" instead of forcing the choice at PO time.
--
-- Nullable + additive: own-site requests leave it NULL; existing rows unaffected.

BEGIN;

ALTER TABLE public.material_requests
  ADD COLUMN IF NOT EXISTS payment_source_site_id UUID REFERENCES public.sites(id);

COMMENT ON COLUMN public.material_requests.payment_source_site_id IS
  'For group_stock requests: the payer site (whose money funds the buy). The request''s site_id remains the originating/debtor site.';

CREATE INDEX IF NOT EXISTS idx_material_requests_payment_source_site_id
  ON public.material_requests(payment_source_site_id);

COMMIT;
