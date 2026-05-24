import { createClient } from "@/lib/supabase/server";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";
import type { PaymentSummaryData, DailyPaymentRecord, DateGroup, DateGroupSummary } from "@/types/payment.types";

dayjs.extend(isBetween);

/**
 * Raw payment data fetched from the server.
 * Complex processing (grouping, mapping) happens client-side.
 */
export interface PaymentPageData {
  dailyRecords: any[];
  marketRecords: any[];
  summaryData: PaymentSummaryData;
  subcontracts: { id: string; title: string; status: string }[];
  engineers: { id: string; name: string; email: string; avatar_url: string | null }[];
  serverDateRange: {
    from: string;
    to: string;
  };
}

/**
 * Fetch payment page data on the server.
 * Returns raw data that will be processed client-side.
 *
 * @param siteId - The site ID to fetch data for
 * @param dateFrom - Optional start date (defaults to 30 days ago)
 * @param dateTo - Optional end date (defaults to today)
 * @param isAllTime - If true, fetch all records regardless of date
 */
export async function getPaymentPageData(
  siteId: string,
  dateFrom?: string,
  dateTo?: string,
  isAllTime: boolean = false
): Promise<PaymentPageData> {
  const supabase = await createClient();

  // Default date range: last 30 days
  const defaultDateFrom = dateFrom || dayjs().subtract(30, "days").format("YYYY-MM-DD");
  const defaultDateTo = dateTo || dayjs().format("YYYY-MM-DD");

  // Build queries with optional date filters
  let dailyQuery = supabase
    .from("daily_attendance")
    .select(
      `
      id, date, laborer_id, daily_earnings, is_paid, paid_via, payment_date, payment_mode,
      engineer_transaction_id, payment_proof_url, payment_notes, subcontract_id, expense_id,
      payer_source, payer_name, settlement_group_id,
      laborers!inner(
        id, name, laborer_type,
        labor_categories(name),
        labor_roles(name)
      ),
      subcontracts(title),
      site_engineer_transactions(
        id, proof_url, settlement_proof_url, settlement_status,
        transaction_date, confirmed_at, payer_source_split
      ),
      settlement_groups(id, settlement_reference, is_cancelled, payer_source_split)
    `
    )
    .eq("site_id", siteId)
    .neq("laborers.laborer_type", "contract");

  let marketQuery = supabase
    .from("market_laborer_attendance")
    .select(
      `
      id, date, role_id, count, total_cost, is_paid, paid_via, payment_date, payment_mode,
      engineer_transaction_id, payment_proof_url, payment_notes, expense_id,
      payer_source, payer_name, settlement_group_id,
      subcontract_id,
      labor_roles(name),
      site_engineer_transactions(
        id, proof_url, settlement_proof_url, settlement_status,
        transaction_date, confirmed_at, payer_source_split
      ),
      subcontracts(id, title),
      settlement_groups(id, settlement_reference, is_cancelled, payer_source_split),
      expenses(contract_id, subcontracts(id, title))
    `
    )
    .eq("site_id", siteId);

  // Apply date filters only if not "All Time"
  if (!isAllTime) {
    dailyQuery = dailyQuery.gte("date", defaultDateFrom).lte("date", defaultDateTo);
    marketQuery = marketQuery.gte("date", defaultDateFrom).lte("date", defaultDateTo);
  }

  // Fetch all data in parallel
  const [dailyResult, marketResult, subcontractsResult, engineersResult] = await Promise.all([
    dailyQuery.order("date", { ascending: false }),
    marketQuery.order("date", { ascending: false }),
    // Active subcontracts for linking
    supabase
      .from("subcontracts")
      .select("id, title, status")
      .eq("site_id", siteId)
      .in("status", ["active", "on_hold"])
      .order("title"),
    // Site engineers for engineer wallet payments
    supabase
      .from("users")
      .select("id, name, email, avatar_url")
      .eq("role", "site_engineer")
      .eq("status", "active")
      .order("name"),
  ]);

  const dailyRecords = dailyResult.data || [];
  const marketRecords = marketResult.data || [];

  // Calculate summary data server-side
  const summaryData = calculateSummary(dailyRecords, marketRecords);

  return {
    dailyRecords,
    marketRecords,
    summaryData,
    subcontracts: subcontractsResult.data || [],
    engineers: engineersResult.data || [],
    serverDateRange: {
      from: isAllTime ? "2000-01-01" : defaultDateFrom,
      to: defaultDateTo,
    },
  };
}

/**
 * Calculate payment summary statistics
 * Counts are based on settlement groups, not individual laborer records
 */
