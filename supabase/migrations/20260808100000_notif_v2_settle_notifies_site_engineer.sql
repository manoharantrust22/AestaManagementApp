-- ============================================================================
-- Notifications v2 — "settle the vendor bill" is NOT an office-only step.
--
-- 20260717150100 encoded the ladder as SE → office → SE → SE → office and sent
-- the po_awaiting_settlement actionable to admin/office only. That is wrong for
-- this business: the owner hands the site engineer a cash float and the engineer
-- pays many vendors straight from his wallet (MaterialSettlementDialog forces
-- payment_channel='engineer_wallet' for a site_engineer, and RLS has allowed
-- those inserts since 20260612123000). PO-MS8VP70K-XDEW (Vairam Fly Ash Brick,
-- ₹7,298) sat delivered-and-unpaid because the only person holding the money was
-- never told — and the Hub told him "Waiting for office".
--
-- Fix: fan the settle actionable out to admin/office AND the site engineers
-- assigned to that site. notif_v2_notify already skips the acting user and
-- dedups on (user_id, event_key), and notif_v2_resolve clears the actionable for
-- EVERY recipient once any of them settles — so nobody is left with a stale
-- "needs your action". Client-side mirror: nextAction() tags vendor settlement
-- `who: "either"`.
--
-- Only the recipient list in the `delivered` branch changes; every other branch
-- is reproduced verbatim from 20260717150100.
-- ============================================================================

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
        -- CHANGED: office AND the site's engineers — either may pay the vendor.
        array_cat(
          public.notif_v2_admin_office_ids(),
          public.notif_v2_site_engineer_ids(NEW.site_id)
        ),
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

-- SECURITY DEFINER + PostgREST: keep it un-callable as an RPC (linter 0028).
-- CREATE OR REPLACE preserves existing grants, but this is idempotent and cheap.
REVOKE EXECUTE ON FUNCTION public.notif_v2_po_status() FROM PUBLIC, anon, authenticated;
