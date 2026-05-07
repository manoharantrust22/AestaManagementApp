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

-- RLS: a user can read/write skills only for laborers in their company.
ALTER TABLE public.laborer_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company_select_laborer_skills"
  ON public.laborer_skills FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.laborers l
      WHERE l.id = laborer_skills.laborer_id
        AND l.company_id = ANY (get_user_companies())
    )
  );

CREATE POLICY "company_insert_laborer_skills"
  ON public.laborer_skills FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.laborers l
      WHERE l.id = laborer_skills.laborer_id
        AND l.company_id = ANY (get_user_companies())
    )
  );

CREATE POLICY "company_update_laborer_skills"
  ON public.laborer_skills FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.laborers l
      WHERE l.id = laborer_skills.laborer_id
        AND l.company_id = ANY (get_user_companies())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.laborers l
      WHERE l.id = laborer_skills.laborer_id
        AND l.company_id = ANY (get_user_companies())
    )
  );

CREATE POLICY "company_delete_laborer_skills"
  ON public.laborer_skills FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.laborers l
      WHERE l.id = laborer_skills.laborer_id
        AND l.company_id = ANY (get_user_companies())
    )
  );

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
