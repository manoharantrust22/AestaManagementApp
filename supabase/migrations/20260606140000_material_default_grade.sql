-- Default grade pointer for reporting + bare-grade-name consistency renames.
--
-- Some materials (e.g. "PPC Cement (50kg bag)") have grade variants as child
-- materials ("33 Grade", "43 Grade", "53 Grade" via materials.parent_id). But
-- most usage was recorded against the bare PARENT, with no grade. The user only
-- buys 43 grade, so the Usage Ledger should attribute that bare-parent usage to
-- "43 Grade". This is a DISPLAY/GROUPING pointer only — it moves NO usage,
-- purchase, stock, or brand data, and is fully reversible (null the column).

ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS default_grade_variant_id uuid REFERENCES materials(id);

COMMENT ON COLUMN materials.default_grade_variant_id IS
  'For a parent material, the grade variant that bare-parent usage is attributed to in reporting (e.g. PPC Cement -> 43 Grade). Display/grouping only; does not move data.';

-- PPC Cement (50kg bag) -> 43 Grade
UPDATE materials
SET default_grade_variant_id = '6cd89738-bfca-4e59-a96c-96291cd9e946'
WHERE id = '873aa0f2-e1ec-47ea-9df9-e8944a5e4f88';

-- Consistency renames (mirror the earlier "43" -> "43 Grade" cleanup)
UPDATE materials SET name = '33 Grade'
WHERE id = '92a8c7e9-830a-4b5f-864f-ba4378f0a2ec' AND name = '33';

UPDATE materials SET name = '53 Grade'
WHERE id = '1ef8f93d-2ebe-4c9f-b1db-ad9c2c8fc72b' AND name = '53';
