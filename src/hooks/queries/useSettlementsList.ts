import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

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
}

export type SettlementsListFilter = "contract" | "daily-market" | "all";

export interface UseSettlementsListArgs {
  siteId: string | undefined;
  filter: SettlementsListFilter;
  dateFrom: string | null;
  dateTo: string | null;
}

export function useSettlementsList(args: UseSettlementsListArgs) {
  const supabase = createClient();
  const { siteId, filter, dateFrom, dateTo } = args;

  return useQuery<SettlementListRow[]>({
    queryKey: ["settlements-list", siteId, filter, dateFrom, dateTo],
    enabled: Boolean(siteId),
    staleTime: 15_000,
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
          labor_payments!labor_payments_settlement_group_id_fkey ( is_under_contract )
          `
        )
        .eq("site_id", siteId)
        .order("settlement_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (dateFrom) q = q.gte("settlement_date", dateFrom);
      if (dateTo) q = q.lte("settlement_date", dateTo);

      const { data, error } = await q;
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
        };
      });

      if (filter === "contract") return rows.filter((r) => r.isContract);
      if (filter === "daily-market") return rows.filter((r) => !r.isContract);
      return rows;
    },
  });
}
