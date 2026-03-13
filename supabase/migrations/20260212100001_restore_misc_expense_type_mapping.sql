-- Migration: Restore smart category-to-expense_type mapping for miscellaneous expenses
-- Problem: Migration 20260205000000 recreated v_all_expenses but lost the smart mapping
--          from migration 20260122110000. All misc expenses were hardcoded as 'Miscellaneous' type.
-- Fix: Restore CASE-based mapping so misc expenses with category "Material Expenses"
--      show as type "Material" in the breakdown, etc.

DROP VIEW IF EXISTS "public"."v_all_expenses";

CREATE VIEW "public"."v_all_expenses" AS
-- Regular expenses (non-labor)
SELECT "e"."id",
    "e"."site_id",
    "e"."date",
    "e"."date" AS "recorded_date",
    "e"."amount",
    "e"."description",
    "e"."category_id",
    "ec"."name" AS "category_name",
    ("e"."module")::"text" AS "module",
    (
        CASE "e"."module"
            WHEN 'material'::"public"."expense_module" THEN 'Material'::character varying
            WHEN 'machinery'::"public"."expense_module" THEN COALESCE("ec"."name", 'Machinery'::character varying)
            WHEN 'general'::"public"."expense_module" THEN 'General'::character varying
            ELSE COALESCE("ec"."name", 'Other'::character varying)
        END)::"text" AS "expense_type",
    "e"."is_cleared",
    "e"."cleared_date",
    "e"."contract_id",
    "sc"."title" AS "subcontract_title",
    "e"."site_payer_id",
    "sp"."name" AS "payer_name",
    ("e"."payment_mode")::"text" AS "payment_mode",
    "e"."vendor_name",
    "e"."receipt_url",
    "e"."paid_by",
    "e"."entered_by",
    "e"."entered_by_user_id",
    NULL::"text" AS "settlement_reference",
    NULL::"uuid" AS "settlement_group_id",
    "e"."engineer_transaction_id",
    'expense'::"text" AS "source_type",
    "e"."id" AS "source_id",
    "e"."created_at",
    "e"."is_deleted"
FROM ((("public"."expenses" "e"
    LEFT JOIN "public"."expense_categories" "ec" ON (("e"."category_id" = "ec"."id")))
    LEFT JOIN "public"."subcontracts" "sc" ON (("e"."contract_id" = "sc"."id")))
    LEFT JOIN "public"."site_payers" "sp" ON (("e"."site_payer_id" = "sp"."id")))
WHERE (("e"."is_deleted" = false) AND ("e"."module" <> 'labor'::"public"."expense_module"))

UNION ALL

