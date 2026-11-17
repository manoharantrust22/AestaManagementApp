-- NOT A MIGRATION YET. Kept out of supabase/migrations on purpose: the
-- "move to prod" routine applies everything in that folder, and this must wait
-- for Hari's yes after the task move (scripts/move-tasks-to-hub.ts --apply).
--
-- When confirmed: copy to supabase/migrations/<timestamp>_retire_local_tasks.sql
-- and apply. It is reversible (see "Undo" at the end); no data is deleted.
--
-- Tasks now live in Neram's task hub (NEXT_PUBLIC_FF_NERAM_TASKS=true).
--  1. Aesta's own task tables become read-only for app users (kept 30 days
--     for reference, then a later migration drops them).
--  2. The old task notification triggers stop: hub events notify instead
--     (neram_hub_record_event, migration 20261117100000).

-- 1. Read-only: app users keep SELECT, lose INSERT/UPDATE/DELETE.
REVOKE INSERT, UPDATE, DELETE ON public.tasks            FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.task_updates     FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.task_attachments FROM anon, authenticated;

-- Storage: no new files into the old bucket.
DROP POLICY IF EXISTS task_attachments_obj_insert ON storage.objects;
DROP POLICY IF EXISTS task_attachments_obj_delete ON storage.objects;

-- 2. Old notifications off.
ALTER TABLE public.tasks        DISABLE TRIGGER trg_notif_v2_task_lifecycle;
ALTER TABLE public.task_updates DISABLE TRIGGER trg_notif_v2_task_comment;

COMMENT ON TABLE public.tasks IS
  'RETIRED: tasks moved to Neram task hub. Read-only; drop after 30 days (see supabase/pending/retire_local_tasks.sql).';

-- Undo (if the hub has to be switched off):
--   GRANT INSERT, UPDATE, DELETE ON public.tasks, public.task_updates, public.task_attachments TO authenticated;
--   ALTER TABLE public.tasks        ENABLE TRIGGER trg_notif_v2_task_lifecycle;
--   ALTER TABLE public.task_updates ENABLE TRIGGER trg_notif_v2_task_comment;
--   re-create task_attachments_obj_insert / _obj_delete from 20261108100000_tasks.sql