function calculateSummary(dailyRecords: any[], marketRecords: any[]): PaymentSummaryData {
  // Daily/Market Pending (not paid, not sent to engineer)
  const pendingDailyRecords = dailyRecords.filter((r) => !r.is_paid && r.paid_via !== "engineer_wallet");
  const pendingMarketRecords = marketRecords.filter((r) => !r.is_paid && r.paid_via !== "engineer_wallet");
  const dailyMarketPending =
    pendingDailyRecords.reduce((sum, r) => sum + (r.daily_earnings || 0), 0) +
    pendingMarketRecords.reduce((sum, r) => sum + (r.total_cost || 0), 0);

  // Count unique dates for pending (no settlement groups yet)
  const pendingDates = new Set([
    ...pendingDailyRecords.map((r) => r.date),
    ...pendingMarketRecords.map((r) => r.date),
  ]);
  const dailyMarketPendingCount = pendingDates.size;

  // Daily/Market Sent to Engineer (not paid, via engineer wallet)
  const sentDailyRecords = dailyRecords.filter((r) => !r.is_paid && r.paid_via === "engineer_wallet");
  const sentMarketRecords = marketRecords.filter((r) => !r.is_paid && r.paid_via === "engineer_wallet");
  const dailyMarketSentToEngineer =
    sentDailyRecords.reduce((sum, r) => sum + (r.daily_earnings || 0), 0) +
    sentMarketRecords.reduce((sum, r) => sum + (r.total_cost || 0), 0);

  // Count unique settlement groups for sent to engineer (fallback to date for legacy)
  const sentSettlementGroups = new Set([
    ...sentDailyRecords.filter((r) => r.settlement_group_id).map((r) => r.settlement_group_id),
    ...sentMarketRecords.filter((r) => r.settlement_group_id).map((r) => r.settlement_group_id),
    ...sentDailyRecords.filter((r) => !r.settlement_group_id).map((r) => `legacy-${r.date}`),
    ...sentMarketRecords.filter((r) => !r.settlement_group_id).map((r) => `legacy-${r.date}`),
  ]);
  const dailyMarketSentToEngineerCount = sentSettlementGroups.size;

  // Daily/Market Paid
  const paidDailyRecords = dailyRecords.filter((r) => r.is_paid);
  const paidMarketRecords = marketRecords.filter((r) => r.is_paid);
  const dailyMarketPaid =
    paidDailyRecords.reduce((sum, r) => sum + (r.daily_earnings || 0), 0) +
    paidMarketRecords.reduce((sum, r) => sum + (r.total_cost || 0), 0);

  // Count unique settlement groups for paid (fallback to date for legacy)
  const paidSettlementGroups = new Set([
    ...paidDailyRecords.filter((r) => r.settlement_group_id).map((r) => r.settlement_group_id),
    ...paidMarketRecords.filter((r) => r.settlement_group_id).map((r) => r.settlement_group_id),
    ...paidDailyRecords.filter((r) => !r.settlement_group_id).map((r) => `legacy-${r.date}`),
    ...paidMarketRecords.filter((r) => !r.settlement_group_id).map((r) => `legacy-${r.date}`),
  ]);
  const dailyMarketPaidCount = paidSettlementGroups.size;

  // Group by subcontract
  const subcontractTotals = new Map<string, { title: string; paid: number; due: number }>();

  dailyRecords.forEach((r) => {
    if (r.subcontract_id) {
      const existing = subcontractTotals.get(r.subcontract_id) || {
        title: r.subcontracts?.title || "Unknown",
        paid: 0,
        due: 0,
      };
      if (r.is_paid) {
        existing.paid += r.daily_earnings || 0;
      } else {
        existing.due += r.daily_earnings || 0;
      }
      subcontractTotals.set(r.subcontract_id, existing);
    }
  });

  const bySubcontract = Array.from(subcontractTotals.entries()).map(([id, data]) => ({
    subcontractId: id,
    subcontractTitle: data.title,
    totalPaid: data.paid,
    totalDue: data.due,
  }));

  // Unlinked (no subcontract) - counts settlement groups without subcontract link
  const unlinkedDailyRecords = dailyRecords.filter((r) => !r.subcontract_id);
  const unlinkedMarketRecords = marketRecords.filter((r) => !r.subcontract_id && !r.expenses?.contract_id);
  const unlinkedTotal =
    unlinkedDailyRecords.reduce((sum, r) => sum + (r.daily_earnings || 0), 0) +
    unlinkedMarketRecords.reduce((sum, r) => sum + (r.total_cost || 0), 0);

  // Count unique settlement groups for unlinked records (fallback to date for legacy)
  const unlinkedSettlementGroups = new Set([
    ...unlinkedDailyRecords.filter((r) => r.settlement_group_id).map((r) => r.settlement_group_id),
    ...unlinkedMarketRecords.filter((r) => r.settlement_group_id).map((r) => r.settlement_group_id),
    ...unlinkedDailyRecords.filter((r) => !r.settlement_group_id).map((r) => `legacy-${r.date}`),
    ...unlinkedMarketRecords.filter((r) => !r.settlement_group_id).map((r) => `legacy-${r.date}`),
  ]);
  const unlinkedCount = unlinkedSettlementGroups.size;

  return {
    dailyMarketPending,
    dailyMarketPendingCount,
    dailyMarketSentToEngineer,
    dailyMarketSentToEngineerCount,
    dailyMarketPaid,
    dailyMarketPaidCount,
    contractWeeklyDue: 0, // Calculated separately for contract laborers
    contractWeeklyDueLaborerCount: 0,
    contractWeeklyPaid: 0,
    bySubcontract,
    unlinkedTotal,
    unlinkedCount,
  };
}

