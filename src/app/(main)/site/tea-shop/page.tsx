"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Box,
  Button,
  Typography,
  Paper,
  Grid,
  TextField,
  Tabs,
  Tab,
  Alert,
  CircularProgress,
  Chip,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Fab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import {
  Add as AddIcon,
  Edit,
  Delete,
  Payment as PaymentIcon,
  LocalCafe,
  Fastfood,
  Settings,
  Warning as WarningIcon,
  Group as GroupIcon,
  CallSplit as SplitIcon,
  BeachAccess as BeachAccessIcon,
  EventBusy as NoEntryIcon,
  Visibility as ViewIcon,
  CheckCircle as CheckCircleIcon,
  Groups as GroupsIcon,
} from "@mui/icons-material";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useSite } from "@/contexts/SiteContext";
import { useAuth } from "@/contexts/AuthContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import PageHeader from "@/components/layout/PageHeader";
import { hasEditPermission } from "@/lib/permissions";
import TeaShopEntryDialog from "@/components/tea-shop/TeaShopEntryDialog";
import AuditAvatarGroup from "@/components/common/AuditAvatarGroup";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import TeaShopSettlementDialog from "@/components/tea-shop/TeaShopSettlementDialog";
import GroupTeaShopEntryDialog from "@/components/tea-shop/GroupTeaShopEntryDialog";
import GroupTeaShopSettlementDialog from "@/components/tea-shop/GroupTeaShopSettlementDialog";
import type { Database } from "@/types/database.types";

type TeaShopAccount = Database["public"]["Tables"]["tea_shop_accounts"]["Row"];
type TeaShopEntry = Database["public"]["Tables"]["tea_shop_entries"]["Row"];
type TeaShopSettlement = Database["public"]["Tables"]["tea_shop_settlements"]["Row"];
type SiteHoliday = Database["public"]["Tables"]["site_holidays"]["Row"];

// Extended types - these might not exist in database.types
interface TeaShopEntryExtended extends TeaShopEntry {
  // Add any extended fields here
}
interface TeaShopGroupEntryWithAllocations {
  // Add fields here
}
import type { SiteGroupWithSites } from "@/types/material.types";
import {
  useGroupTeaShopAccount,
  useGroupTeaShopEntries,
  useGroupTeaShopPendingBalance,
  useGroupTeaShopSettlements,
  useDeleteGroupTeaShopSettlement,
} from "@/hooks/queries/useGroupTeaShop";
import { useSiteGroup } from "@/hooks/queries/useSiteGroups";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCombinedTeaShopEntries,
  useCombinedTeaShopPendingBalance,
  useCombinedTeaShopSettlements,
  type CombinedTeaShopEntry,
} from "@/hooks/queries/useCombinedTeaShop";
import { queryKeys } from "@/lib/cache/keys";
import {
  useTeaShopForSite,
  type CompanyTeaShop,
} from "@/hooks/queries/useCompanyTeaShops";

// Types for combined entries view
type CombinedEntryType =
  | { type: "entry"; date: string; entry: TeaShopEntry; siteName?: string; source?: "individual" | "group" }
  | { type: "holiday"; date: string; holiday: SiteHoliday }
  | { type: "no_entry"; date: string; attendanceCount: { named: number; market: number } };
import dayjs from "dayjs";

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div hidden={value !== index} {...other}>
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  );
}

