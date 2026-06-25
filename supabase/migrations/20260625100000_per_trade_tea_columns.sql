-- Per-trade tea: mode + pool host on trades; pool-host tag on entries/settlements.

-- 1) Trade-level controls.
ALTER TABLE public.labor_categories
  ADD COLUMN IF NOT EXISTS tea_mode text NOT NULL DEFAULT 'pool'
    CHECK (tea_mode IN ('pool','own','off')),
  ADD COLUMN IF NOT EXISTS tea_pool_host_category_id uuid NULL
    REFERENCES public.labor_categories(id) ON DELETE SET NULL;

-- 2) Pool-host tag on the money rows. NULL = legacy common pool (resolved to the
--    company default host by the view). New common-pool rows may also stay NULL.
ALTER TABLE public.tea_shop_entries
  ADD COLUMN IF NOT EXISTS trade_pool_host_category_id uuid NULL
    REFERENCES public.labor_categories(id) ON DELETE SET NULL;
ALTER TABLE public.tea_shop_settlements
  ADD COLUMN IF NOT EXISTS trade_pool_host_category_id uuid NULL
    REFERENCES public.labor_categories(id) ON DELETE SET NULL;

-- 3) Single source of truth: the trade that hosts a company's common tea pool.
--    Civil if present, else the first active trade by display_order.
CREATE OR REPLACE FUNCTION public.default_tea_pool_host(p_company_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT id FROM public.labor_categories
   WHERE company_id = p_company_id
   ORDER BY (lower(name) = 'civil') DESC, is_active DESC, display_order ASC, name ASC
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.default_tea_pool_host(uuid) TO authenticated;

-- 4) Backfill the host pointer for 'pool' trades so membership matching is
--    non-null trade-side. Existing entries/settlements stay NULL (= common pool).
UPDATE public.labor_categories lc
   SET tea_pool_host_category_id = public.default_tea_pool_host(lc.company_id)
 WHERE lc.tea_mode = 'pool'
   AND lc.tea_pool_host_category_id IS NULL;

-- 'own' trades host themselves (singleton pool).
UPDATE public.labor_categories
   SET tea_pool_host_category_id = id
 WHERE tea_mode = 'own'
   AND tea_pool_host_category_id IS NULL;
