"use client";

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Alert,
  CircularProgress,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Chip,
  Skeleton,
} from "@mui/material";
import {
  Warning as WarningIcon,
  LocalShipping as DeliveryIcon,
  Receipt as ExpenseIcon,
  ShoppingCart as POIcon,
  Delete as DeleteIcon,
  CheckCircle as ApprovedIcon,
  Pending as PendingIcon,
  Edit as DraftIcon,
} from "@mui/icons-material";
import {
  useMaterialRequestDeletionImpact,
  useDeleteMaterialRequestCascade,
} from "@/hooks/queries/useMaterialRequests";
import { formatCurrency } from "@/lib/formatters";
import type { POStatus } from "@/types/material.types";

interface MaterialRequestDeleteConfirmationDialogProps {
  open: boolean;
  onClose: () => void;
  requestId: string | undefined;
  requestNumber: string | undefined;
  siteId: string;
  onSuccess?: () => void;
}

// Get status display config
const getStatusConfig = (status: POStatus) => {
  switch (status) {
    case "draft":
      return { icon: <DraftIcon fontSize="small" />, color: "default" as const, label: "Draft" };
    case "pending_approval":
      return { icon: <PendingIcon fontSize="small" />, color: "warning" as const, label: "Pending" };
    case "approved":
      return { icon: <ApprovedIcon fontSize="small" />, color: "info" as const, label: "Approved" };
    case "ordered":
      return { icon: <POIcon fontSize="small" />, color: "primary" as const, label: "Ordered" };
    case "partial_delivered":
      return { icon: <DeliveryIcon fontSize="small" />, color: "warning" as const, label: "Partial" };
    case "delivered":
      return { icon: <DeliveryIcon fontSize="small" />, color: "success" as const, label: "Delivered" };
    case "cancelled":
      return { icon: <WarningIcon fontSize="small" />, color: "error" as const, label: "Cancelled" };
    default:
      return { icon: <POIcon fontSize="small" />, color: "default" as const, label: status };
  }
};

export default function MaterialRequestDeleteConfirmationDialog({
  open,
  onClose,
  requestId,
  requestNumber,
  siteId,
  onSuccess,
}: MaterialRequestDeleteConfirmationDialogProps) {
  // Fetch deletion impact when dialog opens
  const { data: impact, isLoading: impactLoading } = useMaterialRequestDeletionImpact(
    open ? requestId : undefined
  );

  const deleteMutation = useDeleteMaterialRequestCascade();

  const handleDelete = async () => {
    if (!requestId) return;

    try {
      await deleteMutation.mutateAsync({ id: requestId, siteId });
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error("Failed to delete material request:", error);
    }
  };

  // Calculate totals for display
  const hasLinkedPOs = impact && impact.totalPOCount > 0;
  const hasDeliveredPOs = impact?.hasDeliveredItems || false;

  return (
    <Dialog
      open={open}
      onClose={(_event, reason) => { if (reason !== "backdropClick") onClose(); }}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { borderTop: 4, borderColor: "error.main" },
      }}
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <WarningIcon color="error" />
        Delete Material Request
      </DialogTitle>

      <DialogContent>
        {deleteMutation.isError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {deleteMutation.error instanceof Error
              ? deleteMutation.error.message
              : "Failed to delete material request. Please try again."}
          </Alert>
        )}

        <Typography variant="body1" gutterBottom>
          Are you sure you want to delete request{" "}
          <strong>{requestNumber}</strong>?
        </Typography>

        {impactLoading ? (
          <Box sx={{ mt: 2 }}>
            <Skeleton variant="rectangular" height={40} sx={{ mb: 1 }} />
            <Skeleton variant="rectangular" height={40} sx={{ mb: 1 }} />
            <Skeleton variant="rectangular" height={40} />
          </Box>
        ) : hasLinkedPOs ? (
          <>
            <Alert severity="warning" sx={{ mt: 2, mb: 2 }}>
              <Typography variant="subtitle2" fontWeight={600}>
                This request has {impact.totalPOCount} linked Purchase Order
                {impact.totalPOCount !== 1 ? "s" : ""}. Deleting will cascade to:
              </Typography>
            </Alert>

            {/* List of Linked POs */}
            <List dense disablePadding>
              {impact.linkedPOs.map((po) => {
                const statusConfig = getStatusConfig(po.status);
                return (
                  <ListItem key={po.id} sx={{ py: 0.5 }}>
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <POIcon color="action" fontSize="small" />
                    </ListItemIcon>
                    <ListItemText
                      primaryTypographyProps={{ component: "div" }}
                      primary={
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            flexWrap: "wrap",
                          }}
                        >
                          <Typography variant="body2" fontWeight={500}>
                            {po.po_number}
                          </Typography>
                          <Chip
                            icon={statusConfig.icon}
                            label={statusConfig.label}
                            size="small"
                            color={statusConfig.color}
                            variant="outlined"
                          />
                          {po.total_amount && (
                            <Chip
                              label={formatCurrency(po.total_amount)}
                              size="small"
                              variant="outlined"
                            />
                          )}
                        </Box>
                      }
                      secondary={
                        po.deliveryCount > 0
                          ? `${po.deliveryCount} delivery record${po.deliveryCount !== 1 ? "s" : ""}`
                          : "No deliveries"
                      }
                    />
                  </ListItem>
                );
              })}
            </List>

            <Divider sx={{ my: 2 }} />

            {/* Summary Counts */}
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 2 }}>
              {impact.totalDeliveries > 0 && (
                <Chip
                  icon={<DeliveryIcon fontSize="small" />}
                  label={`${impact.totalDeliveries} Deliveries`}
                  size="small"
                  color="warning"
                  variant="outlined"
                />
              )}
              {impact.totalExpenses > 0 && (
                <Chip
                  icon={<ExpenseIcon fontSize="small" />}
                  label={`${impact.totalExpenses} Expenses (${formatCurrency(impact.totalExpenseAmount)})`}
                  size="small"
                  color="error"
                  variant="outlined"
                />
              )}
            </Box>

            {/* Warning for delivered items */}
            {hasDeliveredPOs && (
              <Alert severity="error" sx={{ mb: 2 }}>
                <Typography variant="body2" fontWeight={500}>
                  Warning: Some POs have recorded deliveries. Deleting will also
                  remove stock inventory records and expense entries.
                </Typography>
              </Alert>
            )}

            <Alert severity="error">
              <Typography variant="body2" fontWeight={500}>
                This action cannot be undone. All linked records will be
                permanently removed.
              </Typography>
            </Alert>
          </>
        ) : (
          <Alert severity="info" sx={{ mt: 2 }}>
            No linked purchase orders found. This request can be safely deleted.
          </Alert>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={deleteMutation.isPending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={handleDelete}
          disabled={deleteMutation.isPending || impactLoading}
          startIcon={
            deleteMutation.isPending ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <DeleteIcon />
            )
          }
        >
          {deleteMutation.isPending
            ? "Deleting..."
            : hasLinkedPOs
            ? "Delete All"
            : "Delete"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