-- Daily Salary settlements (aggregated by date)
SELECT ("array_agg"("sg"."id" ORDER BY "sg"."created_at"))[1] AS "id",
    "sg"."site_id",
    "sg"."settlement_date" AS "date",
    "max"(COALESCE("sg"."actual_payment_date", ("sg"."created_at")::"date")) AS "recorded_date",
    "sum"("sg"."total_amount") AS "amount",
    (('Salary settlement ('::"text" || "sum"("sg"."laborer_count")) || ' laborers)'::"text") AS "description",
    ( SELECT "expense_categories"."id"
           FROM "public"."expense_categories"
          WHERE (("expense_categories"."name")::"text" = 'Salary Settlement'::"text")
         LIMIT 1) AS "category_id",
    'Salary Settlement'::character varying AS "category_name",
    'labor'::"text" AS "module",
    'Daily Salary'::"text" AS "expense_type",
    "bool_and"(
        CASE
            WHEN ("sg"."payment_channel" = 'direct'::"text") THEN true
            WHEN ("sg"."engineer_transaction_id" IS NOT NULL) THEN COALESCE(( SELECT "site_engineer_transactions"."is_settled"
               FROM "public"."site_engineer_transactions"
              WHERE ("site_engineer_transactions"."id" = "sg"."engineer_transaction_id")), false)
            ELSE false
        END) AS "is_cleared",
    "max"(
        CASE
            WHEN ("sg"."payment_channel" = 'direct'::"text") THEN "sg"."settlement_date"
            WHEN ("sg"."engineer_transaction_id" IS NOT NULL) THEN ( SELECT ("site_engineer_transactions"."confirmed_at")::"date" AS "confirmed_at"
               FROM "public"."site_engineer_transactions"
              WHERE (("site_engineer_transactions"."id" = "sg"."engineer_transaction_id") AND ("site_engineer_transactions"."is_settled" = true)))
            ELSE NULL::"date"
        END) AS "cleared_date",
    ("array_agg"("sg"."subcontract_id" ORDER BY "sg"."created_at") FILTER (WHERE ("sg"."subcontract_id" IS NOT NULL)))[1] AS "contract_id",
    ("array_agg"("sc"."title" ORDER BY "sg"."created_at") FILTER (WHERE ("sc"."title" IS NOT NULL)))[1] AS "subcontract_title",
    NULL::"uuid" AS "site_payer_id",
        CASE
            WHEN ("count"(DISTINCT "sg"."payer_source") = 1) THEN
            CASE
                WHEN ("max"("sg"."payer_source") IS NULL) THEN 'Own Money'::"text"
                WHEN ("max"("sg"."payer_source") = 'own_money'::"text") THEN 'Own Money'::"text"
                WHEN ("max"("sg"."payer_source") = 'amma_money'::"text") THEN 'Amma Money'::"text"
                WHEN ("max"("sg"."payer_source") = 'client_money'::"text") THEN 'Client Money'::"text"
                WHEN ("max"("sg"."payer_source") = 'other_site_money'::"text") THEN COALESCE("max"("sg"."payer_name"), 'Other Site'::"text")
                WHEN ("max"("sg"."payer_source") = 'custom'::"text") THEN COALESCE("max"("sg"."payer_name"), 'Other'::"text")
                ELSE COALESCE("max"("sg"."payer_name"), 'Own Money'::"text")
            END
            ELSE 'Multiple Sources'::"text"
        END AS "payer_name",
    ("array_agg"("sg"."payment_mode" ORDER BY "sg"."created_at"))[1] AS "payment_mode",
    NULL::"text" AS "vendor_name",
    ("array_agg"("sg"."proof_url" ORDER BY "sg"."created_at") FILTER (WHERE ("sg"."proof_url" IS NOT NULL)))[1] AS "receipt_url",
    ("array_agg"("sg"."created_by" ORDER BY "sg"."created_at"))[1] AS "paid_by",
    ("array_agg"("sg"."created_by_name" ORDER BY "sg"."created_at"))[1] AS "entered_by",
    ("array_agg"("sg"."created_by" ORDER BY "sg"."created_at"))[1] AS "entered_by_user_id",
    ("array_agg"("sg"."settlement_reference" ORDER BY "sg"."created_at"))[1] AS "settlement_reference",
    ("array_agg"("sg"."id" ORDER BY "sg"."created_at"))[1] AS "settlement_group_id",
    ("array_agg"("sg"."engineer_transaction_id" ORDER BY "sg"."created_at"))[1] AS "engineer_transaction_id",
    'settlement'::"text" AS "source_type",
    ("array_agg"("sg"."id" ORDER BY "sg"."created_at"))[1] AS "source_id",
    "min"("sg"."created_at") AS "created_at",
    false AS "is_deleted"
FROM ("public"."settlement_groups" "sg"
    LEFT JOIN "public"."subcontracts" "sc" ON (("sg"."subcontract_id" = "sc"."id")))
WHERE (("sg"."is_cancelled" = false) AND (COALESCE("sg"."payment_type", 'salary'::"text") <> 'advance'::"text") AND (NOT (EXISTS ( SELECT 1
           FROM "public"."labor_payments" "lp"
          WHERE (("lp"."settlement_group_id" = "sg"."id") AND ("lp"."is_under_contract" = true))))))
GROUP BY "sg"."site_id", "sg"."settlement_date"

UNION ALL

