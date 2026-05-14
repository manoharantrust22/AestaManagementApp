-- Add site_group_id to purchase_orders so group stock POs are visible to all sites in the group.
-- Previously, group stock info was only stored as JSON in internal_notes.
-- Now it's a proper FK, enabling efficient cross-site queries.

ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS site_group_id UUID REFERENCES public.site_groups(id);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_site_group_id
  ON public.purchase_orders(site_group_id);

-- Backfill existing group stock POs from the internal_notes JSON blob
UPDATE public.purchase_orders
SET site_group_id = (internal_notes::jsonb->>'site_group_id')::uuid
WHERE internal_notes IS NOT NULL
  AND internal_notes <> ''
  AND internal_notes::jsonb->>'is_group_stock' = 'true'
  AND (internal_notes::jsonb->>'site_group_id') IS NOT NULL
  AND (internal_notes::jsonb->>'site_group_id') <> '';
