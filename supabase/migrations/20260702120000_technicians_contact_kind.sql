-- =============================================
-- TECHNICIANS: contact_kind discriminator + website
--
-- The /company/directory "Add technician" flow is also used to jot down
-- brand / manufacturer contacts (e.g. "Asian Paints Customer Care") — product
-- enquiry / support lines that are NOT individual technicians. Today they get
-- shoehorned into the technician shape (a required trade), cluttering the list.
--
-- This adds a lightweight `contact_kind` discriminator so the same editable
-- store can hold both technicians and brand quick-contacts, surfaced under
-- their own "Brands" filter in the directory. Brand contacts stay lightweight
-- here (NOT full vendor records — vendors live in /company/vendors).
--
-- Additive & non-destructive: existing rows default to 'technician' and behave
-- exactly as before. `NOT NULL DEFAULT 'technician'` is a metadata-only backfill
-- (constant default) — no table rewrite. RLS is unchanged (row-level policies
-- already cover the new columns).
-- =============================================

ALTER TABLE "public"."technicians"
    ADD COLUMN IF NOT EXISTS "contact_kind" text NOT NULL DEFAULT 'technician';

-- Idempotent CHECK (plain ADD CONSTRAINT is not IF-NOT-EXISTS-able).
ALTER TABLE "public"."technicians"
    DROP CONSTRAINT IF EXISTS "technicians_contact_kind_check";
ALTER TABLE "public"."technicians"
    ADD CONSTRAINT "technicians_contact_kind_check"
        CHECK ("contact_kind" IN ('technician', 'brand'));

-- Optional brand portal / order / support page URL (parallel to
-- vendors.google_business_url). Mainly for contact_kind = 'brand'.
ALTER TABLE "public"."technicians"
    ADD COLUMN IF NOT EXISTS "website" text;

COMMENT ON COLUMN "public"."technicians"."contact_kind" IS
    'Directory contact kind: technician (default) | brand (manufacturer/brand support or enquiry line).';
COMMENT ON COLUMN "public"."technicians"."website" IS
    'Optional brand portal / support URL, stored as pasted. Mainly for contact_kind = brand.';
