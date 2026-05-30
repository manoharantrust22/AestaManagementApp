-- "Landed price on catalog cards & vendor pane":
-- extend get_material_vendor_summary so the Vendors tab can compare vendors on
-- LANDED cost (quoted price + transport/loading/unloading + GST when the vendor
-- explicitly stated it), not just the bare quoted price. Two P-Sand vendors that
-- both quote ₹5,500 base now differ once transport is folded in.
--
-- New output columns (appended): min_landed_price, min_landed_base,
-- min_landed_gst_extra, min_landed_transport_extra — all derived from the
-- CHEAPEST-LANDED quote per vendor. Existing min_price (base) is kept untouched.
-- variant_prices jsonb gains a `landed_price` key alongside the existing `price`.
--
-- The per-row landed formula MUST stay in sync with the TypeScript helper in
-- src/lib/materials/landedCost.ts. GST is added only when price_includes_gst is
-- false AND gst_rate > 0 (the common no-GST bill therefore has zero GST impact).
--
-- RETURNS TABLE signature changes, so DROP-then-CREATE is required.
DROP FUNCTION IF EXISTS public.get_material_vendor_summary(uuid);

CREATE FUNCTION public.get_material_vendor_summary(p_material_id uuid)
 RETURNS TABLE(
   vendor_id uuid,
   vendor_name text,
   shop_name text,
   vendor_type text,
   bill_policy text,
   accepts_cash boolean,
   accepts_upi boolean,
   accepts_credit boolean,
   gst_number text,
   quote_count integer,
   brand_chips text[],
   distinct_brands_count integer,
   min_price numeric,
   min_landed_price numeric,
   min_landed_base numeric,
   min_landed_gst_extra numeric,
   min_landed_transport_extra numeric,
   latest_quote_updated timestamp with time zone,
   last_purchase_date date,
   last_purchase_amount numeric,
   last_bill_url text,
   total_purchased_value numeric,
   total_purchased_qty numeric,
   purchase_count integer,
   variant_prices jsonb
 )
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
-- Per-row landed cost + its components (only priced, available rows).
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
    MIN(vi.current_price)                                        AS min_price,
    MAX(COALESCE(vi.last_price_update, vi.updated_at))           AS latest_quote_updated,
    ARRAY_AGG(DISTINCT mb.brand_name)
      FILTER (WHERE mb.brand_name IS NOT NULL)                   AS brand_chips,
    COUNT(DISTINCT vi.brand_id)
      FILTER (WHERE vi.brand_id IS NOT NULL)::int                AS distinct_brands_count
  FROM vendor_inventory vi
  LEFT JOIN material_brands mb ON mb.id = vi.brand_id
  WHERE vi.material_id IN (SELECT id FROM material_set)
    AND vi.is_available = TRUE
  GROUP BY vi.vendor_id
),
-- The cheapest-landed quote per vendor, with its breakdown (for the tooltip).
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
