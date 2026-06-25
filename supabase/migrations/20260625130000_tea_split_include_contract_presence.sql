-- Tea-shop cross-site split: count CONTRACT / TASK-WORK presence, not just attendance
-- ---------------------------------------------------------------------------
-- Problem: the grouped tea-shop split divides each group entry across the sites
-- in the group in proportion to "day units" = SUM(daily_attendance.day_units)
-- + SUM(market_laborer_attendance.count). On a day where a site had ONLY
-- fixed-price contract / task-work crew (logged via the package "Day Log") and
-- no marked attendance, that site contributes 0 units, so the whole bill flows
-- to whichever site happened to have regular attendance. The contract crew that
-- actually drank the tea is invisible.
--
-- Fix: add "contract units" to each site's share of the denominator:
--   contract_units(site, date) =
--       SUM(task_work_day_logs.man_days  WHERE site_id = site AND log_date = date)
--     + SUM(subcontract_headcount_attendance.units
--           JOIN subcontracts sc ON sc.id = subcontract_id
--           WHERE sc.site_id = site AND attendance_date = date)
--
-- man_days / units are worker-days (fractional-safe), the same unit as
-- daily_attendance.day_units. No double-counting: fixed-price packages and
-- headcount-mode subcontracts never write daily_attendance rows (which hold
-- regular + detailed-mode subcontract attendance) — the three populations are
-- mutually exclusive.
--
-- Also: (a) skip group entries whose split was manually overridden so a hand-set
-- allocation is never clobbered; (b) fire the recalc when a Day Log / headcount
-- row changes (new triggers); (c) one-time backfill so existing skewed balances
-- self-correct.

-- =============================================================================
-- 1. FUNCTION: recompute allocations, now including contract presence
--    (body copied from the live definition; only the two per-site unit
--     expressions and a manual-override guard are added.)
-- =============================================================================

CREATE OR REPLACE FUNCTION recalculate_tea_shop_allocations_for_date(
  p_date DATE,
  p_site_id UUID
)
RETURNS void AS $$
DECLARE
  v_site_group_id UUID;
  v_entry_rec RECORD;
  v_site_rec RECORD;
  v_total_units NUMERIC;
  v_site_units NUMERIC;
  v_percentage NUMERIC;
  v_allocated_amount NUMERIC;
  v_remaining_amount NUMERIC;
  v_total_allocated NUMERIC;
