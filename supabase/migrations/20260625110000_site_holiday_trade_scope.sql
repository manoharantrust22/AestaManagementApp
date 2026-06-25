-- Per-trade holidays: a holiday can belong to a trade (NULL = whole-site = today).
ALTER TABLE public.site_holidays
  ADD COLUMN IF NOT EXISTS trade_category_id uuid NULL
    REFERENCES public.labor_categories(id) ON DELETE CASCADE;

-- Replace UNIQUE(site_id, date) so a whole-site row and per-trade rows coexist,
-- each still de-duped. (Old constraint name verified live: site_holidays_site_id_date_key.)
ALTER TABLE public.site_holidays DROP CONSTRAINT IF EXISTS site_holidays_site_id_date_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_site_holiday_sitewide
  ON public.site_holidays (site_id, date)
  WHERE trade_category_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_site_holiday_per_trade
  ON public.site_holidays (site_id, date, trade_category_id)
  WHERE trade_category_id IS NOT NULL;
