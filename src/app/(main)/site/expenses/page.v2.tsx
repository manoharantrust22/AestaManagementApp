"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Add,
  Close,
  Description as ContractIcon,
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon,
  OpenInNew,
} from "@mui/icons-material";
import dayjs from "dayjs";

import { createClient } from "@/lib/supabase/client";
import { useSite } from "@/contexts/SiteContext";
import { useAuth } from "@/contexts/AuthContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import { hasEditPermission } from "@/lib/permissions";
import { useSiteAuditState } from "@/hooks/queries/useSiteAuditState";
import { useInspectPane } from "@/hooks/useInspectPane";
import { LegacyAuditBanner } from "@/components/audit";
import PageHeader from "@/components/layout/PageHeader";
import ScopeChip from "@/components/common/ScopeChip";
import RedirectConfirmDialog from "@/components/common/RedirectConfirmDialog";
import { InspectPane } from "@/components/common/InspectPane";
import { entitySettlementRef } from "@/components/common/InspectPane/types";
import { cancelMiscExpense } from "@/lib/services/miscExpenseService";
import {
  getSiteSubcontractTotals,
  type SubcontractTotals,
} from "@/lib/services/subcontractService";

import {
  type ExpenseGroup,
  type ExpenseRow,
  type ExpenseStatus,
  useExpensesData,
  LOAD_MORE_STEP,
  MAX_RESULT_LIMIT,
} from "@/hooks/queries/useExpensesData";
import ExpensesSummaryBand from "@/components/expenses/ExpensesSummaryBand";
import ExpensesFilterBar from "@/components/expenses/ExpensesFilterBar";
import ExpensesTable from "@/components/expenses/ExpensesTable";
import { ExpensesGroupedByTrade } from "@/components/expenses/ExpensesGroupedByTrade";
import {
  TradeChipFilter,
  type TradeChipSelection,
} from "@/components/attendance/TradeChipFilter";
import { useSiteTrades } from "@/hooks/queries/useTrades";

import type { Database } from "@/types/database.types";
type ExpenseModule = Database["public"]["Enums"]["expense_module"];
type PaymentMode = Database["public"]["Enums"]["payment_mode"];

interface SitePayer {
  id: string;
  name: string;
  is_active: boolean;
}

interface ExpenseCategory {
  id: string;
  name: string;
  module: string;
}

const TYPE_LABELS: Record<string, string> = {
  "Daily Salary": "Daily wages",
  "Contract Salary": "Contract",
  "Direct Payment": "Direct contract",
  "Tea & Snacks": "Tea & Snacks",
  Material: "Material",
  Machinery: "Machinery",
  General: "General",
  Miscellaneous: "Miscellaneous",
  Excess: "Excess",
  "Unlinked Salary": "Unlinked Salary",
  Advance: "Advance",
};

function labelForActiveTypes(types: string[]): string | null {
  if (types.length === 0) return null;
  if (types.length === 1) return TYPE_LABELS[types[0]] ?? types[0];
  // Combo presets
  const sorted = [...types].sort().join("|");
  if (sorted === "Advance|Contract Salary|Daily Salary") return "Salary Settlement";
  if (sorted === "Advance|Contract Salary") return "Contract";
  return `${types.length} types`;
}

