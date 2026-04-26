"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  Suspense,
} from "react";
import dynamic from "next/dynamic";
import {
  Box,
  Button,
  Typography,
  Paper,
  TextField,
  Grid,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Collapse,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
  Popover,
  Divider,
  SpeedDial,
  SpeedDialAction,
  SpeedDialIcon,
  Snackbar,
  alpha,
  useTheme,
} from "@mui/material";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useFullscreen } from "@/hooks/useFullscreen";
import {
  getPersistedDrawerState,
  clearPersistedDrawerState,
} from "@/hooks/useDrawerPersistence";
import {
  ExpandMore,
  ExpandLess,
  Add as AddIcon,
  Edit,
  Delete,
  AccessTime,
  Restaurant,
  LocalCafe as TeaIcon,
  Fullscreen,
  FullscreenExit,
  Close as CloseIcon,
  WbSunny,
  NightsStay,
  EventNote,
  EventBusy as HolidayIcon,
  BeachAccess as BeachAccessIcon,
  Visibility as VisibilityIcon,
  Payment as PaymentIcon,
  CalendarMonth,
  Lock as LockIcon,
  Warning as WarningIcon,
  WarningAmber as WarningAmberIcon,
  ArrowForward as ArrowForwardIcon,
  ArrowBack as ArrowBackIcon,
  VisibilityOff as VisibilityOffIcon,
  EditCalendar as EditCalendarIcon,
  Groups as GroupsIcon,
} from "@mui/icons-material";
import { type SiteHoliday } from "@/components/attendance/HolidayConfirmDialog";

// OPTIMIZATION: Lazy load heavy dialog/drawer components (code splitting)
// These are only shown when user triggers specific actions
const AttendanceDrawer = dynamic(
  () => import("@/components/attendance/AttendanceDrawer"),
  { ssr: false }
);
const HolidayConfirmDialog = dynamic(
  () => import("@/components/attendance/HolidayConfirmDialog"),
  { ssr: false }
);
const UnifiedSettlementDialog = dynamic(
  () => import("@/components/settlement/UnifiedSettlementDialog"),
  { ssr: false }
);
const TeaShopEntryDialog = dynamic(
  () => import("@/components/tea-shop/TeaShopEntryDialog"),
  { ssr: false }
);
const TeaShopEntryModeDialog = dynamic(
  () => import("@/components/tea-shop/TeaShopEntryModeDialog"),
  { ssr: false }
);
const GroupTeaShopEntryDialog = dynamic(
  () => import("@/components/tea-shop/GroupTeaShopEntryDialog"),
  { ssr: false }
);
import { useSiteGroup } from "@/hooks/queries/useSiteGroups";
import { useTeaShopForGroup } from "@/hooks/queries/useCompanyTeaShops";
import type { SiteGroupWithSites } from "@/types/material.types";

// More lazy-loaded dialogs
const PaymentDialog = dynamic(
  () => import("@/components/payments/PaymentDialog"),
  { ssr: false }
);
import type { UnifiedSettlementConfig, SettlementRecord } from "@/types/settlement.types";
import DataTable, { type MRT_ColumnDef } from "@/components/common/DataTable";
import AuditAvatarGroup from "@/components/common/AuditAvatarGroup";
import ScopeChip from "@/components/common/ScopeChip";
import { InspectPane } from "@/components/common/InspectPane";
import type { InspectEntity } from "@/components/common/InspectPane";
import { useInspectPane } from "@/hooks/useInspectPane";
import SettleDayButton from "@/components/attendance/SettleDayButton";
import SettlementRefChip from "@/components/attendance/SettlementRefChip";
import {
  PhotoBadge,
  WorkUpdateViewer,
  PhotoThumbnailStrip,
  PhotoFullscreenDialog,
} from "@/components/attendance/work-updates";
import type { Database } from "@/types/database.types";
import type { WorkUpdates } from "@/types/work-updates.types";

type TeaShopAccount = Database["public"]["Tables"]["tea_shop_accounts"]["Row"];
import type { DailyPaymentRecord } from "@/types/payment.types";
import { createClient } from "@/lib/supabase/client";
import { useSite } from "@/contexts/SiteContext";
import {
  useInvalidateAttendanceData,
  type RawAttendanceData,
} from "@/hooks/useAttendanceData";
import { useAttendanceWeeksInfinite } from "@/hooks/useAttendanceWeeksInfinite";
import {
  useAttendanceSummary,
  type AttendancePeriodTotals,
} from "@/hooks/useAttendanceSummary";
import { useAuth } from "@/contexts/AuthContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import PageHeader from "@/components/layout/PageHeader";
import AttendanceSkeleton from "./attendance-skeleton";
import { hasEditPermission } from "@/lib/permissions";
import { useSearchParams, useRouter } from "next/navigation";
import type { AttendancePageData } from "@/lib/data/attendance";

type LaborerType = string;
type DailyWorkSummary = Database["public"]["Tables"]["daily_work_summary"]["Row"];
import dayjs from "dayjs";
import {
  groupHolidays,
  formatHolidayDateRange,
  formatHolidayDayRange,
  type HolidayGroup,
} from "@/lib/utils/holidayUtils";
import {
  getUnfilledDates,
  groupUnfilledDates,
  formatUnfilledDateRange,
  formatUnfilledDayRange,
  type UnfilledGroup,
} from "@/lib/utils/unfilledDatesUtils";
import { allocateAmounts } from "@/hooks/queries/useGroupTeaShop";

interface AttendanceContentProps {
  initialData: AttendancePageData | null;
}

interface AttendanceRecord {
  id: string;
  date: string;
  laborer_id: string;
  laborer_name: string;
  laborer_type: LaborerType;
  category_name: string;
  role_name: string;
  team_name: string | null;
  section_name: string;
  work_days: number;
  hours_worked: number;
  daily_rate_applied: number;
  daily_earnings: number;
  is_paid: boolean;
  payment_notes?: string | null;
  subcontract_title?: string | null;
  // Payment/settlement fields
  engineer_transaction_id?: string | null;
  expense_id?: string | null;
  paid_via?: string | null;
  // Time tracking fields
  in_time?: string | null;
  lunch_out?: string | null;
  lunch_in?: string | null;
  out_time?: string | null;
  work_hours?: number | null;
  break_hours?: number | null;
  total_hours?: number | null;
  day_units?: number;
  snacks_amount?: number;
  // Two-phase attendance fields
  attendance_status?: "morning_entry" | "confirmed" | "draft" | null;
  work_progress_percent?: number | null;
  // Audit tracking fields
  entered_by?: string | null;
  entered_by_user_id?: string | null;
  entered_by_avatar?: string | null;
  updated_by?: string | null;
  updated_by_user_id?: string | null;
  updated_by_avatar?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface TeaShopData {
  teaTotal: number;
  snacksTotal: number;
  total: number;
  workingCount: number;
  workingTotal: number;
  nonWorkingCount: number;
  nonWorkingTotal: number;
  marketCount: number;
  marketTotal: number;
  // Group entry tracking
  isGroupEntry?: boolean;
  entryId?: string;
}

// Expanded market laborer record (individual rows like "Mason 1", "Mason 2")
interface MarketLaborerRecord {
  id: string;
  originalDbId: string; // The actual DB record ID from market_laborer_attendance
  roleId: string; // The role_id from the DB
  date: string;
  tempName: string; // e.g., "Mason 1", "Mason 2"
  categoryName: string;
  roleName: string;
  index: number; // 1, 2, 3 within category
  workDays: number;
  dayUnits: number;
  ratePerPerson: number;
  dailyEarnings: number;
  snacksAmount: number;
  inTime: string | null;
  outTime: string | null;
  isPaid: boolean;
  paidAmount: number;
  pendingAmount: number;
  groupCount: number; // Total count in this group (for edit reference)
  paymentNotes: string | null;
  engineerTransactionId: string | null; // For settlement tracking
  expenseId: string | null; // For direct payment tracking
}

interface DateSummary {
  date: string;
  records: AttendanceRecord[];
  marketLaborers: MarketLaborerRecord[]; // Expanded market laborer rows
  // Laborer counts by type
  dailyLaborerCount: number;
  contractLaborerCount: number;
  marketLaborerCount: number;
  totalLaborerCount: number;
  // Times
  firstInTime: string | null;
  lastOutTime: string | null;
  // Amounts
  totalSalary: number;
  totalSnacks: number;
  totalExpense: number;
  // Amounts by laborer type
  dailyLaborerAmount: number;
  contractLaborerAmount: number;
  marketLaborerAmount: number;
  // Payment breakdown
  paidCount: number;
  pendingCount: number;
  paidAmount: number;
  pendingAmount: number;
  // Work description
  workDescription: string | null;
  workStatus: string | null;
  comments: string | null;
  // Work updates with photos
  workUpdates: WorkUpdates | null;
  // Category breakdown
  categoryBreakdown: { [key: string]: { count: number; amount: number } };
  isExpanded?: boolean;
  // Tea shop data
  teaShop: TeaShopData | null;
  // Two-phase attendance status
  attendanceStatus: "morning_entry" | "confirmed" | "mixed" | "draft";
  workProgressPercent: number;
}

interface WeeklySummary {
  weekStart: string;
  weekEnd: string;
  weekLabel: string; // "Dec 8 - Dec 14, 2024"
  totalLaborers: number;
  totalWorkDays: number;
  // Pending amounts by type
  pendingDailySalary: number;
  pendingContractSalary: number;
  pendingMarketSalary: number;
  teaShopExpenses: number;
  totalPending: number;
  // Contract laborers for weekly settlement
  contractLaborerIds: string[];
  // Flag for current/ongoing week
  isCurrentWeek: boolean;
}

export default function AttendanceContent({ initialData }: AttendanceContentProps) {
  const { selectedSite, loading: siteLoading } = useSite();
  const { userProfile, loading: authLoading } = useAuth();
  const { formatForApi, isAllTime, setPickerContainer } = useDateRange();
  const supabase = createClient();
  const isMobile = useIsMobile();
  const searchParams = useSearchParams();
  const router = useRouter();
  const theme = useTheme();

  // Group tea shop support
  const siteGroupId = (selectedSite as any)?.site_group_id as string | undefined;
  const { data: siteGroup } = useSiteGroup(siteGroupId);
  const { data: groupTeaShop } = useTeaShopForGroup(siteGroupId);

  const { dateFrom, dateTo } = formatForApi();

  // URL params for highlighting (from redirect)
  const highlightDate = searchParams.get("date");
  const highlightAction = searchParams.get("action");
  const sourceParam = searchParams.get("source"); // For settlement page navigation

  // State for highlighted date row
  const [highlightedDate, setHighlightedDate] = useState<string | null>(null);

  // State for tracking if user came from settlement page
  const [cameFromSettlement, setCameFromSettlement] = useState(false);

  // Track if we've processed initial data
  const initialDataProcessedRef = useRef(false);

  const [loading, setLoading] = useState(!initialData);
  const [attendanceRecords, setAttendanceRecords] = useState<
    AttendanceRecord[]
  >([]);
  const [dateSummaries, setDateSummaries] = useState<DateSummary[]>([]);
  const [workSummaries, setWorkSummaries] = useState<
    Map<string, DailyWorkSummary>
  >(new Map());
  const [viewMode, setViewMode] = useState<"date-wise" | "detailed">(
    "date-wise"
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"morning" | "evening" | "full">(
    "full"
  );

  // Fetch version counter to handle race conditions
  const fetchVersionRef = useRef(0);

  // Mobile UI states
  const [summaryExpanded, setSummaryExpanded] = useState(false);

  // Fullscreen mode using native Fullscreen API
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const pickerPortalRef = useRef<HTMLDivElement>(null);
  // Sentinel row at the bottom of the attendance table; an
  // IntersectionObserver below triggers fetchNextPage when it scrolls into
  // view so older weeks load on demand instead of all at once.
  const loadMoreSentinelRef = useRef<HTMLTableCellElement | null>(null);
  const { isFullscreen, enterFullscreen, exitFullscreen } = useFullscreen(
    tableContainerRef,
    { orientation: "landscape" }
  );

  // While fullscreened, register an in-tree portal target for the global
  // DateRangePicker. The native Fullscreen API only paints descendants of the
  // fullscreened element, so the picker's default body-portal popover is
  // invisible. Registering this ref makes the popover render inside our
  // fullscreened Box. Cleared on exit / unmount so other pages keep using the
  // default body portal.
  useEffect(() => {
    if (isFullscreen && pickerPortalRef.current) {
      setPickerContainer(pickerPortalRef.current);
      return () => setPickerContainer(null);
    }
    setPickerContainer(null);
    return undefined;
  }, [isFullscreen, setPickerContainer]);

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(
    null
  );
  const [editForm, setEditForm] = useState({
    work_days: 1,
    daily_rate_applied: 0,
  });

  // Payment dialog state
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentRecords, setPaymentRecords] = useState<DailyPaymentRecord[]>(
    []
  );

  // Date-specific drawer state
  const [selectedDateForDrawer, setSelectedDateForDrawer] = useState<
    string | undefined
  >(undefined);

  // Tea shop popover state
  const [teaShopPopoverAnchor, setTeaShopPopoverAnchor] =
    useState<HTMLElement | null>(null);
  const [teaShopPopoverData, setTeaShopPopoverData] = useState<{
    date: string;
    data: TeaShopData;
  } | null>(null);

  // Tea shop entry dialog state (for direct opening)
  const [teaShopDialogOpen, setTeaShopDialogOpen] = useState(false);
  const [teaShopDialogDate, setTeaShopDialogDate] = useState<
    string | undefined
  >(undefined);
  const [teaShopAccount, setTeaShopAccount] = useState<TeaShopAccount | null>(
    null
  );
  const [teaShopEditingEntry, setTeaShopEditingEntry] = useState<any>(null);
  const [teaShopEntryModeDialogOpen, setTeaShopEntryModeDialogOpen] = useState(false);
  const [groupTeaShopDialogOpen, setGroupTeaShopDialogOpen] = useState(false);
  const [popoverGroupAllocations, setPopoverGroupAllocations] = useState<any[] | null>(null);
  // Pre-fetched group entry data for editing (sync fetch approach)
  const [editingGroupEntryData, setEditingGroupEntryData] = useState<any>(null);
  // Tea shop for editing (fetched from entry's tea_shop_id)
  const [editingTeaShop, setEditingTeaShop] = useState<any>(null);
  // Site group for editing (fetched from entry's site_group_id)
  const [editingSiteGroup, setEditingSiteGroup] = useState<any>(null);

  // Work update viewer state
  const [workUpdateViewerOpen, setWorkUpdateViewerOpen] = useState(false);
  const [selectedWorkUpdate, setSelectedWorkUpdate] = useState<{
    workUpdates: WorkUpdates | null;
    date: string;
  } | null>(null);

  // Delete confirmation dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteDialogData, setDeleteDialogData] = useState<{
    date: string;
    siteName: string;
    dailyCount: number;
    marketCount: number;
    totalAmount: number;
  } | null>(null);

  // Holiday management state
  const [holidayDialogOpen, setHolidayDialogOpen] = useState(false);
  const [holidayDialogMode, setHolidayDialogMode] = useState<
    "mark" | "revoke" | "list"
  >("mark");
  const [todayHoliday, setTodayHoliday] = useState<{
    id: string;
    site_id: string;
    date: string;
    reason: string | null;
    is_paid_holiday: boolean | null;
    created_at: string;
    created_by: string | null;
  } | null>(null);
  const [recentHolidays, setRecentHolidays] = useState<
    Array<{
      id: string;
      site_id: string;
      date: string;
      reason: string | null;
      is_paid_holiday: boolean | null;
      created_at: string;
      created_by: string | null;
    }>
  >([]);

