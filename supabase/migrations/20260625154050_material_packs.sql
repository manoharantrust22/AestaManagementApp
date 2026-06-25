-- Pack-only materials: products sold ONLY in fixed standard containers
-- (e.g. Dr. Fixit 301 Pidicrete URP — a 5 L can @ ₹1,620, you cannot buy 1 L).
--
-- Design: the material's base unit (litre/kg) remains the truth for STOCK,
-- DELIVERY and USAGE, all of which stay free-form. A thin "pack" layer
-- constrains only REQUESTS and PURCHASE ORDERS to whole cans and drives
-- honest per-can price display.
--
-- INVARIANT: material_request_items.requested_qty and
-- purchase_order_items.quantity ALWAYS store the base-unit total
-- (= material_packs.contents_qty × pack_count). The pack_id / pack_count
-- columns are display + entry-constraint metadata only; no fulfilment, stock,
-- best-price or price_history logic reads them. This keeps every existing
-- money/stock calculation byte-for-byte unchanged.

-- ---------------------------------------------------------------------------
-- 1. Flag on materials
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."materials"
  ADD COLUMN IF NOT EXISTS "sold_in_packs" boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN "public"."materials"."sold_in_packs" IS
  'When true, requests/POs for this material are constrained to whole standard cans/containers (see material_packs). Stock and usage remain free-form in the base unit.';

-- ---------------------------------------------------------------------------
-- 2. material_packs — the standard can/container sizes for a material
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."material_packs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "material_id" "uuid" NOT NULL,
    "label" "text" NOT NULL,                         -- e.g. '5 L can'
    "contents_qty" numeric(12,3) NOT NULL,           -- amount inside, in the material's base unit (e.g. 5 litres)
    "price" numeric(12,2),                           -- per-can price (e.g. 1620)
    "price_includes_gst" boolean DEFAULT false,
    "gst_rate" numeric(5,2),
    "is_active" boolean DEFAULT true NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "material_packs_contents_qty_check" CHECK (("contents_qty" > (0)::numeric))
);

ALTER TABLE "public"."material_packs" OWNER TO "postgres";

ALTER TABLE ONLY "public"."material_packs"
    ADD CONSTRAINT "material_packs_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."material_packs"
    ADD CONSTRAINT "material_packs_material_id_fkey"
    FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_material_packs_material"
    ON "public"."material_packs" USING "btree" ("material_id") WHERE ("is_active" = true);

-- RLS — mirrors public.material_brands verbatim (admin/office may write; any
-- authenticated user may read). Without these the app's authenticated role 403s.
ALTER TABLE "public"."material_packs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_material_packs" ON "public"."material_packs" TO "authenticated"
  USING ((EXISTS ( SELECT 1
     FROM "public"."users"
    WHERE (("users"."auth_id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['admin'::"public"."user_role", 'office'::"public"."user_role"]))))))
  WITH CHECK ((EXISTS ( SELECT 1
     FROM "public"."users"
    WHERE (("users"."auth_id" = "auth"."uid"()) AND ("users"."role" = ANY (ARRAY['admin'::"public"."user_role", 'office'::"public"."user_role"]))))));

CREATE POLICY "allow_select_material_packs" ON "public"."material_packs" FOR SELECT TO "authenticated" USING (true);

GRANT ALL ON TABLE "public"."material_packs" TO "anon";
GRANT ALL ON TABLE "public"."material_packs" TO "authenticated";
GRANT ALL ON TABLE "public"."material_packs" TO "service_role";

-- ---------------------------------------------------------------------------
-- 3. Pack-reference columns on request + PO item tables (additive, nullable).
--    requested_qty / quantity STILL hold the base-unit total; these columns
--    record "which can size × how many cans" for display and entry constraint.
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."material_request_items"
    ADD COLUMN IF NOT EXISTS "pack_id" "uuid" REFERENCES "public"."material_packs"("id"),
    ADD COLUMN IF NOT EXISTS "pack_count" integer
        CONSTRAINT "material_request_items_pack_count_check" CHECK (("pack_count" IS NULL) OR ("pack_count" > 0));

ALTER TABLE "public"."purchase_order_items"
    ADD COLUMN IF NOT EXISTS "pack_id" "uuid" REFERENCES "public"."material_packs"("id"),
    ADD COLUMN IF NOT EXISTS "pack_count" integer
        CONSTRAINT "purchase_order_items_pack_count_check" CHECK (("pack_count" IS NULL) OR ("pack_count" > 0));

COMMENT ON COLUMN "public"."material_request_items"."pack_count" IS
  'Number of whole cans requested. requested_qty = material_packs.contents_qty × pack_count.';
COMMENT ON COLUMN "public"."purchase_order_items"."pack_count" IS
  'Number of whole cans ordered. quantity = material_packs.contents_qty × pack_count; unit_price stays per base unit.';
