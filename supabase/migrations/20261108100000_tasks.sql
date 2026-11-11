-- Migration: Task management + bug reports (Phase 1a)
-- Purpose: Replace WhatsApp instructions with in-app tasks that anyone can
--          assign to anyone (incl. self), with priority, size, status,
--          blockers, a back-and-forth update thread and attachments
--          (screenshots, photos, voice notes). Bug reports are tasks with
--          source = 'bug_report'.
--
-- Visibility: a task is visible to its creator, its assignee and admins.
-- Notifications: SECURITY DEFINER triggers call notif_v2_notify(), which
--          already skips the acting user and de-dupes on event_key.

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.task_priority AS ENUM ('high', 'medium', 'low');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.task_size AS ENUM ('small', 'medium', 'large');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.task_status AS ENUM ('todo', 'in_progress', 'blocked', 'done', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.task_source AS ENUM ('manual', 'assistant', 'bug_report');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tasks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title          text NOT NULL CHECK (length(btrim(title)) > 0),
  description    text,
  created_by     uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  assignee_id    uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  site_id        uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  category       text NOT NULL DEFAULT 'other'
                   CHECK (category IN ('app', 'inquiry', 'site', 'office', 'other')),
  priority       public.task_priority NOT NULL DEFAULT 'medium',
  size           public.task_size     NOT NULL DEFAULT 'small',
  status         public.task_status   NOT NULL DEFAULT 'todo',
  due_date       date DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date,
  blocker_note   text,
  source         public.task_source   NOT NULL DEFAULT 'manual',
  context        jsonb NOT NULL DEFAULT '{}'::jsonb,
  transcript     text,
  transcript_en  text,
  started_at     timestamptz,
  completed_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_assignee_status ON public.tasks (assignee_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by_status ON public.tasks (created_by, status);
CREATE INDEX IF NOT EXISTS idx_tasks_site ON public.tasks (site_id) WHERE site_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_open_bugs ON public.tasks (created_at DESC)
  WHERE source = 'bug_report' AND status NOT IN ('done', 'cancelled');

CREATE TABLE IF NOT EXISTS public.task_updates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id        uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  author_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  kind           text NOT NULL DEFAULT 'comment'
                   CHECK (kind IN ('comment', 'status_change', 'blocker', 'resolution')),
  body           text,
  from_status    public.task_status,
  to_status      public.task_status,
  transcript     text,
  transcript_en  text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_updates_task ON public.task_updates (task_id, created_at);

CREATE TABLE IF NOT EXISTS public.task_attachments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id        uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  update_id      uuid REFERENCES public.task_updates(id) ON DELETE CASCADE,
  kind           text NOT NULL CHECK (kind IN ('screenshot', 'photo', 'voice')),
  storage_path   text NOT NULL,
  mime           text,
  uploaded_by    uuid REFERENCES public.users(id) ON DELETE SET NULL
                   DEFAULT public.get_current_user_id(),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON public.task_attachments (task_id);

-- ---------------------------------------------------------------------------
-- 3. Bookkeeping trigger: updated_at, started_at, completed_at
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tasks_set_timestamps()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'in_progress' AND NEW.started_at IS NULL THEN
      NEW.started_at := now();
    END IF;
    IF NEW.status = 'done' THEN
      NEW.completed_at := now();
    ELSIF OLD.status = 'done' THEN
      NEW.completed_at := NULL;
    END IF;
    IF NEW.status <> 'blocked' AND OLD.status = 'blocked' THEN
      -- keep the note for history in task_updates; clear the live flag text
      NEW.blocker_note := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_set_timestamps ON public.tasks;
CREATE TRIGGER trg_tasks_set_timestamps
  BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_set_timestamps();

-- ---------------------------------------------------------------------------
-- 4. Visibility helper + RLS
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_view_task(p_task_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = p_task_id
      AND public.get_current_user_id() IN (t.created_by, t.assignee_id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_view_task(uuid) TO authenticated;

ALTER TABLE public.tasks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_updates     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tasks_select_own ON public.tasks;
CREATE POLICY tasks_select_own ON public.tasks
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.get_current_user_id() IN (created_by, assignee_id));

DROP POLICY IF EXISTS tasks_insert_own ON public.tasks;
CREATE POLICY tasks_insert_own ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (created_by = public.get_current_user_id());

DROP POLICY IF EXISTS tasks_update_own ON public.tasks;
CREATE POLICY tasks_update_own ON public.tasks
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.get_current_user_id() IN (created_by, assignee_id))
  WITH CHECK (public.is_admin() OR public.get_current_user_id() IN (created_by, assignee_id));

DROP POLICY IF EXISTS tasks_delete_own ON public.tasks;
CREATE POLICY tasks_delete_own ON public.tasks
  FOR DELETE TO authenticated
  USING (public.is_admin() OR created_by = public.get_current_user_id());

DROP POLICY IF EXISTS task_updates_select_own ON public.task_updates;
CREATE POLICY task_updates_select_own ON public.task_updates
  FOR SELECT TO authenticated
  USING (public.can_view_task(task_id));

DROP POLICY IF EXISTS task_updates_insert_own ON public.task_updates;
CREATE POLICY task_updates_insert_own ON public.task_updates
  FOR INSERT TO authenticated
  WITH CHECK (author_id = public.get_current_user_id() AND public.can_view_task(task_id));

DROP POLICY IF EXISTS task_updates_delete_own ON public.task_updates;
CREATE POLICY task_updates_delete_own ON public.task_updates
  FOR DELETE TO authenticated
  USING (public.is_admin() OR author_id = public.get_current_user_id());

DROP POLICY IF EXISTS task_attachments_select_own ON public.task_attachments;
CREATE POLICY task_attachments_select_own ON public.task_attachments
  FOR SELECT TO authenticated
  USING (public.can_view_task(task_id));

DROP POLICY IF EXISTS task_attachments_insert_own ON public.task_attachments;
CREATE POLICY task_attachments_insert_own ON public.task_attachments
  FOR INSERT TO authenticated
  WITH CHECK (public.can_view_task(task_id));

DROP POLICY IF EXISTS task_attachments_delete_own ON public.task_attachments;
CREATE POLICY task_attachments_delete_own ON public.task_attachments
  FOR DELETE TO authenticated
  USING (public.is_admin() OR uploaded_by = public.get_current_user_id());

-- Realtime: lets clients refresh task lists live (RLS still applies).
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.task_updates;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- 5. Storage bucket: task-attachments  (path = '<task_id>/<uuid>.<ext>')
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'task-attachments',
  'task-attachments',
  false,
  15728640, -- 15MB
  ARRAY['image/png', 'image/jpeg', 'image/webp',
        'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/aac', 'audio/x-m4a']
)
ON CONFLICT (id) DO NOTHING;

-- Guarded cast: a non-uuid first folder simply fails the check.
CREATE OR REPLACE FUNCTION public.can_view_task_path(p_name text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_folder text := split_part(p_name, '/', 1);
BEGIN
  IF v_folder !~ '^[0-9a-fA-F-]{36}$' THEN
    RETURN false;
  END IF;
  RETURN public.can_view_task(v_folder::uuid);
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_view_task_path(text) TO authenticated;

DROP POLICY IF EXISTS task_attachments_obj_select ON storage.objects;
CREATE POLICY task_attachments_obj_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'task-attachments' AND public.can_view_task_path(name));

DROP POLICY IF EXISTS task_attachments_obj_insert ON storage.objects;
CREATE POLICY task_attachments_obj_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'task-attachments' AND public.can_view_task_path(name));

