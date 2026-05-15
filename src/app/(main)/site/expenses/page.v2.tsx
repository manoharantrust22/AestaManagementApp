"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableRow,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  Add,
  Close,
  Delete,
  Description as ContractIcon,
  DensityLarge,
  DensitySmall,
  Edit,
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon,
  OpenInNew,
  Search,
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
  BUILDING_TYPES,
  LABOR_TYPES,
  LOAD_MORE_STEP,
  MAX_RESULT_LIMIT,
  type ExpenseGroup,
  type ExpenseRow,
  type ExpenseStatus,
  useExpensesData,
  useExpenseTradeSummary,
} from "@/hooks/queries/useExpensesData";
import { useExpensePageKPIs, computeBurnRate } from "@/hooks/queries/useExpensePageKPIs";
import { ExpenseKPICards } from "@/components/expenses/ExpenseKPICards";
import { MoneyBreakdownCard } from "@/components/expenses/MoneyBreakdownCard";
import { TradeMetricCards } from "@/components/expenses/TradeMetricCards";
import RentalExpenseInspectPane from "@/components/expenses/RentalExpenseInspectPane";
import { useSiteTrades } from "@/hooks/queries/useTrades";

import type { Database } from "@/types/database.types";
type ExpenseModule = Database["public"]["Enums"]["expense_module"];
type PaymentMode = Database["public"]["Enums"]["payment_mode"];

// ─── Types ───────────────────────────────────────────────────────────────────

type GroupByOption = "none" | "trade" | "kind" | "date" | "vendor";

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

type TableItem =
  | { type: "row"; row: ExpenseRow }
  | { type: "group"; label: string; count: number; total: number };

// ─── Helpers ─────────────────────────────────────────────────────────────────

const LABOR_SET = new Set(LABOR_TYPES as readonly string[]);
const BUILDING_SET = new Set(BUILDING_TYPES as readonly string[]);

function formatINR(n: number): string {
  return "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.abs(n));
}

function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_00_000) return "₹" + (abs / 1_00_000).toFixed(2) + "L";
  if (abs >= 1_000) return "₹" + (abs / 1_000).toFixed(1) + "k";
  return formatINR(abs);
}

function getKind(row: ExpenseRow): "labor" | "building" | "other" {
  if (LABOR_SET.has(row.expense_type)) return "labor";
  if (BUILDING_SET.has(row.expense_type)) return "building";
  return "other";
}

function getDisplayStatus(row: ExpenseRow): "paid" | "advance" | "pending" {
  if (row.expense_type === "Advance") return "advance";
  if (row.is_cleared) return "paid";
  return "pending";
}

function refChipColor(ref: string | null): string {
  if (!ref) return "#9e9e9e";
  if (ref.startsWith("DLY-")) return "#1976d2";
  if (ref.startsWith("SS-")) return "#7b1fa2";
  if (ref.startsWith("WS-")) return "#0097a7";
  if (ref.startsWith("TSS-")) return "#2e7d32";
  if (ref.startsWith("SCP-")) return "#0288d1";
  if (ref.startsWith("MISC-")) return "#757575";
  return "#9e9e9e";
}

