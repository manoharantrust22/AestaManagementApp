"use client";

export const dynamic = "force-dynamic";

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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Alert,
  Grid,
  Card,
  CardContent,
  FormControlLabel,
  Switch,
  IconButton,
  Tabs,
  Tab,
  Drawer,
  Divider,
  Tooltip,
} from "@mui/material";
import {
  Add,
  Delete,
  Edit,
  AttachMoney,
  OpenInNew,
  Close,
  ChevronRight,
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon,
} from "@mui/icons-material";
import DataTable, { type MRT_ColumnDef } from "@/components/common/DataTable";
import RedirectConfirmDialog from "@/components/common/RedirectConfirmDialog";
import ScopeChip from "@/components/common/ScopeChip";
import { InspectPane } from "@/components/common/InspectPane";
import { useInspectPane } from "@/hooks/useInspectPane";
import { createClient } from "@/lib/supabase/client";
import { useSite } from "@/contexts/SiteContext";
import { useAuth } from "@/contexts/AuthContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import PageHeader from "@/components/layout/PageHeader";
import { hasEditPermission } from "@/lib/permissions";
import { supabaseQueryWithTimeout } from "@/lib/utils/supabaseQuery";
import type { Database } from "@/types/database.types";

type Expense = Database["public"]["Tables"]["expenses"]["Row"];
type ExpenseModule = Database["public"]["Enums"]["expense_module"];
type PaymentMode = Database["public"]["Enums"]["payment_mode"];
import dayjs from "dayjs";
import { useRouter } from "next/navigation";
import {
  Description as ContractIcon,
  Link as LinkIcon,
} from "@mui/icons-material";
import {
  getSiteSubcontractTotals,
  type SubcontractTotals,
} from "@/lib/services/subcontractService";
import { cancelMiscExpense } from "@/lib/services/miscExpenseService";
// Material expenses hook removed - will be handled by Material Settlements page after settlement

interface SitePayer {
  id: string;
  name: string;
  is_active: boolean;
}

interface ExpenseWithCategory extends Expense {
  category_name?: string;
  payer_name?: string;
  subcontract_title?: string;
  settlement_reference?: string | null;
  source_type?: "expense" | "settlement" | "misc_expense" | "tea_shop_settlement" | "subcontract_payment" | "material_purchase";
  source_id?: string;
  expense_type?: string;
  recorded_date?: string;
}

