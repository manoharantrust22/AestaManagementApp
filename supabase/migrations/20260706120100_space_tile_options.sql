-- ============================================================
-- Spaces register: tile options + per-space tile layout
--
-- space_tile_options — the shop tiles shortlisted for a site (size + photo
-- + box details). space_tile_options.photo reuses the space-photos bucket.
--
-- spaces gains:
--   tile_option_id — the chosen floor tile (ON DELETE SET NULL so deleting
--     an option just clears the selection; the room's layout survives).
--   tile_layout jsonb — no-tile exclusion zones + wastage % + skirting-from
--     -tile settings. Tile/box COUNTS are never stored — always derived in
--     the client from dimensions + tile size + layout (same rule as the
--     other computed quantities).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.space_tile_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  label text NOT NULL,                                   -- "Kajaria Ivory 2' x 2'"
  tile_width_in numeric(6,2) NOT NULL CHECK (tile_width_in > 0),
  tile_height_in numeric(6,2) NOT NULL CHECK (tile_height_in > 0),
  tiles_per_box integer CHECK (tiles_per_box IS NULL OR tiles_per_box > 0),
  price_per_box numeric(10,2) CHECK (price_per_box IS NULL OR price_per_box >= 0),
  photo jsonb,                                           -- ScopePhotoRef | null
  notes text,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_space_tile_options_site_id
  ON public.space_tile_options (site_id);

CREATE OR REPLACE TRIGGER trg_space_tile_options_updated_at
  BEFORE UPDATE ON public.space_tile_options
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.spaces
  ADD COLUMN IF NOT EXISTS tile_option_id uuid
    REFERENCES public.space_tile_options(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tile_layout jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ============================================================
-- RLS — gate every verb on can_access_site(site_id).
-- ============================================================
ALTER TABLE public.space_tile_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY space_tile_options_select ON public.space_tile_options
  FOR SELECT TO authenticated USING (public.can_access_site(site_id));
CREATE POLICY space_tile_options_insert ON public.space_tile_options
  FOR INSERT TO authenticated WITH CHECK (public.can_access_site(site_id));
CREATE POLICY space_tile_options_update ON public.space_tile_options
  FOR UPDATE TO authenticated
  USING (public.can_access_site(site_id)) WITH CHECK (public.can_access_site(site_id));
CREATE POLICY space_tile_options_delete ON public.space_tile_options
  FOR DELETE TO authenticated USING (public.can_access_site(site_id));

GRANT ALL ON TABLE public.space_tile_options TO authenticated, service_role;

COMMENT ON TABLE public.space_tile_options IS 'Shop tile options per site (size + photo + box details) selected into spaces.tile_option_id. Tile/box counts are derived client-side, never stored.';
COMMENT ON COLUMN public.spaces.tile_layout IS 'Per-space tiling settings: { exclusions:[{id,x_in,y_in,w_in,h_in,label}], wastage_pct?, skirting_from_same_tile?, skirting_strip_in? }. Counts are computed client-side.';
