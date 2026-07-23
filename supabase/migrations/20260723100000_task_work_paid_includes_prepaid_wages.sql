-- v_task_work_profitability: credit already-paid daily wages to the package.
--
-- WHY: work is sometimes given to a crew as a fixed-price package only AFTER the
-- site engineer has already recorded (and settled) it as ordinary daily
-- attendance. Once those days are retagged onto the package
-- (daily_attendance.task_work_package_id), the wages already paid for them are
-- money the crew has ALREADY received for that same work. Without crediting it,
-- the package still shows its full price outstanding and the company pays twice.
--
-- The wage settlement itself is NOT moved or split: it stays exactly where it is
-- (a correct expense + wallet debit on the salary side). This is a read-side
-- attribution only, so it is fully reversible — untag the day and the credit
-- disappears with it.
--
-- Columns:
--   paid          UNCHANGED meaning — lump task_work_payments + task-work crew
--                 settlements (contract_ref_kind='task_work'). Kept stable so
--                 nothing downstream shifts silently.
--   wages_prepaid NEW — Σ daily_earnings of settled attendance rows tagged to the
--                 package, + Σ total_cost of settled market rows.
--   total_paid    NEW — paid + wages_prepaid.
--   balance       now total_value - total_paid.
--
-- No double counting: rows whose settlement_group is ALREADY counted by the
-- crew-settlement branch (that group is this package's own contract_ref) are
-- excluded — that is the direct-pay / mesthri-commission path, where
-- record_contract_laborer_payment already clamps and credits the group total.
--
-- SCOPE BOUNDARY: this credits the PACKAGE only. v_subcontract_reconciliation is
-- deliberately untouched, so a wage settlement linked to a parent subcontract
-- still credits that subcontract exactly as before.
--
-- Retroactively a no-op: at the time of writing NO attendance row is both
-- task-work-tagged and is_paid, so every existing package keeps its current
-- paid/balance. Body otherwise identical to the live definition (last shaped by
-- 20260715100000_v_task_work_profitability_include_crew_settlements.sql).
--
-- COLUMN ORDER: wages_prepaid / total_paid are APPENDED at the end, not slotted in
-- next to `paid`. CREATE OR REPLACE VIEW can only add columns after the existing
-- ones — inserting them mid-list fails with 42P16 ("cannot change name of view
-- column"). Only `balance`'s expression changes; its position does not.

CREATE OR REPLACE VIEW public.v_task_work_profitability AS
SELECT p.id AS package_id,
    p.site_id,
    p.package_number,
    p.title,
    p.labor_category_id,
    lc.name AS category_name,
    p.status,
    p.parent_subcontract_id,
    p.total_value,
    p.total_units,
    p.measurement_unit,
    p.benchmark_daily_rate,
    p.retention_percent,
    p.estimated_days,
    p.estimated_crew_size,
    p.planned_start_date,
    p.planned_end_date,
    p.actual_start_date,
    p.actual_end_date,
    COALESCE(dl.actual_man_days, 0::numeric) AS actual_man_days,
    COALESCE(dl.actual_working_days, 0::bigint) AS actual_working_days,
    COALESCE(pay.paid, 0::numeric) AS paid,
    p.total_value - (COALESCE(pay.paid, 0::numeric) + COALESCE(pre.wages_prepaid, 0::numeric)) AS balance,
    round(p.total_value * p.retention_percent / 100.0, 2) AS retention_held,
    round(COALESCE(dl.actual_man_days, 0::numeric) * COALESCE(p.benchmark_daily_rate, 0::numeric), 2) AS daywage_benchmark_cost,
    round(COALESCE(p.estimated_crew_size, 0)::numeric * COALESCE(p.estimated_days, 0::numeric) * COALESCE(p.benchmark_daily_rate, 0::numeric) - p.total_value, 2) AS company_saving,
        CASE
            WHEN (COALESCE(p.estimated_crew_size, 0)::numeric * COALESCE(p.estimated_days, 0::numeric) * COALESCE(p.benchmark_daily_rate, 0::numeric)) > 0::numeric THEN round((COALESCE(p.estimated_crew_size, 0)::numeric * COALESCE(p.estimated_days, 0::numeric) * COALESCE(p.benchmark_daily_rate, 0::numeric) - p.total_value) / (COALESCE(p.estimated_crew_size, 0)::numeric * COALESCE(p.estimated_days, 0::numeric) * COALESCE(p.benchmark_daily_rate, 0::numeric)) * 100::numeric, 1)
            ELSE NULL::numeric
        END AS saving_pct,
        CASE
            WHEN COALESCE(dl.actual_man_days, 0::numeric) > 0::numeric THEN round(p.total_value / dl.actual_man_days, 2)
            ELSE NULL::numeric
        END AS crew_effective_daily,
        CASE
            WHEN COALESCE(p.total_units, 0::numeric) > 0::numeric THEN round(p.total_value / p.total_units, 2)
            ELSE NULL::numeric
        END AS computed_rate_per_unit,
    round(COALESCE(p.estimated_crew_size, 0)::numeric * COALESCE(p.estimated_days, 0::numeric), 2) AS estimated_man_days,
    round(COALESCE(p.estimated_crew_size, 0)::numeric * COALESCE(p.estimated_days, 0::numeric) * COALESCE(p.benchmark_daily_rate, 0::numeric), 2) AS estimated_daywage_cost,
    -- Appended (see COLUMN ORDER note above).
    COALESCE(pre.wages_prepaid, 0::numeric) AS wages_prepaid,
    COALESCE(pay.paid, 0::numeric) + COALESCE(pre.wages_prepaid, 0::numeric) AS total_paid
   FROM task_work_packages p
     LEFT JOIN labor_categories lc ON lc.id = p.labor_category_id
     LEFT JOIN ( SELECT task_work_day_logs.package_id,
            sum(task_work_day_logs.man_days) AS actual_man_days,
            count(DISTINCT task_work_day_logs.log_date) AS actual_working_days
           FROM task_work_day_logs
          GROUP BY task_work_day_logs.package_id) dl ON dl.package_id = p.id
     LEFT JOIN ( SELECT u.package_id,
            sum(u.amount) AS paid
           FROM ( SELECT twp.package_id,
                    twp.amount
                   FROM task_work_payments twp
                  WHERE twp.is_deleted = false
                UNION ALL
                 SELECT sg.contract_ref_id AS package_id,
                    sg.total_amount AS amount
                   FROM settlement_groups sg
                  WHERE sg.contract_ref_kind = 'task_work'
                    AND sg.payment_type = 'salary'
                    AND sg.is_cancelled = false
                    AND sg.is_archived = false
                    AND sg.transferred_out_at IS NULL) u
          GROUP BY u.package_id) pay ON pay.package_id = p.id
     LEFT JOIN ( SELECT w.package_id,
            sum(w.amount) AS wages_prepaid
           FROM ( SELECT da.task_work_package_id AS package_id,
                    da.daily_earnings AS amount
                   FROM daily_attendance da
                  WHERE da.task_work_package_id IS NOT NULL
                    AND da.is_paid = true
                    AND da.is_deleted = false
                    AND da.is_archived = false
                    -- already counted by the crew-settlement branch above
                    AND NOT EXISTS (
                      SELECT 1 FROM settlement_groups sg
                      WHERE sg.id = da.settlement_group_id
                        AND sg.contract_ref_kind = 'task_work'
                        AND sg.contract_ref_id = da.task_work_package_id
                        AND sg.payment_type = 'salary'
                        AND sg.is_cancelled = false
                        AND sg.is_archived = false
                        AND sg.transferred_out_at IS NULL)
                UNION ALL
                 SELECT ma.task_work_package_id AS package_id,
                    ma.total_cost AS amount
                   FROM market_laborer_attendance ma
                  WHERE ma.task_work_package_id IS NOT NULL
                    AND ma.is_paid = true
                    AND NOT EXISTS (
                      SELECT 1 FROM settlement_groups sg
                      WHERE sg.id = ma.settlement_group_id
                        AND sg.contract_ref_kind = 'task_work'
                        AND sg.contract_ref_id = ma.task_work_package_id
                        AND sg.payment_type = 'salary'
                        AND sg.is_cancelled = false
                        AND sg.is_archived = false
                        AND sg.transferred_out_at IS NULL)) w
          GROUP BY w.package_id) pre ON pre.package_id = p.id;

-- NOTE: deliberately NOT setting security_invoker — the live view runs as owner
-- today and flipping it here would change RLS behavior beyond this patch.

GRANT SELECT ON public.v_task_work_profitability TO authenticated, service_role;

COMMENT ON VIEW public.v_task_work_profitability IS
  'Per-package money + effort rollup. paid = lump task_work_payments (is_deleted=false) + per-laborer crew settlements (settlement_groups with contract_ref_kind=task_work, payment_type=salary, not cancelled/archived/transferred). wages_prepaid = daily wages ALREADY settled on days later retagged onto this package (daily_attendance.daily_earnings + market_laborer_attendance.total_cost where is_paid), excluding rows whose settlement group is already counted in paid. total_paid = paid + wages_prepaid; balance = total_value - total_paid. Commission payouts excluded (per-collector, not per-package). Subcontract reconciliation is unaffected.';
