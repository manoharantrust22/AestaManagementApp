"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  CircularProgress,
  Alert,
  Typography,
  Chip,
  LinearProgress,
  useTheme,
  alpha,
  Tooltip,
} from "@mui/material";
import {
  Refresh as RefreshIcon,
  Payment as PaymentIcon,
  History as HistoryIcon,
  Receipt as ReceiptIcon,
} from "@mui/icons-material";
import { createClient } from "@/lib/supabase/client";
import { useSite } from "@/contexts/SiteContext";
import { useAuth } from "@/contexts/AuthContext";
import dayjs from "dayjs";
import DataTable, { type MRT_ColumnDef } from "@/components/common/DataTable";
import PaymentRefDialog from "./PaymentRefDialog";
import SettlementRefDetailDialog from "./SettlementRefDetailDialog";
import ContractPaymentHistoryDialog from "./ContractPaymentHistoryDialog";
import ContractSummaryDashboardV2 from "./ContractSummaryDashboardV2";
import ContractPaymentRecordDialog from "./ContractPaymentRecordDialog";
import WeekSettlementsDialogV3 from "./WeekSettlementsDialogV3";
import ContractPaymentEditDialog from "./ContractPaymentEditDialog";
import ContractSettlementEditDialog from "./ContractSettlementEditDialog";
import DeleteSettlementConfirmDialog from "./DeleteSettlementConfirmDialog";
import DateTransactionDetailPanel from "./DateTransactionDetailPanel";
import type { DateWiseSettlement } from "@/types/payment.types";
import type {
  PaymentStatus,
  PaymentSummaryData,
  ContractLaborerPaymentView,
  WeekBreakdownEntry,
} from "@/types/payment.types";
import {
  getPaymentStatusColor,
  getPaymentStatusLabel,
} from "@/types/payment.types";
import { hasEditPermission } from "@/lib/permissions";
import { supabaseQueryWithTimeout } from "@/lib/utils/supabaseQuery";

interface ContractWeeklyPaymentsTabProps {
  weeksToShow?: number;
  dateFrom?: string;
  dateTo?: string;
  onDataChange?: () => void;
  onSummaryChange?: (summary: PaymentSummaryData) => void;
  highlightRef?: string | null;
}

// Week row data for week-wise view
interface WeekLaborerData {
  laborerId: string;
  laborerName: string;
  laborerRole: string | null;
  teamId: string | null;
  teamName: string | null;
  subcontractId: string | null;
  subcontractTitle: string | null;
  daysWorked: number;
  earned: number;
  paid: number;
  balance: number;
  progress: number;
}

interface WeekRowData {
  id: string;
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  laborerCount: number;
  totalSalary: number;
  totalPaid: number;
  totalDue: number;
  paymentProgress: number;
  status: PaymentStatus;
  laborers: WeekLaborerData[];
  settlementReferences: string[];
  paymentDates: string[]; // Unique payment dates for this week
  transactionCount: number; // Actual count of settlement transactions
}

// Get week boundaries (Sunday to Saturday)
function getWeekBoundaries(date: string): {
  weekStart: string;
  weekEnd: string;
} {
  const d = dayjs(date);
  const dayOfWeek = d.day();
  const weekStart = d.subtract(dayOfWeek, "day").format("YYYY-MM-DD");
  const weekEnd = d.add(6 - dayOfWeek, "day").format("YYYY-MM-DD");
  return { weekStart, weekEnd };
}

// Format currency
function formatCurrency(amount: number): string {
  if (amount >= 100000) {
    return `Rs.${(amount / 100000).toFixed(1)}L`;
  }
  return `Rs.${amount.toLocaleString()}`;
}

