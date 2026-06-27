-- Workspace-aware holidays: reserve trade_category_id = NULL for "All workspaces".
--
-- Background: migration 20260625110000 added site_holidays.trade_category_id
-- (NULL = whole-site, shows in every workspace incl. non-Civil trades). The owner
-- reports that today's whole-site holidays are really Civil's (they leak into the
-- Painting/Electrical workspaces). The new model:
--   * trade_category_id = NULL        -> "All workspaces" (genuine site-wide; opt-in going forward)
--   * trade_category_id = <category>  -> that workspace only (Civil, Painting, ...)
--
-- This one-time migration reclassifies every PRE-EXISTING whole-site (NULL) row as
-- its company's Civil holiday, so it no longer appears inside non-Civil workspaces.
-- The Civil view (now a real scope = Civil's category id) keeps showing them, so the
-- list is visually unchanged. Companies with no "Civil" labor_category are skipped by
-- the join below (their NULL rows stay NULL = "all workspaces" = legacy behaviour).
--
-- Idempotent: after this runs there are no NULL rows left to re-tag (except Civil-less
-- companies), so re-running is a no-op. Reversible: a row's Civil tag can be cleared
-- back to NULL if ever needed.

-- 1) De-dup guard. A (site_id, date) could in principle already hold a Civil-tagged
--    row (the per-trade-holidays slice shipped 2 days ago). Re-tagging a NULL row on
--    the same (site, date) would then violate the partial unique index
--    uq_site_holiday_per_trade (site_id, date, trade_category_id) WHERE NOT NULL.
--    Drop such redundant legacy NULL rows first. (Currently a no-op: 0 tagged rows.)
DELETE FROM public.site_holidays AS sh_null
USING public.sites AS s,
      public.labor_categories AS civ,
      public.site_holidays AS sh_civ
WHERE sh_null.trade_category_id IS NULL
  AND s.id = sh_null.site_id
  AND civ.company_id = s.company_id
  AND civ.name = 'Civil'
  AND sh_civ.site_id = sh_null.site_id
  AND sh_civ.date = sh_null.date
  AND sh_civ.trade_category_id = civ.id;

-- 2) Re-tag the remaining legacy whole-site rows as the site's company Civil category.
UPDATE public.site_holidays AS sh
SET trade_category_id = civ.id
FROM public.sites AS s
JOIN public.labor_categories AS civ
  ON civ.company_id = s.company_id
 AND civ.name = 'Civil'
WHERE sh.site_id = s.id
  AND sh.trade_category_id IS NULL;
