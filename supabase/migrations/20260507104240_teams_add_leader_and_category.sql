-- Migration: Add leader_laborer_id + category_id to teams
--
-- Purpose: Bridge the "two identities" gap on /company/teams. Today,
--          teams.leader_name is plain text with no FK to laborers, so the
--          team leader and the matching laborer record exist in parallel
--          universes. New teams created via the updated Add/Edit Team UI
--          will populate leader_laborer_id (FK) so the link is canonical.
--          Existing teams keep working with leader_name only.
--
--          category_id labels each team's primary work category
--          (Painting / Civil / Tiling / Electrical / etc.). Used for
--          filtering and for sorting the leader/member autocomplete so
--          painters bubble up first when creating a Painting Team.
--
-- Both columns are NULLABLE for backward compatibility. No backfill of
-- legacy rows; the user can edit existing teams to attach a laborer/
-- category as they touch them.
--
-- Stepping-stone toward the full mesthri/team data-model rework
-- (Feature A in docs/superpowers/specs).

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS leader_laborer_id uuid
    REFERENCES public.laborers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category_id uuid
    REFERENCES public.labor_categories(id);

CREATE INDEX IF NOT EXISTS idx_teams_leader_laborer_id
  ON public.teams (leader_laborer_id) WHERE leader_laborer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_teams_category_id
  ON public.teams (category_id) WHERE category_id IS NOT NULL;

COMMENT ON COLUMN public.teams.leader_laborer_id IS
  'Optional FK to laborers.id when the team leader is a tracked laborer. When set, this is the canonical link; leader_name/leader_phone remain for legacy/display.';

COMMENT ON COLUMN public.teams.category_id IS
  'Optional FK to labor_categories.id describing the team primary work category (Painting / Civil / Tiling / Electrical / etc.). Used for filtering and for sorting the leader/member autocomplete.';
