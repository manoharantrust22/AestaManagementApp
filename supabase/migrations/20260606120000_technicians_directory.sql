-- =============================================
-- TECHNICIANS DIRECTORY
-- Company-scoped contact store for technicians / specialists / dealers
-- (electricians, CCTV, carpenters, borewell, welders, etc.).
-- These are people you CALL — distinct from `vendors` (business catalog)
-- and `laborers` (payroll / attendance). The /company/directory page
-- aggregates technicians + laborers + vendors + mestris into one
-- searchable, tap-to-call list; only technicians are editable there.
--
-- Additive migration: no destructive operations.
-- Photos reuse the existing `work-updates` storage bucket
-- (folder prefix `technician-photos/`), so no new bucket is required.
-- =============================================

CREATE TABLE IF NOT EXISTS "public"."technicians" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "company_id" uuid NOT NULL,
    "name" text NOT NULL,
    "phone" text,
    "whatsapp_number" text,
    "email" text,
    -- Primary trade label, free text (union of labor_categories.name and a
    -- TECHNICIAN_TRADES constant — see src/lib/utils/directory.ts).
    "trade" text,
    -- Optional extra specialties beyond the primary trade.
    "specialties" text[] DEFAULT '{}'::text[] NOT NULL,
    -- Area / location served, free text (e.g. "Velachery", "Whole Chennai").
    "area" text,
    -- Have we actually engaged this person, or just collected their number?
    "worked_with" boolean DEFAULT false NOT NULL,
    "photo_url" text,
    "notes" text,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    "updated_at" timestamptz DEFAULT now() NOT NULL,
    "created_by" uuid REFERENCES auth.users(id)
);

COMMENT ON TABLE "public"."technicians" IS
    'Company-scoped contact directory of technicians / specialists / dealers (electrician, CCTV, carpenter, borewell, etc.). Distinct from vendors and laborers; surfaced on /company/directory.';

-- Indexes
CREATE INDEX IF NOT EXISTS "idx_technicians_active"
    ON "public"."technicians" ("company_id") WHERE "is_active" = true;
CREATE INDEX IF NOT EXISTS "idx_technicians_trade"
    ON "public"."technicians" ("trade");
CREATE INDEX IF NOT EXISTS "idx_technicians_name_trgm"
    ON "public"."technicians" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_technicians_specialties"
    ON "public"."technicians" USING gin ("specialties");

-- updated_at trigger
CREATE OR REPLACE FUNCTION "public"."set_technicians_updated_at"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "tr_technicians_updated_at" ON "public"."technicians";
CREATE TRIGGER "tr_technicians_updated_at"
    BEFORE UPDATE ON "public"."technicians"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_technicians_updated_at"();

-- =============================================
-- RLS — permissive policies mirroring `laborers`
-- (company-scoping is enforced in the query layer, not RLS)
-- =============================================
ALTER TABLE "public"."technicians" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_select_technicians" ON "public"."technicians";
CREATE POLICY "allow_select_technicians" ON "public"."technicians"
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "allow_insert_technicians" ON "public"."technicians";
CREATE POLICY "allow_insert_technicians" ON "public"."technicians"
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "allow_update_technicians" ON "public"."technicians";
CREATE POLICY "allow_update_technicians" ON "public"."technicians"
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_delete_technicians" ON "public"."technicians";
CREATE POLICY "allow_delete_technicians" ON "public"."technicians"
    FOR DELETE TO authenticated USING (true);

GRANT ALL ON "public"."technicians" TO authenticated;
