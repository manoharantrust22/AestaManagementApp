/**
 * useContractPresenceForSites
 *
 * Contract / task-work presence for a SINGLE date across SEVERAL sites (a group),
 * keyed by site_id. Powers the contract-aware tea allocator, which lists each
 * site's activated contracts that worked that day. One range query per source
 * (`task_work_day_logs` + `subcontract_headcount_attendance`), filtered to the
 * given site ids — mirrors `useContractPresence` but grouped by site for a day.
 */

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { cacheTTL } from "@/lib/cache/keys";
import { summarizeLines, dayLogValue } from "@/lib/taskWork/dayLogCost";
import type { DayWorkerLine } from "@/types/taskWork.types";
import type { ContractPresenceItem } from "@/lib/utils/contractPresenceUtils";

const num = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : 0;
};

export interface UseContractPresenceForSitesOptions {
  siteIds: string[];
  date: string | undefined;
  enabled?: boolean;
}

/** Map<siteId, ContractPresenceItem[]> (largest crew first within a site). */
export function useContractPresenceForSites({
  siteIds,
  date,
  enabled = true,
}: UseContractPresenceForSitesOptions) {
  const supabase = createClient();
  const ids = [...siteIds].filter(Boolean).sort();

  return useQuery({
    queryKey: ["contract-presence", "sites", ids, date] as const,
    enabled: enabled && ids.length > 0 && !!date,
    staleTime: cacheTTL.transactional,
    gcTime: cacheTTL.transactional * 2,
    queryFn: async (): Promise<Map<string, ContractPresenceItem[]>> => {
      const bySite = new Map<string, ContractPresenceItem[]>();
      for (const id of ids) bySite.set(id, []);
      if (!date || ids.length === 0) return bySite;

      // Fixed-price package Day Logs (direct site_id + log_date).
      const pkgQuery = (supabase.from("task_work_day_logs" as any) as any)
        .select(
          "site_id, log_date, man_days, worker_count, worker_lines, package_id, task_work_packages!inner(title, labor_category_id)"
        )
        .in("site_id", ids)
        .eq("log_date", date);

      // Headcount-mode subcontract attendance (site_id via subcontracts join).
      const scQuery = (supabase.from("subcontract_headcount_attendance" as any) as any)
        .select(
          "attendance_date, units, subcontract_id, subcontracts!inner(title, site_id, trade_category_id)"
        )
        .in("subcontracts.site_id", ids)
        .eq("attendance_date", date);

      const [pkgRes, scRes] = await Promise.all([pkgQuery, scQuery]);
      if (pkgRes.error) console.warn("Contract presence (packages) failed:", pkgRes.error);
      if (scRes.error) console.warn("Contract presence (subcontracts) failed:", scRes.error);

      const push = (siteId: string, item: ContractPresenceItem) => {
        if (!siteId || item.units <= 0) return;
        const arr = bySite.get(siteId);
        if (!arr) return; // ignore rows for sites outside the group
        arr.push(item);
      };

      // One package row per (package, date).
      for (const r of (pkgRes.data || []) as any[]) {
        const lines = (r.worker_lines as DayWorkerLine[] | null) ?? null;
        push(r.site_id, {
          kind: "package",
          id: r.package_id,
          title: r.task_work_packages?.title ?? "Task work",
          units: num(r.man_days) || num(r.worker_count),
          workerSummary: summarizeLines(lines),
          tradeCategoryId: r.task_work_packages?.labor_category_id ?? null,
          labourValue: dayLogValue({ worker_lines: lines }),
        });
      }

      // Subcontract headcount: one row per role per day — fold to one item per
      // (subcontract, date) by summing units.
      const scAgg = new Map<
        string,
        { siteId: string; id: string; title: string; units: number; tradeCategoryId: string | null }
      >();
      for (const r of (scRes.data || []) as any[]) {
        const siteId = r.subcontracts?.site_id as string;
        const key = `${r.subcontract_id}`;
        const cur = scAgg.get(key) ?? {
          siteId,
          id: r.subcontract_id,
          title: r.subcontracts?.title ?? "Contract",
          units: 0,
          tradeCategoryId: r.subcontracts?.trade_category_id ?? null,
        };
        cur.units += num(r.units);
        scAgg.set(key, cur);
      }
      for (const agg of scAgg.values()) {
        push(agg.siteId, {
          kind: "subcontract",
          id: agg.id,
          title: agg.title,
          units: agg.units,
          workerSummary: "",
          tradeCategoryId: agg.tradeCategoryId,
          labourValue: 0,
        });
      }

      for (const arr of bySite.values()) arr.sort((a, b) => b.units - a.units);
      return bySite;
    },
  });
}