  const [selectedHolidayDate, setSelectedHolidayDate] = useState<string | null>(null);
  const [selectedExistingHoliday, setSelectedExistingHoliday] = useState<typeof todayHoliday>(null);
  // Show/hide holidays toggle with session persistence
  const [showHolidays, setShowHolidays] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const stored = sessionStorage.getItem("attendance_showHolidays");
      return stored === null ? true : stored === "true";
    } catch {
      return true;
    }
  });

  // Persist showHolidays preference to sessionStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem("attendance_showHolidays", String(showHolidays));
      } catch {
        // Ignore storage errors
      }
    }
  }, [showHolidays]);

  // Unfilled dates tracking state
  const [expandedUnfilledGroups, setExpandedUnfilledGroups] = useState<Set<string>>(new Set());
  const [unfilledActionDialog, setUnfilledActionDialog] = useState<{
    open: boolean;
    date: string;
    isHoliday?: boolean;
  } | null>(null);

  // SpeedDial controlled state (click-only, not hover)
  const [speedDialOpen, setSpeedDialOpen] = useState(false);

  // View attendance summary state (eye icon)
  const [viewSummaryDate, setViewSummaryDate] = useState<string | null>(null);

  // Summary table fullscreen state
  const [summaryTableFullscreen, setSummaryTableFullscreen] = useState(false);

  // Summary photo fullscreen state
  const [summaryPhotoFullscreen, setSummaryPhotoFullscreen] = useState(false);
  const [summaryFullscreenPhotos, setSummaryFullscreenPhotos] = useState<
    { url: string; id: string; description?: string; uploadedAt: string }[]
  >([]);
  const [summaryPhotoIndex, setSummaryPhotoIndex] = useState(0);
  const [summaryPhotoPeriod, setSummaryPhotoPeriod] = useState<'morning' | 'evening'>('morning');

  // Unified settlement dialog state
  const [settlementDialogOpen, setSettlementDialogOpen] = useState(false);
  const [settlementConfig, setSettlementConfig] = useState<UnifiedSettlementConfig | null>(null);

  // InspectPane (for SettlementRefChip click-to-inspect, no navigation).
  const pane = useInspectPane();

  // Restoration/notification message state
  const [restorationMessage, setRestorationMessage] = useState<string | null>(
    null
  );

  // Handle URL params for highlighting (from redirect)
  useEffect(() => {
    if (highlightDate && highlightAction === "edit_or_delete") {
      setHighlightedDate(highlightDate);
      setRestorationMessage(
        "Edit or delete this attendance record to modify the payment"
      );
      // Clear highlight after 10 seconds
      const timer = setTimeout(() => {
        setHighlightedDate(null);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [highlightDate, highlightAction]);

  // Handle navigation from settlement page
  useEffect(() => {
    if (highlightDate && sourceParam === "settlement") {
      setCameFromSettlement(true);
      setHighlightedDate(highlightDate);

      // Auto-expand the highlighted date row after data loads
      setDateSummaries((prev) =>
        prev.map((d) =>
          d.date === highlightDate ? { ...d, isExpanded: true } : d
        )
      );

      // Auto-scroll to the date row
      const scrollToDate = () => {
        const dateRow = document.querySelector(`[data-date="${highlightDate}"]`);
        if (dateRow) {
          dateRow.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      };

      // Delay scroll to allow DOM to render
      setTimeout(scrollToDate, 500);

      // Clear highlight after 10 seconds
      const timer = setTimeout(() => {
        setHighlightedDate(null);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [highlightDate, sourceParam]);

  // Paid record protection dialog state
  const [paidRecordDialog, setPaidRecordDialog] = useState<{
    open: boolean;
    record: AttendanceRecord | null;
    action: "edit" | "delete";
    date?: string;
    isBulk?: boolean;
    paidCount?: number;
  } | null>(null);

  // Redirect to salary settlement page
  const redirectToSalarySettlement = (date: string) => {
    const params = new URLSearchParams({
      date,
      action: "cancel_payment",
    });
    router.push(`/site/payments?${params.toString()}`);
    setPaidRecordDialog(null);
  };

  // ---- Settlement dialog triggers (reused by row CTAs and InspectPane) ----
  // Open the daily settlement dialog for a given DateSummary. Builds the
  // UnifiedSettlementConfig identical to the legacy inline IconButton path.
  const openDailySettlementDialog = useCallback((summary: DateSummary) => {
    const records: SettlementRecord[] = [
      // Daily records
      ...summary.records
        .filter((r) => !r.is_paid)
        .map((r) => ({
          id: `daily-${r.id}`,
          sourceType: "daily" as const,
          sourceId: r.id,
          laborerName: r.laborer_name,
          laborerType: (r.laborer_type === "contract" ? "contract" : "daily") as
            | "daily"
            | "contract"
            | "market",
          amount: r.daily_earnings,
          date: summary.date,
          isPaid: false,
          category: r.category_name,
          role: r.role_name,
        })),
      // Market records
      ...summary.marketLaborers
        .filter((m) => !m.isPaid)
        .map((m) => ({
          id: `market-${m.originalDbId}`,
          sourceType: "market" as const,
          sourceId: m.originalDbId,
          laborerName: m.roleName,
          laborerType: "market" as const,
          amount: m.dailyEarnings,
          date: summary.date,
          isPaid: false,
          role: m.roleName,
          count: m.groupCount,
        })),
    ];

    const dailyLaborPending = summary.records
      .filter((r) => !r.is_paid && r.laborer_type !== "contract")
      .reduce((sum, r) => sum + r.daily_earnings, 0);
    const contractLaborPending = summary.records
      .filter((r) => !r.is_paid && r.laborer_type === "contract")
      .reduce((sum, r) => sum + r.daily_earnings, 0);
    const marketLaborPending = summary.marketLaborers
      .filter((m) => !m.isPaid)
      .reduce((sum, m) => sum + m.dailyEarnings, 0);

    setSettlementConfig({
      context: "daily_single",
      date: summary.date,
      records,
      totalAmount: summary.totalSalary,
      pendingAmount: summary.pendingAmount,
      dailyLaborPending,
      contractLaborPending,
      marketLaborPending,
      allowTypeSelection: false,
    });
    setSettlementDialogOpen(true);
  }, []);

  // Open the weekly settlement dialog for a given WeeklySummary.
  const openWeeklySettlementDialog = useCallback(
    (weekly: WeeklySummary) => {
      setSettlementConfig({
        context: "weekly",
        dateRange: { from: weekly.weekStart, to: weekly.weekEnd },
        weekLabel: weekly.weekLabel,
        records: [], // Weekly settlement fetches records from DB
        totalAmount: weekly.totalPending,
        pendingAmount: weekly.totalPending,
        dailyLaborPending: weekly.pendingDailySalary,
        contractLaborPending: weekly.pendingContractSalary,
        marketLaborPending: weekly.pendingMarketSalary,
        allowTypeSelection: true,
      });
      setSettlementDialogOpen(true);
    },
    []
  );

  // React Query hook for attendance TABLE rows - infinite scroll, one week per page.
  // The cards above don't depend on these pages; they read scope-wide totals
  // from useAttendanceSummary so they stay accurate even when only a couple
  // of weeks are loaded into the table.
  const weeksQuery = useAttendanceWeeksInfinite({
    dateFrom,
    dateTo,
    isAllTime,
    enabled: !initialData || initialDataProcessedRef.current,
  });

  // Merge every loaded page into one RawAttendanceData blob so the existing
  // grouping/processing pipeline below stays untouched. Pages append on
  // scroll; merging is a flat concat.
  const attendanceQueryData: RawAttendanceData | undefined = useMemo(() => {
    if (!weeksQuery.data) return undefined;
    const dailyAttendance: any[] = [];
    const marketAttendance: any[] = [];
    const workSummaries: any[] = [];
    const teaShopEntries: any[] = [];
    const teaShopAllocations: any[] = [];
    const seenAlloc = new Set<string>();
    weeksQuery.data.pages.forEach((page) => {
      dailyAttendance.push(...page.data.dailyAttendance);
      marketAttendance.push(...page.data.marketAttendance);
      workSummaries.push(...page.data.workSummaries);
      teaShopEntries.push(...page.data.teaShopEntries);
      // Allocations are fetched per-page from the same source table, so the
      // same allocation row can show up in multiple pages. Dedupe on
      // (entry_id, allocated_amount) to avoid double-counting in the
      // per-day tea-shop UI.
      page.data.teaShopAllocations.forEach((a: any) => {
        const key = `${a.entry_id}|${a.allocated_amount}`;
        if (seenAlloc.has(key)) return;
        seenAlloc.add(key);
        teaShopAllocations.push(a);
      });
    });
    return {
      dailyAttendance,
      marketAttendance,
      workSummaries,
      teaShopEntries,
      teaShopAllocations,
    };
  }, [weeksQuery.data]);

  const queryLoading = weeksQuery.isLoading;
  const queryFetching = weeksQuery.isFetching;
  // The previous hook exposed isTransitioning to suppress stale data during a
  // site change. The infinite hook clears prior-site pages on mount, so the
  // closest equivalent is "still loading the first page after a site change".
  const siteTransitioning = weeksQuery.isFetching && !weeksQuery.data;
  const refetchAttendance = weeksQuery.refetch;

  // Scope-wide aggregates for the cards above (Period Total / Salary /
  // Tea Shop / Daily / Contract / Market / Paid / Pending / Avg-per-day).
  // Stays accurate at any scope because it's a single Postgres aggregate
  // call rather than a row-by-row sum on the client.
  const summaryQuery = useAttendanceSummary({
    dateFrom,
    dateTo,
    isAllTime,
    enabled: !initialData || initialDataProcessedRef.current,
  });

  // Hook to invalidate attendance cache after mutations
  const invalidateAttendance = useInvalidateAttendanceData();

  // Auto-load the next week when the sentinel row scrolls into view.
  // The 200px rootMargin starts the fetch slightly before the row is
  // actually visible so the loading indicator transitions are smooth.
  useEffect(() => {
    const node = loadMoreSentinelRef.current;
    if (!node) return;
    if (!weeksQuery.hasNextPage) return;
    if (weeksQuery.isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          weeksQuery.fetchNextPage();
        }
      },
      { rootMargin: "200px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [
    weeksQuery.hasNextPage,
    weeksQuery.isFetchingNextPage,
    weeksQuery.fetchNextPage,
    // Re-attach when the rendered row count changes (the sentinel TableRow
    // is conditionally mounted only when combinedDateEntries.length > 0).
    weeksQuery.data?.pages.length,
  ]);

  // Track previous site ID to detect site changes and clear stale data
  const previousSiteIdRef = useRef<string | null>(null);

  // Clear state immediately when site changes to prevent showing old data
  useEffect(() => {
    if (selectedSite?.id && previousSiteIdRef.current !== selectedSite.id) {
      if (previousSiteIdRef.current !== null) {
        // Site is changing - clear all attendance-related state immediately
        setAttendanceRecords([]);
        setDateSummaries([]);
        setWorkSummaries(new Map());
        setLoading(true);
      }
      previousSiteIdRef.current = selectedSite.id;
    }
  }, [selectedSite?.id]);

  // Process React Query data into component state when data changes
  // This replaces the old manual fetch + setState pattern
  useEffect(() => {
    if (!attendanceQueryData) {
      return;
    }

    const { dailyAttendance, marketAttendance, workSummaries: rawWorkSummaries, teaShopEntries, teaShopAllocations } = attendanceQueryData;

    // Build a set of entry IDs that have allocations for this site
    // (to avoid double-counting when entry.site_id === current site AND has allocation)
    const entryIdsWithAllocations = new Set<string>();
    (teaShopAllocations || []).forEach((alloc: any) => {
      if (alloc.entry?.id) {
        entryIdsWithAllocations.add(alloc.entry.id);
      }
    });

    // Build tea shop map (by date) - merge direct entries + allocations
    const teaShopMap = new Map<string, TeaShopData>();

    // Helper to create empty tea shop data
    const createEmptyTeaShopData = (): TeaShopData => ({
      teaTotal: 0,
      snacksTotal: 0,
      total: 0,
      workingCount: 0,
      workingTotal: 0,
      nonWorkingCount: 0,
      nonWorkingTotal: 0,
      marketCount: 0,
      marketTotal: 0,
    });

    // Process direct entries (site's own entries)
    teaShopEntries.forEach((t: any) => {
      // If this is a group entry that has allocations, skip it here
      // (we'll use the allocation amount instead to show this site's share)
      if (t.is_group_entry && entryIdsWithAllocations.has(t.id)) {
        return;
      }

      const existing = teaShopMap.get(t.date) || createEmptyTeaShopData();
      existing.teaTotal += t.tea_total || 0;
      existing.snacksTotal += t.snacks_total || 0;
      existing.total += t.total_amount || 0;
      existing.workingCount += t.working_laborer_count || 0;
      existing.workingTotal += t.working_laborer_total || 0;
      existing.nonWorkingCount += t.nonworking_laborer_count || 0;
      existing.nonWorkingTotal += t.nonworking_laborer_total || 0;
      existing.marketCount += t.market_laborer_count || 0;
      existing.marketTotal += t.market_laborer_total || 0;
      // Track if this is a group entry
      if (t.is_group_entry) {
        existing.isGroupEntry = true;
        existing.entryId = t.id;
      }
      teaShopMap.set(t.date, existing);
    });

    // Process allocations (this site's share of group entries)
    (teaShopAllocations || []).forEach((alloc: any) => {
      const entry = alloc.entry;
      if (!entry?.date) return;

      const date = entry.date;
      const existing = teaShopMap.get(date) || createEmptyTeaShopData();
      // RECALCULATE: Use percentage and total_amount for accurate display
      // This handles cases where stored allocated_amount is stale
      const recalculatedAmount = entry.total_amount && alloc.allocation_percentage != null
        ? Math.round((alloc.allocation_percentage / 100) * entry.total_amount)
        : alloc.allocated_amount || 0;
      existing.total += recalculatedAmount;
      // Mark as group entry for UI handling
      existing.isGroupEntry = true;
      existing.entryId = entry.id;
      teaShopMap.set(date, existing);
    });

    // Build work summaries map
    const summaryMap = new Map<string, DailyWorkSummary>();
    rawWorkSummaries.forEach((s: DailyWorkSummary) => {
      summaryMap.set(s.date, s);
    });
    setWorkSummaries(summaryMap);

    // Build market data map
    const marketMap = new Map<
      string,
      {
        count: number;
        salary: number;
        snacks: number;
        inTime: string | null;
        outTime: string | null;
        expandedRecords: MarketLaborerRecord[];
      }
    >();
    marketAttendance.forEach((m: any) => {
      const existing = marketMap.get(m.date) || {
        count: 0,
        salary: 0,
        snacks: 0,
        inTime: null,
        outTime: null,
        expandedRecords: [],
      };
      const roleName = m.labor_roles?.name || "Worker";
      const ratePerPerson = m.rate_per_person || 0;
      const dayUnits = m.day_units || m.work_days || 1;
      const perPersonEarnings = ratePerPerson * dayUnits;
      const perPersonSnacks = (m.snacks_per_person || 0) * dayUnits;

      // Expand into individual records
      for (let i = 0; i < m.count; i++) {
        existing.expandedRecords.push({
          id: `${m.id || m.date}-${roleName}-${i}`,
          originalDbId: m.id,
          roleId: m.role_id,
          date: m.date,
          tempName: `${roleName} ${
            existing.expandedRecords.filter((r) => r.roleName === roleName).length + 1
          }`,
          categoryName: "Market",
          roleName: roleName,
          index: i + 1,
          workDays: m.work_days || 1,
          dayUnits: dayUnits,
          ratePerPerson: ratePerPerson,
          dailyEarnings: perPersonEarnings,
          snacksAmount: perPersonSnacks,
          inTime: m.in_time || null,
          outTime: m.out_time || null,
          isPaid: m.is_paid || false,
          paidAmount: m.is_paid ? perPersonEarnings : 0,
          pendingAmount: m.is_paid ? 0 : perPersonEarnings,
          groupCount: m.count,
          paymentNotes: m.payment_notes || null,
          engineerTransactionId: m.engineer_transaction_id || null,
          expenseId: m.expense_id || null,
        });
      }

      existing.count += m.count;
      existing.salary += m.total_cost || m.count * ratePerPerson * dayUnits;
      existing.snacks += m.total_snacks || 0;
      if (!existing.inTime || (m.in_time && m.in_time < existing.inTime)) {
        existing.inTime = m.in_time;
      }
      if (!existing.outTime || (m.out_time && m.out_time > existing.outTime)) {
        existing.outTime = m.out_time;
      }
      marketMap.set(m.date, existing);
    });

    // Map attendance records
    const records: AttendanceRecord[] = dailyAttendance.map((record: any) => ({
      id: record.id,
      date: record.date,
      laborer_id: record.laborer_id,
      laborer_name: record.laborers.name,
      laborer_type: record.laborers.laborer_type || "daily_wage",
      category_name: record.laborers.labor_categories?.name || "Unknown",
      role_name: record.laborers.labor_roles?.name || "Unknown",
      team_name: record.laborers.team?.name || null,
      section_name: record.building_sections.name,
      work_days: record.work_days,
      hours_worked: record.hours_worked,
      daily_rate_applied: record.daily_rate_applied,
      daily_earnings: record.daily_earnings,
      is_paid: record.is_paid || false,
      payment_notes: record.payment_notes || null,
      subcontract_title: record.subcontracts?.title || null,
      engineer_transaction_id: record.engineer_transaction_id || null,
      expense_id: record.expense_id || null,
      paid_via: record.paid_via || null,
      in_time: record.in_time,
      lunch_out: record.lunch_out,
      lunch_in: record.lunch_in,
      out_time: record.out_time,
      work_hours: record.work_hours,
      break_hours: record.break_hours,
      total_hours: record.total_hours,
      day_units: record.day_units,
      snacks_amount: record.snacks_amount || 0,
      attendance_status: record.attendance_status || "confirmed",
      work_progress_percent: record.work_progress_percent ?? 100,
      entered_by: record.recorded_by || null,
      entered_by_user_id: record.recorded_by_user_id || null,
      entered_by_avatar: record.recorded_by_user?.avatar_url || null,
      updated_by: record.updated_by || null,
      updated_by_user_id: record.updated_by_user_id || null,
      updated_by_avatar: record.updated_by_user?.avatar_url || null,
      created_at: record.created_at,
      updated_at: record.updated_at,
    }));

    setAttendanceRecords(records);

    // Group by date for date-wise view
    const dateMap = new Map<string, DateSummary>();
    records.forEach((record) => {
      const existing = dateMap.get(record.date);

      if (existing) {
        existing.records.push(record);
        if (record.laborer_type === "contract") {
          existing.contractLaborerCount++;
          existing.contractLaborerAmount += record.daily_earnings;
        } else {
          existing.dailyLaborerCount++;
          existing.dailyLaborerAmount += record.daily_earnings;
        }
        existing.totalLaborerCount =
          existing.dailyLaborerCount +
          existing.contractLaborerCount +
          existing.marketLaborerCount;
        existing.totalSalary += record.daily_earnings;
        existing.totalSnacks += record.snacks_amount || 0;
        existing.totalExpense = existing.totalSalary + existing.totalSnacks;
        if (record.laborer_type !== "contract") {
          if (record.is_paid) {
            existing.paidCount++;
            existing.paidAmount += record.daily_earnings;
          } else {
            existing.pendingCount++;
            existing.pendingAmount += record.daily_earnings;
          }
        }
        if (
          record.in_time &&
          (!existing.firstInTime || record.in_time < existing.firstInTime)
        ) {
          existing.firstInTime = record.in_time;
        }
        if (
          record.out_time &&
          (!existing.lastOutTime || record.out_time > existing.lastOutTime)
        ) {
          existing.lastOutTime = record.out_time;
        }
        const cat = record.category_name;
        existing.categoryBreakdown[cat] = existing.categoryBreakdown[cat] || {
          count: 0,
          amount: 0,
        };
        existing.categoryBreakdown[cat].count += 1;
        existing.categoryBreakdown[cat].amount += record.daily_earnings;
      } else {
        const workSummary = summaryMap.get(record.date);
        const market = marketMap.get(record.date);
        const teaShop = teaShopMap.get(record.date);
        const categoryBreakdown: {
          [key: string]: { count: number; amount: number };
        } = {};
        categoryBreakdown[record.category_name] = {
          count: 1,
          amount: record.daily_earnings,
        };

        const initialPaidCount =
          record.laborer_type !== "contract" && record.is_paid ? 1 : 0;
        const initialPendingCount =
          record.laborer_type !== "contract" && !record.is_paid ? 1 : 0;
        const initialPaidAmount =
          record.laborer_type !== "contract" && record.is_paid
            ? record.daily_earnings
            : 0;
        const initialPendingAmount =
          record.laborer_type !== "contract" && !record.is_paid
            ? record.daily_earnings
            : 0;

        dateMap.set(record.date, {
          date: record.date,
          records: [record],
          marketLaborers: market?.expandedRecords || [],
          dailyLaborerCount: record.laborer_type !== "contract" ? 1 : 0,
          contractLaborerCount: record.laborer_type === "contract" ? 1 : 0,
          marketLaborerCount: market?.count || 0,
          totalLaborerCount: 1 + (market?.count || 0),
          firstInTime: record.in_time || market?.inTime || null,
          lastOutTime: record.out_time || market?.outTime || null,
          totalSalary: record.daily_earnings + (market?.salary || 0),
          totalSnacks: (record.snacks_amount || 0) + (market?.snacks || 0),
          totalExpense:
            record.daily_earnings +
            (record.snacks_amount || 0) +
            (market?.salary || 0) +
            (market?.snacks || 0),
          dailyLaborerAmount:
            record.laborer_type !== "contract" ? record.daily_earnings : 0,
          contractLaborerAmount:
            record.laborer_type === "contract" ? record.daily_earnings : 0,
          marketLaborerAmount: market?.salary || 0,
          paidCount: initialPaidCount,
          pendingCount: initialPendingCount,
          paidAmount: initialPaidAmount,
          pendingAmount: initialPendingAmount,
          workDescription: workSummary?.work_description || null,
          workStatus: workSummary?.work_status || null,
          comments: workSummary?.comments || null,
          workUpdates:
            ((workSummary as DailyWorkSummary & { work_updates?: unknown })
              ?.work_updates as unknown as WorkUpdates) || null,
          categoryBreakdown,
          isExpanded: false,
          teaShop: teaShop || null,
          attendanceStatus: record.attendance_status || "confirmed",
          workProgressPercent: record.work_progress_percent ?? 100,
        });
      }
    });

    // Add dates that only have market laborers
    marketMap.forEach((market, date) => {
      if (!dateMap.has(date)) {
        const workSummary = summaryMap.get(date);
        const teaShop = teaShopMap.get(date);
        dateMap.set(date, {
          date,
          records: [],
          marketLaborers: market.expandedRecords || [],
          dailyLaborerCount: 0,
          contractLaborerCount: 0,
          marketLaborerCount: market.count,
          totalLaborerCount: market.count,
          firstInTime: market.inTime,
          lastOutTime: market.outTime,
          totalSalary: market.salary,
          totalSnacks: market.snacks,
          totalExpense: market.salary + market.snacks,
          dailyLaborerAmount: 0,
          contractLaborerAmount: 0,
          marketLaborerAmount: market.salary,
          paidCount: 0,
          pendingCount: market.count,
          paidAmount: 0,
          pendingAmount: market.salary,
          workDescription: workSummary?.work_description || null,
          workStatus: workSummary?.work_status || null,
          comments: workSummary?.comments || null,
          workUpdates:
            ((workSummary as DailyWorkSummary & { work_updates?: unknown })
              ?.work_updates as unknown as WorkUpdates) || null,
          categoryBreakdown: {},
          isExpanded: false,
          teaShop: teaShop || null,
          attendanceStatus: "confirmed",
          workProgressPercent: 100,
        });
      }
    });

    setDateSummaries(
      Array.from(dateMap.values()).sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      )
    );
    setLoading(false);
  }, [attendanceQueryData]);

  // Market laborer edit dialog state
  const [marketLaborerEditOpen, setMarketLaborerEditOpen] = useState(false);
  const [editingMarketLaborer, setEditingMarketLaborer] =
    useState<MarketLaborerRecord | null>(null);
  const [marketLaborerEditForm, setMarketLaborerEditForm] = useState({
    count: 1,
    day_units: 1,
    rate_per_person: 0,
  });

  const canEdit = hasEditPermission(userProfile?.role);

  // Check for persisted drawer state on mount and restore if found
  useEffect(() => {
    const persistedState = getPersistedDrawerState();
    if (
      persistedState &&
      persistedState.dirty &&
      selectedSite?.id === persistedState.siteId
    ) {
      // Restore the drawer state
      setDrawerOpen(true);
      setDrawerMode(persistedState.mode);
      setSelectedDateForDrawer(persistedState.date);
      setRestorationMessage("Restored your unsaved work");
      // Clear message after 5 seconds
      setTimeout(() => setRestorationMessage(null), 5000);
    } else if (persistedState && persistedState.siteId !== selectedSite?.id) {
      // Different site, clear the persisted state
      clearPersistedDrawerState();
    }
  }, [selectedSite?.id]); // Only run when site changes

  // Period totals for the summary cards. Prefer the scope-wide RPC result
  // (accurate at any scope, including All Time, regardless of which weeks
  // the table has loaded). Fall back to summing the loaded dateSummaries
  // when the RPC hasn't returned yet — mostly the very first paint and
  // the brief window before the migration is applied locally.
  const periodTotals = useMemo<AttendancePeriodTotals>(() => {
    if (summaryQuery.data) return summaryQuery.data;

    let totalSalary = 0;
    let totalTeaShop = 0;
    let totalLaborers = 0;
    let totalPaidCount = 0;
    let totalPendingCount = 0;
    let totalPaidAmount = 0;
    let totalPendingAmount = 0;
    let totalDailyAmount = 0;
    let totalContractAmount = 0;
    let totalMarketAmount = 0;

    dateSummaries.forEach((s) => {
      totalSalary += s.totalSalary;
      totalTeaShop += s.teaShop?.total || 0;
      totalLaborers += s.totalLaborerCount;
      totalPaidCount += s.paidCount;
      totalPendingCount += s.pendingCount;
      totalPaidAmount += s.paidAmount;
      totalPendingAmount += s.pendingAmount;
      totalDailyAmount += s.dailyLaborerAmount;
      totalContractAmount += s.contractLaborerAmount;
      totalMarketAmount += s.marketLaborerAmount;
    });

    const totalExpense = totalSalary + totalTeaShop;

    return {
      totalSalary,
      totalTeaShop,
      totalExpense,
      totalLaborers,
      avgPerDay:
        dateSummaries.length > 0 ? totalExpense / dateSummaries.length : 0,
      totalPaidCount,
      totalPendingCount,
      totalPaidAmount,
      totalPendingAmount,
      totalDailyAmount,
      totalContractAmount,
      totalMarketAmount,
      activeDays: dateSummaries.length,
    };
  }, [summaryQuery.data, dateSummaries]);

  // Combined view: dateSummaries + holiday-only dates + weekly separators
  // This creates a merged list sorted by date descending with weekly summary strips
  const combinedDateEntries = useMemo(() => {
    // Get set of dates that have attendance data
    const attendanceDates = new Set(dateSummaries.map((s) => s.date));

    // Filter holidays that don't have attendance
    // When "All Time" is selected (dateFrom/dateTo are null), show all holidays
    // Otherwise, filter to the selected date range
    const holidaysWithoutAttendance = recentHolidays.filter((h) => {
      const hDate = h.date;
      const inDateRange = !dateFrom || !dateTo || (hDate >= dateFrom && hDate <= dateTo);
      return inDateRange && !attendanceDates.has(hDate);
    });

    // Group consecutive holidays with the same reason
    const holidayGroups = groupHolidays(holidaysWithoutAttendance);

    // Create grouped holiday entries (only if showHolidays is true)
    const holidayGroupEntries = showHolidays
      ? holidayGroups.map((group) => ({
          type: "holiday_group" as const,
          date: group.startDate,
          endDate: group.endDate,
          group,
        }))
      : [];

    // Calculate unfilled dates (dates with no attendance AND no holiday)
    // Use project start date if available, otherwise use the earliest visible date
    const projectStart = selectedSite?.start_date || dateFrom;
    // Use today as the end boundary (don't show future dates as unfilled)
    const todayStr = dayjs().format("YYYY-MM-DD");
    const projectEnd = dateTo && dateTo < todayStr ? dateTo : todayStr;

    // Get all holiday dates for unfilled calculation
    const holidayDates = new Set(recentHolidays.map((h) => h.date));

    // Calculate unfilled dates within the visible range, bounded by project dates
    const effectiveStart = dateFrom && projectStart ? (dateFrom > projectStart ? dateFrom : projectStart) : (dateFrom || projectStart);
    const effectiveEnd = dateTo && projectEnd ? (dateTo < projectEnd ? dateTo : projectEnd) : (dateTo || projectEnd);

    const unfilledDates = effectiveStart && effectiveEnd && showHolidays
      ? getUnfilledDates(effectiveStart, effectiveEnd, attendanceDates, holidayDates)
      : [];

    // Group consecutive unfilled dates
    const unfilledGroups = groupUnfilledDates(unfilledDates);

    // Create unfilled group entries
    const unfilledGroupEntries = unfilledGroups.map((group) => ({
      type: "unfilled_group" as const,
      date: group.startDate,
      endDate: group.endDate,
      group,
    }));

    // Map dateSummaries and check if each date is also a holiday
    // Only show holiday indicator if showHolidays is true
    const attendanceEntries = dateSummaries.map((s) => {
      const holiday = showHolidays
        ? recentHolidays.find((h) => h.date === s.date) || null
        : null;
      return {
        type: "attendance" as const,
        date: s.date,
        summary: s,
        holiday,
      };
    });

    // Combine and sort by date descending
    const combined = [...attendanceEntries, ...holidayGroupEntries, ...unfilledGroupEntries].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // Insert weekly separators BETWEEN different weeks (after Saturday, before next week's Sunday)
    // A week runs Sunday to Saturday. When viewing descending (newest first), we show
    // separator AFTER all entries of one week, BEFORE entries of the previous week.
    type CombinedEntry =
      | { type: "attendance"; date: string; summary: DateSummary; holiday: typeof recentHolidays[0] | null }
      | { type: "holiday_group"; date: string; endDate: string; group: HolidayGroup }
      | { type: "unfilled_group"; date: string; endDate: string; group: UnfilledGroup }
      | { type: "weekly_separator"; date: string; weeklySummary: WeeklySummary };

    const withWeeklySeparators: CombinedEntry[] = [];

    // Group entries by their week (week starts on Sunday)
    const entriesByWeek = new Map<string, (typeof combined)[0][]>();

    combined.forEach((entry) => {
      const weekStart = dayjs(entry.date).startOf("week").format("YYYY-MM-DD");
      if (!entriesByWeek.has(weekStart)) {
        entriesByWeek.set(weekStart, []);
      }
      entriesByWeek.get(weekStart)!.push(entry);
    });

    // Sort weeks descending (newest first)
    const sortedWeeks = Array.from(entriesByWeek.keys()).sort(
      (a, b) => new Date(b).getTime() - new Date(a).getTime()
    );

    // Helper to calculate weekly summary
    const today = dayjs().startOf("day");
    const currentWeekStart = today.startOf("week").format("YYYY-MM-DD");

    const calculateWeeklySummary = (
      weekStart: string,
      entries: (typeof combined)[0][]
    ): WeeklySummary => {
      let pendingDailySalary = 0;
      let pendingContractSalary = 0;
      let pendingMarketSalary = 0;
      let teaShopExpenses = 0;
      let totalLaborers = 0;
      const contractLaborerIds: string[] = [];
      let weekEnd = weekStart;

      entries.forEach((e) => {
        if (e.date > weekEnd) weekEnd = e.date;
        if (e.type === "attendance") {
          e.summary.records.forEach((r) => {
            if (!r.is_paid) {
              if (r.laborer_type === "contract") {
                pendingContractSalary += r.daily_earnings;
                if (!contractLaborerIds.includes(r.laborer_id)) {
                  contractLaborerIds.push(r.laborer_id);
                }
              } else {
                pendingDailySalary += r.daily_earnings;
              }
            }
          });
          e.summary.marketLaborers.forEach((m) => {
            if (!m.isPaid) {
              pendingMarketSalary += m.dailyEarnings;
            }
          });
          teaShopExpenses += e.summary.teaShop?.total || 0;
          totalLaborers += e.summary.totalLaborerCount;
        }
      });

      const isCurrentWeek = weekStart === currentWeekStart;

      return {
        weekStart,
        weekEnd,
        weekLabel: isCurrentWeek
          ? `This Week: ${dayjs(weekStart).format("MMM D")} - ${dayjs(weekEnd).format("MMM D, YYYY")}`
          : `${dayjs(weekStart).format("MMM D")} - ${dayjs(weekEnd).format("MMM D, YYYY")}`,
        totalLaborers,
        totalWorkDays: entries.filter((e) => e.type === "attendance").length,
        pendingDailySalary,
        pendingContractSalary,
        pendingMarketSalary,
        teaShopExpenses,
        totalPending: pendingDailySalary + pendingContractSalary + pendingMarketSalary,
        contractLaborerIds,
        isCurrentWeek,
      };
    };

    // Build the final list with separators ABOVE each week's entries
    sortedWeeks.forEach((weekStart) => {
      const entries = entriesByWeek.get(weekStart)!;

      // Calculate weekly summary
      const weeklySummary = calculateWeeklySummary(weekStart, entries);

      // Add separator ABOVE this week's entries (if there are any attendance entries)
      if (weeklySummary.totalLaborers > 0) {
        withWeeklySeparators.push({
          type: "weekly_separator",
          date: `week-${weekStart}`,
          weeklySummary,
        });
      }

      // Add all entries for this week (they're already sorted descending)
      entries.forEach((entry) => {
        withWeeklySeparators.push(entry as CombinedEntry);
      });
    });

    return withWeeklySeparators;
  }, [dateSummaries, recentHolidays, dateFrom, dateTo, showHolidays, selectedSite?.start_date]);

  // Process initialData from server on first render
  useEffect(() => {
    if (initialData && !initialDataProcessedRef.current) {
      initialDataProcessedRef.current = true;

      // Initialize holidays from server data
      if (initialData.holidays && initialData.holidays.length > 0) {
        setRecentHolidays(initialData.holidays);
        const today = dayjs().format("YYYY-MM-DD");
        const todayHolidayData = initialData.holidays.find((h: any) => h.date === today);
        if (todayHolidayData) {
          setTodayHoliday(todayHolidayData);
        }
      }

      // Process the raw server data into component state
      processServerData(initialData);
    }
  }, [initialData]);

  // Helper function to process server data into component state
  const processServerData = useCallback((data: AttendancePageData) => {
    const { attendanceRecords: rawAttendance, marketLaborerRecords: rawMarket, workSummaries: rawSummaries, teaShopEntries: rawTeaShop, teaShopAllocations } = data;

    // Build work summaries map
    const summaryMap = new Map<string, DailyWorkSummary>();
    (rawSummaries || []).forEach((s: DailyWorkSummary) => {
      summaryMap.set(s.date, s);
    });
    setWorkSummaries(summaryMap);

    // Build a set of entry IDs that have allocations for this site
    // (to avoid double-counting when entry.site_id === current site AND has allocation)
    const entryIdsWithAllocations = new Set<string>();
    (teaShopAllocations || []).forEach((alloc: any) => {
      if (alloc.entry?.id) {
        entryIdsWithAllocations.add(alloc.entry.id);
      }
    });

    // Build tea shop map
    const teaShopMap = new Map<string, TeaShopData>();

    // Process direct entries (site's own entries)
    (rawTeaShop || []).forEach((t: any) => {
      // If this is a group entry that has allocations, skip it here
      // (we'll use the allocation amount instead to show this site's share)
      if (t.is_group_entry && entryIdsWithAllocations.has(t.id)) {
        return;
      }

      const existing = teaShopMap.get(t.date) || {
        teaTotal: 0, snacksTotal: 0, total: 0,
        workingCount: 0, workingTotal: 0, nonWorkingCount: 0, nonWorkingTotal: 0,
        marketCount: 0, marketTotal: 0,
      };
      existing.teaTotal += t.tea_total || 0;
      existing.snacksTotal += t.snacks_total || 0;
      existing.total += t.total_amount || 0;
      // Track if this is a group entry
      if (t.is_group_entry) {
        existing.isGroupEntry = true;
        existing.entryId = t.id;
      }
      teaShopMap.set(t.date, existing);
    });

    // Process allocations (this site's share of group entries)
    (teaShopAllocations || []).forEach((alloc: any) => {
      const entry = alloc.entry;
      if (!entry?.date) return;

      const date = entry.date;
      const existing = teaShopMap.get(date) || {
        teaTotal: 0, snacksTotal: 0, total: 0,
        workingCount: 0, workingTotal: 0, nonWorkingCount: 0, nonWorkingTotal: 0,
        marketCount: 0, marketTotal: 0,
      };
      // Recalculate amount from percentage for accuracy
      const recalculatedAmount = entry.total_amount && alloc.allocation_percentage != null
        ? Math.round((alloc.allocation_percentage / 100) * entry.total_amount)
        : alloc.allocated_amount || 0;
      existing.total += recalculatedAmount;
      // Mark as group entry for UI handling
      existing.isGroupEntry = true;
      existing.entryId = entry.id;
      teaShopMap.set(date, existing);
    });

    // Build market data map
    const marketMap = new Map<string, { count: number; salary: number; snacks: number; inTime: string | null; outTime: string | null; expandedRecords: MarketLaborerRecord[] }>();
    (rawMarket || []).forEach((m: any) => {
      const existing = marketMap.get(m.date) || { count: 0, salary: 0, snacks: 0, inTime: null, outTime: null, expandedRecords: [] };
      const roleName = m.labor_roles?.name || "Worker";
      const ratePerPerson = m.rate_per_person || 0;
      const dayUnits = m.day_units || m.work_days || 1;
      const perPersonEarnings = ratePerPerson * dayUnits;
      const perPersonSnacks = (m.snacks_per_person || 0) * dayUnits;

      for (let i = 0; i < m.count; i++) {
        existing.expandedRecords.push({
          id: `${m.id || m.date}-${roleName}-${i}`,
          originalDbId: m.id, roleId: m.role_id, date: m.date,
          tempName: `${roleName} ${existing.expandedRecords.filter((r) => r.roleName === roleName).length + 1}`,
          categoryName: "Market", roleName, index: i + 1,
          workDays: m.work_days || 1, dayUnits, ratePerPerson,
          dailyEarnings: perPersonEarnings, snacksAmount: perPersonSnacks,
          inTime: m.in_time || null, outTime: m.out_time || null,
          isPaid: m.is_paid || false,
          paidAmount: m.is_paid ? perPersonEarnings : 0,
          pendingAmount: m.is_paid ? 0 : perPersonEarnings,
          groupCount: m.count, paymentNotes: m.payment_notes || null,
          engineerTransactionId: m.engineer_transaction_id || null,
          expenseId: m.expense_id || null,
        });
      }
      existing.count += m.count;
      existing.salary += m.total_cost || m.count * ratePerPerson * dayUnits;
      existing.snacks += m.total_snacks || 0;
      if (!existing.inTime || (m.in_time && m.in_time < existing.inTime)) existing.inTime = m.in_time;
      if (!existing.outTime || (m.out_time && m.out_time > existing.outTime)) existing.outTime = m.out_time;
      marketMap.set(m.date, existing);
    });

    // Map attendance records
    const records: AttendanceRecord[] = (rawAttendance || []).map((record: any) => ({
      id: record.id, date: record.date, laborer_id: record.laborer_id,
      laborer_name: record.laborers?.name || "Unknown",
      laborer_type: record.laborers?.laborer_type || "daily_wage",
      category_name: record.laborers?.labor_categories?.name || "Unknown",
      role_name: record.laborers?.labor_roles?.name || "Unknown",
      team_name: record.laborers?.team?.name || null,
      section_name: record.building_sections?.name || "Unknown",
      work_days: record.work_days, hours_worked: record.hours_worked,
      daily_rate_applied: record.daily_rate_applied, daily_earnings: record.daily_earnings,
      is_paid: record.is_paid || false, payment_notes: record.payment_notes || null,
      subcontract_title: record.subcontracts?.title || null,
      in_time: record.in_time, lunch_out: record.lunch_out, lunch_in: record.lunch_in,
      out_time: record.out_time, work_hours: record.work_hours, break_hours: record.break_hours,
      total_hours: record.total_hours, day_units: record.day_units, snacks_amount: record.snacks_amount || 0,
      attendance_status: record.attendance_status || "confirmed",
      work_progress_percent: record.work_progress_percent ?? 100,
      entered_by: record.recorded_by || null, entered_by_avatar: record.recorded_by_user?.avatar_url || null,
      updated_by: record.updated_by || null, updated_by_avatar: record.updated_by_user?.avatar_url || null,
      created_at: record.created_at, updated_at: record.updated_at,
    }));
    setAttendanceRecords(records);

    // Group by date for date-wise view
    const dateMap = new Map<string, DateSummary>();
    records.forEach((record) => {
      const existing = dateMap.get(record.date);
      if (existing) {
        existing.records.push(record);
        if (record.laborer_type === "contract") { existing.contractLaborerCount++; existing.contractLaborerAmount += record.daily_earnings; }
        else { existing.dailyLaborerCount++; existing.dailyLaborerAmount += record.daily_earnings; }
        existing.totalLaborerCount = existing.dailyLaborerCount + existing.contractLaborerCount + existing.marketLaborerCount;
        existing.totalSalary += record.daily_earnings;
        existing.totalSnacks += record.snacks_amount || 0;
        existing.totalExpense = existing.totalSalary + existing.totalSnacks;
        if (record.laborer_type !== "contract") {
          if (record.is_paid) { existing.paidCount++; existing.paidAmount += record.daily_earnings; }
          else { existing.pendingCount++; existing.pendingAmount += record.daily_earnings; }
        }
        if (record.in_time && (!existing.firstInTime || record.in_time < existing.firstInTime)) existing.firstInTime = record.in_time;
        if (record.out_time && (!existing.lastOutTime || record.out_time > existing.lastOutTime)) existing.lastOutTime = record.out_time;
        const cat = record.category_name;
        existing.categoryBreakdown[cat] = existing.categoryBreakdown[cat] || { count: 0, amount: 0 };
        existing.categoryBreakdown[cat].count += 1;
        existing.categoryBreakdown[cat].amount += record.daily_earnings;
      } else {
        const workSummary = summaryMap.get(record.date);
        const market = marketMap.get(record.date);
        const teaShop = teaShopMap.get(record.date);
        const categoryBreakdown: { [key: string]: { count: number; amount: number } } = {};
        categoryBreakdown[record.category_name] = { count: 1, amount: record.daily_earnings };
        const initialPaidCount = record.laborer_type !== "contract" && record.is_paid ? 1 : 0;
        const initialPendingCount = record.laborer_type !== "contract" && !record.is_paid ? 1 : 0;
        dateMap.set(record.date, {
          date: record.date, records: [record], marketLaborers: market?.expandedRecords || [],
          dailyLaborerCount: record.laborer_type !== "contract" ? 1 : 0,
          contractLaborerCount: record.laborer_type === "contract" ? 1 : 0,
          marketLaborerCount: market?.count || 0, totalLaborerCount: 1 + (market?.count || 0),
          firstInTime: record.in_time || market?.inTime || null, lastOutTime: record.out_time || market?.outTime || null,
          totalSalary: record.daily_earnings + (market?.salary || 0),
          totalSnacks: (record.snacks_amount || 0) + (market?.snacks || 0),
          totalExpense: record.daily_earnings + (record.snacks_amount || 0) + (market?.salary || 0) + (market?.snacks || 0),
          dailyLaborerAmount: record.laborer_type !== "contract" ? record.daily_earnings : 0,
          contractLaborerAmount: record.laborer_type === "contract" ? record.daily_earnings : 0,
          marketLaborerAmount: market?.salary || 0,
          paidCount: initialPaidCount, pendingCount: initialPendingCount,
          paidAmount: record.laborer_type !== "contract" && record.is_paid ? record.daily_earnings : 0,
          pendingAmount: record.laborer_type !== "contract" && !record.is_paid ? record.daily_earnings : 0,
          workDescription: workSummary?.work_description || null, workStatus: workSummary?.work_status || null,
          comments: workSummary?.comments || null,
          workUpdates: ((workSummary as DailyWorkSummary & { work_updates?: unknown })?.work_updates as unknown as WorkUpdates) || null,
          categoryBreakdown, isExpanded: false, teaShop: teaShop || null,
          attendanceStatus: record.attendance_status || "confirmed", workProgressPercent: record.work_progress_percent ?? 100,
        });
      }
    });

    // Add dates with only market laborers
    marketMap.forEach((market, date) => {
      if (!dateMap.has(date)) {
        const workSummary = summaryMap.get(date);
        const teaShop = teaShopMap.get(date);
        dateMap.set(date, {
          date, records: [], marketLaborers: market.expandedRecords || [],
          dailyLaborerCount: 0, contractLaborerCount: 0, marketLaborerCount: market.count,
          totalLaborerCount: market.count, firstInTime: market.inTime, lastOutTime: market.outTime,
          totalSalary: market.salary, totalSnacks: market.snacks, totalExpense: market.salary + market.snacks,
          dailyLaborerAmount: 0, contractLaborerAmount: 0, marketLaborerAmount: market.salary,
          paidCount: 0, pendingCount: market.count, paidAmount: 0, pendingAmount: market.salary,
          workDescription: workSummary?.work_description || null, workStatus: workSummary?.work_status || null,
          comments: workSummary?.comments || null,
          workUpdates: ((workSummary as DailyWorkSummary & { work_updates?: unknown })?.work_updates as unknown as WorkUpdates) || null,
          categoryBreakdown: {}, isExpanded: false, teaShop: teaShop || null,
          attendanceStatus: "confirmed", workProgressPercent: 100,
        });
      }
    });

    setDateSummaries(Array.from(dateMap.values()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    setLoading(false);
  }, []);

  // (Legacy refetch-on-date-change effect removed.) The infinite weeks query
  // now keys on { siteId, dateFrom, dateTo, isAllTime }, so React Query
  // refetches automatically when any of those change — no manual invalidate
  // needed here. Keeping the old effect caused an infinite refetch loop
  // whenever the SiteContext returned a fresh selectedSite reference.

  // Check if today is a holiday for the selected site
  const checkTodayHoliday = useCallback(async () => {
    if (!selectedSite?.id) {
      setTodayHoliday(null);
      setRecentHolidays([]);
      return;
    }

    const today = dayjs().format("YYYY-MM-DD");

    // Use dateFrom if available, otherwise use site's start_date, or fall back to 1 year ago
    // This ensures we fetch holidays for the entire visible date range, not just recent 30 days
    const queryFrom = dateFrom || selectedSite?.start_date || dayjs().subtract(1, "year").format("YYYY-MM-DD");
    // Use dateTo if available, otherwise default to 30 days in future
    const queryTo = dateTo || dayjs().add(30, "day").format("YYYY-MM-DD");

    try {
      // Check today's holiday (use maybeSingle to avoid error when no holiday exists)
      const { data: todayData, error: todayError } = await supabase
        .from("site_holidays")
        .select("*")
        .eq("site_id", selectedSite.id)
        .eq("date", today)
        .maybeSingle();

      if (todayError) {
        console.error("Error fetching today's holiday:", todayError);
      }
      setTodayHoliday(todayData || null);

      // Fetch holidays within the selected date range (plus upcoming holidays)
      const { data: holidaysData, error: holidaysError } = await supabase
        .from("site_holidays")
        .select("*")
        .eq("site_id", selectedSite.id)
        .gte("date", queryFrom)
        .lte("date", queryTo)
        .order("date", { ascending: false });

      if (holidaysError) {
        console.error("Error fetching holidays:", holidaysError);
      }
      setRecentHolidays(holidaysData || []);
    } catch (err) {
      console.error("Error checking holidays:", err);
    }
  }, [selectedSite?.id, selectedSite?.start_date, supabase, dateFrom, dateTo]);

  useEffect(() => {
      checkTodayHoliday();
  }, [checkTodayHoliday]);

  const handleHolidayClick = () => {
    if (todayHoliday) {
      setHolidayDialogMode("revoke");
    } else {
      setSelectedHolidayDate(null); setSelectedExistingHoliday(null); // null means today's date
      setHolidayDialogMode("mark");
    }
    setHolidayDialogOpen(true);
  };

  const handleHolidaySuccess = useCallback(async (newHoliday?: SiteHoliday) => {
    setSelectedHolidayDate(null);
    setSelectedExistingHoliday(null);

    // Immediately update state for instant UI feedback
    if (newHoliday) {
      setRecentHolidays(prev => [...prev, newHoliday]);
    }

    // CRITICAL: Wait for holiday data to refresh from DB BEFORE invalidating attendance
    // This prevents race condition where attendance refetches before holidays are updated
    await checkTodayHoliday();

    // Now safe to invalidate attendance - holidays state is guaranteed to be up-to-date
    invalidateAttendance();
  }, [checkTodayHoliday, invalidateAttendance]);

  // Handler for filling attendance on an unfilled date
  const handleFillUnfilledDate = useCallback((date: string) => {
    // Check if this date is a holiday
    const isHoliday = recentHolidays.some((h) => h.date === date);

    if (isHoliday) {
      // Show confirmation dialog to remove holiday first
      setUnfilledActionDialog({ open: true, date, isHoliday: true });
    } else {
      // Open attendance drawer for this date
      setSelectedDateForDrawer(date);
      setDrawerMode("full");
      setDrawerOpen(true);
    }
  }, [recentHolidays]);

  // Handler for marking an unfilled date as holiday (or revoking if already a holiday)
  const handleMarkUnfilledAsHoliday = useCallback(async (date: string) => {
    if (!selectedSite?.id) return;

    // Check if this date has attendance
    const hasAttendance = dateSummaries.some((s) => s.date === date);

    if (hasAttendance) {
      // Show error - cannot mark as holiday if attendance exists
      setRestorationMessage("Cannot mark as holiday - attendance already exists for this date.");
      return;
    }

    // Check the database directly for existing holiday (more reliable than recentHolidays)
    const { data: existingHolidayData } = await supabase
      .from("site_holidays")
      .select("*")
      .eq("site_id", selectedSite.id)
      .eq("date", date)
      .maybeSingle();

    setSelectedHolidayDate(date);
    if (existingHolidayData) {
      // Date is already a holiday - open revoke dialog
      setSelectedExistingHoliday(existingHolidayData);
      setHolidayDialogMode("revoke");
    } else {
      // Date is not a holiday - open mark dialog
      setSelectedExistingHoliday(null);
      setHolidayDialogMode("mark");
    }
    setHolidayDialogOpen(true);
  }, [dateSummaries, selectedSite?.id, supabase]);


  // Handler for confirming to overwrite a holiday with attendance
  const handleConfirmOverwriteHoliday = useCallback(async () => {
    if (!unfilledActionDialog?.date || !selectedSite?.id) return;

    try {
      // Delete the holiday first
      const { error: deleteError } = await supabase
        .from("site_holidays")
        .delete()
        .eq("site_id", selectedSite.id)
        .eq("date", unfilledActionDialog.date);

      if (deleteError) {
        console.error("Error deleting holiday:", deleteError);
        setRestorationMessage("Failed to remove holiday. Please try again.");
        return;
      }

      // Refresh holidays
      checkTodayHoliday();

      // Open attendance drawer for this date
      setSelectedDateForDrawer(unfilledActionDialog.date);
      setDrawerMode("full");
      setDrawerOpen(true);
      setUnfilledActionDialog(null);
    } catch (err) {
      console.error("Error overwriting holiday:", err);
      setRestorationMessage("An error occurred. Please try again.");
    }
  }, [unfilledActionDialog, selectedSite?.id, supabase, checkTodayHoliday]);

  const toggleDateExpanded = (date: string) => {
    setDateSummaries((prev) =>
      prev.map((d) =>
        d.date === date ? { ...d, isExpanded: !d.isExpanded } : d
      )
    );
  };

  const handleOpenEditDialog = useCallback((record: AttendanceRecord) => {
    // Check if record is paid - prevent editing paid records
    if (record.is_paid) {
      setPaidRecordDialog({
        open: true,
        record,
        action: "edit",
        date: record.date,
      });
      return;
    }

    setEditingRecord(record);
    setEditForm({
      work_days: record.work_days,
      daily_rate_applied: record.daily_rate_applied,
    });
    setEditDialogOpen(true);
  }, []);

  // Handler to open payment dialog for a single record
  const handleOpenPaymentDialog = useCallback((record: AttendanceRecord) => {
    const paymentRecord: DailyPaymentRecord = {
      id: `daily-${record.id}`,
      sourceType: "daily",
      sourceId: record.id,
      date: record.date,
      laborerId: record.laborer_id,
      laborerName: record.laborer_name,
      laborerType: "daily",
      category: record.category_name,
      role: record.role_name,
      amount: record.daily_earnings,
      isPaid: record.is_paid,
      paidVia: null,
      paymentDate: null,
      paymentMode: null,
      engineerTransactionId: null,
      engineerUserId: null,
      proofUrl: null,
      paymentNotes: record.payment_notes || null,
      subcontractId: null,
      subcontractTitle: record.subcontract_title || null,
      expenseId: null,
      settlementStatus: null,
      companyProofUrl: null,
      engineerProofUrl: null,
      transactionDate: null,
      settledDate: null,
      confirmedAt: null,
      settlementMode: null,
      cashReason: null,
      moneySource: null,
      moneySourceName: null,
      settlementGroupId: null,
      settlementReference: null,
    };
    setPaymentRecords([paymentRecord]);
    setPaymentDialogOpen(true);
  }, []);

  const handlePaymentSuccess = () => {
    setPaymentDialogOpen(false);
    setPaymentRecords([]);
    invalidateAttendance();
  };

  const handleEditSubmit = async () => {
    if (!editingRecord) return;

    setLoading(true);
    try {
      const daily_earnings = editForm.work_days * editForm.daily_rate_applied;
      const hasSettlement = editingRecord.engineer_transaction_id || editingRecord.expense_id;

      // Update attendance fields
      const { error, data } = await supabase
        .from("daily_attendance")
        .update({
          work_days: editForm.work_days,
          daily_rate_applied: editForm.daily_rate_applied,
          daily_earnings,
          hours_worked: editForm.work_days * 8,
          updated_at: new Date().toISOString(),
          updated_by: userProfile?.name || "Unknown",
          updated_by_user_id: userProfile?.id,
        })
        .eq("id", editingRecord.id)
        .select();

      if (error) {
        console.error("Update error:", error);
        throw error;
      }

      // If this record was linked to any payment/settlement, reset it
      if (hasSettlement) {
        // Reset this attendance record's payment status
        const { error: resetError } = await supabase
          .from("daily_attendance")
          .update({
            is_paid: false,
            payment_date: null,
            payment_mode: null,
            paid_via: null,
            engineer_transaction_id: null,
            payment_proof_url: null,
            payment_notes: null,
            payer_source: null,
            payer_name: null,
            expense_id: null,
          })
          .eq("id", editingRecord.id);

        if (resetError) {
          console.error("Reset payment error:", resetError);
        }

        // Reset the engineer transaction settlement status to pending if exists
        if (editingRecord.engineer_transaction_id) {
          const { error: txError } = await supabase
            .from("site_engineer_transactions")
            .update({
              settlement_status: "pending_settlement",
            })
            .eq("id", editingRecord.engineer_transaction_id);

          if (txError) {
            console.error("Reset transaction error:", txError);
          }
        }

        // Handle expense record if exists (direct payment)
        if (editingRecord.expense_id) {
          const { error: expenseError } = await supabase
            .from("expenses")
            .update({
              notes: "Attendance modified - requires re-settlement",
              updated_at: new Date().toISOString(),
            })
            .eq("id", editingRecord.expense_id);

          if (expenseError) {
            console.error("Update expense error:", expenseError);
          }
        }
      }

      setEditDialogOpen(false);
      setEditingRecord(null);
      invalidateAttendance();
    } catch (error: any) {
      console.error("Edit failed:", error);
      alert("Failed to update: " + (error.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDrawerForDate = (
    date: string,
    mode: "morning" | "evening" | "full" = "full"
  ) => {
    setSelectedDateForDrawer(date);
    setDrawerMode(mode);
    setDrawerOpen(true);
  };

  // Fetch tea shop account for site (or create one if doesn't exist)
  const fetchTeaShopAccount = async (): Promise<TeaShopAccount | null> => {
    if (!selectedSite) return null;

    try {
      // Try to get existing active shop for site
      const { data: existingShop } = await (
        supabase.from("tea_shop_accounts") as any
      )
        .select("*")
        .eq("site_id", selectedSite.id)
        .eq("is_active", true)
        .single();

      if (existingShop) {
        return existingShop;
      }

      // If no shop exists, create a default one
      const { data: newShop, error: createError } = await (
        supabase.from("tea_shop_accounts") as any
      )
        .insert({
          site_id: selectedSite.id,
          shop_name: `${selectedSite.name} Tea Shop`,
          is_active: true,
        })
        .select()
        .single();

      if (createError) {
        console.error("Error creating tea shop account:", createError);
        return null;
      }

      return newShop;
    } catch (error) {
      console.error("Error fetching/creating tea shop account:", error);
      return null;
    }
  };

  // Fetch group allocations for popover display
  const fetchGroupEntryAllocations = async (entryId: string) => {
    // Fetch allocations with their percentages
    const { data: allocations } = await (supabase as any)
      .from("tea_shop_entry_allocations")
      .select("*, site:sites(id, name)")
      .eq("entry_id", entryId);

    // Fetch the entry to get total_amount for recalculation
    const { data: entry } = await (supabase as any)
      .from("tea_shop_entries")
      .select("total_amount")
      .eq("id", entryId)
      .single();

    // Recalculate allocated amounts based on current percentages and total
    if (allocations && entry?.total_amount) {
      const percentages = allocations.map((a: any) => a.allocation_percentage || 0);
      const recalculatedAmounts = allocateAmounts(entry.total_amount, percentages);
      const recalculatedAllocations = allocations.map((a: any, index: number) => ({
        ...a,
        allocated_amount: recalculatedAmounts[index],
      }));
      setPopoverGroupAllocations(recalculatedAllocations);
    } else {
      setPopoverGroupAllocations(allocations);
    }
  };

  // Fetch group entry data synchronously before opening edit dialog
  const handleEditGroupEntry = async (entryId: string, date: string) => {
    try {
      // Fetch entry from tea_shop_entries
      const { data: entry, error: entryError } = await (supabase as any)
        .from("tea_shop_entries")
        .select("*")
        .eq("id", entryId)
        .single();

      if (entryError) {
        console.error("Error fetching entry:", entryError);
        return;
      }

      // Fetch allocations from tea_shop_entry_allocations
      const { data: allocations } = await (supabase as any)
        .from("tea_shop_entry_allocations")
        .select("*, site:sites(id, name)")
        .eq("entry_id", entryId);

      // Fetch tea shop from entry's tea_shop_id (fallback if groupTeaShop is null)
      let teaShopForEdit = groupTeaShop;
      if (!teaShopForEdit && entry.tea_shop_id) {
        const { data: fetchedShop } = await (supabase as any)
          .from("tea_shop_accounts")
          .select("*")
          .eq("id", entry.tea_shop_id)
          .single();
        teaShopForEdit = fetchedShop;
      }

      // Fetch site group from entry's site_group_id (fallback if siteGroup is null)
      let siteGroupForEdit = siteGroup;
      if (!siteGroupForEdit && entry.site_group_id) {
        const { data: fetchedGroup } = await (supabase as any)
          .from("site_groups")
          .select("*, sites(*)")
          .eq("id", entry.site_group_id)
          .single();
        siteGroupForEdit = fetchedGroup;
      }

      // Transform to expected format for GroupTeaShopEntryDialog
      // RECALCULATE allocations based on current total_amount and percentages
      const percentages = (allocations || []).map((a: any) => a.allocation_percentage || 0);
      const recalculatedAmounts = allocateAmounts(entry.total_amount, percentages);

      const fullEntry = {
        id: entry.id,
        tea_shop_id: entry.tea_shop_id,
        site_group_id: entry.site_group_id || null,
        date: entry.date,
        total_amount: entry.total_amount,
        is_percentage_override: entry.is_percentage_override || false,
        percentage_split: entry.percentage_split || null,
        notes: entry.notes,
        entered_by: entry.entered_by,
        entered_by_user_id: entry.entered_by_user_id,
        created_at: entry.created_at,
        updated_at: entry.updated_at,
        allocations: (allocations || []).map((a: any, index: number) => ({
          id: a.id,
          group_entry_id: entryId,
          site_id: a.site_id,
          site: a.site,
          named_laborer_count: a.worker_count || 0,
          market_laborer_count: 0,
          attendance_count: a.worker_count || 0,
          allocation_percentage: a.allocation_percentage,
          // Use recalculated amount instead of potentially stale stored value
          allocated_amount: recalculatedAmounts[index],
        })),
      };

      // Set data and open dialog
      setEditingGroupEntryData(fullEntry);
      setEditingTeaShop(teaShopForEdit);
      setEditingSiteGroup(siteGroupForEdit);
      setTeaShopDialogDate(date);
      setGroupTeaShopDialogOpen(true);
    } catch (err) {
      console.error("Error in handleEditGroupEntry:", err);
    }
  };

  // Handler to open tea shop dialog directly
  const handleOpenTeaShopDialog = async (date: string) => {
    // If site has a group tea shop, show entry mode dialog first
    if (siteGroupId && groupTeaShop) {
      setTeaShopDialogDate(date);
      setTeaShopEntryModeDialogOpen(true);
      return;
    }

    // Otherwise, open site-specific tea shop dialog
    const shop = await fetchTeaShopAccount();
    if (shop) {
      // Check if there's an existing entry for this date
      const { data: existingEntry } = await (
        supabase.from("tea_shop_entries") as any
      )
        .select("*")
        .eq("tea_shop_id", shop.id)
        .eq("date", date)
        .maybeSingle();

      setTeaShopAccount(shop);
      setTeaShopDialogDate(date);
      setTeaShopEditingEntry(existingEntry || null);
      setTeaShopDialogOpen(true);
    } else {
      alert("Could not load tea shop. Please try again.");
    }
  };

  // Handler for site-specific entry from entry mode dialog
  const handleSiteSpecificTeaEntry = async () => {
    setTeaShopEntryModeDialogOpen(false);
    const shop = await fetchTeaShopAccount();
    if (shop && teaShopDialogDate) {
      // Check if there's an existing entry for this date
      const { data: existingEntry } = await (
        supabase.from("tea_shop_entries") as any
      )
        .select("*")
        .eq("tea_shop_id", shop.id)
        .eq("date", teaShopDialogDate)
        .maybeSingle();

      setTeaShopAccount(shop);
      setTeaShopEditingEntry(existingEntry || null);
      setTeaShopDialogOpen(true);
    }
  };

  const handleDelete = useCallback(
    async (record: AttendanceRecord) => {
      // Check if record is paid - prevent deleting paid records
      if (record.is_paid) {
        setPaidRecordDialog({
          open: true,
          record,
          action: "delete",
          date: record.date,
        });
        return;
      }

      if (!confirm("Are you sure you want to delete this attendance record?"))
        return;

      setLoading(true);
      try {
        const { error } = await supabase
          .from("daily_attendance")
          .delete()
          .eq("id", record.id);
        if (error) throw error;
        invalidateAttendance();
      } catch (error: any) {
        alert("Failed to delete: " + error.message);
      } finally {
        setLoading(false);
      }
    },
    [invalidateAttendance, supabase]
  );

  // Cancel payment handler - reset payment status
  const handleCancelPayment = useCallback(
    async (record: AttendanceRecord) => {
      if (!confirm(`Cancel payment for ${record.laborer_name}? This will mark the attendance as unpaid.`))
        return;

      setLoading(true);
      try {
        const { error } = await supabase
          .from("daily_attendance")
          .update({
            is_paid: false,
            payment_notes: null,
          })
          .eq("id", record.id);
        if (error) throw error;
        invalidateAttendance();
      } catch (error: any) {
        alert("Failed to cancel payment: " + error.message);
      } finally {
        setLoading(false);
      }
    },
    [invalidateAttendance, supabase]
  );

  // Cancel market laborer payment handler
  const handleCancelMarketPayment = useCallback(
    async (record: MarketLaborerRecord) => {
      if (!confirm(`Cancel payment for ${record.tempName}? This will mark all ${record.groupCount} ${record.roleName}(s) as unpaid.`))
        return;

      setLoading(true);
      try {
        const { error } = await supabase
          .from("market_laborer_attendance")
          .update({
            is_paid: false,
            payment_notes: null,
          })
          .eq("id", record.originalDbId);
        if (error) throw error;
        invalidateAttendance();
      } catch (error: any) {
        alert("Failed to cancel payment: " + error.message);
      } finally {
        setLoading(false);
      }
    },
    [invalidateAttendance, supabase]
  );

  // Market laborer edit handlers
  const handleOpenMarketLaborerEdit = (record: MarketLaborerRecord) => {
    setEditingMarketLaborer(record);
    setMarketLaborerEditForm({
      count: record.groupCount,
      day_units: record.dayUnits,
      rate_per_person: record.ratePerPerson,
    });
    setMarketLaborerEditOpen(true);
  };

  const handleSaveMarketLaborerEdit = async () => {
    if (!editingMarketLaborer || !selectedSite) return;

    setLoading(true);
    try {
      const totalCost =
        marketLaborerEditForm.count *
        marketLaborerEditForm.rate_per_person *
        marketLaborerEditForm.day_units;

      // First check if record has any payment/settlement
      const { data: currentRecord } = await supabase
        .from("market_laborer_attendance")
        .select("is_paid, engineer_transaction_id, expense_id")
        .eq("id", editingMarketLaborer.originalDbId)
        .single();

      const hasSettlement =
        currentRecord?.engineer_transaction_id || currentRecord?.expense_id;

      // Update the record
      const { error } = await supabase
        .from("market_laborer_attendance")
        .update({
          count: marketLaborerEditForm.count,
          day_units: marketLaborerEditForm.day_units,
          rate_per_person: marketLaborerEditForm.rate_per_person,
          total_cost: totalCost,
          updated_at: new Date().toISOString(),
          updated_by: userProfile?.name || "Unknown",
          updated_by_user_id: userProfile?.id,
        })
        .eq("id", editingMarketLaborer.originalDbId)
        .select();

      if (error) {
        console.error("Market laborer update error:", error);
        throw error;
      }

      // Reset settlement if record was paid
      if (hasSettlement) {
        const { error: resetError } = await supabase
          .from("market_laborer_attendance")
          .update({
            is_paid: false,
            payment_date: null,
            payment_mode: null,
            paid_via: null,
            engineer_transaction_id: null,
            payment_proof_url: null,
            payer_source: null,
            payer_name: null,
            expense_id: null,
          })
          .eq("id", editingMarketLaborer.originalDbId);

        if (resetError) {
          console.error("Reset market payment error:", resetError);
        }

        // Reset engineer transaction if exists
        if (currentRecord?.engineer_transaction_id) {
          const { error: txError } = await supabase
            .from("site_engineer_transactions")
            .update({
              settlement_status: "pending_settlement",
            })
            .eq("id", currentRecord.engineer_transaction_id);

          if (txError) {
            console.error("Reset market transaction error:", txError);
          }
        }

        // Handle expense record if exists (direct payment)
        if (currentRecord?.expense_id) {
          const { error: expenseError } = await supabase
            .from("expenses")
            .update({
              notes: "Market attendance modified - requires re-settlement",
              updated_at: new Date().toISOString(),
            })
            .eq("id", currentRecord.expense_id);

          if (expenseError) {
            console.error("Update market expense error:", expenseError);
          }
        }
      }

      setMarketLaborerEditOpen(false);
      setEditingMarketLaborer(null);
      invalidateAttendance();
    } catch (error: any) {
      console.error("Market laborer edit failed:", error);
      alert("Failed to update: " + (error.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMarketLaborer = async (record: MarketLaborerRecord) => {
    const confirmMsg =
      record.groupCount > 1
        ? `This will delete all ${record.groupCount} ${record.roleName}(s) for this date. Continue?`
        : `Are you sure you want to delete this ${record.roleName}?`;

    if (!confirm(confirmMsg)) return;

    setLoading(true);
    try {
      const { error } = await (
        supabase.from("market_laborer_attendance") as any
      )
        .delete()
        .eq("id", record.originalDbId);

      if (error) throw error;
      invalidateAttendance();
    } catch (error: any) {
      alert("Failed to delete: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Open delete confirmation dialog
  const handleDeleteDateAttendance = (date: string) => {
    const summary = dateSummaries.find((s) => s.date === date);
    if (!summary || !selectedSite) return;

    // Check if any records for this date are paid
    const paidDailyRecords = summary.records.filter((r) => r.is_paid);
    const paidMarketRecords = summary.marketLaborers.filter((r) => r.isPaid);
    const totalPaidCount = paidDailyRecords.length + paidMarketRecords.length;

    // If there are paid records, show redirect dialog instead
    if (totalPaidCount > 0) {
      setPaidRecordDialog({
        open: true,
        record: null,
        action: "delete",
        date: date,
        isBulk: true,
        paidCount: totalPaidCount,
      });
      return;
    }

    setDeleteDialogData({
      date,
      siteName: selectedSite.name,
      dailyCount: summary.dailyLaborerCount + summary.contractLaborerCount,
      marketCount: summary.marketLaborerCount,
      totalAmount: summary.totalSalary + (summary.teaShop?.total || 0),
    });
    setDeleteDialogOpen(true);
  };

  // Perform the actual delete
  const confirmDeleteDateAttendance = async () => {
    if (!deleteDialogData || !selectedSite) return;

    const { date } = deleteDialogData;
    setDeleteDialogOpen(false);
    setLoading(true);

    try {
      // Delete daily attendance records
      const { error: dailyError } = await supabase
        .from("daily_attendance")
        .delete()
        .eq("site_id", selectedSite.id)
        .eq("date", date);
      if (dailyError) throw dailyError;

      // Delete market laborer attendance
      const { error: marketError } = await (
        supabase.from("market_laborer_attendance") as any
      )
        .delete()
        .eq("site_id", selectedSite.id)
        .eq("date", date);
      if (marketError) throw marketError;

      // Delete tea shop entries for this date
      const { error: teaError } = await (
        supabase.from("tea_shop_entries") as any
      )
        .delete()
        .eq("site_id", selectedSite.id)
        .eq("date", date);
      if (teaError) throw teaError;

      // Delete daily work summary
      const { error: summaryError } = await supabase
        .from("daily_work_summary")
        .delete()
        .eq("site_id", selectedSite.id)
        .eq("date", date);
      if (summaryError) throw summaryError;

      invalidateAttendance();
    } catch (error: any) {
      alert("Failed to delete: " + error.message);
    } finally {
      setLoading(false);
      setDeleteDialogData(null);
    }
  };

  const formatTime = (time: string | null | undefined) => {
    if (!time) return "-";
    return time.substring(0, 5); // HH:MM
  };

  // Helper function for progress color
  const getProgressColor = (percent: number): "success" | "warning" | "error" => {
    if (percent >= 80) return "success";
    if (percent >= 50) return "warning";
    return "error";
  };

  // Summary photo click handlers
  const handleMorningSummaryPhotoClick = (index: number) => {
    const summaryEntry = combinedDateEntries.find(
      (e) => e.type === "attendance" && e.date === viewSummaryDate
    );
    if (summaryEntry?.type === "attendance" && summaryEntry.summary.workUpdates?.morning?.photos) {
      setSummaryFullscreenPhotos(summaryEntry.summary.workUpdates.morning.photos);
      setSummaryPhotoIndex(index);
      setSummaryPhotoPeriod('morning');
      setSummaryPhotoFullscreen(true);
    }
  };

  const handleEveningSummaryPhotoClick = (index: number) => {
    const summaryEntry = combinedDateEntries.find(
      (e) => e.type === "attendance" && e.date === viewSummaryDate
    );
    if (summaryEntry?.type === "attendance" && summaryEntry.summary.workUpdates?.evening?.photos) {
      setSummaryFullscreenPhotos(summaryEntry.summary.workUpdates.evening.photos);
      setSummaryPhotoIndex(index);
      setSummaryPhotoPeriod('evening');
      setSummaryPhotoFullscreen(true);
    }
  };

  const detailedColumns = useMemo<MRT_ColumnDef<AttendanceRecord>[]>(
    () => [
      {
        accessorKey: "date",
        header: "Date",
        size: 110,
        Cell: ({ cell }) => dayjs(cell.getValue<string>()).format("DD MMM"),
      },
      { accessorKey: "laborer_name", header: "Name", size: 150 },
      {
        accessorKey: "laborer_type",
        header: "Type",
        size: 80,
        Cell: ({ cell }) => (
          <Chip
            label={cell.getValue<string>() === "contract" ? "C" : "D"}
            size="small"
            color={cell.getValue<string>() === "contract" ? "info" : "warning"}
            variant="outlined"
          />
        ),
      },
      { accessorKey: "category_name", header: "Category", size: 100 },
      {
        accessorKey: "in_time",
        header: "In",
        size: 70,
        Cell: ({ cell }) => formatTime(cell.getValue<string>()),
      },
      {
        accessorKey: "out_time",
        header: "Out",
        size: 70,
        Cell: ({ cell, row }) => {
          // Hide out time for morning entries and drafts (not yet confirmed)
          if (row.original.attendance_status === "morning_entry" ||
              row.original.attendance_status === "draft") {
            return "-";
          }
          return formatTime(cell.getValue<string>());
        },
      },
      {
        accessorKey: "work_hours",
        header: "Work Hrs",
        size: 80,
        Cell: ({ cell }) => {
          const hours = cell.getValue<number>();
          return hours ? `${hours}h` : "-";
        },
      },
      {
        accessorKey: "day_units",
        header: "W/D Units",
        size: 90,
        Cell: ({ cell }) => {
          const units = cell.getValue<number>() || cell.row.original.work_days;
          return (
            <Chip
              label={units}
              size="small"
              color="primary"
              variant="outlined"
            />
          );
        },
      },
      {
        accessorKey: "daily_earnings",
        header: "Salary",
        size: 100,
        Cell: ({ cell }) => (
          <Typography variant="body2" fontWeight={600} color="success.main">
            ₹{cell.getValue<number>().toLocaleString()}
          </Typography>
        ),
      },
      {
        accessorKey: "snacks_amount",
        header: "Snacks",
        size: 80,
        Cell: ({ cell }) => {
          const amount = cell.getValue<number>() || 0;
          return amount > 0 ? `₹${amount}` : "-";
        },
      },
      {
        accessorKey: "is_paid",
        header: "Payment",
        size: 100,
        Cell: ({ cell, row }) => {
          const isPaid = cell.getValue<boolean>();
          const isContract = row.original.laborer_type === "contract";
          if (isContract) {
            return (
              <Chip
                label="In Contract"
                size="small"
                color="info"
                variant="outlined"
              />
            );
          }
          if (isPaid) {
            return (
              <Chip
                label="PAID"
                size="small"
                color="success"
                variant="filled"
              />
            );
          }
          return (
            <Chip
              label="PENDING"
              size="small"
              color="warning"
              variant="outlined"
              onClick={() => canEdit && handleOpenPaymentDialog(row.original)}
              sx={{ cursor: canEdit ? "pointer" : "default" }}
            />
          );
        },
      },
      {
        id: "actions",
        header: "Actions",
        size: 120,
        Cell: ({ row }) => (
          <Box sx={{ display: "flex", gap: 0.5 }}>
            {row.original.laborer_type !== "contract" &&
              !row.original.is_paid &&
              canEdit && (
                <Button
                  size="small"
                  variant="outlined"
                  color="success"
                  onClick={() => handleOpenPaymentDialog(row.original)}
                  sx={{ minWidth: 50, px: 1, fontSize: 11 }}
                >
                  Pay
                </Button>
              )}
            <IconButton
              size="small"
              onClick={() => handleOpenEditDialog(row.original)}
              disabled={!canEdit}
            >
              {row.original.is_paid ? (
                <Tooltip title="Paid - Cancel payment first to edit">
                  <LockIcon fontSize="small" color="disabled" />
                </Tooltip>
              ) : (
                <Edit fontSize="small" />
              )}
            </IconButton>
            <IconButton
              size="small"
              color={row.original.is_paid ? "default" : "error"}
              onClick={() => handleDelete(row.original)}
              disabled={!canEdit}
            >
              {row.original.is_paid ? (
                <Tooltip title="Paid - Cancel payment first to delete">
                  <LockIcon fontSize="small" color="disabled" />
                </Tooltip>
              ) : (
                <Delete fontSize="small" />
              )}
            </IconButton>
          </Box>
        ),
      },
    ],
    [
      canEdit,
      formatTime,
      handleDelete,
      handleOpenEditDialog,
      handleOpenPaymentDialog,
    ]
  );

  // Trust server data when available - skip waiting for contexts
  const hasServerData = initialData !== null;

  // Only show skeleton when we have NO data AND contexts are initializing
  if (!hasServerData && (siteLoading || authLoading)) {
    return <AttendanceSkeleton />;
  }

  if (!selectedSite && !hasServerData) {
    return (
      <Box>
        <PageHeader title="Attendance" />
        <Alert severity="warning">
          Please select a site to view attendance
        </Alert>
      </Box>
    );
  }

  return (
    <Box
      ref={tableContainerRef}
      sx={{
        width: "100%",
        overflowX: "hidden",
        display: "flex",
        flexDirection: "column",
        height: isFullscreen
          ? "100vh"
          : {
              // Subtract MainLayout app bar (xs 56 / sm 64) + main padding (xs 1.5*8*2=24 / sm 2*8*2=32 / md 3*8*2=48)
              xs: "calc(100vh - 80px)",
              sm: "calc(100vh - 96px)",
              md: "calc(100vh - 112px)",
            },
        minHeight: 0,
        ...(isFullscreen && {
          bgcolor: "background.paper",
        }),
      }}
    >
      {/* Portal target for the global DateRangePicker popover while fullscreened.
          Lives inside the fullscreened DOM subtree so the popover remains
          visible — see setPickerContainer effect above. Empty div, zero size. */}
      <div ref={pickerPortalRef} id="attendance-picker-portal" />

      {/* ===== HEADER ROW 1: Title + Days Count + View Toggle + Refresh ===== */}
      <Box sx={{ flexShrink: 0 }}>
        <PageHeader
          title="Attendance"
          subtitle={isMobile ? undefined : selectedSite?.name}
          titleChip={<ScopeChip />}
          actions={
            <Tooltip
              title={
                isFullscreen ? "Exit fullscreen (Esc)" : "Enter fullscreen"
              }
            >
              <IconButton
                onClick={isFullscreen ? exitFullscreen : enterFullscreen}
                size="small"
                aria-label={
                  isFullscreen ? "Exit fullscreen" : "Enter fullscreen"
                }
              >
                {isFullscreen ? <FullscreenExit /> : <Fullscreen />}
              </IconButton>
            </Tooltip>
          }
        />
      </Box>

      {/* Back button when coming from settlement page */}
      {cameFromSettlement && (
        <Box sx={{ px: { xs: 1, sm: 0 }, mb: 1, flexShrink: 0 }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<ArrowBackIcon />}
            onClick={() => {
              setCameFromSettlement(false);
              router.push("/site/payments?tab=salary");
            }}
          >
            Back to Settlement
          </Button>
        </Box>
      )}

      {/* ===== HEADER ROW 2: Date Picker + Show Last Quick Filters (Same Row) ===== */}
      {/* Period Summary Bar - Collapsible on Mobile */}
      <Paper
        sx={{
          overflow: "hidden",
          mb: { xs: 1, sm: 2 },
          flexShrink: 0,
        }}
      >
        <Box sx={{ p: { xs: 0.75, sm: 2 } }}>
          {/* Mobile: Collapsible Summary */}
          <Box sx={{ display: { xs: "block", sm: "none" } }}>
          {/* Collapsed Header - Always visible on mobile */}
          <Box
            onClick={() => setSummaryExpanded(!summaryExpanded)}
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
              py: 0.5,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontSize: "0.65rem" }}
              >
                Total
              </Typography>
              <Typography
                sx={{
                  fontSize: "1.1rem",
                  fontWeight: 700,
                  color: "primary.main",
                }}
              >
                ₹{periodTotals.totalExpense.toLocaleString()}
              </Typography>
              <Chip
                label={`Paid: ₹${periodTotals.totalPaidAmount.toLocaleString()}`}
                size="small"
                color="success"
                sx={{ height: 18, fontSize: "0.55rem" }}
              />
              <Chip
                label={`Pending: ₹${periodTotals.totalPendingAmount.toLocaleString()}`}
                size="small"
                color="warning"
                sx={{ height: 18, fontSize: "0.55rem" }}
              />
            </Box>
            <IconButton size="small" sx={{ p: 0.25 }}>
              {summaryExpanded ? (
                <ExpandLess fontSize="small" />
              ) : (
                <ExpandMore fontSize="small" />
              )}
            </IconButton>
          </Box>
          {/* Expanded Content */}
          <Collapse in={summaryExpanded}>
            <Box sx={{ pt: 1, borderTop: "1px solid", borderColor: "divider" }}>
              {/* Row 1: Salary, Tea Shop */}
              <Box sx={{ display: "flex", alignItems: "stretch", mb: 1 }}>
                <Box sx={{ flex: 1, textAlign: "center" }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontSize: "0.6rem" }}
                  >
                    Salary
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: "success.main",
                    }}
                  >
                    ₹{periodTotals.totalSalary.toLocaleString()}
                  </Typography>
                </Box>
                <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
                <Box sx={{ flex: 1, textAlign: "center" }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontSize: "0.6rem" }}
                  >
                    Tea Shop
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: "secondary.main",
                    }}
                  >
                    ₹{periodTotals.totalTeaShop.toLocaleString()}
                  </Typography>
                </Box>
              </Box>
              <Divider sx={{ my: 0.5 }} />
              {/* Row 2: Daily, Contract, Market */}
              <Box sx={{ display: "flex", alignItems: "stretch", mb: 1 }}>
                <Box sx={{ flex: 1, textAlign: "center" }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontSize: "0.6rem" }}
                  >
                    Daily
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: "warning.main",
                    }}
                  >
                    ₹{periodTotals.totalDailyAmount.toLocaleString()}
                  </Typography>
                </Box>
                <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
                <Box sx={{ flex: 1, textAlign: "center" }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontSize: "0.6rem" }}
                  >
                    Contract
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: "info.main",
                    }}
                  >
                    ₹{periodTotals.totalContractAmount.toLocaleString()}
                  </Typography>
                </Box>
                <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
                <Box sx={{ flex: 1, textAlign: "center" }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontSize: "0.6rem" }}
                  >
                    Market
                  </Typography>
                  <Typography
                    sx={{
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: "secondary.main",
                    }}
                  >
                    ₹{periodTotals.totalMarketAmount.toLocaleString()}
                  </Typography>
                </Box>
              </Box>
              <Divider sx={{ my: 0.5 }} />
              {/* Row 3: Avg/Day */}
              <Box sx={{ display: "flex", alignItems: "stretch" }}>
                <Box sx={{ flex: 1, textAlign: "center" }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontSize: "0.6rem" }}
                  >
                    Avg/Day
                  </Typography>
                  <Typography sx={{ fontSize: "0.8rem", fontWeight: 600 }}>
                    ₹
                    {periodTotals.avgPerDay.toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })}
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Collapse>
        </Box>

        {/* Desktop: Always expanded with vertical separators */}
        <Box
          sx={{
            display: { xs: "none", sm: "flex" },
            alignItems: "stretch",
            gap: 2,
          }}
        >
          {/* Group 1: Period Total, Salary, Tea Shop */}
          <Box sx={{ display: "flex", flex: 1, gap: 2 }}>
            <Box sx={{ flex: 1, textAlign: "center" }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontSize: "0.75rem" }}
              >
                Period Total
              </Typography>
              <Typography
                sx={{
                  fontSize: "1.25rem",
                  fontWeight: 700,
                  color: "primary.main",
                }}
              >
                ₹{periodTotals.totalExpense.toLocaleString()}
              </Typography>
            </Box>
            <Box sx={{ flex: 1, textAlign: "center" }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontSize: "0.75rem" }}
              >
                Salary
              </Typography>
              <Typography
                sx={{
                  fontSize: "1.125rem",
                  fontWeight: 600,
                  color: "success.main",
                }}
              >
                ₹{periodTotals.totalSalary.toLocaleString()}
              </Typography>
            </Box>
            <Box sx={{ flex: 1, textAlign: "center" }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontSize: "0.75rem" }}
              >
                Tea Shop
              </Typography>
              <Typography
                sx={{
                  fontSize: "1.125rem",
                  fontWeight: 600,
                  color: "secondary.main",
                }}
              >
                ₹{periodTotals.totalTeaShop.toLocaleString()}
              </Typography>
            </Box>
          </Box>

          <Divider orientation="vertical" flexItem />

          {/* Group 2: Daily, Contract, Market */}
          <Box sx={{ display: "flex", flex: 1, gap: 2 }}>
            <Box sx={{ flex: 1, textAlign: "center" }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontSize: "0.75rem" }}
              >
                Daily
              </Typography>
              <Typography
                sx={{
                  fontSize: "1.125rem",
                  fontWeight: 600,
                  color: "warning.main",
                }}
              >
                ₹{periodTotals.totalDailyAmount.toLocaleString()}
              </Typography>
            </Box>
            <Box sx={{ flex: 1, textAlign: "center" }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontSize: "0.75rem" }}
              >
                Contract
              </Typography>
              <Typography
                sx={{
                  fontSize: "1.125rem",
                  fontWeight: 600,
                  color: "info.main",
                }}
              >
                ₹{periodTotals.totalContractAmount.toLocaleString()}
              </Typography>
            </Box>
            <Box sx={{ flex: 1, textAlign: "center" }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontSize: "0.75rem" }}
              >
                Market
              </Typography>
              <Typography
                sx={{
                  fontSize: "1.125rem",
                  fontWeight: 600,
                  color: "secondary.main",
                }}
              >
                ₹{periodTotals.totalMarketAmount.toLocaleString()}
              </Typography>
            </Box>
          </Box>

          <Divider orientation="vertical" flexItem />

          {/* Group 3: Paid, Pending, Avg/Day */}
          <Box sx={{ display: "flex", flex: 1, gap: 2 }}>
            <Box sx={{ flex: 1, textAlign: "center" }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontSize: "0.75rem" }}
              >
                Paid
              </Typography>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 0.5,
                }}
              >
                <Typography
                  sx={{
                    fontSize: "1.125rem",
                    fontWeight: 600,
                    color: "success.main",
                  }}
                >
                  ₹{periodTotals.totalPaidAmount.toLocaleString()}
                </Typography>
                <Chip
                  label={periodTotals.totalPaidCount}
                  size="small"
                  color="success"
                  variant="outlined"
                  sx={{
                    height: 24,
                    "& .MuiChip-label": { px: 0.5, fontSize: "0.75rem" },
                  }}
                />
              </Box>
            </Box>
            <Box sx={{ flex: 1, textAlign: "center" }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontSize: "0.75rem" }}
              >
                Pending
              </Typography>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 0.5,
                }}
              >
                <Typography
                  sx={{
                    fontSize: "1.125rem",
                    fontWeight: 600,
                    color: "warning.main",
                  }}
                >
                  ₹{periodTotals.totalPendingAmount.toLocaleString()}
                </Typography>
                <Chip
                  label={periodTotals.totalPendingCount}
                  size="small"
                  color="warning"
                  variant="outlined"
                  sx={{
                    height: 24,
                    "& .MuiChip-label": { px: 0.5, fontSize: "0.75rem" },
                  }}
                />
              </Box>
            </Box>
            <Box sx={{ flex: 1, textAlign: "center" }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontSize: "0.75rem" }}
              >
                Avg/Day
              </Typography>
              <Typography sx={{ fontSize: "1.125rem", fontWeight: 600 }}>
                ₹
                {periodTotals.avgPerDay.toLocaleString(undefined, {
                  maximumFractionDigits: 0,
                })}
              </Typography>
            </Box>
          </Box>
        </Box>
        </Box>
      </Paper>

      {/* Data Display */}
      {loading ? (
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            p: 4,
            flex: 1,
            minHeight: 0,
          }}
        >
          <CircularProgress />
        </Box>
      ) : viewMode === "date-wise" ? (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minHeight: 0,
            width: "100%",
          }}
        >
          <Paper
            sx={{
              borderRadius: isFullscreen ? 0 : 2,
              overflow: "hidden",
              position: "relative",
              width: "100%",
              display: "flex",
              flexDirection: "column",
              flex: 1,
              minHeight: 0,
            }}
          >
            <TableContainer
              sx={{
                flex: 1,
                minHeight: 0,
                overflowX: "auto",
                overflowY: "auto",
                WebkitOverflowScrolling: "touch",
                width: "100%",
                // Make scrollbar visible on mobile
                "&::-webkit-scrollbar": {
                  height: 8,
                  width: 8,
                  display: "block",
                },
                "&::-webkit-scrollbar-track": {
                  bgcolor: "action.selected",
                },
                "&::-webkit-scrollbar-thumb": {
                  bgcolor: "grey.400",
                  borderRadius: 4,
                },
              }}
            >
              <Table
                stickyHeader
                size="small"
                sx={{ minWidth: { xs: 600, sm: 800 } }}
              >
                <TableHead>
                  <TableRow sx={{ bgcolor: "primary.dark" }}>
                    {/* Sticky expand column */}
                    <TableCell
                      sx={{
                        width: 40,
                        minWidth: 40,
                        bgcolor: "primary.dark",
                        color: "primary.contrastText",
                        fontWeight: 700,
                        position: "sticky",
                        left: 0,
                        zIndex: 3,
                      }}
                    ></TableCell>
                    {/* Sticky date column with holiday toggle */}
                    <TableCell
                      sx={{
                        bgcolor: "primary.dark",
                        color: "primary.contrastText",
                        fontWeight: 700,
                        position: "sticky",
                        left: 40,
                        zIndex: 3,
                        minWidth: { xs: 80, sm: 120 },
                        "&::after": {
                          content: '""',
                          position: "absolute",
                          right: 0,
                          top: 0,
                          bottom: 0,
                          width: 4,
                          background:
                            "linear-gradient(to right, rgba(0,0,0,0.15), transparent)",
                        },
                      }}
                    >
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                        Date
                        <Tooltip title={showHolidays ? "Hide holidays" : "Show holidays"}>
                          <Chip
                            icon={
                              showHolidays ? (
                                <BeachAccessIcon sx={{ fontSize: "12px !important" }} />
                              ) : (
                                <VisibilityOffIcon sx={{ fontSize: "12px !important" }} />
                              )
                            }
                            label={
                              <Box sx={{ display: { xs: "none", sm: "inline" } }}>
                                {showHolidays ? "On" : "Off"}
                              </Box>
                            }
                            size="small"
                            color={showHolidays ? "warning" : "default"}
                            variant={showHolidays ? "filled" : "outlined"}
                            onClick={() => setShowHolidays(!showHolidays)}
                            sx={{
                              cursor: "pointer",
                              fontSize: "0.65rem",
                              height: 18,
                              minWidth: { xs: 24, sm: 50 },
                              opacity: showHolidays ? 1 : 0.6,
                              transition: "all 0.2s",
                              "& .MuiChip-icon": {
                                fontSize: "12px !important",
                                ml: 0.5,
                                mr: { xs: 0, sm: -0.5 },
                              },
                              "& .MuiChip-label": {
                                px: { xs: 0, sm: 0.5 },
                              },
                              "&:hover": {
                                opacity: 1,
                                transform: "scale(1.05)",
                              },
                            }}
                          />
                        </Tooltip>
                      </Box>
                    </TableCell>
                    <TableCell
                      sx={{
                        bgcolor: "primary.dark",
                        color: "primary.contrastText",
                        fontWeight: 700,
                        minWidth: { xs: 30, sm: 50 },
                        px: { xs: 0.5, sm: 1 },
                      }}
                      align="center"
                    >
                      <Box sx={{ display: { xs: "none", sm: "inline" } }}>
                        Daily
                      </Box>
                      <Box sx={{ display: { xs: "inline", sm: "none" } }}>
                        D
                      </Box>
                    </TableCell>
                    <TableCell
                      sx={{
                        bgcolor: "primary.dark",
                        color: "primary.contrastText",
                        fontWeight: 700,
                        minWidth: { xs: 30, sm: 55 },
                        px: { xs: 0.5, sm: 1 },
                      }}
                      align="center"
                    >
                      <Box sx={{ display: { xs: "none", sm: "inline" } }}>
                        Contract
                      </Box>
                      <Box sx={{ display: { xs: "inline", sm: "none" } }}>
                        C
                      </Box>
                    </TableCell>
                    <TableCell
                      sx={{
                        bgcolor: "primary.dark",
                        color: "primary.contrastText",
                        fontWeight: 700,
                        minWidth: { xs: 30, sm: 50 },
                        px: { xs: 0.5, sm: 1 },
                      }}
                      align="center"
                    >
                      <Box sx={{ display: { xs: "none", sm: "inline" } }}>
                        Market
                      </Box>
                      <Box sx={{ display: { xs: "inline", sm: "none" } }}>
                        M
                      </Box>
                    </TableCell>
                    <TableCell
                      sx={{
                        bgcolor: "primary.dark",
                        color: "primary.contrastText",
                        fontWeight: 700,
                        minWidth: { xs: 30, sm: 45 },
                        px: { xs: 0.5, sm: 1 },
                      }}
                      align="center"
                    >
                      <Box sx={{ display: { xs: "none", sm: "inline" } }}>
                        Total
                      </Box>
                      <Box sx={{ display: { xs: "inline", sm: "none" } }}>
                        T
                      </Box>
                    </TableCell>
                    <TableCell
                      sx={{
                        bgcolor: "primary.dark",
                        color: "primary.contrastText",
                        fontWeight: 700,
                        minWidth: 45,
                        display: { xs: "none", md: "table-cell" },
                      }}
                      align="center"
                    >
                      In
                    </TableCell>
                    <TableCell
                      sx={{
                        bgcolor: "primary.dark",
                        color: "primary.contrastText",
                        fontWeight: 700,
                        minWidth: 45,
                        display: { xs: "none", md: "table-cell" },
                      }}
                      align="center"
                    >
                      Out
                    </TableCell>
                    <TableCell
                      sx={{
                        bgcolor: "primary.dark",
                        color: "primary.contrastText",
                        fontWeight: 700,
                        minWidth: { xs: 55, sm: 70 },
                        px: { xs: 0.5, sm: 1 },
                      }}
                      align="right"
                    >
                      <Box sx={{ display: { xs: "none", sm: "inline" } }}>
                        Salary
                      </Box>
                      <Box sx={{ display: { xs: "inline", sm: "none" } }}>
                        Sal
                      </Box>
                    </TableCell>
                    <TableCell
                      sx={{
                        bgcolor: "primary.dark",
                        color: "primary.contrastText",
                        fontWeight: 700,
                        minWidth: { xs: 50, sm: 80 },
                        px: { xs: 0.5, sm: 1 },
                      }}
                      align="center"
                    >
                      <Box sx={{ display: { xs: "none", sm: "inline" } }}>
                        Tea Shop
                      </Box>
                      <Box sx={{ display: { xs: "inline", sm: "none" } }}>
                        Tea
                      </Box>
                    </TableCell>
                    <TableCell
                      sx={{
                        bgcolor: "primary.dark",
                        color: "primary.contrastText",
                        fontWeight: 700,
                        minWidth: { xs: 55, sm: 70 },
                        px: { xs: 0.5, sm: 1 },
                      }}
                      align="right"
                    >
                      <Box sx={{ display: { xs: "none", sm: "inline" } }}>
                        Expense
                      </Box>
                      <Box sx={{ display: { xs: "inline", sm: "none" } }}>
                        Exp
                      </Box>
                    </TableCell>
                    <TableCell
                      sx={{
                        bgcolor: "primary.dark",
                        color: "primary.contrastText",
                        fontWeight: 700,
                        minWidth: 120,
                        display: { xs: "none", md: "table-cell" },
                      }}
                    >
                      Work
                    </TableCell>
                    <TableCell
                      sx={{
                        bgcolor: "primary.dark",
                        color: "primary.contrastText",
                        fontWeight: 700,
                        minWidth: { xs: 50, sm: 120 },
                        px: { xs: 0.5, sm: 1 },
                      }}
                    >
                      Actions
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {combinedDateEntries.map((entry) => (
                    <React.Fragment key={entry.date}>
                      {/* Grouped holiday row (no attendance data) */}
                      {entry.type === "holiday_group" && (
                        <TableRow
                          sx={{
                            bgcolor: alpha(theme.palette.warning.main, 0.08),
                            "&:hover": { bgcolor: alpha(theme.palette.warning.main, 0.15) },
                          }}
                        >
                          <TableCell
                            colSpan={13}
                            sx={{
                              py: 1.5,
                              borderLeft: 4,
                              borderLeftColor: "warning.main",
                            }}
                          >
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: { xs: 1, sm: 1.5 },
                                flexWrap: "wrap",
                              }}
                            >
                              <BeachAccessIcon
                                sx={{ color: "warning.main", fontSize: { xs: 20, sm: 24 } }}
                              />
                              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
                                <Typography
                                  variant="body2"
                                  fontWeight={600}
                                  sx={{ lineHeight: 1.2 }}
                                >
                                  {formatHolidayDateRange(entry.group)}
                                </Typography>
                                {entry.group.dayCount > 1 && (
                                  <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{ lineHeight: 1, display: { xs: "none", sm: "block" } }}
                                  >
                                    {formatHolidayDayRange(entry.group)}
                                  </Typography>
                                )}
                              </Box>
                              <Chip
                                label={`${entry.group.dayCount} ${entry.group.dayCount === 1 ? "day" : "days"}`}
                                size="small"
                                color="warning"
                                sx={{
                                  fontWeight: 600,
                                  height: 22,
                                  fontSize: "0.7rem",
                                }}
                              />
                              {entry.group.reason && (
                                <Typography
                                  variant="body2"
                                  color="text.secondary"
                                  sx={{
                                    fontStyle: "italic",
                                    ml: { xs: 0, sm: 1 },
                                    flex: { xs: "1 1 100%", sm: "0 1 auto" },
                                    mt: { xs: 0.5, sm: 0 },
                                  }}
                                >
                                  {entry.group.reason}
                                </Typography>
                              )}
                            </Box>
                          </TableCell>
                        </TableRow>
                      )}

                      {/* Unfilled dates group row */}
                      {entry.type === "unfilled_group" && (
                        <>
                          <TableRow
                            onClick={() => {
                              setExpandedUnfilledGroups((prev) => {
                                const next = new Set(prev);
                                if (next.has(entry.group.startDate)) {
                                  next.delete(entry.group.startDate);
                                } else {
                                  next.add(entry.group.startDate);
                                }
                                return next;
                              });
                            }}
                            sx={{
                              bgcolor: alpha(theme.palette.error.main, 0.06),
                              "&:hover": { bgcolor: alpha(theme.palette.error.main, 0.12) },
                              cursor: "pointer",
                            }}
                          >
                            <TableCell
                              colSpan={13}
                              sx={{
                                py: 1.5,
                                borderLeft: 4,
                                borderLeftColor: "error.main",
                              }}
                            >
                              <Box
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: { xs: 1, sm: 1.5 },
                                  flexWrap: "wrap",
                                }}
                              >
                                {expandedUnfilledGroups.has(entry.group.startDate) ? (
                                  <ExpandLess sx={{ color: "error.main", fontSize: { xs: 20, sm: 24 } }} />
                                ) : (
                                  <ExpandMore sx={{ color: "error.main", fontSize: { xs: 20, sm: 24 } }} />
                                )}
                                <WarningAmberIcon
                                  sx={{ color: "error.main", fontSize: { xs: 20, sm: 24 } }}
                                />
                                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
                                  <Typography
                                    variant="body2"
                                    fontWeight={600}
                                    sx={{ lineHeight: 1.2 }}
                                  >
                                    {formatUnfilledDateRange(entry.group)}
                                  </Typography>
                                  {entry.group.dayCount > 1 && (
                                    <Typography
                                      variant="caption"
                                      color="text.secondary"
                                      sx={{ lineHeight: 1, display: { xs: "none", sm: "block" } }}
                                    >
                                      {formatUnfilledDayRange(entry.group)}
                                    </Typography>
                                  )}
                                </Box>
                                <Chip
                                  label={`${entry.group.dayCount} ${entry.group.dayCount === 1 ? "day" : "days"} unfilled`}
                                  size="small"
                                  color="error"
                                  variant="outlined"
                                  sx={{
                                    fontWeight: 600,
                                    height: 22,
                                    fontSize: "0.7rem",
                                  }}
                                />
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  sx={{
                                    ml: "auto",
                                    display: { xs: "none", sm: "block" },
                                  }}
                                >
                                  Click to expand
                                </Typography>
                              </Box>
                            </TableCell>
                          </TableRow>
                          {/* Expanded individual unfilled date rows */}
                          <TableRow>
                            <TableCell colSpan={13} sx={{ p: 0, border: 0 }}>
                              <Collapse in={expandedUnfilledGroups.has(entry.group.startDate)} unmountOnExit>
                                <Table size="small">
                                  <TableBody>
                                    {entry.group.dates.map((date) => (
                                      <TableRow
                                        key={date}
                                        sx={{
                                          bgcolor: alpha(theme.palette.error.main, 0.03),
                                          "&:hover": { bgcolor: alpha(theme.palette.error.main, 0.08) },
                                        }}
                                      >
                                        <TableCell sx={{ pl: 6, width: 150 }}>
                                          <Typography variant="body2">
                                            {dayjs(date).format("DD MMM")}
                                            <Typography
                                              component="span"
                                              variant="caption"
                                              color="text.secondary"
                                              sx={{ ml: 1 }}
                                            >
                                              {dayjs(date).format("ddd")}
                                            </Typography>
                                          </Typography>
                                        </TableCell>
                                        <TableCell>
                                          <Typography variant="body2" color="text.secondary">
                                            No entry recorded
                                          </Typography>
                                        </TableCell>
                                        <TableCell align="right" sx={{ pr: 2 }}>
                                          <Box sx={{ display: "flex", gap: 0.5, justifyContent: "flex-end" }}>
                                            <Tooltip title="Fill Attendance">
                                              <IconButton
                                                size="small"
                                                color="primary"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleFillUnfilledDate(date);
                                                }}
                                              >
                                                <EditCalendarIcon fontSize="small" />
                                              </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Mark as Holiday">
                                              <IconButton
                                                size="small"
                                                color="warning"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleMarkUnfilledAsHoliday(date);
                                                }}
                                              >
                                                <BeachAccessIcon fontSize="small" />
                                              </IconButton>
                                            </Tooltip>
                                          </Box>
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </Collapse>
                            </TableCell>
                          </TableRow>
                        </>
                      )}

                      {/* Weekly separator strip */}
                      {entry.type === "weekly_separator" && (
                        <TableRow
                          sx={{
                            bgcolor: entry.weeklySummary.isCurrentWeek ? "info.50" : "grey.100",
                            borderTop: 2,
                            borderBottom: 2,
                            borderColor: entry.weeklySummary.isCurrentWeek ? "info.main" : "primary.main",
                          }}
                        >
                          <TableCell
                            colSpan={13}
                            sx={{ py: 1.5, px: 2 }}
                          >
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                flexWrap: "wrap",
                                gap: 2,
                              }}
                            >
                              {/* Week Info */}
                              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                                <CalendarMonth sx={{ color: entry.weeklySummary.isCurrentWeek ? "info.main" : "primary.main", fontSize: 24 }} />
                                <Box>
                                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                    <Typography variant="subtitle2" fontWeight={700} color={entry.weeklySummary.isCurrentWeek ? "info.main" : "primary.main"}>
                                      {entry.weeklySummary.isCurrentWeek ? entry.weeklySummary.weekLabel : `Week: ${entry.weeklySummary.weekLabel}`}
                                    </Typography>
                                    {entry.weeklySummary.isCurrentWeek && (
                                      <Chip
                                        size="small"
                                        label="In Progress"
                                        color="info"
                                        sx={{ height: 20, fontSize: "0.65rem" }}
                                      />
                                    )}
                                  </Box>
                                  <Typography variant="caption" color="text.secondary">
                                    {entry.weeklySummary.totalWorkDays} work day{entry.weeklySummary.totalWorkDays !== 1 ? "s" : ""} • {entry.weeklySummary.totalLaborers} laborers worked
                                  </Typography>
                                </Box>
                              </Box>

                              {/* Summary Stats */}
                              <Box
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: { xs: 1, sm: 2 },
                                  flexWrap: "wrap",
                                }}
                              >
                                {entry.weeklySummary.pendingDailySalary > 0 && (
                                  <Chip
                                    size="small"
                                    label={`Daily: ₹${entry.weeklySummary.pendingDailySalary.toLocaleString()}`}
                                    color="info"
                                    variant="outlined"
                                  />
                                )}
                                {entry.weeklySummary.pendingContractSalary > 0 && (
                                  <Chip
                                    size="small"
                                    label={`Contract: ₹${entry.weeklySummary.pendingContractSalary.toLocaleString()}`}
                                    color="secondary"
                                    variant="outlined"
                                  />
                                )}
                                {entry.weeklySummary.pendingMarketSalary > 0 && (
                                  <Chip
                                    size="small"
                                    label={`Market: ₹${entry.weeklySummary.pendingMarketSalary.toLocaleString()}`}
                                    color="warning"
                                    variant="outlined"
                                  />
                                )}
                                {entry.weeklySummary.teaShopExpenses > 0 && (
                                  <Chip
                                    size="small"
                                    label={`Tea: ₹${entry.weeklySummary.teaShopExpenses.toLocaleString()}`}
                                    variant="outlined"
                                  />
                                )}
                              </Box>

                              {/* Weekly Settlement Button - only show for completed weeks */}
                              {canEdit && entry.weeklySummary.totalPending > 0 && !entry.weeklySummary.isCurrentWeek && (
                                <SettleDayButton
                                  label="Settle Week"
                                  pendingAmount={entry.weeklySummary.totalPending}
                                  onClick={() => openWeeklySettlementDialog(entry.weeklySummary)}
                                />
                              )}
                            </Box>
                          </TableCell>
                        </TableRow>
                      )}

                      {/* Attendance row (with optional holiday indicator) */}
                      {entry.type === "attendance" && (
                        <>
                          <TableRow
                            hover
                            data-date={entry.summary.date}
                            onClick={() =>
                              toggleDateExpanded(entry.summary.date)
                            }
                            sx={{
                              cursor: "pointer",
                              "&:hover": { bgcolor: "action.hover" },
                              // Highlight from redirect (for edit/delete action)
                              ...(highlightedDate === entry.summary.date && {
                                bgcolor: alpha(theme.palette.info.main, 0.15),
                                borderLeft: 4,
                                borderLeftColor: "info.main",
                                animation: "pulse 2s ease-in-out 3",
                                "@keyframes pulse": {
                                  "0%, 100%": {
                                    bgcolor: alpha(theme.palette.info.main, 0.15),
                                  },
                                  "50%": {
                                    bgcolor: alpha(theme.palette.info.main, 0.3),
                                  },
                                },
                              }),
                              // Draft entry styling - orange/warning border and background
                              ...(entry.summary.attendanceStatus === "draft" &&
                                highlightedDate !== entry.summary.date && {
                                bgcolor: "warning.50",
                                borderLeft: 4,
                                borderLeftColor: "warning.dark",
                              }),
                              // Highlight if this date is also a holiday
                              ...(entry.holiday &&
                                highlightedDate !== entry.summary.date && {
                                bgcolor: "warning.50",
                                borderLeft: 4,
                                borderLeftColor: "warning.main",
                              }),
                            }}
                          >
                            {/* Sticky expand cell */}
                            <TableCell
                              sx={{
                                position: "sticky",
                                left: 0,
                                bgcolor: highlightedDate === entry.summary.date
                                  ? alpha(theme.palette.info.main, 0.15)
                                  : entry.summary.attendanceStatus === "draft" || entry.holiday
                                  ? "warning.50"
                                  : "background.paper",
                                zIndex: 1,
                              }}
                            >
                              <IconButton size="small">
                                {entry.summary.isExpanded ? (
                                  <ExpandLess />
                                ) : (
                                  <ExpandMore />
                                )}
                              </IconButton>
                            </TableCell>
                            {/* Sticky date cell */}
                            <TableCell
                              sx={{
                                position: "sticky",
                                left: 40,
                                bgcolor: highlightedDate === entry.summary.date
                                  ? alpha(theme.palette.info.main, 0.15)
                                  : entry.summary.attendanceStatus === "draft" || entry.holiday
                                  ? "warning.50"
                                  : "background.paper",
                                zIndex: 1,
                                "&::after": {
                                  content: '""',
                                  position: "absolute",
                                  right: 0,
                                  top: 0,
                                  bottom: 0,
                                  width: 4,
                                  background:
                                    "linear-gradient(to right, rgba(0,0,0,0.08), transparent)",
                                },
                              }}
                            >
                              <Box
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 0.5,
                                }}
                              >
                                {entry.summary.attendanceStatus === "draft" && (
                                  <Tooltip title="Draft - not yet confirmed">
                                    <EventNote
                                      sx={{
                                        color: "warning.dark",
                                        fontSize: 16,
                                      }}
                                    />
                                  </Tooltip>
                                )}
                                {entry.holiday && (
                                  <Tooltip
                                    title={`Holiday: ${
                                      entry.holiday.reason || "No reason"
                                    }`}
                                  >
                                    <BeachAccessIcon
                                      sx={{
                                        color: "warning.main",
                                        fontSize: 16,
                                      }}
                                    />
                                  </Tooltip>
                                )}
                                <Box>
                                  <Typography
                                    variant="body2"
                                    fontWeight={600}
                                    sx={{
                                      fontSize: {
                                        xs: "0.75rem",
                                        sm: "0.875rem",
                                      },
                                    }}
                                  >
                                    {dayjs(entry.summary.date).format("DD MMM")}
                                  </Typography>
                                  <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{
                                      fontSize: {
                                        xs: "0.65rem",
                                        sm: "0.75rem",
                                      },
                                    }}
                                  >
                                    {dayjs(entry.summary.date).format("ddd")}
                                  </Typography>
                                </Box>
                                {/* Settlement ref chip — shown for fully-settled days. */}
                                {(() => {
                                  const summary = entry.summary;
                                  const isFullySettled =
                                    summary.pendingCount === 0 && summary.paidCount > 0;
                                  if (!isFullySettled || !selectedSite) return null;
                                  // Derive a display ref from the first paid record's engineer
                                  // transaction id. The real settlement_reference lives in
                                  // settlement_groups; the pane fetches the canonical ref via
                                  // useSettlementAudit when opened. This chip is the surface.
                                  const firstPaid = summary.records.find((r) => r.is_paid);
                                  const refSeed =
                                    firstPaid?.engineer_transaction_id ||
                                    firstPaid?.expense_id ||
                                    null;
                                  if (!refSeed) return null;
                                  const shortRef = `SS-${refSeed.slice(-6).toUpperCase()}`;
                                  return (
                                    <SettlementRefChip
                                      settlementRef={shortRef}
                                      onClick={() =>
                                        pane.open({
                                          kind: "daily-date",
                                          siteId: selectedSite.id,
                                          date: summary.date,
                                          settlementRef: shortRef,
                                        })
                                      }
                                    />
                                  );
                                })()}
                              </Box>
                            </TableCell>
                            <TableCell align="center">
                              <Chip
                                label={entry.summary.dailyLaborerCount}
                                size="small"
                                color="warning"
                                variant="outlined"
                              />
                            </TableCell>
                            <TableCell align="center">
                              <Chip
                                label={entry.summary.contractLaborerCount}
                                size="small"
                                color="info"
                                variant="outlined"
                              />
                            </TableCell>
                            <TableCell align="center">
                              <Chip
                                label={entry.summary.marketLaborerCount}
                                size="small"
                                color="secondary"
                                variant="outlined"
                              />
                            </TableCell>
                            <TableCell align="center">
                              <Typography variant="body2" fontWeight={700}>
                                {entry.summary.totalLaborerCount}
                              </Typography>
                            </TableCell>
                            <TableCell
                              align="center"
                              sx={{ display: { xs: "none", md: "table-cell" } }}
                            >
                              <Typography variant="caption">
                                {formatTime(entry.summary.firstInTime)}
                              </Typography>
                            </TableCell>
                            <TableCell
                              align="center"
                              sx={{ display: { xs: "none", md: "table-cell" } }}
                            >
                              <Typography variant="caption">
                                {entry.summary.attendanceStatus === "morning_entry" ||
                                entry.summary.attendanceStatus === "draft"
                                  ? "-"
                                  : formatTime(entry.summary.lastOutTime)}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Typography
                                variant="body2"
                                fontWeight={600}
                                color="success.main"
                              >
                                ₹{entry.summary.totalSalary.toLocaleString()}
                              </Typography>
                            </TableCell>
                            <TableCell
                              align="center"
                              sx={{ px: { xs: 0.25, sm: 1 } }}
                            >
                              {entry.summary.teaShop ? (
                                <Chip
                                  icon={
                                    entry.summary.teaShop.isGroupEntry ? (
                                      <GroupsIcon sx={{ fontSize: { xs: 14, sm: 20 } }} />
                                    ) : (
                                      <TeaIcon sx={{ fontSize: { xs: 14, sm: 20 } }} />
                                    )
                                  }
                                  label={`₹${entry.summary.teaShop.total.toLocaleString()}`}
                                  size="small"
                                  color={entry.summary.teaShop.isGroupEntry ? "primary" : "secondary"}
                                  variant="outlined"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setTeaShopPopoverAnchor(e.currentTarget);
                                    setTeaShopPopoverData({
                                      date: entry.summary.date,
                                      data: entry.summary.teaShop!,
                                    });
                                    // Fetch all site allocations for group entries
                                    if (entry.summary.teaShop?.isGroupEntry && entry.summary.teaShop?.entryId) {
                                      fetchGroupEntryAllocations(entry.summary.teaShop.entryId);
                                    } else {
                                      setPopoverGroupAllocations(null);
                                    }
                                  }}
                                  sx={{
                                    cursor: "pointer",
                                    height: { xs: 24, sm: 32 },
                                    "& .MuiChip-label": {
                                      px: { xs: 0.5, sm: 1 },
                                      fontSize: { xs: "0.65rem", sm: "0.8125rem" },
                                    },
                                    "& .MuiChip-icon": {
                                      ml: { xs: 0.25, sm: 0.5 },
                                    },
                                  }}
                                />
                              ) : (
                                <Chip
                                  icon={<TeaIcon sx={{ fontSize: { xs: 14, sm: 20 } }} />}
                                  label="Add"
                                  size="small"
                                  variant="outlined"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenTeaShopDialog(entry.summary.date);
                                  }}
                                  sx={{
                                    cursor: "pointer",
                                    opacity: 0.6,
                                    height: { xs: 24, sm: 32 },
                                    "& .MuiChip-label": {
                                      px: { xs: 0.5, sm: 1 },
                                      fontSize: { xs: "0.65rem", sm: "0.8125rem" },
                                    },
                                    "& .MuiChip-icon": {
                                      ml: { xs: 0.25, sm: 0.5 },
                                    },
                                  }}
                                />
                              )}
                            </TableCell>
                            <TableCell align="right">
                              <Typography
                                variant="body2"
                                fontWeight={700}
                                color="primary.main"
                              >
                                ₹
                                {(
                                  entry.summary.totalExpense +
                                  (entry.summary.teaShop?.total || 0)
                                ).toLocaleString()}
                              </Typography>
                            </TableCell>
                            <TableCell
                              sx={{ display: { xs: "none", md: "table-cell" } }}
                            >
                              <Box
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 1,
                                }}
                              >
                                <Tooltip
                                  title={
                                    entry.summary.workDescription ||
                                    entry.summary.workUpdates?.morning
                                      ?.description ||
                                    "No description"
                                  }
                                >
                                  <Typography
                                    variant="caption"
                                    noWrap
                                    sx={{ maxWidth: 100, display: "block" }}
                                  >
                                    {entry.summary.workDescription ||
                                      entry.summary.workUpdates?.morning
                                        ?.description ||
                                      "-"}
                                  </Typography>
                                </Tooltip>
                                {entry.summary.workUpdates && (
                                  <PhotoBadge
                                    photoCount={
                                      (entry.summary.workUpdates.morning?.photos
                                        ?.length || 0) +
                                      (entry.summary.workUpdates.evening?.photos
                                        ?.length || 0)
                                    }
                                    completionPercent={
                                      entry.summary.workUpdates.evening
                                        ?.completionPercent
                                    }
                                    onClick={() => {
                                      setSelectedWorkUpdate({
                                        workUpdates: entry.summary.workUpdates,
                                        date: entry.summary.date,
                                      });
                                      setWorkUpdateViewerOpen(true);
                                    }}
                                  />
                                )}
                              </Box>
                            </TableCell>
                            <TableCell sx={{ px: { xs: 0.5, sm: 1 } }}>
                              <Box
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 0.5,
                                  flexWrap: "wrap",
                                }}
                              >
                                {/* Status Chip */}
                                {entry.summary.attendanceStatus === "draft" ? (
                                  <Chip
                                    label="📝 Draft"
                                    size="small"
                                    color="warning"
                                    variant="filled"
                                  />
                                ) : entry.summary.attendanceStatus === "morning_entry" ? (
                                  <Chip
                                    label="🌅 Morning"
                                    size="small"
                                    color="warning"
                                    variant="outlined"
                                  />
                                ) : (
                                  <Chip
                                    label="✓"
                                    size="small"
                                    color="success"
                                    variant="outlined"
                                    sx={{ display: { xs: "none", sm: "flex" } }}
                                  />
                                )}

                                {/* Confirm button for draft/morning */}
                                {(entry.summary.attendanceStatus === "draft" ||
                                  entry.summary.attendanceStatus === "morning_entry") && (
                                  <Tooltip title="Confirm attendance">
                                    <Chip
                                      label="Confirm"
                                      size="small"
                                      color={entry.summary.attendanceStatus === "draft" ? "success" : "info"}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenDrawerForDate(
                                          entry.summary.date,
                                          entry.summary.attendanceStatus === "draft" ? "full" : "evening"
                                        );
                                      }}
                                      sx={{
                                        cursor: canEdit ? "pointer" : "default",
                                      }}
                                      disabled={!canEdit}
                                    />
                                  </Tooltip>
                                )}

                                {/* Action Icons */}
                                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, ml: "auto" }}>
                                  {/* Primary Settle CTA — only show if pending laborers */}
                                  {canEdit && entry.summary.pendingCount > 0 && (
                                    <SettleDayButton
                                      pendingAmount={entry.summary.pendingAmount}
                                      onClick={() => openDailySettlementDialog(entry.summary)}
                                    />
                                  )}

                                  {/* Edit */}
                                  {canEdit && (
                                    <Tooltip
                                      title={
                                        entry.summary.attendanceStatus === "morning_entry"
                                          ? "Edit morning entry"
                                          : "Edit attendance"
                                      }
                                    >
                                      <IconButton
                                        size="small"
                                        color="primary"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleOpenDrawerForDate(
                                            entry.summary.date,
                                            entry.summary.attendanceStatus === "morning_entry"
                                              ? "morning"
                                              : "full"
                                          );
                                        }}
                                      >
                                        <Edit sx={{ fontSize: 16 }} />
                                      </IconButton>
                                    </Tooltip>
                                  )}

                                  {/* View */}
                                  <Tooltip title="View summary">
                                    <IconButton
                                      size="small"
                                      color="info"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setViewSummaryDate(entry.summary.date);
                                      }}
                                    >
                                      <VisibilityIcon sx={{ fontSize: 16 }} />
                                    </IconButton>
                                  </Tooltip>

                                  {/* Delete */}
                                  {canEdit && (
                                    <Tooltip title="Delete attendance">
                                      <IconButton
                                        size="small"
                                        color="error"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteDateAttendance(entry.summary.date);
                                        }}
                                      >
                                        <Delete sx={{ fontSize: 16 }} />
                                      </IconButton>
                                    </Tooltip>
                                  )}
                                </Box>
                              </Box>
                            </TableCell>
                          </TableRow>
                          <TableRow>
                            <TableCell colSpan={13} sx={{ py: 0, border: 0 }}>
                              <Collapse
                                in={entry.summary.isExpanded}
                                timeout="auto"
                                unmountOnExit
                              >
                                <Box sx={{ p: 2, bgcolor: "action.hover" }}>
                                  {/* Header with Manage Button and Laborer Type Chips */}
                                  <Box
                                    sx={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      alignItems: "center",
                                      mb: 2,
                                      flexWrap: "wrap",
                                      gap: 1,
                                    }}
                                  >
                                    {/* Left side: Contract/Market chips */}
                                    <Box
                                      sx={{
                                        display: "flex",
                                        gap: { xs: 0.5, sm: 1 },
                                        flexWrap: "wrap",
                                        alignItems: "center",
                                      }}
                                    >
                                      {entry.summary.contractLaborerCount >
                                        0 && (
                                        <Chip
                                          label={
                                            <Box
                                              sx={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 0.5,
                                              }}
                                            >
                                              Contract: ₹
                                              {entry.summary.contractLaborerAmount.toLocaleString()}
                                              <Box
                                                component="span"
                                                sx={{ opacity: 0.8 }}
                                              >
                                                (
                                                {
                                                  entry.summary
                                                    .contractLaborerCount
                                                }
                                                )
                                              </Box>
                                            </Box>
                                          }
                                          size="small"
                                          color="info"
                                          variant="filled"
                                          sx={{
                                            height: { xs: 22, sm: 24 },
                                            "& .MuiChip-label": {
                                              px: { xs: 0.75, sm: 1 },
                                              fontSize: {
                                                xs: "0.65rem",
                                                sm: "0.75rem",
                                              },
                                            },
                                          }}
                                        />
                                      )}
                                      {entry.summary.marketLaborerCount > 0 && (
                                        <Chip
                                          label={
                                            <Box
                                              sx={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 0.5,
                                              }}
                                            >
                                              Market: ₹
                                              {entry.summary.marketLaborerAmount.toLocaleString()}
                                              <Box
                                                component="span"
                                                sx={{ opacity: 0.8 }}
                                              >
                                                (
                                                {
                                                  entry.summary
                                                    .marketLaborerCount
                                                }
                                                )
                                              </Box>
                                            </Box>
                                          }
                                          size="small"
                                          color="secondary"
                                          variant="filled"
                                          sx={{
                                            height: { xs: 22, sm: 24 },
                                            "& .MuiChip-label": {
                                              px: { xs: 0.75, sm: 1 },
                                              fontSize: {
                                                xs: "0.65rem",
                                                sm: "0.75rem",
                                              },
                                            },
                                          }}
                                        />
                                      )}
                                      {entry.summary.dailyLaborerCount > 0 && (
                                        <Chip
                                          label={
                                            <Box
                                              sx={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 0.5,
                                              }}
                                            >
                                              Daily: ₹
                                              {entry.summary.dailyLaborerAmount.toLocaleString()}
                                              <Box
                                                component="span"
                                                sx={{ opacity: 0.8 }}
                                              >
                                                (
                                                {
                                                  entry.summary
                                                    .dailyLaborerCount
                                                }
                                                )
                                              </Box>
                                            </Box>
                                          }
                                          size="small"
                                          color="warning"
                                          variant="filled"
                                          sx={{
                                            height: { xs: 22, sm: 24 },
                                            "& .MuiChip-label": {
                                              px: { xs: 0.75, sm: 1 },
                                              fontSize: {
                                                xs: "0.65rem",
                                                sm: "0.75rem",
                                              },
                                            },
                                          }}
                                        />
                                      )}
                                      {(entry.summary.dailyLaborerAmount > 0 ||
                                        entry.summary.marketLaborerAmount > 0) && (
                                        <Chip
                                          label={
                                            <Box
                                              sx={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 0.5,
                                              }}
                                            >
                                              Total Daily Pay: ₹
                                              {(
                                                entry.summary.dailyLaborerAmount +
                                                entry.summary.marketLaborerAmount
                                              ).toLocaleString()}
                                            </Box>
                                          }
                                          size="small"
                                          color="error"
                                          variant="filled"
                                          sx={{
                                            height: { xs: 22, sm: 24 },
                                            "& .MuiChip-label": {
                                              px: { xs: 0.75, sm: 1 },
                                              fontSize: {
                                                xs: "0.65rem",
                                                sm: "0.75rem",
                                              },
                                            },
                                          }}
                                        />
                                      )}
                                      {(entry.summary.dailyLaborerAmount > 0 ||
                                        entry.summary.marketLaborerAmount > 0 ||
                                        entry.summary.contractLaborerAmount > 0) && (
                                        <Chip
                                          label={
                                            <Box
                                              sx={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 0.5,
                                              }}
                                            >
                                              Total: ₹
                                              {(
                                                entry.summary.dailyLaborerAmount +
                                                entry.summary.marketLaborerAmount +
                                                entry.summary.contractLaborerAmount
                                              ).toLocaleString()}
                                            </Box>
                                          }
                                          size="small"
                                          color="default"
                                          variant="filled"
                                          sx={{
                                            height: { xs: 22, sm: 24 },
                                            "& .MuiChip-label": {
                                              px: { xs: 0.75, sm: 1 },
                                              fontSize: {
                                                xs: "0.65rem",
                                                sm: "0.75rem",
                                              },
                                            },
                                          }}
                                        />
                                      )}
                                    </Box>
                                    {/* Right side: Audit Avatar and Edit Button */}
                                    <Box
                                      sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 2,
                                      }}
                                    >
                                      {/* Audit Avatar - show who created/edited this entry */}
                                      {entry.summary.records.length > 0 && (
                                        <AuditAvatarGroup
                                          createdByName={
                                            entry.summary.records[0]?.entered_by
                                          }
                                          createdByAvatar={
                                            entry.summary.records[0]
                                              ?.entered_by_avatar
                                          }
                                          createdAt={
                                            entry.summary.records[0]?.created_at
                                          }
                                          updatedByName={
                                            entry.summary.records[0]?.updated_by
                                          }
                                          updatedByAvatar={
                                            entry.summary.records[0]
                                              ?.updated_by_avatar
                                          }
                                          updatedAt={
                                            entry.summary.records[0]?.updated_at
                                          }
                                          compact
                                          size="small"
                                        />
                                      )}
                                      {canEdit &&
                                        (entry.summary.attendanceStatus === "morning_entry" ||
                                          entry.summary.attendanceStatus === "draft") && (
                                          <Button
                                            variant="contained"
                                            color="success"
                                            size="small"
                                            onClick={() =>
                                              handleOpenDrawerForDate(
                                                entry.summary.date,
                                                entry.summary.attendanceStatus === "draft" ? "full" : "evening"
                                              )
                                            }
                                          >
                                            {entry.summary.attendanceStatus === "draft" ? "✓ Confirm Draft" : "🌆 Confirm Attendance"}
                                          </Button>
                                        )}
                                    </Box>
                                  </Box>

                                  {/* Work Description */}
                                  {(entry.summary.workDescription ||
                                    entry.summary.comments) && (
                                    <Box
                                      sx={{
                                        mb: 2,
                                        p: 1.5,
                                        bgcolor: "background.paper",
                                        borderRadius: 1,
                                        border: "1px solid",
                                        borderColor: "divider",
                                      }}
                                    >
                                      {entry.summary.workDescription && (
                                        <Typography
                                          variant="body2"
                                          sx={{ mb: 0.5 }}
                                        >
                                          <strong>Work:</strong>{" "}
                                          {entry.summary.workDescription}
                                        </Typography>
                                      )}
                                      {entry.summary.workStatus && (
                                        <Typography
                                          variant="body2"
                                          sx={{ mb: 0.5 }}
                                        >
                                          <strong>Status:</strong>{" "}
                                          {entry.summary.workStatus}
                                        </Typography>
                                      )}
                                      {entry.summary.comments && (
                                        <Typography
                                          variant="body2"
                                          color="text.secondary"
                                        >
                                          <strong>Comments:</strong>{" "}
                                          {entry.summary.comments}
                                        </Typography>
                                      )}
                                    </Box>
                                  )}

                                  {/* Individual Records Table */}
                                  {entry.summary.records.length > 0 && (
                                    <Table size="small">
                                      <TableHead>
                                        <TableRow
                                          sx={{ bgcolor: "primary.light" }}
                                        >
                                          <TableCell sx={{ fontWeight: 700 }}>
                                            Name
                                          </TableCell>
                                          <TableCell sx={{ fontWeight: 700 }}>
                                            Type
                                          </TableCell>
                                          <TableCell sx={{ fontWeight: 700 }}>
                                            Team
                                          </TableCell>
                                          <TableCell
                                            sx={{ fontWeight: 700 }}
                                            align="center"
                                          >
                                            In
                                          </TableCell>
                                          <TableCell
                                            sx={{ fontWeight: 700 }}
                                            align="center"
                                          >
                                            Out
                                          </TableCell>
                                          <TableCell
                                            sx={{ fontWeight: 700 }}
                                            align="center"
                                          >
                                            Work Hrs
                                          </TableCell>
                                          <TableCell
                                            sx={{ fontWeight: 700 }}
                                            align="center"
                                          >
                                            W/D Units
                                          </TableCell>
                                          <TableCell
                                            sx={{ fontWeight: 700 }}
                                            align="right"
                                          >
                                            Salary
                                          </TableCell>
                                          <TableCell
                                            sx={{ fontWeight: 700 }}
                                            align="right"
                                          >
                                            Snacks
                                          </TableCell>
                                          <TableCell
                                            sx={{ fontWeight: 700 }}
                                            align="center"
                                          >
                                            Payment
                                          </TableCell>
                                          <TableCell
                                            sx={{ fontWeight: 700 }}
                                            align="center"
                                          >
                                            Actions
                                          </TableCell>
                                        </TableRow>
                                      </TableHead>
                                      <TableBody>
                                        {entry.summary.records.map((record) => (
                                          <TableRow key={record.id} hover>
                                            <TableCell>
                                              {record.laborer_name}
                                            </TableCell>
                                            <TableCell>
                                              <Chip
                                                label={
                                                  record.laborer_type ===
                                                  "contract"
                                                    ? "C"
                                                    : "D"
                                                }
                                                size="small"
                                                color={
                                                  record.laborer_type ===
                                                  "contract"
                                                    ? "info"
                                                    : "warning"
                                                }
                                                variant="outlined"
                                              />
                                            </TableCell>
                                            <TableCell>
                                              {record.team_name || "-"}
                                            </TableCell>
                                            <TableCell align="center">
                                              {formatTime(record.in_time)}
                                            </TableCell>
                                            <TableCell align="center">
                                              {record.attendance_status === "morning_entry" ||
                                              record.attendance_status === "draft"
                                                ? "-"
                                                : formatTime(record.out_time)}
                                            </TableCell>
                                            <TableCell align="center">
                                              {record.work_hours
                                                ? `${record.work_hours}h`
                                                : "-"}
                                            </TableCell>
                                            <TableCell align="center">
                                              <Chip
                                                label={
                                                  record.day_units ||
                                                  record.work_days
                                                }
                                                size="small"
                                                color="primary"
                                                variant="outlined"
                                              />
                                            </TableCell>
                                            <TableCell align="right">
                                              ₹
                                              {record.daily_earnings.toLocaleString()}
                                            </TableCell>
                                            <TableCell align="right">
                                              {record.snacks_amount
                                                ? `₹${record.snacks_amount}`
                                                : "-"}
                                            </TableCell>
                                            <TableCell align="center">
                                              {record.laborer_type ===
                                              "contract" ? (
                                                <Chip
                                                  label="In Contract"
                                                  size="small"
                                                  color="info"
                                                  variant="outlined"
                                                />
                                              ) : record.is_paid ? (
                                                <Tooltip
                                                  title={record.payment_notes || "No notes"}
                                                  arrow
                                                >
                                                  <Chip
                                                    label="PAID"
                                                    size="small"
                                                    color="success"
                                                    variant="filled"
                                                    sx={{ cursor: "help" }}
                                                  />
                                                </Tooltip>
                                              ) : (
                                                <Chip
                                                  label="PENDING"
                                                  size="small"
                                                  color="warning"
                                                  variant="outlined"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (canEdit)
                                                      handleOpenPaymentDialog(
                                                        record
                                                      );
                                                  }}
                                                  sx={{
                                                    cursor: canEdit
                                                      ? "pointer"
                                                      : "default",
                                                  }}
                                                />
                                              )}
                                            </TableCell>
                                            <TableCell align="center">
                                              <Box
                                                sx={{
                                                  display: "flex",
                                                  gap: 0.5,
                                                  justifyContent: "center",
                                                }}
                                              >
                                                {/* Record Payment button for pending daily laborers */}
                                                {record.laborer_type !==
                                                  "contract" &&
                                                  !record.is_paid &&
                                                  canEdit && (
                                                    <Button
                                                      size="small"
                                                      variant="outlined"
                                                      color="success"
                                                      onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleOpenPaymentDialog(
                                                          record
                                                        );
                                                      }}
                                                      sx={{
                                                        minWidth: 50,
                                                        px: 1,
                                                        fontSize: 11,
                                                      }}
                                                    >
                                                      Pay
                                                    </Button>
                                                  )}
                                                {/* Cancel Payment button for paid daily laborers */}
                                                {record.laborer_type !==
                                                  "contract" &&
                                                  record.is_paid &&
                                                  canEdit && (
                                                    <Tooltip title="Cancel Payment">
                                                      <Button
                                                        size="small"
                                                        variant="outlined"
                                                        color="warning"
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          handleCancelPayment(record);
                                                        }}
                                                        sx={{
                                                          minWidth: 50,
                                                          px: 1,
                                                          fontSize: 11,
                                                        }}
                                                      >
                                                        Undo
                                                      </Button>
                                                    </Tooltip>
                                                  )}
                                                <IconButton
                                                  size="small"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleOpenEditDialog(
                                                      record
                                                    );
                                                  }}
                                                  disabled={!canEdit}
                                                >
                                                  {record.is_paid ? (
                                                    <Tooltip title="Paid - Cancel payment first to edit">
                                                      <LockIcon fontSize="small" color="disabled" />
                                                    </Tooltip>
                                                  ) : (
                                                    <Edit fontSize="small" />
                                                  )}
                                                </IconButton>
                                                <IconButton
                                                  size="small"
                                                  color={record.is_paid ? "default" : "error"}
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDelete(record);
                                                  }}
                                                  disabled={!canEdit}
                                                >
                                                  {record.is_paid ? (
                                                    <Tooltip title="Paid - Cancel payment first to delete">
                                                      <LockIcon fontSize="small" color="disabled" />
                                                    </Tooltip>
                                                  ) : (
                                                    <Delete fontSize="small" />
                                                  )}
                                                </IconButton>
                                              </Box>
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  )}

                                  {/* Market Laborers Section */}
                                  {entry.summary.marketLaborers &&
                                    entry.summary.marketLaborers.length > 0 && (
                                      <Box
                                        sx={{
                                          mt:
                                            entry.summary.records.length > 0
                                              ? 2
                                              : 0,
                                        }}
                                      >
                                        <Typography
                                          variant="subtitle2"
                                          sx={{
                                            mb: 1,
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 1,
                                          }}
                                        >
                                          <Chip
                                            label="Market Laborers"
                                            size="small"
                                            color="secondary"
                                          />
                                          <Typography
                                            variant="caption"
                                            color="text.secondary"
                                          >
                                            (
                                            {
                                              entry.summary.marketLaborers
                                                .length
                                            }{" "}
                                            workers)
                                          </Typography>
                                        </Typography>
                                        <Table
                                          size="small"
                                          sx={{ bgcolor: "secondary.50" }}
                                        >
                                          <TableHead>
                                            <TableRow
                                              sx={{ bgcolor: "secondary.main" }}
                                            >
                                              <TableCell
                                                sx={{
                                                  fontWeight: 700,
                                                  color: "white",
                                                }}
                                              >
                                                Name
                                              </TableCell>
                                              <TableCell
                                                sx={{
                                                  fontWeight: 700,
                                                  color: "white",
                                                }}
                                              >
                                                Role
                                              </TableCell>
                                              <TableCell
                                                sx={{
                                                  fontWeight: 700,
                                                  color: "white",
                                                }}
                                                align="center"
                                              >
                                                In
                                              </TableCell>
                                              <TableCell
                                                sx={{
                                                  fontWeight: 700,
                                                  color: "white",
                                                }}
                                                align="center"
                                              >
                                                Out
                                              </TableCell>
                                              <TableCell
                                                sx={{
                                                  fontWeight: 700,
                                                  color: "white",
                                                }}
                                                align="center"
                                              >
                                                Units
                                              </TableCell>
                                              <TableCell
                                                sx={{
                                                  fontWeight: 700,
                                                  color: "white",
                                                }}
                                                align="right"
                                              >
                                                Rate
                                              </TableCell>
                                              <TableCell
                                                sx={{
                                                  fontWeight: 700,
                                                  color: "white",
                                                }}
                                                align="right"
                                              >
                                                Salary
                                              </TableCell>
                                              <TableCell
                                                sx={{
                                                  fontWeight: 700,
                                                  color: "white",
                                                }}
                                                align="center"
                                              >
                                                Payment
                                              </TableCell>
                                              <TableCell
                                                sx={{
                                                  fontWeight: 700,
                                                  color: "white",
                                                }}
                                                align="center"
                                              >
                                                Actions
                                              </TableCell>
                                            </TableRow>
                                          </TableHead>
                                          <TableBody>
                                            {entry.summary.marketLaborers.map(
                                              (ml) => (
                                                <TableRow
                                                  key={ml.id}
                                                  sx={{
                                                    "&:hover": {
                                                      bgcolor:
                                                        "secondary.100 !important",
                                                    },
                                                  }}
                                                >
                                                  <TableCell>
                                                    <Typography
                                                      variant="body2"
                                                      fontWeight={500}
                                                    >
                                                      {ml.tempName}
                                                    </Typography>
                                                  </TableCell>
                                                  <TableCell>
                                                    <Chip
                                                      label={ml.roleName}
                                                      size="small"
                                                      variant="outlined"
                                                      color="secondary"
                                                      sx={{
                                                        fontSize: "0.7rem",
                                                      }}
                                                    />
                                                  </TableCell>
                                                  <TableCell align="center">
                                                    {ml.inTime
                                                      ? ml.inTime.substring(
                                                          0,
                                                          5
                                                        )
                                                      : "-"}
                                                  </TableCell>
                                                  <TableCell align="center">
                                                    {ml.outTime
                                                      ? ml.outTime.substring(
                                                          0,
                                                          5
                                                        )
                                                      : "-"}
                                                  </TableCell>
                                                  <TableCell align="center">
                                                    {ml.dayUnits}
                                                  </TableCell>
                                                  <TableCell align="right">
                                                    ₹
                                                    {ml.ratePerPerson.toLocaleString()}
                                                  </TableCell>
                                                  <TableCell align="right">
                                                    <Typography
                                                      fontWeight={600}
                                                    >
                                                      ₹
                                                      {ml.dailyEarnings.toLocaleString()}
                                                    </Typography>
                                                  </TableCell>
                                                  <TableCell align="center">
                                                    <Tooltip
                                                      title={
                                                        ml.isPaid && ml.paymentNotes
                                                          ? ml.paymentNotes
                                                          : ml.isPaid
                                                          ? "No notes"
                                                          : ""
                                                      }
                                                      arrow
                                                    >
                                                      <Chip
                                                        label={
                                                          ml.isPaid
                                                            ? "Paid"
                                                            : "Pending"
                                                        }
                                                        size="small"
                                                        color={
                                                          ml.isPaid
                                                            ? "success"
                                                            : "warning"
                                                        }
                                                        variant={
                                                          ml.isPaid
                                                            ? "filled"
                                                            : "outlined"
                                                        }
                                                        sx={{
                                                          fontSize: "0.65rem",
                                                          cursor: ml.isPaid
                                                            ? "help"
                                                            : "default",
                                                        }}
                                                      />
                                                    </Tooltip>
                                                  </TableCell>
                                                  <TableCell align="center">
                                                    <Box
                                                      sx={{
                                                        display: "flex",
                                                        gap: 0.5,
                                                        justifyContent:
                                                          "center",
                                                      }}
                                                    >
                                                      {ml.isPaid && canEdit && (
                                                        <Tooltip title="Cancel Payment">
                                                          <Button
                                                            size="small"
                                                            variant="outlined"
                                                            color="warning"
                                                            onClick={(e) => {
                                                              e.stopPropagation();
                                                              handleCancelMarketPayment(ml);
                                                            }}
                                                            sx={{
                                                              minWidth: 50,
                                                              px: 1,
                                                              fontSize: 11,
                                                            }}
                                                          >
                                                            Undo
                                                          </Button>
                                                        </Tooltip>
                                                      )}
                                                      <Tooltip
                                                        title={
                                                          ml.groupCount > 1
                                                            ? `Edit all ${ml.groupCount} ${ml.roleName}(s)`
                                                            : "Edit"
                                                        }
                                                      >
                                                        <span>
                                                          <IconButton
                                                            size="small"
                                                            onClick={(e) => {
                                                              e.stopPropagation();
                                                              handleOpenMarketLaborerEdit(
                                                                ml
                                                              );
                                                            }}
                                                            disabled={!canEdit}
                                                          >
                                                            <Edit fontSize="small" />
                                                          </IconButton>
                                                        </span>
                                                      </Tooltip>
                                                      <Tooltip
                                                        title={
                                                          ml.groupCount > 1
                                                            ? `Delete all ${ml.groupCount} ${ml.roleName}(s)`
                                                            : "Delete"
                                                        }
                                                      >
                                                        <span>
                                                          <IconButton
                                                            size="small"
                                                            color="error"
                                                            onClick={(e) => {
                                                              e.stopPropagation();
                                                              handleDeleteMarketLaborer(
                                                                ml
                                                              );
                                                            }}
                                                            disabled={!canEdit}
                                                          >
                                                            <Delete fontSize="small" />
                                                          </IconButton>
                                                        </span>
                                                      </Tooltip>
                                                    </Box>
                                                  </TableCell>
                                                </TableRow>
                                              )
                                            )}
                                            {/* Market Laborers Total Row */}
                                            <TableRow
                                              sx={{ bgcolor: "secondary.100" }}
                                            >
                                              <TableCell colSpan={6}>
                                                <Typography
                                                  variant="body2"
                                                  fontWeight={700}
                                                >
                                                  Market Labor Total (
                                                  {
                                                    entry.summary.marketLaborers
                                                      .length
                                                  }{" "}
                                                  workers)
                                                </Typography>
                                              </TableCell>
                                              <TableCell align="right">
                                                <Typography
                                                  fontWeight={700}
                                                  color="secondary.main"
                                                >
                                                  ₹
                                                  {entry.summary.marketLaborerAmount.toLocaleString()}
                                                </Typography>
                                              </TableCell>
                                              <TableCell align="center">
                                                <Chip
                                                  label={`Pending: ₹${entry.summary.marketLaborerAmount.toLocaleString()}`}
                                                  size="small"
                                                  color="warning"
                                                  sx={{ fontSize: "0.65rem" }}
                                                />
                                              </TableCell>
                                              <TableCell />
                                            </TableRow>
                                          </TableBody>
                                        </Table>
                                      </Box>
                                    )}
                                </Box>
                              </Collapse>
                            </TableCell>
                          </TableRow>
                        </>
                      )}
                    </React.Fragment>
                  ))}
                  {combinedDateEntries.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={13} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">
                          No attendance records found for the selected date
                          range
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                  {combinedDateEntries.length > 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={13}
                        align="center"
                        ref={loadMoreSentinelRef}
                        sx={{ py: 2, borderBottom: 0 }}
                      >
                        {weeksQuery.isFetchingNextPage ? (
                          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 1 }}>
                            <CircularProgress size={18} />
                            <Typography variant="body2" color="text.secondary">
                              Loading older weeks…
                            </Typography>
                          </Box>
                        ) : weeksQuery.hasNextPage ? (
                          <Typography variant="caption" color="text.secondary">
                            Scroll to load more
                          </Typography>
                        ) : (
                          <Typography variant="caption" color="text.disabled">
                            End of records
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Box>
      ) : (
        <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          <DataTable
            columns={detailedColumns}
            data={attendanceRecords}
            isLoading={loading}
            showRecordCount
          />
        </Box>
      )}

      {/* Attendance Drawer */}
      <AttendanceDrawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedDateForDrawer(undefined);
          setDrawerMode("full");
        }}
        siteId={selectedSite?.id || ""}
        date={selectedDateForDrawer}
        onSuccess={() => {
          invalidateAttendance();
          setSelectedDateForDrawer(undefined);
          setDrawerMode("full");
        }}
        mode={drawerMode}
        siteGroupId={(selectedSite as any)?.site_group_id}
        siteName={selectedSite?.name || "Current Site"}
      />

      {/* Tea Shop Entry Dialog (Direct) */}
      {teaShopAccount && (
        <TeaShopEntryDialog
          open={teaShopDialogOpen}
          onClose={() => {
            setTeaShopDialogOpen(false);
            setTeaShopDialogDate(undefined);
            setTeaShopEditingEntry(null);
          }}
          shop={teaShopAccount}
          entry={teaShopEditingEntry}
          initialDate={teaShopDialogDate}
          onSuccess={() => {
            invalidateAttendance();
            setTeaShopDialogOpen(false);
            setTeaShopDialogDate(undefined);
            setTeaShopEditingEntry(null);
          }}
        />
      )}

      {/* Tea Shop Entry Mode Dialog - For choosing between group and site entry */}
      {siteGroup && (
        <TeaShopEntryModeDialog
          open={teaShopEntryModeDialogOpen}
          onClose={() => {
            setTeaShopEntryModeDialogOpen(false);
            setTeaShopDialogDate(undefined);
          }}
          siteName={selectedSite?.name || "Current Site"}
          groupSites={siteGroup.sites?.map((s: any) => s.name) || []}
          onSelectGroupEntry={() => {
            setTeaShopEntryModeDialogOpen(false);
            setGroupTeaShopDialogOpen(true);
          }}
          onSelectSiteEntry={handleSiteSpecificTeaEntry}
        />
      )}

      {/* Group Tea Shop Entry Dialog */}
      {(groupTeaShop || editingTeaShop) && (siteGroup || editingSiteGroup) && (
        <GroupTeaShopEntryDialog
          open={groupTeaShopDialogOpen}
          onClose={() => {
            setGroupTeaShopDialogOpen(false);
            setTeaShopDialogDate(undefined);
            setEditingGroupEntryData(null);
            setEditingTeaShop(null);
            setEditingSiteGroup(null);
          }}
          shop={groupTeaShop || editingTeaShop}
          siteGroup={(siteGroup || editingSiteGroup) as SiteGroupWithSites}
          initialDate={teaShopDialogDate}
          entry={editingGroupEntryData}
          onSuccess={() => {
            invalidateAttendance();
            setGroupTeaShopDialogOpen(false);
            setTeaShopDialogDate(undefined);
            setEditingGroupEntryData(null);
            setEditingTeaShop(null);
            setEditingSiteGroup(null);
          }}
        />
      )}

      {/* Work Update Viewer Dialog */}
      <WorkUpdateViewer
        open={workUpdateViewerOpen}
        onClose={() => {
          setWorkUpdateViewerOpen(false);
          setSelectedWorkUpdate(null);
        }}
        workUpdates={selectedWorkUpdate?.workUpdates || null}
        siteName={selectedSite?.name}
        date={selectedWorkUpdate?.date || ""}
      />

      {/* Edit Attendance Dialog */}
      <Dialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Edit Attendance</DialogTitle>
        <DialogContent>
          {editingRecord && (
            <Box
              sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 2 }}
            >
              <Alert severity="info">
                Editing attendance for{" "}
                <strong>{editingRecord.laborer_name}</strong> on{" "}
                {dayjs(editingRecord.date).format("DD MMM YYYY")}
              </Alert>

              <FormControl fullWidth size="small">
                <InputLabel>W/D Units</InputLabel>
                <Select
                  value={editForm.work_days}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      work_days: e.target.value as number,
                    })
                  }
                  label="W/D Units"
                >
                  <MenuItem value={0.5}>0.5 (Half Day)</MenuItem>
                  <MenuItem value={1}>1 (Full Day)</MenuItem>
                  <MenuItem value={1.5}>1.5</MenuItem>
                  <MenuItem value={2}>2</MenuItem>
                  <MenuItem value={2.5}>2.5 (Extra)</MenuItem>
                </Select>
              </FormControl>

              <TextField
                fullWidth
                label="Daily Rate"
                type="number"
                size="small"
                value={editForm.daily_rate_applied}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    daily_rate_applied: Number(e.target.value),
                  })
                }
                slotProps={{
                  input: {
                    startAdornment: <Typography sx={{ mr: 0.5 }}>₹</Typography>,
                  },
                }}
              />

              <Box
                sx={{
                  p: 2,
                  bgcolor: "action.selected",
                  borderRadius: 1,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  Total Salary:
                </Typography>
                <Typography
                  variant="body1"
                  fontWeight={700}
                  color="success.main"
                >
                  ₹
                  {(
                    editForm.work_days * editForm.daily_rate_applied
                  ).toLocaleString()}
                </Typography>
              </Box>

              {editingRecord.laborer_type !== "contract" &&
                !editingRecord.is_paid && (
                  <Alert severity="info" sx={{ mt: 1 }}>
                    To record payment, close this dialog and click the
                    &quot;Pay&quot; button or the PENDING chip.
                  </Alert>
                )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleEditSubmit}
            variant="contained"
            disabled={loading}
          >
            Update
          </Button>
        </DialogActions>
      </Dialog>

      {/* Market Laborer Edit Dialog */}
      <Dialog
        open={marketLaborerEditOpen}
        onClose={() => {
          setMarketLaborerEditOpen(false);
          setEditingMarketLaborer(null);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Edit Market Laborer
          {editingMarketLaborer && editingMarketLaborer.groupCount > 1 && (
            <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
              (All {editingMarketLaborer.groupCount}{" "}
              {editingMarketLaborer.roleName}s)
            </Typography>
          )}
        </DialogTitle>
        <DialogContent>
          {editingMarketLaborer && (
            <Box
              sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 2 }}
            >
              <Alert severity="info">
                Editing <strong>{editingMarketLaborer.roleName}</strong> on{" "}
                {dayjs(editingMarketLaborer.date).format("DD MMM YYYY")}
                {editingMarketLaborer.groupCount > 1 && (
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    This will update all {editingMarketLaborer.groupCount}{" "}
                    workers in this group.
                  </Typography>
                )}
              </Alert>

              <TextField
                fullWidth
                label="Number of Workers"
                type="number"
                size="small"
                value={marketLaborerEditForm.count}
                onChange={(e) =>
                  setMarketLaborerEditForm({
                    ...marketLaborerEditForm,
                    count: Math.max(1, Number(e.target.value)),
                  })
                }
                slotProps={{
                  input: { inputProps: { min: 1 } },
                }}
              />

              <FormControl fullWidth size="small">
                <InputLabel>W/D Units</InputLabel>
                <Select
                  value={marketLaborerEditForm.day_units}
                  onChange={(e) =>
                    setMarketLaborerEditForm({
                      ...marketLaborerEditForm,
                      day_units: e.target.value as number,
                    })
                  }
                  label="W/D Units"
                >
                  <MenuItem value={0.5}>0.5 (Half Day)</MenuItem>
                  <MenuItem value={1}>1 (Full Day)</MenuItem>
                  <MenuItem value={1.5}>1.5</MenuItem>
                  <MenuItem value={2}>2</MenuItem>
                  <MenuItem value={2.5}>2.5 (Extra)</MenuItem>
                </Select>
              </FormControl>

              <TextField
                fullWidth
                label="Rate per Person"
                type="number"
                size="small"
                value={marketLaborerEditForm.rate_per_person}
                onChange={(e) =>
                  setMarketLaborerEditForm({
                    ...marketLaborerEditForm,
                    rate_per_person: Number(e.target.value),
                  })
                }
                slotProps={{
                  input: {
                    startAdornment: <Typography sx={{ mr: 0.5 }}>₹</Typography>,
                  },
                }}
              />

              <Box
                sx={{
                  p: 2,
                  bgcolor: "action.selected",
                  borderRadius: 1,
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    mb: 1,
                  }}
                >
                  <Typography variant="body2" color="text.secondary">
                    Per Person:
                  </Typography>
                  <Typography variant="body2" fontWeight={500}>
                    ₹
                    {(
                      marketLaborerEditForm.rate_per_person *
                      marketLaborerEditForm.day_units
                    ).toLocaleString()}
                  </Typography>
                </Box>
                <Divider sx={{ my: 1 }} />
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="body1" fontWeight={600}>
                    Total ({marketLaborerEditForm.count} workers):
                  </Typography>
                  <Typography
                    variant="body1"
                    fontWeight={700}
                    color="success.main"
                  >
                    ₹
                    {(
                      marketLaborerEditForm.count *
                      marketLaborerEditForm.rate_per_person *
                      marketLaborerEditForm.day_units
                    ).toLocaleString()}
                  </Typography>
                </Box>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setMarketLaborerEditOpen(false);
              setEditingMarketLaborer(null);
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveMarketLaborerEdit}
            variant="contained"
            disabled={loading}
          >
            Update
          </Button>
        </DialogActions>
      </Dialog>

      {/* Tea Shop Popover */}
      <Popover
        open={Boolean(teaShopPopoverAnchor)}
        anchorEl={teaShopPopoverAnchor}
        onClose={() => {
          setTeaShopPopoverAnchor(null);
          setTeaShopPopoverData(null);
        }}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "center",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "center",
        }}
      >
        {teaShopPopoverData && (
          <Box sx={{ p: 2, minWidth: 280 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
              {teaShopPopoverData.data.isGroupEntry && (
                <GroupsIcon fontSize="small" color="primary" />
              )}
              <Typography variant="subtitle2" fontWeight={700}>
                {teaShopPopoverData.data.isGroupEntry ? "Group T&S" : "Tea Shop"}: {dayjs(teaShopPopoverData.date).format("DD MMM YYYY")}
              </Typography>
            </Box>
            {teaShopPopoverData.data.isGroupEntry && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                This site&apos;s allocated share from group entry
              </Typography>
            )}
            <Divider sx={{ mb: 1.5 }} />

            {!teaShopPopoverData.data.isGroupEntry && (
              <>
                <Box
                  sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}
                >
                  <Typography variant="body2">Tea:</Typography>
                  <Typography variant="body2" fontWeight={500}>
                    ₹{teaShopPopoverData.data.teaTotal.toLocaleString()}
                  </Typography>
                </Box>
                <Box
                  sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}
                >
                  <Typography variant="body2">Snacks:</Typography>
                  <Typography variant="body2" fontWeight={500}>
                    ₹{teaShopPopoverData.data.snacksTotal.toLocaleString()}
                  </Typography>
                </Box>

                <Divider sx={{ my: 1 }} />

                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mb: 0.5 }}
                >
                  Consumption Breakdown:
                </Typography>

                {teaShopPopoverData.data.workingCount > 0 && (
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      mb: 0.25,
                    }}
                  >
                    <Typography variant="caption">
                      Working ({teaShopPopoverData.data.workingCount}):
                    </Typography>
                    <Typography variant="caption">
                      ₹{teaShopPopoverData.data.workingTotal.toLocaleString()}
                    </Typography>
                  </Box>
                )}
                {teaShopPopoverData.data.nonWorkingCount > 0 && (
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      mb: 0.25,
                    }}
                  >
                    <Typography variant="caption">
                      Non-Working ({teaShopPopoverData.data.nonWorkingCount}):
                    </Typography>
                    <Typography variant="caption">
                      ₹{teaShopPopoverData.data.nonWorkingTotal.toLocaleString()}
                    </Typography>
                  </Box>
                )}
                {teaShopPopoverData.data.marketCount > 0 && (
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      mb: 0.25,
                    }}
                  >
                    <Typography variant="caption">
                      Market ({teaShopPopoverData.data.marketCount}):
                    </Typography>
                    <Typography variant="caption">
                      ₹{teaShopPopoverData.data.marketTotal.toLocaleString()}
                    </Typography>
                  </Box>
                )}

                <Divider sx={{ my: 1 }} />
              </>
            )}

            <Box sx={{ display: "flex", justifyContent: "space-between" }}>
              <Typography variant="body2" fontWeight={700}>
                {teaShopPopoverData.data.isGroupEntry ? "Allocated Amount:" : "Total:"}
              </Typography>
              <Typography variant="body2" fontWeight={700} color="primary.main">
                ₹{teaShopPopoverData.data.total.toLocaleString()}
              </Typography>
            </Box>

            {/* Show all site allocations for group entries */}
            {teaShopPopoverData.data.isGroupEntry && popoverGroupAllocations && popoverGroupAllocations.length > 0 && (
              <Box sx={{ mt: 1.5, pt: 1.5, borderTop: 1, borderColor: "divider" }}>
                <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                  All Sites:
                </Typography>
                {popoverGroupAllocations.map((alloc: any) => (
                  <Box key={alloc.site_id} sx={{ display: "flex", justifyContent: "space-between", mt: 0.25 }}>
                    <Typography variant="caption">{alloc.site?.name || "Unknown"}</Typography>
                    <Typography variant="caption">₹{(alloc.allocated_amount || 0).toLocaleString()}</Typography>
                  </Box>
                ))}
                <Divider sx={{ my: 0.5 }} />
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="caption" fontWeight={600}>Total:</Typography>
                  <Typography variant="caption" fontWeight={600} color="success.main">
                    ₹{popoverGroupAllocations.reduce((sum: number, a: any) => sum + (a.allocated_amount || 0), 0).toLocaleString()}
                  </Typography>
                </Box>
              </Box>
            )}

            <Button
              fullWidth
              size="small"
              variant="outlined"
              sx={{ mt: 1.5 }}
              onClick={async () => {
                const dateToEdit = teaShopPopoverData.date;
                const isGroupEntry = teaShopPopoverData.data.isGroupEntry;
                const entryId = teaShopPopoverData.data.entryId;

                // Close popover first
                setTeaShopPopoverAnchor(null);
                setTeaShopPopoverData(null);
                setPopoverGroupAllocations(null);

                // For group entries: fetch data and open dialog directly (skip mode dialog)
                if (isGroupEntry && entryId) {
                  await handleEditGroupEntry(entryId, dateToEdit);
                  return;
                }

                // For non-group entries: use normal flow
                handleOpenTeaShopDialog(dateToEdit);
              }}
            >
              Edit
            </Button>
          </Box>
        )}
      </Popover>

      {/* Payment Dialog */}
      <PaymentDialog
        open={paymentDialogOpen}
        onClose={() => {
          setPaymentDialogOpen(false);
          setPaymentRecords([]);
        }}
        dailyRecords={paymentRecords}
        allowSubcontractLink
        onSuccess={handlePaymentSuccess}
      />

      {/* Unified Settlement Dialog */}
      <UnifiedSettlementDialog
        open={settlementDialogOpen}
        onClose={() => {
          setSettlementDialogOpen(false);
          setSettlementConfig(null);
        }}
        config={settlementConfig}
        onSuccess={() => {
          setSettlementDialogOpen(false);
          setSettlementConfig(null);
          invalidateAttendance();
        }}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
          setDeleteDialogData(null);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            color: "error.main",
          }}
        >
          <Delete />
          Delete Attendance Record
        </DialogTitle>
        <DialogContent>
          {deleteDialogData && (
            <Box sx={{ mt: 1 }}>
              <Alert severity="warning" sx={{ mb: 2 }}>
                You are about to delete <strong>ALL</strong> attendance records
                for this date. This action cannot be undone.
              </Alert>

              <Box
                sx={{ bgcolor: "action.hover", p: 2, borderRadius: 1, mb: 2 }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    mb: 1.5,
                  }}
                >
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ minWidth: 80 }}
                  >
                    Site:
                  </Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {deleteDialogData.siteName}
                  </Typography>
                </Box>

                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    mb: 1.5,
                  }}
                >
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ minWidth: 80 }}
                  >
                    Date:
                  </Typography>
                  <Typography variant="body1" fontWeight={600}>
                    {dayjs(deleteDialogData.date).format("dddd, DD MMMM YYYY")}
                  </Typography>
                </Box>

                <Divider sx={{ my: 1.5 }} />

                <Box
                  sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}
                >
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ minWidth: 80 }}
                  >
                    Laborers:
                  </Typography>
                  <Typography variant="body1">
                    {deleteDialogData.dailyCount} daily
                    {deleteDialogData.marketCount > 0 &&
                      `, ${deleteDialogData.marketCount} market`}
                  </Typography>
                </Box>

                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ minWidth: 80 }}
                  >
                    Total:
                  </Typography>
                  <Typography
                    variant="body1"
                    fontWeight={700}
                    color="error.main"
                  >
                    ₹{deleteDialogData.totalAmount.toLocaleString()}
                  </Typography>
                </Box>
              </Box>

              <Typography variant="caption" color="text.secondary">
                This will also delete all tea shop entries and work summaries
                for this date.
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => {
              setDeleteDialogOpen(false);
              setDeleteDialogData(null);
            }}
            variant="outlined"
          >
            Cancel
          </Button>
          <Button
            onClick={confirmDeleteDateAttendance}
            variant="contained"
            color="error"
            startIcon={<Delete />}
            disabled={loading}
          >
            Delete All
          </Button>
        </DialogActions>
      </Dialog>

      {/* View Attendance Summary Dialog */}
      <Dialog
        open={Boolean(viewSummaryDate)}
        onClose={() => setViewSummaryDate(null)}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
        PaperProps={{
          sx: {
            m: { xs: 0, sm: 2 },
            maxHeight: { xs: '100%', sm: '90vh' },
            borderRadius: { xs: 0, sm: 2 },
          }
        }}
      >
        {viewSummaryDate &&
          (() => {
            const summaryEntry = combinedDateEntries.find(
              (e) => e.type === "attendance" && e.date === viewSummaryDate
            );
            const summary =
              summaryEntry?.type === "attendance" ? summaryEntry.summary : null;

            if (!summary) return null;

            return (
              <>
                <DialogTitle sx={{ bgcolor: "primary.main", color: "white", pr: 1 }}>
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 1, sm: 2 } }}>
                      <VisibilityIcon sx={{ fontSize: { xs: 20, sm: 24 } }} />
                      <Box>
                        <Typography variant="h6" component="span" sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                          Attendance Summary
                        </Typography>
                        <Typography variant="body2" sx={{ opacity: 0.9, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                          {dayjs(viewSummaryDate).format(isMobile ? "ddd, DD MMM YYYY" : "dddd, DD MMMM YYYY")}
                        </Typography>
                      </Box>
                    </Box>
                    <IconButton
                      onClick={() => setViewSummaryDate(null)}
                      sx={{ color: 'white' }}
                      size={isMobile ? "small" : "medium"}
                    >
                      <CloseIcon />
                    </IconButton>
                  </Box>
                </DialogTitle>
                <DialogContent sx={{ p: { xs: 1.5, sm: 3 }, pt: { xs: 2, sm: 3 } }}>
                  {/* Summary Stats */}
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(4, 1fr)" },
                      gap: { xs: 1, sm: 2 },
                      mb: { xs: 2, sm: 3 }
                    }}
                  >
                    <Paper
                      sx={{ p: { xs: 1, sm: 2 }, textAlign: "center" }}
                    >
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
                        Total Laborers
                      </Typography>
                      <Typography variant="h4" fontWeight={700} sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>
                        {summary.totalLaborerCount}
                      </Typography>
                    </Paper>
                    <Paper
                      sx={{ p: { xs: 1, sm: 2 }, textAlign: "center" }}
                    >
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
                        Daily/Contract
                      </Typography>
                      <Typography
                        variant="h4"
                        fontWeight={700}
                        color="info.main"
                        sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' } }}
                      >
                        {summary.dailyLaborerCount +
                          summary.contractLaborerCount}
                      </Typography>
                    </Paper>
                    <Paper
                      sx={{ p: { xs: 1, sm: 2 }, textAlign: "center" }}
                    >
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
                        Market
                      </Typography>
                      <Typography
                        variant="h4"
                        fontWeight={700}
                        color="secondary.main"
                        sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' } }}
                      >
                        {summary.marketLaborerCount}
                      </Typography>
                    </Paper>
                    <Paper
                      sx={{ p: { xs: 1, sm: 2 }, textAlign: "center" }}
                    >
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
                        Total Expense
                      </Typography>
                      <Typography
                        variant="h4"
                        fontWeight={700}
                        color="success.main"
                        sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' } }}
                      >
                        ₹
                        {(
                          summary.totalExpense + (summary.teaShop?.total || 0)
                        ).toLocaleString()}
                      </Typography>
                    </Paper>
                  </Box>

                  {/* Status */}
                  <Box sx={{ mb: 3 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>
                      Status
                    </Typography>
                    <Chip
                      label={
                        summary.attendanceStatus === "draft"
                          ? "📝 Draft"
                          : summary.attendanceStatus === "morning_entry"
                          ? "🌅 Morning Only"
                          : "✓ Confirmed"
                      }
                      color={
                        summary.attendanceStatus === "draft"
                          ? "warning"
                          : summary.attendanceStatus === "morning_entry"
                          ? "warning"
                          : "success"
                      }
                      variant={summary.attendanceStatus === "draft" ? "filled" : "outlined"}
                    />
                  </Box>

                  {/* Timing */}
                  <Box sx={{ mb: 3 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>
                      Work Timing
                    </Typography>
                    <Box sx={{ display: "flex", gap: 3 }}>
                      <Typography variant="body2">
                        <strong>First In:</strong>{" "}
                        {formatTime(summary.firstInTime) || "N/A"}
                      </Typography>
                      <Typography variant="body2">
                        <strong>Last Out:</strong>{" "}
                        {summary.attendanceStatus === "morning_entry" || summary.attendanceStatus === "draft"
                          ? "Pending"
                          : formatTime(summary.lastOutTime) || "N/A"}
                      </Typography>
                    </Box>
                  </Box>

                  {/* Work Description */}
                  {(summary.workDescription || summary.comments) && (
                    <Box sx={{ mb: { xs: 2, sm: 3 } }}>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        Work Description
                      </Typography>
                      <Paper sx={{ p: { xs: 1.5, sm: 2 }, bgcolor: "action.hover" }}>
                        {summary.workDescription && (
                          <Typography variant="body2" sx={{ mb: 0.5, fontSize: { xs: '0.8rem', sm: '0.875rem' } }}>
                            {summary.workDescription}
                          </Typography>
                        )}
                        {summary.comments && (
                          <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: '0.8rem', sm: '0.875rem' } }}>
                            Comments: {summary.comments}
                          </Typography>
                        )}
                      </Paper>
                    </Box>
                  )}

                  {/* Work Updates Photos */}
                  {summary.workUpdates && (
                    <Box sx={{ mb: { xs: 2, sm: 3 } }}>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        Work Progress Photos
                      </Typography>
                      <Box sx={{ display: "flex", gap: { xs: 1, sm: 2 }, flexDirection: { xs: 'column', sm: 'row' } }}>
                        {/* Morning Photos */}
                        <Paper
                          variant="outlined"
                          sx={{
                            flex: 1,
                            p: { xs: 1, sm: 1.5 },
                            bgcolor: "warning.50",
                            borderColor: "warning.200"
                          }}
                        >
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                            <WbSunny sx={{ color: "warning.main", fontSize: 18 }} />
                            <Typography variant="caption" fontWeight={600} color="warning.dark">
                              Morning
                            </Typography>
                          </Box>
                          {summary.workUpdates.morning?.photos && summary.workUpdates.morning.photos.length > 0 ? (
                            <PhotoThumbnailStrip
                              photos={summary.workUpdates.morning.photos}
                              size="small"
                              maxVisible={3}
                              onPhotoClick={handleMorningSummaryPhotoClick}
                            />
                          ) : (
                            <Typography variant="caption" color="text.secondary">
                              No photos
                            </Typography>
                          )}
                        </Paper>

                        {/* Evening Photos */}
                        <Paper
                          variant="outlined"
                          sx={{
                            flex: 1,
                            p: { xs: 1, sm: 1.5 },
                            bgcolor: summary.workUpdates.evening ? "info.50" : "grey.100",
                            borderColor: summary.workUpdates.evening ? "info.200" : "grey.300"
                          }}
                        >
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                            <NightsStay sx={{ color: summary.workUpdates.evening ? "info.main" : "grey.400", fontSize: 18 }} />
                            <Typography variant="caption" fontWeight={600} color={summary.workUpdates.evening ? "info.dark" : "text.disabled"}>
                              Evening
                            </Typography>
                            {summary.workUpdates.evening && (
                              <Chip
                                label={`${summary.workUpdates.evening.completionPercent}%`}
                                size="small"
                                color={getProgressColor(summary.workUpdates.evening.completionPercent)}
                                sx={{ ml: 'auto', height: 20, '& .MuiChip-label': { px: 1 } }}
                              />
                            )}
                          </Box>
                          {summary.workUpdates.evening?.photos && summary.workUpdates.evening.photos.length > 0 ? (
                            <PhotoThumbnailStrip
                              photos={summary.workUpdates.evening.photos}
                              size="small"
                              maxVisible={3}
                              onPhotoClick={handleEveningSummaryPhotoClick}
                            />
                          ) : (
                            <Box sx={{ py: 1, textAlign: 'center' }}>
                              <Typography variant="caption" color="text.disabled">
                                {summary.workUpdates.evening ? "No photos" : "In Progress - Not yet updated"}
                              </Typography>
                            </Box>
                          )}
                        </Paper>
                      </Box>
                    </Box>
                  )}

                  {/* Laborers List */}
                  {summary.records.length > 0 && (
                    <Box sx={{ mb: { xs: 2, sm: 3 } }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Typography variant="subtitle2">
                          Laborers ({summary.records.length})
                        </Typography>
                        <IconButton
                          size="small"
                          onClick={() => setSummaryTableFullscreen(true)}
                          sx={{ display: { xs: 'flex', sm: 'none' } }}
                        >
                          <Fullscreen fontSize="small" />
                        </IconButton>
                      </Box>
                      <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: { xs: 300, sm: 'none' } }}>
                        <Table size="small" stickyHeader>
                          <TableHead>
                            <TableRow sx={{ bgcolor: "action.selected" }}>
                              <TableCell sx={{ fontWeight: 700, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                                Name
                              </TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: { xs: '0.75rem', sm: '0.875rem' }, display: { xs: 'none', sm: 'table-cell' } }}>
                                Type
                              </TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: { xs: '0.75rem', sm: '0.875rem' }, display: { xs: 'none', sm: 'table-cell' } }}>
                                Team
                              </TableCell>
                              <TableCell
                                align="center"
                                sx={{ fontWeight: 700, fontSize: { xs: '0.75rem', sm: '0.875rem' }, display: { xs: 'none', sm: 'table-cell' } }}
                              >
                                In
                              </TableCell>
                              <TableCell
                                align="center"
                                sx={{ fontWeight: 700, fontSize: { xs: '0.75rem', sm: '0.875rem' }, display: { xs: 'none', sm: 'table-cell' } }}
                              >
                                Out
                              </TableCell>
                              <TableCell
                                align="center"
                                sx={{ fontWeight: 700, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                              >
                                Days
                              </TableCell>
                              <TableCell align="right" sx={{ fontWeight: 700, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                                Earnings
                              </TableCell>
                              <TableCell
                                align="center"
                                sx={{ fontWeight: 700, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                              >
                                Status
                              </TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {summary.records.map((record) => (
                              <TableRow key={record.id}>
                                <TableCell sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>{record.laborer_name}</TableCell>
                                <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                                  <Chip
                                    label={
                                      record.laborer_type === "contract"
                                        ? "C"
                                        : "D"
                                    }
                                    size="small"
                                    color={
                                      record.laborer_type === "contract"
                                        ? "info"
                                        : "warning"
                                    }
                                    variant="outlined"
                                  />
                                </TableCell>
                                <TableCell sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, display: { xs: 'none', sm: 'table-cell' } }}>{record.team_name || "-"}</TableCell>
                                <TableCell align="center" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, display: { xs: 'none', sm: 'table-cell' } }}>
                                  {formatTime(record.in_time) || "-"}
                                </TableCell>
                                <TableCell align="center" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' }, display: { xs: 'none', sm: 'table-cell' } }}>
                                  {formatTime(record.out_time) || "-"}
                                </TableCell>
                                <TableCell align="center" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                                  {record.work_days}
                                </TableCell>
                                <TableCell align="right" sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                                  ₹{record.daily_earnings.toLocaleString()}
                                </TableCell>
                                <TableCell align="center">
                                  <Chip
                                    label={record.is_paid ? "Paid" : "Pending"}
                                    size="small"
                                    color={
                                      record.is_paid ? "success" : "warning"
                                    }
                                    variant={
                                      record.is_paid ? "filled" : "outlined"
                                    }
                                    sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' }, height: { xs: 20, sm: 24 } }}
                                  />
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </Box>
                  )}

                  {/* Market Laborers */}
                  {summary.marketLaborers &&
                    summary.marketLaborers.length > 0 && (
                      <Box sx={{ mb: 3 }}>
                        <Typography variant="subtitle2" sx={{ mb: 1 }}>
                          Market Laborers ({summary.marketLaborers.length})
                        </Typography>
                        <TableContainer component={Paper} variant="outlined">
                          <Table size="small">
                            <TableHead>
                              <TableRow sx={{ bgcolor: "secondary.50" }}>
                                <TableCell sx={{ fontWeight: 700 }}>
                                  Name
                                </TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>
                                  Role
                                </TableCell>
                                <TableCell
                                  align="center"
                                  sx={{ fontWeight: 700 }}
                                >
                                  In
                                </TableCell>
                                <TableCell
                                  align="center"
                                  sx={{ fontWeight: 700 }}
                                >
                                  Out
                                </TableCell>
                                <TableCell
                                  align="center"
                                  sx={{ fontWeight: 700 }}
                                >
                                  Days
                                </TableCell>
                                <TableCell
                                  align="right"
                                  sx={{ fontWeight: 700 }}
                                >
                                  Earnings
                                </TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {summary.marketLaborers.map((ml) => (
                                <TableRow key={ml.id}>
                                  <TableCell>{ml.tempName}</TableCell>
                                  <TableCell>
                                    <Chip
                                      label={ml.roleName}
                                      size="small"
                                      color="secondary"
                                      variant="outlined"
                                    />
                                  </TableCell>
                                  <TableCell align="center">
                                    {ml.inTime?.substring(0, 5) || "-"}
                                  </TableCell>
                                  <TableCell align="center">
                                    {ml.outTime?.substring(0, 5) || "-"}
                                  </TableCell>
                                  <TableCell align="center">
                                    {ml.dayUnits}
                                  </TableCell>
                                  <TableCell align="right">
                                    ₹{ml.dailyEarnings.toLocaleString()}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      </Box>
                    )}

                  {/* Tea Shop */}
                  {summary.teaShop && (
                    <Box>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        Tea Shop
                      </Typography>
                      <Paper sx={{ p: 2, bgcolor: "action.hover" }}>
                        <Box sx={{ display: "flex", gap: 3 }}>
                          <Typography variant="body2">
                            <strong>Tea:</strong> ₹
                            {summary.teaShop.teaTotal.toLocaleString()}
                          </Typography>
                          <Typography variant="body2">
                            <strong>Snacks:</strong> ₹
                            {summary.teaShop.snacksTotal.toLocaleString()}
                          </Typography>
                          <Typography variant="body2" fontWeight={700}>
                            <strong>Total:</strong> ₹
                            {summary.teaShop.total.toLocaleString()}
                          </Typography>
                        </Box>
                      </Paper>
                    </Box>
                  )}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                  <Button
                    onClick={() => setViewSummaryDate(null)}
                    variant="contained"
                  >
                    Close
                  </Button>
                </DialogActions>
              </>
            );
          })()}
      </Dialog>

      {/* Full-screen Table Dialog for Mobile */}
      <Dialog
        open={summaryTableFullscreen}
        onClose={() => setSummaryTableFullscreen(false)}
        fullScreen
        PaperProps={{
          sx: {
            '@media (max-width: 600px) and (orientation: portrait)': {
              transform: 'rotate(90deg)',
              transformOrigin: 'center center',
              width: '100vh',
              height: '100vw',
              maxWidth: 'none',
              maxHeight: 'none',
            }
          }
        }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1, px: 2 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            Laborers - {viewSummaryDate ? dayjs(viewSummaryDate).format("DD MMM YYYY") : ''}
          </Typography>
          <IconButton onClick={() => setSummaryTableFullscreen(false)} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          {viewSummaryDate && (() => {
            const summaryEntry = combinedDateEntries.find(
              (e) => e.type === "attendance" && e.date === viewSummaryDate
            );
            const summary = summaryEntry?.type === "attendance" ? summaryEntry.summary : null;
            if (!summary) return null;
            return (
              <TableContainer sx={{ height: '100%' }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.8rem' }}>Name</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.8rem' }}>Type</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.8rem' }}>Team</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>In</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>Out</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>Days</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>Earnings</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>Status</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {summary.records.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell sx={{ fontSize: '0.8rem' }}>{record.laborer_name}</TableCell>
                        <TableCell>
                          <Chip
                            label={record.laborer_type === "contract" ? "C" : "D"}
                            size="small"
                            color={record.laborer_type === "contract" ? "info" : "warning"}
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem' }}>{record.team_name || "-"}</TableCell>
                        <TableCell align="center" sx={{ fontSize: '0.8rem' }}>{formatTime(record.in_time) || "-"}</TableCell>
                        <TableCell align="center" sx={{ fontSize: '0.8rem' }}>{formatTime(record.out_time) || "-"}</TableCell>
                        <TableCell align="center" sx={{ fontSize: '0.8rem' }}>{record.work_days}</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.8rem' }}>₹{record.daily_earnings.toLocaleString()}</TableCell>
                        <TableCell align="center">
                          <Chip
                            label={record.is_paid ? "Paid" : "Pending"}
                            size="small"
                            color={record.is_paid ? "success" : "warning"}
                            variant={record.is_paid ? "filled" : "outlined"}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Photo Fullscreen Dialog for Summary */}
      <PhotoFullscreenDialog
        open={summaryPhotoFullscreen}
        onClose={() => setSummaryPhotoFullscreen(false)}
        photos={summaryFullscreenPhotos}
        initialIndex={summaryPhotoIndex}
        period={summaryPhotoPeriod}
      />

      {/* SpeedDial for Add Attendance - Click-only (not hover) */}
      {canEdit && (
        <SpeedDial
          ariaLabel="Add Attendance"
          open={speedDialOpen}
          onOpen={() => {}} // Disable hover open
          onClose={() => setSpeedDialOpen(false)}
          FabProps={{
            onClick: () => setSpeedDialOpen(!speedDialOpen),
          }}
          sx={{
            position: "fixed",
            bottom: { xs: 150, md: 90 },
            right: { xs: 16, md: 24 },
            "& .MuiFab-primary": {
              bgcolor: "primary.main",
              "&:hover": { bgcolor: "primary.dark" },
            },
          }}
          icon={<SpeedDialIcon openIcon={<CloseIcon />} />}
        >
          <SpeedDialAction
            icon={<WbSunny />}
            tooltipTitle="Start Day Attendance"
            tooltipOpen
            onClick={() => {
              setSpeedDialOpen(false);
              setSelectedDateForDrawer(undefined);
              setDrawerMode("morning");
              setDrawerOpen(true);
            }}
            sx={{
              "& .MuiSpeedDialAction-staticTooltipLabel": {
                whiteSpace: "nowrap",
                bgcolor: "warning.main",
                color: "warning.contrastText",
              },
            }}
          />
          <SpeedDialAction
            icon={<EventNote />}
            tooltipTitle="Full Day Attendance"
            tooltipOpen
            onClick={() => {
              setSpeedDialOpen(false);
              setSelectedDateForDrawer(undefined);
              setDrawerMode("full");
              setDrawerOpen(true);
            }}
            sx={{
              "& .MuiSpeedDialAction-staticTooltipLabel": {
                whiteSpace: "nowrap",
                bgcolor: "primary.main",
                color: "primary.contrastText",
              },
            }}
          />
          <SpeedDialAction
            icon={<HolidayIcon />}
            tooltipTitle={todayHoliday ? "Revoke Holiday" : "Mark as Holiday"}
            tooltipOpen
            onClick={() => {
              setSpeedDialOpen(false);
              handleHolidayClick();
            }}
            sx={{
              "& .MuiSpeedDialAction-staticTooltipLabel": {
                whiteSpace: "nowrap",
                bgcolor: todayHoliday ? "error.main" : "success.main",
                color: todayHoliday
                  ? "error.contrastText"
                  : "success.contrastText",
              },
            }}
          />
        </SpeedDial>
      )}

      {/* Holiday Confirm Dialog */}
      {selectedSite && (
        <HolidayConfirmDialog
          open={holidayDialogOpen}
          onClose={() => { setSelectedHolidayDate(null); setSelectedExistingHoliday(null); setHolidayDialogOpen(false); }}
          mode={holidayDialogMode}
          site={{ id: selectedSite.id, name: selectedSite.name }}
          existingHoliday={selectedExistingHoliday || todayHoliday}
          recentHolidays={recentHolidays}
          onSuccess={handleHolidaySuccess}
          date={selectedHolidayDate || undefined}
        />
      )}

      {/* Holiday Override Confirmation Dialog (for filling attendance on a holiday) */}
      <Dialog
        open={!!unfilledActionDialog?.isHoliday}
        onClose={() => setUnfilledActionDialog(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <WarningAmberIcon color="warning" />
          <Typography variant="h6" component="span">
            Date is Marked as Holiday
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>
            <strong>{unfilledActionDialog?.date ? dayjs(unfilledActionDialog.date).format("DD MMM YYYY (dddd)") : ""}</strong> is marked as a holiday.
          </Typography>
          <Alert severity="warning">
            Do you want to remove the holiday and fill attendance instead? This action will permanently delete the holiday record.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setUnfilledActionDialog(null)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={handleConfirmOverwriteHoliday}
            startIcon={<EditCalendarIcon />}
          >
            Remove Holiday & Fill Attendance
          </Button>
        </DialogActions>
      </Dialog>

      {/* Paid Record Protection Dialog */}
      <Dialog
        open={!!paidRecordDialog?.open}
        onClose={() => setPaidRecordDialog(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
          <WarningIcon color="warning" />
          <Typography variant="h6" component="span">
            Cannot {paidRecordDialog?.action === "edit" ? "Edit" : "Delete"} Paid{" "}
            {paidRecordDialog?.isBulk ? "Records" : "Record"}
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            {paidRecordDialog?.isBulk ? (
              <>
                This date has <strong>{paidRecordDialog?.paidCount}</strong> paid
                attendance record(s). Paid records cannot be deleted directly.
              </>
            ) : (
              "This attendance record has already been paid and settled."
            )}
          </Alert>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            To make changes to paid records:
          </Typography>
          <Box component="ol" sx={{ pl: 2, mb: 2, "& li": { mb: 1 } }}>
            <li>
              <Typography variant="body2">
                Go to the <strong>Salary Settlement</strong> page
              </Typography>
            </li>
            <li>
              <Typography variant="body2">
                Cancel the payment for this date
              </Typography>
            </li>
            <li>
              <Typography variant="body2">
                Return here to make your changes
              </Typography>
            </li>
            <li>
              <Typography variant="body2">
                Re-settle the payment when done
              </Typography>
            </li>
          </Box>
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
              <PaymentIcon />
            </Box>
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle2" fontWeight={600}>
                Salary Settlement Page
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Cancel the payment to unlock these records for editing
              </Typography>
            </Box>
            <ArrowForwardIcon color="action" />
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button onClick={() => setPaidRecordDialog(null)} variant="outlined">
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={() =>
              redirectToSalarySettlement(
                paidRecordDialog?.date || paidRecordDialog?.record?.date || ""
              )
            }
            endIcon={<ArrowForwardIcon />}
          >
            Go to Salary Settlement
          </Button>
        </DialogActions>
      </Dialog>

      {/* Restoration message snackbar */}
      <Snackbar
        open={!!restorationMessage}
        autoHideDuration={5000}
        onClose={() => setRestorationMessage(null)}
        message={restorationMessage}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />

      {/* Inspect Pane — opens in-place when a SettlementRefChip is clicked.
          No navigation; full attendance + settlement + audit context for the
          entity stays visible alongside the table. */}
      <InspectPane
        entity={pane.currentEntity}
        isOpen={pane.isOpen}
        isPinned={pane.isPinned}
        activeTab={pane.activeTab}
        onTabChange={pane.setActiveTab}
        onClose={pane.close}
        onTogglePin={pane.togglePin}
        onOpenInPage={(e: InspectEntity) => {
          const ref = e.settlementRef ?? "";
          const url =
            e.kind === "daily-date"
              ? `/site/payments?ref=${ref}&date=${e.date}`
              : `/site/payments?ref=${ref}`;
          router.push(url);
        }}
        onSettleClick={(e: InspectEntity) => {
          if (e.kind === "daily-date") {
            const summary = dateSummaries.find((d) => d.date === e.date);
            if (summary) openDailySettlementDialog(summary);
          }
          // Weekly settle from pane is currently a no-op — attendance file
          // does not surface per-laborer-week rows directly; users use the
          // weekly separator's Settle Week button.
        }}
      />
    </Box>
  );
}
