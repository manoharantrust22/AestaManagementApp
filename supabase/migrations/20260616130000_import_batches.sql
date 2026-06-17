-- Migration: import_batches (revocable bulk-import grouping) + misc_expenses.import_batch_id
-- Purpose: Every bulk CSV import becomes one batch row with a lifecycle
--          (committed -> reverted -> committed (restore) ; or -> purged).
--          Imported misc_expenses rows are tagged with import_batch_id so the
--          whole batch can be soft-revoked / restored / purged as a unit.
--
-- Soft-revoke story: setting misc_expenses.is_cancelled = true for every row in a
-- batch makes those rows disappear from the Miscellaneous page, the v_all_expenses
-- view (its misc slice filters is_cancelled = false), AND calculateSubcontractTotals()
-- (reads v_all_expenses where is_deleted = false). No view changes required.

BEGIN;

CREATE TABLE IF NOT EXISTS public.import_batches (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id           uuid NOT NULL REFERENCES public.sites(id),
  target_table      text NOT NULL DEFAULT 'misc_expenses',
  status            text NOT NULL DEFAULT 'committed'
                      CHECK (status IN ('committed', 'reverted', 'purged')),
  file_name         text,
  original_csv_path text,            -- Storage path in the 'imports' bucket
  file_hash         text,            -- sha256 of the raw CSV bytes (idempotency)
  total_count       integer NOT NULL DEFAULT 0,
  inserted_count    integer NOT NULL DEFAULT 0,
  skipped_count     integer NOT NULL DEFAULT 0,
  error_count       integer NOT NULL DEFAULT 0,
  summary           jsonb,           -- financial summary frozen at commit time
  notes             text,
  created_by        uuid REFERENCES public.users(id),
  created_by_name   text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  reverted_by       uuid REFERENCES public.users(id),
  reverted_at       timestamptz,
  revert_reason     text
);

CREATE INDEX IF NOT EXISTS idx_import_batches_site_id    ON public.import_batches(site_id);
CREATE INDEX IF NOT EXISTS idx_import_batches_status     ON public.import_batches(status);
CREATE INDEX IF NOT EXISTS idx_import_batches_created_at ON public.import_batches(created_at DESC);

-- Only LIVE (committed) batches enforce file-hash uniqueness per site, so a
-- re-upload of the same file after a revert/purge is allowed.
CREATE UNIQUE INDEX IF NOT EXISTS uq_import_batches_live_hash
  ON public.import_batches(site_id, file_hash)
  WHERE status = 'committed' AND file_hash IS NOT NULL;

ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS import_batches_select ON public.import_batches;
CREATE POLICY import_batches_select ON public.import_batches
  FOR SELECT TO authenticated
  USING (public.can_access_site(site_id));

DROP POLICY IF EXISTS import_batches_insert ON public.import_batches;
CREATE POLICY import_batches_insert ON public.import_batches
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_site(site_id));

DROP POLICY IF EXISTS import_batches_update ON public.import_batches;
CREATE POLICY import_batches_update ON public.import_batches
  FOR UPDATE TO authenticated
  USING (public.can_access_site(site_id));

-- No DELETE policy: batch rows are tombstones (kept even after purge for audit).

GRANT SELECT, INSERT, UPDATE ON TABLE public.import_batches TO authenticated;
GRANT ALL ON TABLE public.import_batches TO service_role;

-- Link column on misc_expenses ONLY (defer other importable tables - YAGNI).
-- ON DELETE SET NULL so deleting a batch row never cascades into expense data.
ALTER TABLE public.misc_expenses
  ADD COLUMN IF NOT EXISTS import_batch_id uuid
    REFERENCES public.import_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_misc_expenses_import_batch_id
  ON public.misc_expenses(import_batch_id);

COMMENT ON TABLE public.import_batches IS
  'One row per bulk CSV import. status lifecycle: committed -> reverted (soft) -> committed (restore) | purged (hard). summary is the financial preview frozen at commit.';
COMMENT ON COLUMN public.misc_expenses.import_batch_id IS
  'Set when the row was created by a bulk import (import_batches.id). Null for manually entered expenses.';

COMMIT;
