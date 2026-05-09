-- Migration: Multi-skill laborer model (laborer_skills table + backfill)
--
-- Some laborers are single-skill (only civil, only painting, only electrical);
-- others are multi-skill (a civil mason who helps with painting/tiling on
-- slow days). The existing laborers.category_id captures only the primary
-- skill. This table stores the full set of categories a laborer can work in,
-- with one row flagged is_primary=true that mirrors laborers.category_id.
--
-- Slice 4 of the "Mesthri-aware Teams + RLS Bug Fix + Skill-based Laborer
-- Organization" plan. Slice 1-3 shipped earlier (see migration
-- 20260507104240). This slice was originally deferred but pulled forward
-- when the user asked to complete all optional follow-ups in the same PR.
--
-- Backfill is idempotent via the UNIQUE (laborer_id, category_id) constraint
-- + ON CONFLICT DO UPDATE.

CREATE TABLE IF NOT EXISTS public.laborer_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  laborer_id uuid NOT NULL REFERENCES public.laborers(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.labor_categories(id),
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (laborer_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_laborer_skills_laborer
  ON public.laborer_skills (laborer_id);
CREATE INDEX IF NOT EXISTS idx_laborer_skills_category
  ON public.laborer_skills (category_id);

-- Exactly one primary per laborer (partial unique index).
CREATE UNIQUE INDEX IF NOT EXISTS uq_laborer_skills_one_primary
  ON public.laborer_skills (laborer_id)
  WHERE is_primary = true;

-- RLS: company-scoped when laborers.company_id and get_user_companies() exist
-- (production), permissive fallback otherwise (fresh local DB without the
-- Studio-side multi-company additions). Production already ran this and won't
-- re-execute on file edit, so its tighter policies stay intact.
ALTER TABLE public.laborer_skills ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  v_has_company_id boolean;
  v_has_get_user_companies boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'laborers'
      AND column_name  = 'company_id'
  ) INTO v_has_company_id;

  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_user_companies'
  ) INTO v_has_get_user_companies;

  IF v_has_company_id AND v_has_get_user_companies THEN
    EXECUTE $sql$
      CREATE POLICY "company_select_laborer_skills"
        ON public.laborer_skills FOR SELECT TO authenticated
        USING (EXISTS (
          SELECT 1 FROM public.laborers l
          WHERE l.id = laborer_skills.laborer_id
            AND l.company_id = ANY (get_user_companies())
        ))
    $sql$;
    EXECUTE $sql$
      CREATE POLICY "company_insert_laborer_skills"
        ON public.laborer_skills FOR INSERT TO authenticated
        WITH CHECK (EXISTS (
          SELECT 1 FROM public.laborers l
          WHERE l.id = laborer_skills.laborer_id
            AND l.company_id = ANY (get_user_companies())
        ))
    $sql$;
    EXECUTE $sql$
      CREATE POLICY "company_update_laborer_skills"
        ON public.laborer_skills FOR UPDATE TO authenticated
        USING (EXISTS (
          SELECT 1 FROM public.laborers l
          WHERE l.id = laborer_skills.laborer_id
            AND l.company_id = ANY (get_user_companies())
        ))
        WITH CHECK (EXISTS (
          SELECT 1 FROM public.laborers l
          WHERE l.id = laborer_skills.laborer_id
            AND l.company_id = ANY (get_user_companies())
        ))
    $sql$;
    EXECUTE $sql$
      CREATE POLICY "company_delete_laborer_skills"
        ON public.laborer_skills FOR DELETE TO authenticated
        USING (EXISTS (
          SELECT 1 FROM public.laborers l
          WHERE l.id = laborer_skills.laborer_id
            AND l.company_id = ANY (get_user_companies())
        ))
    $sql$;
  ELSE
    RAISE NOTICE
      'laborers.company_id or get_user_companies() not present; creating permissive laborer_skills policies (matches project default for environments without multi-company tenancy).';
    EXECUTE $sql$CREATE POLICY "company_select_laborer_skills" ON public.laborer_skills FOR SELECT TO authenticated USING (true)$sql$;
    EXECUTE $sql$CREATE POLICY "company_insert_laborer_skills" ON public.laborer_skills FOR INSERT TO authenticated WITH CHECK (true)$sql$;
    EXECUTE $sql$CREATE POLICY "company_update_laborer_skills" ON public.laborer_skills FOR UPDATE TO authenticated USING (true) WITH CHECK (true)$sql$;
    EXECUTE $sql$CREATE POLICY "company_delete_laborer_skills" ON public.laborer_skills FOR DELETE TO authenticated USING (true)$sql$;
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.laborer_skills TO authenticated;
GRANT ALL ON public.laborer_skills TO service_role;

-- Backfill: every existing laborer's category_id becomes their primary skill.
-- Idempotent via UNIQUE (laborer_id, category_id) + ON CONFLICT.
INSERT INTO public.laborer_skills (laborer_id, category_id, is_primary)
SELECT id, category_id, true
FROM public.laborers
WHERE category_id IS NOT NULL
ON CONFLICT (laborer_id, category_id) DO UPDATE
  SET is_primary = true;

COMMENT ON TABLE public.laborer_skills IS
  'Multi-skill membership: laborers can work in multiple categories (civil + painting helper, etc.). Exactly one row per laborer has is_primary=true matching laborers.category_id. RLS scoped by laborers.company_id.';
