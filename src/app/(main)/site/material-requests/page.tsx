"use client";

import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useSearchParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
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
  Badge,
  Avatar,
  AvatarGroup,
} from "@mui/material";
import {
  Add as AddIcon,
  Edit as EditIcon,
  Search as SearchIcon,
  Visibility as ViewIcon,
  CheckCircle as ApproveIcon,
  Cancel as CancelIcon,
  ShoppingCart as ConvertIcon,
  Delete as DeleteIcon,
  Link as LinkIcon,
  CheckCircleOutline as FulfilledIcon,
  Inventory2 as MaterialIcon,
} from "@mui/icons-material";
import DataTable, { type MRT_ColumnDef } from "@/components/common/DataTable";
import PageHeader from "@/components/layout/PageHeader";
import MaterialWorkflowBar from "@/components/materials/MaterialWorkflowBar";
import { useAuth } from "@/contexts/AuthContext";
import { useSite } from "@/contexts/SiteContext";
import { useIsMobile } from "@/hooks/useIsMobile";
import { hasAdminPermission, hasEditPermission } from "@/lib/permissions";
import {
  useMaterialRequests,
  useRequestSummary,
  useRequestsPOSummary,
  useCancelMaterialRequest,
  useApproveMaterialRequest,
  useRejectMaterialRequest,
} from "@/hooks/queries/useMaterialRequests";
import MaterialRequestDialog from "@/components/materials/MaterialRequestDialog";
import MaterialRequestDeleteConfirmationDialog from "@/components/materials/MaterialRequestDeleteConfirmationDialog";
import RequestApprovalDialog from "@/components/materials/RequestApprovalDialog";
import RequestDetailsDrawer from "@/components/materials/RequestDetailsDrawer";
const UnifiedPurchaseOrderDialog = dynamic(
  () => import("@/components/materials/UnifiedPurchaseOrderDialog"),
  { ssr: false }
);
import type {
  MaterialRequestWithDetails,
  MaterialRequestStatus,
  RequestPriority,
  RequestPOSummary,
} from "@/types/material.types";
import { formatDate } from "@/lib/formatters";

const STATUS_COLORS: Record<MaterialRequestStatus, "default" | "info" | "warning" | "success" | "error"> = {
  draft: "default",
  pending: "warning",
  approved: "info",
  rejected: "error",
  ordered: "info",
  partial_fulfilled: "warning",
  fulfilled: "success",
  cancelled: "error",
};

const STATUS_LABELS: Record<MaterialRequestStatus, string> = {
  draft: "Draft",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  ordered: "Ordered",
  partial_fulfilled: "Partial",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
};

const PRIORITY_COLORS: Record<RequestPriority, "default" | "info" | "warning" | "error"> = {
  low: "default",
  normal: "info",
  high: "warning",
  urgent: "error",
};

type TabValue = "all" | "pending" | "approved" | "fulfilled" | "rejected";

const EMPTY_PO_SUMMARY_MAP = new Map<string, RequestPOSummary>();

