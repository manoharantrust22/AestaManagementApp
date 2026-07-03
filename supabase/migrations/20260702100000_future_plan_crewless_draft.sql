-- Future work plans: a plan is a draft subcontract that gets handed to a crew
-- later. Crew (team/laborer) becomes required only once the contract leaves
-- planning — the "Hand to crew" flow sets crew + status='active' in one UPDATE.
-- 'cancelled' is also exempt so an abandoned plan can be cancelled without ever
-- naming a crew.
--
-- Strictly more permissive than the previous check
-- (20260530220000_day_work_subcontract_fields.sql), so existing rows all pass.
-- Bonus enforcement: activating a crew-less row now throws 23514 at the DB
-- layer, closing the EditContractDialog status-edit bypass.

ALTER TABLE public.subcontracts DROP CONSTRAINT IF EXISTS contract_party_check;
ALTER TABLE public.subcontracts ADD CONSTRAINT contract_party_check CHECK (
  (is_in_house = true)
  OR (status IN ('draft'::public.contract_status, 'cancelled'::public.contract_status))
  OR (contract_type = 'mesthri'    AND team_id    IS NOT NULL)
  OR (contract_type = 'specialist' AND laborer_id IS NOT NULL)
  OR (contract_type = 'day_work'   AND concreting_team_id IS NOT NULL)
);
