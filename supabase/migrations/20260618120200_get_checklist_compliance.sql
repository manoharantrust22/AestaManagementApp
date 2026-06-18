-- Migration: Daily Compliance Checklist — resolver RPC
--
-- get_checklist_compliance(company, start, end, [user]) returns a jsonb array of
-- one row per (responsible user × site × active template item × date) with a
-- unified status computed from the REAL backing records plus the engineer's
-- checklist_entries overlay.
--
-- SECURITY DEFINER so the office can read other users' attendance/usage/delivery/
-- wallet rows; an explicit caller-authorization guard restricts who may call it:
--   - admin/office of the company (full company view), or
--   - a user requesting only their own rows (p_user_id = self).
--
-- Timeliness is the load-bearing detail: every "when was it filled" timestamp is
-- cast AT TIME ZONE 'Asia/Kolkata' BEFORE ::date, so an evening IST entry
-- (18:30–24:00, which is the next day in UTC) is not mis-bucketed as "late".
--
-- Status values:
--   on_time          detected on the activity's own date (or manual-done same day)
--   late             detected the next day or later, and NOT deferred
--   deferred_done    detected late, but the engineer had deferred it (acceptable)
--   deferred_pending engineer deferred; deadline not yet passed; not yet done
--   missed           past date, not done, not (validly) deferred
--   pending          today (or future), not yet done
--   na               nothing to do (manual "nothing to log", or delivery/wallet with no candidate)
--
-- Detection sources are a closed set mirrored by the CHECK on checklist_templates.
-- wallet_settlement is intentionally lenient in v1 (detects same-day wallet
-- activity; no reliable "pending settlement due" signal exists yet) — the engineer
-- clears it via a manual na/defer when nothing is pending. Refining wallet "due"
-- (likely via v_engineer_wallet_pools) is a documented follow-up that touches only
-- this one CASE branch.

