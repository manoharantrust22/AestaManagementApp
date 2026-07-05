/**
 * useAttendanceForDate
 *
 * Powers the daily-shape branch of the InspectPane Attendance tab.
 * Calls the get_attendance_for_date RPC (added in migration
 * 20260426120000_add_inspect_pane_rpcs.sql) which returns the 3 totals
 * (daily / market / tea) plus per-laborer + per-market-laborer detail
 * rows for one site + one date in a single round-trip.
 */

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { withTimeout } from "@/lib/utils/timeout";

// Single-row RPC; fail-fast at 8s so React Query retries quickly instead of
// holding the InspectPane skeleton for the global 30s default.
const PER_DAY_TIMEOUT_MS = 8_000;

export interface AttendanceLaborerRow {
  id: string;
  name: string;
  role: string;
  fullDay: boolean;
  amount: number;
  isOverridden: boolean;
  overrideReason: string | null;
  laborerId: string | null;
  // 'daily' | 'contract' | null (legacy rows). Surfaced so the
  // InspectPane can bucket contract attendance separately from daily
  // when rendering the Daily + Market settlement view (contract rows
  // show as informational "not in this calculation").
  laborerType: string | null;
  // When set, this row worked on a task-work package: it is paid via that
  // package on /site/trades and is excluded from BOTH the Daily+Market and
  // Contract salary settlements. The UI greys it out with a "paid via
  // contract" note. Null = normal salary-settlement row.
  taskWorkPackageId: string | null;
  taskWorkTitle: string | null;
  // Trade attribution: when this row's subcontract belongs to a non-Civil trade
  // (e.g. Painting), it settles in that trade's own workspace and is greyed out
  // of the company/Civil settlement. Civil / untagged rows have isTradeContract
  // = false and stay in the company bucket.
  subcontractId: string | null;
  subcontractTitle: string | null;
  tradeName: string | null;
  isTradeContract: boolean;
}

export interface AttendanceMarketRow {
  id: string;
  role: string;
  count: number;
  amount: number;
  taskWorkPackageId: string | null;
  taskWorkTitle: string | null;
}

export interface AttendanceForDateData {
  dailyTotal: number;
  marketTotal: number;
  teaShopTotal: number;
  // All daily-attendance rows for the date, regardless of laborer_type.
  // Kept for backward compatibility with existing callers.
  dailyLaborers: Array<AttendanceLaborerRow>;
  // Buckets for settlement rendering. Task-work-tagged rows are split out
  // (into `taskWork`) from BOTH daily and contract so they never inflate a
  // settleable subtotal.
  dailyLaborersByType: {
    daily: AttendanceLaborerRow[];    // untagged, laborer_type === 'daily' or NULL
    contract: AttendanceLaborerRow[]; // untagged, laborer_type === 'contract'
    taskWork: AttendanceLaborerRow[]; // tagged to a task-work package (any type)
    tradeContract: AttendanceLaborerRow[]; // non-Civil trade-contract rows (settled in that trade's workspace)
  };
  // All market rows (backward compat). Kept unchanged.
  marketLaborers: Array<AttendanceMarketRow>;
  // Market rows split by task-work attribution — parallel to dailyLaborersByType.
  marketLaborersByType: {
    market: AttendanceMarketRow[];    // untagged, settleable under Daily+Market
    taskWork: AttendanceMarketRow[];  // tagged to a task-work package
  };
}