-- Contract Salary settlements
SELECT "sg"."id",
    "sg"."site_id",
    "sg"."settlement_date" AS "date",
    COALESCE("sg"."actual_payment_date", ("sg"."created_at")::"date") AS "recorded_date",
    "sg"."total_amount" AS "amount",
        CASE
            WHEN (("sg"."notes" IS NOT NULL) AND ("sg"."notes" <> ''::"text")) THEN ((('Salary settlement ('::"text" || "sg"."laborer_count") || ' laborers) - '::"text") || "sg"."notes")
            ELSE (('Salary settlement ('::"text" || "sg"."laborer_count") || ' laborers)'::"text")
        END AS "description",
    ( SELECT "expense_categories"."id"
           FROM "public"."expense_categories"
          WHERE (("expense_categories"."name")::"text" = 'Salary Settlement'::"text")
         LIMIT 1) AS "category_id",
    'Salary Settlement'::character varying AS "category_name",
    'labor'::"text" AS "module",
    'Contract Salary'::"text" AS "expense_type",
        CASE
            WHEN ("sg"."payment_channel" = 'direct'::"text") THEN true
            WHEN ("sg"."engineer_transaction_id" IS NOT NULL) THEN COALESCE(( SELECT "site_engineer_transactions"."is_settled"
               FROM "public"."site_engineer_transactions"
              WHERE ("site_engineer_transactions"."id" = "sg"."engineer_transaction_id")), false)
            ELSE false
        END AS "is_cleared",
        CASE
            WHEN ("sg"."payment_channel" = 'direct'::"text") THEN "sg"."settlement_date"
            WHEN ("sg"."engineer_transaction_id" IS NOT NULL) THEN ( SELECT ("site_engineer_transactions"."confirmed_at")::"date" AS "confirmed_at"
               FROM "public"."site_engineer_transactions"
              WHERE (("site_engineer_transactions"."id" = "sg"."engineer_transaction_id") AND ("site_engineer_transactions"."is_settled" = true)))
            ELSE NULL::"date"
        END AS "cleared_date",
    "sg"."subcontract_id" AS "contract_id",
    "sc"."title" AS "subcontract_title",
    NULL::"uuid" AS "site_payer_id",
        CASE
            WHEN ("sg"."payer_source" IS NULL) THEN 'Own Money'::"text"
            WHEN ("sg"."payer_source" = 'own_money'::"text") THEN 'Own Money'::"text"
            WHEN ("sg"."payer_source" = 'amma_money'::"text") THEN 'Amma Money'::"text"
            WHEN ("sg"."payer_source" = 'client_money'::"text") THEN 'Client Money'::"text"
            WHEN ("sg"."payer_source" = 'other_site_money'::"text") THEN COALESCE("sg"."payer_name", 'Other Site'::"text")
            WHEN ("sg"."payer_source" = 'custom'::"text") THEN COALESCE("sg"."payer_name", 'Other'::"text")
            ELSE COALESCE("sg"."payer_name", 'Own Money'::"text")
        END AS "payer_name",
    "sg"."payment_mode",
    NULL::"text" AS "vendor_name",
    "sg"."proof_url" AS "receipt_url",
    "sg"."created_by" AS "paid_by",
    "sg"."created_by_name" AS "entered_by",
    "sg"."created_by" AS "entered_by_user_id",
    "sg"."settlement_reference",
    "sg"."id" AS "settlement_group_id",
    "sg"."engineer_transaction_id",
    'settlement'::"text" AS "source_type",
    "sg"."id" AS "source_id",
    "sg"."created_at",
    "sg"."is_cancelled" AS "is_deleted"
FROM ("public"."settlement_groups" "sg"
    LEFT JOIN "public"."subcontracts" "sc" ON (("sg"."subcontract_id" = "sc"."id")))
WHERE (("sg"."is_cancelled" = false) AND (EXISTS ( SELECT 1
           FROM "public"."labor_payments" "lp"
          WHERE (("lp"."settlement_group_id" = "sg"."id") AND ("lp"."is_under_contract" = true)))))

UNION ALL

