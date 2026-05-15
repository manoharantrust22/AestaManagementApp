-- Per-variant rate + photo on rental_item_sizes (all nullable for back-compat)
ALTER TABLE public.rental_item_sizes
  ADD COLUMN IF NOT EXISTS daily_rate NUMERIC,
  ADD COLUMN IF NOT EXISTS default_hourly_rate NUMERIC,
  ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Persist chosen variant on order line + snapshot label for history
ALTER TABLE public.rental_order_items
  ADD COLUMN IF NOT EXISTS rental_item_size_id UUID REFERENCES public.rental_item_sizes(id),
  ADD COLUMN IF NOT EXISTS size_label_snapshot TEXT;

CREATE INDEX IF NOT EXISTS idx_rental_order_items_size
  ON public.rental_order_items(rental_item_size_id)
  WHERE rental_item_size_id IS NOT NULL;