BEGIN
  -- Get the site's group ID
  SELECT site_group_id INTO v_site_group_id
  FROM sites
  WHERE id = p_site_id;

  -- If site is not in a group, nothing to recalculate (single site entries don't need allocation)
  IF v_site_group_id IS NULL THEN
    RETURN;
  END IF;

  -- Find all group tea shop entries for this date in this group
  FOR v_entry_rec IN
    SELECT te.id, te.total_amount, te.tea_shop_id
    FROM tea_shop_entries te
    WHERE te.date = p_date
      AND te.is_group_entry = true
      AND te.site_group_id = v_site_group_id
  LOOP
    -- Never clobber a manually overridden split (set on the Combined Tea editor).
    IF EXISTS (
      SELECT 1 FROM tea_shop_entry_allocations
      WHERE entry_id = v_entry_rec.id
        AND is_manual_override = true
    ) THEN
      CONTINUE;
    END IF;

    -- Calculate total day units across all sites in the group for this date
    v_total_units := 0;
    v_remaining_amount := v_entry_rec.total_amount;
    v_total_allocated := 0;

    -- Get day units for each site in the group
    FOR v_site_rec IN
      SELECT
        s.id as site_id,
        s.name as site_name,
        COALESCE(
          (SELECT SUM(COALESCE(da.day_units, 1))
           FROM daily_attendance da
           WHERE da.site_id = s.id
             AND da.date = p_date
             AND COALESCE(da.is_deleted, false) = false), 0
        ) +
        COALESCE(
          (SELECT SUM(COALESCE(mla.count, 0))
           FROM market_laborer_attendance mla
           WHERE mla.site_id = s.id
             AND mla.date = p_date), 0
        ) +
        -- contract presence: fixed-price package Day Logs (man-days)
        COALESCE(
          (SELECT SUM(COALESCE(twdl.man_days, 0))
           FROM task_work_day_logs twdl
           WHERE twdl.site_id = s.id
             AND twdl.log_date = p_date), 0
        ) +
        -- contract presence: headcount-mode subcontract attendance (units)
        COALESCE(
          (SELECT SUM(COALESCE(sha.units, 0))
           FROM subcontract_headcount_attendance sha
           JOIN subcontracts sc ON sc.id = sha.subcontract_id
           WHERE sc.site_id = s.id
             AND sha.attendance_date = p_date), 0
        ) as total_units,
        COALESCE(
          (SELECT COUNT(*)
           FROM daily_attendance da
           WHERE da.site_id = s.id
             AND da.date = p_date
             AND COALESCE(da.is_deleted, false) = false), 0
        ) +
        COALESCE(
          (SELECT SUM(COALESCE(mla.count, 0))
           FROM market_laborer_attendance mla
           WHERE mla.site_id = s.id
             AND mla.date = p_date), 0
        ) +
        COALESCE(
          (SELECT SUM(COALESCE(twdl.worker_count, 0))
           FROM task_work_day_logs twdl
           WHERE twdl.site_id = s.id
             AND twdl.log_date = p_date), 0
        ) +
        COALESCE(
          (SELECT ROUND(SUM(COALESCE(sha.units, 0)))
           FROM subcontract_headcount_attendance sha
           JOIN subcontracts sc ON sc.id = sha.subcontract_id
           WHERE sc.site_id = s.id
             AND sha.attendance_date = p_date), 0
        ) as worker_count
      FROM sites s
      WHERE s.site_group_id = v_site_group_id
        AND s.status = 'active'
      ORDER BY s.name
    LOOP
      v_total_units := v_total_units + v_site_rec.total_units;
    END LOOP;

    -- Now calculate and update allocations for each site
    FOR v_site_rec IN
      SELECT
        s.id as site_id,
        s.name as site_name,
        COALESCE(
          (SELECT SUM(COALESCE(da.day_units, 1))
           FROM daily_attendance da
           WHERE da.site_id = s.id
             AND da.date = p_date
             AND COALESCE(da.is_deleted, false) = false), 0
        ) +
        COALESCE(
          (SELECT SUM(COALESCE(mla.count, 0))
           FROM market_laborer_attendance mla
           WHERE mla.site_id = s.id
             AND mla.date = p_date), 0
        ) +
        COALESCE(
          (SELECT SUM(COALESCE(twdl.man_days, 0))
           FROM task_work_day_logs twdl
           WHERE twdl.site_id = s.id
             AND twdl.log_date = p_date), 0
        ) +
        COALESCE(
          (SELECT SUM(COALESCE(sha.units, 0))
           FROM subcontract_headcount_attendance sha
           JOIN subcontracts sc ON sc.id = sha.subcontract_id
           WHERE sc.site_id = s.id
             AND sha.attendance_date = p_date), 0
        ) as total_units,
        COALESCE(
          (SELECT COUNT(*)
           FROM daily_attendance da
           WHERE da.site_id = s.id
             AND da.date = p_date
             AND COALESCE(da.is_deleted, false) = false), 0
        ) +
        COALESCE(
          (SELECT SUM(COALESCE(mla.count, 0))
           FROM market_laborer_attendance mla
           WHERE mla.site_id = s.id
             AND mla.date = p_date), 0
        ) +
        COALESCE(
          (SELECT SUM(COALESCE(twdl.worker_count, 0))
           FROM task_work_day_logs twdl
           WHERE twdl.site_id = s.id
             AND twdl.log_date = p_date), 0
        ) +
        COALESCE(
          (SELECT ROUND(SUM(COALESCE(sha.units, 0)))
           FROM subcontract_headcount_attendance sha
           JOIN subcontracts sc ON sc.id = sha.subcontract_id
           WHERE sc.site_id = s.id
             AND sha.attendance_date = p_date), 0
        ) as worker_count
      FROM sites s
      WHERE s.site_group_id = v_site_group_id
        AND s.status = 'active'
      ORDER BY s.name
    LOOP
      -- Calculate percentage and allocated amount
      IF v_total_units > 0 THEN
        v_site_units := v_site_rec.total_units;
        v_percentage := ROUND((v_site_units / v_total_units) * 100, 2);
        v_allocated_amount := ROUND((v_site_units / v_total_units) * v_entry_rec.total_amount);
      ELSE
        -- No attendance and no contract presence = zero allocation
        v_percentage := 0;
        v_allocated_amount := 0;
      END IF;

      v_total_allocated := v_total_allocated + v_allocated_amount;

      -- Upsert the allocation record
      INSERT INTO tea_shop_entry_allocations (
        entry_id,
        site_id,
        day_units_sum,
        worker_count,
        allocation_percentage,
        allocated_amount,
        is_manual_override
      )
      VALUES (
        v_entry_rec.id,
        v_site_rec.site_id,
        v_site_rec.total_units,
        v_site_rec.worker_count,
        v_percentage,
        v_allocated_amount,
        false
      )
      ON CONFLICT (entry_id, site_id) DO UPDATE SET
        day_units_sum = EXCLUDED.day_units_sum,
        worker_count = EXCLUDED.worker_count,
        allocation_percentage = EXCLUDED.allocation_percentage,
        allocated_amount = EXCLUDED.allocated_amount,
        is_manual_override = false;
    END LOOP;

    -- Adjust for rounding errors - add/subtract difference from largest site
    IF v_total_units > 0 AND v_total_allocated != v_entry_rec.total_amount THEN
      UPDATE tea_shop_entry_allocations
      SET allocated_amount = allocated_amount + (v_entry_rec.total_amount - v_total_allocated)
      WHERE entry_id = v_entry_rec.id
        AND site_id = (
          SELECT site_id FROM tea_shop_entry_allocations
          WHERE entry_id = v_entry_rec.id
          ORDER BY allocated_amount DESC
          LIMIT 1
        );
    END IF;

    -- After updating allocations, trigger waterfall rebuild for affected sites
    -- This will recalculate the paid status based on new allocations
    PERFORM rebuild_tea_shop_waterfall(v_entry_rec.tea_shop_id, p_site_id);
  END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION recalculate_tea_shop_allocations_for_date(DATE, UUID) IS
  'Recalculates tea shop entry allocations when attendance OR contract presence
   changes for a date/site. Day units = daily_attendance.day_units + market count
   + task_work_day_logs.man_days + subcontract_headcount_attendance.units.
   Skips entries with a manual override. Triggers waterfall rebuild.';

-- =============================================================================
-- 2. TRIGGER: task_work_day_logs (fixed-price package Day Log)
-- =============================================================================

CREATE OR REPLACE FUNCTION trigger_task_work_day_log_tea_shop_recalc()
RETURNS TRIGGER AS $$
DECLARE
  v_date DATE;
  v_site_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_date := OLD.log_date;
    v_site_id := OLD.site_id;
  ELSE
    v_date := NEW.log_date;
    v_site_id := NEW.site_id;
  END IF;

  -- On UPDATE, only act when the presence-relevant fields move.
  IF TG_OP = 'UPDATE' THEN
    IF OLD.man_days IS NOT DISTINCT FROM NEW.man_days
       AND OLD.site_id IS NOT DISTINCT FROM NEW.site_id
       AND OLD.log_date IS NOT DISTINCT FROM NEW.log_date THEN
      RETURN NEW;
    END IF;
    -- If the row moved to a different (site, date), also recompute the old one.
    IF (OLD.site_id IS DISTINCT FROM NEW.site_id OR OLD.log_date IS DISTINCT FROM NEW.log_date)
       AND OLD.site_id IS NOT NULL AND OLD.log_date IS NOT NULL THEN
      PERFORM recalculate_tea_shop_allocations_for_date(OLD.log_date, OLD.site_id);
    END IF;
  END IF;

  IF v_date IS NOT NULL AND v_site_id IS NOT NULL THEN
    PERFORM recalculate_tea_shop_allocations_for_date(v_date, v_site_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_task_work_day_log_tea_shop_recalc ON task_work_day_logs;
CREATE TRIGGER trg_task_work_day_log_tea_shop_recalc
  AFTER INSERT OR UPDATE OR DELETE ON task_work_day_logs
  FOR EACH ROW
  EXECUTE FUNCTION trigger_task_work_day_log_tea_shop_recalc();

-- =============================================================================
-- 3. TRIGGER: subcontract_headcount_attendance (headcount-mode subcontract)
--    site_id is not on the row — resolve it via subcontracts.
-- =============================================================================

CREATE OR REPLACE FUNCTION trigger_subcontract_headcount_tea_shop_recalc()
RETURNS TRIGGER AS $$
DECLARE
  v_date DATE;
  v_subcontract_id UUID;
  v_site_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_date := OLD.attendance_date;
    v_subcontract_id := OLD.subcontract_id;
  ELSE
    v_date := NEW.attendance_date;
    v_subcontract_id := NEW.subcontract_id;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.units IS NOT DISTINCT FROM NEW.units
       AND OLD.attendance_date IS NOT DISTINCT FROM NEW.attendance_date
       AND OLD.subcontract_id IS NOT DISTINCT FROM NEW.subcontract_id THEN
      RETURN NEW;
    END IF;
  END IF;

  IF v_date IS NOT NULL AND v_subcontract_id IS NOT NULL THEN
    SELECT site_id INTO v_site_id FROM subcontracts WHERE id = v_subcontract_id;
    IF v_site_id IS NOT NULL THEN
      PERFORM recalculate_tea_shop_allocations_for_date(v_date, v_site_id);
    END IF;
  END IF;

  -- If the row moved to a different (subcontract, date), recompute the old one too.
  IF TG_OP = 'UPDATE'
     AND (OLD.attendance_date IS DISTINCT FROM NEW.attendance_date
          OR OLD.subcontract_id IS DISTINCT FROM NEW.subcontract_id)
     AND OLD.attendance_date IS NOT NULL AND OLD.subcontract_id IS NOT NULL THEN
    SELECT site_id INTO v_site_id FROM subcontracts WHERE id = OLD.subcontract_id;
    IF v_site_id IS NOT NULL THEN
      PERFORM recalculate_tea_shop_allocations_for_date(OLD.attendance_date, v_site_id);
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_subcontract_headcount_tea_shop_recalc ON subcontract_headcount_attendance;
CREATE TRIGGER trg_subcontract_headcount_tea_shop_recalc
  AFTER INSERT OR UPDATE OR DELETE ON subcontract_headcount_attendance
  FOR EACH ROW
  EXECUTE FUNCTION trigger_subcontract_headcount_tea_shop_recalc();

-- =============================================================================
-- 4. GRANTS
-- =============================================================================

GRANT EXECUTE ON FUNCTION trigger_task_work_day_log_tea_shop_recalc() TO authenticated;
GRANT EXECUTE ON FUNCTION trigger_task_work_day_log_tea_shop_recalc() TO service_role;
GRANT EXECUTE ON FUNCTION trigger_subcontract_headcount_tea_shop_recalc() TO authenticated;
GRANT EXECUTE ON FUNCTION trigger_subcontract_headcount_tea_shop_recalc() TO service_role;

-- =============================================================================
-- 5. ONE-TIME BACKFILL
--    Recompute every grouped tea entry so historical splits absorb contract
--    presence. Idempotent on dates with no contract presence (terms add 0).
--    Manual-override entries are skipped by the guard inside the function.
-- =============================================================================

DO $$
DECLARE
  r RECORD;
  v_site UUID;
BEGIN
  FOR r IN
    SELECT DISTINCT te.site_group_id, te.date
    FROM tea_shop_entries te
    WHERE te.is_group_entry = true
      AND te.site_group_id IS NOT NULL
  LOOP
    SELECT id INTO v_site
    FROM sites
    WHERE site_group_id = r.site_group_id
      AND status = 'active'
    ORDER BY name
    LIMIT 1;

    IF v_site IS NOT NULL THEN
      PERFORM recalculate_tea_shop_allocations_for_date(r.date, v_site);
    END IF;
  END LOOP;
END $$;
