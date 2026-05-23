-- Slice 2 of "Material Catalog — Bill Provenance + Photo-on-Ingest":
-- a view returning, for every material that has at least one purchase line
-- item, the chronologically-latest purchase: date, unit price, vendor name,
-- and bill URL. Catalog list rows render a "Last: ₹X · <vendor> · <date> · 📎"
-- secondary line from this — distinct from "best price" (lowest across
-- vendors) which is computed client-side from vendor_inventory.
--
-- One row per material_id. DISTINCT ON (mpei.material_id) ordered by
-- purchase_date DESC, then purchase_expense_id DESC for deterministic
-- tie-breaking when two purchases land on the same date.
--
-- A view (not a materialized view) keeps it always-fresh; the underlying
-- tables aren't huge enough to justify the refresh overhead.
CREATE OR REPLACE VIEW public.v_material_latest_purchase
WITH (security_invoker = true) AS
SELECT DISTINCT ON (mpei.material_id)
  mpei.material_id                                 AS material_id,
  mpe.purchase_date                                AS last_purchase_date,
  mpei.unit_price                                  AS last_unit_price,
  mpe.vendor_id                                    AS last_vendor_id,
  COALESCE(v.name, mpe.vendor_name)                AS last_vendor_name,
  mpe.bill_url                                     AS last_bill_url,
  mpe.id                                           AS last_purchase_expense_id
FROM public.material_purchase_expense_items mpei
JOIN public.material_purchase_expenses mpe
  ON mpe.id = mpei.purchase_expense_id
LEFT JOIN public.vendors v
  ON v.id = mpe.vendor_id
ORDER BY mpei.material_id, mpe.purchase_date DESC, mpe.id DESC;

COMMENT ON VIEW public.v_material_latest_purchase IS
  'One row per material, carrying the most-recent purchase: date, unit price, vendor, bill_url. Used by /company/materials to render the per-row "Last:" line.';

-- Grant SELECT to authenticated users; the view inherits row-level security
-- from the underlying tables via security_invoker=true.
GRANT SELECT ON public.v_material_latest_purchase TO authenticated;
GRANT SELECT ON public.v_material_latest_purchase TO anon;
