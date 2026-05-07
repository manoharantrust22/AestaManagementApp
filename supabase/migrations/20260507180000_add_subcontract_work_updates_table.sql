-- Slice B: per-contract daily work updates (morning + evening photos +
-- description + completion%). Mirrors the existing daily_work_summary
-- work_updates JSONB shape so we can reuse MorningUpdateForm /
-- EveningUpdateForm verbatim. One row per contract per date.
--
-- Applied to production via mcp__supabase__apply_migration on 2026-05-07
-- as part of the trade-equality plan, slice B.

BEGIN;

CREATE TABLE IF NOT EXISTS public.subcontract_work_updates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontract_id  uuid NOT NULL REFERENCES public.subcontracts(id) ON DELETE CASCADE,
  date            date NOT NULL,
  -- Same shape as daily_work_summary.work_updates:
  --   { photoCount, morning: { description, photos[], timestamp } | null,
  --                 evening: { completionPercent, summary, photos[], taskProgress?, timestamp } | null }
  work_updates    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by      uuid REFERENCES public.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subcontract_id, date)
);

CREATE INDEX IF NOT EXISTS subcontract_work_updates_contract_date_idx
  ON public.subcontract_work_updates (subcontract_id, date);

COMMENT ON TABLE public.subcontract_work_updates IS
  'Per-contract per-day work updates (morning + evening photos, description, completion %). Same JSONB shape as daily_work_summary.work_updates so the existing MorningUpdateForm / EveningUpdateForm components can be reused. Slice B of the trade-equality plan.';

-- RLS — match the project's permissive 8-policy pattern (anon + authenticated × CRUD).
-- Actual access control happens at the application layer; this just satisfies
-- the rls_disabled_in_public lint and keeps the new table consistent with
-- subcontract_role_rates / subcontract_headcount_attendance.
ALTER TABLE public.subcontract_work_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_anon_select_subcontract_work_updates          ON public.subcontract_work_updates FOR SELECT TO anon          USING (true);
CREATE POLICY allow_anon_insert_subcontract_work_updates          ON public.subcontract_work_updates FOR INSERT TO anon          WITH CHECK (true);
CREATE POLICY allow_anon_update_subcontract_work_updates          ON public.subcontract_work_updates FOR UPDATE TO anon          USING (true) WITH CHECK (true);
CREATE POLICY allow_anon_delete_subcontract_work_updates          ON public.subcontract_work_updates FOR DELETE TO anon          USING (true);
CREATE POLICY allow_authenticated_select_subcontract_work_updates ON public.subcontract_work_updates FOR SELECT TO authenticated USING (true);
CREATE POLICY allow_authenticated_insert_subcontract_work_updates ON public.subcontract_work_updates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY allow_authenticated_update_subcontract_work_updates ON public.subcontract_work_updates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY allow_authenticated_delete_subcontract_work_updates ON public.subcontract_work_updates FOR DELETE TO authenticated USING (true);

COMMIT;
