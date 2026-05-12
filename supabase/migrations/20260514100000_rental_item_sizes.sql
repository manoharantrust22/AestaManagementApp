-- supabase/migrations/20260514100000_rental_item_sizes.sql

-- Size variants per rental item (e.g. Side Sheet → 6×1½, 4×1½, 5×1½)
CREATE TABLE IF NOT EXISTS public.rental_item_sizes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rental_item_id UUID NOT NULL REFERENCES public.rental_items(id) ON DELETE CASCADE,
  size_label TEXT NOT NULL,           -- e.g. "6×1½", "4×1½", "Standard"
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (rental_item_id, size_label)
);

-- Per-vendor per-size daily rates (extends existing rental_store_inventory)
-- size_rates JSONB format: { "6×1½": 8.00, "4×1½": 7.00 }
-- NULL means vendor uses the existing daily_rate for all sizes
ALTER TABLE public.rental_store_inventory
  ADD COLUMN IF NOT EXISTS size_rates JSONB DEFAULT NULL;

-- Index for fast lookups by item
CREATE INDEX IF NOT EXISTS idx_rental_item_sizes_item_id
  ON public.rental_item_sizes(rental_item_id);

-- RLS: read for all authenticated, write for company admin
ALTER TABLE public.rental_item_sizes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rental_item_sizes_read" ON public.rental_item_sizes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "rental_item_sizes_write" ON public.rental_item_sizes
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
