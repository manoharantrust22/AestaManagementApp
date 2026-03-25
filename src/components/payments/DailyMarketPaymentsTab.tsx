"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import {
  Box,
  Typography,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
  useTheme,
  useMediaQuery,
  Card,
  CardContent,
  Grid,
  Chip,
} from "@mui/material";
import {
  Refresh as RefreshIcon,
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon,
  Close as CloseIcon,
  AccountBalanceWallet as SalaryIcon,
  CheckCircle as PaidIcon,
  Warning as OutstandingIcon,
  TrendingUp as ProgressIcon,
} from "@mui/icons-material";
import { useFullscreen } from "@/hooks/useFullscreen";
import { createClient } from "@/lib/supabase/client";
import { useSite } from "@/contexts/SiteContext";
import { useAuth } from "@/contexts/AuthContext";
import dayjs from "dayjs";
const SalarySettlementTable = dynamic(
  () => import("./SalarySettlementTable"),
  { ssr: false }
);
import PaymentDialog from "./PaymentDialog";
import CancelPaymentDialog from "./CancelPaymentDialog";
import DateEditDialog from "./DateEditDialog";
import DateCancelDialog from "./DateCancelDialog";
import type {
  DateGroup,
  DailyPaymentRecord,
  PaymentFilterState,
  MoneySourceSummary,
  PaymentSummaryData,
} from "@/types/payment.types";
import { hasEditPermission, canPerformMassUpload } from "@/lib/permissions";
import MoneySourceSummaryCard from "./MoneySourceSummaryCard";
import { getPayerSourceLabel } from "@/components/settlement/PayerSourceSelector";
import type { PayerSource } from "@/types/settlement.types";
import { notifyEngineerPaymentReminder } from "@/lib/services/notificationService";
import { generateWhatsAppUrl, generatePaymentReminderMessage } from "@/lib/formatters";
import SettlementDetailsDialog from "@/components/settlement/SettlementDetailsDialog";
import DateViewDetailsDialog from "./DateViewDetailsDialog";
import DateSettlementsEditDialog from "./DateSettlementsEditDialog";
import SettlementRefDetailDialog, { type SettlementDetails } from "./SettlementRefDetailDialog";
import { supabaseQueryWithTimeout } from "@/lib/utils/supabaseQuery";
import DailySettlementEditDialog from "./DailySettlementEditDialog";
import DeleteDailySettlementDialog from "./DeleteDailySettlementDialog";
import SettlementFormDialog from "@/components/settlement/SettlementFormDialog";

interface DailyMarketPaymentsTabProps {
  dateFrom: string;
  dateTo: string;
  onFilterChange: (filters: Partial<PaymentFilterState>) => void;
  onDataChange?: () => void;
  onSummaryChange?: (summary: PaymentSummaryData) => void;
  highlightRef?: string | null;
}

