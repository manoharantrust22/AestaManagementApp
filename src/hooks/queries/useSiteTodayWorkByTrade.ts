"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { wrapQueryFn } from "@/lib/utils/timeout";
import { toWorkPhotoArray } from "@/lib/work-updates/photos";
import type { WorkPhoto } from "@/types/work-updates.types";
import type { SiteRecordedStatus } from "@/hooks/queries/useCompanyDailyPeek";

/** Map key for the Civil / site-wide scope (daily_work_summary.subcontract_id IS NULL). */
export const CIVIL_SCOPE_KEY = "__civil__";

export interface TodayWorkScope {
  /** null = Civil / site-wide; a contract id = that trade's own day log. */
  subcontractId: string | null;
  workStatus: string | null;
  recordedStatus: SiteRecordedStatus;
  morningPlanText: string | null;
  eveningSummaryText: string | null;
  morningPhotos: WorkPhoto[];
  eveningPhotos: WorkPhoto[];
  hasMorning: boolean;
  hasEvening: boolean;
}

export const scopeMapKey = (subcontractId: string | null): string =>
  subcontractId ?? CIVIL_SCOPE_KEY;

function isObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object";
}

function pickString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * One round-trip that returns every `daily_work_summary` row for (site, date),
 * keyed by scope — the Civil/site-wide row plus each per-trade row — so the
 * site-dashboard "Today by trade" card can show each chip's own status without
 * N queries. A scope with no row simply isn't in the Map (consumer → "waiting").
 *
 * The recorded-status rule mirrors `get_company_daily_peek` exactly (evening
 * object → recorded, morning object → in_progress, row-but-neither → in_progress)
 * so the card and the company peek never disagree.
 */
export function useSiteTodayWorkByTrade(
  siteId: string | null | undefined,
  date: string,
) {
  const supabase = createClient();
  return useQuery<Map<string, TodayWorkScope>>({
    queryKey: ["site-today-work-by-trade", siteId, date],
    enabled: Boolean(siteId && date),
    staleTime: 0,
    refetchOnWindowFocus: false,
    queryFn: wrapQueryFn(
      async (ctx) => {
        const signal = (ctx as { signal?: AbortSignal } | undefined)?.signal;
        const { data, error } = await (supabase.from("daily_work_summary") as any)
          .select("subcontract_id, work_status, work_description, comments, work_updates")
          .eq("site_id", siteId)
          .eq("date", date)
          .abortSignal(signal);
        if (error) throw error;

        const map = new Map<string, TodayWorkScope>();
        for (const row of (data ?? []) as Record<string, unknown>[]) {
          const subcontractId =
            row.subcontract_id == null ? null : String(row.subcontract_id);
          const updates = isObject(row.work_updates) ? row.work_updates : null;
          const morning = updates && isObject(updates.morning) ? updates.morning : null;
          const evening = updates && isObject(updates.evening) ? updates.evening : null;
          const hasMorning = morning != null;
          const hasEvening = evening != null;

          const recordedStatus: SiteRecordedStatus = hasEvening
            ? "recorded"
            : "in_progress"; // a row exists (morning-only or mid-entry) → in progress

          map.set(scopeMapKey(subcontractId), {
            subcontractId,
            workStatus: pickString(row.work_status),
            recordedStatus,
            morningPlanText:
              (morning && pickString(morning.description)) ??
              pickString(row.work_description),
            eveningSummaryText:
              (evening && pickString(evening.summary)) ?? pickString(row.comments),
            morningPhotos: toWorkPhotoArray(morning?.photos),
            eveningPhotos: toWorkPhotoArray(evening?.photos),
            hasMorning,
            hasEvening,
          });
        }
        return map;
      },
      { operationName: "useSiteTodayWorkByTrade" },
    ),
  });
}
