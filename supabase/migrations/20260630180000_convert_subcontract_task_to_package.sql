-- Migration: Convert a fixed-price subcontract TASK into a task-work PACKAGE
--
-- Why:
--   Fixed-price work can be created two ways today — as a `subcontracts` task
--   (count-by-role / payments-only screen) or as a `task_work_packages` row
--   (the rich Day-Log + Extras + Payments screen, "like Barun's"). A task created
--   the first way (e.g. "WaterTank") has no way to adopt the Day-Log experience.
--   This RPC moves a clean leaf task into the package model so it nests under the
--   SAME parent and gains the standardized fixed-price recording surface.
--
-- Scope:
--   Converts a LEAF task (no child sections/tasks, no attached packages). Any
--   "count labourers by role" days already logged are CARRIED OVER into the
--   package's Day Log (one costed day-log row per date, worker types × count ×
--   rate) so no effort tracking is lost. It still refuses when the task carries
--   data with no clean mapping into a package: per-laborer attendance (detailed
--   mode), crew/day (mid mode), or recorded payments — the user clears those first.
--
-- Atomicity & security:
--   Runs in one transaction. SECURITY DEFINER (matches promote_to_parent_contract)
--   so it can clear the rate-card child rows and delete the task without tripping
--   per-table RLS — but it FIRST enforces public.can_access_site(site_id), so a user
--   can only convert a task on a site they can access. If anything fails — e.g. an
--   unexpected FK blocks the delete — the whole conversion rolls back, leaving the
--   original task untouched.

