-- Copy a day's attendance (laborers only) to one or more target dates.
--
-- Powers the "Copy day" shortcut on /site/attendance: clone a source day's
-- daily_attendance + market_laborer_attendance rows verbatim onto target dates,
-- swapping the date and resetting payment/settlement/audit fields. Because the
-- source rows already store the *effective* daily_earnings / total_cost (computed
-- by the AttendanceDrawer at original save time), nothing is recomputed here —
-- this stays faithful to executeSave() without re-encoding its formulas.
--
-- Per-target-date logic, each in its own subtransaction (BEGIN/EXCEPTION) so one
-- bad date never aborts the rest:
--   - skip if date == source                       -> error
--   - skip if a holiday covers the date (in scope) -> skipped_holiday
--   - skip if the date is already settled (in scope)-> skipped_settled
--   - if the date already has attendance (in scope):
--       p_overwrite = false -> skipped_existing
--       p_overwrite = true  -> delete the scoped rows, then clone
--   - else clone, recompute daily_work_summary counts, and (Civil only) sync the
--     labor expense exactly like a normal save.
--
-- Scope: a non-null p_subcontract_id means "trade workspace" — daily rows scoped
-- by subcontract_id, market rows scoped by role category (p_trade_category_id).
-- In a trade workspace the site labor-expense is NOT touched (matches executeSave
-- line ~1795: the site labor-expense row has no trade dimension).
--
-- Settled rows are pre-skipped here AND protected by the block_delete_settled_attendance
-- trigger (migration 20260530231100), which is the final backstop.