/**
 * Transform raw records into DailyPaymentRecord format
 */
export function transformToDailyPaymentRecords(
  dailyRecords: any[],
  marketRecords: any[]
): DailyPaymentRecord[] {
  const records: DailyPaymentRecord[] = [];

  // Transform daily attendance records
  dailyRecords.forEach((r) => {
    const tx = r.site_engineer_transactions;
    records.push({
      id: `daily-${r.id}`,
      sourceType: "daily",
      sourceId: r.id,
      date: r.date,
      laborerId: r.laborer_id,
      laborerName: r.laborers?.name || "Unknown",
      laborerType: "daily",
      category: r.laborers?.labor_categories?.name || undefined,
      role: r.laborers?.labor_roles?.name || undefined,
      amount: r.daily_earnings || 0,
      isPaid: r.is_paid || false,
      paidVia: r.paid_via || null,
      paymentDate: r.payment_date || null,
      paymentMode: r.payment_mode || null,
      engineerTransactionId: r.engineer_transaction_id || null,
      engineerUserId: tx?.user_id || null,
      proofUrl: r.payment_proof_url || null,
      paymentNotes: r.payment_notes || null,
      settlementStatus: tx?.settlement_status || null,
      companyProofUrl: tx?.proof_url || null,
      engineerProofUrl: tx?.settlement_proof_url || null,
      transactionDate: tx?.transaction_date || null,
      settledDate: tx?.settled_date || null,
      confirmedAt: tx?.confirmed_at || null,
      settlementMode: tx?.settlement_mode || null,
      cashReason: tx?.notes || null,
      subcontractId: r.subcontract_id || null,
      subcontractTitle: r.subcontracts?.title || null,
      expenseId: r.expense_id || null,
      moneySource: tx?.money_source || r.payer_source || null,
      moneySourceName: tx?.money_source_name || r.payer_name || null,
      payerSourceSplit:
        r.settlement_groups?.payer_source_split ?? tx?.payer_source_split ?? null,
      settlementGroupId: r.settlement_group_id || null,
      settlementReference: r.settlement_groups?.settlement_reference || null,
    });
  });

  // Transform market laborer records
  marketRecords.forEach((r) => {
    const tx = r.site_engineer_transactions;
    records.push({
      id: `market-${r.id}`,
      sourceType: "market",
      sourceId: r.id,
      date: r.date,
      laborerId: null,
      laborerName: r.labor_roles?.name || "Market Labor",
      laborerType: "market",
      role: r.labor_roles?.name || undefined,
      count: r.count || 1,
      amount: r.total_cost || 0,
      isPaid: r.is_paid || false,
      paidVia: r.paid_via || null,
      paymentDate: r.payment_date || null,
      paymentMode: r.payment_mode || null,
      engineerTransactionId: r.engineer_transaction_id || null,
      engineerUserId: tx?.user_id || null,
      proofUrl: r.payment_proof_url || null,
      paymentNotes: r.payment_notes || null,
      settlementStatus: tx?.settlement_status || null,
      companyProofUrl: tx?.proof_url || null,
      engineerProofUrl: tx?.settlement_proof_url || null,
      transactionDate: tx?.transaction_date || null,
      settledDate: tx?.settled_date || null,
      confirmedAt: tx?.confirmed_at || null,
      settlementMode: tx?.settlement_mode || null,
      cashReason: tx?.notes || null,
      subcontractId: r.subcontract_id || r.expenses?.contract_id || null,
      subcontractTitle: r.subcontracts?.title || r.expenses?.subcontracts?.title || null,
      expenseId: r.expense_id || null,
      moneySource: tx?.money_source || r.payer_source || null,
      moneySourceName: tx?.money_source_name || r.payer_name || null,
      payerSourceSplit:
        r.settlement_groups?.payer_source_split ?? tx?.payer_source_split ?? null,
      settlementGroupId: r.settlement_group_id || null,
      settlementReference: r.settlement_groups?.settlement_reference || null,
    });
  });

  return records;
}