CREATE OR REPLACE FUNCTION public.get_checklist_compliance(
  p_company_id uuid,
  p_start_date date,
  p_end_date date,
  p_user_id uuid DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_role public.user_role;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_result jsonb;
BEGIN
  -- ---- caller authorization guard ----
  SELECT id, role INTO v_caller_id, v_caller_role
  FROM public.users WHERE auth_id = auth.uid();

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT (
    (v_caller_role IN ('admin', 'office') AND public.can_access_company(p_company_id))
    OR (p_user_id IS NOT NULL AND p_user_id = v_caller_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized to view checklist compliance for this company';
  END IF;

  -- ---- build matrix + resolve + overlay ----
  WITH dates AS (
    SELECT d::date AS business_date
    FROM generate_series(p_start_date, p_end_date, interval '1 day') d
  ),
  company_sites AS (
    SELECT id, name FROM public.sites WHERE company_id = p_company_id
  ),
  active_templates AS (
    SELECT * FROM public.checklist_templates
    WHERE company_id = p_company_id AND is_active
  ),
  members AS (
    SELECT u.id AS user_id,
           COALESCE(u.display_name, u.name) AS user_name,
           u.role,
           u.assigned_sites
    FROM public.users u
    WHERE u.status = 'active'
      AND (p_user_id IS NULL OR u.id = p_user_id)
      AND EXISTS (
        SELECT 1 FROM company_sites cs
        WHERE cs.id = ANY(COALESCE(u.assigned_sites, '{}'::uuid[]))
      )
  ),
  matrix AS (
    -- per_site items expand across each member's assigned company sites
    SELECT m.user_id, m.user_name, m.role,
           cs.id AS site_id, cs.name AS site_name,
           t.id AS template_id, t.item_key, t.label, t.description,
           t.detection_type, t.detection_source, t.deep_link_path,
           t.applies_scope, t.sort_order, t.allow_defer, t.requires_defer_reason,
           d.business_date
    FROM members m
    JOIN active_templates t ON t.role = m.role AND t.applies_scope = 'per_site'
    JOIN company_sites cs ON cs.id = ANY(COALESCE(m.assigned_sites, '{}'::uuid[]))
    CROSS JOIN dates d
    UNION ALL
    -- per_user items (site_id null)
    SELECT m.user_id, m.user_name, m.role,
           NULL::uuid AS site_id, NULL::text AS site_name,
           t.id AS template_id, t.item_key, t.label, t.description,
           t.detection_type, t.detection_source, t.deep_link_path,
           t.applies_scope, t.sort_order, t.allow_defer, t.requires_defer_reason,
           d.business_date
    FROM members m
    JOIN active_templates t ON t.role = m.role AND t.applies_scope = 'per_user'
    CROSS JOIN dates d
  ),
  resolved AS (
    SELECT mx.*,
      CASE mx.detection_source
        WHEN 'attendance_morning' THEN (
          SELECT min(COALESCE(da.morning_entry_at, da.created_at))
          FROM public.daily_attendance da
          WHERE da.site_id = mx.site_id AND da.date = mx.business_date
            AND da.is_deleted = false
            AND (da.morning_entry_at IS NOT NULL
                 OR da.attendance_status IN ('morning_entry', 'confirmed'))
        )
        WHEN 'attendance_evening' THEN (
          SELECT min(da.confirmed_at)
          FROM public.daily_attendance da
          WHERE da.site_id = mx.site_id AND da.date = mx.business_date
            AND da.is_deleted = false AND da.confirmed_at IS NOT NULL
        )
        WHEN 'stock_confirmation' THEN (
          SELECT dsc.confirmed_at
          FROM public.daily_stock_confirmations dsc
          WHERE dsc.site_id = mx.site_id AND dsc.business_date = mx.business_date
        )
        WHEN 'material_usage' THEN (
          SELECT min(z.c) FROM (
            SELECT created_at AS c FROM public.daily_material_usage
            WHERE site_id = mx.site_id AND usage_date = mx.business_date
            UNION ALL
            SELECT created_at AS c FROM public.batch_usage_records
            WHERE usage_site_id = mx.site_id AND usage_date = mx.business_date
          ) z
        )
        WHEN 'wallet_settlement' THEN (
          SELECT min(se.created_at)
          FROM public.site_engineer_transactions se
          WHERE se.user_id = mx.user_id AND se.site_id = mx.site_id
            AND se.transaction_date = mx.business_date
        )
        WHEN 'delivery_status' THEN (
          SELECT min(z.ts) FROM (
            SELECT recorded_at AS ts FROM public.deliveries
            WHERE site_id = mx.site_id AND recorded_at IS NOT NULL
              AND (recorded_at AT TIME ZONE 'Asia/Kolkata')::date = mx.business_date
            UNION ALL
            SELECT engineer_verified_at AS ts FROM public.deliveries
            WHERE site_id = mx.site_id AND engineer_verified_at IS NOT NULL
              AND (engineer_verified_at AT TIME ZONE 'Asia/Kolkata')::date = mx.business_date
          ) z
        )
        ELSE NULL
      END AS detected_at,
      -- "is there delivery work due?" — current-status approximation (v1)
      CASE WHEN mx.detection_source = 'delivery_status' THEN (
        EXISTS (
          SELECT 1 FROM public.purchase_orders po
          WHERE po.site_id = mx.site_id
            AND po.status IN ('ordered', 'partial_delivered')
        )
        OR EXISTS (
          SELECT 1 FROM public.deliveries d
          WHERE d.site_id = mx.site_id
            AND d.delivery_status = 'delivered'
            AND d.verification_status = 'pending'
        )
      ) ELSE true END AS has_candidate
    FROM matrix mx
  ),
  overlaid AS (
    SELECT r.*,
      e.status AS overlay_status, e.completed_at, e.deferred_to,
      e.defer_reason, e.note
    FROM resolved r
    LEFT JOIN public.checklist_entries e
      ON e.template_id = r.template_id
     AND e.user_id = r.user_id
     AND e.business_date = r.business_date
     AND (e.site_id = r.site_id OR (e.site_id IS NULL AND r.site_id IS NULL))
  ),
  final AS (
    SELECT o.*,
      CASE
        WHEN o.detected_at IS NOT NULL
             AND (o.detected_at AT TIME ZONE 'Asia/Kolkata')::date <= o.business_date
          THEN 'on_time'
        WHEN o.detected_at IS NOT NULL AND o.overlay_status = 'deferred'
          THEN 'deferred_done'
        WHEN o.detected_at IS NOT NULL
          THEN 'late'
        WHEN o.overlay_status = 'done'
          THEN CASE WHEN o.completed_at IS NOT NULL
                     AND (o.completed_at AT TIME ZONE 'Asia/Kolkata')::date <= o.business_date
                    THEN 'on_time' ELSE 'late' END
        WHEN o.overlay_status = 'na'
          THEN 'na'
        WHEN o.detection_source = 'delivery_status' AND o.has_candidate = false
          THEN 'na'
        WHEN o.overlay_status = 'deferred'
             AND COALESCE(o.deferred_to, o.business_date) >= v_today
          THEN 'deferred_pending'
        WHEN o.business_date < v_today
          THEN 'missed'
        ELSE 'pending'
      END AS status
    FROM overlaid o
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'user_id', f.user_id,
        'user_name', f.user_name,
        'role', f.role,
        'site_id', f.site_id,
        'site_name', f.site_name,
        'template_id', f.template_id,
        'item_key', f.item_key,
        'label', f.label,
        'description', f.description,
        'detection_type', f.detection_type,
        'detection_source', f.detection_source,
        'deep_link_path', f.deep_link_path,
        'applies_scope', f.applies_scope,
        'sort_order', f.sort_order,
        'allow_defer', f.allow_defer,
        'requires_defer_reason', f.requires_defer_reason,
        'business_date', f.business_date,
        'status', f.status,
        'detected_at', f.detected_at,
        'overlay_status', f.overlay_status,
        'completed_at', f.completed_at,
        'deferred_to', f.deferred_to,
        'defer_reason', f.defer_reason,
        'note', f.note,
        'has_candidate', f.has_candidate
      )
      ORDER BY f.user_name, f.site_name NULLS FIRST, f.sort_order, f.business_date
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM final f;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_checklist_compliance(uuid, date, date, uuid) IS
'Daily checklist compliance matrix: one row per responsible user x site x active template item x date, with a unified status from real backing records + checklist_entries overlay. IST timeliness. SECURITY DEFINER with a caller-authorization guard (admin/office of company, or self).';

GRANT EXECUTE ON FUNCTION public.get_checklist_compliance(uuid, date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_checklist_compliance(uuid, date, date, uuid) TO service_role;
