"use client";

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Box,
  Button,
  Chip,
  IconButton,
  Typography,
  TextField,
  InputAdornment,
  Fab,
  Tooltip,
  Tabs,
  Tab,
  Card,
  CardContent,
  Grid,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Avatar,
  AvatarGroup,
} from "@mui/material";
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Visibility as ViewIcon,
  LocalShipping as DeliveryIcon,
  Send as SendIcon,
  Cancel as CancelIcon,
  Groups as GroupStockIcon,
  Sync as SyncIcon,
  Inventory2 as MaterialIcon,
} from "@mui/icons-material";
import DataTable, { type MRT_ColumnDef } from "@/components/common/DataTable";
import PageHeader from "@/components/layout/PageHeader";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import MaterialWorkflowBar from "@/components/materials/MaterialWorkflowBar";
import { useAuth } from "@/contexts/AuthContext";
import { useSite } from "@/contexts/SiteContext";
import { useIsMobile } from "@/hooks/useIsMobile";
import { hasAdminPermission, hasEditPermission } from "@/lib/permissions";
import {
  usePurchaseOrders,
  usePOSummary,
  useMarkPOAsOrdered,
  useCancelPurchaseOrder,
  useGroupStockPOsSyncStatus,
  usePushBatchToSettlement,
} from "@/hooks/queries/usePurchaseOrders";
const UnifiedPurchaseOrderDialog = dynamic(
  () => import("@/components/materials/UnifiedPurchaseOrderDialog"),
  { ssr: false }
);
import RecordAndVerifyDeliveryDialog from "@/components/materials/RecordAndVerifyDeliveryDialog";
import PODetailsDrawer from "@/components/materials/PODetailsDrawer";
import PODeleteConfirmationDialog from "@/components/materials/PODeleteConfirmationDialog";
import CreatePORedirectDialog from "@/components/materials/CreatePORedirectDialog";
import type {
  PurchaseOrderWithDetails,
  POStatus,
  PO_STATUS_LABELS,
} from "@/types/material.types";
import { formatCurrency, formatDate } from "@/lib/formatters";

const STATUS_COLORS: Record<POStatus, "default" | "info" | "warning" | "success" | "error"> = {
  draft: "default",
  pending_approval: "warning",
  approved: "info",
  ordered: "info",
  partial_delivered: "warning",
  delivered: "success",
  cancelled: "error",
};

