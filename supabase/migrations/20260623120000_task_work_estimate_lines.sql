-- Per-worker-type daywage estimate breakdown for Task Work packages.
--
-- The estimate "basis for the price" used to be a single Crew size × Days ×
-- Daily wage. A real crew is mixed (Mason @ ₹1000, female helper @ ₹600, male
-- helper @ ₹700), so one daily wage cannot represent it and the saving benchmark
-- was wrong whenever the crew had more than one rate.
--
-- We now store the full per-type breakdown here as JSONB, and keep the existing
-- scalar columns (estimated_crew_size, estimated_days, benchmark_daily_rate) as a
-- rolled-up summary so v_task_work_profitability keeps working UNCHANGED:
--   estimated_crew_size    = Σ count
--   estimated_days         = shared days (D)
--   benchmark_daily_rate   = Σ(count × daily_rate) / Σ count   (count-weighted avg)
-- giving  crew_size × days × rate = D × Σ(count × daily_rate) = the true benchmark.
--
-- Additive only — no view/RLS change (inherits task_work_packages policies).
ALTER TABLE public.task_work_packages
  ADD COLUMN IF NOT EXISTS estimate_lines jsonb;

COMMENT ON COLUMN public.task_work_packages.estimate_lines IS
  'Per-worker-type daywage estimate: array of {kind, ref_id, label, count, daily_rate} sharing estimated_days. Benchmark = (Σ count×daily_rate) × estimated_days. estimated_crew_size & benchmark_daily_rate are the rolled-up summary kept in sync for v_task_work_profitability.';
