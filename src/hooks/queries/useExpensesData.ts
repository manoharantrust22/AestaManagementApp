"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

export const PAGE_SIZE = 50;

export interface Cursor {
  date: string;
  id: string;
}

export function buildCursorFromLastRow(rows: ExpenseRow[]): Cursor | null {
  if (rows.length === 0) return null;
  const last = rows[rows.length - 1];
  return { date: last.date, id: last.id };
}

/**
 * PostgREST or-filter string for `(date, id) < (cursor.date, cursor.id)`.
 *
 * Encodes the "strictly older than cursor" predicate for newest-first
 * (date DESC, id DESC) pagination ONLY. Do not use for ascending order —
 * callers requiring ASC need the symmetric `gt`/`eq+gt` predicate, which
 * this function does not provide. The caller is responsible for ensuring
 * the surrounding query is ordered DESC.
 *
 * Used as `.or(buildCursorPredicate(c))` in Supabase JS query chains.
 */
export function buildCursorPredicate(c: Cursor): string {
  return `date.lt.${c.date},and(date.eq.${c.date},id.lt.${c.id})`;
}

export function appendPageDedupe(
  prev: ExpenseRow[],
  next: ExpenseRow[],
): ExpenseRow[] {
  if (next.length === 0) return prev;
  const seen = new Set(prev.map((r) => r.id));
  const fresh = next.filter((r) => !seen.has(r.id));
  if (fresh.length === 0) return prev;
  return [...prev, ...fresh];
}

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
  /**
   * Sort direction for the `date` column. Cursor pagination only supports
   * "desc" (newest-first). The type is intentionally narrow so that the
   * TypeScript compiler rejects any call site that tries to pass "asc".
   */
  sortDir: "desc";
}