export default function MaterialRequestsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [detailsDrawerOpen, setDetailsDrawerOpen] = useState(false);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<MaterialRequestWithDetails | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<MaterialRequestWithDetails | null>(null);
  const [requestToConvert, setRequestToConvert] = useState<MaterialRequestWithDetails | null>(null);
  const [requestToDelete, setRequestToDelete] = useState<MaterialRequestWithDetails | null>(null);
  const [currentTab, setCurrentTab] = useState<TabValue>("all");
  const [searchTerm, setSearchTerm] = useState("");

  const searchParams = useSearchParams();
  const router = useRouter();
  const { userProfile, user } = useAuth();
  const { selectedSite } = useSite();
  const isMobile = useIsMobile();
  const canEdit = hasEditPermission(userProfile?.role);
  const isAdmin = hasAdminPermission(userProfile?.role);

  // Handle ?new=true query param (redirect from PO page or price comparison)
  const hasProcessedNewParam = useRef(false);
  useEffect(() => {
    if (hasProcessedNewParam.current) return;
    if (searchParams.get("new") === "true") {
      hasProcessedNewParam.current = true;
      // Auto-open the create dialog
      setDialogOpen(true);
      setEditingRequest(null);
      // Clean up URL params
      router.replace("/site/material-requests", { scroll: false });
    }
  }, [searchParams, router]);

  const { data: allRequests = [], isLoading } = useMaterialRequests(selectedSite?.id);
  const { data: summary } = useRequestSummary(selectedSite?.id);
  const { data: poSummaryMap = EMPTY_PO_SUMMARY_MAP } = useRequestsPOSummary(selectedSite?.id);

  const queryClient = useQueryClient();
  const cancelRequest = useCancelMaterialRequest();
  const approveRequest = useApproveMaterialRequest();
  const rejectRequest = useRejectMaterialRequest();

  // Unique material names for column filter
  const materialFilterOptions = useMemo(() => {
    const names = new Set<string>();
    allRequests.forEach((r) =>
      r.items?.forEach((item) => {
        if (item.material?.name) names.add(item.material.name);
      })
    );
    return Array.from(names)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ value: name, label: name }));
  }, [allRequests]);

  // Filter requests based on tab and search
  const filteredRequests = useMemo(() => {
    let filtered = allRequests;

    // Filter by tab
    switch (currentTab) {
      case "pending":
        filtered = filtered.filter((r) => r.status === "pending");
        break;
      case "approved":
        filtered = filtered.filter((r) =>
          ["approved", "ordered", "partial_fulfilled"].includes(r.status)
        );
        break;
      case "fulfilled":
        filtered = filtered.filter((r) => r.status === "fulfilled");
        break;
      case "rejected":
        filtered = filtered.filter((r) =>
          ["rejected", "cancelled"].includes(r.status)
        );
        break;
    }

    // Filter by search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.request_number.toLowerCase().includes(term) ||
          r.section?.name?.toLowerCase().includes(term) ||
          r.items?.some((item) =>
            item.material?.name?.toLowerCase().includes(term)
          )
      );
    }

    return filtered;
  }, [allRequests, currentTab, searchTerm]);

  const handleOpenDialog = useCallback((request?: MaterialRequestWithDetails) => {
    setEditingRequest(request || null);
    setDialogOpen(true);
  }, []);

  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false);
    setEditingRequest(null);
  }, []);

  const handleOpenApprovalDialog = useCallback((request: MaterialRequestWithDetails) => {
    setSelectedRequest(request);
    setApprovalDialogOpen(true);
  }, []);

  const handleCloseApprovalDialog = useCallback(() => {
    setApprovalDialogOpen(false);
    setSelectedRequest(null);
  }, []);

  const handleViewDetails = useCallback((request: MaterialRequestWithDetails) => {
    setSelectedRequest(request);
    setDetailsDrawerOpen(true);
  }, []);

  const handleCloseDetails = useCallback(() => {
    setDetailsDrawerOpen(false);
    setSelectedRequest(null);
  }, []);

  const handleOpenConvertDialog = useCallback((request: MaterialRequestWithDetails) => {
    setRequestToConvert(request);
    setConvertDialogOpen(true);
  }, []);

  const handleCloseConvertDialog = useCallback(() => {
    setConvertDialogOpen(false);
    setRequestToConvert(null);
  }, []);

  const handleConvertSuccess = useCallback((poId: string) => {
    // Invalidate queries to refresh the PO Status column
    queryClient.invalidateQueries({ queryKey: ["material-requests", "po-summary", selectedSite?.id] });
    queryClient.invalidateQueries({ queryKey: ["material-requests", selectedSite?.id] });
    handleCloseConvertDialog();
  }, [handleCloseConvertDialog, queryClient, selectedSite?.id]);

  const handleOpenDeleteDialog = useCallback((request: MaterialRequestWithDetails) => {
    setRequestToDelete(request);
    setDeleteDialogOpen(true);
  }, []);

  const handleCloseDeleteDialog = useCallback(() => {
    setDeleteDialogOpen(false);
    setRequestToDelete(null);
  }, []);

  const handleCancel = useCallback(
    async (request: MaterialRequestWithDetails) => {
      if (!confirm("Are you sure you want to cancel this request?")) return;
      try {
        await cancelRequest.mutateAsync(request.id);
      } catch (error) {
        console.error("Failed to cancel request:", error);
      }
    },
    [cancelRequest]
  );

  const handleReject = useCallback(
    async (request: MaterialRequestWithDetails) => {
      if (!user?.id) return;
      const reason = prompt("Enter rejection reason:");
      if (reason === null) return;
      try {
        await rejectRequest.mutateAsync({
          id: request.id,
          userId: user.id,
          reason,
          siteId: request.site_id, // Added for optimistic update
        });
      } catch (error) {
        console.error("Failed to reject request:", error);
      }
    },
    [rejectRequest, user?.id]
  );

  // Table columns
  const columns = useMemo<MRT_ColumnDef<MaterialRequestWithDetails>[]>(
    () => [
      {
        accessorKey: "request_number",
        header: "Request #",
        size: 130,
        Cell: ({ row }) => (
          <Box>
            <Typography
              variant="body2"
              fontWeight={500}
              sx={{ cursor: "pointer", color: "primary.main" }}
              onClick={() => handleViewDetails(row.original)}
            >
              {row.original.request_number}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {formatDate(row.original.request_date)}
            </Typography>
          </Box>
        ),
      },
      {
        accessorKey: "section.name",
        header: "Section",
        size: 150,
        Cell: ({ row }) =>
          row.original.section?.name ? (
            <Chip
              label={row.original.section.name}
              size="small"
              variant="outlined"
            />
          ) : (
            "-"
          ),
      },
      {
        accessorKey: "priority",
        header: "Priority",
        size: 100,
        Cell: ({ row }) => (
          <Chip
            label={row.original.priority}
            color={PRIORITY_COLORS[row.original.priority]}
            size="small"
          />
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 120,
        Cell: ({ row }) => (
          <Chip
            label={STATUS_LABELS[row.original.status]}
            color={STATUS_COLORS[row.original.status]}
            size="small"
          />
        ),
      },
      {
        id: "po_status",
        header: "PO Status",
        size: 150,
        Cell: ({ row }) => {
          const summary = poSummaryMap.get(row.original.id);
          const canCreate = ["approved", "ordered", "partial_fulfilled"].includes(row.original.status);

          // No linked POs
          if (!summary || summary.totalLinkedPOs === 0) {
            if (canCreate && isAdmin) {
              return (
                <Button
                  size="small"
                  variant="text"
                  startIcon={<ConvertIcon fontSize="small" />}
                  onClick={() => handleOpenConvertDialog(row.original)}
                  sx={{ textTransform: "none", fontSize: "0.75rem" }}
                >
                  Create PO
                </Button>
              );
            }
            return (
              <Typography variant="caption" color="text.secondary">
                -
              </Typography>
            );
          }

          // Single PO
          if (summary.totalLinkedPOs === 1) {
            const po = summary.linkedPOs[0];
            return (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Typography
                  variant="body2"
                  sx={{
                    cursor: "pointer",
                    color: "primary.main",
                    "&:hover": { textDecoration: "underline" },
                  }}
                  onClick={() => window.open(`/site/purchase-orders?highlight=${po.id}`, "_blank")}
                >
                  → {po.po_number}
                </Typography>
                {summary.hasRemainingItems && (
                  <Chip
                    size="small"
                    label={`+${summary.remainingItemCount}`}
                    color="warning"
                    sx={{ height: 20, fontSize: "0.65rem" }}
                  />
                )}
                {!summary.hasRemainingItems && (
                  <FulfilledIcon fontSize="small" color="success" sx={{ ml: 0.5 }} />
                )}
              </Box>
            );
          }

          // Multiple POs
          return (
            <Tooltip
              title={
                <Box>
                  {summary.linkedPOs.map((po) => (
                    <Typography key={po.id} variant="caption" sx={{ display: "block" }}>
                      {po.po_number} - {po.vendor_name}
                    </Typography>
                  ))}
                </Box>
              }
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Typography variant="body2" color="primary.main">
                  {summary.totalLinkedPOs} POs
                </Typography>
                {summary.hasRemainingItems ? (
                  <Chip
                    size="small"
                    label={`+${summary.remainingItemCount}`}
                    color="warning"
                    sx={{ height: 20, fontSize: "0.65rem" }}
                  />
                ) : (
                  <FulfilledIcon fontSize="small" color="success" />
                )}
              </Box>
            </Tooltip>
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
            const qty = item.requested_qty;
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
        accessorKey: "required_by_date",
        header: "Required By",
        size: 110,
        Cell: ({ row }) =>
          row.original.required_by_date
            ? formatDate(row.original.required_by_date)
            : "-",
      },
    ],
    [handleViewDetails, poSummaryMap, isAdmin, handleOpenConvertDialog, materialFilterOptions]
  );

  // Memoized props for DataTable to prevent re-renders
  const tableInitialState = useMemo(
    () => ({
      sorting: [{ id: "request_number", desc: true }],
    }),
    []
  );

  const mobileHiddenColumns = useMemo(() => ["items", "required_by_date", "po_status"], []);

  // Row actions
  const renderRowActions = useCallback(
    ({ row }: { row: { original: MaterialRequestWithDetails } }) => {
      const request = row.original;
      const summary = poSummaryMap.get(request.id);
      const hasLinkedPOs = summary && summary.totalLinkedPOs > 0;
      const hasRemainingItems = summary?.hasRemainingItems ?? true;
      const canCreatePO = ["approved", "ordered", "partial_fulfilled"].includes(request.status);

      return (
        <Box sx={{ display: "flex", gap: 0.5 }}>
          {/* View Details - always show */}
          <Tooltip title="View Details">
            <IconButton size="small" onClick={() => handleViewDetails(request)}>
              <ViewIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          {/* Approve/Reject - only for pending requests */}
          {request.status === "pending" && isAdmin && (
            <>
              <Tooltip title="Approve">
                <IconButton
                  size="small"
                  color="success"
                  onClick={() => handleOpenApprovalDialog(request)}
                >
                  <ApproveIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Reject">
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => handleReject(request)}
                >
                  <CancelIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}

          {/* Edit/Cancel - only for draft or pending */}
          {["draft", "pending"].includes(request.status) && canEdit && (
            <>
              <Tooltip title="Edit">
                <IconButton
                  size="small"
                  onClick={() => handleOpenDialog(request)}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Cancel">
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => handleCancel(request)}
                >
                  <CancelIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}

          {/* Delete action - show warning color if has linked POs */}
          {isAdmin && (
            <Tooltip title={hasLinkedPOs ? "Delete (has linked POs)" : "Delete"}>
              <IconButton
                size="small"
                color={hasLinkedPOs ? "warning" : "error"}
                onClick={() => handleOpenDeleteDialog(request)}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}

          {/* Convert to PO - Smart behavior based on PO status */}
          {canCreatePO && isAdmin && hasRemainingItems && (
            <Tooltip title={hasLinkedPOs ? `Add to PO (${summary?.remainingItemCount} remaining)` : "Convert to PO"}>
              <Badge
                badgeContent={hasLinkedPOs ? summary?.remainingItemCount : 0}
                color="warning"
                invisible={!hasLinkedPOs}
                sx={{
                  "& .MuiBadge-badge": {
                    fontSize: "0.6rem",
                    height: 16,
                    minWidth: 16,
                  },
                }}
              >
                <IconButton
                  size="small"
                  color="primary"
                  onClick={() => handleOpenConvertDialog(request)}
                >
                  <ConvertIcon fontSize="small" />
                </IconButton>
              </Badge>
            </Tooltip>
          )}

          {/* View Linked POs - show when fully converted (no remaining items) */}
          {canCreatePO && hasLinkedPOs && !hasRemainingItems && (
            <Tooltip title="Fully converted to PO(s)">
              <IconButton
                size="small"
                color="success"
                onClick={() => handleViewDetails(request)}
              >
                <FulfilledIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      );
    },
    [
      canEdit,
      isAdmin,
      poSummaryMap,
      handleViewDetails,
      handleOpenDialog,
      handleOpenApprovalDialog,
      handleOpenConvertDialog,
      handleOpenDeleteDialog,
      handleCancel,
      handleReject,
    ]
  );

  if (!selectedSite) {
    return (
      <Box sx={{ p: 3, textAlign: "center" }}>
        <Typography color="text.secondary">
          Please select a site to manage material requests
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <PageHeader
        title="Material Requests"
        actions={
          !isMobile && canEdit ? (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => handleOpenDialog()}
            >
              New Request
            </Button>
          ) : null
        }
      />

      <MaterialWorkflowBar currentStep="requests" />

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card>
            <CardContent sx={{ py: 1.5 }}>
              <Typography variant="caption" color="text.secondary">
                Pending Approval
              </Typography>
              <Typography variant="h5" color="warning.main">
                {summary?.pending || 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card>
            <CardContent sx={{ py: 1.5 }}>
              <Typography variant="caption" color="text.secondary">
                Approved
              </Typography>
              <Typography variant="h5" color="info.main">
                {(summary?.approved || 0) +
                  (summary?.ordered || 0) +
                  (summary?.partial_fulfilled || 0)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card>
            <CardContent sx={{ py: 1.5 }}>
              <Typography variant="caption" color="text.secondary">
                Fulfilled
              </Typography>
              <Typography variant="h5" color="success.main">
                {summary?.fulfilled || 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Card>
            <CardContent sx={{ py: 1.5 }}>
              <Typography variant="caption" color="text.secondary">
                Total Requests
              </Typography>
              <Typography variant="h5">{summary?.total || 0}</Typography>
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
          <Tab label="Pending" value="pending" />
          <Tab label="Approved" value="approved" />
          <Tab label="Fulfilled" value="fulfilled" />
          <Tab label="Rejected" value="rejected" />
        </Tabs>

        <TextField
          size="small"
          placeholder="Search request number..."
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
        data={filteredRequests}
        isLoading={isLoading}
        enableRowActions
        renderRowActions={renderRowActions}
        mobileHiddenColumns={mobileHiddenColumns}
        initialState={tableInitialState}
      />

      {/* Mobile FAB */}
      {isMobile && canEdit && (
        <Fab
          color="primary"
          sx={{ position: "fixed", bottom: 16, right: 16 }}
          onClick={() => handleOpenDialog()}
        >
          <AddIcon />
        </Fab>
      )}

      {/* Create/Edit Request Dialog */}
      <MaterialRequestDialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        request={editingRequest}
        siteId={selectedSite.id}
      />

      {/* Approval Dialog */}
      <RequestApprovalDialog
        open={approvalDialogOpen}
        onClose={handleCloseApprovalDialog}
        request={selectedRequest}
      />

      {/* Request Details Drawer */}
      <RequestDetailsDrawer
        open={detailsDrawerOpen}
        onClose={handleCloseDetails}
        request={selectedRequest}
        onEdit={handleOpenDialog}
        onApprove={handleOpenApprovalDialog}
        onConvertToPO={handleOpenConvertDialog}
        canEdit={canEdit}
        isAdmin={isAdmin}
      />

      {/* Convert to PO Dialog (from request) */}
      {requestToConvert && (
        <UnifiedPurchaseOrderDialog
          open={convertDialogOpen}
          onClose={handleCloseConvertDialog}
          request={requestToConvert}
          siteId={selectedSite.id}
          onSuccess={handleConvertSuccess}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <MaterialRequestDeleteConfirmationDialog
        open={deleteDialogOpen}
        onClose={handleCloseDeleteDialog}
        requestId={requestToDelete?.id}
        requestNumber={requestToDelete?.request_number}
        siteId={selectedSite.id}
      />
    </Box>
  );
}
