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
  Snackbar,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
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
  AccountBalanceWallet,
  Add,
  Close,
  Delete,
  Description as ContractIcon,
  DensityLarge,
  DensitySmall,
  Edit,
  FilterList as FilterListIcon,
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
import { UnlinkedLinkPopper } from "@/components/expenses/UnlinkedLinkPopper";
import { useSiteTrades } from "@/hooks/queries/useTrades";
import { resolveRefAction } from "./refActions";

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

// Per-column min widths applied to header label row, header filter row, and
// body cells. Without these, MUI Table distributes width by content alone and
// chip-heavy cells (Status/Kind) squeeze the text columns until labels truncate.
const COL_MIN_WIDTHS = {
  settlement: 110,
  ref: 130,
  vendorDesc: 220,
  tradeSub: 180,
  kind: 110,
  status: 90,
  amount: 110,
  actions: 64,
} as const;

// Per-column header filter row state (Excel-style sub-header). Empty strings
// mean "no filter" for that column.
type ColFilters = {
  settlement: { from: string; to: string };
  ref: string;
  vendor: string;
  trade: string;
  kind: string;
  status: "" | "paid" | "advance" | "pending";
  amount: { min: string; max: string };
};

const EMPTY_COL_FILTERS: ColFilters = {
  settlement: { from: "", to: "" },
  ref: "",
  vendor: "",
  trade: "",
  kind: "",
  status: "",
  amount: { min: "", max: "" },
};