export function useExpensesData(args: Args) {
  const supabase = useMemo(() => createClient(), []);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [summary, setSummary] = useState<ScopeSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [canLoadMore, setCanLoadMore] = useState(false);

  // Bumped each time the scope (site / filters / date range) changes so the
  // active fetch can short-circuit if its caller's scope is stale.
  const scopeIdRef = useRef(0);
  const cursorRef = useRef<Cursor | null>(null);
  // Ref mirror of isLoading so fetchPage's "more" guard can read the current
  // value without capturing a stale closure (adding isLoading to fetchPage's
  // deps would cause unnecessary observer teardown/reattach).
  const isLoadingRef = useRef(false);

  const { siteId, dateFrom, dateTo, isAllTime, group, expenseTypes, status, sitePayerId, sortDir } = args;

  // Stabilise the expenseTypes array reference for the dependency lists below.
  const expenseTypesKey =
    expenseTypes && expenseTypes.length > 0
      ? [...expenseTypes].sort().join("|")
      : "";

  const scopeKey = `${siteId}|${dateFrom}|${dateTo}|${isAllTime}|${group}|${expenseTypesKey}|${status}|${sitePayerId}|${sortDir}`;

  const fetchPage = useCallback(
    async (mode: "initial" | "more") => {
      if (!siteId) {
        setExpenses([]);
        setSummary(null);
        setCanLoadMore(false);
        cursorRef.current = null;
        return;
      }

      // Snapshot the scope this fetch belongs to. If `scopeIdRef.current`
      // changes before this fetch resolves, we drop the result.
      const myScopeId = scopeIdRef.current;
      const myCursor = mode === "more" ? cursorRef.current : null;

      // Cursor predicate only works for DESC; fail silently rather than
      // blanking the table. The type is now narrowed to "desc" so this guard
      // should never fire in practice — it is a belt-and-suspenders safety net.
      if (sortDir !== "desc") return;

      // If initial page hasn't landed yet, cursorRef is null — no-op;
      // the observer will fire again once canLoadMore becomes true.
      if (mode === "more" && (!myCursor || isLoadingRef.current)) return;

      isLoadingRef.current = true;
      setIsLoading(true);
      try {
        let query = (supabase as any)
          .from("v_all_expenses")
          .select("*")
          .eq("site_id", siteId)
          .eq("is_deleted", false)
          .order("date", { ascending: false })
          .order("id", { ascending: false });

        if (!isAllTime && dateFrom && dateTo) {
          query = query.gte("date", dateFrom).lte("date", dateTo);
        }

        if (expenseTypes && expenseTypes.length > 0) {
          query = query.in("expense_type", expenseTypes);
        } else if (group !== "all") {
          query = query.in(
            "expense_type",
            typesForGroup(group) as unknown as string[],
          );
        }

        if (status === "cleared") query = query.eq("is_cleared", true);
        else if (status === "pending") query = query.eq("is_cleared", false);

        if (sitePayerId) query = query.eq("site_payer_id", sitePayerId);

        if (myCursor) {
          query = query.or(buildCursorPredicate(myCursor));
        }

        query = query.limit(PAGE_SIZE);

        // Summary RPC only fires on initial — it returns scope-wide totals
        // independent of pagination.
        const summaryPromise =
          mode === "initial"
            ? withTimeout(
                Promise.resolve(
                  (supabase as any).rpc("get_expense_summary", {
                    p_site_id: siteId,
                    p_date_from: !isAllTime && dateFrom ? dateFrom : null,
                    p_date_to: !isAllTime && dateTo ? dateTo : null,
                    p_module: null,
                  }),
                ),
                TIMEOUTS.QUERY,
                "get_expense_summary timed out",
              )
            : Promise.resolve(null);

        const [{ data, error }, summaryResult] = await Promise.all([
          supabaseQueryWithTimeout<ExpenseRow[]>(query, 30000),
          summaryPromise,
        ]);
        if (error) throw error;

        // Stale-scope guard: if the user changed filters while we were waiting,
        // drop this result silently.
        if (myScopeId !== scopeIdRef.current) return;

        const rows = (data || []) as ExpenseRow[];

        if (mode === "initial") {
          setExpenses(rows);
        } else {
          setExpenses((prev) => appendPageDedupe(prev, rows));
        }

        // Cursor = last row of the newly returned page if non-empty,
        // else keep the previous cursor (so a 0-row page doesn't null it out
        // and prevent a subsequent retry from finding its place).
        if (rows.length > 0) {
          cursorRef.current = buildCursorFromLastRow(rows);
        }

        // A full page means there may be more; a short page means we hit
        // end-of-data definitively.
        setCanLoadMore(rows.length === PAGE_SIZE);

        if (mode === "initial") {
          if (summaryResult && !summaryResult.error && summaryResult.data) {
            const s = summaryResult.data as {
              total_amount: number | string;
              total_count: number | string;
              cleared_amount: number | string;
              cleared_count: number | string;
              pending_amount: number | string;
              pending_count: number | string;
              by_type: Array<{
                type: string;
                amount: number | string;
                count: number | string;
              }>;
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
        }
      } catch (err) {
        if (myScopeId !== scopeIdRef.current) return;
        console.error(`useExpensesData: ${mode} fetch failed`, err);
        if (mode === "initial") {
          setExpenses([]);
          setSummary(null);
        }
        setCanLoadMore(false);
      } finally {
        if (myScopeId === scopeIdRef.current) {
          isLoadingRef.current = false;
          setIsLoading(false);
        }
      }
    // isLoading omitted from deps deliberately — checking it inside the body
    // is fine; including it would re-create fetchPage on every load and the
    // observer effect in the consumer would tear down/re-attach unnecessarily.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [supabase, siteId, dateFrom, dateTo, isAllTime, group, expenseTypesKey, status, sitePayerId],
  );

  // Shared reset helper: invalidates in-flight fetches, resets cursor, and
  // loads the first page. Used by both the scope-change effect and `refetch`
  // so they stay in sync (e.g. both reset canLoadMore).
  const resetAndFetchInitial = useCallback(() => {
    scopeIdRef.current += 1;
    cursorRef.current = null;
    setCanLoadMore(false);
    return fetchPage("initial");
  }, [fetchPage]);

  // When the scope changes: bump scopeId (invalidates in-flight fetches),
  // reset cursor, and re-fetch from page 1.
  useEffect(() => {
    resetAndFetchInitial();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

  const loadMore = useCallback(() => {
    fetchPage("more");
  }, [fetchPage]);

  const refetch = useCallback(() => {
    return resetAndFetchInitial();
  }, [resetAndFetchInitial]);

  return {
    expenses,
    summary,
    isLoading,
    canLoadMore,
    loadMore,
    refetch,
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
