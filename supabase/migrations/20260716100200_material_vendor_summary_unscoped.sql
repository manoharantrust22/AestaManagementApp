-- get_material_vendor_summary: surface how many of a vendor's quotes are
-- "unscoped" — i.e. fail the material's own price-scoping declaration.
--
-- Why: 130 of 242 live quotes sit on a parent material with no brand. We are not
-- backfilling them (a single existing brand does not prove the price was for it),
-- so the Vendors tab flags them instead and they get cleaned up as they're
-- touched. The rule lives HERE rather than in the client so the count already
-- respects materials.price_varies_by_brand / _by_variant — sand and cement stay
-- quiet, which is the whole point of the per-material declaration.
--
-- CREATE OR REPLACE cannot change a function's OUT signature, so this DROPs and
-- recreates. The added column is additive: prod code running before the deploy
-- ignores it, which is what makes the migrate-before-push rule safe here.
-- DROP also discards the explicit grants — they are re-issued at the bottom.
--
-- ROLLBACK: drop this function and re-create the prior definition, which was
-- identical except that it had NO parent_flags CTE, no `LEFT JOIN parent_flags
-- pf ON TRUE` in the `quotes` CTE, and no unscoped_quote_count in the `quotes`
-- CTE / RETURNS TABLE / final SELECT. Removing those four additions from the
-- body below reproduces the previous version byte-for-byte.

DROP FUNCTION IF EXISTS public.get_material_vendor_summary(uuid);

CREATE OR REPLACE FUNCTION public.get_material_vendor_summary(p_material_id uuid)
 RETURNS TABLE(vendor_id uuid, vendor_name text, shop_name text, vendor_type text, bill_policy text, accepts_cash boolean, accepts_upi boolean, accepts_credit boolean, gst_number text, quote_count integer, unscoped_quote_count integer, brand_chips text[], distinct_brands_count integer, min_price numeric, min_landed_price numeric, min_landed_base numeric, min_landed_gst_extra numeric, min_landed_transport_extra numeric, latest_quote_updated timestamp with time zone, last_purchase_date date, last_purchase_amount numeric, last_bill_url text, total_purchased_value numeric, total_purchased_qty numeric, purchase_count integer, variant_prices jsonb)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