-- Advance payments
SELECT "sg"."id",
    "sg"."site_id",
    "sg"."settlement_date" AS "date",
    COALESCE("sg"."actual_payment_date", ("sg"."created_at")::"date") AS "recorded_date",
    "sg"."total_amount" AS "amount",
        CASE
            WHEN (("sg"."notes" IS NOT NULL) AND ("sg"."notes" <> ''::"text")) THEN ((('Advance payment ('::"text" || "sg"."laborer_count") || ' laborers) - '::"text") || "sg"."notes")
            ELSE (('Advance payment ('::"text" || "sg"."laborer_count") || ' laborers)'::"text")
        END AS "description",
    ( SELECT "expense_categories"."id"
           FROM "public"."expense_categories"
          WHERE (("expense_categories"."name")::"text" = 'Salary Settlement'::"text")
         LIMIT 1) AS "category_id",
    'Salary Settlement'::character varying AS "category_name",
    'labor'::"text" AS "module",
    'Advance'::"text" AS "expense_type",
        CASE
            WHEN ("sg"."payment_channel" = 'direct'::"text") THEN true
            WHEN ("sg"."engineer_transaction_id" IS NOT NULL) THEN COALESCE(( SELECT "site_engineer_transactions"."is_settled"
               FROM "public"."site_engineer_transactions"
              WHERE ("site_engineer_transactions"."id" = "sg"."engineer_transaction_id")), false)
            ELSE false
        END AS "is_cleared",
        CASE
            WHEN ("sg"."payment_channel" = 'direct'::"text") THEN "sg"."settlement_date"
            WHEN ("sg"."engineer_transaction_id" IS NOT NULL) THEN ( SELECT ("site_engineer_transactions"."confirmed_at")::"date" AS "confirmed_at"
               FROM "public"."site_engineer_transactions"
              WHERE (("site_engineer_transactions"."id" = "sg"."engineer_transaction_id") AND ("site_engineer_transactions"."is_settled" = true)))
            ELSE NULL::"date"
        END AS "cleared_date",
    "sg"."subcontract_id" AS "contract_id",
    "sc"."title" AS "subcontract_title",
    NULL::"uuid" AS "site_payer_id",
        CASE
            WHEN ("sg"."payer_source" IS NULL) THEN 'Own Money'::"text"
            WHEN ("sg"."payer_source" = 'own_money'::"text") THEN 'Own Money'::"text"
            WHEN ("sg"."payer_source" = 'amma_money'::"text") THEN 'Amma Money'::"text"
            WHEN ("sg"."payer_source" = 'client_money'::"text") THEN 'Client Money'::"text"
            WHEN ("sg"."payer_source" = 'other_site_money'::"text") THEN COALESCE("sg"."payer_name", 'Other Site'::"text")
            WHEN ("sg"."payer_source" = 'custom'::"text") THEN COALESCE("sg"."payer_name", 'Other'::"text")
            ELSE COALESCE("sg"."payer_name", 'Own Money'::"text")
        END AS "payer_name",
    "sg"."payment_mode",
    NULL::"text" AS "vendor_name",
    "sg"."proof_url" AS "receipt_url",
    "sg"."created_by" AS "paid_by",
    "sg"."created_by_name" AS "entered_by",
    "sg"."created_by" AS "entered_by_user_id",
    "sg"."settlement_reference",
    "sg"."id" AS "settlement_group_id",
    "sg"."engineer_transaction_id",
    'settlement'::"text" AS "source_type",
    "sg"."id" AS "source_id",
    "sg"."created_at",
    "sg"."is_cancelled" AS "is_deleted"
FROM ("public"."settlement_groups" "sg"
    LEFT JOIN "public"."subcontracts" "sc" ON (("sg"."subcontract_id" = "sc"."id")))
WHERE (("sg"."is_cancelled" = false) AND ("sg"."payment_type" = 'advance'::"text"))

UNION ALL