DROP POLICY IF EXISTS task_attachments_obj_delete ON storage.objects;
CREATE POLICY task_attachments_obj_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'task-attachments' AND public.can_view_task_path(name));

-- ---------------------------------------------------------------------------
-- 6. Notification triggers (reuse notifications v2 helpers)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notif_v2_task_lifecycle()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_name text;
  v_prio       text := upper(NEW.priority::text);
  v_url        text := '/tasks?id=' || NEW.id::text;
  v_is_bug     boolean := NEW.source = 'bug_report';
BEGIN
  SELECT name INTO v_actor_name FROM users WHERE id = public.get_current_user_id();
  v_actor_name := COALESCE(v_actor_name, 'Someone');

  IF TG_OP = 'INSERT' THEN
    PERFORM public.notif_v2_notify(
      ARRAY[NEW.assignee_id],
      CASE WHEN v_is_bug THEN '🐞 Bug report: ' ELSE '📋 New task: ' END || NEW.title,
      v_actor_name || ' assigned you a ' || v_prio || ' priority, ' || NEW.size::text || ' task'
        || CASE WHEN NEW.due_date IS NOT NULL THEN ' (due ' || to_char(NEW.due_date, 'DD Mon') || ')' ELSE '' END,
      'task_assigned', 'tasks', NEW.id, v_url, NEW.site_id,
      true, 'task_assigned:' || NEW.id::text
    );
    RETURN NEW;
  END IF;

  -- Reassignment: notify the new assignee.
  IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
    PERFORM public.notif_v2_notify(
      ARRAY[NEW.assignee_id],
      '📋 Task assigned to you: ' || NEW.title,
      v_actor_name || ' assigned you a ' || v_prio || ' priority, ' || NEW.size::text || ' task',
      'task_assigned', 'tasks', NEW.id, v_url, NEW.site_id,
      true, 'task_assigned:' || NEW.id::text || ':' || NEW.assignee_id::text
    );
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'blocked' THEN
      PERFORM public.notif_v2_notify(
        ARRAY[NEW.created_by, NEW.assignee_id],
        '⛔ Blocked: ' || NEW.title,
        v_actor_name || ': ' || COALESCE(NULLIF(NEW.blocker_note, ''), 'needs your help'),
        'task_blocked', 'tasks', NEW.id, v_url, NEW.site_id,
        true, 'task_blocked:' || NEW.id::text || ':' || extract(epoch FROM now())::bigint::text
      );
    ELSIF NEW.status = 'done' THEN
      PERFORM public.notif_v2_resolve(NEW.id, ARRAY['task_assigned', 'task_blocked']);
      PERFORM public.notif_v2_notify(
        ARRAY[NEW.created_by],
        '✅ Done: ' || NEW.title,
        v_actor_name || ' completed this task',
        'task_done', 'tasks', NEW.id, v_url, NEW.site_id,
        false, 'task_done:' || NEW.id::text || ':' || extract(epoch FROM now())::bigint::text
      );
    ELSIF NEW.status = 'cancelled' THEN
      PERFORM public.notif_v2_resolve(NEW.id, ARRAY['task_assigned', 'task_blocked']);
    ELSIF OLD.status = 'blocked' THEN
      -- unblocked → the "needs action" blocker card is no longer actionable
      PERFORM public.notif_v2_resolve(NEW.id, ARRAY['task_blocked']);
      PERFORM public.notif_v2_notify(
        ARRAY[NEW.created_by, NEW.assignee_id],
        '▶️ Unblocked: ' || NEW.title,
        v_actor_name || ' moved this back to ' || replace(NEW.status::text, '_', ' '),
        'task_status', 'tasks', NEW.id, v_url, NEW.site_id,
        false, 'task_status:' || NEW.id::text || ':' || extract(epoch FROM now())::bigint::text
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_v2_task_lifecycle ON public.tasks;
CREATE TRIGGER trg_notif_v2_task_lifecycle
  AFTER INSERT OR UPDATE OF status, assignee_id ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.notif_v2_task_lifecycle();

CREATE OR REPLACE FUNCTION public.notif_v2_task_comment()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_task       public.tasks%ROWTYPE;
  v_actor_name text;
  v_text       text;
BEGIN
  -- status_change / blocker rows are covered by the lifecycle trigger.
  IF NEW.kind NOT IN ('comment', 'resolution') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_task FROM tasks WHERE id = NEW.task_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT name INTO v_actor_name FROM users WHERE id = NEW.author_id;
  v_text := COALESCE(NULLIF(NEW.body, ''), NULLIF(NEW.transcript_en, ''), NULLIF(NEW.transcript, ''), '🎤 Voice note');

  PERFORM public.notif_v2_notify(
    ARRAY[v_task.created_by, v_task.assignee_id],
    '💬 ' || v_task.title,
    COALESCE(v_actor_name, 'Someone') || ': ' || left(v_text, 140),
    'task_comment', 'tasks', v_task.id, '/tasks?id=' || v_task.id::text, v_task.site_id,
    false, 'task_comment:' || NEW.id::text
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_v2_task_comment ON public.task_updates;
CREATE TRIGGER trg_notif_v2_task_comment
  AFTER INSERT ON public.task_updates
  FOR EACH ROW EXECUTE FUNCTION public.notif_v2_task_comment();

REVOKE EXECUTE ON FUNCTION public.notif_v2_task_lifecycle() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notif_v2_task_comment()   FROM PUBLIC, anon, authenticated;
