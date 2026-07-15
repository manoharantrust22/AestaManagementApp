-- Plywood & Boards (WOD-PLY) subcategory under Wood & Timber (WOD).
--
-- Why: Wood & Timber holds two different product SHAPES that cannot share one
-- variant spec template:
--   * Teak wood  — linear stock, priced by cross-section x length (4" x 2" x 7ft)
--   * Plywood    — sheet goods, priced by sheet size x thickness (8x4 ft, 18mm)
-- A category-level template served the first and mis-labelled the second as
-- "Cross-section (mm)". Splitting sheet goods into their own subcategory lets
-- the template resolver key on it (see CATEGORY_CODE_MAP 'WOD-PLY').
--
-- Blast radius: 1 material (Plywood / PLY-0001), 0 variants, 1 vendor quote.
-- Rollback: point the material's category_id back at WOD; the empty
-- subcategory row is inert and can be left in place.

INSERT INTO material_categories (name, code, parent_id, display_order, is_active)
SELECT 'Plywood & Boards', 'WOD-PLY', mc.id, 1, TRUE
FROM material_categories mc
WHERE mc.code = 'WOD'
ON CONFLICT DO NOTHING;

UPDATE materials m
SET category_id = (SELECT id FROM material_categories WHERE code = 'WOD-PLY')
WHERE m.parent_id IS NULL
  AND m.name ILIKE '%plywood%'
  AND m.category_id = (SELECT id FROM material_categories WHERE code = 'WOD');
