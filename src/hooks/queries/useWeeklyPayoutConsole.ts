/**
 * Weekly Payout Console read model — get_weekly_payout_console RPC
 * (migration 20260714100100). Cross-site: takes a LIST of site ids
 * (sorted for a stable query key, the settlementReport.byScope pattern).
 */

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { withTimeout, TIMEOUTS } from "@/lib/utils/timeout";
import type {
  PayoutBatch,
  PayoutBucket,
  PayoutConsoleData,
  PayoutLaborer,
} from "@/types/payout.types";

const num = (v: unknown): number => Number(v) || 0;

function mapBucket(raw: any): PayoutBucket {
  return {
    siteId: raw.site_id,
    siteName: raw.site_name ?? "",
    kind: raw.kind,
    refKind: raw.ref_kind ?? null,
    refId: raw.ref_id ?? null,
    title: raw.title ?? "",
    trade: raw.trade ?? null,
    commissionApplies: raw.commission_applies ?? null,
    daysWeek: num(raw.days_week),
    grossWeek: num(raw.gross_week),
    commissionWeek: num(raw.commission_week),
    netWeek: num(raw.net_week),
    thisWeekUnpaid: num(raw.this_week_unpaid),
    earlierUnpaid: num(raw.earlier_unpaid),
    totalUnpaid: num(raw.total_unpaid),
    paidTotal: num(raw.paid_total),
  };
}

function mapBatch(raw: any): PayoutBatch {
  return {
    id: raw.id,
    paymentDate: raw.payment_date,
    totalAmount: num(raw.total_amount),
    paymentMode: raw.payment_mode ?? null,
    notes: raw.notes ?? null,
    createdByName: raw.created_by_name ?? null,
    createdAt: raw.created_at,
    bucketsResult: Array.isArray(raw.buckets_result)
      ? raw.buckets_result.map((b: any) => ({
          site_id: b.site_id,
          kind: b.kind,
          ref_kind: b.ref_kind ?? null,
          ref_id: b.ref_id ?? null,
          settlement_group_id: b.settlement_group_id,
          settlement_reference: b.settlement_reference,
          requested: num(b.requested),
          recorded: num(b.recorded),
        }))
      : [],
  };
}

export function useWeeklyPayoutConsole(args: {
  siteIds: string[];
  weekStart: string;
  weekEnd: string;
}) {
  const supabase = createClient();
  const sortedIds = [...args.siteIds].sort();

  return useQuery<PayoutConsoleData>({
    queryKey: ["weekly-payout-console", { siteIds: sortedIds, weekStart: args.weekStart }],
    enabled: sortedIds.length > 0 && Boolean(args.weekStart) && Boolean(args.weekEnd),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await withTimeout(
        Promise.resolve(
          (supabase as any).rpc("get_weekly_payout_console", {
            p_site_ids: sortedIds,
            p_week_start: args.weekStart,
            p_week_end: args.weekEnd,
          })
        ),
        TIMEOUTS.QUERY,
        "Weekly payout console query timed out. Please retry."
      );
      if (error) throw error;

      const raw = data ?? { laborers: [] };
      const laborers: PayoutLaborer[] = (raw.laborers ?? []).map((l: any) => ({
        laborerId: l.laborer_id,
        name: (l.name ?? "").trim(),
        role: l.role ?? null,
        photoUrl: l.photo_url ?? null,
        advanceOutstanding: num(l.advance_outstanding),
        totalUnpaid: num(l.total_unpaid),
        daysWeek: num(l.days_week),
        buckets: Array.isArray(l.buckets) ? l.buckets.map(mapBucket) : [],
        batches: Array.isArray(l.batches) ? l.batches.map(mapBatch) : [],
      }));

      return {
        weekStart: raw.week_start ?? args.weekStart,
        weekEnd: raw.week_end ?? args.weekEnd,
        laborers,
      };
    },
  });
}
