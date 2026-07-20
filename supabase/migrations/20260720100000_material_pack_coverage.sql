ALTER TABLE public.material_packs
  ADD COLUMN IF NOT EXISTS coverage text NULL;

COMMENT ON COLUMN public.material_packs.coverage IS
  'Free-form coverage claim for this specific pack size (e.g. "30-35 sqft/bag"). Entered per pack -- coverage can differ between pack sizes of the same variant.';
