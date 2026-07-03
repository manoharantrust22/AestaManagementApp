-- ============================================================
-- Spaces & Measurements Register
--
-- Per-site register of rooms/spaces with drawing + field-verified
-- dimensions (stored in INCHES) and the inputs needed to derive
-- finish quantities client-side: floor tile (sqft), skirting (rft,
-- perimeter minus door widths), wall tile (perimeter x tiling height
-- minus openings) and granite (manual line items).
--
-- Invariants:
--   * Computed quantities are NEVER stored — always derived in the
--     client from dimensions + openings; only manual overrides persist
--     (overrides jsonb). This keeps one source of truth and lets a
--     corrected dimension recompute everything.
--   * openings / granite_lines / photos are JSONB because they are
--     always read/written with their space and never queried
--     independently (same precedent as subcontract_scope_sheet.items).
--   * Floor plans live in space_floor_plans, NOT on building_sections,
--     because building_sections UPDATE RLS is admin/office-only and
--     site engineers must be able to upload plans.
-- ============================================================

-- ============================================================
-- spaces
-- ============================================================
CREATE TABLE IF NOT EXISTS public.spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  section_id uuid REFERENCES public.building_sections(id) ON DELETE SET NULL,
  name text NOT NULL,
  space_type text NOT NULL DEFAULT 'other'
    CHECK (space_type IN ('bedroom','bathroom','kitchen','living','dining',
                          'balcony','utility','staircase','corridor','other')),

  -- Dimensions in inches. drawing_* = value read off the drawing,
  -- verified_* = value measured on site (tape).
  drawing_length_in numeric(8,2) CHECK (drawing_length_in > 0),
  drawing_width_in  numeric(8,2) CHECK (drawing_width_in > 0),
  drawing_height_in numeric(8,2) CHECK (drawing_height_in > 0),
  verified_length_in numeric(8,2) CHECK (verified_length_in > 0),
  verified_width_in  numeric(8,2) CHECK (verified_width_in > 0),
  verified_height_in numeric(8,2) CHECK (verified_height_in > 0),
  verified_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  verified_at timestamptz,

  -- [{id, kind:'door'|'window', width_in, height_in, count, deduct_skirting}]
  openings jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Wall tile (bathrooms / kitchen dado): tiled band height, not full wall.
  wall_tile_enabled boolean NOT NULL DEFAULT false,
  tiling_height_in numeric(8,2) CHECK (tiling_height_in > 0),

  -- [{id, label, length_in, width_in, count}] e.g. "Kitchen top 12' x 2'"
  granite_lines jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- {floor_tile_sqft?, skirting_rft?, wall_tile_sqft?, granite_sqft?}
  -- A set override wins over the computed value in every display mode.
  overrides jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- ScopePhotoRef[]: [{url, storage_path, capturedAt}]
  photos jsonb NOT NULL DEFAULT '[]'::jsonb,

  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spaces_site_id ON public.spaces (site_id);
CREATE INDEX IF NOT EXISTS idx_spaces_site_section
  ON public.spaces (site_id, section_id, sort_order);

CREATE OR REPLACE TRIGGER trg_spaces_updated_at
  BEFORE UPDATE ON public.spaces
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- space_floor_plans — one plan image per floor (building_section)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.space_floor_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  section_id uuid NOT NULL UNIQUE REFERENCES public.building_sections(id) ON DELETE CASCADE,
  -- ScopePhotoRef: {url, storage_path, capturedAt}
  plan jsonb NOT NULL,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_space_floor_plans_site_id
  ON public.space_floor_plans (site_id);

CREATE OR REPLACE TRIGGER trg_space_floor_plans_updated_at
  BEFORE UPDATE ON public.space_floor_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- RLS — gate every verb on can_access_site(site_id).
-- ============================================================
ALTER TABLE public.spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.space_floor_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY spaces_select ON public.spaces
  FOR SELECT TO authenticated USING (public.can_access_site(site_id));
CREATE POLICY spaces_insert ON public.spaces
  FOR INSERT TO authenticated WITH CHECK (public.can_access_site(site_id));
CREATE POLICY spaces_update ON public.spaces
  FOR UPDATE TO authenticated
  USING (public.can_access_site(site_id)) WITH CHECK (public.can_access_site(site_id));
CREATE POLICY spaces_delete ON public.spaces
  FOR DELETE TO authenticated USING (public.can_access_site(site_id));

CREATE POLICY space_floor_plans_select ON public.space_floor_plans
  FOR SELECT TO authenticated USING (public.can_access_site(site_id));
CREATE POLICY space_floor_plans_insert ON public.space_floor_plans
  FOR INSERT TO authenticated WITH CHECK (public.can_access_site(site_id));
CREATE POLICY space_floor_plans_update ON public.space_floor_plans
  FOR UPDATE TO authenticated
  USING (public.can_access_site(site_id)) WITH CHECK (public.can_access_site(site_id));
CREATE POLICY space_floor_plans_delete ON public.space_floor_plans
  FOR DELETE TO authenticated USING (public.can_access_site(site_id));

-- ============================================================
-- Storage bucket for space photos + floor plans
-- Paths: {siteId}/spaces/{spaceId}/{ts}.jpg
--        {siteId}/floor-plans/{sectionId}/{ts}.jpg
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('space-photos', 'space-photos', true, 10485760,
        ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload space photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'space-photos');

CREATE POLICY "Authenticated users can read space photos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'space-photos');

CREATE POLICY "Authenticated users can update space photos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'space-photos');

CREATE POLICY "Authenticated users can delete space photos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'space-photos');

-- ============================================================
-- Grants + comments
-- ============================================================
GRANT ALL ON TABLE public.spaces TO authenticated, service_role;
GRANT ALL ON TABLE public.space_floor_plans TO authenticated, service_role;

COMMENT ON TABLE public.spaces IS 'Spaces & Measurements Register: per-site rooms with drawing + field-verified dimensions (inches) and inputs for deriving floor tile / skirting / wall tile / granite quantities client-side.';
COMMENT ON TABLE public.space_floor_plans IS 'One floor-plan image per building_section for the Spaces register. Separate table (not a building_sections column) so site engineers can write it under can_access_site RLS.';
