-- ============================================================================
-- Notifications v2 — Part A: teardown of the old notification system + schema
-- for the rebuilt one.
--
-- The old system (low-stock trigger, delivery-pending trigger, weekly salary/
-- attendance generators, client-side settlement notices) is removed wholesale.
-- The `notifications` table itself is KEPT (schema is sound) but wiped and
-- extended with:
--   needs_action — "this needs YOUR action" rows the bell pins on top; cleared
--                  automatically when the lifecycle advances past the step.
--   event_key    — per-user idempotency key so re-fired status transitions
--                  (e.g. the PO delivered double-write: app update + trigger)
--                  can never create duplicate rows.
--
-- RLS is rebuilt to exactly three own-row policies (select / update / delete).
-- There is deliberately NO insert policy: SECURITY DEFINER trigger functions
-- (installed in Part B) are the sole write path, so clients can't forge
-- notifications for other users.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Drop the old producers
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_check_low_stock ON public.stock_inventory;
DROP FUNCTION IF EXISTS public.check_low_stock_alerts();

DROP TRIGGER IF EXISTS trg_notify_delivery_pending ON public.deliveries;
DROP FUNCTION IF EXISTS public.notify_engineer_delivery_pending();

DROP FUNCTION IF EXISTS public.generate_weekly_notifications();

DROP VIEW IF EXISTS public.v_unread_notifications;

-- Web-push subscriptions: client hook was never mounted and no server-side
-- sender exists — dead storage. Recreatable when push v2 is built.
DROP TABLE IF EXISTS public.push_subscriptions;

-- ----------------------------------------------------------------------------
-- 2. Wipe old notification rows (user called them "completely useless")
-- ----------------------------------------------------------------------------
DELETE FROM public.notifications;

-- ----------------------------------------------------------------------------
-- 3. New columns + indexes
-- ----------------------------------------------------------------------------
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS needs_action boolean NOT NULL DEFAULT false;
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS event_key text;

-- Per-user idempotency: one row per (recipient, lifecycle event).
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_user_event
  ON public.notifications (user_id, event_key)
  WHERE event_key IS NOT NULL;

-- The bell's "Needs your action" section.
CREATE INDEX IF NOT EXISTS idx_notifications_user_needs_action
  ON public.notifications (user_id, needs_action)
  WHERE needs_action;

-- Housekeeping: idx_notifications_unread and idx_notifications_user_unread are
-- identical partial indexes — keep one.
DROP INDEX IF EXISTS public.idx_notifications_user_unread;

-- ----------------------------------------------------------------------------
-- 4. RLS: exactly one canonical own-row policy set, no client inserts
-- ----------------------------------------------------------------------------
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Old permissive set (incl. the WITH CHECK (true) insert hole).
DROP POLICY IF EXISTS "Users can create notifications for others" ON public.notifications;
DROP POLICY IF EXISTS "Users can read their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;
-- Old strict set.
DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
DROP POLICY IF EXISTS "notifications_delete" ON public.notifications;
-- Legacy blanket policies (live on prod only, not in repo files). Permissive
-- policies OR together, so any one of these would defeat the strict set below.
DROP POLICY IF EXISTS allow_authenticated_select_notifications ON public.notifications;
DROP POLICY IF EXISTS allow_authenticated_insert_notifications ON public.notifications;
DROP POLICY IF EXISTS allow_authenticated_update_notifications ON public.notifications;
DROP POLICY IF EXISTS allow_authenticated_delete_notifications ON public.notifications;
DROP POLICY IF EXISTS allow_anon_select_notifications ON public.notifications;
DROP POLICY IF EXISTS allow_anon_insert_notifications ON public.notifications;
DROP POLICY IF EXISTS allow_anon_update_notifications ON public.notifications;
DROP POLICY IF EXISTS allow_anon_delete_notifications ON public.notifications;

CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = public.get_current_user_id());

-- Mark-as-read only; user_id can't be re-pointed because WITH CHECK re-verifies.
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = public.get_current_user_id())
  WITH CHECK (user_id = public.get_current_user_id());

CREATE POLICY notifications_delete_own ON public.notifications
  FOR DELETE TO authenticated
  USING (user_id = public.get_current_user_id());

-- No INSERT policy: the SECURITY DEFINER trigger functions from Part B are the
-- only write path.

COMMENT ON COLUMN public.notifications.needs_action IS
  'True while the notification calls for the recipient''s own action; cleared by fn_resolve_notifications when the lifecycle advances past that step.';
COMMENT ON COLUMN public.notifications.event_key IS
  'Per-user idempotency key (e.g. po_awaiting_delivery:<po_id>) — unique with user_id so re-fired transitions never duplicate rows.';