export default function ExpensesPage() {
  const { selectedSite } = useSite();
  const { userProfile } = useAuth();
  const { formatForApi, isAllTime } = useDateRange();
  const supabase = createClient();
  const router = useRouter();

  const { dateFrom, dateTo } = formatForApi();

  const [expenses, setExpenses] = useState<ExpenseWithCategory[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [activeTab, setActiveTab] = useState<ExpenseModule | "all" | "miscellaneous">("all");
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Inspect pane for in-place settlement detail viewing (replaces ref-code router push for DLY-/SS-/WS-)
  const pane = useInspectPane();

  // Multi-payer state
  const [hasMultiplePayers, setHasMultiplePayers] = useState(false);
  const [sitePayers, setSitePayers] = useState<SitePayer[]>([]);

  // Subcontract summary state — lazy-loaded on drawer open to keep page load fast
  // (the underlying query scans v_all_expenses for ALL subcontracts of the site, no date filter)
  const [subcontracts, setSubcontracts] = useState<SubcontractTotals[]>([]);
  const [subcontractsLoading, setSubcontractsLoading] = useState(false);
  const [subcontractDrawerOpen, setSubcontractDrawerOpen] = useState(false);
  const [subcontractsLoadedForSite, setSubcontractsLoadedForSite] = useState<string | null>(null);

  // Result-cap state — load recent rows first and let the user "Load more"
  // so we don't pull thousands of rows from the heavy v_all_expenses view on
  // every page load. The hard ceiling is kept as a safety net for runaway
  // queries (30s client timeout, Cloudflare TTFB).
  const INITIAL_RESULT_LIMIT = 200;
  const MAX_RESULT_LIMIT = 2000;
  const LOAD_MORE_STEP = 200;
  const [loadedLimit, setLoadedLimit] = useState(INITIAL_RESULT_LIMIT);
  const [resultLimitHit, setResultLimitHit] = useState(false);

  // Scope-wide summary from the get_expense_summary RPC. When available it
  // gives accurate lifetime totals regardless of how many rows the table
  // has loaded. If the RPC isn't applied yet (local dev without the
  // migration, for example), this stays null and the summary falls back to
  // client-side aggregation from `expenses`.
  interface ScopeSummary {
    total: number;
    totalCount: number;
    cleared: number;
    clearedCount: number;
    pending: number;
    pendingCount: number;
    breakdown: Record<string, { amount: number; count: number }>;
  }
  const [scopeSummary, setScopeSummary] = useState<ScopeSummary | null>(null);

  // Material Purchases state removed - now handled by Material Settlements page

  // Redirect dialog state for salary expenses that can't be deleted directly
  const [redirectDialog, setRedirectDialog] = useState<{
    open: boolean;
    expense: ExpenseWithCategory | null;
  }>({ open: false, expense: null });

  // Delete confirmation dialog state
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    expense: ExpenseWithCategory | null;
    reason: string;
  }>({ open: false, expense: null, reason: "" });

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

  const canEdit = hasEditPermission(userProfile?.role);

  useEffect(() => {
    const fetchCategories = async () => {
      const { data } = await supabase
        .from("expense_categories")
        .select("*")
        .order("module")
        .order("name");
      setCategories(data || []);
    };
    fetchCategories();
  }, []);

  // Fetch subcontracts with payment totals using shared service
  const fetchSubcontracts = async () => {
    if (!selectedSite?.id) {
      setSubcontracts([]);
      setSubcontractsLoadedForSite(null);
      return;
    }

    setSubcontractsLoading(true);
    try {
      // Use shared service for consistent calculation across all pages
      // totalPaid = subcontract_payments + settlement_groups + cleared expenses
      // Include ALL subcontract statuses to match payments page totals
      const summaries = await getSiteSubcontractTotals(
        supabase,
        selectedSite.id,
        ["active", "on_hold", "completed", "draft", "cancelled"]
      );
      setSubcontracts(summaries);
      setSubcontractsLoadedForSite(selectedSite.id);
    } catch (err) {
      console.error("Error fetching subcontracts:", err);
    } finally {
      setSubcontractsLoading(false);
    }
  };

  // Clear stale subcontract data when site changes; do NOT auto-fetch
  // (the v_all_expenses scan for subcontract totals is the second-heaviest query on this page)
  useEffect(() => {
    setSubcontracts([]);
    setSubcontractsLoadedForSite(null);
  }, [selectedSite?.id]);

  // Fetch subcontract totals only when the user opens the drawer
  // and the data isn't already loaded for the current site.
  useEffect(() => {
    if (
      subcontractDrawerOpen &&
      selectedSite?.id &&
      subcontractsLoadedForSite !== selectedSite.id &&
      !subcontractsLoading
    ) {
      fetchSubcontracts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subcontractDrawerOpen, selectedSite?.id, subcontractsLoadedForSite]);

  // Fetch multi-payer settings when site changes
  useEffect(() => {
    const fetchPayerSettings = async () => {
      if (!selectedSite) {
        setHasMultiplePayers(false);
        setSitePayers([]);
        return;
      }

      try {
        // Fetch site's multi-payer setting
        // Note: Using type assertion until migration is run and types regenerated
        const { data: siteData } = await supabase
          .from("sites")
          .select("*")
          .eq("id", selectedSite.id)
          .single();

        const isMultiPayer = (siteData as any)?.has_multiple_payers || false;
        setHasMultiplePayers(isMultiPayer);

        // Fetch payers if multi-payer is enabled
        if (isMultiPayer) {
          // Note: Using type assertion until migration is run and types regenerated
          const { data: payersData } = await (supabase as any)
            .from("site_payers")
            .select("id, name, is_active")
            .eq("site_id", selectedSite.id)
            .eq("is_active", true)
            .order("name");
          setSitePayers(payersData || []);
        } else {
          setSitePayers([]);
        }
      } catch (err) {
        console.error("Error fetching payer settings:", err);
      }
    };

    fetchPayerSettings();
  }, [selectedSite]);

  const fetchExpenses = async () => {
    if (!selectedSite) return;
    setLoading(true);
    try {
      // Use v_all_expenses view for unified data (regular expenses + derived salary expenses)
      // Note: Cast to any until Supabase types are regenerated after migrations
      let query = (supabase as any)
        .from("v_all_expenses")
        .select("*")
        .eq("site_id", selectedSite.id)
        .eq("is_deleted", false)
        .order("date", { ascending: false });

      // Only apply date filters if not "All Time"
      if (!isAllTime && dateFrom && dateTo) {
        query = query.gte("date", dateFrom).lte("date", dateTo);
      }

      if (activeTab !== "all") query = query.eq("module", activeTab);

      // Load a bounded slice. The initial limit is small (200) so fresh page
      // loads stay snappy even when the user's All Time view would otherwise
      // return thousands of rows. The "Load more" button grows this limit
      // in LOAD_MORE_STEP chunks up to MAX_RESULT_LIMIT as a safety net for
      // the view's 7-way UNION ALL exceeding the 30s client timeout or the
      // Cloudflare proxy TTFB.
      query = query.limit(loadedLimit);

      // Kick off the scope-wide summary RPC in parallel. It's cheap (single
      // aggregated row regardless of scope size) and lets the summary card
      // stay accurate when the table is showing only a 200-row slice.
      const summaryPromise = (supabase as any).rpc("get_expense_summary", {
        p_site_id: selectedSite.id,
        p_date_from: !isAllTime && dateFrom ? dateFrom : null,
        p_date_to: !isAllTime && dateTo ? dateTo : null,
        p_module: activeTab === "all" ? null : activeTab,
      });

      // Use timeout protection to prevent infinite loading
      const [{ data, error }, summaryResult] = await Promise.all([
        supabaseQueryWithTimeout<any[]>(query, 30000),
        summaryPromise,
      ]);
      if (error) throw error;

      const rows = data || [];
      setResultLimitHit(rows.length >= loadedLimit);
      setExpenses(
        rows.map((e: any) => ({
          ...e,
          // View already has category_name, payer_name, subcontract_title
        }))
      );

      // If the RPC landed, use it. Otherwise (e.g. migration not yet
      // applied in local dev) keep scopeSummary null and the summary card
      // falls back to client-side totals over the loaded rows.
      if (summaryResult && !summaryResult.error && summaryResult.data) {
        const s = summaryResult.data as {
          total_amount: number | string;
          total_count: number | string;
          cleared_amount: number | string;
          cleared_count: number | string;
          pending_amount: number | string;
          pending_count: number | string;
          by_type: Array<{ type: string; amount: number | string; count: number | string }>;
        };
        const breakdown: Record<string, { amount: number; count: number }> = {};
        for (const row of s.by_type ?? []) {
          breakdown[row.type] = {
            amount: Number(row.amount) || 0,
            count: Number(row.count) || 0,
          };
        }
        setScopeSummary({
          total: Number(s.total_amount) || 0,
          totalCount: Number(s.total_count) || 0,
          cleared: Number(s.cleared_amount) || 0,
          clearedCount: Number(s.cleared_count) || 0,
          pending: Number(s.pending_amount) || 0,
          pendingCount: Number(s.pending_count) || 0,
          breakdown,
        });
      } else {
        setScopeSummary(null);
      }

      // Mark subcontract totals as stale; they refresh next time the drawer opens.
      setSubcontractsLoadedForSite(null);
    } catch (error: any) {
      console.error("Error loading expenses:", error);
      setExpenses([]);
      setResultLimitHit(false);
      setScopeSummary(null);
    } finally {
      setLoading(false);
    }
  };

  // Reset the load-more window whenever the "what we're looking at" changes:
  // different site, different date scope, or different module tab. The next
  // effect then re-fetches with the fresh limit.
  useEffect(() => {
    setLoadedLimit(INITIAL_RESULT_LIMIT);
  }, [selectedSite, dateFrom, dateTo, activeTab, isAllTime]);

  useEffect(() => {
    fetchExpenses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSite, dateFrom, dateTo, activeTab, isAllTime, loadedLimit]);

  const handleOpenDialog = (expense?: ExpenseWithCategory) => {
    // Prevent editing of settlement-derived expenses
    if (expense?.source_type === "settlement") {
      alert("Salary settlement expenses cannot be edited here. Please use the Salary Settlement page to modify.");
      return;
    }
    // Prevent editing of miscellaneous expenses from this page
    if (expense?.source_type === "misc_expense") {
      router.push(`/site/expenses/miscellaneous?highlight=${encodeURIComponent(expense.settlement_reference || "")}`);
      return;
    }
    // Prevent editing of tea shop settlements from this page
    if (expense?.source_type === "tea_shop_settlement") {
      router.push(`/site/tea-shop?highlight=${encodeURIComponent(expense.settlement_reference || "")}`);
      return;
    }
    // Prevent editing of subcontract direct payments from this page
    if (expense?.source_type === "subcontract_payment") {
      router.push(`/site/subcontracts`);
      return;
    }

    if (expense) {
      setEditingExpense(expense);
      setForm({
        module: expense.module,
        category_id: expense.category_id,
        date: expense.date,
        amount: expense.amount,
        vendor_name: expense.vendor_name || "",
        description: expense.description || "",
        payment_mode: expense.payment_mode || "cash",
        is_cleared: expense.is_cleared,
        site_payer_id: (expense as any).site_payer_id || "",
      });
    } else {
      setEditingExpense(null);
      setForm({
        module: (activeTab === "all" || activeTab === "miscellaneous") ? "general" : activeTab,
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
    setLoading(true);
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
        await (supabase.from("expenses") as any)
          .update(payload)
          .eq("id", editingExpense.id);
      } else {
        await (supabase.from("expenses") as any).insert(payload);
      }
      await fetchExpenses();
      setDialogOpen(false);
    } catch (error: any) {
      alert("Failed to save: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (expense: ExpenseWithCategory) => {
    // Check if expense is derived from settlement_groups (source_type='settlement')
    // These can't be deleted directly - must be cancelled from salary settlement page
    if (expense.source_type === "settlement") {
      setRedirectDialog({ open: true, expense });
      return;
    }

    // Subcontract direct payments can't be deleted from here
    if (expense.source_type === "subcontract_payment") {
      alert("Direct subcontract payments cannot be deleted here. Please use the Subcontracts page to modify.");
      router.push(`/site/subcontracts`);
      return;
    }

    // Legacy: Check if expense came from salary settlement via engineer_transaction_id
    if (expense.engineer_transaction_id) {
      // Show redirect dialog instead of allowing delete
      setRedirectDialog({ open: true, expense });
      return;
    }

    // Show delete confirmation dialog instead of browser confirm
    setDeleteDialog({ open: true, expense, reason: "" });
  };

  const handleConfirmDelete = async () => {
    const expense = deleteDialog.expense;
    if (!expense) return;

    setLoading(true);
    try {
      // Handle different source types
      if (expense.source_type === "misc_expense") {
        // Cancel miscellaneous expense (soft delete)
        const result = await cancelMiscExpense(
          supabase,
          expense.source_id || expense.id,
          deleteDialog.reason || "Deleted from All Site Expenses",
          userProfile?.id || "",
          userProfile?.name || ""
        );
        if (!result.success) {
          throw new Error(result.error || "Failed to delete miscellaneous expense");
        }
      } else if (expense.source_type === "tea_shop_settlement") {
        // Tea shop settlements - soft delete by setting is_cancelled
        const { error } = await supabase
          .from("tea_shop_settlements")
          .update({ is_cancelled: true })
          .eq("id", expense.source_id || expense.id);
        if (error) throw error;
      } else if (expense.source_type === "material_purchase") {
        // Material purchase - check if it's allocated (from inter-site settlement)
        const materialExpenseId = expense.source_id || expense.id;

        // Fetch the material expense to check if it's allocated
        const { data: materialExpense, error: fetchError } = await supabase
          .from("material_purchase_expenses")
          .select("id, original_batch_code, settlement_reference")
          .eq("id", materialExpenseId)
          .single();

        if (fetchError) throw fetchError;

        if (materialExpense?.original_batch_code && materialExpense?.settlement_reference) {
          // This is an allocated expense from inter-site settlement
          // Use the RPC function to cancel the settlement and delete the expense
          const { data: result, error: rpcError } = await (supabase as any).rpc("cancel_allocated_expense", {
            p_expense_id: materialExpenseId,
            p_settlement_reference: materialExpense.settlement_reference,
          });

          if (rpcError) throw rpcError;
        } else {
          // Regular material purchase - just delete it
          const { error: deleteError } = await supabase
            .from("material_purchase_expenses")
            .delete()
            .eq("id", materialExpenseId);

          if (deleteError) throw deleteError;
        }
      } else {
        // Regular expense - hard delete from expenses table
        const { error } = await supabase
          .from("expenses")
          .delete()
          .eq("id", expense.id);
        if (error) throw error;
      }

      setDeleteDialog({ open: false, expense: null, reason: "" });
      await fetchExpenses();
    } catch (error: any) {
      alert("Failed to delete: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    // Prefer the server-side RPC aggregates — they reflect the entire current
    // scope (including All Time with 2000+ rows) without depending on how
    // many rows the table happened to load. Fall back to client aggregation
    // from `expenses` only if the RPC hasn't returned yet or isn't deployed.
    if (scopeSummary) {
      return {
        total: scopeSummary.total,
        cleared: scopeSummary.cleared,
        pending: scopeSummary.pending,
        totalCount: scopeSummary.totalCount,
        clearedCount: scopeSummary.clearedCount,
        pendingCount: scopeSummary.pendingCount,
        categoryBreakdown: scopeSummary.breakdown,
      };
    }

    const total = expenses.reduce((s, e) => s + e.amount, 0);
    const clearedExpenses = expenses.filter((e) => e.is_cleared);
    const cleared = clearedExpenses.reduce((s, e) => s + e.amount, 0);
    const pendingExpenses = expenses.filter((e) => !e.is_cleared);

    // Category breakdown by expense_type - show ALL types separately
    const categoryBreakdown = expenses.reduce((acc, e) => {
      const type = e.expense_type || 'Other';

      // Add all expense types to the breakdown
      if (!acc[type]) {
        acc[type] = { amount: 0, count: 0 };
      }
      acc[type].amount += e.amount;
      acc[type].count += 1;
      return acc;
    }, {} as Record<string, { amount: number; count: 0 }>);

    return {
      total,
      cleared,
      pending: total - cleared,
      totalCount: expenses.length,
      clearedCount: clearedExpenses.length,
      pendingCount: pendingExpenses.length,
      categoryBreakdown,
    };
  }, [expenses, scopeSummary]);

  const columns = useMemo<MRT_ColumnDef<ExpenseWithCategory>[]>(() => {
    const cols: MRT_ColumnDef<ExpenseWithCategory>[] = [
      // 1st column - Ref Code (pinned)
      {
        accessorKey: "settlement_reference",
        header: "Ref Code",
        size: 140,
        filterVariant: "text",
        enablePinning: true,
        Cell: ({ cell, row }) => {
          const ref = cell.getValue<string>();
          if (!ref) {
            return <Typography variant="body2" color="text.disabled">-</Typography>;
          }

          // Determine chip color based on reference type or source type
          const sourceType = row.original.source_type;
          const chipColor = ref.startsWith("MISC-") ? "error" as const
            : ref.startsWith("TSS-") ? "warning" as const
            : ref.startsWith("SCP-") || sourceType === "subcontract_payment" ? "info" as const
            : "primary" as const;

          return (
            <Chip
              label={ref}
              size="small"
              color={chipColor}
              variant="outlined"
              clickable
              onClick={() => {
                // Route based on reference type or source type
                if (ref.startsWith("MISC-")) {
                  // Navigate to miscellaneous expenses page
                  router.push(`/site/expenses/miscellaneous?highlight=${encodeURIComponent(ref)}`);
                } else if (ref.startsWith("TSS-")) {
                  // Navigate to tea shop page
                  router.push(`/site/tea-shop?highlight=${encodeURIComponent(ref)}`);
                } else if (ref.startsWith("SCP-") || sourceType === "subcontract_payment") {
                  // Navigate to subcontracts page for direct payments
                  router.push(`/site/subcontracts`);
                } else {
                  // Settlement refs (DLY-, SS-, WS-) - open InspectPane in-place,
                  // no nav. Cross-page rule from spec section 6.
                  const isWeekly = ref.startsWith("WS-");
                  if (isWeekly) {
                    // Weekly needs contract_laborer_id + week_start/week_end on the
                    // row. v_all_expenses doesn't yet expose those columns, so the
                    // accessor read returns undefined and we fall back to navigation
                    // (the previous behaviour) rather than silently dropping the click.
                    const lid = (row.original as any).contract_laborer_id;
                    const ws = (row.original as any).week_start;
                    const we = (row.original as any).week_end;
                    if (lid && ws && we) {
                      pane.open({
                        kind: "weekly-week",
                        siteId: selectedSite!.id,
                        laborerId: lid,
                        weekStart: ws,
                        weekEnd: we,
                        settlementRef: ref,
                      });
                    } else {
                      router.push(`/site/payments?tab=contract&highlight=${encodeURIComponent(ref)}`);
                    }
                  } else {
                    pane.open({
                      kind: "daily-date",
                      siteId: selectedSite!.id,
                      date: row.original.date,
                      settlementRef: ref,
                    });
                  }
                }
              }}
              sx={{ fontFamily: "monospace", fontWeight: 600, cursor: "pointer" }}
            />
          );
        },
      },
      // 2nd column - Settlement Date (pinned)
      {
        accessorKey: "date",
        header: "Settlement Date",
        size: 130,
        enablePinning: true,
        Cell: ({ cell }) =>
          dayjs(cell.getValue<string>()).format("DD MMM YYYY"),
      },
      // 3rd column - Recorded Date
      {
        accessorKey: "recorded_date",
        header: "Recorded Date",
        size: 130,
        Cell: ({ cell, row }) => {
          const recordedDate = cell.getValue<string>();
          const settlementDate = row.original.date;
          const isDifferent = recordedDate && settlementDate && recordedDate !== settlementDate;
          return (
            <Typography
              variant="body2"
              color={isDifferent ? "warning.main" : "text.primary"}
              fontWeight={isDifferent ? 500 : 400}
            >
              {recordedDate ? dayjs(recordedDate).format("DD MMM YYYY") : "-"}
            </Typography>
          );
        },
      },
      {
        accessorKey: "module",
        header: "Module",
        size: 100,
        filterVariant: "select",
        filterSelectOptions: [
          { value: "salary", label: "SALARY" },
          { value: "material", label: "MATERIAL" },
          { value: "general", label: "GENERAL" },
        ],
        Cell: ({ cell }) => (
          <Chip label={cell.getValue<string>().toUpperCase()} size="small" />
        ),
      },
      {
        accessorKey: "expense_type",
        header: "Type",
        size: 130,
        filterVariant: "select",
        filterSelectOptions: ["Daily Salary", "Contract Salary", "Advance", "Direct Payment", "Material", "Machinery", "General", "Miscellaneous", "Tea & Snacks"],
        Cell: ({ cell }) => {
          const type = cell.getValue<string>();
          const colorMap: Record<string, "primary" | "secondary" | "warning" | "info" | "success" | "default" | "error"> = {
            "Daily Salary": "primary",
            "Contract Salary": "secondary",
            "Advance": "warning",
            "Direct Payment": "secondary",
            "Material": "info",
            "Machinery": "success",
            "General": "default",
            "Miscellaneous": "error",
            "Tea & Snacks": "warning",
          };
          return (
            <Chip
              label={type || "Other"}
              size="small"
              color={colorMap[type] || "default"}
              variant="outlined"
            />
          );
        },
      },
      { accessorKey: "category_name", header: "Category", size: 150 },
      {
        accessorKey: "amount",
        header: "Amount",
        size: 120,
        Cell: ({ cell }) => (
          <Typography fontWeight={600} color="error.main">
            ₹{cell.getValue<number>().toLocaleString('en-IN')}
          </Typography>
        ),
      },
      {
        accessorKey: "vendor_name",
        header: "Vendor",
        size: 150,
        Cell: ({ cell }) => cell.getValue<string>() || "-",
      },
      {
        accessorKey: "payer_name",
        header: "Paid By",
        size: 130,
        Cell: ({ cell }) => {
          const value = cell.getValue<string>();
          return value ? (
            <Chip label={value} size="small" variant="outlined" color="secondary" />
          ) : (
            <Typography variant="body2" color="text.disabled">—</Typography>
          );
        },
      },
      {
        accessorKey: "subcontract_title",
        header: "Subcontract",
        size: 160,
        filterVariant: "text",
        Cell: ({ cell }) => {
          const value = cell.getValue<string>();
          return value ? (
            <Chip
              label={value}
              size="small"
              color="info"
              variant="outlined"
              icon={<LinkIcon fontSize="small" />}
            />
          ) : (
            <Chip
              label="Unlinked"
              size="small"
              variant="outlined"
              sx={{ color: 'text.disabled', borderColor: 'divider' }}
            />
          );
        },
      },
    ];

    cols.push(
      {
        accessorKey: "is_cleared",
        header: "Status",
        size: 150,
        filterVariant: "select",
        filterSelectOptions: [
          { value: "true", label: "Cleared" },
          { value: "false", label: "Pending" },
        ],
        Cell: ({ cell, row }) => {
          const isCleared = cell.getValue<boolean>();
          const description = row.original.description || "";
          const isPendingFromCompany = !isCleared && description.includes("Pending from Company");

          return (
            <Chip
              label={isCleared ? "CLEARED" : isPendingFromCompany ? "PENDING (COMPANY)" : "PENDING"}
              size="small"
              color={isCleared ? "success" : isPendingFromCompany ? "error" : "warning"}
              sx={isPendingFromCompany ? { fontWeight: 600 } : undefined}
            />
          );
        },
      },
      {
        id: "mrt-row-actions",
        header: "Actions",
        size: 100,
        Cell: ({ row }) => (
          <Box sx={{ display: "flex", gap: 0.5 }}>
            <IconButton
              size="small"
              onClick={() => handleOpenDialog(row.original)}
              disabled={!canEdit}
            >
              <Edit fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              color="error"
              onClick={() => handleDelete(row.original)}
              disabled={!canEdit}
            >
              <Delete fontSize="small" />
            </IconButton>
          </Box>
        ),
      }
    );

    return cols;
    // pane and selectedSite are captured by closure inside the Ref Code onClick;
    // include them so settlement-ref clicks always see the latest values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit, pane, selectedSite, router]);

  if (!selectedSite)
    return (
      <Box>
        <PageHeader title="All Site Expenses" titleChip={<ScopeChip />} />
        <Alert severity="warning">Please select a site</Alert>
      </Box>
    );

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
            >
              Add Expense
            </Button>
            <Tooltip title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
              <IconButton
                onClick={() => setIsFullscreen((v) => !v)}
                size="small"
                aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              >
                {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
              </IconButton>
            </Tooltip>
          </Box>
        }
      />

      {/* Unified Expense Summary */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: 0 }}>
          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "column", md: "row" },
              gap: { xs: 2.5, md: 3 },
              alignItems: { xs: "stretch", md: "stretch" },
              p: { xs: 2, md: 2.5 },
            }}
          >
            {/* Left: Total */}
            <Box
              sx={{
                minWidth: { xs: "auto", md: 180 },
                borderRight: { xs: 0, md: 1 },
                borderBottom: { xs: 1, md: 0 },
                borderColor: "divider",
                pr: { xs: 0, md: 3 },
                pb: { xs: 2, md: 0 },
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                <AttachMoney sx={{ fontSize: 18, color: "error.main" }} />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 500 }}
                >
                  Total Expenses
                </Typography>
              </Box>
              <Typography variant="h4" fontWeight={700} color="error.main">
                ₹{stats.total.toLocaleString("en-IN")}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {stats.totalCount} records
              </Typography>
            </Box>

            {/* Middle: Breakdown */}
            {Object.keys(stats.categoryBreakdown).length > 0 && (
              <Box sx={{ flex: 1 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    mb: 1.5,
                    display: "block",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    fontWeight: 500,
                  }}
                >
                  Breakdown by Type
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5 }}>
                  {/* Show all expense types */}
                  {Object.entries(stats.categoryBreakdown)
                    .sort(([, a], [, b]) => b.amount - a.amount)
                    .map(([type, data]) => (
                      <Box
                        key={type}
                        sx={{
                          px: 2,
                          py: 1.25,
                          bgcolor: "action.hover",
                          borderRadius: 1.5,
                          minWidth: 110,
                          flex: "1 1 auto",
                          maxWidth: { xs: "100%", sm: 160 },
                          transition: "background-color 0.2s",
                          "&:hover": {
                            bgcolor: "action.selected",
                          },
                        }}
                      >
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          noWrap
                          sx={{ display: "block", mb: 0.25 }}
                        >
                          {type}
                        </Typography>
                        <Typography variant="subtitle1" fontWeight={600}>
                          ₹{data.amount.toLocaleString("en-IN")}
                        </Typography>
                        <Typography variant="caption" color="text.disabled">
                          {data.count} rec
                        </Typography>
                      </Box>
                    ))}
                </Box>
              </Box>
            )}

            {/* Right: Subcontract Summary — lazy-loaded (heavy v_all_expenses query) */}
            <Box
              sx={{
                minWidth: { xs: "auto", md: 200 },
                borderLeft: { xs: 0, md: 1 },
                borderTop: { xs: 1, md: 0 },
                borderColor: "divider",
                pl: { xs: 0, md: 3 },
                pt: { xs: 2, md: 0 },
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              {subcontractsLoadedForSite === selectedSite.id && subcontracts.length > 0 ? (
                <Box
                  onClick={() => setSubcontractDrawerOpen(true)}
                  sx={{
                    cursor: "pointer",
                    borderRadius: 1.5,
                    p: 1.5,
                    mx: -1.5,
                    transition: "background-color 0.2s",
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <ContractIcon sx={{ fontSize: 16, color: "primary.main" }} />
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 500 }}
                      >
                        Subcontracts
                      </Typography>
                    </Box>
                    <ChevronRight sx={{ fontSize: 18, color: "text.secondary" }} />
                  </Box>
                  <Box sx={{ display: "flex", gap: 2 }}>
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                        Value
                      </Typography>
                      <Typography variant="body2" fontWeight={600}>
                        ₹{subcontracts.reduce((sum, sc) => sum + sc.totalValue, 0).toLocaleString("en-IN")}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                        Paid
                      </Typography>
                      <Typography variant="body2" fontWeight={600} color="success.main">
                        ₹{subcontracts.reduce((sum, sc) => sum + sc.totalPaid, 0).toLocaleString("en-IN")}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                        Balance
                      </Typography>
                      <Typography variant="body2" fontWeight={600} color="warning.main">
                        ₹{subcontracts.reduce((sum, sc) => sum + sc.balance, 0).toLocaleString("en-IN")}
                      </Typography>
                    </Box>
                  </Box>
                </Box>
              ) : (
                <Tooltip title="Subcontract totals are loaded on demand to keep this page fast">
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<ContractIcon />}
                    onClick={() => setSubcontractDrawerOpen(true)}
                    disabled={subcontractsLoading}
                  >
                    {subcontractsLoading ? "Loading…" : "Show Subcontract Summary"}
                  </Button>
                </Tooltip>
              )}
            </Box>
          </Box>
        </CardContent>
      </Card>

      {resultLimitHit && (
        <Alert
          severity="info"
          sx={{ mb: 2 }}
          action={
            loadedLimit < MAX_RESULT_LIMIT ? (
              <Button
                color="inherit"
                size="small"
                disabled={loading}
                onClick={() =>
                  setLoadedLimit((l) =>
                    Math.min(l + LOAD_MORE_STEP, MAX_RESULT_LIMIT)
                  )
                }
              >
                {loading
                  ? "Loading…"
                  : `Load ${LOAD_MORE_STEP} more`}
              </Button>
            ) : null
          }
        >
          Table shows the most recent {loadedLimit.toLocaleString("en-IN")}{" "}
          records for the current scope.
          {scopeSummary
            ? ` Totals above are accurate across all ${scopeSummary.totalCount.toLocaleString(
                "en-IN"
              )} records.`
            : " Totals above reflect this slice."}
          {loadedLimit < MAX_RESULT_LIMIT
            ? ` Click "Load ${LOAD_MORE_STEP} more" to see older rows, or narrow the date range.`
            : ` You've reached the ${MAX_RESULT_LIMIT.toLocaleString(
                "en-IN"
              )} row table ceiling. Narrow the date range to see older rows.`}
        </Alert>
      )}

      {/* Material Purchases section removed - material expenses show in All Site Expenses only AFTER settlement */}
      {/* See /site/material-settlements for pending material purchases */}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Tabs
            value={activeTab}
            onChange={(_, v) => setActiveTab(v)}
          >
            <Tab label="All" value="all" />
            <Tab label="Labor" value="labor" />
            <Tab label="Material" value="material" />
            <Tab label="Machinery" value="machinery" />
            <Tab label="General" value="general" />
            <Tab label="Miscellaneous" value="miscellaneous" />
          </Tabs>
        </CardContent>
      </Card>
      </Box>

      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <DataTable
          columns={columns}
          data={expenses}
          isLoading={loading}
          enableColumnPinning
          showRecordCount
          initialState={{
            columnPinning: { left: ["settlement_reference", "date"] },
          }}
        />
      </Box>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>{editingExpense ? "Edit" : "Add"} Expense</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 2 }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 6 }}>
                <FormControl fullWidth>
                  <InputLabel>Module</InputLabel>
                  <Select
                    value={form.module}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        module: e.target.value as ExpenseModule,
                        category_id: "",
                      })
                    }
                    label="Module"
                  >
                    <MenuItem value="labor">Labor</MenuItem>
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
                    onChange={(e) =>
                      setForm({ ...form, category_id: e.target.value })
                    }
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
                  onChange={(e) =>
                    setForm({ ...form, amount: Number(e.target.value) })
                  }
                  slotProps={{ input: { startAdornment: "₹" } }}
                />
              </Grid>
            </Grid>
            <TextField
              fullWidth
              label="Vendor"
              value={form.vendor_name}
              onChange={(e) =>
                setForm({ ...form, vendor_name: e.target.value })
              }
            />
            <TextField
              fullWidth
              label="Description"
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              multiline
              rows={2}
            />
            <FormControl fullWidth>
              <InputLabel>Payment Mode</InputLabel>
              <Select
                value={form.payment_mode}
                onChange={(e) =>
                  setForm({
                    ...form,
                    payment_mode: e.target.value as PaymentMode,
                  })
                }
                label="Payment Mode"
              >
                <MenuItem value="cash">Cash</MenuItem>
                <MenuItem value="upi">UPI</MenuItem>
                <MenuItem value="bank_transfer">Bank Transfer</MenuItem>
                <MenuItem value="cheque">Cheque</MenuItem>
              </Select>
            </FormControl>
            {hasMultiplePayers && sitePayers.length > 0 && (
              <FormControl fullWidth>
                <InputLabel>Paid By</InputLabel>
                <Select
                  value={form.site_payer_id}
                  onChange={(e) =>
                    setForm({ ...form, site_payer_id: e.target.value })
                  }
                  label="Paid By"
                >
                  <MenuItem value="">
                    <em>Not specified</em>
                  </MenuItem>
                  {sitePayers.map((payer) => (
                    <MenuItem key={payer.id} value={payer.id}>
                      {payer.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            <FormControlLabel
              control={
                <Switch
                  checked={form.is_cleared}
                  onChange={(e) =>
                    setForm({ ...form, is_cleared: e.target.checked })
                  }
                />
              }
              label="Payment Cleared"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained" disabled={loading}>
            {editingExpense ? "Update" : "Add"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Redirect dialog for salary expenses */}
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

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialog.open}
        onClose={() => setDeleteDialog({ open: false, expense: null, reason: "" })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ pb: 1 }}>Delete Expense</DialogTitle>
        <DialogContent>
          {deleteDialog.expense && (
            <Box sx={{ mb: 2 }}>
              <Alert severity="warning" sx={{ mb: 2 }}>
                Are you sure you want to delete this expense? This action cannot be undone.
              </Alert>
              <Box sx={{ p: 2, bgcolor: "action.hover", borderRadius: 1 }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  <strong>Reference:</strong> {deleteDialog.expense.settlement_reference || "-"}
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  <strong>Type:</strong> {deleteDialog.expense.expense_type || deleteDialog.expense.source_type || "-"}
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  <strong>Category:</strong> {deleteDialog.expense.category_name || "-"}
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
          <Button
            onClick={() => setDeleteDialog({ open: false, expense: null, reason: "" })}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleConfirmDelete}
            disabled={loading}
          >
            {loading ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Subcontracts Summary Drawer */}
      <Drawer
        anchor="right"
        open={subcontractDrawerOpen}
        onClose={() => setSubcontractDrawerOpen(false)}
        PaperProps={{
          sx: { width: { xs: "100%", sm: 480, md: 560 } },
        }}
      >
        <Box sx={{ p: 3 }}>
          {/* Header */}
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

          {/* Summary Totals */}
          <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
            <Box sx={{ flex: 1, minWidth: 100, p: 2, bgcolor: "action.hover", borderRadius: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                Total Value
              </Typography>
              <Typography variant="h6" fontWeight={700}>
                ₹{subcontracts.reduce((sum, sc) => sum + sc.totalValue, 0).toLocaleString("en-IN")}
              </Typography>
            </Box>
            <Box sx={{ flex: 1, minWidth: 100, p: 2, bgcolor: "success.50", borderRadius: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                Total Paid
              </Typography>
              <Typography variant="h6" fontWeight={700} color="success.main">
                ₹{subcontracts.reduce((sum, sc) => sum + sc.totalPaid, 0).toLocaleString("en-IN")}
              </Typography>
            </Box>
            <Box sx={{ flex: 1, minWidth: 100, p: 2, bgcolor: "warning.50", borderRadius: 1.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
                Balance
              </Typography>
              <Typography variant="h6" fontWeight={700} color="warning.main">
                ₹{subcontracts.reduce((sum, sc) => sum + sc.balance, 0).toLocaleString("en-IN")}
              </Typography>
            </Box>
          </Box>

          <Divider sx={{ mb: 3 }} />

          {/* Subcontract List */}
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Individual Subcontracts
          </Typography>

          {subcontractsLoading ? (
            <Typography color="text.secondary">Loading...</Typography>
          ) : (
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
                      <Typography variant="body2" fontWeight={500} color={sc.balance > 0 ? "warning.main" : "success.main"}>
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
          )}

          {/* View All Button */}
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
        </Box>
      </Drawer>

      {/* Inspect pane for settlement detail (DLY-/SS-/WS- ref-code clicks). */}
      {/* No onSettleClick: pending settlements live on /site/payments. */}
      <InspectPane
        entity={pane.currentEntity}
        isOpen={pane.isOpen}
        isPinned={pane.isPinned}
        activeTab={pane.activeTab}
        onTabChange={pane.setActiveTab}
        onClose={pane.close}
        onTogglePin={pane.togglePin}
        onOpenInPage={(e) => {
          const url =
            e.kind === "daily-date"
              ? `/site/payments?ref=${e.settlementRef ?? ""}`
              : `/site/payments?ref=${e.settlementRef ?? ""}`;
          router.push(url);
        }}
      />
    </Box>
  );
}
