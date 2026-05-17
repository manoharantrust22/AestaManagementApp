-- supabase/migrations/20260517110000_seed_wood_quality_tiers.sql
-- Insert 1st / 2nd / 3rd Quality brand rows for every parent WOD material
-- that doesn't already have them, so vendor prices can be stored per quality tier.
INSERT INTO material_brands (material_id, brand_name, is_active, is_preferred, created_at)
SELECT
  m.id,
  qt.quality_name,
  true,
  qt.quality_name = '1st Quality',
  now()
FROM materials m
JOIN material_categories mc ON mc.id = m.category_id
CROSS JOIN (VALUES ('1st Quality'), ('2nd Quality'), ('3rd Quality')) AS qt(quality_name)
WHERE mc.code = 'WOD'
  AND m.parent_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM material_brands mb
    WHERE mb.material_id = m.id
      AND mb.brand_name = qt.quality_name
  );
