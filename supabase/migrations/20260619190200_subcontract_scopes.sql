-- Phase 5 (contracts overhaul): parent contract + child SCOPES.
-- A subcontract can optionally have child "scopes" (e.g. floors: 1st / Ground / 2nd),
-- each with an estimated value + sqft, and an actual sqft captured at close for the
-- end-of-project reconciliation. Money + attendance stay on the PARENT contract; scopes
-- are a breakdown only. Single-scope jobs simply have zero rows here.
--
-- Additive: new table only. RLS mirrors the sibling subcontract child tables
-- (subcontract_role_rates / _milestones / _sections): permissive, app-level access.

CREATE TABLE IF NOT EXISTS public.subcontract_scopes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id     uuid NOT NULL REFERENCES public.subcontracts(id) ON DELETE CASCADE,
  name            text NOT NULL,
  estimated_value numeric(14,2) NOT NULL DEFAULT 0,
  estimated_sqft  numeric(12,2),
  actual_sqft     numeric(12,2),
  actual_value    numeric(14,2),
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.subcontract_scopes IS
  'Optional child scopes of a subcontract (e.g. floors). Estimated value/sqft now; actual_sqft captured at close for reconciliation. Breakdown only — payments & attendance live on the parent contract.';

CREATE INDEX IF NOT EXISTS idx_subcontract_scopes_contract
  ON public.subcontract_scopes (contract_id);

ALTER TABLE public.subcontract_scopes ENABLE ROW LEVEL SECURITY;

-- Permissive policies (match sibling subcontract child tables; access enforced in-app)
CREATE POLICY allow_authenticated_select_subcontract_scopes ON public.subcontract_scopes FOR SELECT TO authenticated USING (true);
CREATE POLICY allow_anon_select_subcontract_scopes          ON public.subcontract_scopes FOR SELECT TO anon          USING (true);
CREATE POLICY allow_authenticated_insert_subcontract_scopes ON public.subcontract_scopes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY allow_anon_insert_subcontract_scopes          ON public.subcontract_scopes FOR INSERT TO anon          WITH CHECK (true);
CREATE POLICY allow_authenticated_update_subcontract_scopes ON public.subcontract_scopes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_anon_update_subcontract_scopes          ON public.subcontract_scopes FOR UPDATE TO anon          USING (true) WITH CHECK (true);
CREATE POLICY allow_authenticated_delete_subcontract_scopes ON public.subcontract_scopes FOR DELETE TO authenticated USING (true);
CREATE POLICY allow_anon_delete_subcontract_scopes          ON public.subcontract_scopes FOR DELETE TO anon          USING (true);
