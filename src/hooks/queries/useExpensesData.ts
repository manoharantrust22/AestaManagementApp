"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { supabaseQueryWithTimeout } from "@/lib/utils/supabaseQuery";
import { withTimeout, TIMEOUTS } from "@/lib/utils/timeout";

export type ExpenseGroup = "all" | "labor" | "building";
export type ExpenseStatus = "all" | "cleared" | "pending";

export type ExpenseSourceType =
  | "expense"
  | "settlement"
  | "misc_expense"
  | "tea_shop_settlement"
  | "subcontract_payment"
  | "material_purchase"
  | "rental_settlement";

export interface ExpenseRow {
  id: string;
  site_id: string;
  date: string;
  recorded_date: string | null;
  amount: number;
  description: string | null;
  category_id: string | null;
  category_name: string | null;
  module: string;
  expense_type: string;
  is_cleared: boolean;
  cleared_date: string | null;
  contract_id: string | null;
  subcontract_title: string | null;
  site_payer_id: string | null;
  payer_name: string | null;
  payment_mode: string | null;
  vendor_name: string | null;
  receipt_url: string | null;
  paid_by: string | null;
  entered_by: string | null;
  entered_by_user_id: string | null;
  settlement_reference: string | null;
  settlement_group_id: string | null;
  engineer_transaction_id: string | null;
  source_type: ExpenseSourceType;
  source_id: string;
  created_at: string;
  is_deleted: boolean;
}

export interface BreakdownEntry {
  amount: number;
  count: number;
}

export interface ScopeSummary {
  total: number;
  totalCount: number;
  cleared: number;
  clearedCount: number;
  pending: number;
  pendingCount: number;
  breakdown: Record<string, BreakdownEntry>;
}

export interface ExpenseTradeSummaryRow {
  trade_category_id: string | null; // null for site-wide row
  trade_name: string; // e.g. "Civil", "Painting", "Site-wide"
  total_amount: number;
  record_count: number;
  daily_amount: number;
  contract_amount: number;
  material_amount: number;
  machinery_amount: number;
  site_wide_amount: number;
  site_wide_count: number;
}

// Maps the new "group" concept onto expense_type values. Tea & Snacks has
// module='general' in v_all_expenses, but conceptually belongs with Labor in
// the new IA (it's money paid to people doing site work).
export const LABOR_TYPES = [
  "Daily Salary",
  "Contract Salary",
  "Advance",
  "Excess",
  "Unlinked Salary",
  "Tea & Snacks",
  "Direct Payment",
] as const;

export const BUILDING_TYPES = [
  "Material",
  "Machinery",
  "General",
  "Miscellaneous",
] as const;

export function typesForGroup(group: ExpenseGroup): readonly string[] {
  if (group === "labor") return LABOR_TYPES;
  if (group === "building") return BUILDING_TYPES;
  return [...LABOR_TYPES, ...BUILDING_TYPES];
}

const INITIAL_RESULT_LIMIT = 200;
export const MAX_RESULT_LIMIT = 2000;
export const LOAD_MORE_STEP = 200;

interface Args {
  siteId: string | null | undefined;
  dateFrom: string | null;
  dateTo: string | null;
  isAllTime: boolean;
  group: ExpenseGroup;
  /**
   * Specific expense_type filter applied within the current group. When set
   * (non-empty), wins over `group`. Pass null/[] to use the broader `group`
   * filter only.
   */
  expenseTypes: string[] | null;
  status: ExpenseStatus;
  /** When set, restricts to a single payer (for multi-payer sites). */
  sitePayerId: string | null;
}

