"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Box,
  Typography,
  IconButton,
  Tooltip,
  Chip,
  TextField,
  MenuItem,
  Alert,
  Skeleton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Warning as WarningIcon,
  Undo as UndoIcon,
  Inventory as InventoryIcon,
  Receipt as BatchIcon,
} from "@mui/icons-material";
import DataTable, { type MRT_ColumnDef } from "@/components/common/DataTable";
import BatchUsageEditDialog from "@/components/materials/BatchUsageEditDialog";
import { useGroupBatchUsageRecords, useDeleteBatchUsage, useUpdateBatchUsage } from "@/hooks/queries/useBatchUsage";
import { formatCurrency, formatDate } from "@/lib/formatters";
import type { BatchUsageRecordWithDetails } from "@/types/material.types";
import {
  BATCH_USAGE_SETTLEMENT_STATUS_LABELS,
  BATCH_USAGE_SETTLEMENT_STATUS_COLORS,
  type BatchUsageSettlementStatus,
} from "@/types/material.types";
import dayjs from "dayjs";

interface BatchUsageHistoryTabProps {
  groupId: string | undefined;
  currentSiteId: string | undefined;
  allSites?: Array<{ id: string; name: string }>;
  canEdit: boolean;
}

export default function BatchUsageHistoryTab({
  groupId,
  currentSiteId,
  allSites,
  canEdit,
}: BatchUsageHistoryTabProps) {
  // Data
  const { data: records = [], isLoading } = useGroupBatchUsageRecords(groupId);
  const deleteMutation = useDeleteBatchUsage();
  const updateMutation = useUpdateBatchUsage();

  // Filter state
  const [siteFilter, setSiteFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Dialog state
  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    record: BatchUsageRecordWithDetails | null;
  }>({ open: false, record: null });

  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    record: BatchUsageRecordWithDetails | null;
  }>({ open: false, record: null });

  // Filter records
  const filteredRecords = useMemo(() => {
    let filtered = records;

    if (siteFilter !== "all") {
      filtered = filtered.filter((r) => r.usage_site_id === siteFilter);
    }
    if (statusFilter !== "all") {
      filtered = filtered.filter((r) => r.settlement_status === statusFilter);
    }

    return filtered;
  }, [records, siteFilter, statusFilter]);

  // Get unique sites from records for the filter
  const sitesFromRecords = useMemo(() => {
    const siteMap = new Map<string, string>();
    for (const r of records) {
      if (r.usage_site?.id && r.usage_site?.name) {
        siteMap.set(r.usage_site.id, r.usage_site.name);
      }
    }
    return Array.from(siteMap, ([id, name]) => ({ id, name }));
  }, [records]);

  const sites = allSites && allSites.length > 0 ? allSites : sitesFromRecords;

  // Handlers
  const handleEdit = useCallback(
    async (data: {
      quantity?: number;
      work_description?: string;
      usage_site_id?: string;
    }) => {
      if (!editDialog.record) return;
      try {
        await updateMutation.mutateAsync({
          usageId: editDialog.record.id,
          batchRefCode: editDialog.record.batch_ref_code,
          siteId: editDialog.record.usage_site_id,
          updates: data,
        });
        setEditDialog({ open: false, record: null });
      } catch (error) {
        console.error("Failed to update usage record:", error);
      }
    },
    [editDialog.record, updateMutation]
  );

  const handleDelete = useCallback(async () => {
    if (!deleteDialog.record) return;
    try {
      await deleteMutation.mutateAsync({
        usageId: deleteDialog.record.id,
        batchRefCode: deleteDialog.record.batch_ref_code,
        siteId: deleteDialog.record.usage_site_id,
      });
      setDeleteDialog({ open: false, record: null });
    } catch (error) {
      console.error("Failed to delete usage record:", error);
    }
  }, [deleteDialog.record, deleteMutation]);

  // Table columns
  const columns = useMemo<MRT_ColumnDef<BatchUsageRecordWithDetails>[]>(
    () => [
      {
        accessorKey: "usage_date",
        header: "Date",
        size: 100,
        Cell: ({ row }) =>
          dayjs(row.original.usage_date).format("DD MMM YYYY"),
      },
      {
        accessorKey: "material_id",
        header: "Material",
        size: 160,
        Cell: ({ row }) => (
          <Box>
            <Typography variant="body2" fontWeight={500}>
              {row.original.material?.name || "Unknown"}
            </Typography>
            {row.original.brand?.brand_name && (
              <Typography variant="caption" color="text.secondary">
                {row.original.brand.brand_name}
              </Typography>
            )}
          </Box>
        ),
      },
      {
        accessorKey: "batch_ref_code",
        header: "Batch",
        size: 140,
        Cell: ({ row }) => (
          <Typography
            variant="caption"
            sx={{
              fontFamily: "monospace",
              bgcolor: "action.selected",
              px: 0.5,
              py: 0.25,
              borderRadius: 0.5,
            }}
          >
            {row.original.batch_ref_code}
          </Typography>
        ),
      },
      {
        accessorFn: (row) => row.usage_site?.name || "Unknown",
        id: "usage_site",
        header: "Used By",
        size: 150,
        Cell: ({ row }) => {
          const isCurrentSite =
            row.original.usage_site_id === currentSiteId;
          return (
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              <Typography
                variant="body2"
                fontWeight={isCurrentSite ? 600 : 400}
                color={isCurrentSite ? "primary.main" : "text.primary"}
              >
                {row.original.usage_site?.name || "Unknown"}
              </Typography>
              {isCurrentSite && (
                <Chip
                  label="You"
                  size="small"
                  color="primary"
                  variant="outlined"
                  sx={{ height: 18, fontSize: "0.65rem" }}
                />
              )}
              {row.original.is_self_use && (
                <Chip
                  label="Self"
                  size="small"
                  color="success"
                  variant="outlined"
                  sx={{ height: 18, fontSize: "0.65rem" }}
                />
              )}
            </Box>
          );
        },
      },
      {
        accessorKey: "quantity",
        header: "Quantity",
        size: 100,
        Cell: ({ row }) => (
          <Typography variant="body2">
            {Number(row.original.quantity).toFixed(2)}{" "}
            {row.original.unit || row.original.material?.unit || "nos"}
          </Typography>
        ),
      },
      {
        accessorKey: "total_cost",
        header: "Cost",
        size: 100,
        Cell: ({ row }) =>
          formatCurrency(Number(row.original.total_cost) || 0),
      },
      {
        accessorKey: "work_description",
        header: "Work",
        size: 150,
        Cell: ({ row }) => (
          <Typography
            variant="body2"
            sx={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 150,
            }}
          >
            {row.original.work_description || "-"}
          </Typography>
        ),
      },
      {
        accessorKey: "settlement_status",
        header: "Status",
        size: 130,
        Cell: ({ row }) => {
          const status = row.original
            .settlement_status as BatchUsageSettlementStatus;
          return (
            <Chip
              label={
                BATCH_USAGE_SETTLEMENT_STATUS_LABELS[status] || status
              }
              size="small"
              color={BATCH_USAGE_SETTLEMENT_STATUS_COLORS[status] || "default"}
              sx={{ height: 22, fontSize: "0.7rem" }}
            />
          );
        },
        filterVariant: "select",
        filterSelectOptions: [
          { value: "pending", label: "Pending" },
          { value: "self_use", label: "Self Use" },
          { value: "settled", label: "Settled" },
          { value: "in_settlement", label: "In Settlement" },
        ],
      },
    ],
    [currentSiteId]
  );

  // Row actions
  const renderRowActions = useCallback(
    ({ row }: { row: { original: BatchUsageRecordWithDetails } }) => {
      const record = row.original;
      const isOwnSite = record.usage_site_id === currentSiteId;
      const isSettled = record.settlement_status === "settled";
      const isInSettlement = record.settlement_status === "in_settlement";
      const canModify = canEdit && isOwnSite && !isSettled && !isInSettlement;

      if (!isOwnSite) {
        return (
          <Tooltip title="Recorded by another site">
            <Typography variant="caption" color="text.secondary">
              View only
            </Typography>
          </Tooltip>
        );
      }

      if (isSettled || isInSettlement) {
        return (
          <Tooltip title="Record is part of a settlement">
            <Typography variant="caption" color="text.secondary">
              Settled
            </Typography>
          </Tooltip>
        );
      }

      return (
        <Box sx={{ display: "flex", gap: 0.5 }}>
          {canModify && (
            <>
              <Tooltip title="Edit">
                <IconButton
                  size="small"
                  color="primary"
                  onClick={() =>
                    setEditDialog({ open: true, record })
                  }
                >
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete">
                <IconButton
                  size="small"
                  color="error"
                  onClick={() =>
                    setDeleteDialog({ open: true, record })
                  }
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Box>
      );
    },
    [canEdit, currentSiteId]
  );

  if (isLoading) {
    return (
      <Box sx={{ p: 2 }}>
        <Skeleton variant="rectangular" height={400} />
      </Box>
    );
  }

  if (records.length === 0) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="info">
          No usage records found for this group. Record usage from the
          &quot;Stock &amp; Batches&quot; tab to see history here.
        </Alert>
      </Box>
    );
  }

  const deleteRecord = deleteDialog.record;
  const deleteUnit =
    deleteRecord?.unit || deleteRecord?.material?.unit || "nos";

  return (
    <Box>
      {/* Filters */}
      <Box
        sx={{
          display: "flex",
          gap: 2,
          mb: 2,
          px: 1,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <TextField
          select
          label="Site"
          value={siteFilter}
          onChange={(e) => setSiteFilter(e.target.value)}
          size="small"
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="all">All Sites</MenuItem>
          {sites.map((site) => (
            <MenuItem key={site.id} value={site.id}>
              {site.name}
              {site.id === currentSiteId ? " (You)" : ""}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          select
          label="Status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          size="small"
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="all">All Statuses</MenuItem>
          <MenuItem value="pending">Pending</MenuItem>
          <MenuItem value="self_use">Self Use</MenuItem>
          <MenuItem value="in_settlement">In Settlement</MenuItem>
          <MenuItem value="settled">Settled</MenuItem>
        </TextField>

        <Typography variant="caption" color="text.secondary" sx={{ ml: "auto" }}>
          {filteredRecords.length} of {records.length} records
        </Typography>
      </Box>

      {/* Table */}
      <DataTable
        columns={columns}
        data={filteredRecords}
        enableRowActions
        positionActionsColumn="last"
        renderRowActions={renderRowActions}
        initialState={{
          density: "compact" as const,
          showColumnFilters: false,
          showGlobalFilter: true,
          pagination: { pageSize: 50, pageIndex: 0 },
          sorting: [{ id: "usage_date", desc: true }],
        }}
        muiTableContainerProps={{ sx: { maxHeight: 600 } }}
      />

      {/* Edit Dialog */}
      <BatchUsageEditDialog
        open={editDialog.open}
        record={editDialog.record}
        onClose={() => setEditDialog({ open: false, record: null })}
        onSave={handleEdit}
        isSaving={updateMutation.isPending}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialog.open}
        onClose={
          deleteMutation.isPending
            ? undefined
            : () => setDeleteDialog({ open: false, record: null })
        }
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: { borderTop: 4, borderColor: "error.main" },
        }}
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <WarningIcon color="error" />
          <Typography variant="h6" component="span">
            Delete Usage Record
          </Typography>
        </DialogTitle>
        <DialogContent>
          {deleteRecord && (
            <>
              {/* Record Details */}
              <Box
                sx={{
                  p: 2,
                  bgcolor: "action.hover",
                  borderRadius: 1,
                  mb: 2,
                }}
              >
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 2,
                  }}
                >
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Material
                    </Typography>
                    <Typography variant="body2" fontWeight={500}>
                      {deleteRecord.material?.name || "Unknown"}
                    </Typography>
                    {deleteRecord.brand?.brand_name && (
                      <Typography variant="caption" color="text.secondary">
                        {deleteRecord.brand.brand_name}
                      </Typography>
                    )}
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Quantity
                    </Typography>
                    <Typography
                      variant="body2"
                      fontWeight={600}
                      color="error.main"
                    >
                      {Number(deleteRecord.quantity)} {deleteUnit}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Date
                    </Typography>
                    <Typography variant="body2">
                      {formatDate(deleteRecord.usage_date)}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">
                      Cost
                    </Typography>
                    <Typography variant="body2" fontWeight={500}>
                      {formatCurrency(Number(deleteRecord.total_cost) || 0)}
                    </Typography>
                  </Box>
                </Box>
                {deleteRecord.work_description && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="caption" color="text.secondary">
                      Work Description
                    </Typography>
                    <Typography variant="body2">
                      {deleteRecord.work_description}
                    </Typography>
                  </Box>
                )}
              </Box>

              {/* Impact */}
              <Typography
                variant="subtitle2"
                fontWeight={600}
                sx={{ mb: 1 }}
              >
                This will:
              </Typography>
              <List dense disablePadding>
                <ListItem sx={{ py: 0.5 }}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <UndoIcon color="success" fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primaryTypographyProps={{ component: "div" }}
                    primary={
                      <Typography variant="body2" component="span">
                        Restore{" "}
                        <Chip
                          label={`+${Number(deleteRecord.quantity)} ${deleteUnit}`}
                          size="small"
                          color="success"
                          sx={{ height: 20 }}
                        />{" "}
                        to batch stock
                      </Typography>
                    }
                  />
                </ListItem>
                <ListItem sx={{ py: 0.5 }}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <InventoryIcon color="info" fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Restore stock inventory quantity"
                    primaryTypographyProps={{ variant: "body2" }}
                  />
                </ListItem>
                <ListItem sx={{ py: 0.5 }}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <BatchIcon color="warning" fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary="Update batch settlement tracking"
                    primaryTypographyProps={{ variant: "body2" }}
                  />
                </ListItem>
              </List>

              <Alert severity="error" sx={{ mt: 2 }}>
                <Typography variant="body2" fontWeight={500}>
                  This action cannot be undone.
                </Typography>
              </Alert>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setDeleteDialog({ open: false, record: null })}
            disabled={deleteMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            startIcon={
              deleteMutation.isPending ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <DeleteIcon />
              )
            }
          >
            {deleteMutation.isPending ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
