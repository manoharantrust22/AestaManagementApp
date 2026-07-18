-- ============================================================================
-- Notifications v2 — Part B: material-lifecycle notification triggers.
--
-- Every stage of the request → PO → delivery → settlement chain notifies the
-- role that owns the NEXT step (the ladder is SE → office → SE → SE → office):
--
--   MR submitted            → admin/office  ACTIONABLE mr_awaiting_po
--   MR approved             → requester     FYI        mr_approved   (+resolve)
--   MR rejected/cancelled   → requester     FYI        mr_rejected/mr_cancelled
--   PO created (draft)      → site eng.     FYI        po_created    (+resolve)
--   PO ordered              → site eng.     ACTIONABLE po_awaiting_delivery
--   PO fully delivered      → admin/office  ACTIONABLE po_awaiting_settlement
--   Vendor bill settled     → site eng.     FYI        po_settled    (+resolve)
--   PO cancelled            → requester     FYI        po_cancelled  (+resolve)
--
-- Design rules:
--   * DB triggers, not app code — MR/PO status writes are scattered across
--     ~15 direct-update hooks; a trigger fires for every path.
--   * `WHEN (OLD.status IS DISTINCT FROM NEW.status)` + a per-user unique
--     event_key make re-fired transitions (the PO delivered double-write:
--     app update AND trg_update_po_status_on_delivery) idempotent.
--   * Actionables auto-clear: each downstream transition calls
--     notif_v2_resolve() so "needs your action" never goes stale.
--   * partial_delivered is deliberately SILENT (repeat delivery batches would
--     spam; the settle actionable waits for the full delivery).
--   * All functions are SECURITY DEFINER (owner postgres) — the notifications
--     table has NO insert policy, so these are the only write path.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------------------

-- Active back-office recipients.
CREATE OR REPLACE FUNCTION public.notif_v2_admin_office_ids()
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(array_agg(id), '{}')
  FROM users
  WHERE role IN ('admin', 'office') AND status = 'active';
$$;

-- Active site engineers assigned to a site (users.assigned_sites uuid[] is the
-- only user↔site link in this schema).
CREATE OR REPLACE FUNCTION public.notif_v2_site_engineer_ids(p_site_id uuid)
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(array_agg(id), '{}')
  FROM users
  WHERE role = 'site_engineer'
    AND status = 'active'
    AND p_site_id = ANY(assigned_sites);
$$;