-- Tea Shop settlements
SELECT "ts"."id",
    "tsa"."site_id",
    "ts"."payment_date" AS "date",
    "ts"."payment_date" AS "recorded_date",
    "ts"."amount_paid" AS "amount",
        CASE
            WHEN (("ts"."notes" IS NOT NULL) AND ("ts"."notes" <> ''::"text")) THEN ((('Tea Shop - '::"text" || ("tsa"."shop_name")::"text") || ' - '::"text") || "ts"."notes")
            ELSE ('Tea Shop - '::"text" || ("tsa"."shop_name")::"text")
        END AS "description",
    ( SELECT "expense_categories"."id"
           FROM "public"."expense_categories"
          WHERE (("expense_categories"."name")::"text" = 'Tea & Snacks'::"text")
         LIMIT 1) AS "category_id",
    'Tea & Snacks'::character varying AS "category_name",
    'general'::"text" AS "module",
    'Tea & Snacks'::"text" AS "expense_type",
        CASE
            WHEN (("ts"."payer_type")::"text" = 'company_direct'::"text") THEN true
            WHEN ("ts"."site_engineer_transaction_id" IS NOT NULL) THEN COALESCE(( SELECT "site_engineer_transactions"."is_settled"
               FROM "public"."site_engineer_transactions"
              WHERE ("site_engineer_transactions"."id" = "ts"."site_engineer_transaction_id")), false)
            ELSE true
        END AS "is_cleared",
        CASE
            WHEN (("ts"."payer_type")::"text" = 'company_direct'::"text") THEN "ts"."payment_date"
            WHEN ("ts"."site_engineer_transaction_id" IS NOT NULL) THEN ( SELECT ("site_engineer_transactions"."confirmed_at")::"date" AS "confirmed_at"
               FROM "public"."site_engineer_transactions"
              WHERE (("site_engineer_transactions"."id" = "ts"."site_engineer_transaction_id") AND ("site_engineer_transactions"."is_settled" = true)))
            ELSE "ts"."payment_date"
        END AS "cleared_date",
    "ts"."subcontract_id" AS "contract_id",
    "sc"."title" AS "subcontract_title",
    NULL::"uuid" AS "site_payer_id",
        CASE "ts"."payer_type"
            WHEN 'company_direct'::"text" THEN 'Company Direct'::character varying
            WHEN 'site_engineer'::"text" THEN COALESCE(( SELECT "users"."name"
               FROM "public"."users"
              WHERE ("users"."id" = "ts"."site_engineer_id")), 'Site Engineer'::character varying)
            ELSE "ts"."payer_type"
        END AS "payer_name",
    "ts"."payment_mode",
    "tsa"."shop_name" AS "vendor_name",
    NULL::"text" AS "receipt_url",
    "ts"."recorded_by_user_id" AS "paid_by",
    "ts"."recorded_by" AS "entered_by",
    "ts"."recorded_by_user_id" AS "entered_by_user_id",
    "ts"."settlement_reference",
    NULL::"uuid" AS "settlement_group_id",
    "ts"."site_engineer_transaction_id" AS "engineer_transaction_id",
    'tea_shop_settlement'::"text" AS "source_type",
    "ts"."id" AS "source_id",
    "ts"."created_at",
    COALESCE("ts"."is_cancelled", false) AS "is_deleted"
FROM (("public"."tea_shop_settlements" "ts"
    JOIN "public"."tea_shop_accounts" "tsa" ON (("ts"."tea_shop_id" = "tsa"."id")))
    LEFT JOIN "public"."subcontracts" "sc" ON (("ts"."subcontract_id" = "sc"."id")))
WHERE (COALESCE("ts"."is_cancelled", false) = false)

UNION ALL

