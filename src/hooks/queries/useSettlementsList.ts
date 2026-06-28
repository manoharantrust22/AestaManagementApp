import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { withTimeout, TIMEOUTS } from "@/lib/utils/timeout";
import type { AuditPeriod } from "./useSiteAuditState";

/**
 * A row in the chronological settlement-list view. Mirrors what the user
 * recorded — one row per settlement_groups entry, ungrouped by week. Used by
 * the "By Settlement" toggle on /site/payments to give the user a flat ledger
 * of "what did I actually pay, in date order?" — orthogonal to the waterfall.
 */
export interface SettlementListRow {
  id: string;
  ref: string;
  settlementDate: string; // YYYY-MM-DD
  actualPaymentDate: string | null;
  totalAmount: number;
  laborerCount: number;
  paymentMode: string | null;
  paymentChannel: string | null;
  payerSource: string | null;
  paymentType: string | null;
  /** "salary" / "advance" / "excess" — drives chip color in the list. */
  isContract: boolean;
  notes: string | null;
  isCancelled: boolean;
  hasProof: boolean;
  /** Subcontract this settlement is linked to. NULL when the user skipped the
   *  link at create time — surfaced in the "Unlinked settlements" group at
   *  the top of each tab so the user can review and assign one inline. */
  subcontractId: string | null;
  subcontractTitle: string | null;
  /** trade_category_id of the linked subcontract. Used in the Civil view to
   *  exclude settlements that belong to a trade (e.g. Painting) category. */
  subcontractCategoryId: string | null;
  recordedByName: string | null;
}

export type SettlementsListFilter = "contract" | "daily-market" | "all";

export interface UseSettlementsListArgs {
  siteId: string | undefined;
  filter: SettlementsListFilter;
  dateFrom: string | null;
  dateTo: string | null;
  /** When set with cutoffDate, filters rows by settlement_date relative to cutoff.
   *  'legacy' = settlement_date < cutoff. 'current' = settlement_date >= cutoff.
   *  'all' or undefined = no period filter. */
  period?: AuditPeriod;
  /** ISO YYYY-MM-DD. Required for period='legacy' or 'current' to take effect. */
  cutoffDate?: string | null;
  /** Scope to one in-house trade contract (the active trade workspace).
   *  undefined (Civil / site-wide) = all subcontracts. Mirrors
   *  useCancelledSettlementCounts so the by-settlement count and the cancelled
   *  badge stay in lock-step for the trade workspace. */
  subcontractId?: string;
}

export function useSettlementsList(args: UseSettlementsListArgs) {
  const supabase = createClient();
  const { siteId, filter, dateFrom, dateTo, period = "all", cutoffDate = null, subcontractId } = args;

  return useQuery<SettlementListRow[]>({
    queryKey: ["settlements-list", siteId, filter, dateFrom, dateTo, period, cutoffDate, subcontractId ?? null],
    enabled: Boolean(siteId),
    staleTime: 60_000,
    queryFn: async () => {
      // Pull the raw settlement_groups rows in date order. We post-filter
      // contract vs daily-market client-side using the labor_payments link —
      // contract settlements always have at least one labor_payments row with
      // is_under_contract=true, daily/market never do.
      let q = (supabase as any)
        .from("settlement_groups")
        .select(
          `
          id,
          settlement_reference,
          settlement_date,
          actual_payment_date,
          total_amount,
          laborer_count,
          payment_mode,
          payment_channel,
          payer_source,
          payment_type,
          notes,
          is_cancelled,
          proof_url,
          proof_urls,
          subcontract_id,
          created_by_name,
          subcontract:subcontracts ( title, trade_category_id ),
          labor_payments!labor_payments_settlement_group_id_fkey ( is_under_contract )
          `
        )
        .eq("site_id", siteId)
        .eq("is_archived", false)
        .order("settlement_date", { ascending: false })
        .order("created_at", { ascending: false });

      // Trade scope: only this in-house contract's settlements. Civil view
      // passes undefined → site-wide (unchanged).
      if (subcontractId) q = q.eq("subcontract_id", subcontractId);

      if (dateFrom) q = q.gte("settlement_date", dateFrom);
      if (dateTo) q = q.lte("settlement_date", dateTo);

      if (cutoffDate && period === "legacy") {
        q = q.lt("settlement_date", cutoffDate);
      } else if (cutoffDate && period === "current") {
        q = q.gte("settlement_date", cutoffDate);
      }

      const { data, error } = await withTimeout(
        Promise.resolve(q),
        TIMEOUTS.QUERY,
        "Settlements list query timed out. Please retry.",
      );
      if (error) throw error;

      const rows: SettlementListRow[] = (data ?? []).map((sg: any) => {
        const lps: Array<{ is_under_contract: boolean | null }> = Array.isArray(sg.labor_payments)
          ? sg.labor_payments
          : [];
        const isContract = lps.some((lp) => lp.is_under_contract === true);
        const proofUrls: string[] = Array.isArray(sg.proof_urls)
          ? sg.proof_urls.filter((u: any) => typeof u === "string")
          : [];
        const hasProof = proofUrls.length > 0 || Boolean(sg.proof_url);

        return {
          id: sg.id,
          ref: sg.settlement_reference,
          settlementDate: sg.settlement_date,
          actualPaymentDate: sg.actual_payment_date ?? null,
          totalAmount: Number(sg.total_amount) || 0,
          laborerCount: Number(sg.laborer_count) || 0,
          paymentMode: sg.payment_mode ?? null,
          paymentChannel: sg.payment_channel ?? null,
          payerSource: sg.payer_source ?? null,
          paymentType: sg.payment_type ?? null,
          isContract,
          notes: sg.notes ?? null,
          isCancelled: Boolean(sg.is_cancelled),
          hasProof,
          subcontractId: sg.subcontract_id ?? null,
          recordedByName: sg.created_by_name ?? null,
          subcontractTitle:
            sg.subcontract && typeof sg.subcontract === "object"
              ? ((sg.subcontract as { title?: string | null; trade_category_id?: string | null }).title ?? null)
              : null,
          subcontractCategoryId:
            sg.subcontract && typeof sg.subcontract === "object"
              ? ((sg.subcontract as { title?: string | null; trade_category_id?: string | null }).trade_category_id ?? null)
              : null,
        };
      });

      if (filter === "contract") return rows.filter((r) => r.isContract);
      if (filter === "daily-market") return rows.filter((r) => !r.isContract);
      return rows;
    },
  });
}