const STATUS_LABELS: Record<POStatus, string> = {
  draft: "Draft",
  pending_approval: "Pending Approval",
  approved: "Approved",
  ordered: "Ordered",
  partial_delivered: "Partial",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

type TabValue = "all" | "draft" | "active" | "delivered";

// Prefilled data from URL params (e.g., from material-search)
interface PrefilledPOData {
  vendorId?: string;
  materialId?: string;
  materialName?: string;
  unit?: string;
  source?: string;
}

export default function PurchaseOrdersPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deliveryDialogOpen, setDeliveryDialogOpen] = useState(false);
  const [detailsDrawerOpen, setDetailsDrawerOpen] = useState(false);
  const [editingPO, setEditingPO] = useState<PurchaseOrderWithDetails | null>(null);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrderWithDetails | null>(null);
  const [currentTab, setCurrentTab] = useState<TabValue>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [prefilledData, setPrefilledData] = useState<PrefilledPOData | null>(null);

  // Confirmation dialog states
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingPO, setDeletingPO] = useState<PurchaseOrderWithDetails | null>(null);

  const [placeOrderDialogOpen, setPlaceOrderDialogOpen] = useState(false);
  const [placingOrderPO, setPlacingOrderPO] = useState<PurchaseOrderWithDetails | null>(null);

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancellingPO, setCancellingPO] = useState<PurchaseOrderWithDetails | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState("");

  // Push to Settlement state
  const [pushDialogOpen, setPushDialogOpen] = useState(false);
  const [pushingPO, setPushingPO] = useState<PurchaseOrderWithDetails | null>(null);
  const [pushError, setPushError] = useState("");

  // Redirect dialog for direct PO creation
  const [redirectDialogOpen, setRedirectDialogOpen] = useState(false);

  const searchParams = useSearchParams();
  const router = useRouter();
  const { userProfile, user } = useAuth();
  const { selectedSite } = useSite();
  const isMobile = useIsMobile();
  const canEdit = hasEditPermission(userProfile?.role);
  const isAdmin = hasAdminPermission(userProfile?.role);

  // Track if we've already processed URL params
  const hasProcessedParams = useRef(false);

  // Extract specific param values to use as stable dependencies
  const isNewParam = searchParams.get("new");
  const vendorIdParam = searchParams.get("vendorId");
  const materialIdParam = searchParams.get("materialId");
  const materialNameParam = searchParams.get("materialName");
  const unitParam = searchParams.get("unit");
  const sourceParam = searchParams.get("source");

  // Handle URL params for prefilled data (from material-search)
  // Redirect to material requests page to enforce the proper workflow
  useEffect(() => {
    if (hasProcessedParams.current) return;

    const isNew = isNewParam === "true";
    if (isNew && (vendorIdParam || materialIdParam)) {
      hasProcessedParams.current = true;

      // Redirect to material requests page with prefilled material info
      const params = new URLSearchParams();
      params.set("new", "true");
      if (materialIdParam) params.set("materialId", materialIdParam);
      if (materialNameParam) params.set("materialName", materialNameParam);
      if (unitParam) params.set("unit", unitParam);
      router.replace(`/site/material-requests?${params.toString()}`);
      return;
    }
  }, [isNewParam, vendorIdParam, materialIdParam, materialNameParam, unitParam, sourceParam, router]);

  const { data: allPOs = [], isLoading } = usePurchaseOrders(selectedSite?.id);
  const { data: summary } = usePOSummary(selectedSite?.id);

  const markAsOrdered = useMarkPOAsOrdered();
  const cancelPO = useCancelPurchaseOrder();
  const pushToSettlement = usePushBatchToSettlement();

  // Get delivered Group Stock PO IDs for sync status check
  const deliveredGroupStockPOIds = useMemo(() => {
    return allPOs
      .filter((po) => {
        if (po.status !== "delivered") return false;
        // Check if it's a Group Stock PO
        let parsedNotes: { is_group_stock?: boolean } | null = null;
        if (po.internal_notes) {
          try {
            parsedNotes = typeof po.internal_notes === "string"
              ? JSON.parse(po.internal_notes)
              : po.internal_notes;
          } catch {
            // Ignore parse errors
          }
        }
        return parsedNotes?.is_group_stock === true;
      })
      .map((po) => po.id);
  }, [allPOs]);

  // Fetch sync status for all delivered Group Stock POs
  const { data: syncStatusMap = new Map() } = useGroupStockPOsSyncStatus(deliveredGroupStockPOIds);

  // Unique vendor names for column filter
  const vendorFilterOptions = useMemo(() => {
    const names = new Set<string>();
    allPOs.forEach((po) => {
      if (po.vendor?.name) names.add(po.vendor.name);
    });
    return Array.from(names)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ value: name, label: name }));
  }, [allPOs]);

  // Status options for column filter
  const statusFilterOptions = useMemo(
    () => Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
    []
  );

  // Unique material names for column filter
  const materialFilterOptions = useMemo(() => {
    const names = new Set<string>();
    allPOs.forEach((po) =>
      po.items?.forEach((item) => {
        if (item.material?.name) names.add(item.material.name);
      })
    );
    return Array.from(names)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ value: name, label: name }));
  }, [allPOs]);

  // Filter POs based on tab and search
  const filteredPOs = useMemo(() => {
    let filtered = allPOs;

    // Filter by tab
    switch (currentTab) {
      case "draft":
        filtered = filtered.filter((po) => po.status === "draft");
        break;
      case "active":
        filtered = filtered.filter((po) =>
          ["ordered", "partial_delivered"].includes(po.status)
        );
        break;
      case "delivered":
        filtered = filtered.filter((po) => po.status === "delivered");
        break;
    }

    // Filter by search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (po) =>
          po.po_number.toLowerCase().includes(term) ||
          po.vendor?.name?.toLowerCase().includes(term) ||
          po.items?.some((item) =>
            item.material?.name?.toLowerCase().includes(term)
          )
      );
    }

    return filtered;
  }, [allPOs, currentTab, searchTerm]);

  const handleOpenDialog = useCallback((po?: PurchaseOrderWithDetails) => {
    setEditingPO(po || null);
    setDialogOpen(true);
  }, []);

  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false);
    setEditingPO(null);
    setPrefilledData(null); // Clear prefilled data on close
  }, []);

  const handleOpenDeliveryDialog = useCallback((po: PurchaseOrderWithDetails) => {
    setSelectedPO(po);
    setDeliveryDialogOpen(true);
  }, []);

  const handleCloseDeliveryDialog = useCallback(() => {
    setDeliveryDialogOpen(false);
    setSelectedPO(null);
  }, []);

  const handleViewDetails = useCallback((po: PurchaseOrderWithDetails) => {
    setSelectedPO(po);
    setDetailsDrawerOpen(true);
  }, []);

  const handleCloseDetails = useCallback(() => {
    setDetailsDrawerOpen(false);
    setSelectedPO(null);
  }, []);

  const handleDelete = useCallback((po: PurchaseOrderWithDetails) => {
    setDeletingPO(po);
    setDeleteDialogOpen(true);
  }, []);

  const handleDeleteSuccess = useCallback(() => {
    setDeleteDialogOpen(false);
    setDeletingPO(null);
  }, []);

  // Place order - moves draft PO directly to ordered status
  const handlePlaceOrder = useCallback((po: PurchaseOrderWithDetails) => {
    setPlacingOrderPO(po);
    setPlaceOrderDialogOpen(true);
  }, []);

  const handleConfirmPlaceOrder = useCallback(async () => {
    if (!placingOrderPO) return;
    try {
      await markAsOrdered.mutateAsync(placingOrderPO.id);
      setPlaceOrderDialogOpen(false);
      setPlacingOrderPO(null);
    } catch (error) {
      console.error("Failed to place order:", error);
    }
  }, [markAsOrdered, placingOrderPO]);

  const handleCancel = useCallback((po: PurchaseOrderWithDetails) => {
    setCancellingPO(po);
    setCancelReason("");
    setCancelError("");
    setCancelDialogOpen(true);
  }, []);

  const handleConfirmCancel = useCallback(async () => {
    if (!cancellingPO || !user?.id) return;
    setCancelError("");
    try {
      await cancelPO.mutateAsync({ id: cancellingPO.id, userId: user.id, reason: cancelReason });
      setCancelDialogOpen(false);
      setCancellingPO(null);
      setCancelReason("");
    } catch (error: any) {
      console.error("Failed to cancel PO:", error);
      setCancelError(error?.message || "Failed to cancel purchase order. Please try again.");
    }
  }, [cancelPO, cancellingPO, cancelReason, user?.id]);

  // Push to Settlement handlers
  const handlePushToSettlement = useCallback((po: PurchaseOrderWithDetails) => {
    setPushingPO(po);
    setPushError("");
    setPushDialogOpen(true);
  }, []);

  const handleConfirmPush = useCallback(async () => {
    if (!pushingPO) return;
    setPushError("");
    try {
      await pushToSettlement.mutateAsync({ poId: pushingPO.id });
      setPushDialogOpen(false);
      setPushingPO(null);
    } catch (error: any) {
      console.error("Failed to push to settlement:", error);
      setPushError(error?.message || "Failed to push to Inter-Site Settlement. Please try again.");
    }
  }, [pushToSettlement, pushingPO]);

  // Table columns
  const columns = useMemo<MRT_ColumnDef<PurchaseOrderWithDetails>[]>(
    () => [
      {
        accessorKey: "po_number",
        header: "PO Number",
        size: 160,
        Cell: ({ row }) => {
          // Parse internal_notes if it's a JSON string
          let parsedNotes: { is_group_stock?: boolean; site_group_id?: string } | null = null;
          if (row.original.internal_notes) {
            try {
              parsedNotes = typeof row.original.internal_notes === "string"
                ? JSON.parse(row.original.internal_notes)
                : row.original.internal_notes;
            } catch {
              // Ignore parse errors
            }
          }
          const isGroupStock = parsedNotes?.is_group_stock === true;
          return (
            <Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Typography
                  variant="body2"
                  fontWeight={500}
                  sx={{ cursor: "pointer", color: "primary.main" }}
                  onClick={() => handleViewDetails(row.original)}
                >
                  {row.original.po_number}
                </Typography>
                {isGroupStock && (
                  <Tooltip title="Group Stock Purchase">
                    <Chip
                      icon={<GroupStockIcon sx={{ fontSize: 14 }} />}
                      label="Group"
                      size="small"
                      color="secondary"
                      sx={{ height: 20, fontSize: "0.65rem", "& .MuiChip-icon": { ml: 0.5 } }}
                    />
                  </Tooltip>
                )}
              </Box>
              <Typography variant="caption" color="text.secondary">
                {formatDate(row.original.order_date)}
              </Typography>
            </Box>
          );
        },
      },
      {
        accessorKey: "vendor.name",
        header: "Vendor",
        size: 180,
        filterVariant: "multi-select",
        filterSelectOptions: vendorFilterOptions,
        Cell: ({ row }) => row.original.vendor?.name || "-",
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 130,
        filterVariant: "multi-select",
        filterSelectOptions: statusFilterOptions,
        Cell: ({ row }) => (
          <Chip
            label={STATUS_LABELS[row.original.status]}
            color={STATUS_COLORS[row.original.status]}
            size="small"
          />
        ),
      },
      {
        accessorKey: "total_amount",
        header: "Amount",
        size: 140,
        Cell: ({ row }) => {
          const itemsTotal = row.original.total_amount || 0;
          const transportCost = row.original.transport_cost || 0;
          const grandTotal = itemsTotal + transportCost;

          // Check if this is a Group Stock PO with settlement info
          let parsedNotes: { is_group_stock?: boolean } | null = null;
          if (row.original.internal_notes) {
            try {
              parsedNotes = typeof row.original.internal_notes === "string"
                ? JSON.parse(row.original.internal_notes)
                : row.original.internal_notes;
            } catch {
              // Ignore parse errors
            }
          }
          const isGroupStock = parsedNotes?.is_group_stock === true;
          const settlementInfo = isGroupStock ? syncStatusMap.get(row.original.id) : null;

          if (grandTotal <= 0) return "-";

          return (
            <Box>
              <Typography variant="body2" fontWeight={500}>
                {formatCurrency(grandTotal)}
              </Typography>
              {settlementInfo && settlementInfo.usedByOthersAmount > 0 && (
                <Typography variant="caption" color="text.secondary" display="block">
                  Used by others: {formatCurrency(settlementInfo.usedByOthersAmount)}
                </Typography>
              )}
              {settlementInfo && settlementInfo.settledAmount > 0 && (
                <Typography variant="caption" color="success.main" display="block">
                  Settled: {formatCurrency(settlementInfo.settledAmount)}
                </Typography>
              )}
            </Box>
          );
        },
      },
      {
        accessorKey: "items",
        header: "Materials",
        size: 200,
        filterVariant: "multi-select",
        filterSelectOptions: materialFilterOptions,
        filterFn: (row, _columnId, filterValues: string[]) => {
          if (!filterValues || filterValues.length === 0) return true;
          const items = row.original.items;
          if (!items || items.length === 0) return false;
          return items.some((item) =>
            filterValues.includes(item.material?.name || "")
          );
        },
        Cell: ({ row }) => {
          const items = row.original.items;
          if (!items || items.length === 0) {
            return (
              <Typography variant="caption" color="text.secondary">
                No items
              </Typography>
            );
          }

          const materialNames = items.map((item) => {
            const name = item.material?.name || "Unknown";
            const qty = item.quantity;
            const unit = item.material?.unit || "";
            return qty ? `${name} (${qty} ${unit})` : name;
          });

          const getItemImage = (item: any) =>
            item.brand?.image_url || item.material?.image_url || null;

          const MAX_VISIBLE = 2;
          const visibleItems = items.slice(0, MAX_VISIBLE);
          const remainingCount = items.length - MAX_VISIBLE;

          return (
            <Tooltip
              title={
                <Box>
                  {materialNames.map((name, idx) => (
                    <Typography key={idx} variant="caption" sx={{ display: "block" }}>
                      {name}
                    </Typography>
                  ))}
                </Box>
              }
              arrow
            >
              <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
                {items.length === 1 ? (
                  <Avatar
                    src={getItemImage(items[0]) || undefined}
                    variant="rounded"
                    sx={{ width: 28, height: 28, bgcolor: "action.hover" }}
                  >
                    <MaterialIcon sx={{ fontSize: 16, color: "text.disabled" }} />
                  </Avatar>
                ) : (
                  <AvatarGroup
                    max={3}
                    sx={{
                      "& .MuiAvatar-root": {
                        width: 28,
                        height: 28,
                        fontSize: 11,
                        border: "2px solid",
                        borderColor: "background.paper",
                      },
                    }}
                  >
                    {items.map((item, idx) => (
                      <Avatar
                        key={idx}
                        src={getItemImage(item) || undefined}
                        variant="rounded"
                        sx={{ bgcolor: "action.hover" }}
                      >
                        <MaterialIcon sx={{ fontSize: 14, color: "text.disabled" }} />
                      </Avatar>
                    ))}
                  </AvatarGroup>
                )}
                <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", alignItems: "center", minWidth: 0 }}>
                  {visibleItems.map((item, idx) => (
                    <Chip
                      key={idx}
                      label={item.material?.name || "Unknown"}
                      size="small"
                      variant="outlined"
                      sx={{
                        maxWidth: 100,
                        height: 22,
                        fontSize: "0.7rem",
                        "& .MuiChip-label": {
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        },
                      }}
                    />
                  ))}
                  {remainingCount > 0 && (
                    <Chip
                      label={`+${remainingCount}`}
                      size="small"
                      color="default"
                      sx={{ height: 20, fontSize: "0.65rem" }}
                    />
                  )}
                </Box>
              </Box>
            </Tooltip>
          );
        },
      },
      {
        accessorKey: "expected_delivery_date",
        header: "Expected",
        size: 140,
        filterVariant: "date-range",
        Cell: ({ row }) =>
          row.original.expected_delivery_date
            ? formatDate(row.original.expected_delivery_date)
            : "-",
      },
    ],
    [handleViewDetails, syncStatusMap, vendorFilterOptions, statusFilterOptions, materialFilterOptions]
  );

  // Row actions
  const renderRowActions = useCallback(
    ({ row }: { row: { original: PurchaseOrderWithDetails } }) => {
      const po = row.original;
      return (
        <Box sx={{ display: "flex", gap: 0.5 }}>
          <Tooltip title="View Details">
            <IconButton size="small" onClick={() => handleViewDetails(po)}>
              <ViewIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          {/* Draft POs - can edit, place order, or delete */}
          {po.status === "draft" && canEdit && (
            <>
              <Tooltip title="Edit">
                <IconButton size="small" onClick={() => handleOpenDialog(po)}>
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Place Order">
                <IconButton
                  size="small"
                  color="primary"
                  onClick={() => handlePlaceOrder(po)}
                >
                  <SendIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}

          {/* Pending Approval / Approved - can delete */}
          {["pending_approval", "approved"].includes(po.status) && canEdit && (
            <>
              <Tooltip title="Edit">
                <IconButton size="small" onClick={() => handleOpenDialog(po)}>
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}

          {/* Ordered or Partial - can record delivery, edit, or delete */}
          {["ordered", "partial_delivered"].includes(po.status) && canEdit && (
            <>
              <Tooltip title="Edit">
                <IconButton size="small" onClick={() => handleOpenDialog(po)}>
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Record Delivery">
                <IconButton
                  size="small"
                  color="success"
                  onClick={() => handleOpenDeliveryDialog(po)}
                >
                  <DeliveryIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}

          {/* Delivered - can edit and push to settlement if Group Stock */}
          {po.status === "delivered" && canEdit && (
            <>
              {/* Push to Settlement - only for Group Stock POs that aren't synced */}
              {(() => {
                let parsedNotes: { is_group_stock?: boolean } | null = null;
                if (po.internal_notes) {
                  try {
                    parsedNotes = typeof po.internal_notes === "string"
                      ? JSON.parse(po.internal_notes)
                      : po.internal_notes;
                  } catch {
                    // Ignore parse errors
                  }
                }
                const isGroupStock = parsedNotes?.is_group_stock === true;
                const settlementInfo = syncStatusMap.get(po.id);
                const isSynced = settlementInfo?.isSynced === true;

                if (isGroupStock && !isSynced) {
                  return (
                    <Tooltip title="Push to Inter-Site Settlement">
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => handlePushToSettlement(po)}
                      >
                        <SyncIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  );
                }
                return null;
              })()}
              <Tooltip title="Edit">
                <IconButton size="small" onClick={() => handleOpenDialog(po)}>
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}

          {/* Delete - available for all statuses */}
          {canEdit && (
            <Tooltip title="Delete">
              <IconButton
                size="small"
                color="error"
                onClick={() => handleDelete(po)}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      );
    },
    [
      canEdit,
      handleViewDetails,
      handleOpenDialog,
      handlePlaceOrder,
      handleDelete,
      handleOpenDeliveryDialog,
      handlePushToSettlement,
      syncStatusMap,
    ]
  );

  if (!selectedSite) {
    return (
      <Box sx={{ p: 3, textAlign: "center" }}>
        <Typography color="text.secondary">
          Please select a site to manage purchase orders
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Breadcrumbs />

      <PageHeader
        title="Purchase Orders"
        actions={
          !isMobile && canEdit ? (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setRedirectDialogOpen(true)}
            >
              Create PO
            </Button>
          ) : null
        }
      />

      <MaterialWorkflowBar currentStep="purchaseOrders" />

      {/* Show info when coming from material-search */}
      {prefilledData?.source === "material-search" && dialogOpen && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Creating purchase order from Price Comparison. Vendor and material will be pre-filled.
        </Alert>
      )}

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card>
            <CardContent sx={{ py: 1.5 }}>
              <Typography variant="caption" color="text.secondary">
                Draft
              </Typography>
              <Typography variant="h5">{summary?.draft || 0}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card>
            <CardContent sx={{ py: 1.5 }}>
              <Typography variant="caption" color="text.secondary">
                Active Orders
              </Typography>
              <Typography variant="h5" color="info.main">
                {(summary?.ordered || 0) +
                  (summary?.partial_delivered || 0)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card>
            <CardContent sx={{ py: 1.5 }}>
              <Typography variant="caption" color="text.secondary">
                Delivered
              </Typography>
              <Typography variant="h5" color="success.main">
                {summary?.delivered || 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card>
            <CardContent sx={{ py: 1.5 }}>
              <Typography variant="caption" color="text.secondary">
                Total
              </Typography>
              <Typography variant="h5">
                {(summary?.draft || 0) +
                  (summary?.ordered || 0) +
                  (summary?.partial_delivered || 0) +
                  (summary?.delivered || 0)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Tabs and Search */}
      <Box sx={{ mb: 2 }}>
        <Tabs
          value={currentTab}
          onChange={(_, v) => setCurrentTab(v)}
          sx={{ mb: 2 }}
          variant={isMobile ? "scrollable" : "standard"}
          scrollButtons="auto"
        >
          <Tab label="All" value="all" />
          <Tab label="Draft" value="draft" />
          <Tab label="Active" value="active" />
          <Tab label="Delivered" value="delivered" />
        </Tabs>

        <TextField
          id="po-search"
          size="small"
          placeholder="Search PO number or vendor..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
          sx={{ minWidth: 280 }}
        />
      </Box>

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={filteredPOs}
        isLoading={isLoading}
        enableRowActions
        renderRowActions={renderRowActions}
        mobileHiddenColumns={["items", "expected_delivery_date"]}
        initialState={{
          sorting: [{ id: "po_number", desc: true }],
        }}
      />

      {/* Mobile FAB */}
      {isMobile && canEdit && (
        <Fab
          color="primary"
          sx={{ position: "fixed", bottom: 16, right: 16 }}
          onClick={() => setRedirectDialogOpen(true)}
        >
          <AddIcon />
        </Fab>
      )}

      {/* Create/Edit PO Dialog */}
      {/* Redirect dialog for direct PO creation */}
      <CreatePORedirectDialog
        open={redirectDialogOpen}
        onClose={() => setRedirectDialogOpen(false)}
        onCreateRequest={() => {
          setRedirectDialogOpen(false);
          router.push("/site/material-requests?new=true");
        }}
      />

      {/* Edit PO Dialog (only for editing existing POs) */}
      <UnifiedPurchaseOrderDialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        purchaseOrder={editingPO}
        siteId={selectedSite.id}
      />

      {/* Record & Verify Delivery Dialog */}
      <RecordAndVerifyDeliveryDialog
        open={deliveryDialogOpen}
        onClose={handleCloseDeliveryDialog}
        purchaseOrder={selectedPO}
        siteId={selectedSite.id}
      />

      {/* PO Details Drawer */}
      <PODetailsDrawer
        open={detailsDrawerOpen}
        onClose={handleCloseDetails}
        purchaseOrder={selectedPO}
        onRecordDelivery={handleOpenDeliveryDialog}
        onEdit={handleOpenDialog}
        canEdit={canEdit}
        isAdmin={isAdmin}
      />

      {/* Cancellation Reason Dialog */}
      <Dialog
        open={cancelDialogOpen}
        onClose={() => {
          setCancelDialogOpen(false);
          setCancellingPO(null);
          setCancelReason("");
          setCancelError("");
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Cancel Purchase Order</DialogTitle>
        <DialogContent>
          {cancelError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {cancelError}
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Are you sure you want to cancel PO <strong>{cancellingPO?.po_number}</strong>?
          </Typography>
          <TextField
            autoFocus
            fullWidth
            label="Cancellation Reason"
            placeholder="Enter reason for cancellation"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            multiline
            rows={3}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => {
              setCancelDialogOpen(false);
              setCancellingPO(null);
              setCancelReason("");
              setCancelError("");
            }}
          >
            Close
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleConfirmCancel}
            disabled={cancelPO.isPending}
            startIcon={cancelPO.isPending ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {cancelPO.isPending ? "Cancelling..." : "Confirm Cancel"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog with Impact Summary */}
      <PODeleteConfirmationDialog
        open={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
          setDeletingPO(null);
        }}
        poId={deletingPO?.id}
        poNumber={deletingPO?.po_number}
        siteId={selectedSite?.id || ""}
        onSuccess={handleDeleteSuccess}
      />

      {/* Place Order Confirmation Dialog */}
      <Dialog
        open={placeOrderDialogOpen}
        onClose={() => {
          setPlaceOrderDialogOpen(false);
          setPlacingOrderPO(null);
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Place Order</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Are you sure you want to place order for PO <strong>{placingOrderPO?.po_number}</strong>? This indicates the order has been sent to the vendor.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => {
              setPlaceOrderDialogOpen(false);
              setPlacingOrderPO(null);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleConfirmPlaceOrder}
            disabled={markAsOrdered.isPending}
            startIcon={markAsOrdered.isPending ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {markAsOrdered.isPending ? "Placing Order..." : "Place Order"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Push to Settlement Confirmation Dialog */}
      <Dialog
        open={pushDialogOpen}
        onClose={() => {
          setPushDialogOpen(false);
          setPushingPO(null);
          setPushError("");
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <SyncIcon color="primary" />
          Push to Inter-Site Settlement
        </DialogTitle>
        <DialogContent>
          {pushError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {pushError}
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Push <strong>{pushingPO?.po_number}</strong> to Inter-Site Settlement?
          </Typography>
          <Alert severity="info" sx={{ mb: 1 }}>
            This will create a purchase transaction in the Inter-Site Settlement module, allowing you to:
            <ul style={{ margin: "8px 0 0 0", paddingLeft: "20px" }}>
              <li>Track material usage by different sites</li>
              <li>Generate settlements between sites</li>
              <li>Record inter-site payments</li>
            </ul>
          </Alert>
          <Typography variant="caption" color="text.secondary">
            Note: This action can be reversed by deleting the transaction from the Inter-Site Settlement page.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => {
              setPushDialogOpen(false);
              setPushingPO(null);
              setPushError("");
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleConfirmPush}
            disabled={pushToSettlement.isPending}
            startIcon={pushToSettlement.isPending ? <CircularProgress size={16} color="inherit" /> : <SyncIcon />}
          >
            {pushToSettlement.isPending ? "Pushing..." : "Push to Settlement"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