CREATE OR REPLACE FUNCTION public.copy_day_attendance(
  p_site_id           uuid,
  p_source_date       date,
  p_target_dates      date[],
  p_subcontract_id    uuid    DEFAULT NULL,
  p_trade_category_id uuid    DEFAULT NULL,
  p_overwrite         boolean DEFAULT false,
  p_user_id           uuid    DEFAULT NULL,
  p_user_name         text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_trade          boolean := p_subcontract_id IS NOT NULL;
  v_now            timestamptz := now();
  v_results        jsonb := '[]'::jsonb;
  v_target         date;
  v_role_ids       uuid[];
  v_named_rows     integer;
  v_market_rows    integer;
  v_has_holiday    boolean;
  v_has_settled    boolean;
  v_has_existing   boolean;
  v_daily_count    integer;
  v_contract_count integer;
  v_market_count   integer;
  v_total_count    integer;
  v_total_salary   numeric;
  v_category_id    uuid;
  v_expense_id     uuid;
BEGIN
  -- Role ids for market scoping in a trade workspace. Sentinel guarantees an
  -- empty role set is a provable no-op (never a match-all).
  IF v_trade AND p_trade_category_id IS NOT NULL THEN
    SELECT array_agg(id) INTO v_role_ids
    FROM public.labor_roles WHERE category_id = p_trade_category_id;
    IF v_role_ids IS NULL THEN
      v_role_ids := ARRAY['00000000-0000-0000-0000-000000000000']::uuid[];
    END IF;
  END IF;

  FOREACH v_target IN ARRAY p_target_dates LOOP
    BEGIN
      -- 0. cannot copy onto itself
      IF v_target = p_source_date THEN
        v_results := v_results || jsonb_build_object(
          'date', v_target, 'status', 'error', 'message', 'Cannot copy onto the source date');
        CONTINUE;
      END IF;

      -- 1. holiday in scope (Civil holiday OR this trade's holiday)
      SELECT EXISTS (
        SELECT 1 FROM public.site_holidays h
        WHERE h.site_id = p_site_id AND h.date = v_target
          AND (h.trade_category_id IS NULL OR h.trade_category_id = p_trade_category_id)
      ) INTO v_has_holiday;
      IF v_has_holiday THEN
        v_results := v_results || jsonb_build_object('date', v_target, 'status', 'skipped_holiday');
        CONTINUE;
      END IF;

      -- 2. settled in scope -> always protected
      SELECT
        EXISTS (
          SELECT 1 FROM public.daily_attendance d
          WHERE d.site_id = p_site_id AND d.date = v_target
            AND d.is_deleted = false AND d.is_archived = false
            AND (d.is_paid = true OR d.settlement_group_id IS NOT NULL)
            AND (NOT v_trade OR d.subcontract_id = p_subcontract_id)
        )
        OR EXISTS (
          SELECT 1 FROM public.market_laborer_attendance m
          WHERE m.site_id = p_site_id AND m.date = v_target
            AND (m.is_paid = true OR m.settlement_group_id IS NOT NULL)
            AND (NOT v_trade OR m.role_id = ANY (v_role_ids))
        )
      INTO v_has_settled;
      IF v_has_settled THEN
        v_results := v_results || jsonb_build_object('date', v_target, 'status', 'skipped_settled');
        CONTINUE;
      END IF;

      -- 3. existing (non-settled) in scope
      SELECT
        EXISTS (
          SELECT 1 FROM public.daily_attendance d
          WHERE d.site_id = p_site_id AND d.date = v_target
            AND d.is_deleted = false AND d.is_archived = false
            AND (NOT v_trade OR d.subcontract_id = p_subcontract_id)
        )
        OR EXISTS (
          SELECT 1 FROM public.market_laborer_attendance m
          WHERE m.site_id = p_site_id AND m.date = v_target
            AND (NOT v_trade OR m.role_id = ANY (v_role_ids))
        )
      INTO v_has_existing;

      IF v_has_existing THEN
        IF NOT p_overwrite THEN
          v_results := v_results || jsonb_build_object('date', v_target, 'status', 'skipped_existing');
          CONTINUE;
        END IF;
        -- overwrite: delete scoped rows (settled already excluded above; the
        -- block_delete_settled_attendance trigger is the final backstop).
        DELETE FROM public.daily_attendance d
        WHERE d.site_id = p_site_id AND d.date = v_target
          AND (NOT v_trade OR d.subcontract_id = p_subcontract_id);
        DELETE FROM public.market_laborer_attendance m
        WHERE m.site_id = p_site_id AND m.date = v_target
          AND (NOT v_trade OR m.role_id = ANY (v_role_ids));
      END IF;

      -- 4. clone named (daily) rows verbatim; reset payment/settlement/audit
      INSERT INTO public.daily_attendance (
        date, laborer_id, site_id, section_id, subcontract_id,
        work_days, hours_worked, daily_rate_applied, daily_earnings,
        in_time, lunch_out, lunch_in, out_time,
        work_hours, break_hours, total_hours, day_units,
        salary_override, salary_override_reason, work_progress_percent,
        attendance_status, confirmed_at, synced_to_expense, is_paid,
        recorded_by, recorded_by_user_id, entered_by, created_at, updated_at
      )
      SELECT
        v_target, d.laborer_id, p_site_id, d.section_id,
        CASE WHEN v_trade THEN p_subcontract_id ELSE d.subcontract_id END,
        d.work_days, d.hours_worked, d.daily_rate_applied, d.daily_earnings,
        d.in_time, d.lunch_out, d.lunch_in, d.out_time,
        d.work_hours, d.break_hours, d.total_hours, d.day_units,
        d.salary_override, d.salary_override_reason, d.work_progress_percent,
        'confirmed', v_now, true, false,
        p_user_name, p_user_id, p_user_id, v_now, v_now
      FROM public.daily_attendance d
      WHERE d.site_id = p_site_id AND d.date = p_source_date
        AND d.is_deleted = false AND d.is_archived = false
        AND (NOT v_trade OR d.subcontract_id = p_subcontract_id);
      GET DIAGNOSTICS v_named_rows = ROW_COUNT;

      -- 5. clone market rows verbatim; reset payment/settlement/audit
      INSERT INTO public.market_laborer_attendance (
        site_id, section_id, subcontract_id, date, role_id,
        worker_index, count, work_days, rate_per_person, total_cost,
        salary_override_per_person, salary_override_reason,
        in_time, lunch_out, lunch_in, out_time,
        work_hours, break_hours, total_hours, day_units,
        attendance_status, confirmed_at, is_paid,
        entered_by, entered_by_user_id, created_at, updated_at
      )
      SELECT
        p_site_id, m.section_id, m.subcontract_id, v_target, m.role_id,
        m.worker_index, m.count, m.work_days, m.rate_per_person, m.total_cost,
        m.salary_override_per_person, m.salary_override_reason,
        m.in_time, m.lunch_out, m.lunch_in, m.out_time,
        m.work_hours, m.break_hours, m.total_hours, m.day_units,
        'confirmed', v_now, false,
        COALESCE(p_user_name, 'Unknown'), p_user_id, v_now, v_now
      FROM public.market_laborer_attendance m
      WHERE m.site_id = p_site_id AND m.date = p_source_date
        AND (NOT v_trade OR m.role_id = ANY (v_role_ids));
      GET DIAGNOSTICS v_market_rows = ROW_COUNT;

      -- Nothing to copy in this scope -> report and move on (no empty summary).
      IF v_named_rows = 0 AND v_market_rows = 0 THEN
        v_results := v_results || jsonb_build_object(
          'date', v_target, 'status', 'error',
          'message', 'Source day has no laborers in this scope');
        CONTINUE;
      END IF;

      -- 6. recompute summary counts/totals from the rows just inserted.
      -- daily vs contract split mirrors the UI: laborer_type = 'contract' -> contract.
      SELECT
        COALESCE(COUNT(*) FILTER (WHERE COALESCE(l.laborer_type, '') <> 'contract'), 0),
        COALESCE(COUNT(*) FILTER (WHERE l.laborer_type = 'contract'), 0),
        COALESCE(SUM(d.daily_earnings), 0)
      INTO v_daily_count, v_contract_count, v_total_salary
      FROM public.daily_attendance d
      JOIN public.laborers l ON l.id = d.laborer_id
      WHERE d.site_id = p_site_id AND d.date = v_target
        AND d.is_deleted = false AND d.is_archived = false
        AND (NOT v_trade OR d.subcontract_id = p_subcontract_id);

      SELECT
        COALESCE(SUM(m.count), 0),
        v_total_salary + COALESCE(SUM(m.total_cost), 0)
      INTO v_market_count, v_total_salary
      FROM public.market_laborer_attendance m
      WHERE m.site_id = p_site_id AND m.date = v_target
        AND (NOT v_trade OR m.role_id = ANY (v_role_ids));

      v_total_count := v_daily_count + v_contract_count + v_market_count;

      -- 7. replace the scoped daily_work_summary (narrative fields blank).
      DELETE FROM public.daily_work_summary s
      WHERE s.site_id = p_site_id AND s.date = v_target
        AND (CASE WHEN v_trade THEN s.subcontract_id = p_subcontract_id
                  ELSE s.subcontract_id IS NULL END);

      INSERT INTO public.daily_work_summary (
        site_id, date, subcontract_id,
        daily_laborer_count, contract_laborer_count, market_laborer_count, total_laborer_count,
        total_salary, total_snacks, total_expense, default_snacks_per_person,
        entered_by, entered_by_user_id, updated_by, updated_by_user_id,
        created_at, updated_at
      ) VALUES (
        p_site_id, v_target, CASE WHEN v_trade THEN p_subcontract_id ELSE NULL END,
        v_daily_count, v_contract_count, v_market_count, v_total_count,
        v_total_salary, 0, v_total_salary, 0,
        COALESCE(p_user_name, 'Unknown'), p_user_id, p_user_name, p_user_id,
        v_now, v_now
      );

      -- 8. labor expense + sync (Civil/whole-site only — matches executeSave).
      IF NOT v_trade AND v_total_salary > 0 THEN
        SELECT id INTO v_category_id
        FROM public.expense_categories
        WHERE module = 'labor' AND name = 'Labor' LIMIT 1;
        IF v_category_id IS NULL THEN
          INSERT INTO public.expense_categories (name, module, description)
          VALUES ('Labor', 'labor', 'Labor and attendance expenses')
          RETURNING id INTO v_category_id;
        END IF;

        -- Refresh the day's aggregate labor expense IN PLACE. We cannot delete an
        -- existing expense row first: attendance_expense_sync.expense_id FKs it and
        -- a delete raises a constraint violation. Update if present, else insert.
        SELECT id INTO v_expense_id
        FROM public.expenses
        WHERE site_id = p_site_id AND date = v_target AND module = 'labor'
        ORDER BY created_at LIMIT 1;

        IF v_expense_id IS NULL THEN
          INSERT INTO public.expenses (
            module, category_id, date, amount, site_id, description,
            payment_mode, is_recurring, is_cleared, entered_by, entered_by_user_id
          ) VALUES (
            'labor', v_category_id, v_target, v_total_salary, p_site_id,
            'Daily labor - ' || v_total_count || ' laborers (Salary: ₹'
              || trim(to_char(round(v_total_salary), 'FM999999999999')) || ')',
            'cash', false, false, COALESCE(p_user_name, 'Unknown'), p_user_id
          ) RETURNING id INTO v_expense_id;
        ELSE
          UPDATE public.expenses SET
            category_id        = v_category_id,
            amount             = v_total_salary,
            description        = 'Daily labor - ' || v_total_count || ' laborers (Salary: ₹'
              || trim(to_char(round(v_total_salary), 'FM999999999999')) || ')',
            entered_by         = COALESCE(p_user_name, 'Unknown'),
            entered_by_user_id = p_user_id,
            updated_at         = v_now
          WHERE id = v_expense_id;
        END IF;

        INSERT INTO public.attendance_expense_sync (
          attendance_date, site_id, expense_id,
          total_laborers, total_work_days, total_amount,
          synced_by, synced_by_user_id
        ) VALUES (
          v_target, p_site_id, v_expense_id,
          v_total_count, v_total_count, v_total_salary,
          COALESCE(p_user_name, 'Unknown'), p_user_id
        )
        ON CONFLICT (attendance_date, site_id) DO UPDATE SET
          expense_id        = EXCLUDED.expense_id,
          total_laborers    = EXCLUDED.total_laborers,
          total_work_days   = EXCLUDED.total_work_days,
          total_amount      = EXCLUDED.total_amount,
          synced_by         = EXCLUDED.synced_by,
          synced_by_user_id = EXCLUDED.synced_by_user_id;
      END IF;

      v_results := v_results || jsonb_build_object(
        'date', v_target, 'status', 'copied',
        'named', v_named_rows, 'market', v_market_rows);

    EXCEPTION WHEN OTHERS THEN
      -- This date's partial work rolls back (subtransaction); report and continue.
      v_results := v_results || jsonb_build_object(
        'date', v_target, 'status', 'error', 'message', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object('results', v_results);
END;
$$;

GRANT EXECUTE ON FUNCTION public.copy_day_attendance(
  uuid, date, date[], uuid, uuid, boolean, uuid, text
) TO authenticated;
