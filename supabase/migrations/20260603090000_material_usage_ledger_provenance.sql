-- Extend v_material_usage_ledger with provenance columns for usage traceability.
-- Adds: batch_ref_code, created_by, created_at, is_self_use, settlement_status, is_verified.
-- The batch branch carries batch provenance; the own (daily_material_usage) branch
-- carries verification provenance. NULLs fill the columns each source lacks.
-- NOTE: created_by namespaces differ by source — bur.created_by is an auth.users id,
-- dmu.created_by is a public.users id. Name resolution happens in the app layer, not here.

CREATE OR REPLACE VIEW v_material_usage_ledger AS
  SELECT
    bur.id,
    bur.usage_site_id       AS site_id,
    s.site_group_id,
    bur.material_id,
    bur.brand_id,
    bur.section_id,
    bur.quantity,
    bur.unit,
    bur.unit_cost,
    bur.total_cost,
    bur.usage_date,
    bur.work_description,
    'batch'::text           AS source,
    mat.name                AS material_name,
    sec.name                AS section_name,
    bur.batch_ref_code,
    bur.created_by,
    bur.created_at,
    bur.is_self_use,
    bur.settlement_status,
    NULL::boolean           AS is_verified
  FROM batch_usage_records bur
  JOIN sites s   ON s.id   = bur.usage_site_id
  JOIN materials mat ON mat.id = bur.material_id
  LEFT JOIN building_sections sec ON sec.id = bur.section_id
  UNION ALL
  SELECT
    dmu.id,
    dmu.site_id,
    s.site_group_id,
    dmu.material_id,
    dmu.brand_id,
    dmu.section_id,
    dmu.quantity,
    m.unit::text,
    dmu.unit_cost,
    COALESCE(dmu.total_cost, dmu.quantity * dmu.unit_cost) AS total_cost,
    dmu.usage_date,
    dmu.work_description,
    'own'::text             AS source,
    m.name                  AS material_name,
    sec.name                AS section_name,
    NULL::text              AS batch_ref_code,
    dmu.created_by,
    dmu.created_at,
    NULL::boolean           AS is_self_use,
    NULL::text              AS settlement_status,
    dmu.is_verified
  FROM daily_material_usage dmu
  JOIN sites s   ON s.id   = dmu.site_id
  JOIN materials m ON m.id = dmu.material_id
  LEFT JOIN building_sections sec ON sec.id = dmu.section_id;

GRANT SELECT ON public.v_material_usage_ledger TO authenticated;
