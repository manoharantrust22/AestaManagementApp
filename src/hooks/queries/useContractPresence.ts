/**
 * useContractPresence
 *
 * Loads "contract presence" for a site over a date range: the days on which
 * contract / task-work crew was documented via a fixed-price package Day Log
 * (`task_work_day_logs`) or a headcount-mode subcontract
 * (`subcontract_headcount_attendance`), even though no `daily_attendance` row
 * exists. The attendance sheet uses this to show calm "Contract work" rows in
 * place of the red "unfilled" nag, and to link through to the contract.
 *
 * Returns a Map keyed by date (YYYY-MM-DD). Volume is tiny (a handful of logs),
 * so this is a single range query per source — no pagination needed. It mirrors
 * how the sheet already computes unfilled/holiday context over the full range.
 */

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { cacheTTL } from "@/lib/cache/keys";
import { summarizeLines, dayLogValue } from "@/lib/taskWork/dayLogCost";
import type { DayWorkerLine, TaskWorkDayLog } from "@/types/taskWork.types";
import type {
  ContractPresenceDay,
  ContractPresenceItem,
} from "@/lib/utils/contractPresenceUtils";

export interface UseContractPresenceOptions {
  siteId: string | undefined;
  dateFrom: string | null;
  dateTo: string | null;
  isAllTime?: boolean;
  enabled?: boolean;
}

const num = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? x : 0;
};

export function useContractPresence({
  siteId,
  dateFrom,
  dateTo,
  isAllTime = false,
  enabled = true,
}: UseContractPresenceOptions) {
  const supabase = createClient();

  // "All Time" walks the whole site history; a bounded filter clamps the range.
  const from = isAllTime ? null : dateFrom;
  const to = isAllTime ? null : dateTo;

  return useQuery({
    queryKey: ["contract-presence", "site", siteId, { from, to }] as const,
    enabled: enabled && !!siteId,
    staleTime: cacheTTL.transactional,
    gcTime: cacheTTL.transactional * 2,
    queryFn: async (): Promise<Map<string, ContractPresenceDay>> => {
      // Fixed-price package Day Logs (direct site_id + log_date).
      // The generated Database types don't include these tables, so call
      // .from() on a cast client (same pattern as useTaskWorkDayLogs).
      let pkgQuery = (supabase.from("task_work_day_logs" as any) as any)
        .select(
          "id, log_date, man_days, worker_count, worker_lines, worker_note, is_manual_override, recorded_by, created_at, package_id, site_id, task_work_packages!inner(title, labor_category_id)"
        )
        .eq("site_id", siteId);
      if (from) pkgQuery = pkgQuery.gte("log_date", from);
      if (to) pkgQuery = pkgQuery.lte("log_date", to);

      // Headcount-mode subcontract attendance (site_id resolved via subcontracts).
      let scQuery = (supabase.from("subcontract_headcount_attendance" as any) as any)
        .select(
          "attendance_date, units, subcontract_id, subcontracts!inner(title, site_id, trade_category_id)"
        )
        .eq("subcontracts.site_id", siteId);
      if (from) scQuery = scQuery.gte("attendance_date", from);
      if (to) scQuery = scQuery.lte("attendance_date", to);

      const [pkgRes, scRes] = await Promise.all([pkgQuery, scQuery]);
      if (pkgRes.error) {
        console.warn("Contract presence (packages) failed:", pkgRes.error);
      }
      if (scRes.error) {
        console.warn("Contract presence (subcontracts) failed:", scRes.error);
      }

      const byDate = new Map<string, ContractPresenceDay>();

      const addItem = (date: string, item: ContractPresenceItem) => {
        if (!date || item.units <= 0) return;
        const day =
          byDate.get(date) ?? { date, totalUnits: 0, totalValue: 0, items: [] };
        day.items.push(item);
        day.totalUnits += item.units;
        day.totalValue += item.labourValue || 0;
        byDate.set(date, day);
      };

      // One package row per (package, date) — unique constraint guarantees it.
      for (const r of (pkgRes.data || []) as any[]) {
        const lines = (r.worker_lines as DayWorkerLine[] | null) ?? null;
        const units = num(r.man_days) || num(r.worker_count);
        // Reconstruct the day-log so the attendance/tea rows can open the shared
        // edit dialog without a second fetch.
        const dayLog: TaskWorkDayLog = {
          id: r.id,
          package_id: r.package_id,
          site_id: r.site_id,
          log_date: r.log_date,
          worker_count: num(r.worker_count),
          worker_note: r.worker_note ?? null,
          man_days: num(r.man_days),
          worker_lines: lines,
          is_manual_override: r.is_manual_override ?? true,
          recorded_by: r.recorded_by ?? null,
          created_at: r.created_at,
        };
        addItem(r.log_date, {
          kind: "package",
          id: r.package_id,
          title: r.task_work_packages?.title ?? "Task work",
          units,
          workerSummary: summarizeLines(lines),
          tradeCategoryId: r.task_work_packages?.labor_category_id ?? null,
          labourValue: dayLogValue({ worker_lines: lines }),
          siteId: r.site_id,
          dayLog,
        });
      }

      // Subcontract headcount is one row per role per day — fold to one item
      // per (subcontract, date) by summing units.
      const scAgg = new Map<
        string,
        {
          id: string;
          title: string;
          date: string;
          units: number;
          tradeCategoryId: string | null;
        }
      >();
      for (const r of (scRes.data || []) as any[]) {
        const key = `${r.subcontract_id}|${r.attendance_date}`;
        const cur = scAgg.get(key) ?? {
          id: r.subcontract_id,
          title: r.subcontracts?.title ?? "Contract",
          date: r.attendance_date,
          units: 0,
          tradeCategoryId: r.subcontracts?.trade_category_id ?? null,
        };
        cur.units += num(r.units);
        scAgg.set(key, cur);
      }
      for (const agg of scAgg.values()) {
        addItem(agg.date, {
          kind: "subcontract",
          id: agg.id,
          title: agg.title,
          units: agg.units,
          workerSummary: "",
          tradeCategoryId: agg.tradeCategoryId,
          // Headcount subcontracts carry no per-type rates → no labour value.
          labourValue: 0,
        });
      }

      // Stable display order: largest crew first within a day.
      for (const day of byDate.values()) {
        day.items.sort((a, b) => b.units - a.units);
      }

      return byDate;
    },
  });
}