-- Miscellaneous expenses (with SMART CATEGORY MAPPING restored)
SELECT
    "me"."id",
    "me"."site_id",
    "me"."date",
    "me"."date" AS "recorded_date",
    "me"."amount",
    CASE
        WHEN (("me"."notes" IS NOT NULL) AND ("me"."notes" <> ''::"text")) THEN
            CASE
                WHEN ("me"."vendor_name" IS NOT NULL) THEN (('Misc - '::"text" || "me"."vendor_name") || ' - '::"text") || "me"."notes"
                ELSE 'Misc - '::"text" || "me"."notes"
            END
        WHEN ("me"."vendor_name" IS NOT NULL) THEN 'Misc - '::"text" || "me"."vendor_name"
        ELSE COALESCE("me"."description", 'Miscellaneous Expense'::"text")
    END AS "description",
    "me"."category_id",
    COALESCE("ec"."name", 'Miscellaneous'::character varying) AS "category_name",
    'miscellaneous'::"text" AS "module",
    -- SMART CATEGORY MAPPING: Map misc expense categories to their corresponding expense types
    -- so they appear in the correct breakdown section in All Site Expenses
    (CASE
        WHEN "ec"."name" = 'Daily Labor Settlement' THEN 'Daily Salary'
        WHEN "ec"."name" = 'Contract Labor Settlement' THEN 'Contract Salary'
        WHEN "ec"."name" = 'Material Settlement' THEN 'Material'
        WHEN "ec"."name" = 'Material Purchasing' THEN 'Material'
        WHEN "ec"."name" = 'Material Expenses' THEN 'Material'
        WHEN "ec"."name" = 'Rental Settlement' THEN 'Machinery'
        WHEN "ec"."name" = 'Tea & Snacks Settlement' THEN 'Tea & Snacks'
        WHEN "ec"."name" = 'General Expense' THEN 'General'
        ELSE 'Miscellaneous'
    END)::"text" AS "expense_type",
    CASE
        WHEN ("me"."payer_type" = 'company_direct'::"text") THEN true
        WHEN ("me"."engineer_transaction_id" IS NOT NULL) THEN COALESCE((
            SELECT "site_engineer_transactions"."is_settled"
            FROM "public"."site_engineer_transactions"
            WHERE ("site_engineer_transactions"."id" = "me"."engineer_transaction_id")), false)
        ELSE true
    END AS "is_cleared",
    CASE
        WHEN ("me"."payer_type" = 'company_direct'::"text") THEN "me"."date"
        WHEN ("me"."engineer_transaction_id" IS NOT NULL) THEN (
            SELECT ("site_engineer_transactions"."confirmed_at")::"date" AS "confirmed_at"
            FROM "public"."site_engineer_transactions"
            WHERE (("site_engineer_transactions"."id" = "me"."engineer_transaction_id")
                AND ("site_engineer_transactions"."is_settled" = true)))
        ELSE "me"."date"
    END AS "cleared_date",
    "me"."subcontract_id" AS "contract_id",
    "sc"."title" AS "subcontract_title",
    NULL::"uuid" AS "site_payer_id",
    CASE
        WHEN ("me"."payer_type" = 'site_engineer'::"text") THEN COALESCE((
            SELECT "users"."name"
            FROM "public"."users"
            WHERE ("users"."id" = "me"."site_engineer_id")), 'Site Engineer'::character varying)::"text"
        WHEN ("me"."payer_source" IS NULL) THEN 'Own Money'::"text"
        WHEN ("me"."payer_source" = 'own_money'::"text") THEN 'Own Money'::"text"
        WHEN ("me"."payer_source" = 'amma_money'::"text") THEN 'Amma Money'::"text"
        WHEN ("me"."payer_source" = 'client_money'::"text") THEN 'Client Money'::"text"
        WHEN ("me"."payer_source" = 'trust_account'::"text") THEN 'Trust Account'::"text"
        WHEN ("me"."payer_source" = 'other_site_money'::"text") THEN COALESCE("me"."payer_name", 'Other Site'::"text")
        WHEN ("me"."payer_source" = 'custom'::"text") THEN COALESCE("me"."payer_name", 'Other'::"text")
        ELSE 'Own Money'::"text"
    END AS "payer_name",
    "me"."payment_mode",
    "me"."vendor_name",
    "me"."proof_url" AS "receipt_url",
    "me"."created_by" AS "paid_by",
    "me"."created_by_name" AS "entered_by",
    "me"."created_by" AS "entered_by_user_id",
    "me"."reference_number" AS "settlement_reference",
    NULL::"uuid" AS "settlement_group_id",
    "me"."engineer_transaction_id",
    'misc_expense'::"text" AS "source_type",
    "me"."id" AS "source_id",
    "me"."created_at",
    "me"."is_cancelled" AS "is_deleted"
