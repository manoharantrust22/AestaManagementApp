-- =============================================
-- Equipment size variants (grouping under one tool)
-- =============================================
-- Tools like "Matta Palagai" come in sizes (10ft / 9ft / 7ft) at different
-- costs. We group sizes under one parent equipment row, reusing the existing
-- parent_equipment_id self-FK (the same plumbing accessories use). A new
-- parent_relationship discriminator keeps "variant" children separate from
-- "accessory" children. variant_label holds the human size label ("10 ft").
-- Idempotent and additive.

-- 1. Discriminator enum
DO $$
BEGIN
  CREATE TYPE "public"."equipment_parent_relationship" AS ENUM ('accessory', 'variant');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Columns
ALTER TABLE "public"."equipment"
  ADD COLUMN IF NOT EXISTS "parent_relationship" "public"."equipment_parent_relationship",
  ADD COLUMN IF NOT EXISTS "variant_label" "text";

-- 3. Backfill: every existing child row is an accessory (the only prior use)
UPDATE "public"."equipment"
SET "parent_relationship" = 'accessory'
WHERE "parent_equipment_id" IS NOT NULL
  AND "parent_relationship" IS NULL;

-- 4. Index for child-by-relationship lookups
CREATE INDEX IF NOT EXISTS "idx_equipment_parent_relationship"
  ON "public"."equipment" ("parent_equipment_id", "parent_relationship")
  WHERE "parent_equipment_id" IS NOT NULL;

COMMENT ON COLUMN "public"."equipment"."parent_relationship" IS
  'Discriminates parent_equipment_id children: ''accessory'' (legacy linked part) or ''variant'' (a size of the parent tool).';
COMMENT ON COLUMN "public"."equipment"."variant_label" IS
  'Human size label for a variant child, e.g. "10 ft". Null for non-variant rows.';
