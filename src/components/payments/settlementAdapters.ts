/**
 * settlementAdapters
 *
 * Translates an `InspectEntity` (the lightweight identity used by the
 * InspectPane and PaymentsLedger) into the heavier input shapes expected
 * by the existing settlement dialogs:
 *
 *   - `DailySettlementDialog` expects `DateSummaryForSettlement`
 *     (`{ date, records: LaborerRecord[], marketLaborers: MarketLaborerRecord[],
 *        pendingCount, pendingAmount }`).
 *
 *   - `WeeklySettlementDialog` expects `WeeklySummaryForSettlement`
 *     (`{ weekStart, weekEnd, weekLabel, totalLaborers, totalWorkDays,
 *        pendingDailySalary, pendingContractSalary, pendingMarketSalary,
 *        teaShopExpenses, totalPending, contractLaborerIds }`).
 *
 * **Status:** The two display hooks available today
 * (`useAttendanceForDate`, `useLaborerWeek` -- both backed by the
 * `get_attendance_for_date` / `get_laborer_week_breakdown` RPCs added in
 * `20260426120000_add_inspect_pane_rpcs.sql`) intentionally return
 * pre-aggregated, view-only fields:
 *
 *   - daily_laborers row exposes `id, name, role, full_day, amount`.
 *     Missing for settlement: `laborer_id`, `laborer_type`
 *     (daily_wage vs contract), `is_paid`.
 *   - market_laborers row exposes `id, role, count, amount`.
 *     Missing for settlement: `originalDbId` (the actual
 *     market_laborer_attendance.id needed by `processSettlement`),
 *     `isPaid`.
 *   - laborer-week response has totals + 7-day strip + days-not-worked.
 *     Missing for settlement: pending split by daily / contract / market,
 *     teaShopExpenses, totalLaborers, totalWorkDays, contractLaborerIds.
 *
 * The right fix is either (a) a new settlement-payload RPC that returns
 * record-level rows including `is_paid` flags, or (b) reuse of the data
 * loading already done in `attendance-content.tsx`'s `processServerData`
 * pipeline. Both are out of scope for Task 3.6 (page rewrite) and are
 * tracked for a follow-up.
 *
 * Until then these adapters throw a clear "not implemented" error so the
 * caller is forced to handle the gap explicitly. The page-level handler
 * intercepts the Settle click and routes the user to /site/attendance
 * where the existing settle flow already has the full data shape.
 */

import type { InspectEntity } from "@/components/common/InspectPane";
import type { AttendanceForDateData } from "@/hooks/queries/useAttendanceForDate";
import type { LaborerWeekData } from "@/hooks/queries/useLaborerWeek";

// --- Daily ----------------------------------------------------------------

export interface DateSummaryAdapterOutput {
  date: string;
  records: Array<{
    id: string;
    laborer_id: string;
    laborer_name: string;
    laborer_type: string;
    daily_earnings: number;
    is_paid: boolean;
  }>;
  marketLaborers: Array<{
    id: string;
    originalDbId: string;
    roleName: string;
    dailyEarnings: number;
    isPaid: boolean;
  }>;
  pendingCount: number;
  pendingAmount: number;
}

export class SettlementAdapterUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettlementAdapterUnavailableError";
  }
}

export function entityToDateSummary(
  entity: Extract<InspectEntity, { kind: "daily-date" }>,
  _data: AttendanceForDateData,
): DateSummaryAdapterOutput {
  // See file header. The display hook does not return is_paid /
  // laborer_id / laborer_type, so we cannot legitimately construct the
  // settlement payload. The caller must redirect to /site/attendance for
  // the dialog flow until a settlement-payload RPC exists.
  throw new SettlementAdapterUnavailableError(
    `entityToDateSummary: cannot construct DateSummaryForSettlement for ${entity.date} -- the get_attendance_for_date RPC is view-only and lacks per-record is_paid / laborer_id / laborer_type fields. Settle this date from /site/attendance until a settlement-payload RPC ships.`,
  );
}

// --- Weekly ---------------------------------------------------------------

export interface WeeklySummaryAdapterOutput {
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  totalLaborers: number;
  totalWorkDays: number;
  pendingDailySalary: number;
  pendingContractSalary: number;
  pendingMarketSalary: number;
  teaShopExpenses: number;
  totalPending: number;
  contractLaborerIds: string[];
}

export function entityToWeeklySummary(
  entity: Extract<InspectEntity, { kind: "weekly-week" }>,
  _data: LaborerWeekData,
): WeeklySummaryAdapterOutput {
  throw new SettlementAdapterUnavailableError(
    `entityToWeeklySummary: cannot construct WeeklySummaryForSettlement for laborer ${entity.laborerId} week ${entity.weekStart} -- the get_laborer_week_breakdown RPC is view-only and lacks pending splits by category, tea-shop totals, and the contract-laborer roster needed by WeeklySettlementDialog. Settle this week from /site/attendance until a settlement-payload RPC ships.`,
  );
}