export function useExpensesData(args: Args) {
  const supabase = useMemo(() => createClient(), []);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [summary, setSummary] = useState<ScopeSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadedLimit, setLoadedLimit] = useState(INITIAL_RESULT_LIMIT);
  const [resultLimitHit, setResultLimitHit] = useState(false);

  const { siteId, dateFrom, dateTo, isAllTime, group, expenseTypes, status, sitePayerId } = args;

  // Stabilise the expenseTypes array reference for the dependency lists below
  // — callers often reconstruct the array each render. Hashing on the joined
  // string keeps effects from firing when the contents are unchanged.
  const expenseTypesKey = expenseTypes && expenseTypes.length > 0 ? [...expenseTypes].sort().join("|") : "";

  // Reset the load-more window when the scope changes. Re-fetch is triggered by
  // the second effect below.
  useEffect(() => {
    setLoadedLimit(INITIAL_RESULT_LIMIT);
  }, [siteId, dateFrom, dateTo, isAllTime, group, expenseTypesKey, status, sitePayerId]);

  const fetch = useCallback(async () => {
    if (!siteId) {
      setExpenses([]);
      setSummary(null);
      setResultLimitHit(false);
      return;
    }
    setIsLoading(true);
    try {
      let query = (supabase as any)
        .from("v_all_expenses")
        .select("*")
        .eq("site_id", siteId)
        .eq("is_deleted", false)
        .order("date", { ascending: false });

      if (!isAllTime && dateFrom && dateTo) {
        query = query.gte("date", dateFrom).lte("date", dateTo);
      }

      // Group / type filter via expense_type so Tea & Snacks (module='general')
      // bands with Labor as designed.
      if (expenseTypes && expenseTypes.length > 0) {
        query = query.in("expense_type", expenseTypes);
      } else if (group !== "all") {
        query = query.in("expense_type", typesForGroup(group) as unknown as string[]);
      }

      if (status === "cleared") query = query.eq("is_cleared", true);
      else if (status === "pending") query = query.eq("is_cleared", false);

      if (sitePayerId) query = query.eq("site_payer_id", sitePayerId);

      query = query.limit(loadedLimit);

      // The summary RPC returns the full breakdown by expense_type for the same
      // site + date scope. We always call it without expense_type / status filters
      // so the summary band shows "what's possible" totals; the table is the
      // filtered view. p_module stays null because grouping happens at the
      // expense_type layer in our new IA.
      // Wrap summary RPC in withTimeout — Promise.all below waits for the slowest
      // side, so without a timeout here a hung get_expense_summary stalls the
      // whole fetch even if the v_all_expenses query came back quickly.
      const summaryPromise = withTimeout(
        Promise.resolve(
          (supabase as any).rpc("get_expense_summary", {
            p_site_id: siteId,
            p_date_from: !isAllTime && dateFrom ? dateFrom : null,
            p_date_to: !isAllTime && dateTo ? dateTo : null,
            p_module: null,
          })
        ),
        TIMEOUTS.QUERY,
        "get_expense_summary timed out",
      );

      const [{ data, error }, summaryResult] = await Promise.all([
        supabaseQueryWithTimeout<ExpenseRow[]>(query, 30000),
        summaryPromise,
      ]);
      if (error) throw error;

      const rows = (data || []) as ExpenseRow[];
      setResultLimitHit(rows.length >= loadedLimit);
      setExpenses(rows);

      if (summaryResult && !summaryResult.error && summaryResult.data) {
        const s = summaryResult.data as {
          total_amount: number | string;
          total_count: number | string;
          cleared_amount: number | string;
          cleared_count: number | string;
          pending_amount: number | string;
          pending_count: number | string;
          by_type: Array<{ type: string; amount: number | string; count: number | string }>;
        };
        const breakdown: Record<string, BreakdownEntry> = {};
        for (const row of s.by_type ?? []) {
          breakdown[row.type] = {
            amount: Number(row.amount) || 0,
            count: Number(row.count) || 0,
          };
        }
        setSummary({
          total: Number(s.total_amount) || 0,
          totalCount: Number(s.total_count) || 0,
          cleared: Number(s.cleared_amount) || 0,
          clearedCount: Number(s.cleared_count) || 0,
          pending: Number(s.pending_amount) || 0,
          pendingCount: Number(s.pending_count) || 0,
          breakdown,
        });
      } else {
        setSummary(null);
      }
    } catch (err) {
      console.error("useExpensesData: fetch failed", err);
      setExpenses([]);
      setSummary(null);
      setResultLimitHit(false);
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, siteId, dateFrom, dateTo, isAllTime, group, expenseTypesKey, status, sitePayerId, loadedLimit]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const loadMore = useCallback(() => {
    setLoadedLimit((l) => Math.min(l + LOAD_MORE_STEP, MAX_RESULT_LIMIT));
  }, []);

  return {
    expenses,
    summary,
    isLoading,
    loadedLimit,
    resultLimitHit,
    canLoadMore: loadedLimit < MAX_RESULT_LIMIT,
    loadMore,
    refetch: fetch,
  };
}

export function useExpenseTradeSummary(
  siteId: string | undefined,
  dateFrom: string | null,
  dateTo: string | null
) {
  const supabase = useMemo(() => createClient(), []);
  return useQuery<ExpenseTradeSummaryRow[]>({
    queryKey: ["expense-trade-summary", siteId, dateFrom, dateTo],
    enabled: !!siteId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc(
        "get_expense_trade_summary",
        {
          p_site_id: siteId!,
          p_date_from: dateFrom ?? undefined,
          p_date_to: dateTo ?? undefined,
        }
      );
      if (error) throw error;
      return (data ?? []) as ExpenseTradeSummaryRow[];
    },
    staleTime: 30_000,
  });
}
