-- =============================================
-- Formalize equipment.company_id
-- =============================================
-- The equipment.company_id column was added manually in production (it is
-- NOT NULL there and present in database.types.ts) but never captured in a
-- migration, so the repo's schema drifted from prod. This migration is fully
-- idempotent: it is a no-op against prod (column/constraint already exist) and
-- recreates the column correctly on a fresh `db reset`.

-- 1. Column (no-op if already present in prod)
ALTER TABLE "public"."equipment"
  ADD COLUMN IF NOT EXISTS "company_id" "uuid";

-- 2. Foreign key — only add if a constraint of this name doesn't already exist,
--    so prod's existing (manually-created) FK is left untouched.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'equipment_company_id_fkey'
      AND table_schema = 'public'
      AND table_name = 'equipment'
  ) THEN
    ALTER TABLE "public"."equipment"
      ADD CONSTRAINT "equipment_company_id_fkey"
      FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- 3. Backfill from the sole company when exactly one exists (single-company setup)
UPDATE "public"."equipment" e
SET "company_id" = (SELECT id FROM "public"."companies" ORDER BY "created_at" LIMIT 1)
WHERE e."company_id" IS NULL
  AND (SELECT count(*) FROM "public"."companies") = 1;

-- 4. Enforce NOT NULL only when no rows are left unassigned
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "public"."equipment" WHERE "company_id" IS NULL) THEN
    ALTER TABLE "public"."equipment" ALTER COLUMN "company_id" SET NOT NULL;
  END IF;
END $$;

-- 5. Index for company-scoped lookups
CREATE INDEX IF NOT EXISTS "idx_equipment_company" ON "public"."equipment" ("company_id");

COMMENT ON COLUMN "public"."equipment"."company_id" IS
  'Owning company. Formalized 2026-06-19 (was added manually in prod and missing from repo migrations).';
