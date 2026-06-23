-- Agreed scope-of-work sheet per subcontract (anti scope-creep evidence).
--
-- A list of work items the owner agreed with the labourer, each with a "before"
-- photo (taken when agreeing / before starting) and a same-angle "after" photo
-- (taken at completion). Documentation only — NO money, NO attendance; it never
-- touches reconciliation or rollups. One row per subcontract (JSONB items array),
-- mirroring the subcontract_work_updates convention.
--
-- items shape: [{ id, label, note?, before: {url,storage_path,capturedAt}|null,
--                 after: {url,storage_path,capturedAt}|null }]
CREATE TABLE IF NOT EXISTS public.subcontract_scope_sheet (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontract_id  uuid NOT NULL UNIQUE REFERENCES public.subcontracts(id) ON DELETE CASCADE,
  items           jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by      uuid REFERENCES public.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subcontract_scope_sheet ENABLE ROW LEVEL SECURITY;

-- Permissive RLS (app layer handles authorization) — same 8-policy pattern as
-- subcontract_work_updates: anon & authenticated × CRUD, using(true).
CREATE POLICY allow_anon_select_subcontract_scope_sheet          ON public.subcontract_scope_sheet FOR SELECT TO anon          USING (true);
CREATE POLICY allow_anon_insert_subcontract_scope_sheet          ON public.subcontract_scope_sheet FOR INSERT TO anon          WITH CHECK (true);
CREATE POLICY allow_anon_update_subcontract_scope_sheet          ON public.subcontract_scope_sheet FOR UPDATE TO anon          USING (true) WITH CHECK (true);
CREATE POLICY allow_anon_delete_subcontract_scope_sheet          ON public.subcontract_scope_sheet FOR DELETE TO anon          USING (true);
CREATE POLICY allow_authenticated_select_subcontract_scope_sheet ON public.subcontract_scope_sheet FOR SELECT TO authenticated USING (true);
CREATE POLICY allow_authenticated_insert_subcontract_scope_sheet ON public.subcontract_scope_sheet FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY allow_authenticated_update_subcontract_scope_sheet ON public.subcontract_scope_sheet FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_authenticated_delete_subcontract_scope_sheet ON public.subcontract_scope_sheet FOR DELETE TO authenticated USING (true);

COMMENT ON TABLE public.subcontract_scope_sheet IS 'Agreed scope checklist per subcontract: items[] = {id,label,note,before,after photos}. Anti scope-creep evidence; documentation only (no money/attendance).';