export default function TeaShopPage() {
  const { selectedSite } = useSite();
  const { userProfile } = useAuth();
  const { formatForApi, isAllTime } = useDateRange();
  const supabase = createClient();
  const router = useRouter();
  const queryClient = useQueryClient();
  const deleteGroupSettlement = useDeleteGroupTeaShopSettlement();

  const { dateFrom, dateTo } = formatForApi();

  const [loading, setLoading] = useState(false);
  const [tabValue, setTabValue] = useState(0);

  // Data states
  const [shop, setShop] = useState<TeaShopAccount | null>(null);
  const [entries, setEntries] = useState<TeaShopEntry[]>([]);
  const [settlements, setSettlements] = useState<TeaShopSettlement[]>([]);
  const [attendanceByDate, setAttendanceByDate] = useState<Map<string, { named: number; market: number }>>(new Map());
  const [holidays, setHolidays] = useState<SiteHoliday[]>([]);
  const [initialEntryDate, setInitialEntryDate] = useState<string | undefined>(undefined);

  // Dialog states
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [settlementDialogOpen, setSettlementDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TeaShopEntry | null>(null);
  const [editingSettlement, setEditingSettlement] = useState<TeaShopSettlement | null>(null);

  // Delete confirmation dialog state
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    settlementId: string | null;
    source: "individual" | "group" | null;
  }>({ open: false, settlementId: null, source: null });
  const [isDeleting, setIsDeleting] = useState(false);

  // Legacy group mode state (for backward compat dialogs)
  const [editingGroupEntry, setEditingGroupEntry] = useState<TeaShopGroupEntryWithAllocations | null>(null);

  // Check if site is in a group - AUTO-DETECT group mode
  const siteGroupId = selectedSite?.site_group_id as string | undefined;
  const isInGroup = !!siteGroupId;
  const { data: siteGroup } = useSiteGroup(siteGroupId);

  // NEW: Get company tea shop for this site (checks direct assignment first, then group assignment)
  const { data: companyTeaShop, isLoading: loadingCompanyTeaShop } = useTeaShopForSite(selectedSite?.id);

  // Combined tea shop data (fetched when site is in a group)
  // Always filter by the selected site to show only that site's entries
  // For group entries, this shows the allocated amount for this site
  const effectiveFilterBySiteId = useMemo(() => {
    // Always filter by the selected site's ID
    return selectedSite?.id;
  }, [selectedSite?.id]);

  const { data: combinedEntriesData } = useCombinedTeaShopEntries(
    isInGroup ? siteGroupId : undefined,
    {
      filterBySiteId: effectiveFilterBySiteId,
      dateFrom: isAllTime ? undefined : dateFrom ?? undefined,
      dateTo: isAllTime ? undefined : dateTo ?? undefined,
    }
  );
  const { data: combinedPendingData } = useCombinedTeaShopPendingBalance(isInGroup ? siteGroupId : undefined);
  const { data: combinedSettlementsData } = useCombinedTeaShopSettlements(isInGroup ? siteGroupId : undefined);

  const combinedPendingBalance = combinedPendingData?.pending || 0;

  // Legacy group tea shop hooks (for backward compat with existing group shop)
  const { data: groupShop } = useGroupTeaShopAccount(isInGroup ? siteGroupId : undefined);
  const { data: groupEntries } = useGroupTeaShopEntries(isInGroup ? siteGroupId : undefined);
  const { data: groupPendingData } = useGroupTeaShopPendingBalance(isInGroup ? siteGroupId : undefined);
  const { data: groupSettlements } = useGroupTeaShopSettlements(isInGroup ? siteGroupId : undefined);

  const canEdit = hasEditPermission(userProfile?.role);

  // Calculate summary stats
  const stats = useMemo(() => {
    // Use combined data when site is in a group
    if (isInGroup && combinedEntriesData) {
      const weekStart = dayjs().startOf("week").format("YYYY-MM-DD");
      const monthStart = dayjs().startOf("month").format("YYYY-MM-DD");

      // Filter entries by site when effectiveFilterBySiteId is set
      let entriesToCalc = combinedEntriesData;
      if (effectiveFilterBySiteId) {
        entriesToCalc = combinedEntriesData.filter(
          (e) => e.site_id === effectiveFilterBySiteId
        );
      }

      // Use display_amount for allocated amounts in group entries
      // NOTE: Use !== undefined check because display_amount can be 0 for unfilled dates
      const getAmount = (e: any) => e.display_amount !== undefined ? e.display_amount : e.total_amount || 0;

      const thisWeekTotal = entriesToCalc
        .filter((e) => e.date >= weekStart)
        .reduce((sum, e) => sum + getAmount(e), 0);

      const thisMonthTotal = entriesToCalc
        .filter((e) => e.date >= monthStart)
        .reduce((sum, e) => sum + getAmount(e), 0);

      const totalTea = entriesToCalc.reduce((sum, e) => sum + (e.tea_total || 0), 0);
      const totalSnacks = entriesToCalc.reduce((sum, e) => sum + (e.snacks_total || 0), 0);

      // Calculate pending balance from filtered entries (site-specific when filtered)
      const allEntriesTotal = entriesToCalc.reduce(
        (sum, e) => sum + getAmount(e), 0
      );
      // For group entries filtered by site, amount_paid is already the per-allocation value
      // (set by useCombinedTeaShopEntries from tea_shop_entry_allocations.amount_paid)
      // So we don't need to apply any ratio calculation - just sum directly
      const allPaidTotal = entriesToCalc.reduce((sum, e) => {
        const entryAny = e as any;
        return sum + (entryAny.amount_paid || 0);
      }, 0);

      // Calculate pending and overpaid amounts
      const pendingBalance = Math.max(0, Math.round(allEntriesTotal - allPaidTotal));
      const overpaidAmount = Math.max(0, Math.round(allPaidTotal - allEntriesTotal));

      // Filter settlements by site when effectiveFilterBySiteId is set
      let settlementsToCalc = combinedSettlementsData || [];
      if (effectiveFilterBySiteId) {
        settlementsToCalc = settlementsToCalc.filter(
          (s: any) => s.site_id === effectiveFilterBySiteId
        );
      }

      const lastSettlement = settlementsToCalc.length > 0
        ? settlementsToCalc.reduce((latest, s) =>
            new Date(s.payment_date) > new Date(latest.payment_date) ? s : latest
          )
        : null;

      // Total paid from settlements (actual money paid to shop) - site-specific when filtered
      const totalPaid = settlementsToCalc.reduce(
        (sum, s) => sum + (s.amount_paid || 0), 0
      );

      // Recalculate pending and overpaid using site-specific settlements
      // This is more accurate than using entries' amount_paid field
      const pendingFromSettlements = Math.max(0, Math.round(allEntriesTotal - totalPaid));
      const overpaidFromSettlements = Math.max(0, Math.round(totalPaid - allEntriesTotal));

      return {
        totalEntries: allEntriesTotal,
        totalAllTime: allEntriesTotal,
        totalTea,
        totalSnacks,
        pendingBalance: pendingFromSettlements,
        overpaidAmount: overpaidFromSettlements,
        thisWeekTotal,
        thisMonthTotal,
        lastSettlement,
        totalPaid,
      };
    }

    // Site-specific stats (when not in a group)
    const filteredEntries = isAllTime
      ? entries
      : entries.filter(
          (e) => dateFrom && dateTo && e.date >= dateFrom && e.date <= dateTo
        );

    const totalEntries = filteredEntries.reduce((sum, e) => sum + (e.total_amount || 0), 0);
    const totalTea = filteredEntries.reduce((sum, e) => sum + (e.tea_total || 0), 0);
    const totalSnacks = filteredEntries.reduce((sum, e) => sum + (e.snacks_total || 0), 0);

    // Calculate total all time (unfiltered)
    const totalAllTime = entries.reduce((sum, e) => sum + (e.total_amount || 0), 0);

    // Calculate pending balance (all entries minus all settlements)
    const allEntriesTotal = entries.reduce((sum, e) => sum + (e.total_amount || 0), 0);
    const allSettledTotal = settlements.reduce((sum, s) => sum + (s.amount_paid || 0), 0);
    const pendingBalance = Math.max(0, allEntriesTotal - allSettledTotal);
    const overpaidAmount = Math.max(0, allSettledTotal - allEntriesTotal);

    // This week
    const weekStart = dayjs().startOf("week").format("YYYY-MM-DD");
    const thisWeekTotal = entries
      .filter((e) => e.date >= weekStart)
      .reduce((sum, e) => sum + (e.total_amount || 0), 0);

    // This month
    const monthStart = dayjs().startOf("month").format("YYYY-MM-DD");
    const thisMonthTotal = entries
      .filter((e) => e.date >= monthStart)
      .reduce((sum, e) => sum + (e.total_amount || 0), 0);

    // Last payment
    const lastSettlement = settlements.length > 0
      ? settlements.reduce((latest, s) =>
          new Date(s.payment_date) > new Date(latest.payment_date) ? s : latest
        )
      : null;

    // Total paid from settlements (actual money paid to shop)
    // allSettledTotal was already calculated above at line 249
    const totalPaid = allSettledTotal;

    return {
      totalEntries,
      totalAllTime,
      totalTea,
      totalSnacks,
      pendingBalance,
      overpaidAmount,
      thisWeekTotal,
      thisMonthTotal,
      lastSettlement,
      totalPaid,
    };
  }, [entries, settlements, dateFrom, dateTo, isAllTime, isInGroup, combinedEntriesData, combinedSettlementsData, combinedPendingBalance, effectiveFilterBySiteId]);

  const fetchData = async () => {
    if (!selectedSite) return;

    setLoading(true);
    try {
      // For "All Time", don't apply date filtering; otherwise use selected date range
      const shouldFilterByDate = !isAllTime && dateFrom && dateTo;
      const fetchDateFrom = shouldFilterByDate ? dateFrom : null;
      const fetchDateTo = shouldFilterByDate ? dateTo : null;

      // Fetch shop for this site
      const { data: shopData } = await (supabase
        .from("tea_shop_accounts") as any)
        .select("*")
        .eq("site_id", selectedSite.id)
        .eq("is_active", true)
        .single();

      const typedShopData = shopData as TeaShopAccount | null;
      setShop(typedShopData);

      // Fetch holidays for this site (filter by date range if specified)
      let holidaysQuery = (supabase
        .from("site_holidays") as any)
        .select("*")
        .eq("site_id", selectedSite.id)
        .order("date", { ascending: false });

      if (fetchDateFrom && fetchDateTo) {
        holidaysQuery = holidaysQuery
          .gte("date", fetchDateFrom)
          .lte("date", fetchDateTo);
      }
      const { data: holidaysData } = await holidaysQuery;

      setHolidays((holidaysData || []) as SiteHoliday[]);

      // Fetch attendance for all dates (to detect missing entries)
      // Only filter by date range if not "All Time"
      let attendanceQuery = (supabase
        .from("daily_attendance") as any)
        .select("date")
        .eq("site_id", selectedSite.id);

      if (fetchDateFrom && fetchDateTo) {
        attendanceQuery = attendanceQuery
          .gte("date", fetchDateFrom)
          .lte("date", fetchDateTo);
      }
      const { data: attendanceData } = await attendanceQuery;

      let marketQuery = (supabase
        .from("market_laborer_attendance") as any)
        .select("date, count")
        .eq("site_id", selectedSite.id);

      if (fetchDateFrom && fetchDateTo) {
        marketQuery = marketQuery
          .gte("date", fetchDateFrom)
          .lte("date", fetchDateTo);
      }
      const { data: marketData } = await marketQuery;

      // Build attendance map
      const attMap = new Map<string, { named: number; market: number }>();

      // Count named laborers per date
      const namedCounts = new Map<string, number>();
      (attendanceData || []).forEach((a: any) => {
        namedCounts.set(a.date, (namedCounts.get(a.date) || 0) + 1);
      });

      // Count market laborers per date
      const marketCounts = new Map<string, number>();
      (marketData || []).forEach((m: any) => {
        marketCounts.set(m.date, (marketCounts.get(m.date) || 0) + (m.count || 0));
      });

      // All dates that have attendance
      const allAttDates = new Set([...namedCounts.keys(), ...marketCounts.keys()]);
      allAttDates.forEach((date) => {
        attMap.set(date, {
          named: namedCounts.get(date) || 0,
          market: marketCounts.get(date) || 0,
        });
      });

      setAttendanceByDate(attMap);

      if (typedShopData) {
        // Fetch entries
        const { data: entriesData } = await (supabase
          .from("tea_shop_entries") as any)
          .select("*")
          .eq("tea_shop_id", typedShopData.id)
          .order("date", { ascending: false });

        setEntries((entriesData || []) as TeaShopEntry[]);

        // Fetch settlements with subcontract info
        const { data: settlementsData } = await (supabase
          .from("tea_shop_settlements") as any)
          .select("*, subcontracts(id, title)")
          .eq("tea_shop_id", typedShopData.id)
          .order("payment_date", { ascending: false });

        setSettlements((settlementsData || []) as TeaShopSettlement[]);
      } else {
        setEntries([]);
        setSettlements([]);
      }
    } catch (error: any) {
      console.error("Error fetching tea shop data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedSite, dateFrom, dateTo, isAllTime]);

  const handleDeleteEntry = async (id: string) => {
    if (!confirm("Are you sure you want to delete this entry?")) return;

    try {
      const { error } = await supabase.from("tea_shop_entries").delete().eq("id", id);
      if (error) throw error;
      fetchData();
    } catch (error: any) {
      alert("Failed to delete: " + error.message);
    }
  };

  const handleDeleteSettlement = (settlementId: string, source?: string) => {
    setDeleteConfirm({
      open: true,
      settlementId,
      source: (source === "group" ? "group" : "individual") as "individual" | "group",
    });
  };

  const confirmDeleteSettlement = async () => {
    if (!deleteConfirm.settlementId) return;
    setIsDeleting(true);

    try {
      if (deleteConfirm.source === "group" && siteGroupId) {
        await deleteGroupSettlement.mutateAsync({
          id: deleteConfirm.settlementId,
          siteGroupId,
        });
      } else {
        const { error } = await supabase
          .from("tea_shop_settlements")
          .delete()
          .eq("id", deleteConfirm.settlementId);
        if (error) throw error;
      }

      // Invalidate combined queries if in group mode
      if (siteGroupId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.combinedTeaShop.settlements(siteGroupId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.combinedTeaShop.entries(siteGroupId),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.combinedTeaShop.pending(siteGroupId),
        });
      }

      fetchData();
      setDeleteConfirm({ open: false, settlementId: null, source: null });
    } catch (error: any) {
      alert("Failed to delete settlement: " + error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEditSettlement = (settlement: TeaShopSettlement) => {
    setEditingSettlement(settlement);
    setSettlementDialogOpen(true);
  };

  const filteredEntries = isAllTime
    ? entries
    : entries.filter(
        (e) => dateFrom && dateTo && e.date >= dateFrom && e.date <= dateTo
      );

  // Create combined entries view with holidays and missing entries
  const combinedEntries = useMemo((): CombinedEntryType[] => {
    // Use combined data when in a group
    let entriesToUse = isInGroup && combinedEntriesData
      ? combinedEntriesData
      : filteredEntries;

    // SAFEGUARD: Apply strict page-level filtering for grouped sites
    // Only show entries that belong to the selected site OR are group entries
    // Group entries have site_id = null but the hook already filters them to include
    // only entries with allocations for the selected site
    if (isInGroup && combinedEntriesData && effectiveFilterBySiteId) {
      entriesToUse = combinedEntriesData.filter((entry) =>
        entry.site_id === effectiveFilterBySiteId || (entry as any).isGroupEntry === true
      );
    }

    // Apply date filtering for grouped sites (non-group sites already have filteredEntries)
    if (isInGroup && !isAllTime && dateFrom && dateTo) {
      entriesToUse = entriesToUse.filter((e) => e.date >= dateFrom && e.date <= dateTo);
    }

    // WATERFALL CALCULATION: Apply total paid amount to entries (oldest first)
    // This ensures the "Paid" column reflects actual settlement waterfall
    const getAmount = (e: any) => e.display_amount !== undefined ? e.display_amount : e.total_amount || 0;

    // Sort entries by date ascending for waterfall calculation
    const sortedForWaterfall = [...entriesToUse].sort((a, b) => a.date.localeCompare(b.date));

    // Apply waterfall: allocate totalPaid to oldest entries first
    let remainingPaid = stats.totalPaid || 0;
    const waterfallMap = new Map<string, { waterfallPaid: number; waterfallFullyPaid: boolean }>();

    for (const entry of sortedForWaterfall) {
      const entryAmount = getAmount(entry);
      const allocatedToEntry = Math.min(remainingPaid, entryAmount);
      waterfallMap.set(entry.id, {
        waterfallPaid: allocatedToEntry,
        waterfallFullyPaid: allocatedToEntry >= entryAmount && entryAmount > 0,
      });
      remainingPaid -= allocatedToEntry;
    }

    const entryDates = new Set(entriesToUse.map((e) => e.date));
    const holidayDates = new Set(holidays.map((h) => (h as any).date));
    const result: CombinedEntryType[] = [];

    // Add actual entries with waterfall-calculated paid status
    entriesToUse.forEach((entry) => {
      const combinedEntry = entry as CombinedTeaShopEntry;
      const waterfall = waterfallMap.get(entry.id);

      // Create entry with waterfall-calculated paid status for grouped sites
      const entryWithWaterfall = isInGroup && effectiveFilterBySiteId && waterfall
        ? {
            ...entry,
            amount_paid: waterfall.waterfallPaid,
            is_fully_paid: waterfall.waterfallFullyPaid,
          }
        : entry;

      result.push({
        type: "entry",
        date: entry.date,
        entry: entryWithWaterfall,
        siteName: combinedEntry.site_name,
        source: combinedEntry.source,
      });
    });

    // Add holidays that don't have entries (within date filter) - only for non-grouped mode
    if (!isInGroup) {
      holidays.forEach((holiday) => {
        const hDate = (holiday as any).date;
        const inRange = isAllTime || (dateFrom && dateTo && hDate >= dateFrom && hDate <= dateTo);
        if (inRange && !entryDates.has(hDate)) {
          result.push({ type: "holiday", date: hDate, holiday });
        }
      });

      // Add "no entry" rows for dates with attendance but no T&S entry (and not a holiday)
      attendanceByDate.forEach((att, date) => {
        const inRange = isAllTime || (dateFrom && dateTo && date >= dateFrom && date <= dateTo);
        const hasWorkers = att.named > 0 || att.market > 0;

        if (inRange && hasWorkers && !entryDates.has(date) && !holidayDates.has(date)) {
          result.push({ type: "no_entry", date, attendanceCount: att });
        }
      });
    }

    // Sort by date descending
    return result.sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredEntries, holidays, attendanceByDate, dateFrom, dateTo, isAllTime, isInGroup, combinedEntriesData, effectiveFilterBySiteId, stats.totalPaid]);

  // Calculate table-specific stats (date-filtered) for display in table header
  const tableStats = useMemo(() => {
    // combinedEntries is already date-filtered
    const entryItems = combinedEntries.filter(item => item.type === "entry");

    const totalTea = entryItems.reduce((sum, item) => {
      const entry = item.entry as any;
      return sum + (entry.tea_total || 0);
    }, 0);

    const totalSnacks = entryItems.reduce((sum, item) => {
      const entry = item.entry as any;
      return sum + (entry.snacks_total || 0);
    }, 0);

    const totalAmount = entryItems.reduce((sum, item) => {
      const entry = item.entry as any;
      return sum + (entry.display_amount !== undefined ? entry.display_amount : entry.total_amount || 0);
    }, 0);

    return { totalTea, totalSnacks, totalAmount, recordCount: entryItems.length };
  }, [combinedEntries]);

  // Filter settlements by site when in group mode
  const filteredSettlements = useMemo(() => {
    if (!isInGroup) return settlements;
    if (!combinedSettlementsData) return [];
    if (!effectiveFilterBySiteId) return combinedSettlementsData;

    // Filter settlements by site_id, but keep group settlements (source === "group")
    return combinedSettlementsData.filter((s: any) =>
      s.site_id === effectiveFilterBySiteId || s.source === "group"
    );
  }, [isInGroup, settlements, combinedSettlementsData, effectiveFilterBySiteId]);

  if (!selectedSite) {
    return (
      <Box>
        <PageHeader title="T&S Settlement" />
        <Alert severity="warning">Please select a site to view T&S settlement</Alert>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <PageHeader
        title="T&S Settlement"
        subtitle={
          companyTeaShop
            ? isInGroup
              ? `${companyTeaShop.name} - ${siteGroup?.sites?.length || 0} sites`
              : companyTeaShop.name
            : shop
            ? isInGroup
              ? `${shop.shop_name} - Group: ${siteGroup?.name || ""}`
              : shop.shop_name
            : "No shop configured"
        }
        actions={
          <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
            {/* Group indicator (no toggle - automatic grouping) */}
            {isInGroup && (
              <Tooltip title={`Grouped with ${siteGroup?.sites?.length || 0} sites`}>
                <Chip
                  icon={<GroupsIcon fontSize="small" />}
                  label={`${siteGroup?.sites?.length || 0} sites`}
                  size="small"
                  color="secondary"
                  variant="outlined"
                  sx={{ mr: 1, display: { xs: 'none', sm: 'flex' } }}
                />
              </Tooltip>
            )}
            {/* Desktop buttons - hidden on mobile via CSS */}
            <Box sx={{ display: { xs: 'none', sm: 'flex' }, gap: 0.5 }}>
              {(shop || companyTeaShop) && (
                <>
                  <Button
                    variant="contained"
                    color="primary"
                    startIcon={<AddIcon />}
                    onClick={() => {
                      setEditingEntry(null);
                      setEntryDialogOpen(true);
                    }}
                    disabled={!canEdit}
                    size="small"
                  >
                    Add Entry
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<PaymentIcon />}
                    onClick={() => setSettlementDialogOpen(true)}
                    disabled={!canEdit}
                    size="small"
                  >
                    Pay Shop
                  </Button>
                </>
              )}
            </Box>
            <IconButton onClick={() => setConfigDialogOpen(true)} size="small">
              <Settings />
            </IconButton>
          </Box>
        }
      />

      {/* Summary Cards - All Time Stats */}
      <Box sx={{ mb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Chip
          label="All Time Stats"
          size="small"
          color="info"
          variant="outlined"
          sx={{ fontSize: '0.65rem', height: 20 }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
          (not affected by date filter)
        </Typography>
      </Box>
      <Grid container spacing={{ xs: 1, sm: 2 }} sx={{ mb: { xs: 2, sm: 3 } }}>
        <Grid size={{ xs: 6, sm: 'grow' }}>
          <Paper sx={{ p: { xs: 1, sm: 2 }, textAlign: "center", bgcolor: stats.pendingBalance > 0 ? "error.50" : "success.50" }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
              Pending
            </Typography>
            <Typography
              variant="h6"
              fontWeight={700}
              color={stats.pendingBalance > 0 ? "error.main" : "success.main"}
              sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}
            >
              ₹{stats.pendingBalance.toLocaleString()}
            </Typography>
          </Paper>
        </Grid>
        {/* Extra Paid Card - only show when overpaid */}
        {stats.overpaidAmount > 0 && (
          <Grid size={{ xs: 6, sm: 'grow' }}>
            <Paper sx={{ p: { xs: 1, sm: 2 }, textAlign: "center", bgcolor: "info.50" }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
                Extra Paid
              </Typography>
              <Typography
                variant="h6"
                fontWeight={700}
                color="info.main"
                sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}
              >
                ₹{stats.overpaidAmount.toLocaleString()}
              </Typography>
            </Paper>
          </Grid>
        )}
        <Grid size={{ xs: 6, sm: 'grow' }}>
          <Paper sx={{ p: { xs: 1, sm: 2 }, textAlign: "center" }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
              Total Spent
            </Typography>
            <Typography
              variant="h6"
              fontWeight={700}
              color="primary.main"
              sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}
            >
              ₹{(stats.totalAllTime || 0).toLocaleString()}
            </Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 6, sm: 'grow' }}>
          <Paper sx={{ p: { xs: 1, sm: 2 }, textAlign: "center", bgcolor: "success.50" }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
              Total Paid
            </Typography>
            <Typography
              variant="h6"
              fontWeight={700}
              color="success.main"
              sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}
            >
              ₹{(stats.totalPaid || 0).toLocaleString()}
            </Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 4, sm: 'grow' }}>
          <Paper sx={{ p: { xs: 1, sm: 2 }, textAlign: "center" }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
              This Week
            </Typography>
            <Typography
              variant="h6"
              fontWeight={700}
              color="text.primary"
              sx={{ fontSize: { xs: '0.875rem', sm: '1.25rem' } }}
            >
              ₹{stats.thisWeekTotal.toLocaleString()}
            </Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 4, sm: 'grow' }}>
          <Paper sx={{ p: { xs: 1, sm: 2 }, textAlign: "center" }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
              This Month
            </Typography>
            <Typography
              variant="h6"
              fontWeight={700}
              color="text.primary"
              sx={{ fontSize: { xs: '0.875rem', sm: '1.25rem' } }}
            >
              ₹{stats.thisMonthTotal.toLocaleString()}
            </Typography>
          </Paper>
        </Grid>
        <Grid size={{ xs: 4, sm: 'grow' }}>
          <Paper sx={{ p: { xs: 1, sm: 2 }, textAlign: "center" }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}>
              Last Pay
            </Typography>
            <Typography
              variant="body1"
              fontWeight={600}
              sx={{ fontSize: { xs: '0.75rem', sm: '1rem' } }}
            >
              {stats.lastSettlement
                ? `₹${stats.lastSettlement.amount_paid.toLocaleString()}`
                : "None"}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: { xs: 'none', sm: 'block' }, fontSize: '0.65rem' }}
            >
              {stats.lastSettlement
                ? dayjs(stats.lastSettlement.payment_date).format("DD MMM")
                : "-"}
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Overpaid Alert - show if there's overpaid amount */}
      {stats.overpaidAmount > 0 && (
        <Alert severity="info" sx={{ mb: 2 }}>
          <strong>Credit Available:</strong> ₹{stats.overpaidAmount.toLocaleString()} extra has been paid. This will automatically apply to future entries.
        </Alert>
      )}

      {/* No Shop Alert */}
      {!shop && !companyTeaShop && !loading && !loadingCompanyTeaShop && (
        <Alert
          severity="info"
          action={
            <Button color="inherit" size="small" onClick={() => router.push('/company/tea-shops')}>
              Add Shop
            </Button>
          }
        >
          {isInGroup
            ? `No tea shop configured for this site group. Go to Company → Tea Shops to assign one.`
            : "No tea shop configured for this site. Go to Company → Tea Shops to assign one."}
        </Alert>
      )}

      {/* Company Tea Shop Info Banner - show when using new company tea shop */}
      {companyTeaShop && isInGroup && siteGroup && (
        <Alert
          severity="success"
          icon={<GroupsIcon />}
          sx={{ mb: 2 }}
        >
          <Typography variant="body2">
            <strong>Grouped Sites:</strong> {siteGroup.sites?.map((s: any) => s.name).join(", ")}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Tea shop costs are split based on day units across all sites. Filtered to show only {selectedSite?.name}.
          </Typography>
        </Alert>
      )}

      {/* Legacy Group Info Banner - show when in group with old shop model */}
      {isInGroup && shop && !companyTeaShop && siteGroup && (
        <Alert
          severity="info"
          icon={<GroupsIcon />}
          sx={{ mb: 2 }}
        >
          <Typography variant="body2">
            <strong>Grouped Sites:</strong> {siteGroup.sites?.map((s: any) => s.name).join(", ")}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Showing tea shop data for {selectedSite?.name} only
          </Typography>
        </Alert>
      )}

      {/* Tabs */}
      {(shop || companyTeaShop) && (
        <Paper sx={{ borderRadius: 2 }}>
          <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} sx={{ borderBottom: 1, borderColor: "divider" }}>
            <Tab label="Entries" icon={<LocalCafe />} iconPosition="start" />
            <Tab label="Settlements" icon={<PaymentIcon />} iconPosition="start" />
          </Tabs>

          {/* Entries Tab */}
          <TabPanel value={tabValue} index={0}>
            {/* Summary Chips */}
            <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
              <Chip
                label={`${tableStats.recordCount} records`}
                size="small"
                variant="outlined"
                sx={{ fontWeight: 500 }}
              />
              <Box sx={{ display: { xs: 'none', sm: 'flex' }, gap: 1, alignItems: "center" }}>
                <Chip
                  icon={<LocalCafe />}
                  label={`Tea: ₹${tableStats.totalTea.toLocaleString()}`}
                  variant="outlined"
                  color="primary"
                />
                <Chip
                  icon={<Fastfood />}
                  label={`Snacks: ₹${tableStats.totalSnacks.toLocaleString()}`}
                  variant="outlined"
                  color="secondary"
                />
                <Chip
                  label={`Total: ₹${tableStats.totalAmount.toLocaleString()}`}
                  color="primary"
                />
              </Box>
            </Box>

            {/* Entries Table - Simplified columns: Date, Att, T&S, By, Actions */}
            {loading ? (
              <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
                <CircularProgress />
              </Box>
            ) : (
              <TableContainer sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <Table size="small" sx={{ minWidth: 400 }}>
                  <TableHead>
                    <TableRow sx={{ bgcolor: "action.selected" }}>
                      <TableCell sx={{
                        fontWeight: 700,
                        position: 'sticky',
                        left: 0,
                        bgcolor: 'grey.100',
                        zIndex: 1,
                        fontSize: { xs: '0.7rem', sm: '0.875rem' },
                      }}>Date</TableCell>
                      {isInGroup && (
                        <TableCell sx={{ fontWeight: 700, fontSize: { xs: '0.7rem', sm: '0.875rem' } }}>Site</TableCell>
                      )}
                      <TableCell sx={{ fontWeight: 700, fontSize: { xs: '0.7rem', sm: '0.875rem' } }} align="center">Att</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: { xs: '0.7rem', sm: '0.875rem' } }} align="right">T&S</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: { xs: '0.7rem', sm: '0.875rem' } }} align="center">Paid</TableCell>
                      <TableCell sx={{ fontWeight: 700, display: { xs: 'none', md: 'table-cell' } }} align="center">By</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: { xs: '0.7rem', sm: '0.875rem' } }} align="center">Act</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {combinedEntries.map((item, idx) => {
                      // Holiday row
                      if (item.type === "holiday") {
                        return (
                          <TableRow key={`holiday-${item.date}`} sx={{ bgcolor: "warning.50" }}>
                            <TableCell
                              colSpan={isInGroup ? 7 : 6}
                              sx={{
                                py: 1.5,
                                borderLeft: 4,
                                borderLeftColor: "warning.main",
                              }}
                            >
                              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
                                <BeachAccessIcon sx={{ color: "warning.main", fontSize: 24 }} />
                                <Typography variant="body2" fontWeight={600}>
                                  {dayjs(item.date).format("DD MMM")}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {dayjs(item.date).format("dddd")}
                                </Typography>
                                <Chip label="Holiday" size="small" color="warning" sx={{ fontWeight: 600 }} />
                                <Typography variant="body2" color="text.secondary">
                                  {item.holiday.reason || "Holiday"}
                                </Typography>
                              </Box>
                            </TableCell>
                          </TableRow>
                        );
                      }

                      // No entry row (workers present but no T&S recorded)
                      if (item.type === "no_entry") {
                        const totalWorkers = item.attendanceCount.named + item.attendanceCount.market;
                        return (
                          <TableRow key={`no-entry-${item.date}`} sx={{ bgcolor: "grey.50" }}>
                            <TableCell
                              colSpan={isInGroup ? 7 : 6}
                              sx={{
                                py: 1.5,
                                borderLeft: 4,
                                borderLeftColor: "grey.400",
                              }}
                            >
                              <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
                                <NoEntryIcon sx={{ color: "text.disabled", fontSize: 24 }} />
                                <Typography variant="body2" fontWeight={600}>
                                  {dayjs(item.date).format("DD MMM")}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {dayjs(item.date).format("dddd")}
                                </Typography>
                                <Chip
                                  label="No Entry"
                                  size="small"
                                  variant="outlined"
                                  color="default"
                                  sx={{ fontWeight: 600 }}
                                />
                                <Typography variant="caption" color="text.secondary">
                                  {totalWorkers} worker{totalWorkers !== 1 ? "s" : ""} present
                                </Typography>
                                {canEdit && (
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    startIcon={<AddIcon />}
                                    onClick={() => {
                                      setEditingEntry(null);
                                      setInitialEntryDate(item.date);
                                      setEntryDialogOpen(true);
                                    }}
                                    sx={{ ml: "auto" }}
                                  >
                                    Add Entry
                                  </Button>
                                )}
                              </Box>
                            </TableCell>
                          </TableRow>
                        );
                      }

                      // Regular entry row
                      const entry = item.entry;
                      const extEntry = entry as TeaShopEntryExtended;
                      const isSplit = extEntry.is_split_entry;
                      const entrySiteName = item.siteName;
                      const entrySource = item.source;

                      return (
                        <TableRow key={entry.id} hover>
                          <TableCell sx={{
                            position: 'sticky',
                            left: 0,
                            bgcolor: 'background.paper',
                            zIndex: 1,
                          }}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                              <Box>
                                <Typography variant="body2" fontWeight={600} sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' } }}>
                                  {dayjs(entry.date).format("DD MMM")}
                                </Typography>
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  sx={{ display: { xs: 'none', sm: 'block' } }}
                                >
                                  {dayjs(entry.date).format("ddd")}
                                </Typography>
                              </Box>
                              {isSplit && (
                                <Tooltip title={`Split entry (${extEntry.split_percentage}% of total)`}>
                                  <Chip
                                    icon={<SplitIcon fontSize="small" />}
                                    label={`${extEntry.split_percentage}%`}
                                    size="small"
                                    color="secondary"
                                    variant="outlined"
                                    sx={{ height: 18, '& .MuiChip-label': { fontSize: '0.6rem', px: 0.25 } }}
                                  />
                                </Tooltip>
                              )}
                            </Box>
                          </TableCell>
                          {/* Site Name Column - only in group mode */}
                          {isInGroup && (
                            <TableCell>
                              <Tooltip title={entrySource === "group" ? "Legacy group entry" : `Entry from ${entrySiteName}`}>
                                <Chip
                                  label={entrySiteName ? (entrySiteName.length > 12 ? entrySiteName.slice(0, 10) + "..." : entrySiteName) : "?"}
                                  size="small"
                                  variant={entrySource === "group" ? "filled" : "outlined"}
                                  color={entrySource === "group" ? "secondary" : "default"}
                                  sx={{ fontSize: '0.65rem', height: 20 }}
                                />
                              </Tooltip>
                            </TableCell>
                          )}
                          <TableCell align="center">
                            {(() => {
                              const att = attendanceByDate.get(entry.date);
                              if (!att || (att.named === 0 && att.market === 0)) {
                                return (
                                  <Tooltip title="No attendance found for this date">
                                    <Chip
                                      icon={<WarningIcon fontSize="small" />}
                                      label="N/A"
                                      size="small"
                                      color="warning"
                                      variant="outlined"
                                    />
                                  </Tooltip>
                                );
                              }
                              return (
                                <Tooltip title={`Named: ${att.named}, Market: ${att.market}`}>
                                  <Chip
                                    icon={<GroupIcon fontSize="small" />}
                                    label={`${att.named}+${att.market}`}
                                    size="small"
                                    color="success"
                                    variant="outlined"
                                  />
                                </Tooltip>
                              );
                            })()}
                          </TableCell>
                          <TableCell align="right">
                            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 0.5 }}>
                              {(entry as any).isGroupEntry && (
                                <Tooltip title={`Group entry - showing this site's allocated share (Total: ₹${((entry as any).original_total_amount || entry.total_amount || 0).toLocaleString()})`}>
                                  <GroupsIcon fontSize="small" color="primary" sx={{ fontSize: { xs: '0.8rem', sm: '1rem' } }} />
                                </Tooltip>
                              )}
                              <Typography fontWeight={600} sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' } }}>
                                ₹{((entry as any).display_amount !== undefined ? (entry as any).display_amount : entry.total_amount || 0).toLocaleString()}
                              </Typography>
                            </Box>
                          </TableCell>
                          {/* Payment Status Column */}
                          <TableCell align="center">
                            {(() => {
                              const entryAny = entry as any;
                              // For group entries, use display_amount (site allocation); for individual, use total_amount
                              const effectiveAmount = entryAny.display_amount !== undefined ? entryAny.display_amount : entry.total_amount || 0;
                              const amountPaid = entryAny.amount_paid || 0;
                              const isFullyPaid = entryAny.is_fully_paid === true;

                              // If amount is 0 (unfilled date), show holiday/N/A indicator
                              if (effectiveAmount === 0 && entryAny.isGroupEntry) {
                                return (
                                  <Tooltip title="No allocation for this site (unfilled/holiday)">
                                    <Typography variant="caption" color="text.secondary">-</Typography>
                                  </Tooltip>
                                );
                              }

                              if (isFullyPaid || (effectiveAmount > 0 && amountPaid >= effectiveAmount)) {
                                return (
                                  <Tooltip title="Fully settled">
                                    <CheckCircleIcon fontSize="small" color="success" />
                                  </Tooltip>
                                );
                              } else if (amountPaid > 0) {
                                return (
                                  <Tooltip title={`Paid ₹${amountPaid.toLocaleString()} of ₹${effectiveAmount.toLocaleString()}`}>
                                    <Chip
                                      label={`₹${amountPaid}`}
                                      size="small"
                                      color="warning"
                                      variant="outlined"
                                      sx={{ fontSize: '0.65rem', height: 20 }}
                                    />
                                  </Tooltip>
                                );
                              } else {
                                return (
                                  <Tooltip title="Pending settlement">
                                    <Chip
                                      label="Pending"
                                      size="small"
                                      variant="outlined"
                                      sx={{ fontSize: '0.6rem', height: 18, color: 'text.disabled', borderColor: 'divider' }}
                                    />
                                  </Tooltip>
                                );
                              }
                            })()}
                          </TableCell>
                          <TableCell align="center" sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                            <AuditAvatarGroup
                              createdByName={entry.entered_by}
                              createdAt={entry.created_at}
                              updatedByName={(entry as any).updated_by}
                              updatedAt={entry.updated_at}
                              compact
                              size="small"
                            />
                          </TableCell>
                          <TableCell align="center">
                            <Box sx={{ display: "flex", gap: 0.5, justifyContent: "center" }}>
                              <IconButton
                                size="small"
                                onClick={() => {
                                  setEditingEntry(entry);
                                  setInitialEntryDate(undefined);
                                  setEntryDialogOpen(true);
                                }}
                                disabled={!canEdit}
                              >
                                <Edit fontSize="small" />
                              </IconButton>
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => handleDeleteEntry(entry.id)}
                                disabled={!canEdit}
                                sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
                              >
                                <Delete fontSize="small" />
                              </IconButton>
                            </Box>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {combinedEntries.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={isInGroup ? 7 : 6} align="center" sx={{ py: 4 }}>
                          <Typography color="text.secondary">
                            No entries found for the selected date range
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </TabPanel>

          {/* Settlements Tab */}
          <TabPanel value={tabValue} index={1}>
            <Box sx={{ mb: 2 }}>
              <Chip
                label={`${filteredSettlements?.length || 0} records`}
                size="small"
                variant="outlined"
                sx={{ fontWeight: 500 }}
              />
            </Box>
            <TableContainer sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <Table size="small" sx={{ minWidth: 800 }}>
                <TableHead>
                  <TableRow sx={{ bgcolor: "action.selected" }}>
                    <TableCell sx={{ fontWeight: 700, fontSize: { xs: '0.7rem', sm: '0.875rem' } }}>Ref</TableCell>
                    {isInGroup && (
                      <TableCell sx={{ fontWeight: 700, fontSize: { xs: '0.7rem', sm: '0.875rem' } }}>Site</TableCell>
                    )}
                    <TableCell sx={{ fontWeight: 700, fontSize: { xs: '0.7rem', sm: '0.875rem' } }}>Payment Date</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: { xs: '0.7rem', sm: '0.875rem' } }} align="right">Amount</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: { xs: '0.7rem', sm: '0.875rem' } }} align="center">Paid By</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: { xs: '0.7rem', sm: '0.875rem' } }} align="center">Mode</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: { xs: '0.7rem', sm: '0.875rem' }, display: { xs: 'none', md: 'table-cell' } }}>Subcontract</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: { xs: '0.7rem', sm: '0.875rem' } }} align="center">Reimbursed</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: { xs: '0.7rem', sm: '0.875rem' } }} align="center">Proof</TableCell>
                    <TableCell sx={{ fontWeight: 700, fontSize: { xs: '0.7rem', sm: '0.875rem' } }} align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredSettlements.map((settlement) => {
                    const settlementAny = settlement as any;
                    const proofUrl = settlementAny.proof_url;
                    const subcontract = settlementAny.subcontracts;
                    const isEngineerSettled = settlementAny.is_engineer_settled;
                    const settlementRef = settlementAny.settlement_reference;
                    const settlementSiteName = settlementAny.site_name;
                    const settlementSource = settlementAny.source;

                    return (
                      <TableRow key={settlement.id} hover>
                        {/* Reference Code */}
                        <TableCell>
                          <Tooltip title={settlementRef || "No ref"}>
                            <Typography
                              variant="body2"
                              fontWeight={600}
                              sx={{
                                fontSize: { xs: '0.65rem', sm: '0.75rem' },
                                fontFamily: 'monospace',
                                color: 'text.secondary'
                              }}
                            >
                              {settlementRef ? settlementRef.slice(-7) : "-"}
                            </Typography>
                          </Tooltip>
                        </TableCell>

                        {/* Site Name - only in group mode */}
                        {isInGroup && (
                          <TableCell>
                            <Chip
                              label={settlementSiteName ? (settlementSiteName.length > 12 ? settlementSiteName.slice(0, 10) + "..." : settlementSiteName) : "?"}
                              size="small"
                              variant={settlementSource === "group" ? "filled" : "outlined"}
                              color={settlementSource === "group" ? "secondary" : "default"}
                              sx={{ fontSize: '0.65rem', height: 20 }}
                            />
                          </TableCell>
                        )}

                        {/* Payment Date */}
                        <TableCell>
                          <Typography variant="body2" fontWeight={600} sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' } }}>
                            {dayjs(settlement.payment_date).format("DD MMM YYYY")}
                          </Typography>
                        </TableCell>

                        {/* Amount Paid */}
                        <TableCell align="right">
                          <Typography fontWeight={600} color="success.main" sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' } }}>
                            ₹{(settlement.amount_paid || 0).toLocaleString()}
                          </Typography>
                        </TableCell>

                        {/* Paid By */}
                        <TableCell align="center">
                          <Chip
                            label={settlement.payer_type === "site_engineer" ? "Eng" : "Co"}
                            size="small"
                            color={settlement.payer_type === "site_engineer" ? "info" : "primary"}
                            variant="outlined"
                          />
                        </TableCell>

                        {/* Payment Mode */}
                        <TableCell align="center">
                          <Chip
                            label={settlement.payment_mode}
                            size="small"
                            variant="outlined"
                          />
                        </TableCell>

                        {/* Subcontract */}
                        <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                          {subcontract ? (
                            <Tooltip title={subcontract.title}>
                              <Chip
                                label={subcontract.title.length > 15 ? subcontract.title.slice(0, 15) + "..." : subcontract.title}
                                size="small"
                                variant="outlined"
                                color="secondary"
                              />
                            </Tooltip>
                          ) : (
                            <Typography variant="caption" color="text.disabled">-</Typography>
                          )}
                        </TableCell>

                        {/* Reimbursed (is_engineer_settled) */}
                        <TableCell align="center">
                          {settlement.payer_type === "site_engineer" ? (
                            isEngineerSettled ? (
                              <Tooltip title="Engineer has been reimbursed">
                                <CheckCircleIcon fontSize="small" color="success" />
                              </Tooltip>
                            ) : (
                              <Tooltip title="Not yet reimbursed to engineer">
                                <Chip label="Pending" size="small" color="warning" variant="outlined" />
                              </Tooltip>
                            )
                          ) : (
                            <Typography variant="caption" color="text.disabled">N/A</Typography>
                          )}
                        </TableCell>

                        {/* Proof */}
                        <TableCell align="center">
                          {proofUrl ? (
                            <IconButton
                              size="small"
                              onClick={() => window.open(proofUrl, "_blank")}
                              color="primary"
                            >
                              <ViewIcon fontSize="small" />
                            </IconButton>
                          ) : (
                            <Typography variant="caption" color="text.disabled">-</Typography>
                          )}
                        </TableCell>

                        {/* Actions */}
                        <TableCell align="center">
                          <Box sx={{ display: "flex", gap: 0.5, justifyContent: "center" }}>
                            <IconButton
                              size="small"
                              onClick={() => handleEditSettlement(settlement)}
                              disabled={!canEdit}
                            >
                              <Edit fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleDeleteSettlement(settlement.id, settlementSource)}
                              disabled={!canEdit}
                              sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
                            >
                              <Delete fontSize="small" />
                            </IconButton>
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filteredSettlements.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={isInGroup ? 10 : 9} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">
                          No settlements recorded yet
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </TabPanel>
        </Paper>
      )}

      {/* Config Redirect Dialog */}
      <Dialog
        open={configDialogOpen}
        onClose={() => setConfigDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Tea Shop Configuration</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            To configure or modify tea shop settings, please visit the Company Tea Shops page.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfigDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              setConfigDialogOpen(false);
              router.push("/company/tea-shops");
            }}
          >
            Go to Tea Shops
          </Button>
        </DialogActions>
      </Dialog>

      {/* Site-level dialogs - always use site dialogs, entries are site-specific */}
      {/* Create a compatible shop object from company tea shop if needed */}
      {(() => {
        // Get best available QR code and UPI ID from any source
        // Priority: site shop > group shop > company tea shop
        const bestQrCode = (shop as any)?.qr_code_url || groupShop?.qr_code_url || companyTeaShop?.qr_code_url || null;
        const bestUpiId = (shop as any)?.upi_id || groupShop?.upi_id || companyTeaShop?.upi_id || null;

        // Use legacy shop if available, otherwise create from company tea shop
        // Always override qr_code_url and upi_id with best available values
        const effectiveShop: TeaShopAccount | null = shop ? {
          ...shop,
          qr_code_url: bestQrCode,
          upi_id: bestUpiId,
        } : (companyTeaShop ? {
          id: companyTeaShop.id,
          site_id: selectedSite.id, // Use current site for entries
          shop_name: companyTeaShop.name,
          owner_name: companyTeaShop.owner_name,
          contact_phone: companyTeaShop.contact_phone,
          address: companyTeaShop.address,
          upi_id: bestUpiId,
          qr_code_url: bestQrCode,
          notes: companyTeaShop.notes,
          is_active: companyTeaShop.is_active,
          is_group_shop: false,
          site_group_id: null,
          created_at: companyTeaShop.created_at,
          updated_at: companyTeaShop.updated_at,
        } : null);

        if (!effectiveShop) return null;

        return (
          <>
            <TeaShopEntryDialog
              open={entryDialogOpen}
              onClose={() => {
                setEntryDialogOpen(false);
                setEditingEntry(null);
                setInitialEntryDate(undefined);
              }}
              shop={effectiveShop}
              entry={editingEntry}
              initialDate={initialEntryDate}
              onSuccess={() => {
                setEntryDialogOpen(false);
                setEditingEntry(null);
                setInitialEntryDate(undefined);
                fetchData();
              }}
            />

            <TeaShopSettlementDialog
              open={settlementDialogOpen}
              onClose={() => {
                setSettlementDialogOpen(false);
                setEditingSettlement(null);
              }}
              shop={effectiveShop}
              pendingBalance={stats.pendingBalance}
              entries={entries}
              settlement={editingSettlement}
              isInGroup={isInGroup}
              siteGroupId={siteGroupId}
              filterBySiteId={effectiveFilterBySiteId}
              onSuccess={() => {
                setSettlementDialogOpen(false);
                setEditingSettlement(null);
                fetchData();
              }}
            />
          </>
        );
      })()}

      {/* Delete Settlement Confirmation Dialog */}
      <ConfirmDialog
        open={deleteConfirm.open}
        title="Delete Settlement"
        message="Are you sure you want to delete this settlement? This will affect the pending balance and remove all associated records."
        confirmText="Delete"
        confirmColor="error"
        isLoading={isDeleting}
        onConfirm={confirmDeleteSettlement}
        onCancel={() => setDeleteConfirm({ open: false, settlementId: null, source: null })}
      />

      {/* Mobile FAB - always rendered, visibility controlled by CSS */}
      <Fab
        color="primary"
        onClick={() => {
          setEditingEntry(null);
          setEntryDialogOpen(true);
        }}
        sx={{
          display: (shop || companyTeaShop) && canEdit ? { xs: 'flex', sm: 'none' } : 'none',
          position: "fixed",
          bottom: 16,
          right: 16,
          zIndex: 1000,
        }}
      >
        <AddIcon />
      </Fab>
    </Box>
  );
}