export default function ExpensesPageV2() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const { selectedSite } = useSite();
  const auditState = useSiteAuditState();
  const { userProfile } = useAuth();
  const { formatForApi, isAllTime } = useDateRange();
  const { dateFrom, dateTo } = formatForApi();

  const pane = useInspectPane();
  const canEdit = hasEditPermission(userProfile?.role);

  // Filter state — initialised from URL search params so back/forward and
  // shareable links work.
  const [search, setSearch] = useState<string>(() => searchParams.get("q") ?? "");
  const [group, setGroup] = useState<ExpenseGroup>(() => {
    const g = searchParams.get("group");
    return g === "labor" || g === "building" ? g : "all";
  });
  const [activeTypes, setActiveTypes] = useState<string[]>(() => {
    const t = searchParams.get("types");
    return t ? t.split(",").filter(Boolean) : [];
  });
  const [status, setStatus] = useState<ExpenseStatus>(() => {
    const s = searchParams.get("status");
    return s === "cleared" || s === "pending" ? s : "all";
  });
  const [sitePayerId, setSitePayerId] = useState<string | null>(
    () => searchParams.get("payer") || null,
  );
  const [isFullscreen, setIsFullscreen] = useState(false);

  // URL sync — write filters to the URL whenever they change.
  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (group !== "all") params.set("group", group);
    if (activeTypes.length > 0) params.set("types", activeTypes.join(","));
    if (status !== "all") params.set("status", status);
    if (sitePayerId) params.set("payer", sitePayerId);
    const qs = params.toString();
    const next = qs ? `?${qs}` : "";
    // Use replace to avoid polluting history with each keystroke.
    router.replace(`/site/expenses${next}`, { scroll: false });
  }, [search, group, activeTypes, status, sitePayerId, router]);

  // Multi-payer settings
  const [hasMultiplePayers, setHasMultiplePayers] = useState(false);
  const [sitePayers, setSitePayers] = useState<SitePayer[]>([]);

  useEffect(() => {
    const run = async () => {
      if (!selectedSite) {
        setHasMultiplePayers(false);
        setSitePayers([]);
        return;
      }
      try {
        const { data: siteData } = await supabase
          .from("sites")
          .select("*")
          .eq("id", selectedSite.id)
          .single();
        const isMulti = (siteData as any)?.has_multiple_payers || false;
        setHasMultiplePayers(isMulti);
        if (isMulti) {
          const { data } = await (supabase as any)
            .from("site_payers")
            .select("id, name, is_active")
            .eq("site_id", selectedSite.id)
            .eq("is_active", true)
            .order("name");
          setSitePayers(data || []);
        } else {
          setSitePayers([]);
        }
      } catch (err) {
        console.error("ExpensesPageV2: payer settings", err);
      }
    };
    run();
  }, [selectedSite, supabase]);

  // Categories for the Add/Edit dialog
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  useEffect(() => {
    const run = async () => {
      const { data } = await supabase
        .from("expense_categories")
        .select("*")
        .order("module")
        .order("name");
      setCategories((data as any) || []);
    };
    run();
  }, [supabase]);

  // Subcontract drawer (lazy-loaded)
  const [subcontracts, setSubcontracts] = useState<SubcontractTotals[] | null>(null);
  const [subcontractsLoading, setSubcontractsLoading] = useState(false);
  const [subcontractDrawerOpen, setSubcontractDrawerOpen] = useState(false);
  const [subcontractsLoadedForSite, setSubcontractsLoadedForSite] = useState<string | null>(null);

  // Reset subcontracts when site changes
  useEffect(() => {
    setSubcontracts(null);
    setSubcontractsLoadedForSite(null);
  }, [selectedSite?.id]);

  const fetchSubcontracts = useCallback(async () => {
    if (!selectedSite?.id) return;
    setSubcontractsLoading(true);
    try {
      const summaries = await getSiteSubcontractTotals(supabase, selectedSite.id, [
        "active",
        "on_hold",
        "completed",
        "draft",
        "cancelled",
      ]);
      setSubcontracts(summaries);
      setSubcontractsLoadedForSite(selectedSite.id);
    } catch (err) {
      console.error("fetchSubcontracts", err);
    } finally {
      setSubcontractsLoading(false);
    }
  }, [selectedSite?.id, supabase]);

  const handleOpenSubcontracts = useCallback(() => {
    setSubcontractDrawerOpen(true);
    if (
      selectedSite?.id &&
      subcontractsLoadedForSite !== selectedSite.id &&
      !subcontractsLoading
    ) {
      void fetchSubcontracts();
    }
  }, [fetchSubcontracts, selectedSite?.id, subcontractsLoadedForSite, subcontractsLoading]);

  // Data hook
  const { expenses, summary, isLoading, loadedLimit, resultLimitHit, canLoadMore, loadMore, refetch } =
    useExpensesData({
      siteId: selectedSite?.id ?? null,
      dateFrom: dateFrom ?? null,
      dateTo: dateTo ?? null,
      isAllTime,
      group,
      expenseTypes: activeTypes.length > 0 ? activeTypes : null,
      status,
      sitePayerId,
    });

  // Apply free-text search client-side over the loaded slice.
  const searchedRows: ExpenseRow[] = useMemo(() => {
    if (!search.trim()) return expenses;
    const q = search.trim().toLowerCase();
    return expenses.filter((r) => {
      return (
        r.settlement_reference?.toLowerCase().includes(q) ||
        r.vendor_name?.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q) ||
        r.payer_name?.toLowerCase().includes(q) ||
        r.subcontract_title?.toLowerCase().includes(q) ||
        r.expense_type?.toLowerCase().includes(q)
      );
    });
  }, [expenses, search]);

  // Trade chip — same pattern as /site/attendance and /site/payments, plus an
  // "All" chip exclusive to this page. Default is "All" so the supervisor
  // sees every trade's rows banded by trade. Civil chip = civil-and-general
  // (hides other-trade contracts). Trade chip = scoped to that contract.
  const [tradeChipSelection, setTradeChipSelection] =
    useState<TradeChipSelection>({ kind: "all" });
  const { data: siteTrades } = useSiteTrades(selectedSite?.id);
  const nonCivilContractIds = useMemo(() => {
    if (!siteTrades) return null;
    const set = new Set<string>();
    for (const t of siteTrades) {
      if (t.category.name === "Civil") continue;
      for (const c of t.contracts) set.add(c.id);
    }
    return set;
  }, [siteTrades]);
  const filteredRows: ExpenseRow[] = useMemo(() => {
    if (tradeChipSelection.kind === "all") {
      // No row filtering — banded view will group by trade.
      return searchedRows;
    }
    if (tradeChipSelection.kind === "trade") {
      return searchedRows.filter(
        (r) => r.contract_id === tradeChipSelection.contractId
      );
    }
    // Civil mode — hide rows tied to non-civil-trade contracts.
    if (!nonCivilContractIds || nonCivilContractIds.size === 0) {
      return searchedRows;
    }
    return searchedRows.filter(
      (r) => !r.contract_id || !nonCivilContractIds.has(r.contract_id)
    );
  }, [searchedRows, tradeChipSelection, nonCivilContractIds]);

  // Add / Edit dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseRow | null>(null);
  const [form, setForm] = useState({
    module: "general" as ExpenseModule,
    category_id: "",
    date: dayjs().format("YYYY-MM-DD"),
    amount: 0,
    vendor_name: "",
    description: "",
    payment_mode: "cash" as PaymentMode,
    is_cleared: false,
    site_payer_id: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const handleOpenDialog = (row?: ExpenseRow) => {
    // Settlement-derived rows are not editable here.
    if (row?.source_type === "settlement") {
      alert("Salary settlements must be edited from the Salary Settlement page.");
      return;
    }
    if (row?.source_type === "misc_expense") {
      router.push(`/site/expenses/miscellaneous?highlight=${encodeURIComponent(row.settlement_reference || "")}`);
      return;
    }
    if (row?.source_type === "tea_shop_settlement") {
      router.push(`/site/tea-shop?highlight=${encodeURIComponent(row.settlement_reference || "")}`);
      return;
    }
    if (row?.source_type === "subcontract_payment") {
      router.push("/site/subcontracts");
      return;
    }

    if (row) {
      setEditingExpense(row);
      setForm({
        module: row.module as ExpenseModule,
        category_id: row.category_id ?? "",
        date: row.date,
        amount: row.amount,
        vendor_name: row.vendor_name ?? "",
        description: row.description ?? "",
        payment_mode: (row.payment_mode as PaymentMode) || "cash",
        is_cleared: row.is_cleared,
        site_payer_id: row.site_payer_id ?? "",
      });
    } else {
      setEditingExpense(null);
      setForm({
        module: "general",
        category_id: "",
        date: dayjs().format("YYYY-MM-DD"),
        amount: 0,
        vendor_name: "",
        description: "",
        payment_mode: "cash",
        is_cleared: false,
        site_payer_id: "",
      });
    }
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!selectedSite || !form.category_id || form.amount <= 0) {
      alert("Please fill required fields");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        site_id: selectedSite.id,
        module: form.module,
        category_id: form.category_id,
        date: form.date,
        amount: form.amount,
        vendor_name: form.vendor_name || null,
        description: form.description || null,
        payment_mode: form.payment_mode,
        is_cleared: form.is_cleared,
        site_payer_id: form.site_payer_id || null,
      };
      if (editingExpense) {
        await (supabase.from("expenses") as any).update(payload).eq("id", editingExpense.id);
      } else {
        await (supabase.from("expenses") as any).insert(payload);
      }
      await refetch();
      setDialogOpen(false);
      // Subcontract totals are now stale — clear cache so they refresh on next open.
      setSubcontractsLoadedForSite(null);
    } catch (err: any) {
      alert("Failed to save: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Delete + redirect
  const [redirectDialog, setRedirectDialog] = useState<{ open: boolean; expense: ExpenseRow | null }>({
    open: false,
    expense: null,
  });
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    expense: ExpenseRow | null;
    reason: string;
  }>({ open: false, expense: null, reason: "" });

  const handleDelete = (row: ExpenseRow) => {
    if (row.source_type === "settlement") {
      setRedirectDialog({ open: true, expense: row });
      return;
    }
    if (row.source_type === "subcontract_payment") {
      alert("Direct subcontract payments cannot be deleted here. Use the Subcontracts page.");
      router.push("/site/subcontracts");
      return;
    }
    if (row.engineer_transaction_id) {
      setRedirectDialog({ open: true, expense: row });
      return;
    }
    setDeleteDialog({ open: true, expense: row, reason: "" });
  };

  const handleConfirmDelete = async () => {
    const expense = deleteDialog.expense;
    if (!expense) return;
    setSubmitting(true);
    try {
      if (expense.source_type === "misc_expense") {
        const result = await cancelMiscExpense(
          supabase,
          expense.source_id || expense.id,
          deleteDialog.reason || "Deleted from All Site Expenses",
          userProfile?.id || "",
          userProfile?.name || "",
        );
        if (!result.success) throw new Error(result.error || "Failed to delete misc expense");
      } else if (expense.source_type === "tea_shop_settlement") {
        const { error } = await supabase
          .from("tea_shop_settlements")
          .update({ is_cancelled: true })
          .eq("id", expense.source_id || expense.id);
        if (error) throw error;
      } else if (expense.source_type === "material_purchase") {
        const id = expense.source_id || expense.id;
        const { data: mpe, error: fe } = await supabase
          .from("material_purchase_expenses")
          .select("id, original_batch_code, settlement_reference")
          .eq("id", id)
          .single();
        if (fe) throw fe;
        if ((mpe as any)?.original_batch_code && (mpe as any)?.settlement_reference) {
          const { error: rpcErr } = await (supabase as any).rpc("cancel_allocated_expense", {
            p_expense_id: id,
            p_settlement_reference: (mpe as any).settlement_reference,
          });
          if (rpcErr) throw rpcErr;
        } else {
          const { error: delErr } = await supabase
            .from("material_purchase_expenses")
            .delete()
            .eq("id", id);
          if (delErr) throw delErr;
        }
      } else {
        const { error } = await supabase.from("expenses").delete().eq("id", expense.id);
        if (error) throw error;
      }
      setDeleteDialog({ open: false, expense: null, reason: "" });
      await refetch();
      setSubcontractsLoadedForSite(null);
    } catch (err: any) {
      alert("Failed to delete: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // InspectPane wiring (mirrors v1 ref-click behavior)
  const handleRefClick = useCallback(
    (row: ExpenseRow) => {
      const ref = row.settlement_reference;
      if (!ref || !selectedSite) return;
      if (ref.startsWith("MISC-")) {
        router.push(`/site/expenses/miscellaneous?highlight=${encodeURIComponent(ref)}`);
        return;
      }
      if (ref.startsWith("TSS-")) {
        router.push(`/site/tea-shop?highlight=${encodeURIComponent(ref)}`);
        return;
      }
      if (ref.startsWith("SCP-") || row.source_type === "subcontract_payment") {
        router.push("/site/subcontracts");
        return;
      }
      const isWeekly = ref.startsWith("WS-");
      if (isWeekly) {
        const lid = (row as any).contract_laborer_id;
        const ws = (row as any).week_start;
        const we = (row as any).week_end;
        if (lid && ws && we) {
          pane.open({
            kind: "weekly-week",
            siteId: selectedSite.id,
            laborerId: lid,
            weekStart: ws,
            weekEnd: we,
            settlementRef: ref,
          });
        } else {
          router.push(`/site/payments?tab=contract&highlight=${encodeURIComponent(ref)}`);
        }
        return;
      }
      pane.open({
        kind: "daily-date",
        siteId: selectedSite.id,
        date: row.date,
        settlementRef: ref,
      });
    },
    [pane, router, selectedSite],
  );

  if (!selectedSite) {
    return (
      <Box>
        <PageHeader title="All Site Expenses" titleChip={<ScopeChip />} />
        <Alert severity="warning">Please select a site</Alert>
      </Box>
    );
  }

  const breakdown = summary?.breakdown ?? {};
  const totalAmount = summary?.total ?? 0;
  const totalCount = summary?.totalCount ?? 0;
  const activeTypesLabel = labelForActiveTypes(activeTypes);

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 64px)",
        ...(isFullscreen && {
          position: "fixed",
          inset: 0,
          zIndex: 1300,
          height: "100vh",
          bgcolor: "background.default",
        }),
      }}
    >
      <Box sx={{ flexShrink: 0 }}>
        <PageHeader
          title="All Site Expenses"
          titleChip={<ScopeChip />}
          subtitle={`Track expenses for ${selectedSite.name}`}
          actions={
            <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={() => handleOpenDialog()}
                disabled={!canEdit}
                size="small"
              >
                Add Expense
              </Button>
              <Tooltip title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
                <IconButton size="small" onClick={() => setIsFullscreen((v) => !v)}>
                  {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
                </IconButton>
              </Tooltip>
            </Box>
          }
        />
        {auditState.isAuditing && auditState.dataStartedAt ? (
          <LegacyAuditBanner
            siteName={selectedSite.name}
            cutoffDate={auditState.dataStartedAt}
          />
        ) : null}
        {/* Trade chip — All / Civil / per-trade. Default "All" gives a
            single banded view grouped by trade. Self-hides on civil-only sites. */}
        <Box sx={{ px: { xs: 2, md: 2.5 }, pt: 1.5, pb: 0.5 }}>
          <TradeChipFilter
            siteId={selectedSite.id}
            selected={tradeChipSelection}
            onChange={setTradeChipSelection}
            allowAllChip
          />
        </Box>
      </Box>

      <ExpensesSummaryBand
        total={totalAmount}
        totalCount={totalCount}
        breakdown={breakdown}
        group={group}
        activeTypes={activeTypes}
        onSelectGroup={(g) => {
          setGroup(g);
          // Group changes clear specific type selections so we don't end up
          // with a contradictory state (e.g. group=building but types=Daily).
          setActiveTypes([]);
        }}
        onSelectTypes={(types) => {
          setActiveTypes(types);
          // If the selected types are exclusively in one group, snap the group
          // toggle to match — gives consistent visual feedback.
          if (types.length === 0) return;
          const labor = new Set([
            "Daily Salary",
            "Contract Salary",
            "Advance",
            "Excess",
            "Unlinked Salary",
            "Tea & Snacks",
            "Direct Payment",
          ]);
          const allLabor = types.every((t) => labor.has(t));
          const allBuilding = types.every((t) => !labor.has(t));
          if (allLabor) setGroup("labor");
          else if (allBuilding) setGroup("building");
        }}
        subcontracts={
          subcontractsLoadedForSite === selectedSite.id ? subcontracts : null
        }
        onOpenSubcontracts={handleOpenSubcontracts}
        subcontractsLoading={subcontractsLoading}
      />

      <ExpensesFilterBar
        search={search}
        onSearchChange={setSearch}
        group={group}
        onGroupChange={(g) => {
          setGroup(g);
          setActiveTypes([]);
        }}
        activeTypes={activeTypes}
        activeTypesLabel={activeTypesLabel}
        onClearTypes={() => setActiveTypes([])}
        status={status}
        onStatusChange={setStatus}
        hasMultiplePayers={hasMultiplePayers}
        sitePayers={sitePayers}
        sitePayerId={sitePayerId}
        onSitePayerChange={setSitePayerId}
        onResetAll={() => {
          setSearch("");
          setGroup("all");
          setActiveTypes([]);
          setStatus("all");
          setSitePayerId(null);
        }}
      />

      {resultLimitHit ? (
        <Alert
          severity="info"
          variant="outlined"
          sx={{ mx: { xs: 2, md: 2.5 }, mt: 1, py: 0.25, "& .MuiAlert-message": { py: 0.5 } }}
          action={
            canLoadMore ? (
              <Button
                color="inherit"
                size="small"
                disabled={isLoading}
                onClick={loadMore}
                sx={{ textTransform: "none" }}
              >
                {isLoading ? "Loading…" : `Load ${LOAD_MORE_STEP} more`}
              </Button>
            ) : null
          }
        >
          Showing latest {loadedLimit.toLocaleString("en-IN")} of {totalCount.toLocaleString("en-IN")} records.
          {canLoadMore
            ? ` Click "Load more" or narrow the date range.`
            : ` Reached the ${MAX_RESULT_LIMIT.toLocaleString("en-IN")} row ceiling — narrow the date range to see older rows.`}
        </Alert>
      ) : null}

      {tradeChipSelection.kind === "all" ? (
        <ExpensesGroupedByTrade
          rows={filteredRows}
          siteTrades={siteTrades}
          isLoading={isLoading}
          canEdit={canEdit}
          onRefClick={handleRefClick}
          onEdit={handleOpenDialog}
          onDelete={handleDelete}
        />
      ) : (
        <ExpensesTable
          rows={filteredRows}
          isLoading={isLoading}
          canEdit={canEdit}
          onRefClick={handleRefClick}
          onEdit={handleOpenDialog}
          onDelete={handleDelete}
        />
      )}

      {/* Add / Edit dialog (regular expenses only — settlement rows redirect) */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingExpense ? "Edit" : "Add"} Expense</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 2 }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 6 }}>
                <FormControl fullWidth>
                  <InputLabel>Module</InputLabel>
                  <Select
                    value={form.module}
                    onChange={(e) => setForm({ ...form, module: e.target.value as ExpenseModule, category_id: "" })}
                    label="Module"
                  >
                    <MenuItem value="material">Material</MenuItem>
                    <MenuItem value="machinery">Machinery</MenuItem>
                    <MenuItem value="general">General</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <FormControl fullWidth>
                  <InputLabel>Category</InputLabel>
                  <Select
                    value={form.category_id}
                    onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                    label="Category"
                  >
                    {categories
                      .filter((c) => c.module === form.module)
                      .map((c) => (
                        <MenuItem key={c.id} value={c.id}>
                          {c.name}
                        </MenuItem>
                      ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
            <Grid container spacing={2}>
              <Grid size={{ xs: 6 }}>
                <TextField
                  fullWidth
                  label="Date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField
                  fullWidth
                  label="Amount"
                  type="number"
                  value={form.amount || ""}
                  onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
                  slotProps={{ input: { startAdornment: "₹" } }}
                />
              </Grid>
            </Grid>
            <TextField
              fullWidth
              label="Vendor"
              value={form.vendor_name}
              onChange={(e) => setForm({ ...form, vendor_name: e.target.value })}
            />
            <TextField
              fullWidth
              label="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              multiline
              rows={2}
            />
            <FormControl fullWidth>
              <InputLabel>Payment Mode</InputLabel>
              <Select
                value={form.payment_mode}
                onChange={(e) => setForm({ ...form, payment_mode: e.target.value as PaymentMode })}
                label="Payment Mode"
              >
                <MenuItem value="cash">Cash</MenuItem>
                <MenuItem value="upi">UPI</MenuItem>
                <MenuItem value="bank_transfer">Bank Transfer</MenuItem>
                <MenuItem value="cheque">Cheque</MenuItem>
              </Select>
            </FormControl>
            {hasMultiplePayers && sitePayers.length > 0 ? (
              <FormControl fullWidth>
                <InputLabel>Paid By</InputLabel>
                <Select
                  value={form.site_payer_id}
                  onChange={(e) => setForm({ ...form, site_payer_id: e.target.value })}
                  label="Paid By"
                >
                  <MenuItem value="">
                    <em>Not specified</em>
                  </MenuItem>
                  {sitePayers.map((p) => (
                    <MenuItem key={p.id} value={p.id}>
                      {p.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            ) : null}
            <FormControlLabel
              control={
                <Switch
                  checked={form.is_cleared}
                  onChange={(e) => setForm({ ...form, is_cleared: e.target.checked })}
                />
              }
              label="Payment Cleared"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained" disabled={submitting}>
            {editingExpense ? "Update" : "Add"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Redirect dialog for settlement-derived expenses */}
      <RedirectConfirmDialog
        open={redirectDialog.open}
        onClose={() => setRedirectDialog({ open: false, expense: null })}
        title="Cannot Delete Salary Expense"
        message="This expense was created from a salary settlement. To modify or delete it, please cancel the payment in the Salary Settlement page first."
        targetPage="payments"
        targetParams={{
          date: redirectDialog.expense?.date,
          highlightType: "salary",
          transactionId: redirectDialog.expense?.engineer_transaction_id || undefined,
        }}
      />

      {/* Delete confirmation */}
      <Dialog
        open={deleteDialog.open}
        onClose={() => setDeleteDialog({ open: false, expense: null, reason: "" })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ pb: 1 }}>Delete Expense</DialogTitle>
        <DialogContent>
          {deleteDialog.expense ? (
            <Box sx={{ mb: 2 }}>
              <Alert severity="warning" sx={{ mb: 2 }}>
                Are you sure you want to delete this expense? This action cannot be undone.
              </Alert>
              <Box sx={{ p: 2, bgcolor: "action.hover", borderRadius: 1 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  <strong>Reference:</strong> {deleteDialog.expense.settlement_reference || "—"}
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  <strong>Type:</strong>{" "}
                  {deleteDialog.expense.expense_type || deleteDialog.expense.source_type || "—"}
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  <strong>Amount:</strong> ₹
                  {deleteDialog.expense.amount.toLocaleString("en-IN")}
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  <strong>Date:</strong> {dayjs(deleteDialog.expense.date).format("DD MMM YYYY")}
                </Typography>
                {deleteDialog.expense.vendor_name ? (
                  <Typography variant="body2" color="text.secondary">
                    <strong>Vendor:</strong> {deleteDialog.expense.vendor_name}
                  </Typography>
                ) : null}
              </Box>
              {deleteDialog.expense.source_type === "misc_expense" ? (
                <TextField
                  fullWidth
                  label="Reason for deletion (optional)"
                  value={deleteDialog.reason}
                  onChange={(e) =>
                    setDeleteDialog((prev) => ({ ...prev, reason: e.target.value }))
                  }
                  multiline
                  rows={2}
                  sx={{ mt: 2 }}
                  placeholder="Enter reason for deleting this expense..."
                />
              ) : null}
            </Box>
          ) : null}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setDeleteDialog({ open: false, expense: null, reason: "" })}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button variant="contained" color="error" onClick={handleConfirmDelete} disabled={submitting}>
            {submitting ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Subcontracts drawer */}
      <Drawer
        anchor="right"
        open={subcontractDrawerOpen}
        onClose={() => setSubcontractDrawerOpen(false)}
        PaperProps={{ sx: { width: { xs: "100%", sm: 480, md: 560 } } }}
      >
        <Box sx={{ p: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <ContractIcon color="primary" />
              <Typography variant="h6" fontWeight={600}>
                Subcontracts Summary
              </Typography>
            </Box>
            <IconButton onClick={() => setSubcontractDrawerOpen(false)} size="small">
              <Close />
            </IconButton>
          </Box>
          <Divider sx={{ mb: 3 }} />
          {subcontractsLoading ? (
            <Typography color="text.secondary">Loading…</Typography>
          ) : subcontracts && subcontracts.length > 0 ? (
            <>
              <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
                <Box sx={{ flex: 1, minWidth: 100, p: 2, bgcolor: "action.hover", borderRadius: 1.5 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                    Total Value
                  </Typography>
                  <Typography variant="h6" fontWeight={700}>
                    ₹{subcontracts.reduce((s, sc) => s + sc.totalValue, 0).toLocaleString("en-IN")}
                  </Typography>
                </Box>
                <Box sx={{ flex: 1, minWidth: 100, p: 2, bgcolor: "success.50", borderRadius: 1.5 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                    Total Paid
                  </Typography>
                  <Typography variant="h6" fontWeight={700} color="success.main">
                    ₹{subcontracts.reduce((s, sc) => s + sc.totalPaid, 0).toLocaleString("en-IN")}
                  </Typography>
                </Box>
                <Box sx={{ flex: 1, minWidth: 100, p: 2, bgcolor: "warning.50", borderRadius: 1.5 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                    Balance
                  </Typography>
                  <Typography variant="h6" fontWeight={700} color="warning.main">
                    ₹{subcontracts.reduce((s, sc) => s + sc.balance, 0).toLocaleString("en-IN")}
                  </Typography>
                </Box>
              </Box>
              <Divider sx={{ mb: 3 }} />
              <Typography
                variant="subtitle2"
                color="text.secondary"
                sx={{ mb: 2, textTransform: "uppercase", letterSpacing: 0.5 }}
              >
                Individual Subcontracts
              </Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {subcontracts.map((sc) => (
                  <Box
                    key={sc.subcontractId}
                    sx={{
                      p: 2,
                      border: 1,
                      borderColor: "divider",
                      borderRadius: 1.5,
                      "&:hover": { bgcolor: "action.hover" },
                    }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
                      <Typography variant="subtitle2" fontWeight={600}>
                        {sc.title}
                      </Typography>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Chip
                          label={sc.status.toUpperCase()}
                          size="small"
                          color={sc.status === "active" ? "success" : "warning"}
                          variant="outlined"
                        />
                        <IconButton
                          size="small"
                          onClick={() => router.push("/site/subcontracts")}
                          title="View subcontract details"
                        >
                          <OpenInNew fontSize="small" />
                        </IconButton>
                      </Box>
                    </Box>
                    <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Total Value
                        </Typography>
                        <Typography variant="body2" fontWeight={500}>
                          ₹{sc.totalValue.toLocaleString("en-IN")}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Paid
                        </Typography>
                        <Typography variant="body2" fontWeight={500} color="success.main">
                          ₹{sc.totalPaid.toLocaleString("en-IN")}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Balance
                        </Typography>
                        <Typography
                          variant="body2"
                          fontWeight={500}
                          color={sc.balance > 0 ? "warning.main" : "success.main"}
                        >
                          ₹{sc.balance.toLocaleString("en-IN")}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Records
                        </Typography>
                        <Typography variant="body2" fontWeight={500} color="text.secondary">
                          {sc.totalRecordCount}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                ))}
              </Box>
              <Box sx={{ mt: 3 }}>
                <Button
                  fullWidth
                  variant="outlined"
                  endIcon={<OpenInNew />}
                  onClick={() => router.push("/site/subcontracts")}
                >
                  View All Subcontracts
                </Button>
              </Box>
            </>
          ) : (
            <Typography color="text.secondary">No subcontracts found for this site.</Typography>
          )}
        </Box>
      </Drawer>

      {/* InspectPane for settlement detail (DLY-/SS-/WS- ref clicks) */}
      <InspectPane
        entity={pane.currentEntity}
        isOpen={pane.isOpen}
        isPinned={pane.isPinned}
        activeTab={pane.activeTab}
        onTabChange={pane.setActiveTab}
        onClose={pane.close}
        onTogglePin={pane.togglePin}
        onOpenInPage={(e) => {
          const ref = entitySettlementRef(e) ?? "";
          const url =
            e.kind === "daily-date"
              ? `/site/payments?ref=${ref}&date=${e.date}`
              : `/site/payments?ref=${ref}`;
          router.push(url);
        }}
      />
    </Box>
  );
}