function toNumber(v: unknown): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function useAttendanceForDate(
  siteId: string,
  date: string,
  options?: { enabled?: boolean },
) {
  const supabase = createClient();
  return useQuery<AttendanceForDateData>({
    queryKey: ["inspect-attendance-date", siteId, date],
    enabled: Boolean(siteId && date) && (options?.enabled ?? true),
    staleTime: 60_000,
    queryFn: async ({ signal }): Promise<AttendanceForDateData> => {
      // Diagnostics: this query has a recurring "stuck on skeleton" bug
      // (see commit 716af8d). Logs are tagged so we can grep the console
      // when it next reproduces — remove once root cause is identified.
      const t0 = Date.now();
      const visibility =
        typeof document !== "undefined" ? document.visibilityState : "n/a";
      const online =
        typeof navigator !== "undefined" ? navigator.onLine : true;
      const tag = `[diag inspect-attendance-date ${date}]`;
      console.warn(`${tag} start`, { visibility, online });

      try {
        // RPC returns a single jsonb row; supabase-js wraps that in `data`.
        // .abortSignal(signal) lets React Query actually cancel the underlying
        // fetch when the observer unmounts (avoids zombie requests piling up).
        const { data, error } = await withTimeout(
          Promise.resolve(
            (supabase as any)
              .rpc("get_attendance_for_date", {
                p_site_id: siteId,
                p_date: date,
              })
              .abortSignal(signal)
          ),
          PER_DAY_TIMEOUT_MS,
          `Attendance-for-date query timed out after ${PER_DAY_TIMEOUT_MS / 1000}s.`,
        );
        const ms = Date.now() - t0;
        if (error) {
          console.warn(`${tag} rpc-error +${ms}ms`, error);
          throw error;
        }
        console.warn(`${tag} ok +${ms}ms`);
        const r: any = data || {};
        const parseTaskWorkId = (v: unknown): string | null =>
          typeof v === "string" && v.length > 0 ? v : null;
        const parseTaskWorkTitle = (v: unknown): string | null =>
          typeof v === "string" && v.length > 0 ? v : null;
        const dailyLaborers: AttendanceLaborerRow[] = (
          r.daily_laborers ?? []
        ).map((l: any) => ({
          id: String(l.id),
          name: String(l.name ?? "").trim(),
          role: String(l.role ?? ""),
          fullDay: Boolean(l.full_day),
          amount: toNumber(l.amount),
          isOverridden: Boolean(l.is_overridden),
          overrideReason:
            typeof l.override_reason === "string" && l.override_reason.length > 0
              ? l.override_reason
              : null,
          laborerId: l.laborer_id ? String(l.laborer_id) : null,
          laborerType:
            typeof l.laborer_type === "string" && l.laborer_type.length > 0
              ? l.laborer_type
              : null,
          taskWorkPackageId: parseTaskWorkId(l.task_work_package_id),
          taskWorkTitle: parseTaskWorkTitle(l.task_work_title),
          subcontractId: l.subcontract_id ? String(l.subcontract_id) : null,
          subcontractTitle:
            typeof l.subcontract_title === "string" && l.subcontract_title.length > 0
              ? l.subcontract_title
              : null,
          tradeName:
            typeof l.trade_name === "string" && l.trade_name.length > 0
              ? l.trade_name
              : null,
          isTradeContract:
            !l.task_work_package_id &&
            typeof l.trade_name === "string" &&
            l.trade_name.length > 0 &&
            l.trade_name !== "Civil",
        }));
        // Tagged rows (any laborer_type) go to the taskWork bucket — they are
        // paid via the package, never in a salary settlement. Untagged rows
        // split company (contract) vs daily as before.
        const contractBucket: AttendanceLaborerRow[] = [];
        const dailyBucket: AttendanceLaborerRow[] = [];
        const taskWorkBucket: AttendanceLaborerRow[] = [];
        const tradeContractBucket: AttendanceLaborerRow[] = [];
        for (const lab of dailyLaborers) {
          if (lab.taskWorkPackageId) taskWorkBucket.push(lab);
          else if (lab.isTradeContract) tradeContractBucket.push(lab);
          else if (lab.laborerType === "contract") contractBucket.push(lab);
          else dailyBucket.push(lab);
        }
        const marketLaborers: AttendanceMarketRow[] = (
          r.market_laborers ?? []
        ).map((m: any) => ({
          id: String(m.id),
          role: String(m.role ?? ""),
          count: toNumber(m.count),
          amount: toNumber(m.amount),
          taskWorkPackageId: parseTaskWorkId(m.task_work_package_id),
          taskWorkTitle: parseTaskWorkTitle(m.task_work_title),
        }));
        const marketBucket: AttendanceMarketRow[] = [];
        const marketTaskWorkBucket: AttendanceMarketRow[] = [];
        for (const m of marketLaborers) {
          if (m.taskWorkPackageId) marketTaskWorkBucket.push(m);
          else marketBucket.push(m);
        }
        return {
          dailyTotal: toNumber(r.daily_total),
          marketTotal: toNumber(r.market_total),
          teaShopTotal: toNumber(r.tea_shop_total),
          dailyLaborers,
          dailyLaborersByType: {
            daily: dailyBucket,
            contract: contractBucket,
            taskWork: taskWorkBucket,
            tradeContract: tradeContractBucket,
          },
          marketLaborers,
          marketLaborersByType: {
            market: marketBucket,
            taskWork: marketTaskWorkBucket,
          },
        };
      } catch (err) {
        const ms = Date.now() - t0;
        console.warn(`${tag} threw +${ms}ms`, err);
        throw err;
      }
    },
  });
}
