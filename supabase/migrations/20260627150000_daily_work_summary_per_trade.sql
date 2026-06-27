-- Per-trade day work log.
--
-- daily_work_summary held the "what work was done" narrative + site photos as ONE row
-- per (site_id, date) — so a trade workspace (e.g. Painting, opened via ?contractId=)
-- showed and could overwrite Civil's site-wide log. Give each trade its own log.
--
-- Model (mirrors site_holidays.trade_category_id):
--   subcontract_id IS NULL  -> the main / Civil site-wide log (all existing rows).
--   subcontract_id = <id>   -> that trade contract's own log.
-- Existing rows keep subcontract_id NULL, so the Civil/main view is byte-for-byte.
--
-- The old plain UNIQUE (site_id, date) must go (it would forbid a Civil + a Painting row
-- on the same day); replace it with two partial unique indexes, exactly like the holidays
-- pattern (uq_site_holiday_sitewide / uq_site_holiday_per_trade). The app saves with a
-- manual select-then-update/insert (no ON CONFLICT), so it does not depend on a single
-- inferable constraint.

alter table public.daily_work_summary
  add column if not exists subcontract_id uuid
  references public.subcontracts(id) on delete cascade;

alter table public.daily_work_summary
  drop constraint if exists daily_work_summary_site_id_date_key;

-- One site-wide (Civil/main) row per day.
create unique index if not exists uq_dws_sitewide
  on public.daily_work_summary (site_id, date)
  where subcontract_id is null;

-- One row per (site, day, trade contract).
create unique index if not exists uq_dws_per_trade
  on public.daily_work_summary (site_id, date, subcontract_id)
  where subcontract_id is not null;

-- Helps the per-trade lookups.
create index if not exists idx_dws_subcontract
  on public.daily_work_summary (subcontract_id)
  where subcontract_id is not null;
