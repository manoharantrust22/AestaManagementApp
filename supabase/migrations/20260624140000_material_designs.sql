-- supabase/migrations/20260624140000_material_designs.sql
--
-- Shared design gallery for a material (e.g. tile patterns/colours).
-- A "design" is purely visual: an image + optional name attached to the
-- PARENT material. It is NOT tied to a thickness/variant and is NOT priced
-- (price lives on the thickness child materials via vendor_inventory).
-- Shape + RLS mirror material_brand_variant_links / the open `materials` table.

-- ── 1. Table ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "public"."material_designs" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "material_id"   uuid NOT NULL REFERENCES "public"."materials"(id) ON DELETE CASCADE,
  "image_url"     text NOT NULL,
  "name"          text,
  "display_order" integer NOT NULL DEFAULT 0,
  "is_active"     boolean NOT NULL DEFAULT true,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "created_by"    uuid
);

CREATE INDEX IF NOT EXISTS "material_designs_material_id_idx"
  ON "public"."material_designs" ("material_id");

-- ── 2. RLS (open to authenticated, same trust level as `materials`) ───────────
ALTER TABLE "public"."material_designs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_authenticated_read_material_designs"
  ON "public"."material_designs" FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "allow_authenticated_write_material_designs"
  ON "public"."material_designs" FOR ALL
  TO authenticated USING (true) WITH CHECK (true);