-- Fan a notification out to recipients. Skips the acting user (they don't need
-- to be told about their own click) and dedups on (user_id, event_key).
CREATE OR REPLACE FUNCTION public.notif_v2_notify(
  p_user_ids      uuid[],
  p_title         text,
  p_message       text,
  p_type          text,
  p_related_table text,
  p_related_id    uuid,
  p_action_url    text,
  p_site_id       uuid,
  p_needs_action  boolean,
  p_event_key     text,
  p_expires_at    timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := public.get_current_user_id();
  v_user  uuid;
BEGIN
  IF p_user_ids IS NULL THEN
    RETURN;
  END IF;

  FOREACH v_user IN ARRAY p_user_ids LOOP
    CONTINUE WHEN v_user IS NULL OR v_user = v_actor;
    INSERT INTO notifications (
      user_id, title, message, notification_type,
      related_table, related_id, action_url, site_id,
      needs_action, event_key, expires_at
    )
    VALUES (
      v_user, p_title, p_message, p_type,
      p_related_table, p_related_id, p_action_url, p_site_id,
      p_needs_action, p_event_key, p_expires_at
    )
    ON CONFLICT (user_id, event_key) WHERE event_key IS NOT NULL DO NOTHING;
  END LOOP;
END;
$$;

-- Clear "needs your action" for ALL recipients once the step is done (e.g. a
-- PO exists → every office user's mr_awaiting_po is resolved, not just the
-- actor's).
CREATE OR REPLACE FUNCTION public.notif_v2_resolve(
  p_related_id uuid,
  p_types      text[]
)
RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE notifications
  SET needs_action = false,
      is_read = true,
      read_at = COALESCE(read_at, now())
  WHERE related_id = p_related_id
    AND notification_type = ANY(p_types)
    AND needs_action;
$$;

-- Material names on a request, e.g. "PPC Cement, TMT 16mm" (NULL when the
-- request's items haven't been inserted yet — callers fall back gracefully).
CREATE OR REPLACE FUNCTION public.notif_v2_mr_materials(p_request_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT left(string_agg(DISTINCT m.name, ', '), 160)
  FROM material_request_items mri
  JOIN materials m ON m.id = mri.material_id
  WHERE mri.request_id = p_request_id;
$$;

REVOKE EXECUTE ON FUNCTION public.notif_v2_admin_office_ids() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notif_v2_site_engineer_ids(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notif_v2_notify(uuid[], text, text, text, text, uuid, text, uuid, boolean, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notif_v2_resolve(uuid, text[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notif_v2_mr_materials(uuid) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- T1/T2 — request submitted (INSERT as pending, or draft → pending)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notif_v2_mr_submitted()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_site_name text;
  v_materials text;
BEGIN
  SELECT name INTO v_site_name FROM sites WHERE id = NEW.site_id;
  -- On INSERT the request items usually don't exist yet (they're inserted in a
  -- follow-up statement) — the message just omits the material list then.
  v_materials := public.notif_v2_mr_materials(NEW.id);

  PERFORM public.notif_v2_notify(
    public.notif_v2_admin_office_ids(),
    'New material request',
    COALESCE(v_site_name, 'Site') || ': ' || NEW.request_number
      || COALESCE(' — ' || v_materials, '')
      || ' · create a PO or reject',
    'mr_awaiting_po',
    'material_requests',
    NEW.id,
    '/site/materials/hub?focusThread=' || NEW.id,
    NEW.site_id,
    true,
    'mr_awaiting_po:' || NEW.id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_v2_mr_created ON public.material_requests;
CREATE TRIGGER trg_notif_v2_mr_created
  AFTER INSERT ON public.material_requests
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION public.notif_v2_mr_submitted();

DROP TRIGGER IF EXISTS trg_notif_v2_mr_submitted ON public.material_requests;
CREATE TRIGGER trg_notif_v2_mr_submitted
  AFTER UPDATE OF status ON public.material_requests
  FOR EACH ROW
  WHEN (OLD.status = 'draft' AND NEW.status = 'pending')
  EXECUTE FUNCTION public.notif_v2_mr_submitted();

-- ----------------------------------------------------------------------------
-- T2b — request approved (either via PO creation's implicit approval or the
-- kebab's "Approve without PO")
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notif_v2_mr_approved()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_site_name text;
BEGIN
  PERFORM public.notif_v2_resolve(NEW.id, ARRAY['mr_awaiting_po']);

  SELECT name INTO v_site_name FROM sites WHERE id = NEW.site_id;
  PERFORM public.notif_v2_notify(
    ARRAY[NEW.requested_by],
    'Request approved',
    NEW.request_number || ' at ' || COALESCE(v_site_name, 'your site') || ' was approved.',
    'mr_approved',
    'material_requests',
    NEW.id,
    '/site/materials/hub?focusThread=' || NEW.id,
    NEW.site_id,
    false,
    'mr_approved:' || NEW.id,
    now() + interval '30 days'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_v2_mr_approved ON public.material_requests;
CREATE TRIGGER trg_notif_v2_mr_approved
  AFTER UPDATE OF status ON public.material_requests
  FOR EACH ROW
  WHEN (OLD.status = 'pending' AND NEW.status = 'approved')
  EXECUTE FUNCTION public.notif_v2_mr_approved();

-- ----------------------------------------------------------------------------
-- T3 — request rejected / cancelled
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notif_v2_mr_closed()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_site_name text;
  v_verb text := CASE WHEN NEW.status = 'rejected' THEN 'rejected' ELSE 'cancelled' END;
BEGIN
  PERFORM public.notif_v2_resolve(NEW.id, ARRAY['mr_awaiting_po']);

  SELECT name INTO v_site_name FROM sites WHERE id = NEW.site_id;
  PERFORM public.notif_v2_notify(
    ARRAY[NEW.requested_by],
    'Request ' || v_verb,
    NEW.request_number || ' at ' || COALESCE(v_site_name, 'your site')
      || ' was ' || v_verb
      || COALESCE(': ' || NULLIF(NEW.rejection_reason, ''), '') || '.',
    'mr_' || v_verb,
    'material_requests',
    NEW.id,
    '/site/materials/hub?focusThread=' || NEW.id,
    NEW.site_id,
    false,
    'mr_' || v_verb || ':' || NEW.id,
    now() + interval '30 days'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_v2_mr_closed ON public.material_requests;
CREATE TRIGGER trg_notif_v2_mr_closed
  AFTER UPDATE OF status ON public.material_requests
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('rejected', 'cancelled'))
  EXECUTE FUNCTION public.notif_v2_mr_closed();

-- ----------------------------------------------------------------------------
-- T4 — PO created from a request (INSERT). The office's mr_awaiting_po is done
-- the moment ANY PO exists (even a draft). PO items are inserted after the PO
-- row, so material names come from the source request's items.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notif_v2_po_created()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_site_name text;
  v_materials text;
BEGIN
  PERFORM public.notif_v2_resolve(NEW.source_request_id, ARRAY['mr_awaiting_po']);

  SELECT name INTO v_site_name FROM sites WHERE id = NEW.site_id;
  v_materials := public.notif_v2_mr_materials(NEW.source_request_id);

  IF NEW.status = 'ordered' THEN
    PERFORM public.notif_v2_notify(
      public.notif_v2_site_engineer_ids(NEW.site_id),
      'PO placed for ' || COALESCE(v_materials, 'your request'),
      NEW.po_number || ' at ' || COALESCE(v_site_name, 'your site')
        || ' · record the delivery when the material arrives.',
      'po_awaiting_delivery',
      'purchase_orders',
      NEW.id,
      '/site/materials/hub?focusThread=' || COALESCE(NEW.source_request_id, NEW.id),
      NEW.site_id,
      true,
      'po_awaiting_delivery:' || NEW.id
    );
  ELSE
    PERFORM public.notif_v2_notify(
      public.notif_v2_site_engineer_ids(NEW.site_id),
      'PO created for ' || COALESCE(v_materials, 'your request'),
      NEW.po_number || ' at ' || COALESCE(v_site_name, 'your site') || ' — not yet ordered.',
      'po_created',
      'purchase_orders',
      NEW.id,
      '/site/materials/hub?focusThread=' || COALESCE(NEW.source_request_id, NEW.id),
      NEW.site_id,
      false,
      'po_created:' || NEW.id,
      now() + interval '30 days'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_v2_po_created ON public.purchase_orders;
CREATE TRIGGER trg_notif_v2_po_created
  AFTER INSERT ON public.purchase_orders
  FOR EACH ROW
  WHEN (NEW.source_request_id IS NOT NULL AND NEW.status <> 'cancelled')
  EXECUTE FUNCTION public.notif_v2_po_created();

-- ----------------------------------------------------------------------------
-- T5 — PO status transitions (ordered / delivered / cancelled).
-- partial_delivered is silent by design. The delivered branch is guarded by
-- OLD IS DISTINCT FROM NEW + event_key, so the app-update/trigger double-write
-- yields at most one row per recipient.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notif_v2_po_status()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_site_name   text;
  v_vendor_name text;
  v_materials   text;
  v_requester   uuid;
  v_mr_number   text;
BEGIN
  SELECT name INTO v_site_name FROM sites WHERE id = NEW.site_id;

  IF NEW.status = 'ordered' THEN
    v_materials := public.notif_v2_mr_materials(NEW.source_request_id);
    PERFORM public.notif_v2_notify(
      public.notif_v2_site_engineer_ids(NEW.site_id),
      'PO placed for ' || COALESCE(v_materials, 'materials'),
      NEW.po_number || ' at ' || COALESCE(v_site_name, 'your site')
        || ' · record the delivery when the material arrives.',
      'po_awaiting_delivery',
      'purchase_orders',
      NEW.id,
      '/site/materials/hub?focusThread=' || COALESCE(NEW.source_request_id, NEW.id),
      NEW.site_id,
      true,
      'po_awaiting_delivery:' || NEW.id
    );

  ELSIF NEW.status = 'delivered' THEN
    PERFORM public.notif_v2_resolve(NEW.id, ARRAY['po_awaiting_delivery']);

    -- Advance POs were settled at PO time; already-paid expenses need nothing.
    IF NOT (NEW.payment_timing = 'advance' AND COALESCE(NEW.advance_paid, 0) > 0)
       AND NOT EXISTS (
         SELECT 1 FROM material_purchase_expenses
         WHERE purchase_order_id = NEW.id AND is_paid = true
       )
    THEN
      SELECT name INTO v_vendor_name FROM vendors WHERE id = NEW.vendor_id;
      PERFORM public.notif_v2_notify(
        public.notif_v2_admin_office_ids(),
        'Delivery complete — settle vendor bill',
        NEW.po_number
          || COALESCE(' (' || v_vendor_name || ')', '')
          || ' fully delivered at ' || COALESCE(v_site_name, 'site') || '.',
        'po_awaiting_settlement',
        'purchase_orders',
        NEW.id,
        '/site/materials/hub?focusThread=' || COALESCE(NEW.source_request_id, NEW.id),
        NEW.site_id,
        true,
        'po_awaiting_settlement:' || NEW.id
      );
    END IF;

  ELSIF NEW.status = 'cancelled' THEN
    PERFORM public.notif_v2_resolve(
      NEW.id, ARRAY['po_awaiting_delivery', 'po_awaiting_settlement']
    );

    IF NEW.source_request_id IS NOT NULL THEN
      SELECT requested_by, request_number INTO v_requester, v_mr_number
      FROM material_requests WHERE id = NEW.source_request_id;
      PERFORM public.notif_v2_notify(
        ARRAY[v_requester],
        'PO cancelled',
        NEW.po_number || ' for ' || COALESCE(v_mr_number, 'your request')
          || ' was cancelled.',
        'po_cancelled',
        'purchase_orders',
        NEW.id,
        '/site/materials/hub?focusThread=' || NEW.source_request_id,
        NEW.site_id,
        false,
        'po_cancelled:' || NEW.id,
        now() + interval '30 days'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_v2_po_status ON public.purchase_orders;
CREATE TRIGGER trg_notif_v2_po_status
  AFTER UPDATE OF status ON public.purchase_orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.notif_v2_po_status();

-- ----------------------------------------------------------------------------
-- T6 — vendor bill settled (material_purchase_expenses.is_paid flips true)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notif_v2_expense_settled()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_po_number  text;
  v_source_mr  uuid;
BEGIN
  PERFORM public.notif_v2_resolve(NEW.purchase_order_id, ARRAY['po_awaiting_settlement']);

  SELECT po_number, source_request_id INTO v_po_number, v_source_mr
  FROM purchase_orders WHERE id = NEW.purchase_order_id;

  PERFORM public.notif_v2_notify(
    public.notif_v2_site_engineer_ids(NEW.site_id),
    'Vendor settled',
    COALESCE(v_po_number, NEW.ref_code) || ' — bill paid.',
    'po_settled',
    'purchase_orders',
    NEW.purchase_order_id,
    '/site/materials/hub?focusThread=' || COALESCE(v_source_mr, NEW.purchase_order_id),
    NEW.site_id,
    false,
    'po_settled:' || NEW.id,
    now() + interval '30 days'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notif_v2_expense_settled ON public.material_purchase_expenses;
CREATE TRIGGER trg_notif_v2_expense_settled
  AFTER UPDATE OF is_paid ON public.material_purchase_expenses
  FOR EACH ROW
  WHEN (COALESCE(OLD.is_paid, false) = false AND NEW.is_paid = true AND NEW.purchase_order_id IS NOT NULL)
  EXECUTE FUNCTION public.notif_v2_expense_settled();

-- ----------------------------------------------------------------------------
-- Lock down the trigger functions themselves: they are SECURITY DEFINER and
-- would otherwise be executable by anon/authenticated via PostgREST RPC
-- (security linter 0028). Trigger firing does not require EXECUTE for the
-- DML role, so revoking is safe.
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.notif_v2_mr_submitted() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notif_v2_mr_approved() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notif_v2_mr_closed() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notif_v2_po_created() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notif_v2_po_status() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notif_v2_expense_settled() FROM PUBLIC, anon, authenticated;
