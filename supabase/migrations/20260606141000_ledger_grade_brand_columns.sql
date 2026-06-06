-- Expose grade attribution + resolved brand name on the usage ledger view.
--   group_default_grade_id / _name : the parent material's default grade variant
--     (materials.default_grade_variant_id) so the app can attribute bare-parent
--     usage to that grade (e.g. PPC Cement bare usage -> "43 Grade").
--   brand_name : material_brands.brand_name resolved from brand_id (the view is a
--     UNION so PostgREST can't embed it; resolve it here for the breakdown + drawer).
-- Restates the body from 20260606130000 and only APPENDS columns at the end of
-- each UNION branch (CREATE OR REPLACE VIEW requirement).

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
    NULL::boolean           AS is_verified,
    pmat.id                 AS parent_material_id,
    pmat.name               AS parent_material_name,
    COALESCE(pmat.default_grade_variant_id, mat.default_grade_variant_id) AS group_default_grade_id,
    dgm.name                AS group_default_grade_name,
    mbr.brand_name
  FROM batch_usage_records bur
  JOIN sites s   ON s.id   = bur.usage_site_id
  JOIN materials mat ON mat.id = bur.material_id
  LEFT JOIN materials pmat ON pmat.id = mat.parent_id
  LEFT JOIN materials dgm ON dgm.id = COALESCE(pmat.default_grade_variant_id, mat.default_grade_variant_id)
  LEFT JOIN material_brands mbr ON mbr.id = bur.brand_id
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
    dmu.is_verified,
    pm.id                   AS parent_material_id,
    pm.name                 AS parent_material_name,
    COALESCE(pm.default_grade_variant_id, m.default_grade_variant_id) AS group_default_grade_id,
    dgm.name                AS group_default_grade_name,
    mbr.brand_name
  FROM daily_material_usage dmu
  JOIN sites s   ON s.id   = dmu.site_id
  JOIN materials m ON m.id = dmu.material_id
  LEFT JOIN materials pm ON pm.id = m.parent_id
  LEFT JOIN materials dgm ON dgm.id = COALESCE(pm.default_grade_variant_id, m.default_grade_variant_id)
  LEFT JOIN material_brands mbr ON mbr.id = dmu.brand_id
  LEFT JOIN building_sections sec ON sec.id = dmu.section_id;

GRANT SELECT ON public.v_material_usage_ledger TO authenticated;