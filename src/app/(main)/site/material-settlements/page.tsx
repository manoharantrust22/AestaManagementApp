"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Skeleton,
  Alert,
  Snackbar,
  Stack,
  Divider,
  Collapse,
  IconButton,
  Tooltip,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import {
  Add as AddIcon,
  AutoAwesome as AIIcon,
  Pending as PendingIcon,
  CheckCircle as SettledIcon,
  Inventory as InventoryIcon,
  Schedule as ClockIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from "@mui/icons-material";
import PageHeader from "@/components/layout/PageHeader";
import MaterialWorkflowBar from "@/components/materials/MaterialWorkflowBar";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import { useSite } from "@/contexts/SiteContext";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/formatters";
import { hasEditPermission } from "@/lib/permissions";
import { useSiteMaterialExpenses, useDeleteMaterialPurchase } from "@/hooks/queries/useMaterialPurchases";
import type { MaterialPurchaseExpenseWithDetails, PurchaseOrderWithDetails } from "@/types/material.types";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import MaterialSettlementDialog from "@/components/materials/MaterialSettlementDialog";
import BillVerificationDialog from "@/components/materials/BillVerificationDialog";
import { useVerifyBill } from "@/hooks/queries/useBillVerification";
import EditMaterialPurchaseDialog from "@/components/materials/EditMaterialPurchaseDialog";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

import {
  getItemAmount,
  getSettlementType,
  isExpenseSettled,
  isItemSettled,
  type SettlementItem,
} from "@/components/materials/settlements/settlementClassifiers";
import SettlementsFilterBar, {
  applySearchAndDate,
  type SettlementsFilter,
  type SettlementsView,
} from "@/components/materials/settlements/SettlementsFilterBar";
import PendingVendorCard, {
  groupPendingByVendor,
} from "@/components/materials/settlements/PendingVendorCard";
import SettlementsTableView from "@/components/materials/settlements/SettlementsTableView";
import SettlementInspectDrawer from "@/components/materials/settlements/SettlementInspectDrawer";
import ChangePayerDialog from "@/components/materials/ChangePayerDialog";
import { useSiteGroupMembership } from "@/hooks/queries/useSiteGroups";

const AIIngestionDialog = dynamic(
  () => import("@/components/ai-ingestion/AIIngestionDialog"),
  { ssr: false },
);

const VIEW_STORAGE_KEY = "aesta.matsettle.view";

export default function MaterialSettlementsPage() {
  const { selectedSite } = useSite();
  const router = useRouter();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  // Filter state
  const [filter, setFilter] = useState<SettlementsFilter>({
    search: "",
    dateFrom: "",
    dateTo: "",
    typeFilter: "vendor",
    statusFilter: "all",
  });
  const [view, setView] = useState<SettlementsView>("cards");
  const [settledOpen, setSettledOpen] = useState(false);

  // Restore view preference
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (saved === "cards" || saved === "table") setView(saved);
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  }, [view]);

  // Dialog state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<MaterialPurchaseExpenseWithDetails | null>(null);

  const [settlementDialogOpen, setSettlementDialogOpen] = useState(false);
  const [settlementPurchase, setSettlementPurchase] = useState<MaterialPurchaseExpenseWithDetails | null>(null);
  const [settlementPO, setSettlementPO] = useState<PurchaseOrderWithDetails | null>(null);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<MaterialPurchaseExpenseWithDetails | null>(null);

  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string }>({ open: false, message: "" });

  const [verificationDialogOpen, setVerificationDialogOpen] = useState(false);
  const [verifyingPO, setVerifyingPO] = useState<PurchaseOrderWithDetails | null>(null);
  const [verifyingBillUrl, setVerifyingBillUrl] = useState<string | null>(null);

  // Inspect drawer state
  const [inspectItem, setInspectItem] = useState<SettlementItem | null>(null);
  const [inspectOpen, setInspectOpen] = useState(false);

  // Hooks
  const { data: materialExpensesData, isLoading } = useSiteMaterialExpenses(selectedSite?.id);
  const deleteMutation = useDeleteMaterialPurchase();
  const verifyBillMutation = useVerifyBill();
  const { data: groupMembership } = useSiteGroupMembership(selectedSite?.id);
  const groupSitesForChip = useMemo(
    () => (groupMembership as { allSites?: Array<{ id: string; name: string }> } | undefined)?.allSites ?? [],
    [groupMembership]
  );
  const [changePayerExpense, setChangePayerExpense] = useState<MaterialPurchaseExpenseWithDetails | null>(null);

  const { userProfile, user } = useAuth();
  const canEdit = hasEditPermission(userProfile?.role);

  // Build unified list
  const allPurchases = useMemo(
    () => materialExpensesData?.expenses || [],
    [materialExpensesData?.expenses],
  );
  const allAdvancePOs = useMemo(
    () => materialExpensesData?.advancePOs || [],
    [materialExpensesData?.advancePOs],
  );

  const allItems: SettlementItem[] = useMemo(() => {
    const expenses: SettlementItem[] = allPurchases.map((p) => ({ ...p, itemType: "expense" as const }));
    const pos: SettlementItem[] = allAdvancePOs.map((po) => ({ ...po, itemType: "po" as const }));
    return [...expenses, ...pos];
  }, [allPurchases, allAdvancePOs]);

  // Apply type filter
  const typeFilteredItems = useMemo(() => {
    if (filter.typeFilter === "all") return allItems;
    if (filter.typeFilter === "vendor") {
      return allItems.filter((item) => {
        const t = getSettlementType(item);
        return t === "own_site" || t === "group_po";
      });
    }
    if (filter.typeFilter === "intersite") {
      return allItems.filter((item) => getSettlementType(item) === "intersite");
    }
    if (filter.typeFilter === "advance") {
      return allItems.filter((item) => getSettlementType(item) === "advance");
    }
    return allItems;
  }, [allItems, filter.typeFilter]);

  // Apply search + date filter
  const searchedItems = useMemo(
    () => applySearchAndDate(typeFilteredItems, filter),
    [typeFilteredItems, filter],
  );

  // Status-split
  const pendingItems = useMemo(
    () => searchedItems.filter((item) => !isItemSettled(item)),
    [searchedItems],
  );
  const settledItems = useMemo(
    () => searchedItems.filter((item) => isItemSettled(item)),
    [searchedItems],
  );

  // Items to feed each view, respecting statusFilter
  const visibleForView = useMemo(() => {
    if (filter.statusFilter === "pending") return pendingItems;
    if (filter.statusFilter === "settled") return settledItems;
    return searchedItems;
  }, [filter.statusFilter, pendingItems, settledItems, searchedItems]);

  // KPI counts (from type-filtered items, independent of search/date)
  const summaries = useMemo(() => {
    const pending = typeFilteredItems.filter((i) => !isItemSettled(i));
    const settled = typeFilteredItems.filter((i) => isItemSettled(i));
    const pendingTotal = pending.reduce((s, i) => s + getItemAmount(i), 0);
    const settledTotal = settled.reduce((s, i) => s + getItemAmount(i), 0);
    const oldestDays = pending.reduce((max, i) => {
      const d = (() => {
        const dt = i.itemType === "po" ? i.order_date : (i as MaterialPurchaseExpenseWithDetails).purchase_date;
        if (!dt) return 0;
        return Math.max(0, Math.floor((Date.now() - Date.parse(dt)) / (1000 * 60 * 60 * 24)));
      })();
      return Math.max(max, d);
    }, 0);
    return {
      pendingCount: pending.length,
      pendingTotal,
      settledCount: settled.length,
      settledTotal,
      totalCount: typeFilteredItems.length,
      oldestDays,
    };
  }, [typeFilteredItems]);

  // Pending grouped by vendor for cards view
  const pendingGroups = useMemo(() => groupPendingByVendor(pendingItems), [pendingItems]);

  // Handlers
  const handleSettle = (item: SettlementItem) => {
    if (item.itemType === "expense") {
      setSettlementPurchase(item);
      setSettlementPO(null);
    } else {
      setSettlementPO(item);
      setSettlementPurchase(null);
    }
    setSettlementDialogOpen(true);
  };

  const handleSettlementClose = () => {
    setSettlementDialogOpen(false);
    setSettlementPurchase(null);
    setSettlementPO(null);
  };

  const handleInspect = (item: SettlementItem) => {
    setInspectItem(item);
    setInspectOpen(true);
  };

  const handleEdit = (purchase: MaterialPurchaseExpenseWithDetails) => {
    setEditingPurchase(purchase);
    setEditDialogOpen(true);
  };

  const handleDeleteClick = (purchase: MaterialPurchaseExpenseWithDetails) => {
    setSelectedPurchase(purchase);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedPurchase) return;
    try {
      await deleteMutation.mutateAsync(selectedPurchase.id);
      setDeleteConfirmOpen(false);
      setSelectedPurchase(null);
    } catch (error) {
      console.error("Failed to delete purchase:", error);
    }
  };

  // Inspect-from-settled list: when statusFilter=all, show pending cards + collapsible settled section
  const showPendingSection = filter.statusFilter !== "settled";
  const showSettledSection = filter.statusFilter !== "pending";

  return (
    <Box>
      <Breadcrumbs />

      <PageHeader
        title="Material Settlements"
        subtitle={
          selectedSite?.name
            ? `Track and settle material purchases for ${selectedSite.name}`
            : "Track and settle material purchases"
        }
      />

      <MaterialWorkflowBar currentStep="settlements" />

      {/* KPI Strip + Actions */}
      <Box sx={{ mb: 2 }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          alignItems={{ xs: "stretch", md: "center" }}
        >
          <Card variant="outlined" sx={{ flex: 1, borderColor: summaries.pendingCount > 0 ? "warning.light" : "divider" }}>
            <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                <PendingIcon color="warning" sx={{ fontSize: 18 }} />
                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                  PENDING
                </Typography>
              </Box>
              {isLoading ? (
                <Skeleton variant="text" width={120} height={32} />
              ) : (
                <Stack direction="row" spacing={2} alignItems="baseline" flexWrap="wrap">
                  <Typography variant="h5" fontWeight={700} color="warning.main">
                    {formatCurrency(summaries.pendingTotal)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {summaries.pendingCount} bills
                  </Typography>
                  {summaries.oldestDays > 0 && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                      <ClockIcon sx={{ fontSize: 14, color: summaries.oldestDays >= 14 ? "error.main" : "text.secondary" }} />
                      <Typography
                        variant="caption"
                        color={summaries.oldestDays >= 14 ? "error.main" : "text.secondary"}
                        fontWeight={summaries.oldestDays >= 14 ? 700 : 400}
                      >
                        oldest {summaries.oldestDays}d
                      </Typography>
                    </Box>
                  )}
                </Stack>
              )}
            </CardContent>
          </Card>
          <Card variant="outlined" sx={{ flex: 1 }}>
            <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                <SettledIcon color="success" sx={{ fontSize: 18 }} />
                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                  SETTLED
                </Typography>
              </Box>
              {isLoading ? (
                <Skeleton variant="text" width={120} height={32} />
              ) : (
                <Stack direction="row" spacing={2} alignItems="baseline" flexWrap="wrap">
                  <Typography variant="h5" fontWeight={700} color="success.main">
                    {formatCurrency(summaries.settledTotal)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {summaries.settledCount} bills
                  </Typography>
                </Stack>
              )}
            </CardContent>
          </Card>
          <Card variant="outlined" sx={{ flex: 1 }}>
            <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                <InventoryIcon color="primary" sx={{ fontSize: 18 }} />
                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                  TOTAL
                </Typography>
              </Box>
              {isLoading ? (
                <Skeleton variant="text" width={120} height={32} />
              ) : (
                <Stack direction="row" spacing={2} alignItems="baseline" flexWrap="wrap">
                  <Typography variant="h5" fontWeight={700}>
                    {formatCurrency(summaries.pendingTotal + summaries.settledTotal)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {summaries.totalCount} bills
                  </Typography>
                </Stack>
              )}
            </CardContent>
          </Card>
        </Stack>

        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => router.push("/site/purchase-orders")}
            size={isMobile ? "small" : "medium"}
          >
            New Purchase
          </Button>
          {selectedSite && canEdit && (
            <Button
              variant="outlined"
              startIcon={<AIIcon />}
              onClick={() => setAiDialogOpen(true)}
              size={isMobile ? "small" : "medium"}
            >
              Quick Bill (AI)
            </Button>
          )}
        </Stack>
      </Box>

      {/* Filter Bar */}
      <SettlementsFilterBar
        filter={filter}
        onFilterChange={setFilter}
        view={view}
        onViewChange={setView}
        totalCount={summaries.totalCount}
        pendingCount={summaries.pendingCount}
        settledCount={summaries.settledCount}
      />

      {/* Body */}
      {view === "cards" ? (
        <Box>
          {isLoading ? (
            <Stack spacing={2}>
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} variant="rectangular" height={140} sx={{ borderRadius: 1 }} />
              ))}
            </Stack>
          ) : (
            <>
              {showPendingSection && (
                <Box sx={{ mb: 3 }}>
                  {pendingGroups.length === 0 ? (
                    <EmptyState
                      icon={<SettledIcon sx={{ fontSize: 40, color: "success.light" }} />}
                      title="All caught up"
                      subtitle="No pending vendor bills for this site."
                    />
                  ) : (
                    <Stack spacing={2}>
                      {pendingGroups.map((g) => (
                        <PendingVendorCard
                          key={g.key}
                          group={g}
                          currentSiteId={selectedSite?.id}
                          canEdit={canEdit}
                          onSettle={handleSettle}
                          onInspect={handleInspect}
                        />
                      ))}
                    </Stack>
                  )}
                </Box>
              )}

              {showSettledSection && settledItems.length > 0 && (
                <Box>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      mb: 1,
                      cursor: "pointer",
                    }}
                    onClick={() => setSettledOpen(!settledOpen)}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <SettledIcon color="success" sx={{ fontSize: 18 }} />
                      <Typography variant="subtitle2" fontWeight={700}>
                        Recently settled
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        ({settledItems.length} bills · {formatCurrency(summaries.settledTotal)})
                      </Typography>
                    </Box>
                    <IconButton size="small">
                      {settledOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    </IconButton>
                  </Box>
                  <Collapse in={settledOpen}>
                    <SettlementsTableView
                      items={settledItems}
                      isLoading={false}
                      currentSiteId={selectedSite?.id}
                      canEdit={canEdit}
                      onSettle={handleSettle}
                      onInspect={handleInspect}
                      onEdit={handleEdit}
                      onDelete={handleDeleteClick}
                      onChangePayer={setChangePayerExpense}
                    />
                  </Collapse>
                </Box>
              )}
            </>
          )}
        </Box>
      ) : (
        <SettlementsTableView
          items={visibleForView}
          isLoading={isLoading}
          currentSiteId={selectedSite?.id}
          canEdit={canEdit}
          onSettle={handleSettle}
          onInspect={handleInspect}
          onEdit={handleEdit}
          onDelete={handleDeleteClick}
        />
      )}

      {/* How it works */}
      <Alert severity="info" sx={{ mt: 3 }}>
        <Typography variant="subtitle2" fontWeight={600}>
          How Material Settlements Work
        </Typography>
        <Typography variant="body2" sx={{ mt: 0.5 }}>
          Material purchases need to be settled before they appear in Site Expenses. Group POs are
          visible to every member site — any site can record the vendor payment, and the actual
          payer site can be picked at the moment of settlement.
        </Typography>
      </Alert>

      {/* Inspect drawer */}
      <SettlementInspectDrawer
        item={inspectItem}
        open={inspectOpen}
        onClose={() => setInspectOpen(false)}
        currentSiteId={selectedSite?.id}
        canEdit={canEdit}
        onSettle={(item) => {
          setInspectOpen(false);
          handleSettle(item);
        }}
        onEdit={(purchase) => {
          setInspectOpen(false);
          handleEdit(purchase);
        }}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete Material Purchase"
        message={`Are you sure you want to delete purchase ${selectedPurchase?.ref_code}? This action cannot be undone.`}
        confirmText="Delete"
        confirmColor="error"
        isLoading={deleteMutation.isPending}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setDeleteConfirmOpen(false);
          setSelectedPurchase(null);
        }}
      />

      {/* Edit Material Purchase Dialog */}
      <EditMaterialPurchaseDialog
        open={editDialogOpen}
        onClose={() => {
          setEditDialogOpen(false);
          setEditingPurchase(null);
        }}
        purchase={editingPurchase}
      />

      {/* Settlement Dialog */}
      <MaterialSettlementDialog
        open={settlementDialogOpen}
        purchase={settlementPurchase}
        purchaseOrder={settlementPO}
        onClose={handleSettlementClose}
        onSuccess={handleSettlementClose}
      />

      {/* AI Ingestion Dialog */}
      {selectedSite && (
        <AIIngestionDialog
          open={aiDialogOpen}
          onClose={() => setAiDialogOpen(false)}
          initialMode="purchase"
          lockedSite={{ id: selectedSite.id, name: selectedSite.name }}
          sites={[]}
          onSaved={(result) => {
            const ref = (result as { ref_code?: string | null } | null)?.ref_code;
            setSnackbar({ open: true, message: ref ? `Saved as ${ref}` : "Bill saved" });
          }}
        />
      )}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        message={snackbar.message}
      />

      {/* Direct Bill Verification Dialog */}
      <BillVerificationDialog
        open={verificationDialogOpen}
        onClose={() => {
          setVerificationDialogOpen(false);
          setVerifyingPO(null);
          setVerifyingBillUrl(null);
        }}
        purchaseOrder={verifyingPO}
        billUrl={verifyingBillUrl}
        isVerifying={verifyBillMutation.isPending}
        onVerified={async (notes) => {
          if (!verifyingPO?.id || !user?.id) return;
          try {
            await verifyBillMutation.mutateAsync({
              poId: verifyingPO.id,
              userId: user.id,
              notes,
            });
            setVerificationDialogOpen(false);
            setVerifyingPO(null);
            setVerifyingBillUrl(null);
          } catch (error) {
            console.error("Failed to verify bill:", error);
          }
        }}
      />

      {/* Change Payer Dialog (group_stock expenses only) */}
      {changePayerExpense && selectedSite?.id && (
        <ChangePayerDialog
          open={!!changePayerExpense}
          onClose={() => setChangePayerExpense(null)}
          entityType="expense"
          entityId={changePayerExpense.id}
          entityLabel={changePayerExpense.ref_code || "Expense"}
          currentSiteId={selectedSite.id}
          groupSites={groupSitesForChip}
          alreadySettled={!!changePayerExpense.settlement_reference}
        />
      )}
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────

function EmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <Card variant="outlined" sx={{ borderStyle: "dashed" }}>
      <CardContent sx={{ py: 4, textAlign: "center" }}>
        <Box sx={{ display: "flex", justifyContent: "center", mb: 1 }}>{icon}</Box>
        <Typography variant="subtitle1" fontWeight={600}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {subtitle}
        </Typography>
      </CardContent>
    </Card>
  );
}
