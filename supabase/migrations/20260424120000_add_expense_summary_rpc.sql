-- Migration: Add get_expense_summary RPC
-- Purpose: Provide server-side aggregates for the All Site Expenses summary card
--          so it stays accurate at any scope (including All Time) without having
--          to stream every v_all_expenses row to the client. The client falls
--          back to row-level aggregation only for the on-screen breakdown of
--          loaded rows; top-line totals / counts / breakdown come from here.

CREATE OR REPLACE FUNCTION "public"."get_expense_summary"(
  "p_site_id" "uuid",
  "p_date_from" "date" DEFAULT NULL,
  "p_date_to" "date" DEFAULT NULL,
  "p_module" "text" DEFAULT NULL
) RETURNS "jsonb"
  LANGUAGE "sql" STABLE
  SECURITY INVOKER
  SET "search_path" = "public"
  AS $$
  WITH "filtered" AS (
    SELECT "amount", "expense_type", "is_cleared"
    FROM "public"."v_all_expenses"
    WHERE "site_id" = "p_site_id"
      AND "is_deleted" = false
      AND ("p_date_from" IS NULL OR "date" >= "p_date_from")
      AND ("p_date_to" IS NULL OR "date" <= "p_date_to")
      AND ("p_module" IS NULL OR "p_module" = 'all' OR "module" = "p_module")
  ),
  "totals" AS (
    SELECT
      COALESCE(SUM("amount"), 0)::"numeric" AS "total_amount",
      COUNT(*)::bigint AS "total_count",
      COALESCE(SUM("amount") FILTER (WHERE "is_cleared"), 0)::"numeric" AS "cleared_amount",
      COUNT(*) FILTER (WHERE "is_cleared")::bigint AS "cleared_count",
      COALESCE(SUM("amount") FILTER (WHERE NOT "is_cleared"), 0)::"numeric" AS "pending_amount",
      COUNT(*) FILTER (WHERE NOT "is_cleared")::bigint AS "pending_count"
    FROM "filtered"
  ),
  "by_type" AS (
    SELECT "jsonb_agg"(
      "jsonb_build_object"(
        'type', "expense_type",
        'amount', "amount_sum",
        'count', "row_count"
      ) ORDER BY "amount_sum" DESC
    ) AS "breakdown"
    FROM (
      SELECT
        COALESCE("expense_type", 'Other') AS "expense_type",
        SUM("amount")::"numeric" AS "amount_sum",
        COUNT(*)::bigint AS "row_count"
      FROM "filtered"
      GROUP BY "expense_type"
    ) "t"
  )
  SELECT "jsonb_build_object"(
    'total_amount', "t"."total_amount",
    'total_count', "t"."total_count",
    'cleared_amount', "t"."cleared_amount",
    'cleared_count', "t"."cleared_count",
    'pending_amount', "t"."pending_amount",
    'pending_count', "t"."pending_count",
    'by_type', COALESCE("b"."breakdown", '[]'::"jsonb")
  )
  FROM "totals" "t" CROSS JOIN "by_type" "b";
$$;

COMMENT ON FUNCTION "public"."get_expense_summary"("uuid", "date", "date", "text") IS
'Server-side aggregation for All Site Expenses summary card. Returns total / cleared / pending amounts and counts plus a by_type breakdown for the given site and optional date range + module filter. Uses v_all_expenses so the source of truth matches the table query.';

GRANT EXECUTE ON FUNCTION "public"."get_expense_summary"("uuid", "date", "date", "text") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_expense_summary"("uuid", "date", "date", "text") TO "service_role";
