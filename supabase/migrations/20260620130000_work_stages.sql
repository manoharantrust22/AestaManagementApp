-- Workforce IA unification (Ship 1): optional "Stage" grouping under a Contract (trade).
--
-- Model: PROJECT (site) -> CONTRACT (trade = labor_category) -> STAGE (optional) -> TASK WORK.
-- A Stage is a lightweight grouping (e.g. "Ground Floor", "First Floor", "Roof Slab") that
-- holds task works within ONE trade on ONE site. Task works (subcontracts rows) may sit under
-- a Stage or directly under the Contract (stage_id NULL). Stages carry NO money and NO
-- attendance — they are pure organisation. Money stays unified at the project ledger.
--
-- Additive only: new table + one nullable FK column on subcontracts. No drops, no narrowing,
-- no data changes. RLS mirrors the sibling subcontract child tables (subcontract_scopes /
-- _role_rates / _milestones): permissive, access enforced in-app.

CREATE TABLE IF NOT EXISTS public.work_stages (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id            uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  trade_category_id  uuid REFERENCES public.labor_categories(id) ON DELETE CASCADE,
  name               text NOT NULL,
  sort_order         integer NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.work_stages IS
  'Optional grouping of task works under a Contract (trade) on a site, e.g. "First Floor". Pure organisation — no money, no attendance. Task works reference it via subcontracts.stage_id (nullable).';

CREATE INDEX IF NOT EXISTS idx_work_stages_site_trade
  ON public.work_stages (site_id, trade_category_id);

-- The Stage a task work belongs to (NULL = directly under the Contract, no stage grouping).
ALTER TABLE public.subcontracts
  ADD COLUMN IF NOT EXISTS stage_id uuid REFERENCES public.work_stages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_subcontracts_stage ON public.subcontracts (stage_id);

ALTER TABLE public.work_stages ENABLE ROW LEVEL SECURITY;

-- Permissive policies (match sibling subcontract child tables; access enforced in-app)
CREATE POLICY allow_authenticated_select_work_stages ON public.work_stages FOR SELECT TO authenticated USING (true);
CREATE POLICY allow_anon_select_work_stages          ON public.work_stages FOR SELECT TO anon          USING (true);
CREATE POLICY allow_authenticated_insert_work_stages ON public.work_stages FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY allow_anon_insert_work_stages          ON public.work_stages FOR INSERT TO anon          WITH CHECK (true);
CREATE POLICY allow_authenticated_update_work_stages ON public.work_stages FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_anon_update_work_stages          ON public.work_stages FOR UPDATE TO anon          USING (true) WITH CHECK (true);
CREATE POLICY allow_authenticated_delete_work_stages ON public.work_stages FOR DELETE TO authenticated USING (true);
CREATE POLICY allow_anon_delete_work_stages          ON public.work_stages FOR DELETE TO anon          USING (true);