FROM ("public"."misc_expenses" "me"
    LEFT JOIN "public"."expense_categories" "ec" ON (("me"."category_id" = "ec"."id")))
    LEFT JOIN "public"."subcontracts" "sc" ON (("me"."subcontract_id" = "sc"."id"))
WHERE ("me"."is_cancelled" = false)

UNION ALL

-- Subcontract direct payments
SELECT
    "sp"."id",
    "sc"."site_id",
    "sp"."payment_date" AS "date",
    ("sp"."created_at")::"date" AS "recorded_date",
    "sp"."amount",
    CASE
        WHEN (("sp"."comments" IS NOT NULL) AND ("sp"."comments" <> ''::"text")) THEN
            ('Contract Payment - '::"text" || ("sc"."title")::"text") || ' - '::"text" || "sp"."comments"
        ELSE
            'Contract Payment - '::"text" || ("sc"."title")::"text"
    END AS "description",
    ( SELECT "expense_categories"."id"
           FROM "public"."expense_categories"
          WHERE (("expense_categories"."name")::"text" = 'Contract Payment'::"text")
         LIMIT 1) AS "category_id",
    'Contract Payment'::character varying AS "category_name",
    'labor'::"text" AS "module",
    'Direct Payment'::"text" AS "expense_type",
    CASE
        WHEN ("sp"."payment_channel" = 'company_direct_online'::"text") THEN true
        WHEN ("sp"."payment_channel" = 'mesthri_at_office'::"text") THEN true
        WHEN ("sp"."site_engineer_transaction_id" IS NOT NULL) THEN COALESCE((
            SELECT "site_engineer_transactions"."is_settled"
            FROM "public"."site_engineer_transactions"
            WHERE ("site_engineer_transactions"."id" = "sp"."site_engineer_transaction_id")), false)
        ELSE true
    END AS "is_cleared",
    CASE
        WHEN ("sp"."payment_channel" IN ('company_direct_online'::"text", 'mesthri_at_office'::"text")) THEN "sp"."payment_date"
        WHEN ("sp"."site_engineer_transaction_id" IS NOT NULL) THEN (
            SELECT ("site_engineer_transactions"."confirmed_at")::"date" AS "confirmed_at"
            FROM "public"."site_engineer_transactions"
            WHERE (("site_engineer_transactions"."id" = "sp"."site_engineer_transaction_id")
                AND ("site_engineer_transactions"."is_settled" = true)))
        ELSE "sp"."payment_date"
    END AS "cleared_date",
    "sp"."contract_id" AS "contract_id",
    "sc"."title" AS "subcontract_title",
    NULL::"uuid" AS "site_payer_id",
    CASE
        WHEN ("sp"."payment_channel" = 'company_direct_online'::"text") THEN 'Company Direct'::"text"
        WHEN ("sp"."payment_channel" = 'mesthri_at_office'::"text") THEN 'Office'::"text"
        WHEN ("sp"."payment_channel" = 'via_site_engineer'::"text") THEN COALESCE((
            SELECT "users"."name"
            FROM "public"."users"
            WHERE ("users"."id" = "sp"."paid_by_user_id")), 'Site Engineer'::character varying)::"text"
        ELSE 'Company'::"text"
    END AS "payer_name",
    ("sp"."payment_mode")::"text" AS "payment_mode",
    NULL::"text" AS "vendor_name",
    "sp"."receipt_url",
    "sp"."paid_by_user_id" AS "paid_by",
    "sp"."recorded_by" AS "entered_by",
    "sp"."recorded_by_user_id" AS "entered_by_user_id",
    COALESCE("sp"."reference_number", 'SCP-' || TO_CHAR("sp"."payment_date", 'YYMMDD') || '-' || LEFT("sp"."id"::text, 4)) AS "settlement_reference",
    NULL::"uuid" AS "settlement_group_id",
    "sp"."site_engineer_transaction_id" AS "engineer_transaction_id",
    'subcontract_payment'::"text" AS "source_type",
    "sp"."id" AS "source_id",
    "sp"."created_at",
    COALESCE("sp"."is_deleted", false) AS "is_deleted"
