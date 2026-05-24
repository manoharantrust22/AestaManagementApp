"use client";

import React, { useMemo, useState, useEffect, useRef } from "react";
import {
  Box,
  Typography,
  Chip,
  IconButton,
  Tooltip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  useTheme,
  alpha,
  Divider,
  Dialog,
  DialogContent,
  DialogTitle,
  Button,
} from "@mui/material";
import {
  Visibility as ViewIcon,
  VisibilityOff as VisibilityOffIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Cancel as CancelIcon,
  Notifications as NotifyIcon,
  MoreVert as MoreVertIcon,
  Payment as PaymentIcon,
  Person as PersonIcon,
  Groups as GroupsIcon,
  CheckCircle as PaidIcon,
  Schedule as PendingIcon,
  Send as SentIcon,
  PhotoCamera as PhotoIcon,
  Close as CloseIcon,
  TaskAlt as ConfirmIcon,
  Warning as WarningIcon,
  EventNote as AttendanceIcon,
  ArrowForward as ArrowForwardIcon,
  Link as LinkIcon,
  BeachAccess as HolidayIcon,
  Engineering as ContractIcon,
} from "@mui/icons-material";
import { useRouter } from "next/navigation";
import DataTable, { type MRT_ColumnDef } from "@/components/common/DataTable";
import dayjs from "dayjs";
import type { DateGroup, DailyPaymentRecord } from "@/types/payment.types";
import {
  groupHolidays,
  formatHolidayDateRange,
  formatHolidayDayRange,
  type HolidayGroup,
  type SiteHoliday,
} from "@/lib/utils/holidayUtils";
import { getPayerSourceLabel, getPayerSourceColor } from "@/components/settlement/PayerSourceSelector";
import PayerSourceChip from "@/components/settlement/PayerSourceChip";
import type { PayerSource } from "@/types/settlement.types";

interface HolidayInfo {
  id: string;
  date: string;
  reason: string | null;
  is_paid_holiday: boolean | null;
}

interface SalarySettlementTableProps {
  dateGroups: DateGroup[];
  contractOnlyDates?: string[];
  holidays?: HolidayInfo[];
  loading?: boolean;
  disabled?: boolean;
  isAdmin?: boolean;
  currentUserId?: string;
  onPayDate: (date: string, records: DailyPaymentRecord[]) => void;
  onViewDate: (date: string, group: DateGroup) => void;
  onEditDate: (date: string, group: DateGroup) => void;
  onCancelDate: (date: string, records: DailyPaymentRecord[]) => void;
  onDeleteDate: (date: string, records: DailyPaymentRecord[]) => void;
  onNotifyDate: (date: string, records: DailyPaymentRecord[]) => void;
  onConfirmSettlement?: (transactionId: string) => void;
  onEditSettlements?: (date: string, records: DailyPaymentRecord[]) => void;
  onViewSettlementRef?: (ref: string) => void;
  onEngineerSettle?: (transactionId: string) => void;
  highlightRef?: string | null;
}

// Row data structure for the MRT table
interface DateRowData {
  id: string;
  date: string;
  dateLabel: string;
  dayName: string;
  dailyCount: number;
  marketCount: number;
  dailyLaborers: number;
  marketLaborers: number;
  totalAmount: number;
  pendingAmount: number;
  paidAmount: number;
  sentToEngineerAmount: number;
  awaitingApprovalAmount: number;
  status: "all_paid" | "all_pending" | "partial" | "sent_to_engineer" | "contract_only" | "holiday";
  hasPendingRecords: boolean;
  hasSentToEngineerRecords: boolean;
  hasPaidRecords: boolean;
  hasAwaitingApprovalRecords: boolean;
  awaitingApprovalTransactionId: string | null;
  // For expanded row
  dailyRecords: DailyPaymentRecord[];
  marketRecords: DailyPaymentRecord[];
  // Settlement references for this date
  settlementReferences: string[];
  // Payment sources for this date (unique sources)
  paymentSources: Array<{ source: string; sourceName: string | null }>;
  // Original group for actions
  group: DateGroup;
  // New fields for indicators
  isContractOnly?: boolean;
  isHoliday?: boolean;
  holidayReason?: string | null;
  // Grouped holiday info (for holiday-only rows that span multiple days)
  holidayGroup?: HolidayGroup | null;
  // Engineer user ID for "With Engineer" records (for Settle Now button)
  withEngineerUserId: string | null;
  withEngineerTransactionId: string | null;
}

