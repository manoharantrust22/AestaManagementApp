"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Box,
  Button,
  Typography,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  Alert,
  Grid,
  Switch,
  FormControl,
  FormLabel,
  FormControlLabel,
  RadioGroup,
  Radio,
  Snackbar,
  IconButton,
} from "@mui/material";
import { ThemeProvider, useTheme } from "@mui/material/styles";
import {
  Add,
  Delete,
  Edit,
  ExpandMore,
  ExpandLess,
  Close,
} from "@mui/icons-material";
import { useRouter, useSearchParams } from "next/navigation";
import DataTable, { type MRT_ColumnDef } from "@/components/common/DataTable";
import { createClient } from "@/lib/supabase/client";
import { useSite } from "@/contexts/SiteContext";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/layout/PageHeader";
import { hasEditPermission } from "@/lib/permissions";
import dayjs from "dayjs";
import {
  groupHolidays,
  holidayInScope,
  type HolidayGroup,
  type SiteHoliday,
} from "@/lib/utils/holidayUtils";
import {
  TradeChipFilter,
  type TradeChipSelection,
} from "@/components/attendance/TradeChipFilter";
import { useSubcontractMeta } from "@/hooks/queries/useSubcontractMeta";
import { useCivilCategoryId } from "@/hooks/queries/useCivilCategoryId";
import { useSiteTrades } from "@/hooks/queries/useTrades";
import { getTradeColor } from "@/theme/tradeColors";
import { createTradeTheme } from "@/theme/theme";

// Interface for table rows (can be group header or individual day)
interface TableRow {
  id: string;
  type: "group" | "child";
  group: HolidayGroup;
  holiday?: SiteHoliday; // Only for child rows
}

// Parse error messages to user-friendly format
function parseErrorMessage(error: any): string {
  const message = error?.message || error?.toString() || "Unknown error";

  if (
    message.includes("duplicate key") ||
    message.includes("unique constraint") ||
    message.includes("uq_site_holiday_sitewide") ||
    message.includes("uq_site_holiday_per_trade")
  ) {
    return "A holiday already exists for this date in this workspace. Please choose a different date.";
  }

  if (message.includes("permission") || message.includes("policy")) {
    return "You don't have permission to modify holidays.";
  }

  return message;
}

