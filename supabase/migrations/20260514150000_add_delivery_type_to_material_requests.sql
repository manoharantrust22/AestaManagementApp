-- Add delivery_type to material_requests so engineers can distinguish
-- one-time deliveries (single drop) from bulk purchases (multiple batches over time).
-- Existing rows default to 'one_time' to preserve current behaviour.

ALTER TABLE public.material_requests
  ADD COLUMN IF NOT EXISTS delivery_type TEXT NOT NULL DEFAULT 'one_time'
  CHECK (delivery_type IN ('one_time', 'bulk'));

COMMENT ON COLUMN public.material_requests.delivery_type IS 'one_time = single delivery expected; bulk = multiple partial deliveries over time';