export default function SalarySettlementTable({
  dateGroups,
  contractOnlyDates = [],
  holidays = [],
  loading = false,
  disabled = false,
  isAdmin = false,
  currentUserId,
  onPayDate,
  onViewDate,
  onEditDate,
  onCancelDate,
  onDeleteDate,
  onNotifyDate,
  onConfirmSettlement,
  onEditSettlements,
  onViewSettlementRef,
  onEngineerSettle,
  highlightRef,
}: SalarySettlementTableProps) {
  const theme = useTheme();
  const router = useRouter();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [hasScrolledToHighlight, setHasScrolledToHighlight] = useState(false);
  const [selectedRow, setSelectedRow] = useState<DateRowData | null>(null);
  const [viewingProof, setViewingProof] = useState<{
    url: string;
    type: "company" | "engineer";
  } | null>(null);

  // Quick filter states for hiding holidays and contract-only dates
  // Initialize from sessionStorage to persist across page refreshes/data changes
  const [showHolidays, setShowHolidays] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const stored = sessionStorage.getItem("salarySettlement_showHolidays");
      return stored === null ? true : stored === "true";
    } catch {
      return true;
    }
  });
  const [showContractOnly, setShowContractOnly] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const stored = sessionStorage.getItem("salarySettlement_showContractOnly");
      return stored === null ? true : stored === "true";
    } catch {
      return true;
    }
  });

  // Persist filter preferences to sessionStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem("salarySettlement_showHolidays", String(showHolidays));
      } catch {
        // Ignore storage errors
      }
    }
  }, [showHolidays]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem("salarySettlement_showContractOnly", String(showContractOnly));
      } catch {
        // Ignore storage errors
      }
    }
  }, [showContractOnly]);

  // Redirect dialog state for delete prevention
  const [deleteRedirectDialog, setDeleteRedirectDialog] = useState<{
    open: boolean;
    date: string;
    records: DailyPaymentRecord[];
  } | null>(null);

  // Handle redirect to attendance page
  const handleRedirectToAttendance = (date: string) => {
    const params = new URLSearchParams({
      date,
      action: "edit_or_delete",
    });
    router.push(`/site/attendance?${params.toString()}`);
  };

  // Handle navigation to attendance page from date click (with auto-expand)
  const handleNavigateToAttendance = (date: string) => {
    const params = new URLSearchParams({
      date,
      source: "settlement",
    });
    router.push(`/site/attendance?${params.toString()}`);
  };

  // Transform DateGroup[] to row data
  const tableData: DateRowData[] = useMemo(() => {
    // Create a holiday lookup map
    const holidayMap = new Map(
      holidays.map(h => [h.date, h])
    );

    // Get all dates that already have daily/market data
    const existingDates = new Set(dateGroups.map(g => g.date));

    // Transform existing dateGroups
    const dateGroupRows: DateRowData[] = dateGroups.map((group) => {
      const allRecords = [...group.dailyRecords, ...group.marketRecords];
      const pendingRecords = allRecords.filter(
        (r) => !r.isPaid && r.paidVia !== "engineer_wallet"
      );
      const sentToEngineerRecords = allRecords.filter(
        (r) => !r.isPaid && r.paidVia === "engineer_wallet"
      );
      const paidRecords = allRecords.filter((r) => r.isPaid);

      // "With Engineer" records - sent to engineer but NOT yet submitted (still pending_settlement)
      const withEngineerRecords = sentToEngineerRecords.filter(
        (r) => r.settlementStatus !== "pending_confirmation"
      );

      // Get engineer user ID and transaction ID from the first "With Engineer" record
      const withEngineerUserId = withEngineerRecords.length > 0
        ? withEngineerRecords[0].engineerUserId
        : null;
      const withEngineerTransactionId = withEngineerRecords.length > 0
        ? withEngineerRecords[0].engineerTransactionId
        : null;

      // Records awaiting admin approval (engineer submitted settlement)
      const awaitingApprovalRecords = allRecords.filter(
        (r) => r.settlementStatus === "pending_confirmation" && r.engineerTransactionId
      );

      const pendingAmount = pendingRecords.reduce((sum, r) => sum + r.amount, 0);
      const sentToEngineerAmount = sentToEngineerRecords.reduce(
        (sum, r) => sum + r.amount,
        0
      );
      const paidAmount = paidRecords.reduce((sum, r) => sum + r.amount, 0);
      const awaitingApprovalAmount = awaitingApprovalRecords.reduce(
        (sum, r) => sum + r.amount,
        0
      );
      const totalAmount = pendingAmount + sentToEngineerAmount + paidAmount;

      // Get the first transaction ID for awaiting approval records (all should have same transaction)
      const awaitingApprovalTransactionId = awaitingApprovalRecords.length > 0
        ? awaitingApprovalRecords[0].engineerTransactionId
        : null;

      // Determine status
      let status: DateRowData["status"] = "partial";
      if (allRecords.length > 0) {
        if (paidRecords.length === allRecords.length) {
          status = "all_paid";
        } else if (
          pendingRecords.length === allRecords.length ||
          (pendingRecords.length > 0 && sentToEngineerRecords.length === 0 && paidRecords.length === 0)
        ) {
          status = "all_pending";
        } else if (
          sentToEngineerRecords.length > 0 &&
          pendingRecords.length === 0 &&
          paidRecords.length === 0
        ) {
          status = "sent_to_engineer";
        }
      }

      // Count unique daily laborers
      const dailyLaborers = group.dailyRecords.length;
      // Count total market laborers (sum of count)
      const marketLaborers = group.marketRecords.reduce(
        (sum, r) => sum + (r.count || 1),
        0
      );

      // Check if this date is a holiday
      const holiday = holidayMap.get(group.date);

      return {
        id: group.date,
        date: group.date,
        dateLabel: group.dateLabel,
        dayName: group.dayName,
        dailyCount: group.dailyRecords.length,
        marketCount: group.marketRecords.length,
        dailyLaborers,
        marketLaborers,
        totalAmount,
        pendingAmount,
        paidAmount,
        sentToEngineerAmount,
        awaitingApprovalAmount,
        status,
        hasPendingRecords: pendingRecords.length > 0,
        hasSentToEngineerRecords: sentToEngineerRecords.length > 0,
        hasPaidRecords: paidRecords.length > 0,
        hasAwaitingApprovalRecords: awaitingApprovalRecords.length > 0,
        awaitingApprovalTransactionId,
        dailyRecords: group.dailyRecords,
        marketRecords: group.marketRecords,
        // Collect unique settlement references from all records
        settlementReferences: [...new Set([
          ...group.dailyRecords.map(r => r.settlementReference),
          ...group.marketRecords.map(r => r.settlementReference),
        ].filter((ref): ref is string => ref !== null && ref !== undefined))],
        // Collect unique payment sources from paid/settled records
        paymentSources: (() => {
          const allRecs = [...group.dailyRecords, ...group.marketRecords];
          const paidOrSettled = allRecs.filter(r => r.isPaid || r.paidVia === "engineer_wallet");
          const sourceMap = new Map<string, { source: string; sourceName: string | null }>();
          paidOrSettled.forEach(r => {
            // Split rows must NOT collapse together — each split has its own
            // payer_source_split JSONB and represents a distinct settlement.
            // Use settlementGroupId (or record id as fallback) so every split
            // row gets its own bucket. Legacy single-source rows continue to
            // bucket by source+name as before.
            const key = (r.moneySource as string) === "split"
              ? `split:${r.settlementGroupId ?? r.id}`
              : r.moneySource
                ? (r.moneySource === "other_site_money" || r.moneySource === "custom")
                  ? `${r.moneySource}:${r.moneySourceName || ""}`
                  : r.moneySource
                : "unspecified";
            if (!sourceMap.has(key)) {
              sourceMap.set(key, {
                source: r.moneySource || "unspecified",
                sourceName: r.moneySourceName || null,
              });
            }
          });
          return Array.from(sourceMap.values());
        })(),
        group,
        // Holiday indicator
        isHoliday: !!holiday,
        holidayReason: holiday?.reason || null,
        // Engineer user ID for "With Engineer" records (for Settle Now button)
        withEngineerUserId,
        withEngineerTransactionId,
      };
    });

    // Create rows for contract-only dates (no daily/market)
    const contractOnlyRows: DateRowData[] = contractOnlyDates
      .filter(date => !existingDates.has(date))
      .map(date => {
        const holiday = holidayMap.get(date);
        return {
          id: date,
          date,
          dateLabel: dayjs(date).format("MMM DD, YYYY"),
          dayName: dayjs(date).format("dddd"),
          dailyCount: 0,
          marketCount: 0,
          dailyLaborers: 0,
          marketLaborers: 0,
          totalAmount: 0,
          pendingAmount: 0,
          paidAmount: 0,
          sentToEngineerAmount: 0,
          awaitingApprovalAmount: 0,
          status: "contract_only" as const,
          hasPendingRecords: false,
          hasSentToEngineerRecords: false,
          hasPaidRecords: false,
          hasAwaitingApprovalRecords: false,
          awaitingApprovalTransactionId: null,
          dailyRecords: [],
          marketRecords: [],
          settlementReferences: [],
          paymentSources: [],
          group: {
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
          },
          isContractOnly: true,
          isHoliday: !!holiday,
          holidayReason: holiday?.reason || null,
          withEngineerUserId: null,
          withEngineerTransactionId: null,
        };
      });

    // Create rows for holiday-only dates (no attendance at all)
    // Group consecutive holidays with the same reason
    const allDatesWithRows = new Set([
      ...existingDates,
      ...contractOnlyDates,
    ]);

    // Filter holidays that don't have any rows and convert to SiteHoliday format for grouping
    const holidaysWithoutRows = holidays
      .filter(h => !allDatesWithRows.has(h.date))
      .map(h => ({
        id: h.id,
        site_id: "", // Not needed for grouping
        date: h.date,
        reason: h.reason,
        is_paid_holiday: h.is_paid_holiday,
        created_at: "",
        created_by: null,
      })) as SiteHoliday[];

    // Group consecutive holidays
    const holidayGroups = groupHolidays(holidaysWithoutRows);

    // Create one row per holiday group
    const holidayOnlyRows: DateRowData[] = holidayGroups.map(group => ({
      id: group.startDate, // Use start date as ID
      date: group.startDate,
      dateLabel: formatHolidayDateRange(group),
      dayName: group.dayCount === 1
        ? dayjs(group.startDate).format("dddd")
        : formatHolidayDayRange(group),
      dailyCount: 0,
      marketCount: 0,
      dailyLaborers: 0,
      marketLaborers: 0,
      totalAmount: 0,
      pendingAmount: 0,
      paidAmount: 0,
      sentToEngineerAmount: 0,
      awaitingApprovalAmount: 0,
      status: "holiday" as const,
      hasPendingRecords: false,
      hasSentToEngineerRecords: false,
      hasPaidRecords: false,
      hasAwaitingApprovalRecords: false,
      awaitingApprovalTransactionId: null,
      dailyRecords: [],
      marketRecords: [],
      settlementReferences: [],
      paymentSources: [],
      group: {
        date: group.startDate,
        dateLabel: formatHolidayDateRange(group),
        dayName: group.dayCount === 1
          ? dayjs(group.startDate).format("dddd")
          : formatHolidayDayRange(group),
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
      },
      isContractOnly: false,
      isHoliday: true,
      holidayReason: group.reason,
      holidayGroup: group,
      withEngineerUserId: null,
      withEngineerTransactionId: null,
    }));

    // Merge and sort all rows by date descending
    return [...dateGroupRows, ...contractOnlyRows, ...holidayOnlyRows].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [dateGroups, contractOnlyDates, holidays]);

  // Apply quick filters to tableData
  const filteredTableData = useMemo(() => {
    return tableData.filter((row) => {
      // Filter out pure holiday rows (status === "holiday") when showHolidays is false
      if (!showHolidays && row.status === "holiday") {
        return false;
      }
      // Filter out contract-only rows when showContractOnly is false
      if (!showContractOnly && row.isContractOnly) {
        return false;
      }
      return true;
    });
  }, [tableData, showHolidays, showContractOnly]);

  // Auto-scroll to highlighted row when data loads
  useEffect(() => {
    if (!highlightRef || hasScrolledToHighlight || tableData.length === 0 || loading) {
      return;
    }

    // Find the row index that contains the highlighted reference
    const highlightedRowIndex = tableData.findIndex(row =>
      row.settlementReferences.includes(highlightRef)
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
  }, [highlightRef, tableData, hasScrolledToHighlight, loading]);

  // Handle menu open
  const handleMenuOpen = (
    event: React.MouseEvent<HTMLElement>,
    row: DateRowData
  ) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
    setSelectedRow(row);
  };

  // Handle menu close
  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedRow(null);
  };

  // Get all pending/sent records for a date
  const getActionableRecords = (group: DateGroup) => {
    return [...group.dailyRecords, ...group.marketRecords];
  };

  // Get sent to engineer records
  const getSentToEngineerRecords = (group: DateGroup) => {
    return [...group.dailyRecords, ...group.marketRecords].filter(
      (r) => !r.isPaid && r.paidVia === "engineer_wallet"
    );
  };

  // Get paid records (for cancel/delete)
  const getPaidRecords = (group: DateGroup) => {
    return [...group.dailyRecords, ...group.marketRecords].filter(
      (r) => r.isPaid
    );
  };

  // Get pending records
  const getPendingRecords = (group: DateGroup) => {
    return [...group.dailyRecords, ...group.marketRecords].filter(
      (r) => !r.isPaid && r.paidVia !== "engineer_wallet"
    );
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return `Rs.${amount.toLocaleString("en-IN")}`;
  };

  // Define columns
  const columns = useMemo<MRT_ColumnDef<DateRowData>[]>(
    () => [
      {
        accessorKey: "date",
        header: "Date",
        size: 120,
        Cell: ({ row }) => (
          <Box>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 0.5,
                cursor: "pointer",
                "&:hover": {
                  color: "primary.main",
                  "& .date-text": {
                    textDecoration: "underline",
                  },
                },
              }}
              onClick={(e) => {
                e.stopPropagation();
                handleNavigateToAttendance(row.original.date);
              }}
            >
              <Typography variant="body2" fontWeight={600} className="date-text">
                {row.original.dateLabel}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap", mt: 0.25 }}>
              <Typography variant="caption" color="text.secondary">
                {row.original.dayName}
              </Typography>
              {row.original.isContractOnly && (
                <Tooltip title="Only contract labor worked on this date">
                  <Chip
                    icon={<ContractIcon sx={{ fontSize: 10 }} />}
                    label="Contract Only"
                    size="small"
                    color="info"
                    variant="outlined"
                    sx={{ height: 18, fontSize: "0.6rem", "& .MuiChip-icon": { ml: 0.5 } }}
                  />
                </Tooltip>
              )}
              {row.original.isHoliday && showHolidays && (
                <Tooltip title={
                  row.original.holidayGroup && row.original.holidayGroup.dayCount > 1
                    ? `${row.original.holidayGroup.dayCount} days: ${row.original.holidayReason || "Holiday"}`
                    : row.original.holidayReason || "Holiday"
                }>
                  <Chip
                    icon={<HolidayIcon sx={{ fontSize: 10 }} />}
                    label={
                      row.original.holidayGroup && row.original.holidayGroup.dayCount > 1
                        ? `${row.original.holidayGroup.dayCount} days`
                        : "Holiday"
                    }
                    size="small"
                    color="warning"
                    variant="outlined"
                    sx={{ height: 18, fontSize: "0.6rem", "& .MuiChip-icon": { ml: 0.5 } }}
                  />
                </Tooltip>
              )}
            </Box>
          </Box>
        ),
      },
      {
        accessorKey: "dailyLaborers",
        header: "DM Labor",
        size: 110,
        Cell: ({ row }) => (
          <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
            <Chip
              icon={<PersonIcon sx={{ fontSize: 12 }} />}
              label={row.original.dailyLaborers}
              size="small"
              variant="outlined"
              color="primary"
              sx={{ minWidth: 45, height: 22, fontSize: "0.7rem", "& .MuiChip-icon": { ml: 0.3 } }}
            />
            <Chip
              icon={<GroupsIcon sx={{ fontSize: 12 }} />}
              label={row.original.marketLaborers}
              size="small"
              variant="outlined"
              color="secondary"
              sx={{ minWidth: 45, height: 22, fontSize: "0.7rem", "& .MuiChip-icon": { ml: 0.3 } }}
            />
          </Box>
        ),
      },
      {
        accessorKey: "totalAmount",
        header: "Total",
        size: 100,
        Cell: ({ row }) => (
          <Typography variant="body2" fontWeight={600}>
            {formatCurrency(row.original.totalAmount)}
          </Typography>
        ),
      },
      {
        accessorKey: "paymentSources",
        header: "Paid By",
        size: 120,
        filterVariant: "select",
        filterSelectOptions: [
          { value: "own_money", label: "Own Money" },
          { value: "amma_money", label: "Amma Money" },
          { value: "client_money", label: "Client Money" },
          { value: "trust_account", label: "Trust Account" },
          { value: "other_site_money", label: "Other Site" },
          { value: "custom", label: "Custom" },
          { value: "unspecified", label: "Unspecified" },
        ],
        filterFn: (row, _columnId, filterValue) => {
          const sources = row.original.paymentSources;
          if (!filterValue) return true;
          return sources.some(s => s.source === filterValue);
        },
        Cell: ({ row }) => {
          const sources = row.original.paymentSources;
          if (sources.length === 0) {
            return (
              <Typography variant="body2" color="text.disabled">
                —
              </Typography>
            );
          }
          return (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
              {sources.map((s, idx) => {
                // Aggregated grouping doesn't carry the split-row JSONB up to
                // this column (per-row chips elsewhere render via
                // PayerSourceChip with full split breakdown). For the summary,
                // a split row shows as a generic "Split" chip — see
                // SalarySettlementTable's per-row column for the detail.
                const isSplit = s.source === "split";
                const isUnspecified = s.source === "unspecified";
                return (
                  <Chip
                    key={`${s.source}-${idx}`}
                    label={
                      isSplit
                        ? "Split"
                        : isUnspecified
                        ? "Unspecified"
                        : getPayerSourceLabel(s.source as PayerSource, s.sourceName || undefined)
                    }
                    size="small"
                    color={
                      isSplit || isUnspecified
                        ? "default"
                        : getPayerSourceColor(s.source as PayerSource)
                    }
                    variant="outlined"
                    sx={{ height: 20, fontSize: "0.65rem" }}
                  />
                );
              })}
            </Box>
          );
        },
      },
      {
        accessorKey: "settlementReferences",
        header: "Ref Code",
        size: 140,
        filterVariant: "text",
        Cell: ({ row }) => {
          const refs = row.original.settlementReferences;
          if (refs.length === 0) {
            return (
              <Typography variant="body2" color="text.disabled">
                —
              </Typography>
            );
          }
          return (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
              {refs.map((ref) => (
                <Chip
                  key={ref}
                  label={ref}
                  size="small"
                  color="primary"
                  variant="outlined"
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewSettlementRef?.(ref);
                  }}
                  sx={{
                    fontFamily: "monospace",
                    fontWeight: 600,
                    fontSize: "0.7rem",
                    height: 22,
                    cursor: onViewSettlementRef ? "pointer" : "default",
                    "&:hover": onViewSettlementRef
                      ? { bgcolor: alpha(theme.palette.primary.main, 0.1) }
                      : {},
                  }}
                />
              ))}
            </Box>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 160,
        filterVariant: "select",
        filterSelectOptions: [
          { value: "all_paid", label: "All Paid" },
          { value: "all_pending", label: "All Pending" },
          { value: "partial", label: "Partial" },
          { value: "sent_to_engineer", label: "Sent to Engineer" },
          { value: "contract_only", label: "Contract Only" },
          { value: "holiday", label: "Holiday" },
        ],
        Cell: ({ row }) => {
          const { status, pendingAmount, paidAmount, sentToEngineerAmount, awaitingApprovalAmount, hasAwaitingApprovalRecords } =
            row.original;

          // Calculate "With Engineer" amount excluding awaiting approval
          const withEngineerAmount = sentToEngineerAmount - awaitingApprovalAmount;

          return (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
              {pendingAmount > 0 && (
                <Chip
                  icon={<PendingIcon sx={{ fontSize: 12 }} />}
                  label={`Pending: ${formatCurrency(pendingAmount)}`}
                  size="small"
                  color="warning"
                  sx={{ height: 20, fontSize: "0.65rem" }}
                />
              )}
              {withEngineerAmount > 0 && (
                // Check if current user is the assigned engineer
                currentUserId && row.original.withEngineerUserId === currentUserId && row.original.withEngineerTransactionId ? (
                  // Show "Settle Now" button for the assigned engineer
                  <Chip
                    icon={<SentIcon sx={{ fontSize: 12 }} />}
                    label={`Settle Now: ${formatCurrency(withEngineerAmount)}`}
                    size="small"
                    color="primary"
                    variant="filled"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onEngineerSettle && row.original.withEngineerTransactionId) {
                        onEngineerSettle(row.original.withEngineerTransactionId);
                      }
                    }}
                    sx={{
                      height: 20,
                      fontSize: "0.65rem",
                      cursor: "pointer",
                      "&:hover": {
                        bgcolor: "primary.dark"
                      }
                    }}
                  />
                ) : (
                  // Show read-only chip for admin/other users
                  <Chip
                    icon={<SentIcon sx={{ fontSize: 12 }} />}
                    label={`With Engr: ${formatCurrency(withEngineerAmount)}`}
                    size="small"
                    color="info"
                    sx={{ height: 20, fontSize: "0.65rem" }}
                  />
                )
              )}
              {awaitingApprovalAmount > 0 && (
                <Chip
                  icon={<ConfirmIcon sx={{ fontSize: 12 }} />}
                  label={`Awaiting: ${formatCurrency(awaitingApprovalAmount)}`}
                  size="small"
                  color="warning"
                  variant="outlined"
                  sx={{ height: 20, fontSize: "0.65rem" }}
                />
              )}
              {paidAmount > 0 && (
                <Chip
                  icon={<PaidIcon sx={{ fontSize: 12 }} />}
                  label={`Paid: ${formatCurrency(paidAmount)}`}
                  size="small"
                  color="success"
                  sx={{ height: 20, fontSize: "0.65rem" }}
                />
              )}
            </Box>
          );
        },
      },
    ],
    []
  );

  // Render expanded row detail panel
  const renderDetailPanel = ({ row }: { row: { original: DateRowData } }) => {
    const { dailyRecords, marketRecords } = row.original;
    const allRecords = [...dailyRecords, ...marketRecords];

    if (allRecords.length === 0) {
      return (
        <Box sx={{ p: 2 }}>
          <Typography variant="body2" color="text.secondary">
            No records for this date
          </Typography>
        </Box>
      );
    }

    return (
      <Box sx={{ p: 2, bgcolor: alpha(theme.palette.background.default, 0.5) }}>
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: "action.hover" }}>
                <TableCell>Type</TableCell>
                <TableCell>Name / Role</TableCell>
                <TableCell align="right">Count</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>Paid By</TableCell>
                <TableCell>Subcontract</TableCell>
                <TableCell align="center">Status</TableCell>
                <TableCell align="center">Settlement</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {/* Daily Laborers */}
              {dailyRecords.map((record) => (
                <TableRow key={record.id}>
                  <TableCell>
                    <Chip
                      label="Daily"
                      size="small"
                      color="primary"
                      variant="outlined"
                      sx={{ height: 20, fontSize: "0.65rem" }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">
                      {record.laborerName}
                    </Typography>
                    {record.role && (
                      <Typography variant="caption" color="text.secondary">
                        {record.role}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">1</TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" fontWeight={500}>
                      {formatCurrency(record.amount)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {record.moneySource ? (
                      <PayerSourceChip
                        row={{
                          payer_source: record.moneySource,
                          payer_name: record.moneySourceName,
                          payer_source_split: record.payerSourceSplit ?? null,
                        }}
                        size="small"
                      />
                    ) : (
                      <Typography variant="body2" color="text.disabled">—</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {record.subcontractTitle ? (
                      <Chip
                        label={record.subcontractTitle}
                        size="small"
                        color="info"
                        variant="outlined"
                        icon={<LinkIcon sx={{ fontSize: 14 }} />}
                        sx={{ height: 20, fontSize: "0.65rem" }}
                      />
                    ) : (
                      <Chip
                        label="Unlinked"
                        size="small"
                        variant="outlined"
                        sx={{ height: 20, fontSize: "0.65rem", color: 'text.disabled', borderColor: 'divider' }}
                      />
                    )}
                  </TableCell>
                  <TableCell align="center">
                    {record.isPaid ? (
                      <Chip
                        label="Paid"
                        size="small"
                        color="success"
                        sx={{ height: 18, fontSize: "0.6rem" }}
                      />
                    ) : record.paidVia === "engineer_wallet" ? (
                      // Show different status based on settlement status
                      record.settlementStatus === "pending_confirmation" ? (
                        <Chip
                          label="Awaiting Approval"
                          size="small"
                          color="warning"
                          sx={{ height: 18, fontSize: "0.6rem" }}
                        />
                      ) : record.settlementStatus === "confirmed" ? (
                        <Chip
                          label="Settled"
                          size="small"
                          color="success"
                          sx={{ height: 18, fontSize: "0.6rem" }}
                        />
                      ) : (
                        <Chip
                          label="With Engineer"
                          size="small"
                          color="info"
                          sx={{ height: 18, fontSize: "0.6rem" }}
                        />
                      )
                    ) : (
                      <Chip
                        label="Pending"
                        size="small"
                        color="warning"
                        sx={{ height: 18, fontSize: "0.6rem" }}
                      />
                    )}
                  </TableCell>
                  <TableCell align="center">
                    {(record.paidVia === "engineer_wallet" || record.settlementStatus) && (
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, justifyContent: "center", flexWrap: "wrap" }}>
                        {/* Settlement Mode Chip */}
                        {record.settlementMode && (
                          <Chip
                            size="small"
                            label={record.settlementMode.toUpperCase()}
                            variant="outlined"
                            sx={{ height: 18, fontSize: "0.6rem" }}
                          />
                        )}
                        {/* Money Source Chip */}
                        {record.moneySource && (
                          <PayerSourceChip
                            row={{
                              payer_source: record.moneySource,
                              payer_name: record.moneySourceName,
                              payer_source_split: record.payerSourceSplit ?? null,
                            }}
                            size="small"
                          />
                        )}
                        {/* Company Proof Icon */}
                        {record.companyProofUrl && (
                          <Tooltip title="View company payment proof">
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                setViewingProof({ url: record.companyProofUrl!, type: "company" });
                              }}
                              sx={{ p: 0.25 }}
                            >
                              <PhotoIcon fontSize="small" color="info" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {/* Engineer Proof Icon */}
                        {record.engineerProofUrl && (
                          <Tooltip title="View engineer settlement proof">
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                setViewingProof({ url: record.engineerProofUrl!, type: "engineer" });
                              }}
                              sx={{ p: 0.25 }}
                            >
                              <PhotoIcon fontSize="small" color="success" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {/* Settled Date */}
                        {record.settledDate && (
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.6rem" }}>
                            {dayjs(record.settledDate).format("DD MMM")}
                          </Typography>
                        )}
                        {/* Notes/Reason */}
                        {record.cashReason && (
                          <Tooltip title={record.cashReason}>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{
                                fontSize: "0.55rem",
                                maxWidth: 80,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                display: "block",
                                fontStyle: "italic",
                              }}
                            >
                              &quot;{record.cashReason}&quot;
                            </Typography>
                          </Tooltip>
                        )}
                      </Box>
                    )}
                  </TableCell>
                </TableRow>
              ))}

              {/* Market Laborers */}
              {marketRecords.map((record) => (
                <TableRow key={record.id}>
                  <TableCell>
                    <Chip
                      label="Market"
                      size="small"
                      color="secondary"
                      variant="outlined"
                      sx={{ height: 20, fontSize: "0.65rem" }}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{record.role || record.laborerName}</Typography>
                  </TableCell>
                  <TableCell align="right">{record.count || 1}</TableCell>
                  <TableCell align="right">
                    <Typography variant="body2" fontWeight={500}>
                      {formatCurrency(record.amount)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {record.moneySource ? (
                      <PayerSourceChip
                        row={{
                          payer_source: record.moneySource,
                          payer_name: record.moneySourceName,
                          payer_source_split: record.payerSourceSplit ?? null,
                        }}
                        size="small"
                      />
                    ) : (
                      <Typography variant="body2" color="text.disabled">—</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {record.subcontractTitle ? (
                      <Chip
                        label={record.subcontractTitle}
                        size="small"
                        color="info"
                        variant="outlined"
                        icon={<LinkIcon sx={{ fontSize: 14 }} />}
                        sx={{ height: 20, fontSize: "0.65rem" }}
                      />
                    ) : (
                      <Chip
                        label="Unlinked"
                        size="small"
                        variant="outlined"
                        sx={{ height: 20, fontSize: "0.65rem", color: 'text.disabled', borderColor: 'divider' }}
                      />
                    )}
                  </TableCell>
                  <TableCell align="center">
                    {record.isPaid ? (
                      <Chip
                        label="Paid"
                        size="small"
                        color="success"
                        sx={{ height: 18, fontSize: "0.6rem" }}
                      />
                    ) : record.paidVia === "engineer_wallet" ? (
                      // Show different status based on settlement status
                      record.settlementStatus === "pending_confirmation" ? (
                        <Chip
                          label="Awaiting Approval"
                          size="small"
                          color="warning"
                          sx={{ height: 18, fontSize: "0.6rem" }}
                        />
                      ) : record.settlementStatus === "confirmed" ? (
                        <Chip
                          label="Settled"
                          size="small"
                          color="success"
                          sx={{ height: 18, fontSize: "0.6rem" }}
                        />
                      ) : (
                        <Chip
                          label="With Engineer"
                          size="small"
                          color="info"
                          sx={{ height: 18, fontSize: "0.6rem" }}
                        />
                      )
                    ) : (
                      <Chip
                        label="Pending"
                        size="small"
                        color="warning"
                        sx={{ height: 18, fontSize: "0.6rem" }}
                      />
                    )}
                  </TableCell>
                  <TableCell align="center">
                    {(record.paidVia === "engineer_wallet" || record.settlementStatus) && (
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, justifyContent: "center", flexWrap: "wrap" }}>
                        {/* Settlement Mode Chip */}
                        {record.settlementMode && (
                          <Chip
                            size="small"
                            label={record.settlementMode.toUpperCase()}
                            variant="outlined"
                            sx={{ height: 18, fontSize: "0.6rem" }}
                          />
                        )}
                        {/* Money Source Chip */}
                        {record.moneySource && (
                          <PayerSourceChip
                            row={{
                              payer_source: record.moneySource,
                              payer_name: record.moneySourceName,
                              payer_source_split: record.payerSourceSplit ?? null,
                            }}
                            size="small"
                          />
                        )}
                        {/* Company Proof Icon */}
                        {record.companyProofUrl && (
                          <Tooltip title="View company payment proof">
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                setViewingProof({ url: record.companyProofUrl!, type: "company" });
                              }}
                              sx={{ p: 0.25 }}
                            >
                              <PhotoIcon fontSize="small" color="info" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {/* Engineer Proof Icon */}
                        {record.engineerProofUrl && (
                          <Tooltip title="View engineer settlement proof">
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                setViewingProof({ url: record.engineerProofUrl!, type: "engineer" });
                              }}
                              sx={{ p: 0.25 }}
                            >
                              <PhotoIcon fontSize="small" color="success" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {/* Settled Date */}
                        {record.settledDate && (
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: "0.6rem" }}>
                            {dayjs(record.settledDate).format("DD MMM")}
                          </Typography>
                        )}
                        {/* Notes/Reason */}
                        {record.cashReason && (
                          <Tooltip title={record.cashReason}>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{
                                fontSize: "0.55rem",
                                maxWidth: 80,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                display: "block",
                                fontStyle: "italic",
                              }}
                            >
                              &quot;{record.cashReason}&quot;
                            </Typography>
                          </Tooltip>
                        )}
                      </Box>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    );
  };

  return (
    <>
      <Box ref={tableContainerRef}>
      <DataTable<DateRowData>
        columns={columns}
        data={filteredTableData}
        isLoading={loading}
        enableExpanding
        renderDetailPanel={renderDetailPanel}
        enableRowActions
        positionActionsColumn="last"
        renderTopToolbarCustomActions={() => (
          <Box sx={{ display: "flex", gap: 1, alignItems: "center", ml: 1 }}>
            <Tooltip title={showHolidays ? "Click to hide holidays" : "Click to show holidays"}>
              <Chip
                icon={showHolidays ? <HolidayIcon sx={{ fontSize: 14 }} /> : <VisibilityOffIcon sx={{ fontSize: 14 }} />}
                label="Holidays"
                size="small"
                color={showHolidays ? "warning" : "default"}
                variant={showHolidays ? "filled" : "outlined"}
                onClick={() => setShowHolidays(!showHolidays)}
                sx={{
                  cursor: "pointer",
                  fontSize: "0.75rem",
                  fontWeight: showHolidays ? 600 : 400,
                  opacity: showHolidays ? 1 : 0.6,
                  textDecoration: showHolidays ? "none" : "line-through",
                  transition: "all 0.2s ease",
                  "&:hover": {
                    opacity: 1,
                    transform: "scale(1.02)",
                  },
                }}
              />
            </Tooltip>
            <Tooltip title={showContractOnly ? "Click to hide contract-only dates" : "Click to show contract-only dates"}>
              <Chip
                icon={showContractOnly ? <ContractIcon sx={{ fontSize: 14 }} /> : <VisibilityOffIcon sx={{ fontSize: 14 }} />}
                label="Contract Only"
                size="small"
                color={showContractOnly ? "info" : "default"}
                variant={showContractOnly ? "filled" : "outlined"}
                onClick={() => setShowContractOnly(!showContractOnly)}
                sx={{
                  cursor: "pointer",
                  fontSize: "0.75rem",
                  fontWeight: showContractOnly ? 600 : 400,
                  opacity: showContractOnly ? 1 : 0.6,
                  textDecoration: showContractOnly ? "none" : "line-through",
                  transition: "all 0.2s ease",
                  "&:hover": {
                    opacity: 1,
                    transform: "scale(1.02)",
                  },
                }}
              />
            </Tooltip>
          </Box>
        )}
        renderRowActions={({ row }) => (
          <Box sx={{ display: "flex", gap: 0.5 }}>
            {/* Confirm Settlement - for admin when records are awaiting approval */}
            {isAdmin && row.original.hasAwaitingApprovalRecords && row.original.awaitingApprovalTransactionId && onConfirmSettlement && (
              <Tooltip title="View & Confirm Settlement">
                <IconButton
                  size="small"
                  color="warning"
                  onClick={(e) => {
                    e.stopPropagation();
                    onConfirmSettlement(row.original.awaitingApprovalTransactionId!);
                  }}
                >
                  <ConfirmIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}

            {/* Primary actions */}
            {row.original.hasPendingRecords && !disabled && (
              <Tooltip title="Settle All">
                <IconButton
                  size="small"
                  color="success"
                  onClick={(e) => {
                    e.stopPropagation();
                    const pendingRecords = getPendingRecords(row.original.group);
                    onPayDate(row.original.date, pendingRecords);
                  }}
                >
                  <PaymentIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}

            {/* More actions menu */}
            <Tooltip title="More actions">
              <IconButton
                size="small"
                onClick={(e) => handleMenuOpen(e, row.original)}
              >
                <MoreVertIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        )}
        initialState={{
          sorting: [{ id: "date", desc: true }],
          pagination: {
            pageSize: 100,
            pageIndex: 0,
          },
        }}
        enablePagination={filteredTableData.length > 20}
        pageSize={100}
        muiExpandButtonProps={({ row }) => ({
          sx: {
            color:
              row.original.dailyRecords.length + row.original.marketRecords.length > 0
                ? "primary.main"
                : "text.disabled",
          },
        })}
        muiTableBodyRowProps={({ row }) => ({
          "data-row-index": row.index,
          sx: {
            // Highlight row if it contains the matching settlement reference
            backgroundColor: highlightRef && row.original.settlementReferences.includes(highlightRef)
              ? alpha(theme.palette.primary.main, 0.15)
              : undefined,
            // Add a subtle animation for highlighted rows
            transition: 'background-color 0.3s ease-in-out',
          },
        })}
      />
      </Box>

      {/* Actions Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
        onClick={(e) => e.stopPropagation()}
      >
        <MenuItem
          onClick={() => {
            if (selectedRow) {
              onViewDate(selectedRow.date, selectedRow.group);
            }
            handleMenuClose();
          }}
        >
          <ListItemIcon>
            <ViewIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>View Details</ListItemText>
        </MenuItem>

        {!disabled && selectedRow?.hasPendingRecords && (
          <MenuItem
            onClick={() => {
              if (selectedRow) {
                onEditDate(selectedRow.date, selectedRow.group);
              }
              handleMenuClose();
            }}
          >
            <ListItemIcon>
              <EditIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Edit All</ListItemText>
          </MenuItem>
        )}

        {!disabled && onEditSettlements && (
          <MenuItem
            onClick={() => {
              if (selectedRow) {
                const allRecords = getActionableRecords(selectedRow.group);
                onEditSettlements(selectedRow.date, allRecords);
              }
              handleMenuClose();
            }}
          >
            <ListItemIcon>
              <LinkIcon fontSize="small" color="info" />
            </ListItemIcon>
            <ListItemText>Edit Settlements</ListItemText>
          </MenuItem>
        )}

        {!disabled && selectedRow?.hasSentToEngineerRecords && (
          <MenuItem
            onClick={() => {
              if (selectedRow) {
                const records = getSentToEngineerRecords(selectedRow.group);
                onNotifyDate(selectedRow.date, records);
              }
              handleMenuClose();
            }}
          >
            <ListItemIcon>
              <NotifyIcon fontSize="small" color="warning" />
            </ListItemIcon>
            <ListItemText>Notify Engineer</ListItemText>
          </MenuItem>
        )}

        <Divider />

        {!disabled &&
          (selectedRow?.hasPaidRecords || selectedRow?.hasSentToEngineerRecords) && (
            <MenuItem
              onClick={() => {
                if (selectedRow) {
                  const allRecords = getActionableRecords(selectedRow.group).filter(
                    (r) => r.isPaid || r.paidVia === "engineer_wallet"
                  );
                  onCancelDate(selectedRow.date, allRecords);
                }
                handleMenuClose();
              }}
            >
              <ListItemIcon>
                <CancelIcon fontSize="small" color="warning" />
              </ListItemIcon>
              <ListItemText>Cancel Payments</ListItemText>
            </MenuItem>
          )}

        {!disabled && selectedRow?.hasPaidRecords && (
          <MenuItem
            onClick={() => {
              if (selectedRow) {
                const paidRecords = getPaidRecords(selectedRow.group);
                // Show redirect dialog - salary records come from attendance
                setDeleteRedirectDialog({
                  open: true,
                  date: selectedRow.date,
                  records: paidRecords,
                });
              }
              handleMenuClose();
            }}
          >
            <ListItemIcon>
              <DeleteIcon fontSize="small" color="error" />
            </ListItemIcon>
            <ListItemText>Delete & Reset</ListItemText>
          </MenuItem>
        )}
      </Menu>

      {/* Settlement Proof Image Viewer - Full Screen */}
      <Dialog
        open={!!viewingProof}
        onClose={() => setViewingProof(null)}
        maxWidth={false}
        fullScreen
        PaperProps={{
          sx: {
            bgcolor: "rgba(0, 0, 0, 0.95)",
          },
        }}
      >
        <Box
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            p: 2,
            zIndex: 1,
            bgcolor: "rgba(0, 0, 0, 0.5)",
          }}
        >
          <Typography variant="h6" sx={{ color: "white" }}>
            {viewingProof?.type === "company"
              ? "Company Payment Proof"
              : "Engineer Settlement Proof"}
          </Typography>
          <IconButton
            onClick={() => setViewingProof(null)}
            sx={{
              color: "white",
              bgcolor: "rgba(255, 255, 255, 0.1)",
              "&:hover": { bgcolor: "rgba(255, 255, 255, 0.2)" },
            }}
          >
            <CloseIcon />
          </IconButton>
        </Box>
        <DialogContent
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            p: 0,
            height: "100%",
          }}
        >
          {viewingProof && (
            <Box
              component="img"
              src={viewingProof.url}
              alt={
                viewingProof.type === "company"
                  ? "Company payment proof"
                  : "Engineer settlement proof"
              }
              sx={{
                maxWidth: "100%",
                maxHeight: "100%",
                objectFit: "contain",
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Redirect Dialog - Salary records come from attendance */}
      <Dialog
        open={!!deleteRedirectDialog?.open}
        onClose={() => setDeleteRedirectDialog(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <WarningIcon color="warning" />
          <Typography variant="h6" component="span">
            Cannot Delete Salary Records
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Salary payment records are linked to attendance data. To delete or modify these records, you need to edit or delete the corresponding attendance entries.
            </Typography>
            <Box
              sx={{
                p: 2,
                bgcolor: "action.hover",
                borderRadius: 1,
                display: "flex",
                alignItems: "center",
                gap: 2,
              }}
            >
              <Box sx={{ color: "primary.main" }}>
                <AttendanceIcon />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle2" fontWeight={600}>
                  Attendance Page
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {deleteRedirectDialog?.date
                    ? `Go to attendance for ${dayjs(deleteRedirectDialog.date).format("DD MMM YYYY")} to make changes.`
                    : "You will be redirected to the attendance page."}
                </Typography>
              </Box>
              <ArrowForwardIcon color="action" />
            </Box>
          </Box>
        </DialogContent>
        <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, p: 2, pt: 0 }}>
          <Button onClick={() => setDeleteRedirectDialog(null)} variant="outlined">
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={() => {
              if (deleteRedirectDialog?.date) {
                handleRedirectToAttendance(deleteRedirectDialog.date);
              }
              setDeleteRedirectDialog(null);
            }}
            endIcon={<ArrowForwardIcon />}
          >
            Go to Attendance
          </Button>
        </Box>
      </Dialog>
    </>
  );
}
