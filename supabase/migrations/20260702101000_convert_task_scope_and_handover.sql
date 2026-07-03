-- Extend convert_subcontract_task_to_package for the "Hand to crew" flow on
-- Future plans, and stop losing the scope sheet on every conversion.
--
-- 1. task_work_packages.scope_items — the subcontract row is DELETED at the end
--    of the conversion, which cascades away subcontract_scope_sheet (the plan's
--    points, photos and values). Carry the items into the package so nothing is
--    silently destroyed. Display-only; same JSONB shape as the scope sheet.
--
-- 2. New optional handover params: the dialog picks the maistry, the final
--    agreed amount (after bargaining) and flips the plan straight to 'active'.
--    All default to NULL = keep the subcontract's own values, so the existing
--    one-arg caller (ConvertToPackageDialog) behaves exactly as before.
--
-- DROP first — CREATE OR REPLACE with new defaulted params would leave the old
-- (uuid) signature behind as an overload and PostgREST rpc() calls would fail
-- with an ambiguity error.

ALTER TABLE public.task_work_packages
  ADD COLUMN IF NOT EXISTS scope_items jsonb;
COMMENT ON COLUMN public.task_work_packages.scope_items IS
  'Scope sheet carried over from a converted subcontract: [{id,label,note?,value?,before,after}]. Display-only.';

DROP FUNCTION IF EXISTS public.convert_subcontract_task_to_package(uuid);

CREATE FUNCTION public.convert_subcontract_task_to_package(
  p_subcontract_id     uuid,
  p_maistry_laborer_id uuid DEFAULT NULL,
  p_maistry_name       text DEFAULT NULL,
  p_status             public.contract_status DEFAULT NULL,
  p_total_value        numeric DEFAULT NULL
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
  v_total_value      numeric;
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

  -- 5. Contractor display name: handover pick first, then the denormalized
  --    snapshot, else the team leader / specialist name.
  v_maistry_name := COALESCE(
    NULLIF(btrim(p_maistry_name), ''),
    (SELECT NULLIF(btrim(l.name), '') FROM public.laborers l WHERE l.id = p_maistry_laborer_id),
    NULLIF(btrim(sc.contractor_name), ''),
    (SELECT NULLIF(btrim(COALESCE(t.leader_name, t.name)), '') FROM public.teams t WHERE t.id = sc.team_id),
    (SELECT NULLIF(btrim(l.name), '') FROM public.laborers l WHERE l.id = sc.laborer_id)
  );

  -- 6. Pricing: a handover amount forces lump-sum (the bargained figure replaces
  --    any area math). Otherwise carry rate-based pricing only when all three
  --    unit fields are present (the package CHECK requires them); else lump-sum.
  v_total_value := COALESCE(p_total_value, sc.total_value);
  IF p_total_value IS NULL
     AND sc.is_rate_based
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
  --    place in the ladder. Scope points (labels, values, photos) are carried
  --    over before the cascade delete destroys the sheet.
  v_package_number := public.generate_task_work_reference(sc.site_id);

  INSERT INTO public.task_work_packages (
    site_id, package_number, title, scope_of_work,
    labor_category_id, maistry_laborer_id, maistry_name,
    pricing_mode, total_value, rate_per_unit, measurement_unit, total_units,
    status, parent_subcontract_id, created_by, scope_items
  ) VALUES (
    sc.site_id, v_package_number, sc.title, COALESCE(sc.scope_of_work, sc.description),
    sc.trade_category_id, COALESCE(p_maistry_laborer_id, sc.laborer_id), v_maistry_name,
    v_pricing_mode, v_total_value, v_rate_per_unit, v_measurement_unit, v_total_units,
    COALESCE(p_status, sc.status), sc.parent_subcontract_id, v_created_by,
    (SELECT s.items FROM public.subcontract_scope_sheet s WHERE s.subcontract_id = p_subcontract_id)
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

COMMENT ON FUNCTION public.convert_subcontract_task_to_package(uuid, uuid, text, public.contract_status, numeric) IS
  'Converts a leaf subcontract task into a task_work_packages row nested under the same parent, carrying the scope sheet (points/photos/values) and any headcount "count by role" days into the package, then deletes the original task. Optional params let the Hand-to-crew flow set the maistry, the bargained total and status=active in the same call. Atomic; refuses if the task has children/packages, per-laborer attendance, mid-mode entries, or recorded payments.';

GRANT EXECUTE ON FUNCTION public.convert_subcontract_task_to_package(uuid, uuid, text, public.contract_status, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_subcontract_task_to_package(uuid, uuid, text, public.contract_status, numeric) TO service_role;