WITH material_set AS (
  SELECT p_material_id AS id
  UNION
  SELECT m.id FROM materials m
   WHERE m.parent_id = p_material_id
     AND m.is_active = TRUE
),
-- The parent's declaration of what its price depends on. 0 or 1 rows; joined
-- with ON TRUE so a missing material degrades to "nothing is unscoped" rather
-- than annihilating every quote row.
parent_flags AS (
  SELECT m.price_varies_by_brand, m.price_varies_by_variant
  FROM materials m
  WHERE m.id = p_material_id
),
inv_landed AS (
  SELECT
    vi.vendor_id,
    vi.material_id,
    vi.current_price                                              AS base,
    (CASE WHEN vi.price_includes_gst OR COALESCE(vi.gst_rate, 0) <= 0 THEN 0
          ELSE vi.current_price * COALESCE(vi.gst_rate, 0) / 100.0 END)
                                                                  AS gst_extra,
    ((CASE WHEN vi.price_includes_transport THEN 0
           ELSE COALESCE(vi.transport_cost, 0) END)
       + COALESCE(vi.loading_cost, 0)
       + COALESCE(vi.unloading_cost, 0))                          AS transport_extra,
    (vi.current_price
       + (CASE WHEN vi.price_includes_gst OR COALESCE(vi.gst_rate, 0) <= 0 THEN 0
               ELSE vi.current_price * COALESCE(vi.gst_rate, 0) / 100.0 END)
       + (CASE WHEN vi.price_includes_transport THEN 0
               ELSE COALESCE(vi.transport_cost, 0) END)
       + COALESCE(vi.loading_cost, 0)
       + COALESCE(vi.unloading_cost, 0))                          AS landed
  FROM vendor_inventory vi
  WHERE vi.material_id IN (SELECT id FROM material_set)
    AND vi.is_available = TRUE
    AND vi.current_price IS NOT NULL
),
quotes AS (
  SELECT
    vi.vendor_id,
    COUNT(*)::int                                                AS quote_count,
    -- A quote is unscoped when it fails the parent's own declaration: no brand
    -- on a brand-priced material, or bound to the parent rather than a variant
    -- on a variant-priced one.
    COUNT(*) FILTER (
      WHERE (pf.price_varies_by_brand   AND vi.brand_id IS NULL)
         OR (pf.price_varies_by_variant AND vi.material_id = p_material_id)
    )::int                                                       AS unscoped_quote_count,
    MIN(vi.current_price)                                        AS min_price,
    MAX(COALESCE(vi.last_price_update, vi.updated_at))           AS latest_quote_updated,
    ARRAY_AGG(DISTINCT mb.brand_name)
      FILTER (WHERE mb.brand_name IS NOT NULL)                   AS brand_chips,
    COUNT(DISTINCT vi.brand_id)
      FILTER (WHERE vi.brand_id IS NOT NULL)::int                AS distinct_brands_count
  FROM vendor_inventory vi
  LEFT JOIN material_brands mb ON mb.id = vi.brand_id
  LEFT JOIN parent_flags pf ON TRUE
  WHERE vi.material_id IN (SELECT id FROM material_set)
    AND vi.is_available = TRUE
  GROUP BY vi.vendor_id
),
landed_agg AS (
  SELECT DISTINCT ON (il.vendor_id)
    il.vendor_id,
    il.landed          AS min_landed_price,
    il.base            AS min_landed_base,
    il.gst_extra       AS min_landed_gst_extra,
    il.transport_extra AS min_landed_transport_extra
  FROM inv_landed il
  ORDER BY il.vendor_id, il.landed ASC, il.base ASC
),
quotes_per_variant AS (
  SELECT
    il.vendor_id,
    il.material_id,
    MIN(il.base)   AS price,
    MIN(il.landed) AS landed_price
  FROM inv_landed il
  WHERE il.material_id <> p_material_id
  GROUP BY il.vendor_id, il.material_id
),
variant_breakdown AS (
  SELECT
    qpv.vendor_id,
    jsonb_agg(
      jsonb_build_object(
        'variant_id',   qpv.material_id,
        'variant_name', m.name,
        'variant_code', m.code,
        'price',        qpv.price,
        'landed_price', qpv.landed_price
      ) ORDER BY m.name
    ) AS variant_prices
  FROM quotes_per_variant qpv
  JOIN materials m ON m.id = qpv.material_id
  GROUP BY qpv.vendor_id
),
per_purchase AS (
  SELECT
    mpe.id              AS purchase_id,
    mpe.vendor_id,
    mpe.purchase_date,
    mpe.bill_url        AS bill_url,
    SUM(mpei.total_price)  AS purchase_subtotal,
    SUM(mpei.quantity)     AS purchase_qty
  FROM material_purchase_expense_items mpei
  JOIN material_purchase_expenses mpe
    ON mpe.id = mpei.purchase_expense_id
  WHERE mpei.material_id IN (SELECT id FROM material_set)
    AND mpe.vendor_id IS NOT NULL
  GROUP BY mpe.id, mpe.vendor_id, mpe.purchase_date, mpe.bill_url
),
purchase_totals AS (
  SELECT
    vendor_id,
    COUNT(*)::int            AS purchase_count,
    SUM(purchase_subtotal)   AS total_purchased_value,
    SUM(purchase_qty)        AS total_purchased_qty
  FROM per_purchase
  GROUP BY vendor_id
),
last_purchase AS (
  SELECT DISTINCT ON (pp.vendor_id)
    pp.vendor_id,
    pp.purchase_date         AS last_purchase_date,
    pp.purchase_subtotal     AS last_purchase_amount,
    pp.bill_url              AS last_bill_url
  FROM per_purchase pp
  ORDER BY pp.vendor_id, pp.purchase_date DESC, pp.purchase_id DESC
)
SELECT
  v.id                                            AS vendor_id,
  v.name                                          AS vendor_name,
  v.shop_name                                     AS shop_name,
  v.vendor_type::text                             AS vendor_type,
  v.bill_policy::text                             AS bill_policy,
  v.accepts_cash                                  AS accepts_cash,
  v.accepts_upi                                   AS accepts_upi,
  v.accepts_credit                                AS accepts_credit,
  v.gst_number                                    AS gst_number,
  COALESCE(q.quote_count, 0)                      AS quote_count,
  COALESCE(q.unscoped_quote_count, 0)             AS unscoped_quote_count,
  COALESCE(q.brand_chips, ARRAY[]::text[])        AS brand_chips,
  COALESCE(q.distinct_brands_count, 0)            AS distinct_brands_count,
  q.min_price                                     AS min_price,
  la.min_landed_price                             AS min_landed_price,
  la.min_landed_base                              AS min_landed_base,
  la.min_landed_gst_extra                         AS min_landed_gst_extra,
  la.min_landed_transport_extra                   AS min_landed_transport_extra,
  q.latest_quote_updated                          AS latest_quote_updated,
  lp.last_purchase_date                           AS last_purchase_date,
  lp.last_purchase_amount                         AS last_purchase_amount,
  lp.last_bill_url                                AS last_bill_url,
  pt.total_purchased_value                        AS total_purchased_value,
  pt.total_purchased_qty                          AS total_purchased_qty,
  COALESCE(pt.purchase_count, 0)                  AS purchase_count,
  COALESCE(vb.variant_prices, '[]'::jsonb)        AS variant_prices
FROM vendors v
LEFT JOIN quotes            q  ON q.vendor_id  = v.id
LEFT JOIN landed_agg        la ON la.vendor_id = v.id
LEFT JOIN purchase_totals   pt ON pt.vendor_id = v.id
LEFT JOIN last_purchase     lp ON lp.vendor_id = v.id
LEFT JOIN variant_breakdown vb ON vb.vendor_id = v.id
WHERE v.is_active = TRUE
  AND (q.vendor_id IS NOT NULL OR pt.vendor_id IS NOT NULL)
ORDER BY la.min_landed_price NULLS LAST, q.min_price NULLS LAST, v.name;
$function$;

-- DROP discarded these; restore the pre-existing ACL.
GRANT EXECUTE ON FUNCTION public.get_material_vendor_summary(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_material_vendor_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_material_vendor_summary(uuid) TO service_role;
