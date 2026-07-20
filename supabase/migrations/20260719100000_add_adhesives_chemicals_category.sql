-- Adds "Adhesives & Chemicals" category: tile adhesives, grouts, sealants, and
-- construction chemicals that don't fit Cement & Binding or Tiles & Flooring.
-- Top-level (not nested under Tiles/Cement) since these products cut across
-- trades, matching the existing CTR/WPF top-level pattern.

INSERT INTO material_categories (name, code, description, display_order, icon, is_active)
VALUES (
  'Adhesives & Chemicals',
  'ADH',
  'Tile adhesives, grouts, sealants, and construction chemicals that do not fit Cement & Binding or Tiles & Flooring.',
  102,
  NULL,
  true
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO material_categories (name, code, description, parent_id, display_order, icon, is_active)
SELECT
  'Tile Adhesive & Grout',
  'ADH-TIL',
  'Tile-setting adhesives and grouts (e.g. MCP Tixolite, MYK Laticrete, Roff, Fevicol).',
  id,
  1,
  NULL,
  true
FROM material_categories
WHERE code = 'ADH'
ON CONFLICT (code) DO NOTHING;
