-- =============================================
-- Equipment per-store price comparison
-- =============================================
-- Lets a tool/size record multiple store prices so the user can compare before
-- buying (e.g. 10ft Matta Palagai: Store A ₹950, Store B ₹900). One row per
-- (equipment_id, store). equipment_id points at a size-variant row or a
-- standalone tool. Trimmed mirror of vendor_inventory (no GST/transport/lead
-- time — unnecessary for low-value hand tools). Idempotent.

CREATE TABLE IF NOT EXISTS "public"."equipment_vendor_prices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL PRIMARY KEY,
    "company_id" "uuid" NOT NULL REFERENCES "public"."companies"("id") ON DELETE CASCADE,
    "equipment_id" "uuid" NOT NULL REFERENCES "public"."equipment"("id") ON DELETE CASCADE,
    "vendor_id" "uuid" REFERENCES "public"."vendors"("id") ON DELETE SET NULL,
    "store_name" "text",
    "price" numeric(12,2) NOT NULL,
    "recorded_date" date DEFAULT CURRENT_DATE NOT NULL,
    "bill_url" "text",
    "notes" "text",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "uuid" REFERENCES "auth"."users"("id")
);

CREATE INDEX IF NOT EXISTS "idx_eqvp_equipment" ON "public"."equipment_vendor_prices" ("equipment_id");
CREATE INDEX IF NOT EXISTS "idx_eqvp_vendor" ON "public"."equipment_vendor_prices" ("vendor_id");
CREATE INDEX IF NOT EXISTS "idx_eqvp_company" ON "public"."equipment_vendor_prices" ("company_id");

-- Reuse the shared equipment updated_at trigger function
DROP TRIGGER IF EXISTS "tr_eqvp_updated_at" ON "public"."equipment_vendor_prices";
CREATE TRIGGER "tr_eqvp_updated_at"
    BEFORE UPDATE ON "public"."equipment_vendor_prices"
    FOR EACH ROW EXECUTE FUNCTION "public"."set_equipment_updated_at"();

ALTER TABLE "public"."equipment_vendor_prices" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "eqvp_select" ON "public"."equipment_vendor_prices";
CREATE POLICY "eqvp_select" ON "public"."equipment_vendor_prices"
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "eqvp_insert" ON "public"."equipment_vendor_prices";
CREATE POLICY "eqvp_insert" ON "public"."equipment_vendor_prices"
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "eqvp_update" ON "public"."equipment_vendor_prices";
CREATE POLICY "eqvp_update" ON "public"."equipment_vendor_prices"
    FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "eqvp_delete" ON "public"."equipment_vendor_prices";
CREATE POLICY "eqvp_delete" ON "public"."equipment_vendor_prices"
    FOR DELETE TO authenticated USING (true);

GRANT ALL ON "public"."equipment_vendor_prices" TO "authenticated";

COMMENT ON TABLE "public"."equipment_vendor_prices" IS
  'Per-store price quotes for an equipment item/size, for buy-side comparison. One row per (equipment_id, store).';