FROM ("public"."subcontract_payments" "sp"
    JOIN "public"."subcontracts" "sc" ON (("sp"."contract_id" = "sc"."id")))
WHERE (COALESCE("sp"."is_deleted", false) = false)

UNION ALL

-- Settled Material Purchases
SELECT
    "mpe"."id",
    "mpe"."site_id",
    COALESCE("mpe"."settlement_date", "mpe"."purchase_date") AS "date",
    "mpe"."purchase_date" AS "recorded_date",
    COALESCE("mpe"."amount_paid", "mpe"."total_amount") AS "amount",
    CASE
        WHEN (("mpe"."notes" IS NOT NULL) AND ("mpe"."notes" <> ''::"text")) THEN
            ('Material Purchase - '::"text" || COALESCE("mpe"."vendor_name", 'Unknown'::"text")) || ' - '::"text" || "mpe"."notes"
        ELSE
            'Material Purchase - '::"text" || COALESCE("mpe"."vendor_name", 'Unknown'::"text")
    END AS "description",
    ( SELECT "expense_categories"."id"
           FROM "public"."expense_categories"
          WHERE (("expense_categories"."name")::"text" = 'Material Purchase'::"text")
         LIMIT 1) AS "category_id",
    'Material Purchase'::character varying AS "category_name",
    'material'::"text" AS "module",
    'Material'::"text" AS "expense_type",
    COALESCE("mpe"."is_paid", false) AS "is_cleared",
    "mpe"."paid_date" AS "cleared_date",
    NULL::"uuid" AS "contract_id",
    NULL::"text" AS "subcontract_title",
    NULL::"uuid" AS "site_payer_id",
    CASE
        WHEN ("mpe"."settlement_payer_source" IS NULL) THEN 'Own Money'::"text"
        WHEN ("mpe"."settlement_payer_source" = 'own'::"text") THEN 'Own Money'::"text"
        WHEN ("mpe"."settlement_payer_source" = 'amma'::"text") THEN 'Amma Money'::"text"
        WHEN ("mpe"."settlement_payer_source" = 'client'::"text") THEN 'Client Money'::"text"
        WHEN ("mpe"."settlement_payer_source" = 'trust'::"text") THEN 'Trust Account'::"text"
        WHEN ("mpe"."settlement_payer_source" = 'site'::"text") THEN COALESCE("mpe"."settlement_payer_name", 'Other Site'::"text")
        WHEN ("mpe"."settlement_payer_source" = 'other'::"text") THEN COALESCE("mpe"."settlement_payer_name", 'Other'::"text")
        ELSE 'Own Money'::"text"
    END AS "payer_name",
    ("mpe"."payment_mode")::"text" AS "payment_mode",
    "mpe"."vendor_name",
    "mpe"."bill_url" AS "receipt_url",
    "mpe"."created_by" AS "paid_by",
    NULL::"text" AS "entered_by",
    "mpe"."created_by" AS "entered_by_user_id",
    "mpe"."ref_code" AS "settlement_reference",
    NULL::"uuid" AS "settlement_group_id",
    NULL::"uuid" AS "engineer_transaction_id",
    'material_purchase'::"text" AS "source_type",
    "mpe"."id" AS "source_id",
    "mpe"."created_at",
    false AS "is_deleted"
FROM "public"."material_purchase_expenses" "mpe"
WHERE (
    (("mpe"."is_paid" = true) OR ("mpe"."settlement_date" IS NOT NULL))
    AND (
        "mpe"."purchase_type" IS DISTINCT FROM 'group_stock'
        OR "mpe"."settlement_reference" IS NOT NULL
    )
);

COMMENT ON VIEW "public"."v_all_expenses" IS 'Unified view combining regular expenses, derived salary expenses from settlement_groups (Daily Salary aggregated by date), tea shop settlements, miscellaneous expenses with smart category-to-type mapping, subcontract direct payments, and settled material purchases. Material purchases use amount_paid (bargained amount) when available. Group stock purchases are excluded until settled via inter-site settlement.';
