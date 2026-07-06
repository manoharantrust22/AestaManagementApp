-- ============================================================
-- Spaces register: multi-floor "typical" spaces + per-floor built-up area
--
-- 1. spaces.mirrored_section_ids — floors (building_sections) a space
--    repeats on besides its primary section_id. An apartment unit that is
--    identical on floors 1..10 is entered ONCE; its finish quantities are
--    counted once per floor it appears on. No FK on the uuid[] — a deleted
--    section leaves a harmless stale id which the client filters out.
--
-- 2. space_floor_plans becomes per-floor metadata: the plan image is now
--    optional and a manually-entered built_area_sqft is added. Built-up
--    area includes wall thickness and is the basis for civil / electrical
--    per-sqft contracts — it cannot be derived from room dimensions, so it
--    is entered by hand. It lives here (not on building_sections.area_sqft)
--    because building_sections UPDATE RLS is admin/office-only, while this
--    table's can_access_site RLS lets site engineers write it.
-- ============================================================

ALTER TABLE public.spaces
  ADD COLUMN IF NOT EXISTS mirrored_section_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

ALTER TABLE public.space_floor_plans
  ALTER COLUMN plan DROP NOT NULL;

ALTER TABLE public.space_floor_plans
  ADD COLUMN IF NOT EXISTS built_area_sqft numeric(10,2)
    CHECK (built_area_sqft IS NULL OR built_area_sqft > 0);

COMMENT ON COLUMN public.spaces.mirrored_section_ids IS 'Additional floors (building_sections) this space repeats on ("typical" units); quantities count once per floor. No FK — stale ids after a section delete are filtered client-side.';
COMMENT ON COLUMN public.space_floor_plans.built_area_sqft IS 'Manually-entered built-up area (incl. wall thickness) for this floor — basis for civil/electrical per-sqft contracts. Never derived from room dimensions.';
