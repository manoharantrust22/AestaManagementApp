-- Migration: labor_specialties (managed list) + laborer_specialties (junction)
--
-- Fine-grained skill tagging that is NARROWER than labor_categories (Civil,
-- Painting, ...) and labor_roles (Mason, Helper, ...). Lets the user record
-- "good at tiling / plastering / brickwork" and mark "helper only", then later
-- filter (including INACTIVE laborers) by specialty to build a call-back list.
--
-- labor_specialties is a shared reference list (like labor_categories: global,
-- no company_id). laborer_specialties mirrors laborer_skills exactly --
-- including its company-scoped RLS pattern.

-- 1. Reference list -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.labor_specialties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.labor_specialties ENABLE ROW LEVEL SECURITY;

-- Shared reference data: readable + manageable by any authenticated user
-- (matches how broad reference lists behave in this project).
DROP POLICY IF EXISTS "select_labor_specialties" ON public.labor_specialties;
DROP POLICY IF EXISTS "insert_labor_specialties" ON public.labor_specialties;
DROP POLICY IF EXISTS "update_labor_specialties" ON public.labor_specialties;
DROP POLICY IF EXISTS "delete_labor_specialties" ON public.labor_specialties;
CREATE POLICY "select_labor_specialties" ON public.labor_specialties
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_labor_specialties" ON public.labor_specialties
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_labor_specialties" ON public.labor_specialties
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_labor_specialties" ON public.labor_specialties
  FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.labor_specialties TO authenticated;
GRANT ALL ON public.labor_specialties TO service_role;

-- Seed a sensible starter set (idempotent). User can manage in-app afterwards.
INSERT INTO public.labor_specialties (name, display_order) VALUES
  ('Tiling', 10),
  ('Plastering', 20),
  ('Brickwork', 30),
  ('Concreting', 40),
  ('Centering / Shuttering', 50),
  ('Bar bending (Steel)', 60),
  ('Waterproofing', 70),
  ('Flooring', 80),
  ('Carpentry', 90),
  ('Painting & finishing', 100),
  ('Plumbing', 110),
  ('Electrical', 120),
  ('Helper only', 200)
ON CONFLICT (name) DO NOTHING;

-- 2. Junction: which specialties a laborer has -------------------------------
CREATE TABLE IF NOT EXISTS public.laborer_specialties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  laborer_id uuid NOT NULL REFERENCES public.laborers(id) ON DELETE CASCADE,
  specialty_id uuid NOT NULL REFERENCES public.labor_specialties(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (laborer_id, specialty_id)
);

CREATE INDEX IF NOT EXISTS idx_laborer_specialties_laborer
  ON public.laborer_specialties (laborer_id);
CREATE INDEX IF NOT EXISTS idx_laborer_specialties_specialty
  ON public.laborer_specialties (specialty_id);

-- RLS: company-scoped via laborers.company_id when available (production),
-- permissive fallback otherwise. Mirrors laborer_skills exactly.
ALTER TABLE public.laborer_specialties ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  v_has_company_id boolean;
  v_has_get_user_companies boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'laborers'
      AND column_name = 'company_id'
  ) INTO v_has_company_id;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_user_companies'
  ) INTO v_has_get_user_companies;

  IF v_has_company_id AND v_has_get_user_companies THEN
    EXECUTE $sql$
      CREATE POLICY "company_select_laborer_specialties"
        ON public.laborer_specialties FOR SELECT TO authenticated
        USING (EXISTS (
          SELECT 1 FROM public.laborers l
          WHERE l.id = laborer_specialties.laborer_id
            AND l.company_id = ANY (get_user_companies())
        ))
    $sql$;
    EXECUTE $sql$
      CREATE POLICY "company_insert_laborer_specialties"
        ON public.laborer_specialties FOR INSERT TO authenticated
        WITH CHECK (EXISTS (
          SELECT 1 FROM public.laborers l
          WHERE l.id = laborer_specialties.laborer_id
            AND l.company_id = ANY (get_user_companies())
        ))
    $sql$;
    EXECUTE $sql$
      CREATE POLICY "company_update_laborer_specialties"
        ON public.laborer_specialties FOR UPDATE TO authenticated
        USING (EXISTS (
          SELECT 1 FROM public.laborers l
          WHERE l.id = laborer_specialties.laborer_id
            AND l.company_id = ANY (get_user_companies())
        ))
        WITH CHECK (EXISTS (
          SELECT 1 FROM public.laborers l
          WHERE l.id = laborer_specialties.laborer_id
            AND l.company_id = ANY (get_user_companies())
        ))
    $sql$;
    EXECUTE $sql$
      CREATE POLICY "company_delete_laborer_specialties"
        ON public.laborer_specialties FOR DELETE TO authenticated
        USING (EXISTS (
          SELECT 1 FROM public.laborers l
          WHERE l.id = laborer_specialties.laborer_id
            AND l.company_id = ANY (get_user_companies())
        ))
    $sql$;
  ELSE
    RAISE NOTICE 'laborers.company_id or get_user_companies() not present; creating permissive laborer_specialties policies.';
    EXECUTE $sql$CREATE POLICY "company_select_laborer_specialties" ON public.laborer_specialties FOR SELECT TO authenticated USING (true)$sql$;
    EXECUTE $sql$CREATE POLICY "company_insert_laborer_specialties" ON public.laborer_specialties FOR INSERT TO authenticated WITH CHECK (true)$sql$;
    EXECUTE $sql$CREATE POLICY "company_update_laborer_specialties" ON public.laborer_specialties FOR UPDATE TO authenticated USING (true) WITH CHECK (true)$sql$;
    EXECUTE $sql$CREATE POLICY "company_delete_laborer_specialties" ON public.laborer_specialties FOR DELETE TO authenticated USING (true)$sql$;
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.laborer_specialties TO authenticated;
GRANT ALL ON public.laborer_specialties TO service_role;

COMMENT ON TABLE public.labor_specialties IS
  'Managed list of fine-grained work specialties (Tiling, Plastering, Brickwork, Helper only, ...), narrower than labor_categories. Global reference data.';
COMMENT ON TABLE public.laborer_specialties IS
  'Which specialties a laborer is good at. Used to filter (incl. inactive) laborers by skill for call-backs. RLS scoped by laborers.company_id.';