function isAnyColFilterActive(c: ColFilters): boolean {
  return (
    !!c.settlement.from ||
    !!c.settlement.to ||
    !!c.ref ||
    !!c.vendor ||
    !!c.trade ||
    !!c.kind ||
    !!c.status ||
    !!c.amount.min ||
    !!c.amount.max
  );
}

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

  // Excel-style per-column header filters. Hydrate from URL (c_* keys) so a
  // deep-link survives reload.
  const [colFilters, setColFilters] = useState<ColFilters>(() => {
    const status = searchParams.get("c_status");
    return {
      settlement: {
        from: searchParams.get("c_dfrom") ?? "",
        to: searchParams.get("c_dto") ?? "",
      },
      ref: searchParams.get("c_ref") ?? "",
      vendor: searchParams.get("c_vendor") ?? "",
      trade: searchParams.get("c_trade") ?? "",
      kind: searchParams.get("c_kind") ?? "",
      status:
        status === "paid" || status === "advance" || status === "pending"
          ? status
          : "",
      amount: {
        min: searchParams.get("c_amin") ?? "",
        max: searchParams.get("c_amax") ?? "",
      },
    };
  });

  const [groupBy, setGroupBy] = useState<GroupByOption>("none");
  const [dense, setDense] = useState(false);
  const [mobileTab, setMobileTab] = useState<0 | 1>(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [rentalPaneOrderId, setRentalPaneOrderId] = useState<string | null>(null);
  const [refSnackbar, setRefSnackbar] = useState<string | null>(null);
  const [mobileFilterSheetOpen, setMobileFilterSheetOpen] = useState(false);

  // "Came from Material Hub" banner — captured once at mount because the
  // URL-sync effect below replaces the URL without preserving ?fromHub.
  const [fromHubThreadId, setFromHubThreadId] = useState<string | null>(() =>
    searchParams.get("fromHub")
  );

  // Count of non-default secondary filters (trade / sub-kind / status) — used
  // for the mobile "Filters" button badge.
  const activeMobileFilterCount = useMemo(() => {
    let n = 0;
    if (tradeFilter !== "all") n++;
    if (subKindFilter !== "all") n++;
    if (status !== "all") n++;
    return n;
  }, [tradeFilter, subKindFilter, status]);

  const tableRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [linkAnchor, setLinkAnchor] = useState<{ el: HTMLElement; row: ExpenseRow } | null>(null);

  // URL sync
  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (group !== "all") params.set("group", group);
    if (activeTypes.length > 0) params.set("types", activeTypes.join(","));
    if (status !== "all") params.set("status", status);
    if (sitePayerId) params.set("payer", sitePayerId);
    if (tradeFilter !== "all") params.set("trade", tradeFilter);
    // Column filters (Excel-style header row)
    if (colFilters.settlement.from) params.set("c_dfrom", colFilters.settlement.from);
    if (colFilters.settlement.to) params.set("c_dto", colFilters.settlement.to);
    if (colFilters.ref) params.set("c_ref", colFilters.ref);
    if (colFilters.vendor) params.set("c_vendor", colFilters.vendor);
    if (colFilters.trade) params.set("c_trade", colFilters.trade);
    if (colFilters.kind) params.set("c_kind", colFilters.kind);
    if (colFilters.status) params.set("c_status", colFilters.status);
    if (colFilters.amount.min) params.set("c_amin", colFilters.amount.min);
    if (colFilters.amount.max) params.set("c_amax", colFilters.amount.max);
    const qs = params.toString();
    router.replace(`/site/expenses${qs ? `?${qs}` : ""}`, { scroll: false });
  }, [search, group, activeTypes, status, sitePayerId, tradeFilter, colFilters, router]);

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
  const { expenses, summary, isLoading, canLoadMore, loadMore, refetch } =
    useExpensesData({
      siteId: selectedSite?.id ?? null,
      dateFrom: dateFrom ?? null,
      dateTo: dateTo ?? null,
      isAllTime,
      group,
      expenseTypes: activeTypes.length > 0 ? activeTypes : null,
      status,
      sitePayerId,
      sortDir: "desc",
    });

  // Callback ref for the infinite-scroll sentinel. Using a callback ref
  // (instead of useRef + useEffect) guarantees the IntersectionObserver
  // attaches the moment the sentinel TR mounts, even when the table is
  // conditionally rendered (mobile tab switch). The previous useEffect-based
  // approach missed re-attachment when mobileTab changed because no dep in
  // the effect's array reflected the tab change.
  const observerRef = useRef<IntersectionObserver | null>(null);

  const sentinelRef = useCallback(
    (node: HTMLTableRowElement | null) => {
      // Tear down any previous observer (e.g., when the sentinel unmounts).
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }

      if (!node) return;
      if (!canLoadMore) return;

      observerRef.current = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (entry?.isIntersecting && canLoadMore && !isLoading) {
            loadMore();
          }
        },
        {
          // Observe relative to the page's inner scroll container, not the
          // browser viewport. In fullscreen mode the outer Box is the only
          // scrolling element and viewport-relative observation would never fire.
          root: scrollContainerRef.current,
          rootMargin: "200px",
        },
      );
      observerRef.current.observe(node);
    },
    [canLoadMore, isLoading, loadMore],
  );

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

  // Excel-style per-column header filters. Applied on top of every other
  // filter so they compose (AND) with the toolbar selects + free-text search.
  const columnFilteredRows = useMemo(() => {
    if (!isAnyColFilterActive(colFilters)) return filteredRows;
    const refQ = colFilters.ref.toLowerCase();
    const vendorQ = colFilters.vendor.toLowerCase();
    const tradeQ = colFilters.trade.toLowerCase();
    const minN = colFilters.amount.min ? Number(colFilters.amount.min) : null;
    const maxN = colFilters.amount.max ? Number(colFilters.amount.max) : null;
    return filteredRows.filter((row) => {
      if (colFilters.settlement.from && row.date < colFilters.settlement.from) return false;
      if (colFilters.settlement.to && row.date > colFilters.settlement.to) return false;
      if (refQ && !(row.settlement_reference ?? "").toLowerCase().includes(refQ)) return false;
      if (vendorQ) {
        const hay = `${row.vendor_name ?? ""} ${row.description ?? ""}`.toLowerCase();
        if (!hay.includes(vendorQ)) return false;
      }
      if (tradeQ) {
        const tradeName = row.contract_id ? contractToTrade.get(row.contract_id)?.name ?? "" : "";
        const hay = `${tradeName} ${row.subcontract_title ?? ""}`.toLowerCase();
        if (!hay.includes(tradeQ)) return false;
      }
      if (colFilters.kind && row.expense_type !== colFilters.kind) return false;
      if (colFilters.status && getDisplayStatus(row) !== colFilters.status) return false;
      if (minN !== null && !Number.isNaN(minN) && row.amount < minN) return false;
      if (maxN !== null && !Number.isNaN(maxN) && row.amount > maxN) return false;
      return true;
    });
  }, [filteredRows, colFilters, contractToTrade]);

  // Footer totals
  // Loaded-slice totals — accurate only over what's currently fetched and
  // after client filters narrow what we display. Used as the "Filtered" line
  // when search/trade/sub-kind is active.
  const filteredLaborTotal = useMemo(
    () => columnFilteredRows.filter((r) => LABOR_SET.has(r.expense_type)).reduce((s, r) => s + r.amount, 0),
    [columnFilteredRows],
  );
  const filteredBuildingTotal = useMemo(
    () => columnFilteredRows.filter((r) => BUILDING_SET.has(r.expense_type)).reduce((s, r) => s + r.amount, 0),
    [columnFilteredRows],
  );
  const filteredTotal = filteredLaborTotal + filteredBuildingTotal;

  // Scope-wide totals derived from the get_expense_summary RPC's per-type
  // breakdown. These remain correct regardless of how many rows the table
  // has loaded — used as the primary "Total" line, matching the KPI cards.
  const scopeLaborTotal = useMemo(() => {
    const b = summary?.breakdown ?? {};
    return LABOR_TYPES.reduce((s, t) => s + (b[t]?.amount ?? 0), 0);
  }, [summary]);
  const scopeBuildingTotal = useMemo(() => {
    const b = summary?.breakdown ?? {};
    return BUILDING_TYPES.reduce((s, t) => s + (b[t]?.amount ?? 0), 0);
  }, [summary]);
  const scopeTotal = summary?.total ?? scopeLaborTotal + scopeBuildingTotal;

  // "Client-side filter is active" — these filters DON'T go to the DB, so
  // the scope summary doesn't reflect them. When active, we show both the
  // filtered slice total (as a caption) and the scope total (as the
  // primary). DB-level filters (group, status, sitePayerId, activeTypes)
  // affect both `expenses` and `filteredRows`, but the RPC doesn't currently
  // pass those — see spec §4 for why scope-total matches KPI cards.
  const hasClientFilter =
    search.trim() !== "" ||
    tradeFilter !== "all" ||
    subKindFilter !== "all" ||
    isAnyColFilterActive(colFilters);

  // Grouped table items
  const tableItems = useMemo<TableItem[]>(() => {
    if (groupBy === "none") return columnFilteredRows.map((row) => ({ type: "row", row }));

    const getKey = (row: ExpenseRow): string => {
      if (groupBy === "trade") {
        if (!row.contract_id) return "— Unlinked —";
        return contractToTrade.get(row.contract_id)?.name ?? "Site-wide";
      }
      if (groupBy === "kind") return LABOR_SET.has(row.expense_type) ? "Labor" : "Building";
      if (groupBy === "date") return row.date;
      if (groupBy === "vendor") return row.vendor_name ?? "—";
      return "";
    };

    const groups = new Map<string, ExpenseRow[]>();
    for (const row of columnFilteredRows) {
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
  }, [columnFilteredRows, groupBy, contractToTrade]);

  // Has any active filter
  const hasFilter =
    search.trim() !== "" ||
    group !== "all" ||
    activeTypes.length > 0 ||
    status !== "all" ||
    tradeFilter !== "all" ||
    subKindFilter !== "all" ||
    isAnyColFilterActive(colFilters);

  const resetAllFilters = () => {
    setSearch("");
    setGroup("all");
    setActiveTypes([]);
    setStatus("all");
    setTradeFilter("all");
    setSubKindFilter("all");
    setSitePayerId(null);
    setColFilters(EMPTY_COL_FILTERS);
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

  const handleOpenDialog = useCallback((row?: ExpenseRow) => {
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
  }, [router]);

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
  const [orphanCancelDialog, setOrphanCancelDialog] = useState<{ open: boolean; expense: ExpenseRow | null }>({
    open: false,
    expense: null,
  });

  const handleDelete = (row: ExpenseRow) => {
    if (row.source_type === "settlement" && row.expense_type === "Unlinked Salary") {
      setOrphanCancelDialog({ open: true, expense: row });
      return;
    }
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

  const handleCancelOrphanSettlement = async () => {
    const expense = orphanCancelDialog.expense;
    if (!expense) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("settlement_groups")
        .update({
          is_cancelled: true,
          cancelled_at: new Date().toISOString(),
          cancelled_by: userProfile?.name || "Unknown",
          cancelled_by_user_id: userProfile?.id || null,
          cancellation_reason: "Orphaned settlement cancelled from expenses page",
        })
        .eq("id", expense.source_id);
      if (error) throw error;
      setOrphanCancelDialog({ open: false, expense: null });
      await refetch();
    } catch (err: any) {
      alert(`Failed to cancel settlement: ${err.message || "Unknown error"}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRefClick = useCallback(
    (row: ExpenseRow) => {
      if (!selectedSite) return;
      const action = resolveRefAction(row);
      switch (action.kind) {
        case "navigate":
          router.push(action.url);
          return;
        case "rental-pane":
          setRentalPaneOrderId(action.orderId);
          return;
        case "daily-pane":
          pane.open({
            kind: "daily-date",
            siteId: selectedSite.id,
            date: action.date,
            settlementRef: action.ref,
          });
          return;
        case "weekly-pane":
          pane.open({
            kind: "weekly-week",
            siteId: selectedSite.id,
            laborerId: action.laborerId,
            weekStart: action.weekStart,
            weekEnd: action.weekEnd,
            settlementRef: action.ref,
          });
          return;
        case "weekly-fallback-nav":
          router.push(action.url);
          return;
        case "edit-dialog":
          handleOpenDialog(row);
          return;
        case "unknown":
          setRefSnackbar(
            "No detail view available for this expense type yet.",
          );
          return;
      }
    },
    [pane, router, selectedSite, handleOpenDialog],
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
        subtitle={isMobile ? undefined : `Track expenses for ${selectedSite.name}`}
        titleVariant={isMobile ? "h6" : undefined}
        actions={
          <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
            {isMobile ? (
              <Tooltip title="Add expense">
                <span>
                  <IconButton
                    color="primary"
                    onClick={() => handleOpenDialog()}
                    disabled={!canEdit}
                    aria-label="Add expense"
                    size="small"
                  >
                    <Add />
                  </IconButton>
                </span>
              </Tooltip>
            ) : (
              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={() => handleOpenDialog()}
                disabled={!canEdit}
                size="small"
              >
                Add Expense
              </Button>
            )}
            {!isMobile && (
              <Tooltip title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
                <IconButton size="small" onClick={() => setIsFullscreen((v) => !v)}>
                  {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
                </IconButton>
              </Tooltip>
            )}
          </Box>
        }
      />
      {auditState.isAuditing && auditState.dataStartedAt ? (
        <LegacyAuditBanner siteName={selectedSite.name} cutoffDate={auditState.dataStartedAt} />
      ) : null}
    </Box>
  );

  // ─── Expenses table section ───────────────────────────────────────────────

  // Sticky layer stack (relative to the page's outer scroll container):
  //
  //   Layer            top   zIndex   Reason
  //   toolbar row 1     0      3      First; flush with viewport top
  //   toolbar row 2    56      2      Approx. height of row 1 on desktop
  //   table head       96      1      Approx. row 1 + row 2 stacked height
  //
  // These offsets are desktop estimates calibrated against the toolbar's
  // `size="small"` MUI controls. On narrow widths the rows may wrap and the
  // offsets will be off by ~10–20px; this causes a small visual overlap but
  // the page remains usable (accepted per spec).
  const headerCellSx = {
    fontWeight: 700,
    fontSize: 12,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    color: "text.secondary",
    bgcolor: "background.paper",
    py: dense ? 1 : 1.25,
    // Allow two-word labels (e.g. "Vendor / Description") to wrap rather than
    // truncate when their column is squeezed by chip-heavy neighbours.
    whiteSpace: "normal" as const,
    lineHeight: 1.2,
    position: "sticky" as const,
    // Sits right below the records-bar (which is sticky at top:64, ~48px tall).
    // Previously used top:96 which left a ~16px exposed strip where scrolling
    // data rows peeked through between records-bar and header.
    top: 112,
    zIndex: 1,
  };

  // Sub-header (Excel-style per-column filter row) sits right below the label
  // row. top = header top (112) + header row height (~35).
  const filterRowCellSx = {
    bgcolor: "background.paper",
    py: 0.5,
    px: { xs: 0.5, md: 1 },
    position: "sticky" as const,
    top: dense ? 144 : 147,
    zIndex: 1,
    borderBottom: 1,
    borderBottomColor: "divider",
  };

  // Task 6: mobile column hiding + sticky Date.
  // Apply hideOnMobileSx to both header and body cells of low-value columns
  // so the table fits a phone screen. stickyDateSx pins the Date column to
  // the left edge so even if some overflow remains, the date stays visible.
  const hideOnMobileSx = { display: { xs: "none", md: "table-cell" } };

  const stickyDateSx = {
    position: { xs: "sticky", md: "static" } as const,
    left: 0,
    zIndex: 1,
    bgcolor: "background.paper",
    // narrow padding on mobile
    py: { xs: 0.5, md: dense ? 0.75 : 1 },
    px: { xs: 1, md: 2 },
  };

  const expensesTable = (
    <Paper
      ref={tableRef}
      variant="outlined"
      sx={{
        borderRadius: 2,
        mb: 4,
        display: "flex",
        flexDirection: "column",
        minHeight: "calc(100vh - 220px)",
      }}
    >
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
          position: "sticky",
          top: 0,
          zIndex: 3,
          bgcolor: "background.paper",
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

        {/* Mobile-only: collapse secondary filters into bottom sheet */}
        <Box sx={{ display: { xs: "inline-flex", md: "none" } }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<FilterListIcon />}
            onClick={() => setMobileFilterSheetOpen(true)}
            sx={{ borderRadius: 99, fontSize: 12, textTransform: "none" }}
            endIcon={
              activeMobileFilterCount > 0 ? (
                <Chip
                  label={activeMobileFilterCount}
                  size="small"
                  color="primary"
                  sx={{ height: 18, fontSize: 11, "& .MuiChip-label": { px: 0.75 } }}
                />
              ) : null
            }
          >
            Filters
          </Button>
        </Box>

        {/* Desktop-only: secondary filters + Export. `display: contents` lets
            the parent flex container see the grandchildren as direct items. */}
        <Box sx={{ display: { xs: "none", md: "contents" } }}>
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
          position: "sticky",
          // Sticky stack order (page-level scroll): toolbar (top:0, h:65) ►
          // records-bar (top:64, h:~48) ► header label row (top:112) ►
          // header filter row (top:147). Values chosen so adjacent sticky
          // elements butt up against each other instead of leaving a gap
          // that exposes scrolling data rows underneath.
          top: 64,
          zIndex: 2,
        }}
      >
        <Typography variant="body2" fontWeight={600} sx={{ fontVariantNumeric: "tabular-nums" }}>
          {columnFilteredRows.length} records
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

      {/* Table */}
      <TableContainer sx={{ overflowX: "auto" }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              {/* DATE — kept `position: sticky` on all viewports so the
                  header row never fragments. Previously the spread of
                  `stickyDateSx` here overrode `position` to `static` on md+,
                  which split the header (the other 7 cells stayed pinned at
                  top: 96 while this one scrolled away). Now we only inherit
                  the mobile left-pin (`left: 0`) without that override. */}
              <TableCell
                sx={{
                  ...headerCellSx,
                  left: 0,
                  zIndex: 2,
                  py: { xs: 0.5, md: dense ? 1 : 1.25 },
                  px: { xs: 1, md: 2 },
                  minWidth: COL_MIN_WIDTHS.settlement,
                }}
              >
                Settlement
              </TableCell>
              {(
                [
                  { label: "Ref", hideOnMobile: false, minWidth: COL_MIN_WIDTHS.ref },
                  { label: "Vendor / Description", hideOnMobile: true, minWidth: COL_MIN_WIDTHS.vendorDesc },
                  { label: "Trade / Subcontract", hideOnMobile: true, minWidth: COL_MIN_WIDTHS.tradeSub },
                  { label: "Kind", hideOnMobile: false, minWidth: COL_MIN_WIDTHS.kind },
                  { label: "Status", hideOnMobile: false, minWidth: COL_MIN_WIDTHS.status },
                  { label: "Amount", hideOnMobile: false, minWidth: COL_MIN_WIDTHS.amount },
                  { label: "", hideOnMobile: false, minWidth: COL_MIN_WIDTHS.actions },
                ] as const
              ).map((h) => (
                <TableCell
                  key={h.label}
                  align={h.label === "Amount" ? "right" : "left"}
                  sx={{
                    ...headerCellSx,
                    minWidth: h.minWidth,
                    ...(h.hideOnMobile ? hideOnMobileSx : {}),
                  }}
                >
                  {h.label}
                </TableCell>
              ))}
            </TableRow>

            {/* Excel-style filter row — sits below the label row, sticky
                under it. Each cell holds the right control for its column
                (text contains, select, date range, amount range). Filters
                AND together AND with the toolbar filters above. */}
            <TableRow>
              {/* Settlement: date-range From/To */}
              <TableCell
                sx={{
                  ...filterRowCellSx,
                  left: 0,
                  zIndex: 2,
                  minWidth: COL_MIN_WIDTHS.settlement,
                }}
              >
                <Box sx={{ display: "flex", gap: 0.5 }}>
                  <TextField
                    type="date"
                    size="small"
                    value={colFilters.settlement.from}
                    onChange={(e) =>
                      setColFilters((c) => ({ ...c, settlement: { ...c.settlement, from: e.target.value } }))
                    }
                    slotProps={{ inputLabel: { shrink: true } }}
                    sx={{ "& .MuiInputBase-input": { fontSize: 11, py: 0.5, px: 0.5 }, minWidth: 0 }}
                  />
                  <TextField
                    type="date"
                    size="small"
                    value={colFilters.settlement.to}
                    onChange={(e) =>
                      setColFilters((c) => ({ ...c, settlement: { ...c.settlement, to: e.target.value } }))
                    }
                    slotProps={{ inputLabel: { shrink: true } }}
                    sx={{ "& .MuiInputBase-input": { fontSize: 11, py: 0.5, px: 0.5 }, minWidth: 0 }}
                  />
                </Box>
              </TableCell>

              {/* Ref */}
              <TableCell sx={{ ...filterRowCellSx, minWidth: COL_MIN_WIDTHS.ref }}>
                <TextField
                  size="small"
                  placeholder="Search…"
                  value={colFilters.ref}
                  onChange={(e) => setColFilters((c) => ({ ...c, ref: e.target.value }))}
                  fullWidth
                  sx={{ "& .MuiInputBase-input": { fontSize: 11, py: 0.5 } }}
                />
              </TableCell>

              {/* Vendor / Description */}
              <TableCell sx={{ ...filterRowCellSx, ...hideOnMobileSx, minWidth: COL_MIN_WIDTHS.vendorDesc }}>
                <TextField
                  size="small"
                  placeholder="Search vendor or description…"
                  value={colFilters.vendor}
                  onChange={(e) => setColFilters((c) => ({ ...c, vendor: e.target.value }))}
                  fullWidth
                  sx={{ "& .MuiInputBase-input": { fontSize: 11, py: 0.5 } }}
                />
              </TableCell>

              {/* Trade / Subcontract */}
              <TableCell sx={{ ...filterRowCellSx, ...hideOnMobileSx, minWidth: COL_MIN_WIDTHS.tradeSub }}>
                <TextField
                  size="small"
                  placeholder="Search…"
                  value={colFilters.trade}
                  onChange={(e) => setColFilters((c) => ({ ...c, trade: e.target.value }))}
                  fullWidth
                  sx={{ "& .MuiInputBase-input": { fontSize: 11, py: 0.5 } }}
                />
              </TableCell>

              {/* Kind */}
              <TableCell sx={{ ...filterRowCellSx, minWidth: COL_MIN_WIDTHS.kind }}>
                <FormControl size="small" fullWidth>
                  <Select
                    value={colFilters.kind}
                    displayEmpty
                    onChange={(e) => setColFilters((c) => ({ ...c, kind: e.target.value }))}
                    sx={{ fontSize: 11, "& .MuiSelect-select": { py: 0.5 } }}
                  >
                    <MenuItem value="" sx={{ fontSize: 12 }}>All</MenuItem>
                    {[...LABOR_TYPES, ...BUILDING_TYPES].map((t) => (
                      <MenuItem key={t} value={t} sx={{ fontSize: 12 }}>{t}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </TableCell>

              {/* Status */}
              <TableCell sx={{ ...filterRowCellSx, minWidth: COL_MIN_WIDTHS.status }}>
                <FormControl size="small" fullWidth>
                  <Select
                    value={colFilters.status}
                    displayEmpty
                    onChange={(e) =>
                      setColFilters((c) => ({ ...c, status: e.target.value as ColFilters["status"] }))
                    }
                    sx={{ fontSize: 11, "& .MuiSelect-select": { py: 0.5 } }}
                  >
                    <MenuItem value="" sx={{ fontSize: 12 }}>All</MenuItem>
                    <MenuItem value="paid" sx={{ fontSize: 12 }}>Paid</MenuItem>
                    <MenuItem value="advance" sx={{ fontSize: 12 }}>Advance</MenuItem>
                    <MenuItem value="pending" sx={{ fontSize: 12 }}>Pending</MenuItem>
                  </Select>
                </FormControl>
              </TableCell>

              {/* Amount: min/max */}
              <TableCell align="right" sx={{ ...filterRowCellSx, minWidth: COL_MIN_WIDTHS.amount }}>
                <Box sx={{ display: "flex", gap: 0.5 }}>
                  <TextField
                    type="number"
                    size="small"
                    placeholder="Min"
                    value={colFilters.amount.min}
                    onChange={(e) =>
                      setColFilters((c) => ({ ...c, amount: { ...c.amount, min: e.target.value } }))
                    }
                    sx={{ "& .MuiInputBase-input": { fontSize: 11, py: 0.5, px: 0.5, textAlign: "right" }, minWidth: 0 }}
                  />
                  <TextField
                    type="number"
                    size="small"
                    placeholder="Max"
                    value={colFilters.amount.max}
                    onChange={(e) =>
                      setColFilters((c) => ({ ...c, amount: { ...c.amount, max: e.target.value } }))
                    }
                    sx={{ "& .MuiInputBase-input": { fontSize: 11, py: 0.5, px: 0.5, textAlign: "right" }, minWidth: 0 }}
                  />
                </Box>
              </TableCell>

              {/* Actions: spacer */}
              <TableCell sx={{ ...filterRowCellSx, minWidth: COL_MIN_WIDTHS.actions }} />
            </TableRow>
          </TableHead>

          <TableBody>
            {isLoading && columnFilteredRows.length === 0 ? (
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
                    {/* Settlement date — DD MMM YY so 2025/2026 spans are
                        unambiguous. Tooltip exposes the recorded date when
                        it differs (e.g. material settled on 14 Feb 26 for a
                        bill recorded 12 Feb 26). */}
                    <TableCell sx={{ ...stickyDateSx, color: "text.secondary", fontSize: 12, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                      {(() => {
                        const settled = dayjs(row.date);
                        const recorded = row.recorded_date ? dayjs(row.recorded_date) : null;
                        const driftsFromRecorded =
                          recorded && recorded.format("YYYY-MM-DD") !== settled.format("YYYY-MM-DD");
                        const label = settled.format("DD MMM YY");
                        if (!driftsFromRecorded) return label;
                        return (
                          <Tooltip
                            arrow
                            title={`Settled ${settled.format("DD MMM YYYY")} · recorded ${recorded!.format("DD MMM YYYY")}`}
                          >
                            <Box
                              component="span"
                              sx={{
                                borderBottom: "1px dotted",
                                borderColor: "warning.main",
                                color: "warning.main",
                                cursor: "help",
                              }}
                            >
                              {label}
                            </Box>
                          </Tooltip>
                        );
                      })()}
                    </TableCell>

                    {/* Ref */}
                    <TableCell sx={{ py: { xs: 0.5, md: dense ? 0.5 : 1 }, px: { xs: 1, md: 2 } }}>
                      <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
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
                        {row.engineer_transaction_id && (
                          <Tooltip title="Paid via site engineer wallet">
                            <AccountBalanceWallet
                              sx={{ fontSize: 14, color: "primary.main", flexShrink: 0 }}
                              aria-label="Paid via site engineer wallet"
                            />
                          </Tooltip>
                        )}
                      </Box>
                    </TableCell>

                    {/* Vendor / Description */}
                    <TableCell sx={{ py: dense ? 0.5 : 1, maxWidth: 260, ...hideOnMobileSx }}>
                      <Typography variant="body2" fontWeight={600} noWrap>
                        {row.vendor_name || row.description || "—"}
                      </Typography>
                      {!dense && row.vendor_name && row.description && (
                        <Typography variant="caption" color="text.secondary" noWrap display="block">
                          {row.description}
                        </Typography>
                      )}
                    </TableCell>

                    {/* Trade / Subcontract */}
                    <TableCell sx={{ py: dense ? 0.5 : 1, maxWidth: 200, ...hideOnMobileSx }}>
                      {tradeInfo ? (
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                          <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "primary.main", flexShrink: 0 }} />
                          <Typography variant="caption" noWrap>{tradeInfo.name}</Typography>
                        </Box>
                      ) : (
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                          <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "grey.400", flexShrink: 0 }} />
                          <Typography variant="caption" color="text.disabled">—</Typography>
                        </Box>
                      )}
                      {row.contract_id && row.subcontract_title ? (
                        !dense && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            noWrap
                            display="block"
                            sx={{ fontSize: 11, mt: 0.25, ml: 1.5 }}
                          >
                            {row.subcontract_title}
                          </Typography>
                        )
                      ) : (
                        <Box sx={{ mt: 0.25, ml: 1.5 }}>
                          {row.source_type === "misc_expense" ? (
                            <Chip
                              label="Unlinked"
                              size="small"
                              color="warning"
                              variant="outlined"
                              onClick={(e) => setLinkAnchor({ el: e.currentTarget, row })}
                              sx={{ height: 18, fontSize: 10, cursor: "pointer", "& .MuiChip-label": { px: 0.75 } }}
                            />
                          ) : (
                            <Tooltip title="Use Edit to link">
                              <Chip
                                label="Unlinked"
                                size="small"
                                color="warning"
                                variant="outlined"
                                sx={{ height: 18, fontSize: 10, "& .MuiChip-label": { px: 0.75 } }}
                              />
                            </Tooltip>
                          )}
                        </Box>
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
                    <TableCell sx={{ py: { xs: 0.5, md: dense ? 0.5 : 1 }, px: { xs: 1, md: 2 } }}>
                      <Chip
                        label={displayStatus === "paid" ? "Paid" : displayStatus === "advance" ? "Advance" : "Pending"}
                        size="small"
                        color={displayStatus === "paid" ? "success" : displayStatus === "advance" ? "info" : "warning"}
                        variant="outlined"
                        sx={{ height: 20, fontSize: 10, fontWeight: 600 }}
                      />
                    </TableCell>

                    {/* Amount */}
                    <TableCell align="right" sx={{ py: { xs: 0.5, md: dense ? 0.5 : 1 }, px: { xs: 1, md: 2 }, fontWeight: 700, fontSize: 13, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                      {formatINR(row.amount)}
                    </TableCell>

                    {/* Actions */}
                    <TableCell sx={{ py: { xs: 0.5, md: dense ? 0.5 : 1 }, px: { xs: 0.5, md: 2 }, width: { xs: 56, md: 60 } }}>
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

            {/* Sentinel: when this row scrolls into view, auto-load the next page */}
            {canLoadMore && !isLoading && expenses.length > 0 && (
              <TableRow ref={sentinelRef} sx={{ height: 1 }}>
                <TableCell colSpan={8} sx={{ p: 0, border: 0 }} />
              </TableRow>
            )}

            {/* Tail status row: loading spinner / end-of-results */}
            {expenses.length > 0 && (isLoading || !canLoadMore) && (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 1.5, color: "text.disabled", fontSize: 12 }}>
                  {isLoading
                    ? "Loading more…"
                    : `End of results · ${expenses.length} of ${summary?.totalCount ?? expenses.length} loaded`}
                </TableCell>
              </TableRow>
            )}
          </TableBody>

        </Table>
      </TableContainer>

      {/* Sticky totals bar — pinned to viewport bottom inside the Paper card.
          Stays visible as the user scrolls through rows. Two-line format
          when a client-side filter is active (search/trade/sub-kind),
          single-line otherwise. */}
      <Box
        sx={{
          position: "sticky",
          bottom: 0,
          zIndex: 4,
          bgcolor: "background.paper",
          borderTop: 2,
          borderColor: "divider",
          px: 1.5,
          py: 1,
          display: "flex",
          alignItems: "flex-end",
          gap: 2,
        }}
      >
        <Box sx={{ display: "flex", gap: 2, alignItems: "center", flex: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Labor{" "}
            <Box component="span" fontWeight={700} color="text.primary" sx={{ fontVariantNumeric: "tabular-nums" }}>
              {formatCompact(scopeLaborTotal)}
            </Box>
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Building{" "}
            <Box component="span" fontWeight={700} color="text.primary" sx={{ fontVariantNumeric: "tabular-nums" }}>
              {formatCompact(scopeBuildingTotal)}
            </Box>
          </Typography>
        </Box>

        <Box sx={{ textAlign: "right" }}>
          {hasClientFilter && (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.2 }}>
              Filtered (loaded):{" "}
              <Box component="span" fontWeight={600} color="text.primary" sx={{ fontVariantNumeric: "tabular-nums" }}>
                {formatINR(filteredTotal)}
              </Box>{" "}
              · {columnFilteredRows.length} rows
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary" textTransform="uppercase" letterSpacing={0.5}>
            Total
          </Typography>
          <Typography variant="subtitle1" fontWeight={700} sx={{ fontVariantNumeric: "tabular-nums", letterSpacing: -0.2, lineHeight: 1.2 }}>
            {formatINR(scopeTotal)}
          </Typography>
        </Box>
      </Box>
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

      <Box ref={scrollContainerRef} sx={{ flex: 1, overflowY: "auto", p: { xs: 1.5, md: 2 } }}>
        {fromHubThreadId && (
          <Alert
            severity="info"
            icon={<OpenInNew fontSize="small" />}
            sx={{ mb: 2, alignItems: "center" }}
            action={
              <Box sx={{ display: "flex", gap: 0.5 }}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => {
                    router.push("/site/materials/hub");
                  }}
                >
                  ← Back to Hub
                </Button>
                <IconButton
                  size="small"
                  onClick={() => {
                    setFromHubThreadId(null);
                    setSearch("");
                  }}
                  aria-label="Dismiss"
                >
                  <Close fontSize="small" />
                </IconButton>
              </Box>
            }
          >
            Filtered from <b>Material Hub</b> · thread{" "}
            <Box component="span" sx={{ fontFamily: "monospace" }}>
              {fromHubThreadId}
            </Box>
          </Alert>
        )}
        {isMobile ? (
          /* Mobile layout: two-tab */
          <>
            <Tabs value={mobileTab} onChange={(_, v) => setMobileTab(v)} sx={{ mb: 2 }}>
              <Tab label="Overview" />
              <Tab label="Expenses" />
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
                <TradeMetricCards
                  tradeSummary={tradeSummary}
                  siteTrades={siteTrades}
                  onCardClick={(id) => { handleTradeCardClick(id); setMobileTab(1); }}
                  onEmptyCardClick={() => handleOpenDialog()}
                  isLoading={tradeSummaryLoading}
                />
                <MoneyBreakdownCard
                  total={totalAmount}
                  totalCount={totalCount}
                  breakdown={breakdown}
                  onOpenSubcontracts={handleOpenSubcontracts}
                  subcontracts={subcontracts}
                />
              </>
            ) : (
              expensesTable
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
              subcontracts={subcontracts}
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

      {/* Orphan cancel dialog */}
      <Dialog open={orphanCancelDialog.open} onClose={() => setOrphanCancelDialog({ open: false, expense: null })} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>Cancel Orphaned Settlement</DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            This settlement has no linked attendance records — it was likely created by a network retry. Cancelling it will remove it from the expenses list without affecting any payments.
          </Alert>
          {orphanCancelDialog.expense && (
            <Box sx={{ p: 2, bgcolor: "action.hover", borderRadius: 1 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                <strong>Reference:</strong> {orphanCancelDialog.expense.settlement_reference || "—"}
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                <strong>Amount:</strong> ₹{orphanCancelDialog.expense.amount.toLocaleString("en-IN")}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                <strong>Date:</strong> {dayjs(orphanCancelDialog.expense.date).format("DD MMM YYYY")}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOrphanCancelDialog({ open: false, expense: null })} disabled={submitting}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleCancelOrphanSettlement} disabled={submitting}>
            {submitting ? "Cancelling…" : "Cancel Settlement"}
          </Button>
        </DialogActions>
      </Dialog>

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

      {/* Mobile filters bottom sheet — collapses trade / sub-kind / status
          into a single sheet so the toolbar stays on one row on phones. */}
      <Drawer
        anchor="bottom"
        open={mobileFilterSheetOpen}
        onClose={() => setMobileFilterSheetOpen(false)}
        PaperProps={{
          sx: {
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            maxHeight: "80vh",
          },
        }}
      >
        <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Typography variant="h6">Filters</Typography>
            <IconButton onClick={() => setMobileFilterSheetOpen(false)} size="small">
              <Close />
            </IconButton>
          </Box>

          {/* Trade select */}
          <FormControl fullWidth size="small">
            <InputLabel id="mobile-filter-trade-label">Trade</InputLabel>
            <Select
              labelId="mobile-filter-trade-label"
              label="Trade"
              value={tradeFilter}
              onChange={(e) => setTradeFilter(e.target.value)}
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
          <FormControl fullWidth size="small">
            <InputLabel id="mobile-filter-subkind-label">Sub-kind</InputLabel>
            <Select
              labelId="mobile-filter-subkind-label"
              label="Sub-kind"
              value={subKindFilter}
              onChange={(e) => setSubKindFilter(e.target.value)}
            >
              <MenuItem value="all">All sub-kinds</MenuItem>
              {subKindOptions.map((k) => <MenuItem key={k} value={k}>{k}</MenuItem>)}
            </Select>
          </FormControl>

          {/* Status select */}
          <FormControl fullWidth size="small">
            <InputLabel id="mobile-filter-status-label">Status</InputLabel>
            <Select
              labelId="mobile-filter-status-label"
              label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value as ExpenseStatus)}
            >
              <MenuItem value="all">All status</MenuItem>
              <MenuItem value="cleared">Paid</MenuItem>
              <MenuItem value="pending">Pending</MenuItem>
            </Select>
          </FormControl>

          <Button
            variant="outlined"
            onClick={() => {
              setTradeFilter("all");
              setSubKindFilter("all");
              setStatus("all");
            }}
            disabled={activeMobileFilterCount === 0}
          >
            Reset filters
          </Button>
          <Button variant="contained" onClick={() => setMobileFilterSheetOpen(false)}>
            Done
          </Button>
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

      {linkAnchor && (
        <UnlinkedLinkPopper
          open
          anchorEl={linkAnchor.el}
          miscExpenseId={linkAnchor.row.source_id}
          siteTrades={siteTrades ?? []}
          userId={userProfile?.id || ""}
          userName={userProfile?.name || ""}
          onClose={() => setLinkAnchor(null)}
          onLinked={async () => {
            setLinkAnchor(null);
            await refetch();
          }}
        />
      )}
      <Snackbar
        open={refSnackbar !== null}
        autoHideDuration={4000}
        onClose={(_, reason) => {
          if (reason !== "clickaway") setRefSnackbar(null);
        }}
        message={refSnackbar}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </Box>
  );
}
