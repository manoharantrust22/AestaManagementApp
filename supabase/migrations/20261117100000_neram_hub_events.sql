-- Neram task hub: events from Neram Admin become Aesta notifications.
--
-- Neram Admin POSTs signed events to /api/neram/events, and Aesta also pulls
-- GET /api/hub/v1/events?after=<cursor> when the Tasks page opens (so a push
-- that never arrived is still caught). Both paths call
-- neram_hub_record_event(), which stores the event id once and writes one
-- notification per recipient through notif_v2_notify(), so the bell and phone
-- push work exactly as for Aesta's own notifications
-- (trg_notif_push_dispatch on notifications).
--
-- Only the service role (our server routes) touches these tables/functions.
-- RLS is on with no policies, and anon/authenticated have no grants.

-- ---------------------------------------------------------------------------
-- 1. Events already stored (the same event can arrive pushed and pulled)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.neram_hub_events (
  id           bigint PRIMARY KEY,           -- the hub's event id
  kind         text NOT NULL,
  task_id      text,
  to_user_ids  uuid[] NOT NULL DEFAULT '{}',
  subject      text NOT NULL,
  message      text NOT NULL,
  event_at     timestamptz,
  received_at  timestamptz NOT NULL DEFAULT now(),
  via          text NOT NULL DEFAULT 'push' CHECK (via IN ('push', 'pull'))
);

CREATE INDEX IF NOT EXISTS idx_neram_hub_events_task ON public.neram_hub_events (task_id);

-- ---------------------------------------------------------------------------
-- 2. Nonces seen on signed pushes (a request is good once, for 5 minutes)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.neram_hub_nonces (
  nonce        text PRIMARY KEY CHECK (length(nonce) BETWEEN 8 AND 100),
  received_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_neram_hub_nonces_received ON public.neram_hub_nonces (received_at);

-- ---------------------------------------------------------------------------
-- 3. Small key/value state: the pull cursor ('events_cursor')
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.neram_hub_state (
  key         text PRIMARY KEY,
  value       bigint NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.neram_hub_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.neram_hub_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.neram_hub_state  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.neram_hub_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.neram_hub_nonces FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.neram_hub_state  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.neram_hub_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.neram_hub_nonces TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.neram_hub_state  TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Claim a nonce: true the first time, false for a replay.
--    Also forgets nonces older than a day (the hub refuses anything older than
--    5 minutes anyway, so they can never be replayed).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.neram_hub_claim_nonce(p_nonce text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inserted int;
BEGIN
  DELETE FROM neram_hub_nonces WHERE received_at < now() - interval '1 day';
  INSERT INTO neram_hub_nonces (nonce) VALUES (p_nonce)
  ON CONFLICT (nonce) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted = 1;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Store one event and notify its people. Returns true when it was new,
--    false when that event id was already stored (nothing is sent again).
--    `to` ids that are not Aesta users are skipped.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.neram_hub_record_event(
  p_id       bigint,
  p_kind     text,
  p_task_id  text,
  p_to       uuid[],
  p_subject  text,
  p_message  text,
  p_at       timestamptz,
  p_via      text DEFAULT 'push'
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inserted   int;
  v_to         uuid[];
  v_related    uuid;
  v_type       text;
  v_needs      boolean;
  v_url        text;
BEGIN
  IF p_id IS NULL OR p_id <= 0 THEN
    RAISE EXCEPTION 'neram_hub_record_event: bad event id %', p_id;
  END IF;

  SELECT COALESCE(array_agg(u.id), '{}')
    INTO v_to
    FROM users u
   WHERE u.id = ANY (COALESCE(p_to, '{}'::uuid[]));

  INSERT INTO neram_hub_events (id, kind, task_id, to_user_ids, subject, message, event_at, via)
  VALUES (
    p_id, p_kind, NULLIF(p_task_id, ''), v_to,
    left(COALESCE(NULLIF(p_subject, ''), 'Task update'), 300),
    left(COALESCE(p_message, ''), 2000),
    p_at,
    CASE WHEN p_via = 'pull' THEN 'pull' ELSE 'push' END
  )
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    RETURN false;  -- already stored: ignore
  END IF;

  IF array_length(v_to, 1) IS NULL THEN
    RETURN true;   -- stored, nobody in Aesta to tell
  END IF;

  -- Hub task ids are uuids; keep anything else out of the uuid column.
  IF p_task_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_related := p_task_id::uuid;
  END IF;

  -- Same notification types as Aesta's own task alerts, so the bell shows them the same way.
  v_type := CASE p_kind
    WHEN 'assigned'       THEN 'task_assigned'
    WHEN 'blocked'        THEN 'task_blocked'
    WHEN 'waiting_on_you' THEN 'task_blocked'
    WHEN 'done'           THEN 'task_done'
    WHEN 'check_ok'       THEN 'task_done'
    WHEN 'comment'        THEN 'task_comment'
    ELSE 'task_status'    -- sent_back, check, changed
  END;
  v_needs := p_kind IN ('assigned', 'sent_back', 'check', 'blocked', 'waiting_on_you');
  v_url := CASE WHEN p_task_id IS NOT NULL AND p_task_id <> ''
                THEN '/tasks?id=' || p_task_id ELSE '/tasks' END;

  PERFORM public.notif_v2_notify(
    v_to,
    left(COALESCE(NULLIF(p_subject, ''), 'Task update'), 255),
    COALESCE(NULLIF(p_message, ''), p_subject, ''),
    v_type,
    'neram_tasks',
    v_related,
    v_url,
    NULL,
    v_needs,
    'neram_hub:' || p_id::text
  );
  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Move the pull cursor forward only (two pulls at once can't move it back).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.neram_hub_advance_cursor(p_key text, p_value bigint)
RETURNS bigint
LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  INSERT INTO neram_hub_state (key, value, updated_at)
  VALUES (p_key, GREATEST(COALESCE(p_value, 0), 0), now())
  ON CONFLICT (key) DO UPDATE
    SET value = GREATEST(neram_hub_state.value, EXCLUDED.value),
        updated_at = now()
  RETURNING value;
$$;

REVOKE EXECUTE ON FUNCTION public.neram_hub_claim_nonce(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.neram_hub_record_event(bigint, text, text, uuid[], text, text, timestamptz, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.neram_hub_advance_cursor(text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.neram_hub_claim_nonce(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.neram_hub_record_event(bigint, text, text, uuid[], text, text, timestamptz, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.neram_hub_advance_cursor(text, bigint) TO service_role;