export default function HolidaysContent() {
  const { selectedSite } = useSite();
  const { userProfile } = useAuth();
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const theme = useTheme();

  const [holidays, setHolidays] = useState<SiteHoliday[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<HolidayGroup | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Snackbar state
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error" | "warning" | "info";
  }>({
    open: false,
    message: "",
    severity: "info",
  });

  // Bulk mode state
  const [bulkMode, setBulkMode] = useState(false);
  // Scope of a new holiday: the active workspace only, or all workspaces (NULL).
  const [applyToAll, setApplyToAll] = useState(false);

  const [form, setForm] = useState({
    date: dayjs().format("YYYY-MM-DD"),
    startDate: dayjs().format("YYYY-MM-DD"),
    endDate: dayjs().format("YYYY-MM-DD"),
    reason: "",
  });

  const canEdit = hasEditPermission(userProfile?.role);

  // ── Workspace scope ───────────────────────────────────────────────────────
  // Mirrors the attendance page: a lone ?contractId= pointing at a non-Civil
  // DETAILED in-house contract scopes this page to that trade's workspace.
  const contractIdParam = searchParams.get("contractId");
  const { data: contractMeta } = useSubcontractMeta(contractIdParam);
  const civilCategoryId = useCivilCategoryId(selectedSite?.id);
  const { data: trades } = useSiteTrades(selectedSite?.id);

  const tradeScope = useMemo(() => {
    const meta = contractMeta;
    if (
      !contractIdParam ||
      !meta ||
      meta.labor_tracking_mode !== "detailed" ||
      !meta.trade_category_id ||
      meta.trade_name === "Civil"
    ) {
      return null;
    }
    return {
      contractId: contractIdParam,
      tradeCategoryId: meta.trade_category_id,
      tradeName: meta.trade_name ?? "",
    };
  }, [contractIdParam, contractMeta]);

  /** Holiday scope for the current view: active non-Civil trade, else Civil.
   *  trade_category_id NULL means "all workspaces" and passes in every scope. */
  const scopeCategoryId = tradeScope?.tradeCategoryId ?? civilCategoryId;
  const activeWorkspaceName = tradeScope?.tradeName ?? "Civil";

  const tradeChipSelectionForDisplay: TradeChipSelection = tradeScope
    ? {
        kind: "trade",
        categoryId: tradeScope.tradeCategoryId,
        tradeName: tradeScope.tradeName,
        contractId: tradeScope.contractId,
      }
    : { kind: "civil" };

  const tradeColor = useMemo(
    () => getTradeColor(activeWorkspaceName),
    [activeWorkspaceName]
  );
  const tradeTheme = useMemo(
    () => (tradeScope ? createTradeTheme(theme, tradeColor) : null),
    [tradeScope, theme, tradeColor]
  );

  // Whether to show the workspace chip row at all (Civil-only sites = today).
  const hasWorkspaceChips = useMemo(
    () =>
      (trades ?? []).some(
        (t) =>
          t.category.name !== "Civil" &&
          t.contracts.some((c) => c.laborTrackingMode === "detailed")
      ),
    [trades]
  );

  // Holidays visible in the current workspace scope.
  const scopedHolidays = useMemo(
    () => holidays.filter((h) => holidayInScope(h, scopeCategoryId)),
    [holidays, scopeCategoryId]
  );

  // Group holidays for display (scoped)
  const groupedHolidays = useMemo(
    () => groupHolidays(scopedHolidays),
    [scopedHolidays]
  );

  // Flatten groups into table rows (includes expanded children)
  const tableRows = useMemo((): TableRow[] => {
    const rows: TableRow[] = [];
    for (const group of groupedHolidays) {
      // Add group header row
      rows.push({
        id: group.id,
        type: "group",
        group,
      });
      // If expanded and has multiple days, add child rows
      if (expandedGroups.has(group.id) && group.dayCount > 1) {
        for (const holiday of group.holidays) {
          rows.push({
            id: `child-${holiday.id}`,
            type: "child",
            group,
            holiday,
          });
        }
      }
    }
    return rows;
  }, [groupedHolidays, expandedGroups]);

  const showSnackbar = (
    message: string,
    severity: "success" | "error" | "warning" | "info" = "info"
  ) => {
    setSnackbar({ open: true, message, severity });
  };

  const handleCloseSnackbar = () => {
    setSnackbar((prev) => ({ ...prev, open: false }));
  };

  const fetchHolidays = async () => {
    if (!selectedSite) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("site_holidays")
        .select("*")
        .eq("site_id", selectedSite.id)
        .order("date", { ascending: false });

      if (error) throw error;
      setHolidays((data || []) as SiteHoliday[]);
    } catch (error: any) {
      console.error("Error fetching holidays:", error);
      showSnackbar("Failed to load holidays: " + parseErrorMessage(error), "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHolidays();
  }, [selectedSite]);

  const handleOpenDialog = (group?: HolidayGroup) => {
    setApplyToAll(false);
    if (group) {
      setEditingGroup(group);
      setForm({
        date: group.startDate,
        startDate: group.startDate,
        endDate: group.endDate,
        reason: group.reason,
      });
      setBulkMode(false); // Edit mode doesn't use bulk
    } else {
      setEditingGroup(null);
      setForm({
        date: dayjs().format("YYYY-MM-DD"),
        startDate: dayjs().format("YYYY-MM-DD"),
        endDate: dayjs().format("YYYY-MM-DD"),
        reason: "",
      });
      setBulkMode(false);
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingGroup(null);
    setBulkMode(false);
    setApplyToAll(false);
  };

  // Calculate days count for bulk mode preview
  const bulkDaysCount = useMemo(() => {
    if (!bulkMode) return 0;
    const start = dayjs(form.startDate);
    const end = dayjs(form.endDate);
    if (end.isBefore(start)) return 0;
    return end.diff(start, "day") + 1;
  }, [bulkMode, form.startDate, form.endDate]);

  const handleSubmit = async () => {
    if (!selectedSite || !userProfile) return;

    // Validation
    if (!form.reason.trim()) {
      showSnackbar("Please enter a reason for the holiday", "warning");
      return;
    }

    if (bulkMode) {
      if (!form.startDate || !form.endDate) {
        showSnackbar("Please select both start and end dates", "warning");
        return;
      }
      if (dayjs(form.endDate).isBefore(dayjs(form.startDate))) {
        showSnackbar("End date must be on or after start date", "warning");
        return;
      }
    } else if (!editingGroup && !form.date) {
      showSnackbar("Please select a date", "warning");
      return;
    }

    // Target scope for new holidays: the active workspace, or NULL for "all".
    const targetTradeCategoryId = applyToAll ? null : scopeCategoryId;
    if (!editingGroup && !applyToAll && targetTradeCategoryId == null) {
      showSnackbar(
        "Workspace is still loading — please try again in a moment.",
        "warning"
      );
      return;
    }

    setLoading(true);
    try {
      // Check if attendance exists for the date(s) being marked as holiday
      // Skip this check when editing (only updating reason, not adding new dates)
      if (!editingGroup) {
        const datesToCheck = bulkMode
          ? (() => {
              // Generate dates for bulk mode check
              const dates: string[] = [];
              let current = dayjs(form.startDate);
              const end = dayjs(form.endDate);
              while (current.isBefore(end) || current.isSame(end, "day")) {
                dates.push(current.format("YYYY-MM-DD"));
                current = current.add(1, "day");
              }
              return dates;
            })()
          : [form.date];

        const { data: existingAttendance } = await supabase
          .from("daily_attendance")
          .select("date")
          .eq("site_id", selectedSite.id)
          .in("date", datesToCheck)
          .limit(1);

        if (existingAttendance && existingAttendance.length > 0) {
          showSnackbar(
            `Cannot mark ${dayjs(existingAttendance[0].date).format("DD MMM YYYY")} as holiday - attendance already recorded for this date`,
            "error"
          );
          setLoading(false);
          return;
        }
      }

      if (editingGroup) {
        if (editingGroup.dayCount === 1) {
          // Single holiday - update both date and reason (scope unchanged)
          const { error } = await supabase
            .from("site_holidays")
            .update({ date: form.date, reason: form.reason })
            .eq("id", editingGroup.holidays[0].id);
          if (error) throw error;
          showSnackbar("Holiday updated", "success");
        } else {
          // Multi-day group - update only reason for all (scope unchanged)
          const ids = editingGroup.holidays.map((h) => h.id);
          const { error } = await supabase
            .from("site_holidays")
            .update({ reason: form.reason })
            .in("id", ids);
          if (error) throw error;
          showSnackbar(
            `Updated ${editingGroup.dayCount} holidays`,
            "success"
          );
        }
      } else if (bulkMode) {
        // Generate array of dates and bulk insert
        const dates: string[] = [];
        let current = dayjs(form.startDate);
        const end = dayjs(form.endDate);
        while (current.isBefore(end) || current.isSame(end, "day")) {
          dates.push(current.format("YYYY-MM-DD"));
          current = current.add(1, "day");
        }

        // Check for existing holidays IN THE TARGET SCOPE only (a Civil holiday
        // and a Painting holiday can coexist on the same date).
        const existingDates = holidays
          .filter(
            (h) => (h.trade_category_id ?? null) === (targetTradeCategoryId ?? null)
          )
          .map((h) => h.date);
        const newDates = dates.filter((d) => !existingDates.includes(d));

        if (newDates.length === 0) {
          showSnackbar(
            "All selected dates already have holidays. No new holidays created.",
            "warning"
          );
          setLoading(false);
          return;
        }

        const records = newDates.map((date) => ({
          site_id: selectedSite.id,
          date,
          reason: form.reason.trim(),
          trade_category_id: targetTradeCategoryId,
        }));

        const { error } = await (supabase.from("site_holidays") as any).insert(
          records
        );
        if (error) throw error;

        const skipped = dates.length - newDates.length;
        const msg =
          skipped > 0
            ? `Created ${newDates.length} holidays (${skipped} dates already had holidays)`
            : `Created ${newDates.length} holidays`;
        showSnackbar(msg, "success");
      } else {
        // Single insert
        const { error } = await (supabase.from("site_holidays") as any).insert({
          site_id: selectedSite.id,
          date: form.date,
          reason: form.reason.trim(),
          trade_category_id: targetTradeCategoryId,
        });
        if (error) throw error;
        showSnackbar("Holiday added successfully", "success");
      }

      await fetchHolidays();
      handleCloseDialog();
    } catch (error: any) {
      console.error("Error saving holiday:", error);
      showSnackbar(parseErrorMessage(error), "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGroup = async (group: HolidayGroup) => {
    const confirmMsg =
      group.dayCount > 1
        ? `Are you sure you want to delete ${group.dayCount} holidays (${dayjs(group.startDate).format("DD MMM")} - ${dayjs(group.endDate).format("DD MMM YYYY")})?`
        : `Are you sure you want to delete this holiday (${dayjs(group.startDate).format("DD MMM YYYY")})?`;

    if (!confirm(confirmMsg)) return;

    setLoading(true);
    try {
      const ids = group.holidays.map((h) => h.id);
      const { error } = await supabase
        .from("site_holidays")
        .delete()
        .in("id", ids);
      if (error) throw error;
      showSnackbar(
        `Deleted ${group.dayCount} holiday${group.dayCount > 1 ? "s" : ""}`,
        "success"
      );
      await fetchHolidays();
    } catch (error: any) {
      showSnackbar("Failed to delete: " + parseErrorMessage(error), "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSingle = async (holiday: SiteHoliday) => {
    if (
      !confirm(
        `Delete holiday on ${dayjs(holiday.date).format("DD MMM YYYY")}?`
      )
    )
      return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from("site_holidays")
        .delete()
        .eq("id", holiday.id);
      if (error) throw error;
      showSnackbar("Holiday deleted", "success");
      await fetchHolidays();
    } catch (error: any) {
      showSnackbar("Failed to delete: " + parseErrorMessage(error), "error");
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const columns = useMemo<MRT_ColumnDef<TableRow>[]>(
    () => [
      {
        accessorKey: "group.startDate",
        header: "Date",
        size: 250,
        enableSorting: false, // Sorting handled by data order
        Cell: ({ row }) => {
          const { type, group, holiday } = row.original;

          if (type === "child" && holiday) {
            // Child row - show individual date with indent
            const date = dayjs(holiday.date);
            return (
              <Box sx={{ pl: 3, display: "flex", alignItems: "center", gap: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  └─
                </Typography>
                <Typography variant="body2">
                  {date.format("DD MMM YYYY")} ({date.format("ddd")})
                </Typography>
              </Box>
            );
          }

          // Group row
          const startDate = dayjs(group.startDate);
          const endDate = dayjs(group.endDate);
          const isRange = group.dayCount > 1;
          const isExpanded = expandedGroups.has(group.id);

          const today = dayjs();
          const isPast = endDate.isBefore(today, "day");
          const isToday =
            startDate.isSame(today, "day") ||
            (startDate.isBefore(today, "day") && endDate.isAfter(today, "day"));
          const isUpcoming = startDate.isAfter(today, "day");

          return (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              {isRange && (
                <IconButton
                  size="small"
                  onClick={() => toggleExpand(group.id)}
                  sx={{ p: 0.25 }}
                >
                  {isExpanded ? <ExpandLess /> : <ExpandMore />}
                </IconButton>
              )}
              <Box>
                <Typography variant="body2" fontWeight={600}>
                  {isRange
                    ? `${startDate.format("DD")} - ${endDate.format("DD MMM YYYY")}`
                    : startDate.format("DD MMM YYYY")}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {isRange
                    ? `${startDate.format("ddd")} - ${endDate.format("ddd")}`
                    : startDate.format("dddd")}
                </Typography>
                {isToday && (
                  <Chip
                    label="Today"
                    size="small"
                    color="primary"
                    sx={{ ml: 1, height: 18 }}
                  />
                )}
                {isUpcoming && (
                  <Chip
                    label="Upcoming"
                    size="small"
                    color="success"
                    sx={{ ml: 1, height: 18 }}
                  />
                )}
                {isPast && (
                  <Chip
                    label="Past"
                    size="small"
                    color="default"
                    sx={{ ml: 1, height: 18 }}
                  />
                )}
              </Box>
            </Box>
          );
        },
      },
      {
        accessorKey: "group.dayCount",
        header: "Days",
        size: 80,
        enableSorting: false,
        Cell: ({ row }) => {
          if (row.original.type === "child") return null;
          return (
            <Chip
              label={row.original.group.dayCount}
              size="small"
              color={row.original.group.dayCount > 1 ? "primary" : "default"}
              variant={row.original.group.dayCount > 1 ? "filled" : "outlined"}
            />
          );
        },
      },
      {
        accessorKey: "group.reason",
        header: "Reason / Holiday Name",
        size: 300,
        enableSorting: false,
        Cell: ({ row }) => {
          if (row.original.type === "child") return null;
          const group = row.original.group;
          // A whole-site ("all workspaces", NULL) holiday shows in every
          // workspace, so badge it to set it apart from a dedicated one.
          const isAllWorkspaces = group.holidays[0]?.trade_category_id == null;
          return (
            <Box
              sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}
            >
              <Typography variant="body2" component="span">
                {group.reason}
              </Typography>
              {isAllWorkspaces && (
                <Chip
                  label="All workspaces"
                  size="small"
                  color="info"
                  variant="outlined"
                  sx={{ height: 20 }}
                />
              )}
            </Box>
          );
        },
      },
      {
        id: "mrt-row-actions",
        header: "Actions",
        size: 150,
        Cell: ({ row }) => {
          const { type, group, holiday } = row.original;

          if (type === "child" && holiday) {
            // Child row - only delete button
            return (
              <IconButton
                size="small"
                color="error"
                onClick={() => handleDeleteSingle(holiday)}
                disabled={!canEdit}
              >
                <Delete fontSize="small" />
              </IconButton>
            );
          }

          // Group row
          return (
            <Box sx={{ display: "flex", gap: 0.5 }}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<Edit />}
                onClick={() => handleOpenDialog(group)}
                disabled={!canEdit}
              >
                Edit
              </Button>
              <Button
                size="small"
                variant="outlined"
                color="error"
                startIcon={<Delete />}
                onClick={() => handleDeleteGroup(group)}
                disabled={!canEdit}
              >
                Delete
              </Button>
            </Box>
          );
        },
      },
    ],
    [canEdit, expandedGroups]
  );

  if (!selectedSite) {
    return (
      <Box>
        <PageHeader title="Site Holidays" />
        <Alert severity="warning">
          Please select a site to manage holidays
        </Alert>
      </Box>
    );
  }

  const upcomingHolidays = scopedHolidays.filter((h) =>
    dayjs(h.date).isAfter(dayjs(), "day")
  );

  const content = (
    <Box>
      <PageHeader
        title="Site Holidays"
        subtitle={`Manage holidays for ${selectedSite.name}`}
        actions={
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => handleOpenDialog()}
            disabled={!canEdit}
          >
            Add Holiday
          </Button>
        }
      />

      {/* Workspace chip selector — Civil / trade. Self-hides on Civil-only sites. */}
      {hasWorkspaceChips && (
        <Box sx={{ mb: 2 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mb: 0.75 }}
          >
            Holidays for
          </Typography>
          <TradeChipFilter
            siteId={selectedSite.id}
            selected={tradeChipSelectionForDisplay}
            onChange={() => {}}
            onNavigateScope={(id) =>
              router.push(
                id ? `/site/holidays?contractId=${id}` : "/site/holidays"
              )
            }
            compact
          />
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mt: 0.5 }}
          >
            {tradeScope
              ? `${activeWorkspaceName} workspace — holidays for this trade only. Tap Civil to return.`
              : "Civil holidays. Tap a trade to manage that workspace's holidays."}
          </Typography>
        </Box>
      )}

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Box sx={{ p: 2, bgcolor: "primary.light", borderRadius: 2 }}>
            <Typography variant="h4" fontWeight={700} color="primary.main">
              {scopedHolidays.length}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Total Holiday Days
            </Typography>
          </Box>
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Box sx={{ p: 2, bgcolor: "success.light", borderRadius: 2 }}>
            <Typography variant="h4" fontWeight={700} color="success.main">
              {upcomingHolidays.length}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Upcoming Days
            </Typography>
          </Box>
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Box sx={{ p: 2, bgcolor: "info.light", borderRadius: 2 }}>
            <Typography variant="h4" fontWeight={700} color="info.main">
              {groupedHolidays.length}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Holiday Groups
            </Typography>
          </Box>
        </Grid>
      </Grid>

      {!loading && scopedHolidays.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 8, color: "text.secondary" }}>
          <Typography variant="h6" gutterBottom>
            No {activeWorkspaceName} holidays yet
          </Typography>
          <Typography variant="body2">
            Use “Add Holiday” to mark one for this workspace.
          </Typography>
        </Box>
      ) : (
        <DataTable
          columns={columns}
          data={tableRows}
          isLoading={loading}
          getRowId={(row) => row.id}
          enableSorting={false}
          muiTableBodyRowProps={({ row }) => ({
            sx: {
              backgroundColor:
                row.original.type === "child" ? "action.hover" : "inherit",
              "&:hover": {
                backgroundColor:
                  row.original.type === "child"
                    ? "action.selected"
                    : "action.hover",
              },
            },
          })}
        />
      )}

      {/* Add/Edit Holiday Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {editingGroup
            ? `Edit Holiday${editingGroup.dayCount > 1 ? "s" : ""}`
            : "Add New Holiday"}
        </DialogTitle>
        <DialogContent>
          <Box
            sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 2 }}
          >
            {/* Scope selector — only for new holidays */}
            {!editingGroup && (
              <FormControl>
                <FormLabel sx={{ fontSize: 13, mb: 0.5 }}>Applies to</FormLabel>
                <RadioGroup
                  row
                  value={applyToAll ? "all" : "workspace"}
                  onChange={(e) => setApplyToAll(e.target.value === "all")}
                >
                  <FormControlLabel
                    value="workspace"
                    control={<Radio size="small" />}
                    label={`${activeWorkspaceName} only`}
                  />
                  <FormControlLabel
                    value="all"
                    control={<Radio size="small" />}
                    label="All workspaces"
                  />
                </RadioGroup>
              </FormControl>
            )}

            {/* Bulk mode toggle - only for new holidays */}
            {!editingGroup && (
              <FormControlLabel
                control={
                  <Switch
                    checked={bulkMode}
                    onChange={(e) => setBulkMode(e.target.checked)}
                  />
                }
                label="Add multiple days (date range)"
              />
            )}

            {/* Date inputs */}
            {editingGroup ? (
              // Edit mode
              editingGroup.dayCount === 1 ? (
                // Single day - allow editing date
                <TextField
                  fullWidth
                  label="Date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  slotProps={{ inputLabel: { shrink: true } }}
                  required
                />
              ) : (
                // Multi-day group - show info (editing dates for range is complex)
                <Alert severity="info">
                  Editing {editingGroup.dayCount} holidays from{" "}
                  {dayjs(editingGroup.startDate).format("DD MMM")} to{" "}
                  {dayjs(editingGroup.endDate).format("DD MMM YYYY")}
                  <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                    To change dates, expand the group and delete/add individual days
                  </Typography>
                </Alert>
              )
            ) : bulkMode ? (
              // Bulk mode - show date range
              <>
                <TextField
                  fullWidth
                  label="Start Date"
                  type="date"
                  value={form.startDate}
                  onChange={(e) =>
                    setForm({ ...form, startDate: e.target.value })
                  }
                  slotProps={{ inputLabel: { shrink: true } }}
                  required
                />
                <TextField
                  fullWidth
                  label="End Date"
                  type="date"
                  value={form.endDate}
                  onChange={(e) =>
                    setForm({ ...form, endDate: e.target.value })
                  }
                  slotProps={{ inputLabel: { shrink: true } }}
                  required
                />
                {bulkDaysCount > 0 && (
                  <Alert severity="info">
                    This will create {bulkDaysCount} holiday
                    {bulkDaysCount > 1 ? "s" : ""} from{" "}
                    {dayjs(form.startDate).format("DD MMM")} to{" "}
                    {dayjs(form.endDate).format("DD MMM YYYY")}
                  </Alert>
                )}
                {bulkDaysCount === 0 && form.startDate && form.endDate && (
                  <Alert severity="error">
                    End date must be on or after start date
                  </Alert>
                )}
              </>
            ) : (
              // Single date mode
              <TextField
                fullWidth
                label="Date"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                slotProps={{ inputLabel: { shrink: true } }}
                required
              />
            )}

            <TextField
              fullWidth
              label="Reason / Holiday Name"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              required
              multiline
              rows={2}
              placeholder="e.g., Diwali Festival, Republic Day, Site Inspection"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={loading || (bulkMode && bulkDaysCount === 0)}
          >
            {editingGroup
              ? "Update"
              : bulkMode && bulkDaysCount > 0
                ? `Add ${bulkDaysCount} Holiday${bulkDaysCount > 1 ? "s" : ""}`
                : "Add"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={handleCloseSnackbar}
          severity={snackbar.severity}
          sx={{ width: "100%" }}
          action={
            <IconButton
              size="small"
              color="inherit"
              onClick={handleCloseSnackbar}
            >
              <Close fontSize="small" />
            </IconButton>
          }
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );

  return tradeTheme ? (
    <ThemeProvider theme={tradeTheme}>{content}</ThemeProvider>
  ) : (
    content
  );
}
