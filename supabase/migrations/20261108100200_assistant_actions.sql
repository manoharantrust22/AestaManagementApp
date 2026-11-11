-- Migration: Assistant action proposals / audit log (Phase 2)
-- Purpose: The in-app assistant never writes data directly. Each write it
--          wants to make is stored here as a 'proposed' action and shown to
--          the user as a confirm card. On confirm, /api/assistant/confirm
--          executes it with the user's own session (RLS applies) and records
--          the outcome. This table doubles as the audit trail.

CREATE TABLE IF NOT EXISTS public.assistant_actions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tool         text NOT NULL,
  args         jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary      text NOT NULL,
  status       text NOT NULL DEFAULT 'proposed'
                 CHECK (status IN ('proposed', 'executing', 'executed', 'cancelled', 'failed')),
  result       jsonb,
  error        text,
  transcript   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  decided_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_assistant_actions_user ON public.assistant_actions (user_id, created_at DESC);

ALTER TABLE public.assistant_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assistant_actions_select_own ON public.assistant_actions;
CREATE POLICY assistant_actions_select_own ON public.assistant_actions
  FOR SELECT TO authenticated
  USING (user_id = public.get_current_user_id() OR public.is_admin());

DROP POLICY IF EXISTS assistant_actions_insert_own ON public.assistant_actions;
CREATE POLICY assistant_actions_insert_own ON public.assistant_actions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.get_current_user_id() AND status = 'proposed');

DROP POLICY IF EXISTS assistant_actions_update_own ON public.assistant_actions;
CREATE POLICY assistant_actions_update_own ON public.assistant_actions
  FOR UPDATE TO authenticated
  USING (user_id = public.get_current_user_id())
  WITH CHECK (user_id = public.get_current_user_id());
