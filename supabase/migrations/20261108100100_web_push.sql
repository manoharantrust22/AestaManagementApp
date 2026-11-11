-- Migration: Web push for notifications v2 (Phase 1b)
-- Purpose: Deliver every new notifications row to the recipient's phone via
--          Web Push, even when the PWA is closed.
--
-- Flow: notifications INSERT → AFTER trigger → pg_net POST to the Next.js
--       route /api/push/dispatch (shared secret) → web-push → browser push
--       service → service worker 'push' handler.
--
-- Config lives in Vault (not in this file):
--   select vault.create_secret('https://<app-domain>/api/push/dispatch', 'push_dispatch_url');
--   select vault.create_secret('<random secret = PUSH_DISPATCH_SECRET env>', 'push_dispatch_secret');
-- If either secret is missing the trigger is a silent no-op, so applying this
-- migration before the env/secrets exist is safe.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- 1. Subscriptions (one row per browser/device)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint     text NOT NULL UNIQUE,
  p256dh       text NOT NULL,
  auth         text NOT NULL,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subscriptions_select_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_select_own ON public.push_subscriptions
  FOR SELECT TO authenticated
  USING (user_id = public.get_current_user_id());

DROP POLICY IF EXISTS push_subscriptions_insert_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_insert_own ON public.push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = public.get_current_user_id());

DROP POLICY IF EXISTS push_subscriptions_delete_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_delete_own ON public.push_subscriptions
  FOR DELETE TO authenticated
  USING (user_id = public.get_current_user_id());

-- ---------------------------------------------------------------------------
-- 2. Dispatch trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notif_push_dispatch()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_url    text;
  v_secret text;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip users with no device registered (cheap check, avoids a pointless HTTP call).
  IF NOT EXISTS (SELECT 1 FROM push_subscriptions WHERE user_id = NEW.user_id) THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT decrypted_secret INTO v_url    FROM vault.decrypted_secrets WHERE name = 'push_dispatch_url'    LIMIT 1;
    SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'push_dispatch_secret' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW; -- vault unavailable → never block the notification insert
  END;

  IF v_url IS NULL OR v_secret IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url     := v_url,
      body    := jsonb_build_object('notification_id', NEW.id),
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'x-push-secret', v_secret
                 ),
      timeout_milliseconds := 5000
    );
  EXCEPTION WHEN OTHERS THEN
    -- Push is best-effort; the in-app bell still has the row.
    RAISE WARNING 'notif_push_dispatch failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notif_push_dispatch() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notif_push_dispatch ON public.notifications;
CREATE TRIGGER trg_notif_push_dispatch
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notif_push_dispatch();
