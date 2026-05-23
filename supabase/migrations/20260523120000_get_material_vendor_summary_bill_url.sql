-- Slice 1 of "Material Catalog — Bill Provenance + Photo-on-Ingest":
-- extend get_material_vendor_summary to also return the bill_url of each
-- vendor's most-recent purchase against the material. The Vendors tab in
-- MaterialInspectPane uses this to render a "View bill" chip next to the
-- existing "Last: ₹X on <date>" summary line.
--
-- Backward compatible from the consumer POV (one column appended). RETURNS
-- TABLE signature changed, so DROP-then-CREATE is required.
--
-- The only structural change vs 20260522100000_vendor_summary_variant_prices.sql
-- is the addition of mpe.bill_url in the last_purchase CTE and a corresponding
-- column in the SELECT + RETURNS list. Everything else is verbatim.
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
quotes_per_variant AS (
  SELECT
    vi.vendor_id,
    vi.material_id,
    MIN(vi.current_price) AS price
  FROM vendor_inventory vi
  WHERE vi.material_id IN (SELECT id FROM material_set WHERE id <> p_material_id)
    AND vi.is_available = TRUE
    AND vi.current_price IS NOT NULL
  GROUP BY vi.vendor_id, vi.material_id
),
variant_breakdown AS (
  SELECT
    qpv.vendor_id,
    jsonb_agg(
      jsonb_build_object(
        'variant_id',   qpv.material_id,
        'variant_name', m.name,
        'variant_code', m.code,
        'price',        qpv.price
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
LEFT JOIN purchase_totals   pt ON pt.vendor_id = v.id
LEFT JOIN last_purchase     lp ON lp.vendor_id = v.id
LEFT JOIN variant_breakdown vb ON vb.vendor_id = v.id
WHERE v.is_active = TRUE
  AND (q.vendor_id IS NOT NULL OR pt.vendor_id IS NOT NULL)
ORDER BY q.min_price NULLS LAST, v.name;
$function$;
