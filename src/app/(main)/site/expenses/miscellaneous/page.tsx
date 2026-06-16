"use client";

export const dynamic = "force-dynamic";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Box,
  Button,
  Typography,
  Chip,
  Alert,
  Card,
  CardContent,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Tooltip,
} from "@mui/material";
import {
  Add,
  Delete,
  Edit,
  AttachMoney,
  TrendingUp,
  Receipt,
  Cancel as CancelIcon,
  Visibility as ViewIcon,
  AccountBalanceWallet as WalletIcon,
} from "@mui/icons-material";
import DataTable, { type MRT_ColumnDef } from "@/components/common/DataTable";
import { createClient } from "@/lib/supabase/client";
import { useSite } from "@/contexts/SiteContext";
import { useAuth } from "@/contexts/AuthContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import PageHeader from "@/components/layout/PageHeader";
import { hasEditPermission } from "@/lib/permissions";
import MiscExpenseDialog from "@/components/expenses/MiscExpenseDialog";
import MiscExpenseViewDialog from "@/components/expenses/MiscExpenseViewDialog";
import WalletSettlementAuditDialog from "@/components/expenses/WalletSettlementAuditDialog";
import { getMiscExpenses, getMiscExpenseStats, cancelMiscExpense } from "@/lib/services/miscExpenseService";
import PayerSourceChip from "@/components/settlement/PayerSourceChip";
import type { MiscExpenseWithDetails, MiscExpenseStatsWithBreakdown } from "@/types/misc-expense.types";
import dayjs from "dayjs";

