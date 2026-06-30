"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { withTimeout } from "@/lib/utils/timeout";
import { toWorkPhotoArray as toPhotoArray } from "@/lib/work-updates/photos";
import type { WorkPhoto } from "@/types/work-updates.types";

const DAILY_PEEK_TIMEOUT_MS = 10_000;

export type SiteRecordedStatus = "recorded" | "in_progress" | "waiting";

/** One per-scope (Civil or a trade) entry in a site's daily work breakdown. */
export interface DailyPeekTradeScope {
  subcontractId: string | null; // null = Civil / site-wide
  scopeLabel: string;
  status: SiteRecordedStatus;
  morningPhotos: WorkPhoto[];
  eveningPhotos: WorkPhoto[];
}

export interface DailyPeekSite {
  siteId: string;
  siteName: string;
  siteCity: string | null;
  siteStatus: string;
  engineerPhone: string | null;
  recordedStatus: SiteRecordedStatus;
  morningPlanText: string | null;
  eveningSummaryText: string | null;
  morningPhotos: WorkPhoto[];
  eveningPhotos: WorkPhoto[];
  hasMorning: boolean;
  hasEvening: boolean;
  recordedAt: string | null;
  morningAt: string | null;
  eveningAt: string | null;
  recordedByName: string | null;
  recordedByPhone: string | null;
  dailyCount: number;
  dailyTotal: number;
  contractCount: number;
  contractCrews: number;
  contractTotal: number;
  // Task M-4: spot-purchase per-site rollup for today.
  spotPurchaseCountToday: number;
  spotPurchaseTotalToday: number;
  /** Per-scope (Civil + each trade) work breakdown for the day. Civil-first. */
  trades: DailyPeekTradeScope[];
}

function toNumber(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function useCompanyDailyPeek(companyId: string | null | undefined, date: string) {
  const supabase = createClient();
  return useQuery<DailyPeekSite[]>({
    queryKey: ["company-daily-peek", companyId, date],
    enabled: Boolean(companyId && date),
    staleTime: 0,
    refetchOnWindowFocus: false,
    queryFn: async ({ signal }): Promise<DailyPeekSite[]> => {
      const tag = `[diag company-daily-peek ${date}]`;
      const t0 = Date.now();
      try {
        const { data, error } = await withTimeout(
          Promise.resolve(
            (supabase as any)
              .rpc("get_company_daily_peek", {
                p_company_id: companyId,
                p_date: date,
              })
              .abortSignal(signal),
          ),
          DAILY_PEEK_TIMEOUT_MS,
          `Daily peek query timed out after ${DAILY_PEEK_TIMEOUT_MS / 1000}s.`,
        );
        const ms = Date.now() - t0;
        if (error) {
          console.warn(`${tag} rpc-error +${ms}ms`, error);
          throw error;
        }
        console.warn(`${tag} ok +${ms}ms`);
        const rows: unknown[] = Array.isArray(data) ? data : [];
        return rows.map((row) => {
          const r = row as Record<string, unknown>;
          return {
            siteId: String(r.site_id),
            siteName: String(r.site_name ?? ""),
            siteCity: typeof r.site_city === "string" ? r.site_city : null,
            siteStatus: String(r.site_status ?? ""),
            engineerPhone: typeof r.engineer_phone === "string" ? r.engineer_phone : null,
            recordedStatus: (r.recorded_status as SiteRecordedStatus) ?? "waiting",
            morningPlanText:
              typeof r.morning_plan_text === "string" && r.morning_plan_text.length > 0
                ? r.morning_plan_text
                : null,
            eveningSummaryText:
              typeof r.evening_summary_text === "string" && r.evening_summary_text.length > 0
                ? r.evening_summary_text
                : null,
            morningPhotos: toPhotoArray(r.morning_photos),
            eveningPhotos: toPhotoArray(r.evening_photos),
            hasMorning: Boolean(r.has_morning),
            hasEvening: Boolean(r.has_evening),
            recordedAt: typeof r.recorded_at === "string" ? r.recorded_at : null,
            morningAt: typeof r.morning_at === "string" ? r.morning_at : null,
            eveningAt: typeof r.evening_at === "string" ? r.evening_at : null,
            recordedByName: typeof r.recorded_by_name === "string" ? r.recorded_by_name : null,
            recordedByPhone: typeof r.recorded_by_phone === "string" ? r.recorded_by_phone : null,
            dailyCount: toNumber(r.daily_count),
            dailyTotal: toNumber(r.daily_total),
            contractCount: toNumber(r.contract_count),
            contractCrews: toNumber(r.contract_crews),
            contractTotal: toNumber(r.contract_total),
            // Task M-4: keys absent on pre-migration prod return 0 via toNumber.
            spotPurchaseCountToday: toNumber(r.spot_purchase_count_today),
            spotPurchaseTotalToday: toNumber(r.spot_purchase_total_today),
            // Per-trade breakdown — absent on pre-migration prod → [] (back-compat).
            trades: Array.isArray(r.trades)
              ? (r.trades as unknown[]).map((t) => {
                  const tr = t as Record<string, unknown>;
                  return {
                    subcontractId:
                      tr.subcontract_id == null ? null : String(tr.subcontract_id),
                    scopeLabel: String(tr.scope_label ?? "Civil"),
                    status: (tr.status as SiteRecordedStatus) ?? "waiting",
                    morningPhotos: toPhotoArray(tr.morning_photos),
                    eveningPhotos: toPhotoArray(tr.evening_photos),
                  };
                })
              : [],
          };
        });
      } catch (err) {
        const ms = Date.now() - t0;
        console.warn(`${tag} threw +${ms}ms`, err);
        throw err;
      }
    },
  });
}
