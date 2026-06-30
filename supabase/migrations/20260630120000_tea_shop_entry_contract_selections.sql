-- =============================================================================
-- Contract-aware tea filling — per-contract breakdown of a tea entry.
--
-- When a site engineer logs tea on a day where contract crews worked, they pick
-- which activated contracts/trades to include and the bill is split by each
-- crew's man-days. The MONEY still lands per-site via tea_shop_entry_allocations
-- (written with is_manual_override=true so the auto-recalc never re-includes an
-- excluded contract). THIS table records the per-contract breakdown the engineer
-- chose, so an edit can repopulate the picker and (later) per-contract economics
-- can read it. It is purely additive — nothing in the existing split/settlement
-- paths reads it; v_trade_tea_share and the waterfall are untouched.
-- =============================================================================

CREATE TABLE IF NOT EXISTS "public"."tea_shop_entry_contract_selections" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "entry_id" uuid NOT NULL REFERENCES "public"."tea_shop_entries"("id") ON DELETE CASCADE,
    "site_id" uuid NOT NULL REFERENCES "public"."sites"("id") ON DELETE CASCADE,

    -- 'package' | 'subcontract' | 'mesthri' (the implicit regular-crew row).
    "presence_kind" text NOT NULL CHECK ("presence_kind" IN ('package', 'subcontract', 'mesthri')),
    -- package_id / subcontract_id; NULL for the implicit mesthri (regular-crew) row.
    "ref_id" uuid NULL,
    "trade_category_id" uuid NULL REFERENCES "public"."labor_categories"("id") ON DELETE SET NULL,

    -- Man-days that drove this row's share, and the rupee result.
    "man_days" numeric(10,2) NOT NULL DEFAULT 0,
    "allocated_amount" numeric(10,2) NOT NULL DEFAULT 0,

    -- Engineer intent: included in the split, and whether the amount was hand-set.
    "is_included" boolean NOT NULL DEFAULT true,
    "is_amount_override" boolean NOT NULL DEFAULT false,

    "created_at" timestamptz DEFAULT now() NOT NULL,

    PRIMARY KEY ("id")
);

ALTER TABLE "public"."tea_shop_entry_contract_selections" OWNER TO "postgres";

COMMENT ON TABLE "public"."tea_shop_entry_contract_selections" IS
  'Per-contract breakdown of a tea entry (which activated contracts the engineer included + each share). Additive record of intent; money lands via tea_shop_entry_allocations.';

CREATE INDEX "idx_tea_entry_contract_sel_entry"
  ON "public"."tea_shop_entry_contract_selections"("entry_id");
CREATE INDEX "idx_tea_entry_contract_sel_site"
  ON "public"."tea_shop_entry_contract_selections"("site_id");

-- RLS — mirror tea_shop_entry_allocations exactly.
ALTER TABLE "public"."tea_shop_entry_contract_selections" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tea_entry_contract_sel_select" ON "public"."tea_shop_entry_contract_selections"
FOR SELECT TO authenticated USING (true);

CREATE POLICY "tea_entry_contract_sel_insert" ON "public"."tea_shop_entry_contract_selections"
FOR INSERT TO authenticated
WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'office'::"public"."user_role", 'site_engineer'::"public"."user_role"])));

CREATE POLICY "tea_entry_contract_sel_update" ON "public"."tea_shop_entry_contract_selections"
FOR UPDATE TO authenticated
USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'office'::"public"."user_role"])));

CREATE POLICY "tea_entry_contract_sel_delete" ON "public"."tea_shop_entry_contract_selections"
FOR DELETE TO authenticated USING ("public"."is_admin"());

GRANT ALL ON TABLE "public"."tea_shop_entry_contract_selections" TO "anon";
GRANT ALL ON TABLE "public"."tea_shop_entry_contract_selections" TO "authenticated";
GRANT ALL ON TABLE "public"."tea_shop_entry_contract_selections" TO "service_role";