export default function DailyMarketPaymentsTab({
  dateFrom,
  dateTo,
  onFilterChange,
  onDataChange,
  onSummaryChange,
  highlightRef,
}: DailyMarketPaymentsTabProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { selectedSite } = useSite();
  const { userProfile } = useAuth();
  const supabase = createClient();

  // Fullscreen support
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, enterFullscreen, exitFullscreen } = useFullscreen(
    tableContainerRef,
    { orientation: "landscape" }
  );

  // Data state
  const [dateGroups, setDateGroups] = useState<DateGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Contract-only dates (dates with contract attendance but no daily/market)
  const [contractOnlyDates, setContractOnlyDates] = useState<string[]>([]);

  // Holidays within the date range
  const [holidays, setHolidays] = useState<Array<{
    id: string;
    date: string;
    reason: string | null;
    is_paid_holiday: boolean | null;
  }>>([]);

  // Filter state
  const [filterStatus, setFilterStatus] = useState<
    "all" | "pending" | "sent_to_engineer" | "paid"
  >("all");
  const [filterSubcontract, setFilterSubcontract] = useState<string>("all");
  const [subcontracts, setSubcontracts] = useState<
    { id: string; title: string }[]
  >([]);

  // Selection state
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(
    new Set()
  );

  // Payment dialog state
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedForPayment, setSelectedForPayment] = useState<
    DailyPaymentRecord[]
  >([]);

  // Cancel payment dialog state
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [recordToCancel, setRecordToCancel] = useState<DailyPaymentRecord | null>(null);
  const [engineerNameToCancel, setEngineerNameToCancel] = useState<string>("");

  // Bulk cancel state
  const [bulkCancelRecords, setBulkCancelRecords] = useState<DailyPaymentRecord[]>([]);
  const [bulkCancelProcessing, setBulkCancelProcessing] = useState(false);

  // Date edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editDialogDate, setEditDialogDate] = useState<string>("");
  const [editDialogGroup, setEditDialogGroup] = useState<DateGroup | null>(null);

  // Date cancel dialog state (bulk cancel by date)
  const [dateCancelDialogOpen, setDateCancelDialogOpen] = useState(false);
  const [dateCancelDate, setDateCancelDate] = useState<string>("");
  const [dateCancelRecords, setDateCancelRecords] = useState<DailyPaymentRecord[]>([]);

  // Expanded state
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const expandedDatesRef = useRef<Set<string>>(new Set());

  // Track component mount state to prevent state updates after unmount
  const isMountedRef = useRef(true);

  // Keep ref in sync with state
  useEffect(() => {
    expandedDatesRef.current = expandedDates;
  }, [expandedDates]);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const canEdit = hasEditPermission(userProfile?.role);
  const isAdmin = canPerformMassUpload(userProfile?.role); // admin or office

  // Settlement details dialog state (for admin confirmation)
  const [settlementDetailsOpen, setSettlementDetailsOpen] = useState(false);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);

  // View details dialog state
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewDialogDate, setViewDialogDate] = useState<string>("");
  const [viewDialogGroup, setViewDialogGroup] = useState<DateGroup | null>(null);

  // Date settlements edit dialog state (edit all records for a date)
  const [dateSettlementsEditOpen, setDateSettlementsEditOpen] = useState(false);
  const [dateSettlementsEditDate, setDateSettlementsEditDate] = useState<string>("");
  const [dateSettlementsEditRecords, setDateSettlementsEditRecords] = useState<DailyPaymentRecord[]>([]);

  // Settlement ref detail dialog state
  const [settlementRefDialogOpen, setSettlementRefDialogOpen] = useState(false);
  const [selectedSettlementRef, setSelectedSettlementRef] = useState<string | null>(null);

  // Daily settlement edit dialog state
  const [dailySettlementEditOpen, setDailySettlementEditOpen] = useState(false);
  const [editingSettlement, setEditingSettlement] = useState<SettlementDetails | null>(null);

  // Delete confirmation state for settlements
  const [deleteSettlementDialogOpen, setDeleteSettlementDialogOpen] = useState(false);
  const [settlementToDelete, setSettlementToDelete] = useState<SettlementDetails | null>(null);

  // Engineer settlement dialog state (for Settle Now button)
  const [engineerSettlementDialogOpen, setEngineerSettlementDialogOpen] = useState(false);
  const [engineerSettlementTransactionId, setEngineerSettlementTransactionId] = useState<string | null>(null);

  // Fetch data with timeout protection to prevent infinite loading
  const fetchData = useCallback(async () => {
    if (!selectedSite?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch daily attendance (non-contract laborers) with settlement status
      const { data: dailyData, error: dailyError } = await supabaseQueryWithTimeout(
        supabase
          .from("daily_attendance")
          .select(
            `
            id,
            date,
            laborer_id,
            daily_earnings,
            is_paid,
            payment_date,
            payment_mode,
            paid_via,
            engineer_transaction_id,
            payment_proof_url,
            payment_notes,
            subcontract_id,
            expense_id,
            settlement_group_id,
            payer_source,
            payer_name,
            laborers!inner(name, laborer_type, labor_categories(name), labor_roles(name)),
            subcontracts(title),
            site_engineer_transactions!engineer_transaction_id(
              settlement_status,
              settlement_mode,
              notes,
              proof_url,
              settlement_proof_url,
              transaction_date,
              settled_date,
              confirmed_at,
              money_source,
              money_source_name,
              user_id
            ),
            settlement_groups(id, settlement_reference, is_cancelled)
          `
          )
          .eq("site_id", selectedSite.id)
          .neq("laborers.laborer_type", "contract")
          .gte("date", dateFrom)
          .lte("date", dateTo)
          .order("date", { ascending: false })
      );

      if (!isMountedRef.current) return;
      if (dailyError) throw dailyError;

      // Fetch market attendance with settlement status
      const { data: marketData, error: marketError } = await supabaseQueryWithTimeout(
        supabase
          .from("market_laborer_attendance")
          .select(
            `
            id,
            date,
            count,
            total_cost,
            is_paid,
            payment_date,
            payment_mode,
            paid_via,
            engineer_transaction_id,
            payment_proof_url,
            payment_notes,
            expense_id,
            subcontract_id,
            settlement_group_id,
            payer_source,
            payer_name,
            labor_roles(name),
            subcontracts(title),
            site_engineer_transactions!engineer_transaction_id(
              settlement_status,
              settlement_mode,
              notes,
              proof_url,
              settlement_proof_url,
              transaction_date,
              settled_date,
              confirmed_at,
              money_source,
              money_source_name,
              user_id
            ),
            settlement_groups(id, settlement_reference, is_cancelled),
            expenses(contract_id, subcontracts(id, title))
          `
          )
          .eq("site_id", selectedSite.id)
          .gte("date", dateFrom)
          .lte("date", dateTo)
          .order("date", { ascending: false })
      );

      if (!isMountedRef.current) return;
      if (marketError) throw marketError;

      // Fetch contract attendance dates (to identify contract-only days)
      const { data: contractAttendance, error: contractError } = await supabaseQueryWithTimeout(
        supabase
          .from("daily_attendance")
          .select("date, laborers!inner(laborer_type)")
          .eq("site_id", selectedSite.id)
          .eq("laborers.laborer_type", "contract")
          .gte("date", dateFrom)
          .lte("date", dateTo)
      );

      if (!isMountedRef.current) return;
      if (contractError) {
        console.error("Error fetching contract attendance:", contractError);
      }

      // Fetch holidays for the date range
      const { data: holidayData, error: holidayError } = await supabaseQueryWithTimeout(
        supabase
          .from("site_holidays")
          .select("id, date, reason, is_paid_holiday")
          .eq("site_id", selectedSite.id)
          .gte("date", dateFrom)
          .lte("date", dateTo)
          .order("date", { ascending: false })
      );

      if (!isMountedRef.current) return;
      if (holidayError) {
        console.error("Error fetching holidays:", holidayError);
      }

      // Map to DailyPaymentRecord
      const dailyRecords: DailyPaymentRecord[] = (dailyData || []).map(
        (r: any) => ({
          id: `daily-${r.id}`,
          sourceType: "daily" as const,
          sourceId: r.id,
          date: r.date,
          laborerId: r.laborer_id,
          laborerName: r.laborers?.name || "Unknown",
          laborerType: "daily" as const,
          category: r.laborers?.labor_categories?.name,
          role: r.laborers?.labor_roles?.name,
          amount: r.daily_earnings || 0,
          isPaid: r.is_paid || false,
          paidVia: r.paid_via,
          paymentDate: r.payment_date,
          paymentMode: r.payment_mode,
          engineerTransactionId: r.engineer_transaction_id,
          engineerUserId: r.site_engineer_transactions?.user_id || null,
          proofUrl: r.payment_proof_url,
          paymentNotes: r.payment_notes || null,
          subcontractId: r.subcontract_id,
          subcontractTitle: r.subcontracts?.title,
          expenseId: r.expense_id || null,
          settlementStatus: r.site_engineer_transactions?.settlement_status || null,
          // Settlement tracking fields from engineer transaction
          companyProofUrl: r.site_engineer_transactions?.proof_url || null,
          engineerProofUrl: r.site_engineer_transactions?.settlement_proof_url || null,
          transactionDate: r.site_engineer_transactions?.transaction_date || null,
          settledDate: r.site_engineer_transactions?.settled_date || null,
          confirmedAt: r.site_engineer_transactions?.confirmed_at || null,
          settlementMode: r.site_engineer_transactions?.settlement_mode || null,
          cashReason: r.site_engineer_transactions?.notes || null,
          // Money source tracking (fallback to payer_source for direct settlements)
          moneySource: r.site_engineer_transactions?.money_source || r.payer_source || null,
          moneySourceName: r.site_engineer_transactions?.money_source_name || r.payer_name || null,
          // Settlement group tracking (new architecture)
          // Don't show settlement info for cancelled settlements OR for unpaid records (inconsistent state)
          // A record should only show settlement ref if it's paid or sent to engineer
          settlementGroupId: (r.settlement_groups?.is_cancelled || (!r.is_paid && r.paid_via !== "engineer_wallet"))
            ? null
            : (r.settlement_group_id || null),
          settlementReference: (r.settlement_groups?.is_cancelled || (!r.is_paid && r.paid_via !== "engineer_wallet"))
            ? null
            : (r.settlement_groups?.settlement_reference || null),
        })
      );

      const marketRecords: DailyPaymentRecord[] = (marketData || []).map(
        (r: any) => ({
          id: `market-${r.id}`,
          sourceType: "market" as const,
          sourceId: r.id,
          date: r.date,
          laborerId: null,
          laborerName: r.labor_roles?.name || "Market Labor",
          laborerType: "market" as const,
          role: r.labor_roles?.name,
          count: r.count,
          amount: r.total_cost || 0,
          isPaid: r.is_paid || false,
          paidVia: r.paid_via,
          paymentDate: r.payment_date,
          paymentMode: r.payment_mode,
          engineerTransactionId: r.engineer_transaction_id,
          engineerUserId: r.site_engineer_transactions?.user_id || null,
          proofUrl: r.payment_proof_url,
          paymentNotes: r.payment_notes || null,
          subcontractId: r.subcontract_id || r.expenses?.contract_id || null,
          subcontractTitle: r.subcontracts?.title || r.expenses?.subcontracts?.title || null,
          expenseId: r.expense_id || null,
          settlementStatus: r.site_engineer_transactions?.settlement_status || null,
          // Settlement tracking fields from engineer transaction
          companyProofUrl: r.site_engineer_transactions?.proof_url || null,
          engineerProofUrl: r.site_engineer_transactions?.settlement_proof_url || null,
          transactionDate: r.site_engineer_transactions?.transaction_date || null,
          settledDate: r.site_engineer_transactions?.settled_date || null,
          confirmedAt: r.site_engineer_transactions?.confirmed_at || null,
          settlementMode: r.site_engineer_transactions?.settlement_mode || null,
          cashReason: r.site_engineer_transactions?.notes || null,
          // Money source tracking (fallback to payer_source for direct settlements)
          moneySource: r.site_engineer_transactions?.money_source || r.payer_source || null,
          moneySourceName: r.site_engineer_transactions?.money_source_name || r.payer_name || null,
          // Settlement group tracking (new architecture)
          // Don't show settlement info for cancelled settlements OR for unpaid records (inconsistent state)
          // A record should only show settlement ref if it's paid or sent to engineer
          settlementGroupId: (r.settlement_groups?.is_cancelled || (!r.is_paid && r.paid_via !== "engineer_wallet"))
            ? null
            : (r.settlement_group_id || null),
          settlementReference: (r.settlement_groups?.is_cancelled || (!r.is_paid && r.paid_via !== "engineer_wallet"))
            ? null
            : (r.settlement_groups?.settlement_reference || null),
        })
      );

      // Group by date
      const dateMap = new Map<string, DateGroup>();

      // Process daily records
      dailyRecords.forEach((record) => {
        if (!dateMap.has(record.date)) {
          dateMap.set(record.date, createEmptyDateGroup(record.date));
        }
        const group = dateMap.get(record.date)!;
        group.dailyRecords.push(record);
        updateGroupSummary(group);
      });

      // Process market records
      marketRecords.forEach((record) => {
        if (!dateMap.has(record.date)) {
          dateMap.set(record.date, createEmptyDateGroup(record.date));
        }
        const group = dateMap.get(record.date)!;
        group.marketRecords.push(record);
        updateGroupSummary(group);
      });

      // Convert to array and sort by date descending
      const groups = Array.from(dateMap.values()).sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );

      // Restore expanded state using ref (to avoid stale closure)
      groups.forEach((g) => {
        g.isExpanded = expandedDatesRef.current.has(g.date);
      });

      // Fetch subcontracts for filter
      const { data: subcontractsData, error: subcontractsError } = await supabaseQueryWithTimeout(
        supabase
          .from("subcontracts")
          .select("id, title")
          .eq("site_id", selectedSite.id)
          .in("status", ["active", "on_hold"])
      );

      if (!isMountedRef.current) return;
      if (subcontractsError) {
        console.error("Error fetching subcontracts:", subcontractsError);
      }

      // Update all state together (only if still mounted)
      setDateGroups(groups);

      // Process contract-only dates (dates with contract labor but no daily/market)
      const dailyMarketDates = new Set(dateMap.keys());
      const contractDates = new Set(
        (contractAttendance || []).map((r: { date: string }) => r.date)
      );
      const contractOnlyDatesList = Array.from(contractDates).filter(
        (date) => !dailyMarketDates.has(date)
      );
      setContractOnlyDates(contractOnlyDatesList);

      // Set holidays
      setHolidays(holidayData || []);

      setSubcontracts(subcontractsData || []);
    } catch (err: any) {
      if (!isMountedRef.current) return;
      console.error("Error fetching payment data:", err);
      setError(err.message || "Failed to load payment data");
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  // Note: expandedDates removed from deps to prevent refetch on expand/collapse
  }, [selectedSite?.id, dateFrom, dateTo, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Calculate and emit summary when dateGroups changes
  useEffect(() => {
    if (!onSummaryChange) return;

    // Collect all records from all date groups
    const allRecords = dateGroups.flatMap((g) => [...g.dailyRecords, ...g.marketRecords]);

    // Calculate summary
    const pendingRecords = allRecords.filter(
      (r) => !r.isPaid && r.paidVia !== "engineer_wallet"
    );
    const sentToEngineerRecords = allRecords.filter(
      (r) => !r.isPaid && r.paidVia === "engineer_wallet"
    );
    const paidRecords = allRecords.filter((r) => r.isPaid);
    const unlinkedRecords = allRecords.filter((r) => !r.subcontractId);

    // Count unique settlement groups instead of individual records
    // For pending: count by date (records without settlement_group_id grouped by date)
    const pendingDates = new Set(pendingRecords.map(r => r.date));
    // For sent to engineer: count unique settlement groups (fallback to date for legacy)
    const sentWithGroup = sentToEngineerRecords.filter(r => r.settlementGroupId);
    const sentWithoutGroup = sentToEngineerRecords.filter(r => !r.settlementGroupId);
    const sentToEngineerGroups = new Set([
      ...sentWithGroup.map(r => r.settlementGroupId),
      ...sentWithoutGroup.map(r => `legacy-${r.date}`), // Fallback: group by date
    ]);
    // For paid: count unique settlement groups (fallback to date for legacy)
    const paidWithGroup = paidRecords.filter(r => r.settlementGroupId);
    const paidWithoutGroup = paidRecords.filter(r => !r.settlementGroupId);
    const paidSettlementGroups = new Set([
      ...paidWithGroup.map(r => r.settlementGroupId),
      ...paidWithoutGroup.map(r => `legacy-${r.date}`), // Fallback: group by date
    ]);

    // Group by subcontract
    const subcontractMap = new Map<string, { title: string; paid: number; due: number }>();
    allRecords.forEach((r) => {
      if (r.subcontractId) {
        const existing = subcontractMap.get(r.subcontractId) || {
          title: r.subcontractTitle || "Unknown",
          paid: 0,
          due: 0,
        };
        if (r.isPaid) {
          existing.paid += r.amount;
        } else {
          existing.due += r.amount;
        }
        subcontractMap.set(r.subcontractId, existing);
      }
    });

    const bySubcontract = Array.from(subcontractMap.entries()).map(([id, data]) => ({
      subcontractId: id,
      subcontractTitle: data.title,
      totalPaid: data.paid,
      totalDue: data.due,
    }));

    // Count unique settlement groups for unlinked records (fallback to date for legacy)
    const unlinkedWithGroup = unlinkedRecords.filter(r => r.settlementGroupId);
    const unlinkedWithoutGroup = unlinkedRecords.filter(r => !r.settlementGroupId);
    const unlinkedSettlementGroups = new Set([
      ...unlinkedWithGroup.map(r => r.settlementGroupId),
      ...unlinkedWithoutGroup.map(r => `legacy-${r.date}`),
    ]);

    const summary: PaymentSummaryData = {
      dailyMarketPending: pendingRecords.reduce((sum, r) => sum + r.amount, 0),
      dailyMarketPendingCount: pendingDates.size,
      dailyMarketSentToEngineer: sentToEngineerRecords.reduce((sum, r) => sum + r.amount, 0),
      dailyMarketSentToEngineerCount: sentToEngineerGroups.size,
      dailyMarketPaid: paidRecords.reduce((sum, r) => sum + r.amount, 0),
      dailyMarketPaidCount: paidSettlementGroups.size,
      contractWeeklyDue: 0,
      contractWeeklyDueLaborerCount: 0,
      contractWeeklyPaid: 0,
      bySubcontract,
      unlinkedTotal: unlinkedRecords.reduce((sum, r) => sum + r.amount, 0),
      unlinkedCount: unlinkedSettlementGroups.size,
    };

    onSummaryChange(summary);
  }, [dateGroups, onSummaryChange]);

  // Calculate summary dashboard data
  const dashboardSummary = useMemo(() => {
    const allRecords = dateGroups.flatMap((g) => [...g.dailyRecords, ...g.marketRecords]);
    const totalSalary = allRecords.reduce((sum, r) => sum + r.amount, 0);
    const paidRecords = allRecords.filter((r) => r.isPaid);
    const totalPaid = paidRecords.reduce((sum, r) => sum + r.amount, 0);
    const pendingWithEngineerRecords = allRecords.filter((r) => !r.isPaid && r.paidVia === "engineer_wallet");
    const pendingWithEngineer = pendingWithEngineerRecords.reduce((sum, r) => sum + r.amount, 0);
    // Count unique settlement groups for pending with engineer (fallback to date for legacy)
    const pendingEngWithGroup = pendingWithEngineerRecords.filter(r => r.settlementGroupId);
    const pendingEngWithoutGroup = pendingWithEngineerRecords.filter(r => !r.settlementGroupId);
    const pendingWithEngineerGroups = new Set([
      ...pendingEngWithGroup.map(r => r.settlementGroupId),
      ...pendingEngWithoutGroup.map(r => `legacy-${r.date}`),
    ]);
    const pendingWithEngineerCount = pendingWithEngineerGroups.size;
    const totalDue = totalSalary - totalPaid;
    const progress = totalSalary > 0 ? (totalPaid / totalSalary) * 100 : 0;

    // Count unique settlement groups from actual records (fallback to date for legacy)
    const allWithGroup = allRecords.filter(r => r.settlementGroupId);
    const allWithoutGroup = allRecords.filter(r => !r.settlementGroupId);
    const allSettlementGroups = new Set([
      ...allWithGroup.map(r => r.settlementGroupId),
      ...allWithoutGroup.map(r => `legacy-${r.date}`),
    ]);
    const recordCount = allSettlementGroups.size;

    // Count unique paid settlement groups (fallback to date for legacy)
    const paidWithGroup = paidRecords.filter(r => r.settlementGroupId);
    const paidWithoutGroup = paidRecords.filter(r => !r.settlementGroupId);
    const paidSettlementGroups = new Set([
      ...paidWithGroup.map(r => r.settlementGroupId),
      ...paidWithoutGroup.map(r => `legacy-${r.date}`),
    ]);
    const paidCount = paidSettlementGroups.size;

    return {
      totalSalary,
      totalPaid,
      totalDue,
      pendingWithEngineer,
      pendingWithEngineerCount,
      progress,
      recordCount,
      paidCount,
    };
  }, [dateGroups]);

  // Filter records
  const filteredDateGroups = useMemo(() => {
    return dateGroups
      .map((group) => {
        let dailyRecords = group.dailyRecords;
        let marketRecords = group.marketRecords;

        // Filter by status
        if (filterStatus !== "all") {
          const filterFn = (r: DailyPaymentRecord) => {
            if (filterStatus === "pending")
              return !r.isPaid && r.paidVia !== "engineer_wallet";
            if (filterStatus === "sent_to_engineer")
              return !r.isPaid && r.paidVia === "engineer_wallet";
            if (filterStatus === "paid") return r.isPaid;
            return true;
          };
          dailyRecords = dailyRecords.filter(filterFn);
          marketRecords = marketRecords.filter(filterFn);
        }

        // Filter by subcontract (both daily and market can be linked)
        if (filterSubcontract !== "all") {
          if (filterSubcontract === "unlinked") {
            // Filter for records NOT linked to any subcontract
            dailyRecords = dailyRecords.filter((r) => !r.subcontractId);
            marketRecords = marketRecords.filter((r) => !r.subcontractId);
          } else {
            // Filter for a specific subcontract
            dailyRecords = dailyRecords.filter(
              (r) => r.subcontractId === filterSubcontract
            );
            marketRecords = marketRecords.filter(
              (r) => r.subcontractId === filterSubcontract
            );
          }
        }

        const filteredGroup = {
          ...group,
          dailyRecords,
          marketRecords,
          summary: calculateSummary(dailyRecords, marketRecords),
        };

        return filteredGroup;
      })
      .filter(
        (group) =>
          group.dailyRecords.length > 0 || group.marketRecords.length > 0
      );
  }, [dateGroups, filterStatus, filterSubcontract]);

  // Calculate money source summary from all paid/settled records
  // Uses settlement-wise counting: transactionCount = unique settlement groups
  const moneySourceSummaries = useMemo(() => {
    const summaryMap = new Map<string, MoneySourceSummary & { settlementGroups: Set<string> }>();

    // Get all paid/settled records across all date groups
    const allPaidRecords = filteredDateGroups.flatMap(group =>
      [...group.dailyRecords, ...group.marketRecords].filter(r => r.isPaid || r.paidVia === "engineer_wallet")
    );

    // Aggregate by source
    allPaidRecords.forEach(record => {
      const source = record.moneySource || "unspecified";
      const key = (source === "other_site_money" || source === "custom")
        ? `${source}:${record.moneySourceName || ""}`
        : source;

      if (!summaryMap.has(key)) {
        summaryMap.set(key, {
          source: source as PayerSource,
          displayName: source === "unspecified"
            ? "Unspecified"
            : getPayerSourceLabel(source as PayerSource, record.moneySourceName || undefined),
          totalAmount: 0,
          transactionCount: 0,
          laborerCount: 0,
          settlementGroups: new Set(),
        });
      }

      const summary = summaryMap.get(key)!;
      summary.totalAmount += record.amount;
      // Track unique settlement groups for counting (fallback to date for legacy)
      if (record.settlementGroupId) {
        summary.settlementGroups.add(record.settlementGroupId);
      } else {
        summary.settlementGroups.add(`legacy-${record.date}`);
      }
      summary.laborerCount += record.count || 1;
    });

    // Convert to final format with transactionCount = unique settlement groups
    const results: MoneySourceSummary[] = Array.from(summaryMap.values()).map(s => ({
      source: s.source,
      displayName: s.displayName,
      totalAmount: s.totalAmount,
      transactionCount: s.settlementGroups.size,
      laborerCount: s.laborerCount,
    }));

    // Sort by amount descending
    return results.sort((a, b) => b.totalAmount - a.totalAmount);
  }, [filteredDateGroups]);

  // Helper functions
  function createEmptyDateGroup(date: string): DateGroup {
    return {
      date,
      dateLabel: dayjs(date).format("MMM DD, YYYY"),
      dayName: dayjs(date).format("dddd"),
      dailyRecords: [],
      marketRecords: [],
      summary: {
        dailyCount: 0,
        dailyTotal: 0,
        dailyPending: 0,
        dailyPaid: 0,
        dailySentToEngineer: 0,
        marketCount: 0,
        marketTotal: 0,
        marketPending: 0,
        marketPaid: 0,
        marketSentToEngineer: 0,
      },
      isExpanded: false,
    };
  }

  function updateGroupSummary(group: DateGroup) {
    group.summary = calculateSummary(group.dailyRecords, group.marketRecords);
  }

  function calculateSummary(
    dailyRecords: DailyPaymentRecord[],
    marketRecords: DailyPaymentRecord[]
  ) {
    return {
      dailyCount: dailyRecords.length,
      dailyTotal: dailyRecords.reduce((sum, r) => sum + r.amount, 0),
      dailyPending: dailyRecords
        .filter((r) => !r.isPaid && r.paidVia !== "engineer_wallet")
        .reduce((sum, r) => sum + r.amount, 0),
      dailyPaid: dailyRecords
        .filter((r) => r.isPaid)
        .reduce((sum, r) => sum + r.amount, 0),
      dailySentToEngineer: dailyRecords
        .filter((r) => !r.isPaid && r.paidVia === "engineer_wallet")
        .reduce((sum, r) => sum + r.amount, 0),
      marketCount: marketRecords.length,
      marketTotal: marketRecords.reduce((sum, r) => sum + r.amount, 0),
      marketPending: marketRecords
        .filter((r) => !r.isPaid && r.paidVia !== "engineer_wallet")
        .reduce((sum, r) => sum + r.amount, 0),
      marketPaid: marketRecords
        .filter((r) => r.isPaid)
        .reduce((sum, r) => sum + r.amount, 0),
      marketSentToEngineer: marketRecords
        .filter((r) => !r.isPaid && r.paidVia === "engineer_wallet")
        .reduce((sum, r) => sum + r.amount, 0),
    };
  }

  // Handlers
  const handleToggleExpand = (date: string) => {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });

    setDateGroups((prev) =>
      prev.map((g) =>
        g.date === date ? { ...g, isExpanded: !g.isExpanded } : g
      )
    );
  };

  const handleToggleSelect = (recordId: string) => {
    setSelectedRecords((prev) => {
      const next = new Set(prev);
      if (next.has(recordId)) {
        next.delete(recordId);
      } else {
        next.add(recordId);
      }
      return next;
    });
  };

  const handleSelectAllDaily = (date: string, select: boolean) => {
    const group = dateGroups.find((g) => g.date === date);
    if (!group) return;

    setSelectedRecords((prev) => {
      const next = new Set(prev);
      group.dailyRecords.forEach((r) => {
        if (!r.isPaid) {
          if (select) {
            next.add(r.id);
          } else {
            next.delete(r.id);
          }
        }
      });
      return next;
    });
  };

  const handleSelectAllMarket = (date: string, select: boolean) => {
    const group = dateGroups.find((g) => g.date === date);
    if (!group) return;

    setSelectedRecords((prev) => {
      const next = new Set(prev);
      group.marketRecords.forEach((r) => {
        if (!r.isPaid) {
          if (select) {
            next.add(r.id);
          } else {
            next.delete(r.id);
          }
        }
      });
      return next;
    });
  };

  const openPaymentDialog = (records: DailyPaymentRecord[]) => {
    setSelectedForPayment(records);
    setPaymentDialogOpen(true);
  };

  // Handle "Notify Engineer" button click for single record
  const handleNotifyEngineer = async (record: DailyPaymentRecord) => {
    if (!record.engineerTransactionId) {
      console.error("No engineer transaction ID found");
      return;
    }

    try {
      // Fetch engineer details from the transaction
      const { data: txData, error: txError } = await supabase
        .from("site_engineer_transactions")
        .select(`
          id,
          user_id,
          amount,
          transaction_date,
          users!site_engineer_transactions_user_id_fkey (name, phone)
        `)
        .eq("id", record.engineerTransactionId)
        .single();

      if (txError || !txData) {
        console.error("Error fetching engineer transaction:", txError);
        return;
      }

      const engineerName = (txData.users as unknown as { name: string; phone: string } | null)?.name || "Engineer";
      const engineerPhone = (txData.users as unknown as { name: string; phone: string } | null)?.phone;

      // Send in-app notification
      await notifyEngineerPaymentReminder(
        supabase,
        txData.user_id,
        record.engineerTransactionId,
        record.amount,
        1, // laborerCount for single record
        selectedSite?.name,
        record.date
      );

      // Open WhatsApp with pre-filled message
      if (engineerPhone) {
        const message = generatePaymentReminderMessage({
          engineerName,
          paymentDate: dayjs(record.date).format("MMM D, YYYY"),
          amount: record.amount,
          laborerCount: 1,
          siteName: selectedSite?.name || "the site",
        });
        const whatsappUrl = generateWhatsAppUrl(engineerPhone, message);
        if (whatsappUrl) {
          window.open(whatsappUrl, "_blank");
        }
      }
    } catch (err) {
      console.error("Error notifying engineer:", err);
    }
  };

  // Handle "Notify Engineer" button click for all records on a date (bulk notification)
  const handleNotifyDate = async (date: string, records: DailyPaymentRecord[]) => {
    if (records.length === 0) return;

    try {
      // Group records by engineer transaction ID to avoid duplicate notifications
      const byEngineerTx = new Map<string, { records: DailyPaymentRecord[]; totalAmount: number }>();

      records.forEach((record) => {
        if (!record.engineerTransactionId) return;

        const existing = byEngineerTx.get(record.engineerTransactionId);
        if (existing) {
          existing.records.push(record);
          existing.totalAmount += record.amount;
        } else {
          byEngineerTx.set(record.engineerTransactionId, {
            records: [record],
            totalAmount: record.amount,
          });
        }
      });

      // For each unique engineer transaction, send notification
      for (const [txId, { records: txRecords, totalAmount }] of byEngineerTx) {
        // Fetch engineer details
        const { data: txData, error: txError } = await supabase
          .from("site_engineer_transactions")
          .select(`
            id,
            user_id,
            amount,
            transaction_date,
            users!site_engineer_transactions_user_id_fkey (name, phone)
          `)
          .eq("id", txId)
          .single();

        if (txError || !txData) {
          console.error("Error fetching engineer transaction:", txError);
          continue;
        }

        const engineerName = (txData.users as unknown as { name: string; phone: string } | null)?.name || "Engineer";
        const engineerPhone = (txData.users as unknown as { name: string; phone: string } | null)?.phone;
        const laborerCount = txRecords.length;

        // Send in-app notification
        await notifyEngineerPaymentReminder(
          supabase,
          txData.user_id,
          txId,
          totalAmount,
          laborerCount,
          selectedSite?.name,
          date
        );

        // Open WhatsApp with pre-filled message (only for first/primary engineer)
        if (engineerPhone) {
          const message = generatePaymentReminderMessage({
            engineerName,
            paymentDate: dayjs(date).format("MMM D, YYYY"),
            amount: totalAmount,
            laborerCount,
            siteName: selectedSite?.name || "the site",
          });
          const whatsappUrl = generateWhatsAppUrl(engineerPhone, message);
          if (whatsappUrl) {
            window.open(whatsappUrl, "_blank");
          }
        }
      }
    } catch (err) {
      console.error("Error notifying engineer for date:", err);
    }
  };

  // Handle opening cancel payment dialog
  const handleOpenCancelDialog = async (record: DailyPaymentRecord) => {
    try {
      let engineerName = "";

      // For engineer wallet payments, fetch engineer name
      if (record.engineerTransactionId) {
        const { data: txData, error: txError } = await supabase
          .from("site_engineer_transactions")
          .select(`
            id,
            users!site_engineer_transactions_user_id_fkey (name)
          `)
          .eq("id", record.engineerTransactionId)
          .single();

        if (txError) {
          console.error("Error fetching engineer transaction:", txError);
        }

        engineerName = (txData?.users as unknown as { name: string } | null)?.name || "Engineer";
      }
      // For direct payments, no engineer involved
      // engineerName stays empty

      setRecordToCancel(record);
      setEngineerNameToCancel(engineerName);
      setCancelDialogOpen(true);
    } catch (err) {
      console.error("Error opening cancel dialog:", err);
    }
  };

  // Handle cancel payment confirmation
  const handleCancelPayment = async (reason?: string) => {
    if (!recordToCancel || !userProfile) {
      throw new Error("Missing required data for cancellation");
    }

    // 1. Reset attendance record(s) to unpaid state
    if (recordToCancel.sourceType === "daily") {
      const { error: dailyError } = await supabase
        .from("daily_attendance")
        .update({
          is_paid: false,
          payment_date: null,
          payment_mode: null,
          paid_via: null,
          engineer_transaction_id: null,
          payment_proof_url: null,
          subcontract_id: null,
        })
        .eq("id", recordToCancel.sourceId);

      if (dailyError) throw dailyError;
    } else if (recordToCancel.sourceType === "market") {
      const { error: marketError } = await supabase
        .from("market_laborer_attendance")
        .update({
          is_paid: false,
          payment_date: null,
          payment_mode: null,
          paid_via: null,
          engineer_transaction_id: null,
          payment_proof_url: null,
        })
        .eq("id", recordToCancel.sourceId);

      if (marketError) throw marketError;
    }

    // 2. For engineer wallet payments, handle the transaction
    if (recordToCancel.engineerTransactionId) {
      const transactionId = recordToCancel.engineerTransactionId;

      // Check if there are other records linked to this transaction
      const { count: dailyCount } = await supabase
        .from("daily_attendance")
        .select("*", { count: "exact", head: true })
        .eq("engineer_transaction_id", transactionId);

      const { count: marketCount } = await supabase
        .from("market_laborer_attendance")
        .select("*", { count: "exact", head: true })
        .eq("engineer_transaction_id", transactionId);

      const remainingLinkedRecords = (dailyCount || 0) + (marketCount || 0);

      // If no more linked records, mark transaction as cancelled
      if (remainingLinkedRecords === 0) {
        const { error: txError } = await supabase
          .from("site_engineer_transactions")
          .update({
            settlement_status: "cancelled",
            cancelled_at: new Date().toISOString(),
            cancelled_by: userProfile.name,
            cancelled_by_user_id: userProfile.id,
            cancellation_reason: reason || null,
          })
          .eq("id", transactionId);

        if (txError) throw txError;
      }
    }
    // For direct payments (no engineerTransactionId), no transaction to update

    // 3. Delete the expense record
    if (recordToCancel.expenseId) {
      // Delete by expense_id (most reliable - direct link)
      await supabase
        .from("expenses")
        .delete()
        .eq("id", recordToCancel.expenseId);
    } else if (recordToCancel.engineerTransactionId) {
      // Fallback: For engineer payments - delete by transaction ID
      await supabase
        .from("expenses")
        .delete()
        .eq("engineer_transaction_id", recordToCancel.engineerTransactionId);
    } else if (selectedSite && recordToCancel.subcontractId) {
      // Fallback for old direct payments: match by subcontract, date, amount
      await supabase
        .from("expenses")
        .delete()
        .eq("site_id", selectedSite.id)
        .eq("contract_id", recordToCancel.subcontractId)
        .eq("date", recordToCancel.date)
        .eq("amount", recordToCancel.amount)
        .eq("module", "labor");
    }

    // Note: Subcontract paid totals are calculated by summing linked expenses,
    // so deleting the expense above automatically updates the subcontract's paid amount.

    // 4. Refresh data
    fetchData();
    onDataChange?.();
  };

  // Handle opening bulk cancel confirmation
  const handleOpenBulkCancelDialog = (records: DailyPaymentRecord[]) => {
    setBulkCancelRecords(records);
    // Use the first record to show in dialog (for display purposes)
    if (records.length > 0) {
      setRecordToCancel({
        ...records[0],
        // Override laborer name to show count
        laborerName: `${records.length} payments`,
        // Sum up total amount
        amount: records.reduce((sum, r) => sum + r.amount, 0),
      });
      setEngineerNameToCancel(""); // Direct payments don't have engineer
      setCancelDialogOpen(true);
    }
  };

  // Handle bulk cancel confirmation
  const handleBulkCancelPayment = async (reason?: string) => {
    if (bulkCancelRecords.length === 0 || !userProfile) {
      throw new Error("Missing required data for bulk cancellation");
    }

    setBulkCancelProcessing(true);

    try {
      // Process each record
      for (const record of bulkCancelRecords) {
        if (record.sourceType === "daily") {
          const { error: dailyError } = await supabase
            .from("daily_attendance")
            .update({
              is_paid: false,
              payment_date: null,
              payment_mode: null,
              paid_via: null,
              engineer_transaction_id: null,
              payment_proof_url: null,
              subcontract_id: null,
            })
            .eq("id", record.sourceId);

          if (dailyError) throw dailyError;
        } else if (record.sourceType === "market") {
          const { error: marketError } = await supabase
            .from("market_laborer_attendance")
            .update({
              is_paid: false,
              payment_date: null,
              payment_mode: null,
              paid_via: null,
              engineer_transaction_id: null,
              payment_proof_url: null,
            })
            .eq("id", record.sourceId);

          if (marketError) throw marketError;
        }

        // Delete the expense record for this payment
        if (record.expenseId) {
          // Delete by expense_id (most reliable - direct link)
          await supabase
            .from("expenses")
            .delete()
            .eq("id", record.expenseId);
        } else if (record.engineerTransactionId) {
          // Fallback: For engineer payments - delete by transaction ID
          await supabase
            .from("expenses")
            .delete()
            .eq("engineer_transaction_id", record.engineerTransactionId);
        } else if (selectedSite && record.subcontractId) {
          // Fallback for old direct payments: match by subcontract, date, amount
          await supabase
            .from("expenses")
            .delete()
            .eq("site_id", selectedSite.id)
            .eq("contract_id", record.subcontractId)
            .eq("date", record.date)
            .eq("amount", record.amount)
            .eq("module", "labor");
        }

        // Note: Subcontract paid totals are calculated by summing linked expenses,
        // so deleting the expense above automatically updates the subcontract's paid amount.
      }

      // Refresh data
      fetchData();
      onDataChange?.();
    } finally {
      setBulkCancelProcessing(false);
      setBulkCancelRecords([]);
    }
  };

  const handlePaymentSuccess = () => {
    setSelectedRecords(new Set());
    fetchData();
    onDataChange?.();
  };

  // Handle engineer clicking "Settle Now" button
  const handleEngineerSettle = (transactionId: string) => {
    setEngineerSettlementTransactionId(transactionId);
    setEngineerSettlementDialogOpen(true);
  };

  // Handle successful engineer settlement
  const handleEngineerSettlementSuccess = () => {
    setEngineerSettlementDialogOpen(false);
    setEngineerSettlementTransactionId(null);
    fetchData();
    onDataChange?.();
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
    <Box
      ref={tableContainerRef}
      sx={{
        bgcolor: isFullscreen ? "background.paper" : "transparent",
        p: isFullscreen ? 2 : 0,
        height: isFullscreen ? "100vh" : "auto",
        overflow: isFullscreen ? "auto" : "visible",
        position: "relative",
      }}
    >
      {/* Fullscreen Header */}
      {isFullscreen && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            mb: 2,
            pb: 1,
            borderBottom: 1,
            borderColor: "divider",
          }}
        >
          <Typography variant="h6" fontWeight={600}>
            Daily & Market Settlements
          </Typography>
          <IconButton onClick={exitFullscreen} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      )}

      {/* Summary Dashboard */}
      {!loading && dateGroups.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Grid container spacing={2}>
            {/* Total Salary */}
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Card
                sx={{
                  bgcolor: "primary.50",
                  borderLeft: 4,
                  borderColor: "primary.main",
                }}
              >
                <CardContent sx={{ py: 2, "&:last-child": { pb: 2 } }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                    <SalaryIcon color="primary" fontSize="small" />
                    <Typography variant="caption" color="text.secondary">
                      Total Salary
                    </Typography>
                  </Box>
                  <Typography variant="h5" fontWeight={600} color="primary.dark">
                    Rs.{dashboardSummary.totalSalary.toLocaleString()}
                  </Typography>
                  <Chip
                    label={`${dashboardSummary.recordCount} records`}
                    size="small"
                    color="primary"
                    variant="outlined"
                    sx={{ mt: 1 }}
                  />
                </CardContent>
              </Card>
            </Grid>

            {/* Paid Amount */}
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Card
                sx={{
                  bgcolor: "success.50",
                  borderLeft: 4,
                  borderColor: "success.main",
                }}
              >
                <CardContent sx={{ py: 2, "&:last-child": { pb: 2 } }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                    <PaidIcon color="success" fontSize="small" />
                    <Typography variant="caption" color="text.secondary">
                      Paid
                    </Typography>
                  </Box>
                  <Typography variant="h5" fontWeight={600} color="success.dark">
                    Rs.{dashboardSummary.totalPaid.toLocaleString()}
                  </Typography>
                  <Chip
                    label={`${dashboardSummary.paidCount} paid`}
                    size="small"
                    color="success"
                    variant="outlined"
                    sx={{ mt: 1 }}
                  />
                </CardContent>
              </Card>
            </Grid>

            {/* Outstanding */}
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Card
                sx={{
                  bgcolor: dashboardSummary.totalDue > 0 ? "error.50" : "grey.50",
                  borderLeft: 4,
                  borderColor: dashboardSummary.totalDue > 0 ? "error.main" : "grey.400",
                }}
              >
                <CardContent sx={{ py: 2, "&:last-child": { pb: 2 } }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                    <OutstandingIcon color={dashboardSummary.totalDue > 0 ? "error" : "disabled"} fontSize="small" />
                    <Typography variant="caption" color="text.secondary">
                      Outstanding
                    </Typography>
                  </Box>
                  <Typography
                    variant="h5"
                    fontWeight={600}
                    color={dashboardSummary.totalDue > 0 ? "error.dark" : "text.disabled"}
                  >
                    Rs.{dashboardSummary.totalDue.toLocaleString()}
                  </Typography>
                  {dashboardSummary.pendingWithEngineer > 0 && (
                    <Chip
                      label={`Rs.${dashboardSummary.pendingWithEngineer.toLocaleString()} with engineer (${dashboardSummary.pendingWithEngineerCount} records)`}
                      size="small"
                      color="warning"
                      variant="outlined"
                      sx={{ mt: 1 }}
                    />
                  )}
                </CardContent>
              </Card>
            </Grid>

            {/* Payment Progress */}
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Card
                sx={{
                  bgcolor: dashboardSummary.progress >= 100
                    ? "success.50"
                    : dashboardSummary.progress >= 50
                    ? "info.50"
                    : "warning.50",
                  borderLeft: 4,
                  borderColor: dashboardSummary.progress >= 100
                    ? "success.main"
                    : dashboardSummary.progress >= 50
                    ? "info.main"
                    : "warning.main",
                }}
              >
                <CardContent sx={{ py: 2, "&:last-child": { pb: 2 } }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                    <ProgressIcon
                      color={
                        dashboardSummary.progress >= 100
                          ? "success"
                          : dashboardSummary.progress >= 50
                          ? "info"
                          : "warning"
                      }
                      fontSize="small"
                    />
                    <Typography variant="caption" color="text.secondary">
                      Progress
                    </Typography>
                  </Box>
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", py: 1 }}>
                    <Box sx={{ position: "relative", display: "inline-flex" }}>
                      <CircularProgress
                        variant="determinate"
                        value={Math.min(dashboardSummary.progress, 100)}
                        size={70}
                        thickness={5}
                        sx={{
                          color: dashboardSummary.progress >= 100
                            ? "success.main"
                            : dashboardSummary.progress >= 50
                            ? "info.main"
                            : "warning.main",
                        }}
                      />
                      <Box
                        sx={{
                          top: 0,
                          left: 0,
                          bottom: 0,
                          right: 0,
                          position: "absolute",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Typography
                          variant="body1"
                          fontWeight={700}
                          color={
                            dashboardSummary.progress >= 100
                              ? "success.dark"
                              : dashboardSummary.progress >= 50
                              ? "info.dark"
                              : "warning.dark"
                          }
                        >
                          {Math.round(dashboardSummary.progress)}%
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      )}

      {/* Fullscreen Toggle (Mobile only, when not fullscreen) */}
      {!isFullscreen && isMobile && (
        <Tooltip title="View fullscreen (rotate)">
          <IconButton
            onClick={enterFullscreen}
            sx={{
              position: "absolute",
              top: 8,
              right: 8,
              zIndex: 10,
              bgcolor: "rgba(255,255,255,0.95)",
              boxShadow: 2,
              "&:hover": { bgcolor: "rgba(255,255,255,1)" },
            }}
          >
            <FullscreenIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}

      {/* Filters */}
      <Box
        sx={{
          display: "flex",
          gap: { xs: 1, sm: 2 },
          mb: 2,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <FormControl size="small" sx={{ minWidth: { xs: 100, sm: 150 } }}>
          <InputLabel>Status</InputLabel>
          <Select
            value={filterStatus}
            onChange={(e) =>
              setFilterStatus(
                e.target.value as "all" | "pending" | "sent_to_engineer" | "paid"
              )
            }
            label="Status"
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="pending">Pending</MenuItem>
            <MenuItem value="sent_to_engineer">With Engineer</MenuItem>
            <MenuItem value="paid">Paid</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: { xs: 120, sm: 200 } }}>
          <InputLabel>Subcontract</InputLabel>
          <Select
            value={filterSubcontract}
            onChange={(e) => setFilterSubcontract(e.target.value)}
            label="Subcontract"
          >
            <MenuItem value="all">All</MenuItem>
            <MenuItem value="unlinked">Unlinked</MenuItem>
            {subcontracts.map((sc) => (
              <MenuItem key={sc.id} value={sc.id}>
                {sc.title}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Box sx={{ flexGrow: 1 }} />

        {/* Fullscreen toggle button (desktop) */}
        {!isFullscreen && !isMobile && (
          <Tooltip title="View fullscreen">
            <IconButton onClick={enterFullscreen} size="small">
              <FullscreenIcon />
            </IconButton>
          </Tooltip>
        )}

        <Button
          startIcon={<RefreshIcon />}
          onClick={fetchData}
          variant="outlined"
          size="small"
        >
          Refresh
        </Button>
      </Box>

      {/* Money Source Summary Card */}
      {moneySourceSummaries.length > 0 && (
        <MoneySourceSummaryCard
          summaries={moneySourceSummaries}
          allRecords={filteredDateGroups.flatMap(g => [...g.dailyRecords, ...g.marketRecords])}
        />
      )}

      {/* Salary Settlement Table */}
      {filteredDateGroups.length === 0 ? (
        <Alert severity="info">
          No payment records found for the selected date range and filters.
        </Alert>
      ) : (
        <SalarySettlementTable
          dateGroups={filteredDateGroups}
          contractOnlyDates={contractOnlyDates}
          holidays={holidays}
          loading={loading}
          disabled={!canEdit}
          isAdmin={isAdmin}
          currentUserId={userProfile?.id}
          onPayDate={(date, records) => openPaymentDialog(records)}
          onViewDate={(date, group) => {
            setViewDialogDate(date);
            setViewDialogGroup(group);
            setViewDialogOpen(true);
          }}
          onEditDate={(date, group) => {
            setEditDialogDate(date);
            setEditDialogGroup(group);
            setEditDialogOpen(true);
          }}
          onCancelDate={(date, records) => {
            setDateCancelDate(date);
            setDateCancelRecords(records);
            setDateCancelDialogOpen(true);
          }}
          onDeleteDate={(date, records) => {
            // Delete uses same dialog as cancel
            setDateCancelDate(date);
            setDateCancelRecords(records);
            setDateCancelDialogOpen(true);
          }}
          onNotifyDate={(date, records) => handleNotifyDate(date, records)}
          onConfirmSettlement={(transactionId) => {
            setSelectedTransactionId(transactionId);
            setSettlementDetailsOpen(true);
          }}
          onEditSettlements={(date, records) => {
            setDateSettlementsEditDate(date);
            setDateSettlementsEditRecords(records);
            setDateSettlementsEditOpen(true);
          }}
          onViewSettlementRef={(ref) => {
            setSelectedSettlementRef(ref);
            setSettlementRefDialogOpen(true);
          }}
          onEngineerSettle={handleEngineerSettle}
          highlightRef={highlightRef}
        />
      )}

      {/* Payment Dialog */}
      <PaymentDialog
        open={paymentDialogOpen}
        onClose={() => setPaymentDialogOpen(false)}
        dailyRecords={selectedForPayment}
        allowSubcontractLink
        onSuccess={handlePaymentSuccess}
      />

      {/* Cancel Payment Dialog (single record) */}
      <CancelPaymentDialog
        open={cancelDialogOpen}
        onClose={() => {
          setCancelDialogOpen(false);
          setRecordToCancel(null);
          setEngineerNameToCancel("");
          setBulkCancelRecords([]);
        }}
        record={recordToCancel}
        engineerName={engineerNameToCancel}
        onConfirm={bulkCancelRecords.length > 0 ? handleBulkCancelPayment : handleCancelPayment}
      />

      {/* Date Edit Dialog */}
      <DateEditDialog
        open={editDialogOpen}
        onClose={() => {
          setEditDialogOpen(false);
          setEditDialogDate("");
          setEditDialogGroup(null);
        }}
        date={editDialogDate}
        group={editDialogGroup}
        onSuccess={() => {
          fetchData();
          onDataChange?.();
        }}
      />

      {/* Date Cancel Dialog (bulk cancel) */}
      <DateCancelDialog
        open={dateCancelDialogOpen}
        onClose={() => {
          setDateCancelDialogOpen(false);
          setDateCancelDate("");
          setDateCancelRecords([]);
        }}
        date={dateCancelDate}
        records={dateCancelRecords}
        onSuccess={() => {
          fetchData();
          onDataChange?.();
        }}
      />

      {/* Settlement Details Dialog (for admin to view and confirm engineer settlements) */}
      {selectedTransactionId && (
        <SettlementDetailsDialog
          open={settlementDetailsOpen}
          onClose={() => {
            setSettlementDetailsOpen(false);
            setSelectedTransactionId(null);
          }}
          transactionId={selectedTransactionId}
          onSuccess={() => {
            fetchData();
            onDataChange?.();
          }}
        />
      )}

      {/* View Details Dialog (shows settlement summary with proofs) */}
      <DateViewDetailsDialog
        open={viewDialogOpen}
        onClose={() => {
          setViewDialogOpen(false);
          setViewDialogGroup(null);
        }}
        date={viewDialogDate}
        group={viewDialogGroup}
      />

      {/* Date Settlements Edit Dialog (all records for a date) */}
      <DateSettlementsEditDialog
        open={dateSettlementsEditOpen}
        onClose={() => {
          setDateSettlementsEditOpen(false);
          setDateSettlementsEditRecords([]);
        }}
        date={dateSettlementsEditDate}
        records={dateSettlementsEditRecords}
        onSuccess={() => {
          fetchData();
          onDataChange?.();
        }}
      />

      {/* Settlement Ref Detail Dialog (view full settlement details by ref code) */}
      <SettlementRefDetailDialog
        open={settlementRefDialogOpen}
        onClose={() => {
          setSettlementRefDialogOpen(false);
          setSelectedSettlementRef(null);
        }}
        settlementReference={selectedSettlementRef}
        canEdit={canEdit}
        onEdit={(details) => {
          setEditingSettlement(details);
          setDailySettlementEditOpen(true);
        }}
        onDelete={(details) => {
          setSettlementToDelete(details);
          setDeleteSettlementDialogOpen(true);
        }}
      />

      {/* Daily Settlement Edit Dialog */}
      <DailySettlementEditDialog
        open={dailySettlementEditOpen}
        onClose={() => {
          setDailySettlementEditOpen(false);
          setEditingSettlement(null);
        }}
        settlement={editingSettlement}
        onSuccess={() => {
          setDailySettlementEditOpen(false);
          setEditingSettlement(null);
          setSettlementRefDialogOpen(false);
          setSelectedSettlementRef(null);
          fetchData();
          onDataChange?.();
        }}
        onDelete={(details) => {
          setSettlementToDelete(details);
          setDeleteSettlementDialogOpen(true);
        }}
      />

      {/* Delete Daily Settlement Confirmation Dialog */}
      <DeleteDailySettlementDialog
        open={deleteSettlementDialogOpen}
        onClose={() => {
          setDeleteSettlementDialogOpen(false);
          setSettlementToDelete(null);
        }}
        settlement={settlementToDelete}
        onSuccess={() => {
          setDeleteSettlementDialogOpen(false);
          setSettlementToDelete(null);
          setDailySettlementEditOpen(false);
          setEditingSettlement(null);
          setSettlementRefDialogOpen(false);
          setSelectedSettlementRef(null);
          fetchData();
          onDataChange?.();
        }}
      />

      {/* Engineer Settlement Dialog (for Settle Now button) */}
      {engineerSettlementTransactionId && (
        <SettlementFormDialog
          open={engineerSettlementDialogOpen}
          onClose={() => {
            setEngineerSettlementDialogOpen(false);
            setEngineerSettlementTransactionId(null);
          }}
          transactionId={engineerSettlementTransactionId}
          onSuccess={handleEngineerSettlementSuccess}
        />
      )}
    </Box>
  );
}
