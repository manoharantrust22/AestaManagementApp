-- move_settled_day_to_package: re-attribute an already-settled (paid) attendance day
-- onto a fixed-price task-work package, moving the whole single-laborer settlement with
-- it, and reverse the same move.
--
-- Why: work that was actually a fixed-price package was recorded as ordinary daily
-- attendance and then settled. Retagging only daily_attendance.task_work_package_id
-- (useAssignAttendanceToPackage) leaves the paid rupees booked under their old contract
-- in /site/expenses. This RPC also re-points the settlement_groups row via contract_ref
-- so the expenses ledger and the package profitability both attribute the money to the
-- package — money-neutral (no total/wallet change), and fully reversible.
--
-- Whole-settlement, single-laborer only: moving any one of a settlement's days moves the
-- entire settlement (all its attendance rows) onto the package. A settlement that also
-- covers other laborers or market crew is rejected — reverse it first.
--
-- Money-safety (verified against prod triggers):
--   * settlement_groups UPDATE fires only its updated_at trigger.
--   * daily_attendance task_work_package_id UPDATE does not recompute the settlement
--     total (recompute fires only on settlement_group_id / daily_earnings / is_deleted);
--     process_attendance_before_update recomputes daily_earnings idempotently for
--     self-consistent rows; trg_attendance_derive_task_work rebuilds the package day log.
--   * total_amount, is_paid, daily_earnings and the wallet spend are never touched.

ALTER TABLE public.settlement_groups
  ADD COLUMN IF NOT EXISTS package_move_prev jsonb;

COMMENT ON COLUMN public.settlement_groups.package_move_prev IS
  'Snapshot of the pre-move attribution (subcontract_id, contract_ref_kind, contract_ref_id, contract_laborer_id) captured by move_settled_day_to_package so the move can be reversed exactly. NULL when the settlement is not currently moved onto a package.';

CREATE OR REPLACE FUNCTION public.move_settled_day_to_package(
  p_site_id uuid,
  p_laborer_id uuid,
  p_attendance_ids uuid[],
  p_package_id uuid DEFAULT NULL   -- non-null = move onto package; NULL = reverse
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_group_ids uuid[];
  v_gid uuid;
  v_pkg_parent uuid;
  v_prev jsonb;
  v_ref text;
  v_amt numeric;
  v_refs text[] := '{}';
  v_total numeric := 0;
BEGIN
  -- Settlement group(s) behind the passed settled attendance rows (scoped to the site).
  SELECT ARRAY(
    SELECT DISTINCT da.settlement_group_id
    FROM daily_attendance da
    WHERE da.id = ANY(p_attendance_ids)
      AND da.site_id = p_site_id
      AND da.settlement_group_id IS NOT NULL
  ) INTO v_group_ids;

  IF v_group_ids IS NULL OR array_length(v_group_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No settled attendance rows found to move for this laborer/site.';
  END IF;

  IF p_package_id IS NOT NULL THEN
    ------------------------------------------------------------------ FORWARD
    SELECT parent_subcontract_id INTO v_pkg_parent
    FROM task_work_packages
    WHERE id = p_package_id AND site_id = p_site_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Package % not found on this site.', p_package_id;
    END IF;

    FOREACH v_gid IN ARRAY v_group_ids LOOP
      -- Guard: the settlement must belong ONLY to this laborer.
      IF EXISTS (
        SELECT 1 FROM daily_attendance da
        WHERE da.settlement_group_id = v_gid
          AND da.is_deleted = false
          AND da.laborer_id IS DISTINCT FROM p_laborer_id
      ) OR EXISTS (
        SELECT 1 FROM market_laborer_attendance ma
        WHERE ma.settlement_group_id = v_gid
      ) THEN
        RAISE EXCEPTION 'This settlement also covers other laborers or market crew — reverse it first, then move.';
      END IF;

      -- Snapshot the original attribution once, then re-point onto the package.
      UPDATE settlement_groups sg
      SET package_move_prev = COALESCE(sg.package_move_prev, jsonb_build_object(
            'subcontract_id',      sg.subcontract_id,
            'contract_ref_kind',   sg.contract_ref_kind,
            'contract_ref_id',     sg.contract_ref_id,
            'contract_laborer_id', sg.contract_laborer_id)),
          subcontract_id      = v_pkg_parent,
          contract_ref_kind   = 'task_work',
          contract_ref_id     = p_package_id,
          contract_laborer_id = p_laborer_id
      WHERE sg.id = v_gid AND sg.is_cancelled = false
      RETURNING sg.settlement_reference, sg.total_amount INTO v_ref, v_amt;

      IF v_ref IS NOT NULL THEN
        v_refs := v_refs || v_ref;
        v_total := v_total + COALESCE(v_amt, 0);
      END IF;

      -- Tag every attendance row of this settlement onto the package.
      UPDATE daily_attendance
      SET task_work_package_id = p_package_id
      WHERE settlement_group_id = v_gid
        AND is_deleted = false
        AND task_work_package_id IS DISTINCT FROM p_package_id;
    END LOOP;

  ELSE
    ------------------------------------------------------------------ REVERSE
    FOREACH v_gid IN ARRAY v_group_ids LOOP
      SELECT sg.package_move_prev INTO v_prev
      FROM settlement_groups sg WHERE sg.id = v_gid;

      UPDATE settlement_groups sg
      SET subcontract_id      = (v_prev->>'subcontract_id')::uuid,
          contract_ref_kind   = (v_prev->>'contract_ref_kind'),
          contract_ref_id     = (v_prev->>'contract_ref_id')::uuid,
          contract_laborer_id = (v_prev->>'contract_laborer_id')::uuid,
          package_move_prev   = NULL
      WHERE sg.id = v_gid AND sg.is_cancelled = false
      RETURNING sg.settlement_reference, sg.total_amount INTO v_ref, v_amt;

      IF v_ref IS NOT NULL THEN
        v_refs := v_refs || v_ref;
        v_total := v_total + COALESCE(v_amt, 0);
      END IF;

      -- Untag this settlement's attendance rows.
      UPDATE daily_attendance
      SET task_work_package_id = NULL
      WHERE settlement_group_id = v_gid
        AND is_deleted = false;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'settlement_refs', to_jsonb(v_refs),
    'moved_total',     v_total,
    'group_count',     array_length(v_group_ids, 1)
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.move_settled_day_to_package(uuid, uuid, uuid[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.move_settled_day_to_package(uuid, uuid, uuid[], uuid) TO authenticated, service_role;
