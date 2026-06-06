-- Extend v_material_usage_ledger with the parent material (for variant roll-up).
-- Some materials are grade/size *variants* (e.g. "43 Grade" → PPC Cement,
-- "TMT Rods 12mm" → TMT Rods) carried as their own materials row with a
-- materials.parent_id pointer. The Usage Ledger groups by parent so a variant's
-- usage rolls up under its main material instead of surfacing as a bare row.
-- parent_material_id / parent_material_name are NULL for materials with no parent
-- (the app coalesces parent_* → material_* so a non-variant material is its own group).

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
    pmat.name               AS parent_material_name
  FROM batch_usage_records bur
  JOIN sites s   ON s.id   = bur.usage_site_id
  JOIN materials mat ON mat.id = bur.material_id
  LEFT JOIN materials pmat ON pmat.id = mat.parent_id
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
    pm.name                 AS parent_material_name
  FROM daily_material_usage dmu
  JOIN sites s   ON s.id   = dmu.site_id
  JOIN materials m ON m.id = dmu.material_id
  LEFT JOIN materials pm ON pm.id = m.parent_id
  LEFT JOIN building_sections sec ON sec.id = dmu.section_id;

GRANT SELECT ON public.v_material_usage_ledger TO authenticated;