CREATE OR REPLACE FUNCTION public.convert_subcontract_task_to_package(
  p_subcontract_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  sc                 public.subcontracts%ROWTYPE;
  v_pkg_id           uuid;
  v_package_number   text;
  v_maistry_name     text;
  v_pricing_mode     text;
  v_measurement_unit public.measurement_unit;
  v_total_units      numeric(12,2);
  v_rate_per_unit    numeric(10,2);
  v_created_by       uuid;
  v_cnt              integer;
BEGIN
  -- 1. Load the task and authorize (DEFINER bypasses RLS, so gate explicitly).
  SELECT * INTO sc FROM public.subcontracts WHERE id = p_subcontract_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'convert_subcontract_task_to_package: subcontract % not found', p_subcontract_id;
  END IF;
  IF NOT public.can_access_site(sc.site_id) THEN
    RAISE EXCEPTION 'Not authorized to modify work on this site.';
  END IF;

  -- created_by references public.users(id), which is NOT auth.uid() (auth id) —
  -- resolve the caller's profile row via auth_id; NULL if unmapped (audit-only).
  SELECT id INTO v_created_by FROM public.users WHERE auth_id = auth.uid();

  -- 2. Must be a LEAF — no child sections/tasks.
  SELECT count(*) INTO v_cnt
  FROM public.subcontracts WHERE parent_subcontract_id = p_subcontract_id;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'This contract has % section(s)/task(s) under it. Only a single leaf task can become a fixed-price package.', v_cnt;
  END IF;

  -- 3. No packages already attached under it.
  SELECT count(*) INTO v_cnt
  FROM public.task_work_packages WHERE parent_subcontract_id = p_subcontract_id;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'This contract already has % fixed-price package(s) under it.', v_cnt;
  END IF;

  -- 4. Refuse data with no clean mapping into a package. (Headcount "count by
  --    role" days ARE mapped — carried into the Day Log below — so they're allowed.)
  SELECT count(*) INTO v_cnt
  FROM public.daily_attendance WHERE subcontract_id = p_subcontract_id AND is_deleted = false;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION '% per-laborer attendance rows exist. Clear them before converting.', v_cnt;
  END IF;

  SELECT count(*) INTO v_cnt
  FROM public.subcontract_mid_entries WHERE subcontract_id = p_subcontract_id;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION '% crew/day entries exist. Delete them on /site/attendance before converting.', v_cnt;
  END IF;

  SELECT count(*) INTO v_cnt
  FROM public.subcontract_payments WHERE contract_id = p_subcontract_id AND is_deleted = false;
  IF v_cnt > 0 THEN
    RAISE EXCEPTION '% payment(s) are recorded on this task. Conversion does not yet migrate payments — record them after converting, or remove them first.', v_cnt;
  END IF;

  -- 5. Contractor display name: prefer the denormalized snapshot, else the team
  --    leader / specialist name.
  v_maistry_name := COALESCE(
    NULLIF(btrim(sc.contractor_name), ''),
    (SELECT NULLIF(btrim(COALESCE(t.leader_name, t.name)), '') FROM public.teams t WHERE t.id = sc.team_id),
    (SELECT NULLIF(btrim(l.name), '') FROM public.laborers l WHERE l.id = sc.laborer_id)
  );

  -- 6. Pricing: carry rate-based pricing only when all three unit fields are
  --    present (the package CHECK requires them); otherwise lump-sum.
  IF sc.is_rate_based
     AND sc.measurement_unit IS NOT NULL
     AND sc.total_units IS NOT NULL
     AND sc.rate_per_unit IS NOT NULL THEN
    v_pricing_mode     := 'rate_based';
    v_measurement_unit := sc.measurement_unit;
    v_total_units      := sc.total_units;
    v_rate_per_unit    := sc.rate_per_unit;
  ELSE
    v_pricing_mode     := 'lump_sum';
    v_measurement_unit := NULL;
    v_total_units      := NULL;
    v_rate_per_unit    := NULL;
  END IF;

  -- 7. Allocate a per-site package reference and insert the package, nested under
  --    the task's CURRENT parent (its section/contract) so it slots into the same
  --    place in the ladder.
  v_package_number := public.generate_task_work_reference(sc.site_id);

  INSERT INTO public.task_work_packages (
    site_id, package_number, title, scope_of_work,
    labor_category_id, maistry_laborer_id, maistry_name,
    pricing_mode, total_value, rate_per_unit, measurement_unit, total_units,
    status, parent_subcontract_id, created_by
  ) VALUES (
    sc.site_id, v_package_number, sc.title, COALESCE(sc.scope_of_work, sc.description),
    sc.trade_category_id, sc.laborer_id, v_maistry_name,
    v_pricing_mode, sc.total_value, v_rate_per_unit, v_measurement_unit, v_total_units,
    sc.status, sc.parent_subcontract_id, v_created_by
  )
  RETURNING id INTO v_pkg_id;

  -- 8. Carry any "count by role" days into the package Day Log — one costed
  --    day-log row per date, roles folded into worker_lines (type × count × rate),
  --    priced from the task's rate card (fallback to the role default, then 0).
  INSERT INTO public.task_work_day_logs (
    package_id, site_id, log_date, worker_count, man_days, worker_lines
  )
  SELECT
    v_pkg_id,
    sc.site_id,
    h.attendance_date,
    GREATEST(round(sum(h.units))::int, 0),
    sum(h.units),
    jsonb_agg(
      jsonb_build_object(
        'kind', 'role',
        'ref_id', h.role_id,
        'label', COALESCE(r.name, 'Worker'),
        'count', h.units,
        'daily_rate', COALESCE(rr.daily_rate, r.default_daily_rate, 0)
      )
      ORDER BY r.display_order NULLS LAST, r.name
    )
  FROM public.subcontract_headcount_attendance h
  LEFT JOIN public.labor_roles r ON r.id = h.role_id
  LEFT JOIN public.subcontract_role_rates rr
    ON rr.subcontract_id = h.subcontract_id AND rr.role_id = h.role_id
  WHERE h.subcontract_id = p_subcontract_id
  GROUP BY h.attendance_date;

  -- 9. Keep parent rollups stable. A subcontract child's value was DE-DUPED against
  --    its parent (parent counts max(0, parent_value - children)); a package is
  --    ADDITIVE. So converting a task that sat inside its parent's price would make
  --    the parent double-count. Decrement the parent by the task's value (floored at
  --    0) so the additive package exactly replaces the child — the rollup is unchanged.
  IF sc.parent_subcontract_id IS NOT NULL THEN
    UPDATE public.subcontracts
       SET total_value = GREATEST(0, total_value - sc.total_value)
     WHERE id = sc.parent_subcontract_id;
  END IF;

  -- 10. Remove the task's now-migrated headcount rows + its rate card (config-only
  --     dependents that would otherwise block the delete), then delete the task.
  DELETE FROM public.subcontract_headcount_attendance WHERE subcontract_id = p_subcontract_id;
  DELETE FROM public.subcontract_role_rates WHERE subcontract_id = p_subcontract_id;
  DELETE FROM public.subcontracts WHERE id = p_subcontract_id;

  RETURN v_pkg_id;
END;
$$;

COMMENT ON FUNCTION public.convert_subcontract_task_to_package(uuid) IS
  'Converts a leaf subcontract task into a task_work_packages row nested under the same parent, carrying any headcount "count by role" days into the package Day Log, then deletes the original task. Atomic; refuses if the task has children/packages, per-laborer attendance, mid-mode entries, or recorded payments.';

GRANT EXECUTE ON FUNCTION public.convert_subcontract_task_to_package(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_subcontract_task_to_package(uuid) TO service_role;