// ─── Main component ───────────────────────────────────────────────────────────

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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  // Filter state — URL-synced
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

  // New UI state
  const [tradeFilter, setTradeFilter] = useState<string>(
    () => searchParams.get("trade") ?? "all",
  );
  const [subKindFilter, setSubKindFilter] = useState<string>("all");
  const [groupBy, setGroupBy] = useState<GroupByOption>("none");
  const [dense, setDense] = useState(false);
  const [mobileTab, setMobileTab] = useState<0 | 1>(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [rentalPaneOrderId, setRentalPaneOrderId] = useState<string | null>(null);

  const tableRef = useRef<HTMLDivElement>(null);

  // URL sync
  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (group !== "all") params.set("group", group);
    if (activeTypes.length > 0) params.set("types", activeTypes.join(","));
    if (status !== "all") params.set("status", status);
    if (sitePayerId) params.set("payer", sitePayerId);
    if (tradeFilter !== "all") params.set("trade", tradeFilter);
    const qs = params.toString();
    router.replace(`/site/expenses${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [search, group, activeTypes, status, sitePayerId, tradeFilter, router]);

  // Multi-payer settings
  const [hasMultiplePayers, setHasMultiplePayers] = useState(false);
  const [sitePayers, setSitePayers] = useState<SitePayer[]>([]);

  useEffect(() => {
    const run = async () => {
      if (!selectedSite) { setHasMultiplePayers(false); setSitePayers([]); return; }
      try {
        const { data: siteData } = await supabase.from("sites").select("*").eq("id", selectedSite.id).single();
        const isMulti = (siteData as any)?.has_multiple_payers || false;
        setHasMultiplePayers(isMulti);
        if (isMulti) {
          const { data } = await (supabase as any).from("site_payers").select("id, name, is_active").eq("site_id", selectedSite.id).eq("is_active", true).order("name");
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

  // Categories for add/edit dialog
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  useEffect(() => {
    const run = async () => {
      const { data } = await supabase.from("expense_categories").select("*").order("module").order("name");
      setCategories((data as any) || []);
    };
    run();
  }, [supabase]);

  // Subcontracts drawer (lazy-loaded)
  const [subcontracts, setSubcontracts] = useState<SubcontractTotals[] | null>(null);
  const [subcontractsLoading, setSubcontractsLoading] = useState(false);
  const [subcontractDrawerOpen, setSubcontractDrawerOpen] = useState(false);
  const [subcontractsLoadedForSite, setSubcontractsLoadedForSite] = useState<string | null>(null);

  useEffect(() => { setSubcontracts(null); setSubcontractsLoadedForSite(null); }, [selectedSite?.id]);

  const fetchSubcontracts = useCallback(async () => {
    if (!selectedSite?.id) return;
    setSubcontractsLoading(true);
    try {
      const summaries = await getSiteSubcontractTotals(supabase, selectedSite.id, ["active", "on_hold", "completed", "draft", "cancelled"]);
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
    if (selectedSite?.id && subcontractsLoadedForSite !== selectedSite.id && !subcontractsLoading) {
      void fetchSubcontracts();
    }
  }, [fetchSubcontracts, selectedSite?.id, subcontractsLoadedForSite, subcontractsLoading]);

  // Data hooks
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

  const { data: financial, isLoading: financialLoading } = useExpensePageKPIs(selectedSite?.id);
  const { data: siteTrades } = useSiteTrades(selectedSite?.id);
  const { data: tradeSummary = [], isLoading: tradeSummaryLoading } = useExpenseTradeSummary(
    selectedSite?.id,
    dateFrom ?? null,
    dateTo ?? null,
  );

  // contract_id → trade category map
  const contractToTrade = useMemo(() => {
    const map = new Map<string, { name: string; id: string }>();
    for (const t of siteTrades ?? []) {
      for (const c of t.contracts) map.set(c.id, { name: t.category.name, id: t.category.id });
    }
    return map;
  }, [siteTrades]);

  // contract_id → subcontract title map
  const contractToSubcontract = useMemo(() => {
    const map = new Map<string, { title: string }>();
    for (const t of siteTrades ?? []) {
      for (const c of t.contracts) map.set(c.id, { title: c.title });
    }
    return map;
  }, [siteTrades]);

  // Burn rate (client-side from loaded expenses)
  const burnRate = useMemo(
    () => computeBurnRate(expenses, financial ? Math.max(0, financial.totalContract - (summary?.total ?? 0)) : undefined),
    [expenses, financial, summary],
  );

  // Free-text search
  const searchedRows = useMemo(() => {
    if (!search.trim()) return expenses;
    const q = search.trim().toLowerCase();
    return expenses.filter(
      (r) =>
        r.settlement_reference?.toLowerCase().includes(q) ||
        r.vendor_name?.toLowerCase().includes(q) ||
        r.description?.toLowerCase().includes(q) ||
        r.payer_name?.toLowerCase().includes(q) ||
        r.subcontract_title?.toLowerCase().includes(q) ||
        r.expense_type?.toLowerCase().includes(q),
    );
  }, [expenses, search]);

  // Trade + sub-kind client-side filter
  const filteredRows = useMemo(() => {
    let rows = searchedRows;

    if (tradeFilter !== "all") {
      if (tradeFilter === "__unlinked__") {
        rows = rows.filter((r) => !r.contract_id);
      } else if (tradeFilter === "__site_wide__") {
        rows = rows.filter((r) => !r.contract_id || !contractToTrade.has(r.contract_id));
      } else {
        rows = rows.filter((r) => {
          if (!r.contract_id) return false;
          return contractToTrade.get(r.contract_id)?.id === tradeFilter;
        });
      }
    }

    if (subKindFilter !== "all") {
      rows = rows.filter((r) => r.expense_type === subKindFilter);
    }

    return rows;
  }, [searchedRows, tradeFilter, subKindFilter, contractToTrade]);

  // Footer totals
  const laborTotal = useMemo(
    () => filteredRows.filter((r) => LABOR_SET.has(r.expense_type)).reduce((s, r) => s + r.amount, 0),
    [filteredRows],
  );
  const buildingTotal = useMemo(
    () => filteredRows.filter((r) => BUILDING_SET.has(r.expense_type)).reduce((s, r) => s + r.amount, 0),
    [filteredRows],
  );
  const filteredTotal = laborTotal + buildingTotal;

  // Grouped table items
  const tableItems = useMemo<TableItem[]>(() => {
    if (groupBy === "none") return filteredRows.map((row) => ({ type: "row", row }));

    const getKey = (row: ExpenseRow): string => {
      if (groupBy === "trade") {
        if (!row.contract_id) return "Site-wide";
        return contractToTrade.get(row.contract_id)?.name ?? "Site-wide";
      }
      if (groupBy === "kind") return LABOR_SET.has(row.expense_type) ? "Labor" : "Building";
      if (groupBy === "date") return row.date;
      if (groupBy === "vendor") return row.vendor_name ?? "—";
      return "";
    };

    const groups = new Map<string, ExpenseRow[]>();
    for (const row of filteredRows) {
      const key = getKey(row);
      const arr = groups.get(key) ?? [];
      arr.push(row);
      groups.set(key, arr);
    }

    const items: TableItem[] = [];
    for (const [label, rows] of groups) {
      const displayLabel =
        groupBy === "date" ? dayjs(label).format("DD MMM YYYY") : label;
      items.push({
        type: "group",
        label: displayLabel,
        count: rows.length,
        total: rows.reduce((s, r) => s + r.amount, 0),
      });
      for (const row of rows) items.push({ type: "row", row });
    }
    return items;
  }, [filteredRows, groupBy, contractToTrade]);

  // Has any active filter
  const hasFilter =
    search.trim() !== "" ||
    group !== "all" ||
    activeTypes.length > 0 ||
    status !== "all" ||
    tradeFilter !== "all" ||
    subKindFilter !== "all";

  const resetAllFilters = () => {
    setSearch("");
    setGroup("all");
    setActiveTypes([]);
    setStatus("all");
    setTradeFilter("all");
    setSubKindFilter("all");
    setSitePayerId(null);
  };

  // Trade card click → filter table + scroll
  const handleTradeCardClick = useCallback(
    (tradeCategoryId: string | null) => {
      const newFilter = tradeCategoryId === null ? "__site_wide__" : tradeCategoryId;
      setTradeFilter(newFilter);
      setTimeout(() => tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    },
    [],
  );

  // Add/Edit dialog state
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
    if (row?.source_type === "rental_settlement") {
      setRentalPaneOrderId(row.source_id || null);
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
      setSubcontractsLoadedForSite(null);
    } catch (err: any) {
      alert("Failed to save: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const [redirectDialog, setRedirectDialog] = useState<{ open: boolean; expense: ExpenseRow | null }>({
    open: false,
    expense: null,
  });
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; expense: ExpenseRow | null; reason: string }>({
    open: false,
    expense: null,
    reason: "",
  });

  const handleDelete = (row: ExpenseRow) => {
    if (row.source_type === "settlement") { setRedirectDialog({ open: true, expense: row }); return; }
    if (row.source_type === "subcontract_payment") {
      alert("Direct subcontract payments cannot be deleted here. Use the Subcontracts page.");
      router.push("/site/subcontracts");
      return;
    }
    if (row.source_type === "rental_settlement") {
      alert("Rental settlements must be managed from the Rentals page.");
      return;
    }
    if (row.engineer_transaction_id) { setRedirectDialog({ open: true, expense: row }); return; }
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
        const { error } = await supabase.from("tea_shop_settlements").update({ is_cancelled: true }).eq("id", expense.source_id || expense.id);
        if (error) throw error;
      } else if (expense.source_type === "material_purchase") {
        const id = expense.source_id || expense.id;
        const { data: mpe, error: fe } = await supabase.from("material_purchase_expenses").select("id, original_batch_code, settlement_reference").eq("id", id).single();
        if (fe) throw fe;
        if ((mpe as any)?.original_batch_code && (mpe as any)?.settlement_reference) {
          const { error: rpcErr } = await (supabase as any).rpc("cancel_allocated_expense", { p_expense_id: id, p_settlement_reference: (mpe as any).settlement_reference });
          if (rpcErr) throw rpcErr;
        } else {
          const { error: delErr } = await supabase.from("material_purchase_expenses").delete().eq("id", id);
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

  const handleRefClick = useCallback(
    (row: ExpenseRow) => {
      const ref = row.settlement_reference;
      if (!ref || !selectedSite) return;
      if (ref.startsWith("MISC-")) { router.push(`/site/expenses/miscellaneous?highlight=${encodeURIComponent(ref)}`); return; }
      if (ref.startsWith("TSS-")) { router.push(`/site/tea-shop?highlight=${encodeURIComponent(ref)}`); return; }
      if (ref.startsWith("SCP-") || row.source_type === "subcontract_payment") { router.push("/site/subcontracts"); return; }
      if (ref.startsWith("WS-")) {
        const lid = (row as any).contract_laborer_id;
        const ws = (row as any).week_start;
        const we = (row as any).week_end;
        if (lid && ws && we) {
          pane.open({ kind: "weekly-week", siteId: selectedSite.id, laborerId: lid, weekStart: ws, weekEnd: we, settlementRef: ref });
        } else {
          router.push(`/site/payments?tab=contract&highlight=${encodeURIComponent(ref)}`);
        }
        return;
      }
      pane.open({ kind: "daily-date", siteId: selectedSite.id, date: row.date, settlementRef: ref });
    },
    [pane, router, selectedSite],
  );

  // Sub-kind options (derived from summary breakdown) — must be before early return
  const subKindOptions = useMemo(
    () => {
      const b = summary?.breakdown ?? {};
      return Object.keys(b).filter((k) => (b[k]?.amount ?? 0) > 0).sort();
    },
    [summary],
  );

  // ─── Early return ─────────────────────────────────────────────────────────

  if (!selectedSite) {
    return (
      <Box>
        <PageHeader title="All Site Expenses" titleChip={<ScopeChip />} />
        <Alert severity="warning">Please select a site</Alert>
      </Box>
    );
  }

  const totalAmount = summary?.total ?? 0;
  const totalCount = summary?.totalCount ?? 0;
  const breakdown = summary?.breakdown ?? {};

  // ─── JSX helpers ─────────────────────────────────────────────────────────

  const pageHeader = (
    <Box sx={{ flexShrink: 0 }}>
      <PageHeader
        title="All Site Expenses"
        titleChip={<ScopeChip />}
        subtitle={`Track expenses for ${selectedSite.name}`}
        actions={
          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            <Button variant="contained" startIcon={<Add />} onClick={() => handleOpenDialog()} disabled={!canEdit} size="small">
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
        <LegacyAuditBanner siteName={selectedSite.name} cutoffDate={auditState.dataStartedAt} />
      ) : null}
    </Box>
  );

  // ─── Expenses table section ───────────────────────────────────────────────

  const expensesTable = (
    <Paper ref={tableRef} variant="outlined" sx={{ borderRadius: 2, overflow: "hidden", mb: 4 }}>
      {/* Toolbar row 1 */}
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: 1,
          p: 1.5,
          borderBottom: 1,
          borderColor: "divider",
          alignItems: "center",
        }}
      >
        <TextField
          size="small"
          placeholder="Search ref code, vendor, description…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: 220, flex: 1 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search sx={{ fontSize: 16, color: "text.disabled" }} />
                </InputAdornment>
              ),
              endAdornment: search ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearch("")}>
                    <Close sx={{ fontSize: 14 }} />
                  </IconButton>
                </InputAdornment>
              ) : null,
            },
          }}
        />

        {/* Kind pills */}
        <ToggleButtonGroup
          value={group}
          exclusive
          size="small"
          onChange={(_, v) => { if (v) { setGroup(v); setActiveTypes([]); } }}
        >
          <ToggleButton value="all" sx={{ px: 1.5, textTransform: "none", fontSize: 12 }}>All</ToggleButton>
          <ToggleButton value="labor" sx={{ px: 1.5, textTransform: "none", fontSize: 12 }}>Labor</ToggleButton>
          <ToggleButton value="building" sx={{ px: 1.5, textTransform: "none", fontSize: 12 }}>Building</ToggleButton>
        </ToggleButtonGroup>

        {/* Trade select */}
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <Select
            value={tradeFilter}
            onChange={(e) => setTradeFilter(e.target.value)}
            displayEmpty
            sx={{ borderRadius: 99, fontSize: 13 }}
          >
            <MenuItem value="all">All trades</MenuItem>
            <MenuItem value="__unlinked__">Unlinked</MenuItem>
            {siteTrades?.map((t) => (
              <MenuItem key={t.category.id} value={t.category.id}>{t.category.name}</MenuItem>
            ))}
            <MenuItem value="__site_wide__">Site-wide</MenuItem>
          </Select>
        </FormControl>

        {/* Sub-kind select */}
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <Select
            value={subKindFilter}
            onChange={(e) => setSubKindFilter(e.target.value)}
            displayEmpty
            sx={{ borderRadius: 99, fontSize: 13 }}
          >
            <MenuItem value="all">All sub-kinds</MenuItem>
            {subKindOptions.map((k) => <MenuItem key={k} value={k}>{k}</MenuItem>)}
          </Select>
        </FormControl>

        {/* Status select */}
        <FormControl size="small" sx={{ minWidth: 110 }}>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as ExpenseStatus)}
            displayEmpty
            sx={{ borderRadius: 99, fontSize: 13 }}
          >
            <MenuItem value="all">All status</MenuItem>
            <MenuItem value="cleared">Paid</MenuItem>
            <MenuItem value="pending">Pending</MenuItem>
          </Select>
        </FormControl>

        <Box sx={{ flex: 1 }} />
        <Button size="small" variant="outlined" color="inherit" sx={{ color: "text.secondary", fontSize: 12 }}>
          Export
        </Button>
      </Box>

      {/* Toolbar row 2 */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 1.5,
          py: 0.75,
          borderBottom: 1,
          borderColor: "divider",
          bgcolor: "action.hover",
        }}
      >
        <Typography variant="body2" fontWeight={600} sx={{ fontVariantNumeric: "tabular-nums" }}>
          {filteredRows.length} records
        </Typography>
        {hasFilter && (
          <Button size="small" sx={{ fontSize: 12, textTransform: "none", py: 0 }} onClick={resetAllFilters}>
            Clear filters
          </Button>
        )}
        <Box sx={{ flex: 1 }} />

        {/* Group by */}
        <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
          Group by
        </Typography>
        <ToggleButtonGroup
          value={groupBy}
          exclusive
          size="small"
          onChange={(_, v) => { if (v) setGroupBy(v); }}
        >
          {(["none", "trade", "kind", "date", "vendor"] as GroupByOption[]).map((opt) => (
            <ToggleButton key={opt} value={opt} sx={{ px: 1, textTransform: "none", fontSize: 11 }}>
              {opt.charAt(0).toUpperCase() + opt.slice(1)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        {/* Density toggle */}
        <Tooltip title={dense ? "Comfortable view" : "Dense view"}>
          <IconButton size="small" onClick={() => setDense((d) => !d)}>
            {dense ? <DensityLarge fontSize="small" /> : <DensitySmall fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Box>

      {/* Load more alert */}
      {resultLimitHit && (
        <Alert
          severity="info"
          variant="outlined"
          sx={{ mx: 1.5, mt: 1, py: 0.25, "& .MuiAlert-message": { py: 0.5 } }}
          action={
            canLoadMore ? (
              <Button color="inherit" size="small" disabled={isLoading} onClick={loadMore} sx={{ textTransform: "none" }}>
                {isLoading ? "Loading…" : `Load ${LOAD_MORE_STEP} more`}
              </Button>
            ) : null
          }
        >
          Showing latest {loadedLimit.toLocaleString("en-IN")} of {totalCount.toLocaleString("en-IN")} records.
        </Alert>
      )}

      {/* Table */}
      <TableContainer sx={{ maxHeight: "calc(100vh - 420px)", minHeight: 200 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              {["Date", "Ref", "Vendor / Description", "Trade", "Kind", "Status", "Amount", ""].map((h) => (
                <TableCell
                  key={h}
                  align={h === "Amount" ? "right" : "left"}
                  sx={{
                    fontWeight: 700,
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    color: "text.secondary",
                    bgcolor: "background.paper",
                    py: dense ? 0.75 : 1,
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>

          <TableBody>
            {isLoading && filteredRows.length === 0 ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 8 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton variant="text" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : tableItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 5, color: "text.disabled" }}>
                  No expenses match your filters.
                </TableCell>
              </TableRow>
            ) : (
              tableItems.map((item, idx) => {
                if (item.type === "group") {
                  return (
                    <TableRow key={`group-${idx}`} sx={{ bgcolor: "action.hover" }}>
                      <TableCell colSpan={7} sx={{ py: 0.75, fontWeight: 600, fontSize: 12 }}>
                        {item.label}{" "}
                        <Box component="span" sx={{ color: "text.disabled", fontWeight: 400 }}>
                          · {item.count}
                        </Box>
                      </TableCell>
                      <TableCell align="right" sx={{ py: 0.75, fontWeight: 700, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
                        {formatINR(item.total)}
                      </TableCell>
                    </TableRow>
                  );
                }

                const row = item.row;
                const tradeInfo = row.contract_id ? contractToTrade.get(row.contract_id) : null;
                const kindLabel = LABOR_SET.has(row.expense_type) ? "Labor" : BUILDING_SET.has(row.expense_type) ? "Building" : null;
                const displayStatus = getDisplayStatus(row);

                return (
                  <TableRow
                    key={row.id}
                    sx={{
                      "&:hover": { bgcolor: "action.hover" },
                      borderTop: 1,
                      borderColor: "divider",
                    }}
                  >
                    {/* Date */}
                    <TableCell sx={{ py: dense ? 0.5 : 1, color: "text.secondary", fontSize: 12, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                      {dayjs(row.date).format("DD MMM")}
                    </TableCell>

                    {/* Ref */}
                    <TableCell sx={{ py: dense ? 0.5 : 1 }}>
                      {row.settlement_reference ? (
                        <Box
                          component="span"
                          onClick={() => handleRefClick(row)}
                          sx={{
                            cursor: "pointer",
                            fontSize: 11,
                            fontFamily: "monospace",
                            color: refChipColor(row.settlement_reference),
                            bgcolor: `${refChipColor(row.settlement_reference)}15`,
                            px: 0.75,
                            py: 0.25,
                            borderRadius: 1,
                            whiteSpace: "nowrap",
                            "&:hover": { opacity: 0.8 },
                          }}
                        >
                          {row.settlement_reference}
                        </Box>
                      ) : (
                        <Typography variant="caption" color="text.disabled">—</Typography>
                      )}
                    </TableCell>

                    {/* Vendor / Description */}
                    <TableCell sx={{ py: dense ? 0.5 : 1, maxWidth: 260 }}>
                      <Typography variant="body2" fontWeight={600} noWrap>
                        {row.vendor_name || row.description || "—"}
                      </Typography>
                      {!dense && row.vendor_name && row.description && (
                        <Typography variant="caption" color="text.secondary" noWrap display="block">
                          {row.description}
                        </Typography>
                      )}
                    </TableCell>

                    {/* Trade */}
                    <TableCell sx={{ py: dense ? 0.5 : 1 }}>
                      {tradeInfo ? (
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                          <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "primary.main", flexShrink: 0 }} />
                          <Typography variant="caption" noWrap>{tradeInfo.name}</Typography>
                        </Box>
                      ) : (
                        <Typography variant="caption" color="text.disabled">Site-wide</Typography>
                      )}
                    </TableCell>

                    {/* Kind */}
                    <TableCell sx={{ py: dense ? 0.5 : 1 }}>
                      {kindLabel && (
                        <Chip
                          label={row.expense_type}
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: 10,
                            fontWeight: 600,
                            bgcolor: kindLabel === "Labor" ? "primary.50" : "secondary.50",
                            color: kindLabel === "Labor" ? "primary.dark" : "secondary.dark",
                            border: "none",
                          }}
                        />
                      )}
                    </TableCell>

                    {/* Status */}
                    <TableCell sx={{ py: dense ? 0.5 : 1 }}>
                      <Chip
                        label={displayStatus === "paid" ? "Paid" : displayStatus === "advance" ? "Advance" : "Pending"}
                        size="small"
                        color={displayStatus === "paid" ? "success" : displayStatus === "advance" ? "info" : "warning"}
                        variant="outlined"
                        sx={{ height: 20, fontSize: 10, fontWeight: 600 }}
                      />
                    </TableCell>

                    {/* Amount */}
                    <TableCell align="right" sx={{ py: dense ? 0.5 : 1, fontWeight: 700, fontSize: 13, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                      {formatINR(row.amount)}
                    </TableCell>

                    {/* Actions */}
                    <TableCell sx={{ py: dense ? 0.5 : 1, width: 60 }}>
                      {canEdit && (
                        <Box sx={{ display: "flex", gap: 0 }}>
                          <Tooltip title="Edit">
                            <IconButton size="small" onClick={() => handleOpenDialog(row)} sx={{ p: 0.25 }}>
                              <Edit sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Delete">
                            <IconButton size="small" onClick={() => handleDelete(row)} sx={{ p: 0.25 }} color="error">
                              <Delete sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>

          {/* Sticky footer */}
          <TableFooter>
            <TableRow sx={{ bgcolor: "background.paper", borderTop: 2, borderColor: "divider" }}>
              <TableCell colSpan={5} sx={{ py: 1 }}>
                <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
                  <Typography variant="caption" color="text.secondary">
                    Labor{" "}
                    <Box component="span" fontWeight={700} color="text.primary" sx={{ fontVariantNumeric: "tabular-nums" }}>
                      {formatCompact(laborTotal)}
                    </Box>
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Building{" "}
                    <Box component="span" fontWeight={700} color="text.primary" sx={{ fontVariantNumeric: "tabular-nums" }}>
                      {formatCompact(buildingTotal)}
                    </Box>
                  </Typography>
                </Box>
              </TableCell>
              <TableCell colSpan={2} align="right" sx={{ py: 1 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary" textTransform="uppercase" letterSpacing={0.5}>
                    {hasFilter ? "Filtered total" : "Total"}
                  </Typography>
                  <Typography variant="subtitle1" fontWeight={700} sx={{ fontVariantNumeric: "tabular-nums", letterSpacing: -0.2 }}>
                    {formatINR(filteredTotal)}
                  </Typography>
                </Box>
              </TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      </TableContainer>
    </Paper>
  );

  // ─── Main render ──────────────────────────────────────────────────────────

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        minHeight: "calc(100vh - 64px)",
        ...(isFullscreen && {
          position: "fixed",
          inset: 0,
          zIndex: 1300,
          height: "100vh",
          bgcolor: "background.default",
        }),
      }}
    >
      {pageHeader}

      <Box sx={{ flex: 1, overflowY: "auto", p: { xs: 1.5, md: 2 } }}>
        {isMobile ? (
          /* Mobile layout: two-tab */
          <>
            <Tabs value={mobileTab} onChange={(_, v) => setMobileTab(v)} sx={{ mb: 2 }}>
              <Tab label="Overview" />
              <Tab label={`Expenses (${totalCount})`} />
            </Tabs>

            {mobileTab === 0 ? (
              <>
                <ExpenseKPICards
                  total={totalAmount}
                  totalCount={totalCount}
                  financial={financial}
                  isFinancialLoading={financialLoading}
                  burnRate={burnRate}
                  onContractsClick={() => router.push("/site/payments")}
                />
                <MoneyBreakdownCard
                  total={totalAmount}
                  totalCount={totalCount}
                  breakdown={breakdown}
                  onOpenSubcontracts={handleOpenSubcontracts}
                />
                <TradeMetricCards
                  tradeSummary={tradeSummary}
                  siteTrades={siteTrades}
                  onCardClick={(id) => { handleTradeCardClick(id); setMobileTab(1); }}
                  onEmptyCardClick={() => handleOpenDialog()}
                  isLoading={tradeSummaryLoading}
                />
              </>
            ) : (
              expensesTable
            )}

            {/* Mobile FAB */}
            {canEdit && (
              <Box
                component="button"
                onClick={() => handleOpenDialog()}
                sx={{
                  position: "fixed",
                  bottom: 24,
                  right: 24,
                  zIndex: 1200,
                  bgcolor: "primary.main",
                  color: "#fff",
                  border: "none",
                  borderRadius: 99,
                  px: 3,
                  py: 1.5,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  boxShadow: "0 10px 24px rgba(25, 118, 210, .35)",
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  "&:hover": { bgcolor: "primary.dark" },
                }}
              >
                <Add sx={{ fontSize: 18 }} /> Add expense
              </Box>
            )}
          </>
        ) : (
          /* Desktop layout */
          <>
            <ExpenseKPICards
              total={totalAmount}
              totalCount={totalCount}
              financial={financial}
              isFinancialLoading={financialLoading}
              burnRate={burnRate}
              onContractsClick={() => router.push("/site/payments")}
            />
            <MoneyBreakdownCard
              total={totalAmount}
              totalCount={totalCount}
              breakdown={breakdown}
              onOpenSubcontracts={handleOpenSubcontracts}
            />
            <TradeMetricCards
              tradeSummary={tradeSummary}
              siteTrades={siteTrades}
              onCardClick={handleTradeCardClick}
              onEmptyCardClick={() => handleOpenDialog()}
              isLoading={tradeSummaryLoading}
            />
            {expensesTable}
          </>
        )}
      </Box>

      {/* ─── Dialogs ─────────────────────────────────────────────────────── */}

      {/* Add / Edit expense */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingExpense ? "Edit" : "Add"} Expense</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 2 }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 6 }}>
                <FormControl fullWidth>
                  <InputLabel>Module</InputLabel>
                  <Select value={form.module} onChange={(e) => setForm({ ...form, module: e.target.value as ExpenseModule, category_id: "" })} label="Module">
                    <MenuItem value="material">Material</MenuItem>
                    <MenuItem value="machinery">Machinery</MenuItem>
                    <MenuItem value="general">General</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 6 }}>
                <FormControl fullWidth>
                  <InputLabel>Category</InputLabel>
                  <Select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} label="Category">
                    {categories.filter((c) => c.module === form.module).map((c) => (
                      <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
            <Grid container spacing={2}>
              <Grid size={{ xs: 6 }}>
                <TextField fullWidth label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
              </Grid>
              <Grid size={{ xs: 6 }}>
                <TextField fullWidth label="Amount" type="number" value={form.amount || ""} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} slotProps={{ input: { startAdornment: "₹" } }} />
              </Grid>
            </Grid>
            <TextField fullWidth label="Vendor" value={form.vendor_name} onChange={(e) => setForm({ ...form, vendor_name: e.target.value })} />
            <TextField fullWidth label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} multiline rows={2} />
            <FormControl fullWidth>
              <InputLabel>Payment Mode</InputLabel>
              <Select value={form.payment_mode} onChange={(e) => setForm({ ...form, payment_mode: e.target.value as PaymentMode })} label="Payment Mode">
                <MenuItem value="cash">Cash</MenuItem>
                <MenuItem value="upi">UPI</MenuItem>
                <MenuItem value="bank_transfer">Bank Transfer</MenuItem>
                <MenuItem value="cheque">Cheque</MenuItem>
              </Select>
            </FormControl>
            {hasMultiplePayers && sitePayers.length > 0 && (
              <FormControl fullWidth>
                <InputLabel>Paid By</InputLabel>
                <Select value={form.site_payer_id} onChange={(e) => setForm({ ...form, site_payer_id: e.target.value })} label="Paid By">
                  <MenuItem value=""><em>Not specified</em></MenuItem>
                  {sitePayers.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
                </Select>
              </FormControl>
            )}
            <FormControlLabel
              control={<Switch checked={form.is_cleared} onChange={(e) => setForm({ ...form, is_cleared: e.target.checked })} />}
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

      {/* Redirect dialog */}
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
      <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, expense: null, reason: "" })} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>Delete Expense</DialogTitle>
        <DialogContent>
          {deleteDialog.expense && (
            <Box sx={{ mb: 2 }}>
              <Alert severity="warning" sx={{ mb: 2 }}>
                Are you sure you want to delete this expense? This action cannot be undone.
              </Alert>
              <Box sx={{ p: 2, bgcolor: "action.hover", borderRadius: 1 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  <strong>Reference:</strong> {deleteDialog.expense.settlement_reference || "—"}
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  <strong>Type:</strong> {deleteDialog.expense.expense_type || deleteDialog.expense.source_type || "—"}
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  <strong>Amount:</strong> ₹{deleteDialog.expense.amount.toLocaleString("en-IN")}
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  <strong>Date:</strong> {dayjs(deleteDialog.expense.date).format("DD MMM YYYY")}
                </Typography>
                {deleteDialog.expense.vendor_name && (
                  <Typography variant="body2" color="text.secondary">
                    <strong>Vendor:</strong> {deleteDialog.expense.vendor_name}
                  </Typography>
                )}
              </Box>
              {deleteDialog.expense.source_type === "misc_expense" && (
                <TextField
                  fullWidth
                  label="Reason for deletion (optional)"
                  value={deleteDialog.reason}
                  onChange={(e) => setDeleteDialog((prev) => ({ ...prev, reason: e.target.value }))}
                  multiline
                  rows={2}
                  sx={{ mt: 2 }}
                  placeholder="Enter reason for deleting this expense..."
                />
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteDialog({ open: false, expense: null, reason: "" })} disabled={submitting}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleConfirmDelete} disabled={submitting}>
            {submitting ? "Deleting…" : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Subcontracts drawer */}
      <Drawer anchor="right" open={subcontractDrawerOpen} onClose={() => setSubcontractDrawerOpen(false)} PaperProps={{ sx: { width: { xs: "100%", sm: 480, md: 560 } } }}>
        <Box sx={{ p: 3 }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <ContractIcon color="primary" />
              <Typography variant="h6" fontWeight={600}>Subcontracts Summary</Typography>
            </Box>
            <IconButton onClick={() => setSubcontractDrawerOpen(false)} size="small"><Close /></IconButton>
          </Box>
          <Divider sx={{ mb: 3 }} />
          {subcontractsLoading ? (
            <Typography color="text.secondary">Loading…</Typography>
          ) : subcontracts && subcontracts.length > 0 ? (
            <>
              <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
                <Box sx={{ flex: 1, minWidth: 100, p: 2, bgcolor: "action.hover", borderRadius: 1.5 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>Total Value</Typography>
                  <Typography variant="h6" fontWeight={700}>₹{subcontracts.reduce((s, sc) => s + sc.totalValue, 0).toLocaleString("en-IN")}</Typography>
                </Box>
                <Box sx={{ flex: 1, minWidth: 100, p: 2, bgcolor: "success.50", borderRadius: 1.5 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>Total Paid</Typography>
                  <Typography variant="h6" fontWeight={700} color="success.main">₹{subcontracts.reduce((s, sc) => s + sc.totalPaid, 0).toLocaleString("en-IN")}</Typography>
                </Box>
                <Box sx={{ flex: 1, minWidth: 100, p: 2, bgcolor: "warning.50", borderRadius: 1.5 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>Balance</Typography>
                  <Typography variant="h6" fontWeight={700} color="warning.main">₹{subcontracts.reduce((s, sc) => s + sc.balance, 0).toLocaleString("en-IN")}</Typography>
                </Box>
              </Box>
              <Divider sx={{ mb: 3 }} />
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>Individual Subcontracts</Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {subcontracts.map((sc) => (
                  <Box key={sc.subcontractId} sx={{ p: 2, border: 1, borderColor: "divider", borderRadius: 1.5, "&:hover": { bgcolor: "action.hover" } }}>
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
                      <Typography variant="subtitle2" fontWeight={600}>{sc.title}</Typography>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Chip label={sc.status.toUpperCase()} size="small" color={sc.status === "active" ? "success" : "warning"} variant="outlined" />
                        <IconButton size="small" onClick={() => router.push("/site/subcontracts")} title="View subcontract details"><OpenInNew fontSize="small" /></IconButton>
                      </Box>
                    </Box>
                    <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Total Value</Typography>
                        <Typography variant="body2" fontWeight={500}>₹{sc.totalValue.toLocaleString("en-IN")}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Paid</Typography>
                        <Typography variant="body2" fontWeight={500} color="success.main">₹{sc.totalPaid.toLocaleString("en-IN")}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" color="text.secondary">Balance</Typography>
                        <Typography variant="body2" fontWeight={500} color={sc.balance > 0 ? "warning.main" : "success.main"}>₹{sc.balance.toLocaleString("en-IN")}</Typography>
                      </Box>
                    </Box>
                  </Box>
                ))}
              </Box>
              <Box sx={{ mt: 3 }}>
                <Button fullWidth variant="outlined" endIcon={<OpenInNew />} onClick={() => router.push("/site/subcontracts")}>View All Subcontracts</Button>
              </Box>
            </>
          ) : (
            <Typography color="text.secondary">No subcontracts found for this site.</Typography>
          )}
        </Box>
      </Drawer>

      {/* InspectPane */}
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
          const url = e.kind === "daily-date" ? `/site/payments?ref=${ref}&date=${e.date}` : `/site/payments?ref=${ref}`;
          router.push(url);
        }}
      />

      <RentalExpenseInspectPane orderId={rentalPaneOrderId} onClose={() => setRentalPaneOrderId(null)} />
    </Box>
  );
}