/**
 * Group payment records by date for display
 */
export function groupPaymentsByDate(records: DailyPaymentRecord[]): DateGroup[] {
  const dateMap = new Map<string, { daily: DailyPaymentRecord[]; market: DailyPaymentRecord[] }>();

  records.forEach((record) => {
    const date = record.date;
    if (!dateMap.has(date)) {
      dateMap.set(date, { daily: [], market: [] });
    }
    const group = dateMap.get(date)!;
    if (record.laborerType === "market") {
      group.market.push(record);
    } else {
      group.daily.push(record);
    }
  });

  const dateGroups: DateGroup[] = [];

  dateMap.forEach((group, date) => {
    const dailyRecords = group.daily;
    const marketRecords = group.market;

    const summary: DateGroupSummary = {
      dailyCount: dailyRecords.length,
      dailyTotal: dailyRecords.reduce((sum, r) => sum + r.amount, 0),
      dailyPending: dailyRecords.filter((r) => !r.isPaid && r.paidVia !== "engineer_wallet").reduce((sum, r) => sum + r.amount, 0),
      dailyPaid: dailyRecords.filter((r) => r.isPaid).reduce((sum, r) => sum + r.amount, 0),
      dailySentToEngineer: dailyRecords.filter((r) => !r.isPaid && r.paidVia === "engineer_wallet").reduce((sum, r) => sum + r.amount, 0),
      marketCount: marketRecords.length,
      marketTotal: marketRecords.reduce((sum, r) => sum + r.amount, 0),
      marketPending: marketRecords.filter((r) => !r.isPaid && r.paidVia !== "engineer_wallet").reduce((sum, r) => sum + r.amount, 0),
      marketPaid: marketRecords.filter((r) => r.isPaid).reduce((sum, r) => sum + r.amount, 0),
      marketSentToEngineer: marketRecords.filter((r) => !r.isPaid && r.paidVia === "engineer_wallet").reduce((sum, r) => sum + r.amount, 0),
    };

    dateGroups.push({
      date,
      dateLabel: dayjs(date).format("MMM DD, YYYY"),
      dayName: dayjs(date).format("dddd"),
      dailyRecords,
      marketRecords,
      summary,
      isExpanded: false,
    });
  });

  // Sort by date descending (newest first)
  dateGroups.sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf());

  return dateGroups;
}

/**
 * Calculate weekly summary for a date range (used in weekly settlement strip)
 */
export interface WeeklyPaymentSummary {
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  dailyLaborPending: number;
  dailyLaborCount: number;
  contractLaborPending: number;
  contractLaborCount: number;
  marketLaborPending: number;
  marketLaborCount: number;
  totalPending: number;
  totalCount: number;
  isCurrentWeek: boolean;
}

export function calculateWeeklyPaymentSummary(
  records: DailyPaymentRecord[],
  weekStart: string,
  weekEnd: string
): WeeklyPaymentSummary {
  const weekRecords = records.filter(
    (r) => r.date >= weekStart && r.date <= weekEnd && !r.isPaid
  );

  const dailyRecords = weekRecords.filter((r) => r.laborerType === "daily");
  const marketRecords = weekRecords.filter((r) => r.laborerType === "market");
  const contractRecords = weekRecords.filter((r) => r.laborerType === "contract");

  const dailyLaborPending = dailyRecords.reduce((sum, r) => sum + r.amount, 0);
  const marketLaborPending = marketRecords.reduce((sum, r) => sum + r.amount, 0);
  const contractLaborPending = contractRecords.reduce((sum, r) => sum + r.amount, 0);

  const isCurrentWeek = dayjs().isBetween(weekStart, weekEnd, "day", "[]");

  return {
    weekStart,
    weekEnd,
    weekLabel: isCurrentWeek
      ? `This Week: ${dayjs(weekStart).format("MMM D")} - ${dayjs(weekEnd).format("MMM D, YYYY")}`
      : `${dayjs(weekStart).format("MMM D")} - ${dayjs(weekEnd).format("MMM D, YYYY")}`,
    dailyLaborPending,
    dailyLaborCount: dailyRecords.length,
    contractLaborPending,
    contractLaborCount: contractRecords.length,
    marketLaborPending,
    marketLaborCount: marketRecords.length,
    totalPending: dailyLaborPending + marketLaborPending + contractLaborPending,
    totalCount: weekRecords.length,
    isCurrentWeek,
  };
}
