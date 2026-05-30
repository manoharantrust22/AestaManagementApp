-- Migration: Day-work subcontract fields + relaxed party CHECK
-- Purpose: Support single-day, lump-sum concreting jobs (contract_type='day_work')
--          on the existing subcontracts table. The gang is picked from the
--          concreting_teams catalog (concreting_team_id); the bargaining breakdown
--          (male/female counts, machine rental, transport) is stored as reference
--          figures that need NOT sum to the agreed total_value.
--
-- Runs AFTER 20260530210000 added the 'day_work' enum value (it is now committed
-- and therefore safe to reference in the CHECK below).

-- 1. New columns on subcontracts (all nullable)
ALTER TABLE public.subcontracts
  ADD COLUMN IF NOT EXISTS concreting_team_id uuid REFERENCES concreting_teams(id),
  ADD COLUMN IF NOT EXISTS contractor_name    text,            -- denormalized team-name snapshot for display/history
  ADD COLUMN IF NOT EXISTS male_count         integer,
  ADD COLUMN IF NOT EXISTS female_count       integer,
  ADD COLUMN IF NOT EXISTS machine_rental     numeric(12,2),
  ADD COLUMN IF NOT EXISTS transport_cost     numeric(12,2),
  ADD COLUMN IF NOT EXISTS breakdown_notes    text;

CREATE INDEX IF NOT EXISTS idx_subcontracts_concreting_team_id
  ON public.subcontracts(concreting_team_id);

COMMENT ON COLUMN public.subcontracts.concreting_team_id IS
  'For contract_type=day_work: the external concreting gang from the concreting_teams catalog.';
COMMENT ON COLUMN public.subcontracts.contractor_name IS
  'Denormalized concreting-team name snapshot, kept readable if the team is later renamed/deactivated.';

-- 2. Relax the party CHECK so day_work is valid with a concreting_team_id
--    (and NULL team_id/laborer_id). Preserves the existing branches verbatim.
ALTER TABLE public.subcontracts DROP CONSTRAINT IF EXISTS contract_party_check;
ALTER TABLE public.subcontracts ADD CONSTRAINT contract_party_check CHECK (
  (is_in_house = true)
  OR (contract_type = 'mesthri'    AND team_id    IS NOT NULL)
  OR (contract_type = 'specialist' AND laborer_id IS NOT NULL)
  OR (contract_type = 'day_work'   AND concreting_team_id IS NOT NULL)
);
