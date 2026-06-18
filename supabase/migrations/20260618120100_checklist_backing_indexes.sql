-- Migration: Daily Compliance Checklist — supporting indexes
--
-- Purpose:
--   get_checklist_compliance resolves each auto detection_source by looking up
--   the earliest backing record for a (site/user, date). These composite indexes
--   keep that lookup cheap across the office overview's date range. All are
--   additive and idempotent. This app's tables are small (single company), so a
--   plain CREATE INDEX lock is acceptable.

-- material usage (site + usage_date)
CREATE INDEX IF NOT EXISTS idx_dmu_site_usage_date
  ON public.daily_material_usage (site_id, usage_date);

-- batch usage (usage_site + usage_date)
CREATE INDEX IF NOT EXISTS idx_bur_site_usage_date
  ON public.batch_usage_records (usage_site_id, usage_date);

-- attendance (site + date) — morning/evening existence checks
CREATE INDEX IF NOT EXISTS idx_da_site_date
  ON public.daily_attendance (site_id, date);

-- deliveries recorded that day (site + recorded_at)
CREATE INDEX IF NOT EXISTS idx_deliveries_site_recorded_at
  ON public.deliveries (site_id, recorded_at);

-- deliveries verified that day (site + engineer_verified_at)
CREATE INDEX IF NOT EXISTS idx_deliveries_site_eng_verified_at
  ON public.deliveries (site_id, engineer_verified_at);

-- wallet transactions (user + site + transaction_date)
CREATE INDEX IF NOT EXISTS idx_set_user_site_txn_date
  ON public.site_engineer_transactions (user_id, site_id, transaction_date);