export default function MiscellaneousExpensesPage() {
  const { selectedSite } = useSite();
  const { userProfile } = useAuth();
  const { formatForApi, isAllTime } = useDateRange();
  const supabase = createClient();

  const { dateFrom, dateTo } = formatForApi();

  const [expenses, setExpenses] = useState<MiscExpenseWithDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<MiscExpenseWithDetails | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingExpense, setViewingExpense] = useState<MiscExpenseWithDetails | null>(null);
  const [walletAuditOpen, setWalletAuditOpen] = useState(false);
  const [walletAuditExpense, setWalletAuditExpense] = useState<MiscExpenseWithDetails | null>(null);

  // Stats
  const [stats, setStats] = useState<MiscExpenseStatsWithBreakdown>({
    total: 0,
    cleared: 0,
    pending: 0,
    totalCount: 0,
    clearedCount: 0,
    pendingCount: 0,
    categoryBreakdown: [],
  });

  // Cancel dialog state
  const [cancelDialog, setCancelDialog] = useState<{
    open: boolean;
    expense: MiscExpenseWithDetails | null;
    reason: string;
  }>({ open: false, expense: null, reason: "" });

  // Category filter state
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

  const canEdit = hasEditPermission(userProfile?.role);

  const fetchExpenses = useCallback(async () => {
    if (!selectedSite?.id) {
      setExpenses([]);
      return;
    }

    setLoading(true);
    try {
      const data = await getMiscExpenses(supabase, selectedSite.id, {
        dateFrom: isAllTime ? undefined : (dateFrom || undefined),
        dateTo: isAllTime ? undefined : (dateTo || undefined),
      });
      setExpenses(data);
    } catch (err) {
      console.error("Error fetching expenses:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedSite?.id, dateFrom, dateTo, isAllTime]);

  const fetchStats = useCallback(async () => {
    if (!selectedSite?.id) {
      setStats({ total: 0, cleared: 0, pending: 0, totalCount: 0, clearedCount: 0, pendingCount: 0, categoryBreakdown: [] });
      return;
    }

    try {
      const data = await getMiscExpenseStats(supabase, selectedSite.id, {
        dateFrom: isAllTime ? undefined : (dateFrom || undefined),
        dateTo: isAllTime ? undefined : (dateTo || undefined),
      });
      setStats(data);
    } catch (err) {
      console.error("Error fetching stats:", err);
    }
  }, [selectedSite?.id, dateFrom, dateTo, isAllTime]);

  // Fetch expense categories
  const fetchCategories = useCallback(async () => {
    try {
      const { data } = await (supabase as any)
        .from("expense_categories")
        .select("id, name")
        .eq("module", "miscellaneous")
        .eq("is_active", true)
        .order("display_order");
      setCategories(data || []);
    } catch (err) {
      console.error("Error fetching categories:", err);
    }
  }, []);

  useEffect(() => {
    fetchExpenses();
    fetchStats();
    fetchCategories();
  }, [fetchExpenses, fetchStats, fetchCategories]);

  const handleEdit = (expense: MiscExpenseWithDetails) => {
    setEditingExpense(expense);
    setDialogOpen(true);
  };

  const handleView = (expense: MiscExpenseWithDetails) => {
    setViewingExpense(expense);
    setViewDialogOpen(true);
  };

  const handleWalletAudit = (expense: MiscExpenseWithDetails) => {
    setWalletAuditExpense(expense);
    setWalletAuditOpen(true);
  };

  const handleCancelClick = (expense: MiscExpenseWithDetails) => {
    setCancelDialog({ open: true, expense, reason: "" });
  };

  const handleCancelConfirm = async () => {
    if (!cancelDialog.expense || !cancelDialog.reason.trim()) return;

    try {
      const result = await cancelMiscExpense(
        supabase,
        cancelDialog.expense.id,
        cancelDialog.reason,
        userProfile?.id || "",
        userProfile?.name || "System"
      );

      if (!result.success) {
        throw new Error(result.error);
      }

      setCancelDialog({ open: false, expense: null, reason: "" });
      fetchExpenses();
      fetchStats();
    } catch (err: any) {
      console.error("Error cancelling expense:", err);
      alert(err.message || "Failed to cancel expense");
    }
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingExpense(null);
  };

  const handleSuccess = () => {
    fetchExpenses();
    fetchStats();
  };

  // Filter expenses by selected category
  const filteredExpenses = useMemo(() => {
    if (categoryFilter === "all") return expenses;
    if (categoryFilter === "uncategorized") {
      return expenses.filter((e) => !e.category_id);
    }
    return expenses.filter((e) => e.category_id === categoryFilter);
  }, [expenses, categoryFilter]);

  const columns = useMemo<MRT_ColumnDef<MiscExpenseWithDetails>[]>(
    () => [
      {
        accessorKey: "reference_number",
        header: "Ref Code",
        size: 140,
        Cell: ({ cell }) => {
          const value = cell.getValue<string>();
          return (
            <Chip
              label={value}
              size="small"
              color="info"
              variant="outlined"
              sx={{ fontWeight: 600, fontSize: "0.75rem" }}
            />
          );
        },
      },
      {
        accessorKey: "date",
        header: "Date",
        size: 110,
        Cell: ({ cell }) => dayjs(cell.getValue<string>()).format("DD MMM YYYY"),
      },
      {
        accessorKey: "category_name",
        header: "Category",
        size: 140,
        Cell: ({ cell }) => cell.getValue<string>() || "-",
      },
      {
        accessorKey: "amount",
        header: "Amount",
        size: 120,
        Cell: ({ cell }) => (
          <Typography fontWeight={600} color="success.main">
            ₹{cell.getValue<number>()?.toLocaleString("en-IN") || 0}
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
        accessorKey: "payer_source",
        header: "Payer Source",
        size: 160,
        Cell: ({ row }) => {
          const source = row.original.payer_source;
          if (!source) return "-";
          // Wallet-funded rows carry the real funding source(s) derived from the
          // engineer's deposits (Amma / Trust / a split / a pending gap); the
          // chip renders single, multi-source breakdown, or amber "Pending".
          // A violet wallet glyph flags rows settled via the engineer's wallet.
          const viaWallet = Boolean(row.original.engineer_transaction_id);
          return (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              {viaWallet && (
                <Tooltip title="Settled via engineer's wallet">
                  <WalletIcon sx={{ color: "#6366f1", fontSize: 16 }} />
                </Tooltip>
              )}
              <PayerSourceChip
                row={{
                  payer_source: source,
                  payer_name: row.original.payer_name ?? null,
                  payer_source_split: row.original.payer_source_split ?? null,
                }}
                size="small"
              />
            </Box>
          );
        },
      },
      {
        accessorKey: "payment_mode",
        header: "Mode",
        size: 100,
        Cell: ({ cell }) => {
          const value = cell.getValue<string>();
          const modeLabels: Record<string, string> = {
            cash: "Cash",
            upi: "UPI",
            bank_transfer: "Bank",
            cheque: "Cheque",
          };
          return (
            <Chip
              label={modeLabels[value] || value}
              size="small"
              variant="outlined"
            />
          );
        },
      },
      {
        accessorKey: "subcontract_title",
        header: "Subcontract",
        size: 150,
        Cell: ({ cell }) => {
          const value = cell.getValue<string>();
          if (!value) return "-";
          return (
            <Chip
              label={value.length > 20 ? value.substring(0, 18) + "..." : value}
              size="small"
              color="secondary"
              variant="outlined"
            />
          );
        },
      },
      {
        accessorKey: "is_cleared",
        header: "Status",
        size: 100,
        Cell: ({ cell }) => {
          const isCleared = cell.getValue<boolean>();
          return (
            <Chip
              label={isCleared ? "CLEARED" : "PENDING"}
              size="small"
              color={isCleared ? "success" : "warning"}
            />
          );
        },
      },
      {
        id: "actions",
        header: "Actions",
        size: 130,
        enableSorting: false,
        enableColumnFilter: false,
        Cell: ({ row }) => (
          <Box sx={{ display: "flex", gap: 0.5 }}>
            <IconButton
              size="small"
              onClick={() => handleView(row.original)}
              color="info"
              title="View Details"
            >
              <ViewIcon fontSize="small" />
            </IconButton>
            {row.original.engineer_transaction_id && (
              <IconButton
                size="small"
                onClick={() => handleWalletAudit(row.original)}
                title="Settled via engineer's wallet — view audit"
                sx={{ color: "#6366f1" }}
              >
                <WalletIcon fontSize="small" />
              </IconButton>
            )}
            <IconButton
              size="small"
              onClick={() => handleEdit(row.original)}
              disabled={!canEdit}
              color="primary"
              title="Edit"
            >
              <Edit fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              onClick={() => handleCancelClick(row.original)}
              disabled={!canEdit}
              color="error"
              title="Cancel"
            >
              <CancelIcon fontSize="small" />
            </IconButton>
          </Box>
        ),
      },
    ],
    [canEdit]
  );

  if (!selectedSite) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="info">Please select a site to view miscellaneous expenses.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <PageHeader
        title="Miscellaneous Expenses"
        subtitle="Track ad-hoc expenses that don't fit into major categories"
        actions={
          canEdit && (
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => setDialogOpen(true)}
            >
              Add Expense
            </Button>
          )
        }
      />

      {/* Summary Card with Category Breakdown */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
          <Box
            sx={{
              display: "flex",
              flexDirection: { xs: "column", md: "row" },
              gap: { xs: 2.5, md: 3 },
              alignItems: "stretch",
            }}
          >
            {/* Left: Total Expenses */}
            <Box
              sx={{
                minWidth: { xs: "auto", md: 140 },
                borderRight: { xs: 0, md: 1 },
                borderBottom: { xs: 1, md: 0 },
                borderColor: "divider",
                pr: { xs: 0, md: 3 },
                pb: { xs: 2, md: 0 },
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                <AttachMoney sx={{ fontSize: 18, color: "primary.main" }} />
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", fontWeight: 500 }}>
                  Total Expenses
                </Typography>
              </Box>
              <Typography variant="h5" fontWeight={700}>
                ₹{stats.total.toLocaleString("en-IN")}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {stats.totalCount} records
              </Typography>
            </Box>

            {/* Middle: Cleared & Pending */}
            <Box
              sx={{
                display: "flex",
                gap: 3,
                flexWrap: "wrap",
                borderRight: { xs: 0, md: 1 },
                borderBottom: { xs: 1, md: 0 },
                borderColor: "divider",
                pr: { xs: 0, md: 3 },
                pb: { xs: 2, md: 0 },
              }}
            >
              <Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.5 }}>
                  <TrendingUp sx={{ fontSize: 16, color: "success.main" }} />
                  <Typography variant="caption" color="text.secondary">Cleared</Typography>
                </Box>
                <Typography variant="h6" fontWeight={600} color="success.main">
                  ₹{stats.cleared.toLocaleString("en-IN")}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {stats.clearedCount} rec
                </Typography>
              </Box>
              <Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 0.5 }}>
                  <Receipt sx={{ fontSize: 16, color: "warning.main" }} />
                  <Typography variant="caption" color="text.secondary">Pending</Typography>
                </Box>
                <Typography variant="h6" fontWeight={600} color="warning.main">
                  ₹{stats.pending.toLocaleString("en-IN")}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {stats.pendingCount} rec
                </Typography>
              </Box>
            </Box>

            {/* Right: Category Breakdown */}
            {stats.categoryBreakdown.length > 0 && (
              <Box sx={{ flex: 1, pt: { xs: 1, md: 0 } }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mb: 1.5, display: "block", textTransform: "uppercase", fontWeight: 500 }}
                >
                  By Category
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                  {stats.categoryBreakdown.map((cat) => (
                    <Box
                      key={cat.categoryId || "uncategorized"}
                      onClick={() => setCategoryFilter(cat.categoryId || "uncategorized")}
                      sx={{
                        px: 1.5,
                        py: 1,
                        bgcolor: categoryFilter === (cat.categoryId || "uncategorized") ? "primary.light" : "action.hover",
                        borderRadius: 1,
                        cursor: "pointer",
                        minWidth: 80,
                        transition: "background-color 0.2s",
                        "&:hover": { bgcolor: "action.selected" },
                      }}
                    >
                      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                        {cat.categoryName}
                      </Typography>
                      <Typography variant="body2" fontWeight={600}>
                        ₹{cat.totalAmount.toLocaleString("en-IN")}
                      </Typography>
                      <Typography variant="caption" color="text.disabled">
                        {cat.count} rec
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>

      {/* Category Filter */}
      {categories.length > 0 && (
        <Box sx={{ mb: 2, display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
          <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>
            Filter by:
          </Typography>
          <Chip
            label="All"
            onClick={() => setCategoryFilter("all")}
            color={categoryFilter === "all" ? "primary" : "default"}
            variant={categoryFilter === "all" ? "filled" : "outlined"}
            size="small"
          />
          {categories.map((cat) => (
            <Chip
              key={cat.id}
              label={cat.name}
              onClick={() => setCategoryFilter(cat.id)}
              color={categoryFilter === cat.id ? "primary" : "default"}
              variant={categoryFilter === cat.id ? "filled" : "outlined"}
              size="small"
            />
          ))}
          <Chip
            label="Uncategorized"
            onClick={() => setCategoryFilter("uncategorized")}
            color={categoryFilter === "uncategorized" ? "warning" : "default"}
            variant={categoryFilter === "uncategorized" ? "filled" : "outlined"}
            size="small"
          />
        </Box>
      )}

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={filteredExpenses}
        isLoading={loading}
        initialState={{
          sorting: [{ id: "date", desc: true }],
        }}
      />

      {/* Add/Edit Dialog */}
      <MiscExpenseDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        expense={editingExpense}
        onSuccess={handleSuccess}
      />

      {/* Cancel Confirmation Dialog */}
      <Dialog
        open={cancelDialog.open}
        onClose={() => setCancelDialog({ open: false, expense: null, reason: "" })}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Cancel Expense</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Are you sure you want to cancel this expense?
          </Typography>
          {cancelDialog.expense && (
            <Box sx={{ mb: 2, p: 1.5, bgcolor: "grey.100", borderRadius: 1 }}>
              <Typography variant="body2" fontWeight={600}>
                {cancelDialog.expense.reference_number}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                ₹{cancelDialog.expense.amount?.toLocaleString("en-IN")} -{" "}
                {cancelDialog.expense.vendor_name || cancelDialog.expense.description || "No description"}
              </Typography>
            </Box>
          )}
          <TextField
            label="Cancellation Reason"
            value={cancelDialog.reason}
            onChange={(e) => setCancelDialog((prev) => ({ ...prev, reason: e.target.value }))}
            fullWidth
            multiline
            rows={2}
            required
            placeholder="Why is this expense being cancelled?"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelDialog({ open: false, expense: null, reason: "" })}>
            Keep Expense
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleCancelConfirm}
            disabled={!cancelDialog.reason.trim()}
          >
            Cancel Expense
          </Button>
        </DialogActions>
      </Dialog>

      {/* View Details Dialog */}
      <MiscExpenseViewDialog
        open={viewDialogOpen}
        onClose={() => {
          setViewDialogOpen(false);
          setViewingExpense(null);
        }}
        expense={viewingExpense}
      />

      {/* Wallet settlement audit (only for wallet-funded rows) */}
      <WalletSettlementAuditDialog
        open={walletAuditOpen}
        onClose={() => {
          setWalletAuditOpen(false);
          setWalletAuditExpense(null);
        }}
        expense={walletAuditExpense}
      />
    </Box>
  );
}
