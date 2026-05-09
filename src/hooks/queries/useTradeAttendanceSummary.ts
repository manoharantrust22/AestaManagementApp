import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { wrapQueryFn } from "@/lib/utils/timeout";
import dayjs from "dayjs";

/**
 * Per-contract attendance + economics aggregator. Powers the TradeAttendanceKpiStrip
 * (Slice E) — supplies KPI tiles for the supervisor's daily-entry surface on
 * /site/attendance when a non-civil chip is selected.
 *
 * Returns numbers for ALL three labor-tracking modes; the strip picks which
 * subset to render based on contract.laborTrackingMode.
 */
export interface TradeAttendanceSummary {
  /** Lump-sum quote on the contract (₹). */
  quotedAmount: number;
  /** Total ₹ paid out to or on behalf of this contract:
   *  subcontract_payments + settlement_groups + misc_expenses extras. */
  amountPaid: number;
  /** Breakdown of amountPaid for tooltips. */
  amountPaidBreakdown: {
    payments: number;
    settlements: number;
    extras: number;
  };
  /** Computed labor value (units × rates) — only meaningful for headcount mode. */
  laborDoneHeadcount: number;
  /** Computed labor value from per-laborer attendance — for detailed mode. */
  laborDoneDetailed: number;
  /** Distinct dates with at least one headcount entry. */
  daysHeadcountEntered: number;
  /** Distinct dates with at least one daily_attendance row (detailed mode). */
  daysDetailedEntered: number;
  /** Distinct dates with at least one subcontract_payments row (mesthri-only signal). */
  daysPaymentsRecorded: number;
  /** ISO date of most recent payment (any source) or null. */
  lastPaymentDate: string | null;
  /** Average payment amount across all payment events. */
  avgPaymentAmount: number;
}

interface RawReconciliationRow {
  quoted_amount: number | string | null;
  amount_paid_subcontract_payments: number | string | null;
  amount_paid_settlements: number | string | null;
  implied_labor_value_headcount: number | string | null;
  implied_labor_value_detailed: number | string | null;
}

const num = (v: number | string | null | undefined): number =>
  v == null ? 0 : Number(v);

export function useTradeAttendanceSummary(contractId: string | undefined) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["trade-attendance-summary", contractId],
    enabled: !!contractId,
    staleTime: 60 * 1000,
    queryFn: wrapQueryFn(async (): Promise<TradeAttendanceSummary> => {
      if (!contractId) {
        return emptySummary();
      }
      const sb = supabase as any;

      const [reconRes, headcountRes, attendanceRes, paymentsRes, extrasRes] =
        await Promise.all([
          // Reconciliation view — gives us quoted, paid (payments + settlements),
          // and the two implied labor totals in one read.
          sb
            .from("v_subcontract_reconciliation")
            .select(
              "quoted_amount, amount_paid_subcontract_payments, amount_paid_settlements, implied_labor_value_headcount, implied_labor_value_detailed"
            )
            .eq("subcontract_id", contractId)
            .maybeSingle(),
          // Distinct date count from headcount entries.
          sb
            .from("subcontract_headcount_attendance")
            .select("attendance_date")
            .eq("subcontract_id", contractId),
          // Distinct date count from daily_attendance.
          sb
            .from("daily_attendance")
            .select("date")
            .eq("subcontract_id", contractId)
            .eq("is_deleted", false),
          // Payment events (date + amount) for last/avg + days-paid count.
          sb
            .from("subcontract_payments")
            .select("payment_date, amount")
            .eq("contract_id", contractId)
            .eq("is_deleted", false),
          // Extras (misc_expenses) for amount_paid total.
          sb
            .from("misc_expenses")
            .select("amount, date")
            .eq("subcontract_id", contractId)
            .eq("is_cancelled", false),
        ]);

      if (reconRes.error) throw reconRes.error;
      if (headcountRes.error) throw headcountRes.error;
      if (attendanceRes.error) throw attendanceRes.error;
      if (paymentsRes.error) throw paymentsRes.error;
      if (extrasRes.error) throw extrasRes.error;

      const recon = (reconRes.data ?? null) as RawReconciliationRow | null;

      const quoted = num(recon?.quoted_amount);
      const paymentsTotal = num(recon?.amount_paid_subcontract_payments);
      const settlementsTotal = num(recon?.amount_paid_settlements);
      const extrasTotal = ((extrasRes.data ?? []) as Array<{ amount: number | string }>).reduce(
        (s, r) => s + num(r.amount),
        0
      );
      const amountPaid = paymentsTotal + settlementsTotal + extrasTotal;

      const headcountDates = new Set<string>(
        ((headcountRes.data ?? []) as Array<{ attendance_date: string }>).map(
          (r) => r.attendance_date
        )
      );
      const detailedDates = new Set<string>(
        ((attendanceRes.data ?? []) as Array<{ date: string }>).map((r) => r.date)
      );
      const paymentDates = new Set<string>(
        ((paymentsRes.data ?? []) as Array<{ payment_date: string }>).map(
          (r) => r.payment_date
        )
      );

      const payments = (paymentsRes.data ?? []) as Array<{
        payment_date: string;
        amount: number | string;
      }>;
      const lastPaymentDate =
        payments.length === 0
          ? null
          : payments.reduce<string | null>((latest, p) => {
              return latest && latest > p.payment_date ? latest : p.payment_date;
            }, null);
      const avgPaymentAmount =
        payments.length === 0
          ? 0
          : payments.reduce((s, p) => s + num(p.amount), 0) / payments.length;

      return {
        quotedAmount: quoted,
        amountPaid,
        amountPaidBreakdown: {
          payments: paymentsTotal,
          settlements: settlementsTotal,
          extras: extrasTotal,
        },
        laborDoneHeadcount: num(recon?.implied_labor_value_headcount),
        laborDoneDetailed: num(recon?.implied_labor_value_detailed),
        daysHeadcountEntered: headcountDates.size,
        daysDetailedEntered: detailedDates.size,
        daysPaymentsRecorded: paymentDates.size,
        lastPaymentDate,
        avgPaymentAmount,
      };
    }, { operationName: "useTradeAttendanceSummary" }),
  });
}

function emptySummary(): TradeAttendanceSummary {
  return {
    quotedAmount: 0,
    amountPaid: 0,
    amountPaidBreakdown: { payments: 0, settlements: 0, extras: 0 },
    laborDoneHeadcount: 0,
    laborDoneDetailed: 0,
    daysHeadcountEntered: 0,
    daysDetailedEntered: 0,
    daysPaymentsRecorded: 0,
    lastPaymentDate: null,
    avgPaymentAmount: 0,
  };
}

/** Compute pending action count: weekdays in the current month with no
 *  headcount entry yet (excluding today and future). For headcount mode. */
export function pendingHeadcountDayCount(
  enteredDates: Set<string>,
  monthStart?: string
): number {
  const start = monthStart ? dayjs(monthStart) : dayjs().startOf("month");
  const today = dayjs();
  let pending = 0;
  let cursor = start;
  while (cursor.isBefore(today, "day")) {
    const ds = cursor.format("YYYY-MM-DD");
    if (!enteredDates.has(ds)) pending++;
    cursor = cursor.add(1, "day");
  }
  return pending;
}