export default function ContractWeeklyPaymentsTab({
  weeksToShow = 4,
  dateFrom: propDateFrom,
  dateTo: propDateTo,
  onDataChange,
  onSummaryChange,
  highlightRef,
}: ContractWeeklyPaymentsTabProps) {
  const { selectedSite } = useSite();
  const { userProfile } = useAuth();
  const supabase = createClient();
  const theme = useTheme();

  const canEdit = hasEditPermission(userProfile?.role);

  // State
  const [laborers, setLaborers] = useState<ContractLaborerPaymentView[]>([]);
  const [weekGroups, setWeekGroups] = useState<WeekRowData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Advance tracking state (separate from salary)
  const [totalAdvancesGiven, setTotalAdvancesGiven] = useState(0);
  const [advanceRecordCount, setAdvanceRecordCount] = useState(0);
  const [salaryRecordCount, setSalaryRecordCount] = useState(0);
  const [salarySettlementsTotal, setSalarySettlementsTotal] = useState(0);

  // Auto-scroll refs
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [hasScrolledToHighlight, setHasScrolledToHighlight] = useState(false);

  // Track component mount state to prevent state updates after unmount
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Filters
  const [filterStatus, setFilterStatus] = useState<
    "all" | "pending" | "completed"
  >("all");
  const [filterSubcontract, setFilterSubcontract] = useState<string>("all");
  const [filterTeam, setFilterTeam] = useState<string>("all");
  const [subcontracts, setSubcontracts] = useState<
    { id: string; title: string }[]
  >([]);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);

  // Dialog states
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [refDialogOpen, setRefDialogOpen] = useState(false);
  const [settlementRefDialogOpen, setSettlementRefDialogOpen] = useState(false);
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [weekDetailsDialogOpen, setWeekDetailsDialogOpen] = useState(false);
  const [selectedWeekForDetails, setSelectedWeekForDetails] =
    useState<WeekRowData | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingPaymentDetails, setEditingPaymentDetails] = useState<
    import("@/types/payment.types").PaymentDetails | null
  >(null);

  // New date-wise settlement dialogs
  const [editSettlementDialogOpen, setEditSettlementDialogOpen] =
    useState(false);
  const [deleteSettlementDialogOpen, setDeleteSettlementDialogOpen] =
    useState(false);
  const [selectedSettlement, setSelectedSettlement] =
    useState<DateWiseSettlement | null>(null);

  // Date range
  const dateRange = useMemo(() => {
    if (propDateFrom && propDateTo) {
      return { fromDate: propDateFrom, toDate: propDateTo };
    }
    const today = dayjs();
    const toDate = today.format("YYYY-MM-DD");
    const fromDate = today
      .subtract(weeksToShow, "week")
      .startOf("week")
      .format("YYYY-MM-DD");
    return { fromDate, toDate };
  }, [propDateFrom, propDateTo, weeksToShow]);

  // Fetch data
  const fetchData = useCallback(async () => {
    if (!selectedSite?.id) {
      setLoading(false);
      setError("Please select a site to view contract payments");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { fromDate, toDate } = dateRange;
      const financialYearStart = "2025-04-01"; // FY 2025-26 start

      // Run all independent queries in parallel to avoid sequential timeout accumulation
      const [
        teamsLookupResult,
        attendanceResult,
        paymentsResult,
        allocationsResult,
        contractPaymentsResult,
        subcontractsResult,
        teamsFilterResult,
      ] = await Promise.all([
        // Teams lookup (global)
        supabaseQueryWithTimeout(
          supabase.from("teams").select("id, name"),
          45000
        ),
        // Attendance (heavy query - 90s timeout)
        supabaseQueryWithTimeout(
          supabase
            .from("daily_attendance")
            .select(
              `
              id,
              date,
              laborer_id,
              daily_earnings,
              work_days,
              is_paid,
              payment_id,
              subcontract_id,
              laborers!inner(
                id,
                name,
                laborer_type,
                team_id,
                labor_roles(name)
              ),
              subcontracts(id, title)
            `
            )
            .eq("site_id", selectedSite.id)
            .eq("laborers.laborer_type", "contract")
            .gte("date", financialYearStart)
            .order("date", { ascending: true }),
          90000
        ),
        // Labor payments
        supabaseQueryWithTimeout(
          supabase
            .from("labor_payments")
            .select("*")
            .eq("site_id", selectedSite.id)
            .eq("is_under_contract", true),
          45000
        ),
        // Payment week allocations
        supabaseQueryWithTimeout<any[]>(
          (supabase as any)
            .from("payment_week_allocations")
            .select("*")
            .eq("site_id", selectedSite.id),
          45000
        ),
        // Contract payment settlement IDs
        supabaseQueryWithTimeout(
          supabase
            .from("labor_payments")
            .select("settlement_group_id")
            .eq("site_id", selectedSite.id)
            .eq("is_under_contract", true)
            .not("settlement_group_id", "is", null),
          45000
        ),
        // Subcontracts (filter options)
        supabaseQueryWithTimeout(
          supabase
            .from("subcontracts")
            .select("id, title")
            .eq("site_id", selectedSite.id)
            .in("status", ["active", "on_hold"]),
          45000
        ),
        // Teams (filter options, global)
        supabaseQueryWithTimeout(
          supabase
            .from("teams")
            .select("id, name")
            .eq("status", "active"),
          45000
        ),
      ]);

      if (!isMountedRef.current) return;

      // Extract results
      const { data: teamsLookup, error: teamsLookupError } = teamsLookupResult;
      const { data: allAttendanceData, error: allAttendanceError } = attendanceResult;
      const { data: paymentsData, error: paymentsError } = paymentsResult;
      const { data: allocationsData, error: allocationsError } = allocationsResult;
      const { data: contractPaymentsForIds, error: contractPaymentsError } = contractPaymentsResult;
      const { data: subcontractsData, error: subcontractsError } = subcontractsResult;
      const { data: teamsData, error: teamsError } = teamsFilterResult;

      if (teamsLookupError) console.error("Error fetching teams lookup:", teamsLookupError);
      if (allAttendanceError) throw allAttendanceError;
      if (paymentsError) console.error("Error fetching payments:", paymentsError);
      if (allocationsError) console.error("Error fetching allocations:", allocationsError);
      if (contractPaymentsError) console.error("Error fetching contract payments:", contractPaymentsError);
      if (subcontractsError) console.error("Error fetching subcontracts:", subcontractsError);
      if (teamsError) console.error("Error fetching teams:", teamsError);

      const teamsMap = new Map<string, string>();
      (teamsLookup || []).forEach((t: any) => teamsMap.set(t.id, t.name));

      // Use ALL attendance data (not filtered by date range) so that all weeks
      // from the financial year start are shown in the contract weekly tab
      const attendanceData = allAttendanceData || [];

      // Group by laborer
      const laborerMap = new Map<
        string,
        {
          info: any;
          attendance: any[];
          payments: any[];
          allocations: any[];
        }
      >();

      // Process attendance
      (attendanceData || []).forEach((att: any) => {
        const laborerId = att.laborer_id;
        if (!laborerMap.has(laborerId)) {
          laborerMap.set(laborerId, {
            info: {
              ...att.laborers,
              teamName: att.laborers?.team_id
                ? teamsMap.get(att.laborers.team_id)
                : null,
              subcontractId: att.subcontract_id,
              subcontractTitle: att.subcontracts?.title,
            },
            attendance: [],
            payments: [],
            allocations: [],
          });
        }
        laborerMap.get(laborerId)!.attendance.push(att);
      });

      // Process payments
      (paymentsData || []).forEach((p: any) => {
        if (laborerMap.has(p.laborer_id)) {
          laborerMap.get(p.laborer_id)!.payments.push(p);
        }
      });

      // Process allocations
      (allocationsData || []).forEach((a: any) => {
        if (laborerMap.has(a.laborer_id)) {
          laborerMap.get(a.laborer_id)!.allocations.push(a);
        }
      });

      // Build laborer views
      const laborerViews: ContractLaborerPaymentView[] = [];

      laborerMap.forEach((data, laborerId) => {
        const totalEarned = data.attendance.reduce(
          (sum: number, a: any) => sum + (a.daily_earnings || 0),
          0
        );
        const totalPaid = data.payments.reduce(
          (sum: number, p: any) => sum + (p.amount || 0),
          0
        );
        const outstanding = totalEarned - totalPaid;
        const paymentProgress =
          totalEarned > 0 ? (totalPaid / totalEarned) * 100 : 0;

        // Calculate status
        let status: PaymentStatus = "pending";
        if (outstanding <= 0) {
          status = outstanding < 0 ? "advance" : "completed";
        } else if (totalPaid > 0) {
          status = "partial";
        }

        // Build weekly breakdown using waterfall logic from labor_payments
        // Instead of relying on stored payment_week_allocations, calculate on-the-fly
        const weeklyBreakdown: WeekBreakdownEntry[] = [];
        const weekEarningsMap = new Map<
          string,
          {
            attendance: any[];
            earned: number;
          }
        >();

        // Group attendance by week and calculate earned per week
        data.attendance.forEach((att: any) => {
          const { weekStart } = getWeekBoundaries(att.date);
          if (!weekEarningsMap.has(weekStart)) {
            weekEarningsMap.set(weekStart, { attendance: [], earned: 0 });
          }
          const weekData = weekEarningsMap.get(weekStart)!;
          weekData.attendance.push(att);
          weekData.earned += att.daily_earnings || 0;
        });

        // Convert to array and sort by date (oldest first) for waterfall
        const sortedWeeks = Array.from(weekEarningsMap.entries())
          .map(([weekStart, data]) => ({
            weekStart,
            weekEnd: dayjs(weekStart).add(6, "day").format("YYYY-MM-DD"),
            earned: data.earned,
            daysWorked: data.attendance.length,
            paid: 0, // Will be calculated via waterfall
          }))
          .sort(
            (a, b) =>
              new Date(a.weekStart).getTime() - new Date(b.weekStart).getTime()
          );

        // Apply waterfall allocation: oldest week gets paid first
        // Use totalPaid from labor_payments (already calculated above)
        let remainingPayment = totalPaid;
        for (const week of sortedWeeks) {
          if (remainingPayment <= 0) break;
          const weekAllocation = Math.min(remainingPayment, week.earned);
          week.paid = weekAllocation;
          remainingPayment -= weekAllocation;
        }

        // Build week entries
        for (const week of sortedWeeks) {
          weeklyBreakdown.push({
            weekStart: week.weekStart,
            weekEnd: week.weekEnd,
            weekLabel: `${dayjs(week.weekStart).format("MMM D")} - ${dayjs(
              week.weekEnd
            ).format("MMM D, YYYY")}`,
            earned: week.earned,
            paid: week.paid,
            balance: week.earned - week.paid,
            daysWorked: week.daysWorked,
            isPaid: week.paid >= week.earned,
            allocations: [], // Not using stored allocations anymore
          });
        }

        // Get last payment date
        const lastPayment = data.payments.sort(
          (a: any, b: any) =>
            new Date(b.actual_payment_date).getTime() -
            new Date(a.actual_payment_date).getTime()
        )[0];

        // Collect all payment references from payments for highlighting
        const settlementReferences = data.payments
          .map((p: any) => p.payment_reference)
          .filter(
            (ref: string | null): ref is string => ref != null && ref !== ""
          );

        laborerViews.push({
          laborerId,
          laborerName: data.info.name,
          laborerRole: data.info.labor_roles?.name || null,
          teamId: data.info.team_id,
          teamName: data.info.teamName,
          subcontractId: data.info.subcontractId,
          subcontractTitle: data.info.subcontractTitle,
          totalEarned,
          totalPaid,
          outstanding,
          paymentProgress,
          status,
          lastPaymentDate: lastPayment?.actual_payment_date || null,
          weeklyBreakdown,
          settlementReferences,
        });
      });

      setLaborers(laborerViews);

      // Build week-wise data from laborer views
      const weekDataMap = new Map<
        string,
        {
          laborers: WeekLaborerData[];
          totalSalary: number;
          totalPaid: number;
          settlementRefs: Set<string>;
        }
      >();

      laborerViews.forEach((laborer) => {
        laborer.weeklyBreakdown.forEach((week) => {
          if (!weekDataMap.has(week.weekStart)) {
            weekDataMap.set(week.weekStart, {
              laborers: [],
              totalSalary: 0,
              totalPaid: 0,
              settlementRefs: new Set(),
            });
          }
          const weekData = weekDataMap.get(week.weekStart)!;

          weekData.laborers.push({
            laborerId: laborer.laborerId,
            laborerName: laborer.laborerName,
            laborerRole: laborer.laborerRole,
            teamId: laborer.teamId ?? null,
            teamName: laborer.teamName,
            subcontractId: laborer.subcontractId ?? null,
            subcontractTitle: laborer.subcontractTitle,
            daysWorked: week.daysWorked,
            earned: week.earned,
            paid: week.paid,
            balance: week.balance,
            progress: week.earned > 0 ? (week.paid / week.earned) * 100 : 0,
          });

          weekData.totalSalary += week.earned;
          weekData.totalPaid += week.paid;

          // Add settlement references
          laborer.settlementReferences.forEach((ref) =>
            weekData.settlementRefs.add(ref)
          );
        });
      });

      // Convert map to array
      const weekRows: WeekRowData[] = [];
      weekDataMap.forEach((data, weekStart) => {
        const weekEnd = dayjs(weekStart).add(6, "day").format("YYYY-MM-DD");
        const totalDue = data.totalSalary - data.totalPaid;
        const paymentProgress =
          data.totalSalary > 0 ? (data.totalPaid / data.totalSalary) * 100 : 0;

        let status: PaymentStatus = "pending";
        if (totalDue <= 0) {
          status = totalDue < 0 ? "advance" : "completed";
        } else if (data.totalPaid > 0) {
          status = "partial";
        }

        weekRows.push({
          id: weekStart,
          weekStart,
          weekEnd,
          weekLabel: `${dayjs(weekStart).format("MMM D")} - ${dayjs(
            weekEnd
          ).format("MMM D, YYYY")}`,
          laborerCount: data.laborers.length,
          totalSalary: data.totalSalary,
          totalPaid: data.totalPaid,
          totalDue: Math.max(0, totalDue),
          paymentProgress,
          status,
          laborers: data.laborers,
          settlementReferences: [], // Will be populated from settlement_groups
          paymentDates: [], // Will be populated from settlement_groups
          transactionCount: 0, // Will be populated from settlement_groups
        });
      });

      // contractPaymentsForIds was already fetched in parallel above
      const contractSettlementIds =
        contractPaymentsForIds && contractPaymentsForIds.length > 0
          ? [
              ...new Set(
                contractPaymentsForIds.map((p: any) => p.settlement_group_id)
              ),
            ]
          : [];

      // Step 2: Fetch settlement_groups for contract payments
      // Uses three parallel queries to catch all contract settlements:
      // 1. Settlements linked to contract labor_payments (properly created)
      // 2. Settlements with "Waterfall" in notes (catches orphaned ones)
      // 3. Advance/other/excess settlements (no labor_payments by design)
      const sgSelectFields = "id, settlement_reference, settlement_date, total_amount, week_allocations, payment_type";

      const [waterfallSgResult, otherSgResult] = await Promise.all([
        // Waterfall settlements (covers both linked and orphaned contract salary settlements)
        supabaseQueryWithTimeout<any[]>(
          (supabase as any)
            .from("settlement_groups")
            .select(sgSelectFields)
            .eq("site_id", selectedSite.id)
            .eq("is_cancelled", false)
            .ilike("notes", "%Waterfall%"),
          45000
        ),
        // Advance/other/excess settlements
        supabaseQueryWithTimeout<any[]>(
          (supabase as any)
            .from("settlement_groups")
            .select(sgSelectFields)
            .eq("site_id", selectedSite.id)
            .eq("is_cancelled", false)
            .in("payment_type", ["advance", "other", "excess"]),
          45000
        ),
      ]);

      // Merge results, avoiding duplicates
      const sgMap = new Map<string, any>();
      (waterfallSgResult.data || []).forEach((s: any) => sgMap.set(s.id, s));
      (otherSgResult.data || []).forEach((s: any) => {
        if (!sgMap.has(s.id)) sgMap.set(s.id, s);
      });

      // Also include any settlements linked via labor_payments that weren't caught by "Waterfall" notes
      const missingSgIds = contractSettlementIds.filter((id: string) => !sgMap.has(id));
      if (missingSgIds.length > 0) {
        const { data: linkedSgData } = await supabaseQueryWithTimeout<any[]>(
          (supabase as any)
            .from("settlement_groups")
            .select(sgSelectFields)
            .eq("site_id", selectedSite.id)
            .eq("is_cancelled", false)
            .in("id", missingSgIds),
          45000
        );
        (linkedSgData || []).forEach((s: any) => sgMap.set(s.id, s));
      }

      if (!isMountedRef.current) return;
      const sgError = waterfallSgResult.error || otherSgResult.error;
      if (sgError) {
        console.error("Error fetching settlement groups:", sgError);
      }
      const settlementGroupsData = Array.from(sgMap.values());

      // ========================================================================
      // WATERFALL CALCULATION using ALL weeks (not filtered)
      // This ensures consistent payment attribution regardless of date filter
      // ========================================================================

      // Build complete week salary map from ALL attendance (not filtered)
      const allWeekSalaryMap = new Map<string, number>();
      (allAttendanceData || []).forEach((att: any) => {
        const { weekStart } = getWeekBoundaries(att.date);
        const currentSalary = allWeekSalaryMap.get(weekStart) || 0;
        allWeekSalaryMap.set(weekStart, currentSalary + (att.daily_earnings || 0));
      });

      // Sort ALL weeks by date (oldest first) for waterfall calculation
      const allWeeksSorted = Array.from(allWeekSalaryMap.entries())
        .map(([weekStart, totalSalary]) => ({ weekStart, totalSalary }))
        .sort((a, b) => new Date(a.weekStart).getTime() - new Date(b.weekStart).getTime());

      // ONLY include salary-type settlements in waterfall (NOT advances)
      // Advances are tracked separately and should not be allocated to weeks
      const salarySettlementsOnly = (settlementGroupsData || []).filter(
        (sg: any) => sg.payment_type !== "advance"
      );

      // Sort settlements by date (oldest first) for waterfall
      const sortedSettlements = [...salarySettlementsOnly].sort(
        (a: any, b: any) =>
          new Date(a.settlement_date).getTime() -
          new Date(b.settlement_date).getTime()
      );

      // Track paid amounts per week and which settlements apply to each week
      const weekPaidFromSettlements = new Map<string, number>();
      const weekSettlementRefs = new Map<string, Set<string>>();
      const weekPaymentDates = new Map<string, Set<string>>();

      // Initialize maps for ALL weeks
      allWeeksSorted.forEach((week) => {
        weekPaidFromSettlements.set(week.weekStart, 0);
        weekSettlementRefs.set(week.weekStart, new Set());
        weekPaymentDates.set(week.weekStart, new Set());
      });

      // Track remaining due per week (will be updated as we allocate payments)
      const weekRemainingDue = new Map<string, number>();
      allWeeksSorted.forEach((week) => {
        weekRemainingDue.set(week.weekStart, week.totalSalary);
      });

      // Process each settlement in date order and allocate using waterfall
      // Uses ALL weeks (not filtered) to ensure consistent allocation
      sortedSettlements.forEach((sg: any) => {
        let remainingAmount = sg.total_amount || 0;
        const settlementRef = sg.settlement_reference;
        const settlementDate = sg.settlement_date;

        // Allocate to weeks in order (oldest first) until amount is exhausted
        for (const week of allWeeksSorted) {
          if (remainingAmount <= 0) break;

          const weekDue = weekRemainingDue.get(week.weekStart) || 0;
          if (weekDue <= 0) continue; // Week already fully paid

          // Allocate as much as possible to this week
          const allocation = Math.min(remainingAmount, weekDue);
          if (allocation > 0) {
            // Update paid amount for this week
            const currentPaid =
              weekPaidFromSettlements.get(week.weekStart) || 0;
            weekPaidFromSettlements.set(
              week.weekStart,
              currentPaid + allocation
            );

            // Update remaining due for this week
            weekRemainingDue.set(week.weekStart, weekDue - allocation);

            // Track settlement reference and date for this week
            if (settlementRef) {
              weekSettlementRefs.get(week.weekStart)?.add(settlementRef);
            }
            if (settlementDate) {
              weekPaymentDates.get(week.weekStart)?.add(settlementDate);
            }

            remainingAmount -= allocation;
          }
        }
      });

      // Update weekRows with calculated Paid values
      weekRows.forEach((weekRow) => {
        const weekStart = weekRow.weekStart;
        const paidFromSettlements = weekPaidFromSettlements.get(weekStart) || 0;

        // Update the totalPaid with the waterfall-calculated value
        weekRow.totalPaid = paidFromSettlements;
        weekRow.totalDue = Math.max(
          0,
          weekRow.totalSalary - paidFromSettlements
        );
        weekRow.paymentProgress =
          weekRow.totalSalary > 0
            ? (paidFromSettlements / weekRow.totalSalary) * 100
            : 0;

        // Update status based on new calculations
        if (weekRow.totalDue <= 0) {
          weekRow.status = weekRow.totalDue < 0 ? "advance" : "completed";
        } else if (paidFromSettlements > 0) {
          weekRow.status = "partial";
        } else {
          weekRow.status = "pending";
        }

        // Get settlement references and dates from the maps
        const refs = weekSettlementRefs.get(weekStart);
        weekRow.settlementReferences = refs ? Array.from(refs) : [];
        weekRow.transactionCount = weekRow.settlementReferences.length;

        const dates = weekPaymentDates.get(weekStart);
        weekRow.paymentDates = dates ? Array.from(dates).sort() : [];
      });

      // Sort by week start date descending (most recent first)
      weekRows.sort(
        (a, b) =>
          new Date(b.weekStart).getTime() - new Date(a.weekStart).getTime()
      );
      setWeekGroups(weekRows);

      // Calculate settlement stats from settlement_groups directly (NOT labor_payments)
      // This ensures consistency between summary and week table
      let salaryTotal = 0;
      let advanceTotal = 0;
      let salarySettlementCount = 0;
      let advanceSettlementCount = 0;

      (settlementGroupsData || []).forEach((sg: any) => {
        const amount = sg.total_amount || 0;
        const isAdvance = sg.payment_type === "advance";

        if (isAdvance) {
          advanceTotal += amount;
          advanceSettlementCount++;
        } else {
          salaryTotal += amount;
          salarySettlementCount++;
        }
      });

      // subcontractsData and teamsData were already fetched in parallel above
      // Update all state together (only if still mounted)
      setTotalAdvancesGiven(advanceTotal);
      setAdvanceRecordCount(advanceSettlementCount);
      setSalaryRecordCount(salarySettlementCount);
      setSalarySettlementsTotal(salaryTotal); // Track salary settlements separately from advances
      setSubcontracts(subcontractsData || []);
      setTeams(teamsData || []);
    } catch (err: any) {
      if (!isMountedRef.current) return;
      console.error("Error fetching data:", err);
      setError(`Failed to load data: ${err.message}`);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [selectedSite?.id, dateRange, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Emit summary when laborers change
  useEffect(() => {
    if (!onSummaryChange) return;

    const totalSalaryEarned = laborers.reduce(
      (sum, l) => sum + l.totalEarned,
      0
    );
    // Remaining balance should consider only salary settlements (advances tracked separately)
    const totalDue = Math.max(0, totalSalaryEarned - salarySettlementsTotal);
    const totalPaid = salarySettlementsTotal + totalAdvancesGiven;
    const laborersWithDue = laborers.filter((l) => l.outstanding > 0).length;

    onSummaryChange({
      dailyMarketPending: 0,
      dailyMarketPendingCount: 0,
      dailyMarketSentToEngineer: 0,
      dailyMarketSentToEngineerCount: 0,
      dailyMarketPaid: 0,
      dailyMarketPaidCount: 0,
      contractWeeklyDue: totalDue,
      contractWeeklyDueLaborerCount: laborersWithDue,
      contractWeeklyPaid: totalPaid,
      bySubcontract: [],
      unlinkedTotal: 0,
      unlinkedCount: 0,
    });
  }, [laborers, onSummaryChange, salarySettlementsTotal, totalAdvancesGiven]);

  // Filter week groups
  const filteredWeekGroups = useMemo(() => {
    // Check if any filtering is active
    const hasActiveFilters =
      filterSubcontract !== "all" || filterTeam !== "all";

    return weekGroups
      .map((week) => {
        // Filter laborers within each week
        const filteredWeekLaborers = week.laborers.filter((l) => {
          if (
            filterSubcontract !== "all" &&
            l.subcontractId !== filterSubcontract
          )
            return false;
          if (filterTeam !== "all" && l.teamId !== filterTeam) return false;
          return true;
        });

        // When no filters are active, use the original settlement-based totals
        // to ensure consistency with the summary dashboard.
        // Only recalculate when filtering by subcontract/team.
        if (!hasActiveFilters) {
          return {
            ...week,
            laborers: filteredWeekLaborers,
            laborerCount: filteredWeekLaborers.length,
            // Keep original settlement-based values
          };
        }

        // Recalculate totals for filtered laborers
        const totalSalary = filteredWeekLaborers.reduce(
          (sum, l) => sum + l.earned,
          0
        );
        const totalPaid = filteredWeekLaborers.reduce(
          (sum, l) => sum + l.paid,
          0
        );
        const totalDue = totalSalary - totalPaid;
        const paymentProgress =
          totalSalary > 0 ? (totalPaid / totalSalary) * 100 : 0;

        let status: PaymentStatus = "pending";
        if (totalDue <= 0) {
          status = totalDue < 0 ? "advance" : "completed";
        } else if (totalPaid > 0) {
          status = "partial";
        }

        return {
          ...week,
          laborers: filteredWeekLaborers,
          laborerCount: filteredWeekLaborers.length,
          totalSalary,
          totalPaid,
          totalDue: Math.max(0, totalDue),
          paymentProgress,
          status,
        };
      })
      .filter((week) => {
        // Status filter
        if (filterStatus === "pending" && week.status === "completed")
          return false;
        if (
          filterStatus === "completed" &&
          week.status !== "completed" &&
          week.status !== "advance"
        )
          return false;

        // Only include weeks with laborers after filtering
        return week.laborerCount > 0;
      });
  }, [weekGroups, filterStatus, filterSubcontract, filterTeam]);

  // Auto-scroll to highlighted row when data loads
  useEffect(() => {
    if (!highlightRef || hasScrolledToHighlight || loading) {
      return;
    }

    if (filteredWeekGroups.length === 0) return;

    // Find the row index that contains the highlighted reference
    const highlightedRowIndex = filteredWeekGroups.findIndex((item) =>
      item.settlementReferences.includes(highlightRef)
    );

    if (highlightedRowIndex === -1) {
      return;
    }

    // Small delay to ensure DOM is rendered
    const timeout = setTimeout(() => {
      const tableContainer = tableContainerRef.current;
      if (!tableContainer) return;

      // Find the row element by data attribute
      const highlightedRow = tableContainer.querySelector(
        `[data-row-index="${highlightedRowIndex}"]`
      );

      if (highlightedRow) {
        highlightedRow.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        setHasScrolledToHighlight(true);
      }
    }, 300);

    return () => clearTimeout(timeout);
  }, [highlightRef, filteredWeekGroups, hasScrolledToHighlight, loading]);

  // Week columns for week-wise view
  const weekColumns: MRT_ColumnDef<WeekRowData>[] = useMemo(
    () => [
      {
        accessorKey: "weekStart",
        header: "Week Start",
        enableHiding: true,
        // Hidden column for sorting by date
        Cell: () => null,
      },
      {
        accessorKey: "weekLabel",
        header: "Week",
        Cell: ({ row }) => (
          <Box>
            <Typography variant="body2" fontWeight={500}>
              {row.original.weekLabel}
            </Typography>
          </Box>
        ),
      },
      {
        accessorKey: "laborerCount",
        header: "Laborers",
        Cell: ({ row }) => (
          <Chip
            label={row.original.laborerCount}
            size="small"
            color="primary"
            variant="outlined"
          />
        ),
      },
      {
        accessorKey: "totalSalary",
        header: "Salary",
        Cell: ({ row }) => formatCurrency(row.original.totalSalary),
      },
      {
        accessorKey: "totalPaid",
        header: "Paid",
        Cell: ({ row }) => (
          <Typography variant="body2" color="success.main">
            {formatCurrency(row.original.totalPaid)}
          </Typography>
        ),
      },
      {
        accessorKey: "totalDue",
        header: "Due",
        Cell: ({ row }) => (
          <Typography
            variant="body2"
            fontWeight={600}
            color={row.original.totalDue > 0 ? "error.main" : "success.main"}
          >
            {formatCurrency(row.original.totalDue)}
          </Typography>
        ),
      },
      {
        accessorKey: "paymentProgress",
        header: "Progress",
        Cell: ({ row }) => (
          <Box sx={{ width: 100 }}>
            <Box
              sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}
            >
              <Typography variant="caption">
                {row.original.paymentProgress.toFixed(0)}%
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={Math.min(row.original.paymentProgress, 100)}
              color={
                row.original.paymentProgress >= 100
                  ? "success"
                  : row.original.paymentProgress > 50
                  ? "warning"
                  : "error"
              }
              sx={{ height: 6, borderRadius: 1 }}
            />
          </Box>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        filterVariant: "select",
        filterSelectOptions: [
          { value: "pending", label: "Pending" },
          { value: "partial", label: "Partial" },
          { value: "completed", label: "Completed" },
          { value: "advance", label: "Advance" },
        ],
        Cell: ({ row }) => (
          <Chip
            label={getPaymentStatusLabel(row.original.status)}
            size="small"
            color={getPaymentStatusColor(row.original.status)}
            variant="outlined"
          />
        ),
      },
      {
        accessorKey: "transactionCount",
        header: "Transactions",
        size: 140,
        Cell: ({ row }) => {
          const paymentDates = row.original.paymentDates;
          const refs = row.original.settlementReferences;

          // Use actual transaction count (not unique payment dates)
          const count = row.original.transactionCount || 0;

          if (count === 0) {
            return (
              <Typography variant="body2" color="text.secondary">
                No payments
              </Typography>
            );
          }

          // Build date-to-ref mapping for tooltip
          const dateRefPairs = paymentDates.map((date, idx) => ({
            date,
            ref: refs?.[idx] || null,
          }));

          // Tooltip content showing payment dates
          const TooltipContent = () => (
            <Box sx={{ p: 1 }}>
              <Typography
                variant="caption"
                fontWeight={600}
                sx={{ display: "block", mb: 1 }}
              >
                {count} Transaction{count > 1 ? "s" : ""} on{" "}
                {paymentDates.length} date{paymentDates.length > 1 ? "s" : ""}:
              </Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                {dateRefPairs.map(({ date, ref }) => (
                  <Box
                    key={date}
                    sx={{ display: "flex", alignItems: "center", gap: 1 }}
                  >
                    <Typography variant="caption" sx={{ minWidth: 80 }}>
                      {dayjs(date).format("MMM D")}
                    </Typography>
                    {ref && (
                      <Typography
                        variant="caption"
                        sx={{
                          fontFamily: "monospace",
                          fontSize: "0.65rem",
                          color: "primary.main",
                        }}
                      >
                        • {ref}
                      </Typography>
                    )}
                  </Box>
                ))}
              </Box>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", mt: 1, fontStyle: "italic" }}
              >
                Click to view details
              </Typography>
            </Box>
          );

          return (
            <Tooltip
              title={<TooltipContent />}
              arrow
              placement="top"
              componentsProps={{
                tooltip: {
                  sx: {
                    maxWidth: 350,
                    bgcolor: "background.paper",
                    color: "text.primary",
                    boxShadow: 3,
                    "& .MuiTooltip-arrow": {
                      color: "background.paper",
                    },
                  },
                },
              }}
            >
              <Chip
                size="small"
                icon={<ReceiptIcon sx={{ fontSize: 14 }} />}
                label={`${count} Transaction${count > 1 ? "s" : ""}`}
                color={count > 0 ? "primary" : "default"}
                variant="outlined"
                sx={{ cursor: "pointer" }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedWeekForDetails(row.original);
                  setWeekDetailsDialogOpen(true);
                }}
              />
            </Tooltip>
          );
        },
      },
    ],
    []
  );

  // Render date-wise transactions detail panel for week-wise view
  const renderWeekDetailPanel = ({
    row,
  }: {
    row: { original: WeekRowData };
  }) => {
    const week = row.original;

    return (
      <DateTransactionDetailPanel
        week={week}
        onViewRef={handleViewReference}
        onOpenSettlementDetails={(settlement) => {
          setSelectedSettlement(settlement);
          setEditSettlementDialogOpen(true);
        }}
        canEdit={canEdit}
        onEditSettlement={(settlement) => {
          setSelectedSettlement(settlement);
          setEditSettlementDialogOpen(true);
        }}
        onDeleteSettlement={(settlement) => {
          setSelectedSettlement(settlement);
          setDeleteSettlementDialogOpen(true);
        }}
      />
    );
  };

  const handlePaymentSuccess = () => {
    fetchData();
    onDataChange?.();
  };

  // Handler to view payment/settlement details based on reference type
  const handleViewReference = (ref: string) => {
    setSelectedRef(ref);
    // Check if it's a settlement reference (SET-*) or payment reference (PAY-*)
    if (ref.startsWith("SET-")) {
      setSettlementRefDialogOpen(true);
    } else {
      setRefDialogOpen(true);
    }
  };

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          py: 8,
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
    );
  }

  return (
    <Box>
      {/* Summary Dashboard with Advance Tracking */}
      <ContractSummaryDashboardV2
        totalSalaryEarned={laborers.reduce((sum, l) => sum + l.totalEarned, 0)}
        totalSalarySettled={salarySettlementsTotal}
        totalAdvancesGiven={totalAdvancesGiven}
        laborerCount={laborers.length}
        laborersWithDue={laborers.filter((l) => l.outstanding > 0).length}
        salaryRecordCount={salaryRecordCount}
        advanceRecordCount={advanceRecordCount}
        loading={loading}
      />

      {/* Action Bar */}
      <Box
        sx={{
          display: "flex",
          gap: 2,
          mb: 3,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        {/* Record Payment Button */}
        {canEdit && (
          <Button
            variant="contained"
            startIcon={<PaymentIcon />}
            onClick={() => setPaymentDialogOpen(true)}
          >
            Record Payment
          </Button>
        )}

        <Box sx={{ flexGrow: 1 }} />

        {/* Filters */}
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Status</InputLabel>
          <Select
            value={filterStatus}
            onChange={(e) =>
              setFilterStatus(e.target.value as "all" | "pending" | "completed")
            }
            label="Status"
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="pending">Pending</MenuItem>
            <MenuItem value="completed">Completed</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Subcontract</InputLabel>
          <Select
            value={filterSubcontract}
            onChange={(e) => setFilterSubcontract(e.target.value)}
            label="Subcontract"
          >
            <MenuItem value="all">All</MenuItem>
            {subcontracts.map((sc) => (
              <MenuItem key={sc.id} value={sc.id}>
                {sc.title}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>Team</InputLabel>
          <Select
            value={filterTeam}
            onChange={(e) => setFilterTeam(e.target.value)}
            label="Team"
          >
            <MenuItem value="all">All</MenuItem>
            {teams.map((team) => (
              <MenuItem key={team.id} value={team.id}>
                {team.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Button
          startIcon={<HistoryIcon />}
          onClick={() => setHistoryDialogOpen(true)}
          variant="outlined"
          size="small"
        >
          History
        </Button>

        <Button
          startIcon={<RefreshIcon />}
          onClick={fetchData}
          variant="outlined"
          size="small"
        >
          Refresh
        </Button>
      </Box>

      {/* Week-wise Data Table */}
      {filteredWeekGroups.length === 0 ? (
        <Alert severity="info">
          No weeks found for the selected period and filters.
        </Alert>
      ) : (
        <Box ref={tableContainerRef}>
          <DataTable<WeekRowData>
            columns={weekColumns}
            data={filteredWeekGroups}
            isLoading={loading}
            enableExpanding
            renderDetailPanel={renderWeekDetailPanel}
            initialState={{
              sorting: [{ id: "weekStart", desc: true }],
              columnVisibility: { weekStart: false },
            }}
            muiTableBodyRowProps={({ row }) => ({
              "data-row-index": row.index,
              sx: {
                // Highlight row if it contains the matching settlement reference
                backgroundColor:
                  highlightRef &&
                  row.original.settlementReferences.includes(highlightRef)
                    ? alpha(theme.palette.primary.main, 0.15)
                    : undefined,
                transition: "background-color 0.3s ease-in-out",
              },
            })}
          />
        </Box>
      )}

      {/* Payment Dialog */}
      <ContractPaymentRecordDialog
        open={paymentDialogOpen}
        onClose={() => setPaymentDialogOpen(false)}
        weeks={weekGroups}
        onSuccess={handlePaymentSuccess}
      />

      {/* Payment History Dialog */}
      <ContractPaymentHistoryDialog
        open={historyDialogOpen}
        onClose={() => setHistoryDialogOpen(false)}
        onViewPayment={handleViewReference}
        onDataChange={handlePaymentSuccess}
      />

      {/* Payment Ref Dialog - For PAY-* references */}
      <PaymentRefDialog
        open={refDialogOpen}
        onClose={() => {
          setRefDialogOpen(false);
          setSelectedRef(null);
        }}
        paymentReference={selectedRef}
        onEdit={(details) => {
          setEditingPaymentDetails(details);
          setEditDialogOpen(true);
        }}
      />

      {/* Settlement Ref Detail Dialog - For SET-* references */}
      <SettlementRefDetailDialog
        open={settlementRefDialogOpen}
        onClose={() => {
          setSettlementRefDialogOpen(false);
          setSelectedRef(null);
        }}
        settlementReference={selectedRef}
        canEdit={canEdit}
        contractOnly={true}
        onEdit={(details) => {
          // Convert SettlementDetails to DateWiseSettlement format
          const settlement: DateWiseSettlement = {
            settlementGroupId: details.settlementGroupId,
            settlementReference: details.settlementReference,
            settlementDate: details.settlementDate,
            totalAmount: details.totalAmount,
            weekAllocations: [],
            paymentMode: details.paymentMode as any,
            paymentChannel: details.paymentChannel as
              | "direct"
              | "engineer_wallet",
            payerSource: details.payerSource as any,
            payerName: details.payerName,
            proofUrls: details.proofUrls,
            notes: details.notes,
            subcontractId: details.subcontractId,
            subcontractTitle: details.subcontractTitle,
            createdBy: details.createdByName || "",
            createdByName: details.createdByName,
            createdAt: details.createdAt,
            isCancelled: details.isCancelled,
          };
          setSelectedSettlement(settlement);
          setEditSettlementDialogOpen(true);
        }}
        onDelete={(details) => {
          // Convert SettlementDetails to DateWiseSettlement format
          const settlement: DateWiseSettlement = {
            settlementGroupId: details.settlementGroupId,
            settlementReference: details.settlementReference,
            settlementDate: details.settlementDate,
            totalAmount: details.totalAmount,
            weekAllocations: [],
            paymentMode: details.paymentMode as any,
            paymentChannel: details.paymentChannel as
              | "direct"
              | "engineer_wallet",
            payerSource: details.payerSource as any,
            payerName: details.payerName,
            proofUrls: details.proofUrls,
            notes: details.notes,
            subcontractId: details.subcontractId,
            subcontractTitle: details.subcontractTitle,
            createdBy: details.createdByName || "",
            createdByName: details.createdByName,
            createdAt: details.createdAt,
            isCancelled: details.isCancelled,
          };
          setSelectedSettlement(settlement);
          setDeleteSettlementDialogOpen(true);
        }}
      />

      {/* Week Settlements Dialog V3 - Date-wise with Card/Table toggle */}
      <WeekSettlementsDialogV3
        open={weekDetailsDialogOpen}
        onClose={() => {
          setWeekDetailsDialogOpen(false);
          setSelectedWeekForDetails(null);
        }}
        week={selectedWeekForDetails}
        onViewPayment={handleViewReference}
        onEditSettlement={(settlement) => {
          setSelectedSettlement(settlement);
          setEditSettlementDialogOpen(true);
        }}
        onDeleteSettlement={(settlement) => {
          setSelectedSettlement(settlement);
          setDeleteSettlementDialogOpen(true);
        }}
        onRefresh={fetchData}
      />

      {/* Contract Settlement Edit Dialog - For date-wise settlements */}
      <ContractSettlementEditDialog
        open={editSettlementDialogOpen}
        onClose={() => {
          setEditSettlementDialogOpen(false);
          setSelectedSettlement(null);
        }}
        settlement={selectedSettlement}
        onSuccess={() => {
          fetchData();
          setEditSettlementDialogOpen(false);
          setSelectedSettlement(null);
        }}
        onDelete={(settlement) => {
          setEditSettlementDialogOpen(false);
          setSelectedSettlement(settlement);
          setDeleteSettlementDialogOpen(true);
        }}
      />

      {/* Delete Settlement Confirm Dialog */}
      <DeleteSettlementConfirmDialog
        open={deleteSettlementDialogOpen}
        onClose={() => {
          setDeleteSettlementDialogOpen(false);
          setSelectedSettlement(null);
        }}
        settlement={selectedSettlement}
        onSuccess={() => {
          fetchData();
          setDeleteSettlementDialogOpen(false);
          setSelectedSettlement(null);
        }}
      />

      {/* Payment Edit Dialog */}
      <ContractPaymentEditDialog
        open={editDialogOpen}
        onClose={() => {
          setEditDialogOpen(false);
          setEditingPaymentDetails(null);
        }}
        paymentDetails={editingPaymentDetails}
        onSuccess={() => {
          fetchData();
          setEditDialogOpen(false);
          setEditingPaymentDetails(null);
        }}
      />
    </Box>
  );
}
