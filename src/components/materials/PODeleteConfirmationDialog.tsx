"use client";

import { useEffect } from "react";
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
  Groups as GroupIcon,
  SwapHoriz as SettlementIcon,
  Inventory as UsageIcon,
  Delete as DeleteIcon,
} from "@mui/icons-material";
import {
  usePODeletionImpact,
  useDeletePurchaseOrderCascade,
  type PODeletionImpact,
} from "@/hooks/queries/usePurchaseOrders";
import { formatCurrency } from "@/lib/formatters";

interface PODeleteConfirmationDialogProps {
  open: boolean;
  onClose: () => void;
  poId: string | undefined;
  poNumber: string | undefined;
  siteId: string;
  onSuccess?: () => void;
}

export default function PODeleteConfirmationDialog({
  open,
  onClose,
  poId,
  poNumber,
  siteId,
  onSuccess,
}: PODeleteConfirmationDialogProps) {
  // Fetch deletion impact when dialog opens
  const { data: impact, isLoading: impactLoading } = usePODeletionImpact(
    open ? poId : undefined
  );

  const deleteMutation = useDeletePurchaseOrderCascade();

  const handleDelete = async () => {
    if (!poId) return;

    try {
      await deleteMutation.mutateAsync({ id: poId, siteId });
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error("Failed to delete PO:", error);
    }
  };

  // Calculate totals for display
  const hasRelatedRecords =
    impact &&
    (impact.deliveries.length > 0 ||
      impact.materialExpenses.length > 0 ||
      impact.batchUsageRecords.length > 0 ||
      impact.interSiteSettlements.length > 0 ||
      impact.derivedExpenses.length > 0);

  const totalExpenseAmount =
    impact?.materialExpenses.reduce((sum, e) => sum + e.total_amount, 0) || 0;
  const totalSettlementAmount =
    impact?.interSiteSettlements.reduce((sum, s) => sum + s.total_amount, 0) ||
    0;
  const totalDerivedAmount =
    impact?.derivedExpenses.reduce((sum, e) => sum + e.total_amount, 0) || 0;

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
        Delete Purchase Order
      </DialogTitle>

      <DialogContent>
        {deleteMutation.isError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {deleteMutation.error instanceof Error
              ? deleteMutation.error.message
              : "Failed to delete purchase order. Please try again."}
          </Alert>
        )}

        <Typography variant="body1" gutterBottom>
          Are you sure you want to delete PO{" "}
          <strong>{poNumber}</strong>?
        </Typography>

        {impactLoading ? (
          <Box sx={{ mt: 2 }}>
            <Skeleton variant="rectangular" height={40} sx={{ mb: 1 }} />
            <Skeleton variant="rectangular" height={40} sx={{ mb: 1 }} />
            <Skeleton variant="rectangular" height={40} />
          </Box>
        ) : hasRelatedRecords ? (
          <>
            <Alert severity="warning" sx={{ mt: 2, mb: 2 }}>
              <Typography variant="subtitle2" fontWeight={600}>
                This will also delete the following related records:
              </Typography>
            </Alert>

            <List dense disablePadding>
              {/* Deliveries */}
              {impact.deliveries.length > 0 && (
                <ListItem sx={{ py: 0.5 }}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <DeliveryIcon color="action" fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primaryTypographyProps={{ component: "div" }}
                    primary={
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                        }}
                      >
                        <Typography variant="body2">
                          {impact.deliveries.length} Delivery Record
                          {impact.deliveries.length !== 1 ? "s" : ""} (GRN)
                        </Typography>
                        <Chip
                          label={`${impact.deliveryItemsCount} items`}
                          size="small"
                          variant="outlined"
                        />
                      </Box>
                    }
                    secondary={impact.deliveries
                      .map((d) => d.grn_number)
                      .join(", ")}
                  />
                </ListItem>
              )}

              {/* Material Expenses */}
              {impact.materialExpenses.length > 0 && (
                <ListItem sx={{ py: 0.5 }}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <ExpenseIcon color="action" fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primaryTypographyProps={{ component: "div" }}
                    primary={
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                        }}
                      >
                        <Typography variant="body2">
                          {impact.materialExpenses.length} Material Settlement
                          {impact.materialExpenses.length !== 1 ? "s" : ""}
                        </Typography>
                        <Chip
                          label={formatCurrency(totalExpenseAmount)}
                          size="small"
                          color="error"
                          variant="outlined"
                        />
                      </Box>
                    }
                    secondary={impact.materialExpenses
                      .map((e) => e.ref_code)
                      .join(", ")}
                  />
                </ListItem>
              )}

              {/* Group Stock Batch Info */}
              {impact.hasGroupStockBatch && (
                <>
                  <Divider sx={{ my: 1 }} />
                  <ListItem sx={{ py: 0.5, bgcolor: "warning.50" }}>
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <GroupIcon color="warning" fontSize="small" />
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Typography
                          variant="body2"
                          fontWeight={600}
                          color="warning.main"
                        >
                          Group Stock Batch: {impact.batchRefCode}
                        </Typography>
                      }
                      secondary="This is a shared batch. All related inter-site records will be deleted."
                    />
                  </ListItem>

                  {/* Batch Usage Records */}
                  {impact.batchUsageRecords.length > 0 && (
                    <ListItem sx={{ py: 0.5, pl: 4 }}>
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        <UsageIcon color="action" fontSize="small" />
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Typography variant="body2">
                            {impact.batchUsageRecords.length} Usage Record
                            {impact.batchUsageRecords.length !== 1 ? "s" : ""}
                          </Typography>
                        }
                        secondary={impact.batchUsageRecords
                          .map(
                            (r) => `${r.site_name || "Unknown"}: ${r.quantity}`
                          )
                          .join(", ")}
                      />
                    </ListItem>
                  )}

                  {/* Inter-Site Settlements */}
                  {impact.interSiteSettlements.length > 0 && (
                    <ListItem sx={{ py: 0.5, pl: 4 }}>
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        <SettlementIcon color="action" fontSize="small" />
                      </ListItemIcon>
                      <ListItemText
                        primaryTypographyProps={{ component: "div" }}
                        primary={
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                            }}
                          >
                            <Typography variant="body2">
                              {impact.interSiteSettlements.length} Inter-Site
                              Settlement
                              {impact.interSiteSettlements.length !== 1
                                ? "s"
                                : ""}
                            </Typography>
                            <Chip
                              label={formatCurrency(totalSettlementAmount)}
                              size="small"
                              color="warning"
                              variant="outlined"
                            />
                          </Box>
                        }
                        secondary={impact.interSiteSettlements
                          .map((s) => `${s.settlement_code} (${s.debtor_site_name})`)
                          .join(", ")}
                      />
                    </ListItem>
                  )}

                  {/* Derived Expenses (Debtor + Self-Use) */}
                  {impact.derivedExpenses.length > 0 && (
                    <ListItem sx={{ py: 0.5, pl: 4 }}>
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        <ExpenseIcon color="action" fontSize="small" />
                      </ListItemIcon>
                      <ListItemText
                        primaryTypographyProps={{ component: "div" }}
                        primary={
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                            }}
                          >
                            <Typography variant="body2">
                              {impact.derivedExpenses.length} Site Expense
                              {impact.derivedExpenses.length !== 1 ? "s" : ""}{" "}
                              (from settlements)
                            </Typography>
                            <Chip
                              label={formatCurrency(totalDerivedAmount)}
                              size="small"
                              color="error"
                              variant="outlined"
                            />
                          </Box>
                        }
                        secondary={impact.derivedExpenses
                          .map((e) => `${e.ref_code} (${e.site_name})`)
                          .join(", ")}
                      />
                    </ListItem>
                  )}
                </>
              )}
            </List>

            <Alert severity="error" sx={{ mt: 2 }}>
              <Typography variant="body2" fontWeight={500}>
                This action cannot be undone. All financial records will be
                permanently removed.
              </Typography>
            </Alert>
          </>
        ) : (
          <Alert severity="info" sx={{ mt: 2 }}>
            No related delivery or expense records found. This PO can be safely
            deleted.
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
            : hasRelatedRecords
            ? "Delete All"
            : "Delete"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
