-- v_task_work_profitability: fold per-laborer crew settlements into `paid`.
--
-- Until now `paid` summed only lump task_work_payments, so a direct-pay package
-- (mesthri_commission_enabled = true — lump payments trigger-blocked, crew paid
-- one laborer at a time via record_contract_laborer_payment) always showed
-- paid = 0 no matter how much wage money had gone out. Those crew payments are
-- settlement_groups rows linked via contract_ref_kind='task_work' /
-- contract_ref_id (20260707140000) and appeared in NO rollup on /site/trades.
--
-- `paid` is now lump task_work_payments + salary-type crew settlements.
-- Mesthri commission payouts (payment_type='commission') stay excluded: they
-- are matched per-collector across contracts, not per-package, so they cannot
-- be attributed to one package's balance.
--
-- No double counting: the trigger block_task_work_crew_payout_on_commission
-- prevents lump payments on direct-pay packages, and record_contract_laborer_payment
-- clamps each crew settlement to the laborer's remaining net owed.
--
-- Body otherwise identical to the live definition (last shaped by
-- 20260619120400_task_work_profitability_estimate_saving.sql + 20260623120000).

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
    p.total_value - COALESCE(pay.paid, 0::numeric) AS balance,
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
    round(COALESCE(p.estimated_crew_size, 0)::numeric * COALESCE(p.estimated_days, 0::numeric) * COALESCE(p.benchmark_daily_rate, 0::numeric), 2) AS estimated_daywage_cost
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
          GROUP BY u.package_id) pay ON pay.package_id = p.id;

-- NOTE: deliberately NOT setting security_invoker — the live view runs as owner
-- today and flipping it here would change RLS behavior beyond this patch.

GRANT SELECT ON public.v_task_work_profitability TO authenticated, service_role;

COMMENT ON VIEW public.v_task_work_profitability IS
  'Per-package money + effort rollup. paid = lump task_work_payments (is_deleted=false) + per-laborer crew settlements (settlement_groups with contract_ref_kind=task_work, payment_type=salary, not cancelled/archived/transferred). Commission payouts excluded (per-collector, not per-package).';
