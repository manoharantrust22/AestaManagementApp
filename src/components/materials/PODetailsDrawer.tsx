"use client";

import { useMemo } from "react";
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Chip,
  Divider,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Paper,
  Button,
  Stack,
  Grid,
  LinearProgress,
} from "@mui/material";
import {
  Close as CloseIcon,
  Edit as EditIcon,
  LocalShipping as DeliveryIcon,
  Phone as PhoneIcon,
  Email as EmailIcon,
  Assignment as AssignmentIcon,
} from "@mui/icons-material";
import { useIsMobile } from "@/hooks/useIsMobile";
import { usePurchaseOrder, useDeliveries } from "@/hooks/queries/usePurchaseOrders";
import type { PurchaseOrderWithDetails, POStatus, SourceRequestInfo } from "@/types/material.types";
import { PRIORITY_LABELS, PRIORITY_COLORS, REQUEST_STATUS_LABELS } from "@/types/material.types";
import { formatCurrency, formatDate } from "@/lib/formatters";

interface PODetailsDrawerProps {
  open: boolean;
  onClose: () => void;
  purchaseOrder: PurchaseOrderWithDetails | null;
  onRecordDelivery?: (po: PurchaseOrderWithDetails) => void;
  onEdit?: (po: PurchaseOrderWithDetails) => void;
  canEdit?: boolean;
  isAdmin?: boolean;
  contextBanner?: React.ReactNode;
}

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
  partial_delivered: "Partially Delivered",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export default function PODetailsDrawer({
  open,
  onClose,
  purchaseOrder,
  onRecordDelivery,
  onEdit,
  canEdit = false,
  isAdmin = false,
  contextBanner,
}: PODetailsDrawerProps) {
  const isMobile = useIsMobile();

  // Fetch full PO details
  const { data: fullPO } = usePurchaseOrder(purchaseOrder?.id);
  const { data: deliveries = [] } = useDeliveries(
    purchaseOrder?.site_id,
    purchaseOrder?.id
  );

  const po = fullPO || purchaseOrder;

  // Calculate fulfillment progress - separate piece count and kg weight
  // Must be before the early return to maintain consistent hook order
  const fulfillmentStats = useMemo(() => {
    if (!po?.items || po.items.length === 0) {
      return { totalOrdered: 0, totalReceived: 0, percent: 0, unit: 'pcs' };
    }

    let totalOrderedPcs = 0;
    let totalReceivedPcs = 0;
    let totalOrderedKg = 0;
    let totalReceivedKg = 0;
    let hasPerKgItems = false;
    let allPerKg = true;

    po.items.forEach((item) => {
      totalOrderedPcs += item.quantity;
      totalReceivedPcs += item.received_qty || 0;

      if (item.pricing_mode === 'per_kg') {
        hasPerKgItems = true;
        const weight = item.actual_weight ?? item.calculated_weight ?? 0;
        const weightPerPiece = item.quantity > 0 ? weight / item.quantity : 0;
        totalOrderedKg += weight;
        totalReceivedKg += (item.received_qty || 0) * weightPerPiece;
      } else {
        allPerKg = false;
      }
    });

    // If all items are per_kg, show kg; otherwise show pieces
    const useKg = hasPerKgItems && allPerKg;
    const ordered = useKg ? totalOrderedKg : totalOrderedPcs;
    const received = useKg ? totalReceivedKg : totalReceivedPcs;
    const percent = ordered > 0 ? (received / ordered) * 100 : 0;

    return {
      totalOrdered: useKg ? ordered.toFixed(1) : ordered,
      totalReceived: useKg ? received.toFixed(1) : received,
      percent,
      unit: useKg ? 'kg' : 'items',
    };
  }, [po?.items]);

  const fulfillmentPercent = fulfillmentStats.percent;

  if (!po) return null;

  const canRecordDelivery = ["ordered", "partial_delivered"].includes(po.status);
  const canEditPO = po.status === "draft" && canEdit;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: { xs: "100%", sm: "65%", md: "50%", lg: "40%" },
          maxWidth: 700,
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          p: 2,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Box>
          <Typography variant="h6">{po.po_number}</Typography>
          <Chip
            label={STATUS_LABELS[po.status]}
            color={STATUS_COLORS[po.status]}
            size="small"
            sx={{ mt: 0.5 }}
          />
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Content */}
      <Box sx={{ p: 2, overflow: "auto", flex: 1 }}>
        {/* Context Banner (e.g., cross-site batch info) */}
        {contextBanner}

        {/* Vendor Info */}
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Vendor
          </Typography>
          <Typography variant="body1" fontWeight={500}>
            {po.vendor?.name}
          </Typography>
          {po.vendor?.contact_person && (
            <Typography variant="body2" color="text.secondary">
              {po.vendor.contact_person}
            </Typography>
          )}
          <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
            {po.vendor?.phone && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <PhoneIcon fontSize="small" color="action" />
                <Typography variant="body2">{po.vendor.phone}</Typography>
              </Box>
            )}
            {po.vendor?.email && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <EmailIcon fontSize="small" color="action" />
                <Typography variant="body2">{po.vendor.email}</Typography>
              </Box>
            )}
          </Stack>
        </Paper>

        {/* Source Request - if this PO was converted from a material request */}
        {po.source_request && (
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              mb: 2,
              bgcolor: "info.50",
              borderColor: "info.200",
              cursor: "pointer",
              "&:hover": { bgcolor: "info.100" },
            }}
            onClick={() => window.open(`/site/material-requests?request=${(po.source_request as SourceRequestInfo).id}`, "_blank")}
          >
            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5 }}>
              <AssignmentIcon color="info" sx={{ mt: 0.5 }} />
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle2" color="info.main" gutterBottom>
                  Converted from Material Request
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                  <Typography variant="body2" fontWeight={500}>
                    {(po.source_request as SourceRequestInfo).request_number}
                  </Typography>
                  <Chip
                    label={PRIORITY_LABELS[(po.source_request as SourceRequestInfo).priority]}
                    size="small"
                    color={PRIORITY_COLORS[(po.source_request as SourceRequestInfo).priority]}
                  />
                  <Chip
                    label={REQUEST_STATUS_LABELS[(po.source_request as SourceRequestInfo).status]}
                    size="small"
                    variant="outlined"
                  />
                </Box>
                {(po.source_request as SourceRequestInfo).required_by_date && (
                  <Typography variant="caption" color="text.secondary">
                    Required by: {formatDate((po.source_request as SourceRequestInfo).required_by_date!)}
                  </Typography>
                )}
              </Box>
            </Box>
          </Paper>
        )}

        {/* Order Details */}
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid size={6}>
            <Typography variant="caption" color="text.secondary">
              Order Date
            </Typography>
            <Typography variant="body2">{formatDate(po.order_date)}</Typography>
          </Grid>
          <Grid size={6}>
            <Typography variant="caption" color="text.secondary">
              Expected Delivery
            </Typography>
            <Typography variant="body2">
              {po.expected_delivery_date
                ? formatDate(po.expected_delivery_date)
                : "-"}
            </Typography>
          </Grid>
          {po.payment_terms && (
            <Grid size={6}>
              <Typography variant="caption" color="text.secondary">
                Payment Terms
              </Typography>
              <Typography variant="body2">{po.payment_terms}</Typography>
            </Grid>
          )}
          {po.delivery_address && (
            <Grid size={12}>
              <Typography variant="caption" color="text.secondary">
                Delivery Address
              </Typography>
              <Typography variant="body2">{po.delivery_address}</Typography>
            </Grid>
          )}
        </Grid>

        {/* Fulfillment Progress */}
        {po.status !== "draft" && po.status !== "cancelled" && (
          <Box sx={{ mb: 2 }}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: 0.5,
              }}
            >
              <Typography variant="caption" color="text.secondary">
                Fulfillment Progress
              </Typography>
              <Typography variant="caption">
                {fulfillmentStats.totalReceived} / {fulfillmentStats.totalOrdered} {fulfillmentStats.unit} ({fulfillmentPercent.toFixed(0)}%)
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={fulfillmentPercent}
              color={fulfillmentPercent === 100 ? "success" : "primary"}
              sx={{ height: 8, borderRadius: 1 }}
            />
          </Box>
        )}

        {/* Items Table */}
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Order Items
        </Typography>
        <Paper variant="outlined" sx={{ mb: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Material</TableCell>
                <TableCell align="right">Qty</TableCell>
                <TableCell align="right">Rate</TableCell>
                <TableCell align="right">Amount</TableCell>
                {po.status !== "draft" && (
                  <TableCell align="right">Received</TableCell>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {po.items?.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Typography variant="body2">{item.material?.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {item.material?.code} • {item.material?.unit}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    {item.quantity} pcs
                    {item.pricing_mode === 'per_kg' && (item.actual_weight ?? item.calculated_weight) && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        {((item.actual_weight ?? item.calculated_weight) || 0).toFixed(1)} kg
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {formatCurrency(item.unit_price)}/{item.pricing_mode === 'per_kg' ? 'kg' : item.material?.unit}
                  </TableCell>
                  <TableCell align="right">
                    {formatCurrency(item.total_amount)}
                  </TableCell>
                  {po.status !== "draft" && (
                    <TableCell align="right">
                      <Chip
                        label={item.received_qty}
                        size="small"
                        color={
                          item.received_qty >= item.quantity
                            ? "success"
                            : item.received_qty > 0
                            ? "warning"
                            : "default"
                        }
                        variant={item.received_qty > 0 ? "filled" : "outlined"}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>

        {/* Totals */}
        <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
          <Box sx={{ minWidth: 180 }}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                mb: 0.5,
              }}
            >
              <Typography variant="body2">Subtotal:</Typography>
              <Typography variant="body2">
                {formatCurrency(po.subtotal || 0)}
              </Typography>
            </Box>
            {(po.tax_amount || 0) > 0 && (
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  mb: 0.5,
                }}
              >
                <Typography variant="body2">Tax:</Typography>
                <Typography variant="body2">
                  {formatCurrency(po.tax_amount || 0)}
                </Typography>
              </Box>
            )}
            {(po.discount_amount || 0) > 0 && (
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  mb: 0.5,
                }}
              >
                <Typography variant="body2">Discount:</Typography>
                <Typography variant="body2" color="success.main">
                  -{formatCurrency(po.discount_amount || 0)}
                </Typography>
              </Box>
            )}
            <Divider sx={{ my: 0.5 }} />
            <Box sx={{ display: "flex", justifyContent: "space-between" }}>
              <Typography variant="subtitle1" fontWeight={600}>
                Total:
              </Typography>
              <Typography variant="subtitle1" fontWeight={600}>
                {formatCurrency(po.total_amount || 0)}
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* Deliveries */}
        {deliveries.length > 0 && (
          <>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Delivery History
            </Typography>
            <Paper variant="outlined" sx={{ mb: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>GRN</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell>Challan</TableCell>
                    <TableCell align="right">Items</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {deliveries.map((delivery) => (
                    <TableRow key={delivery.id}>
                      <TableCell>
                        <Typography variant="body2" fontWeight={500}>
                          {delivery.grn_number}
                        </Typography>
                        <Chip
                          label={delivery.delivery_status}
                          size="small"
                          color={
                            delivery.delivery_status === "delivered"
                              ? "success"
                              : "default"
                          }
                          sx={{ mt: 0.5 }}
                        />
                      </TableCell>
                      <TableCell>{formatDate(delivery.delivery_date)}</TableCell>
                      <TableCell>{delivery.challan_number || "-"}</TableCell>
                      <TableCell align="right">
                        {delivery.items?.length || 0}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          </>
        )}

        {/* Notes */}
        {po.notes && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              Notes
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {po.notes}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Actions */}
      <Box
        sx={{
          p: 2,
          borderTop: 1,
          borderColor: "divider",
          display: "flex",
          gap: 1,
          justifyContent: "flex-end",
        }}
      >
        {canEditPO && onEdit && (
          <Button
            variant="outlined"
            startIcon={<EditIcon />}
            onClick={() => {
              onClose();
              onEdit(po);
            }}
          >
            Edit
          </Button>
        )}
        {canRecordDelivery && canEdit && onRecordDelivery && (
          <Button
            variant="contained"
            startIcon={<DeliveryIcon />}
            onClick={() => {
              onClose();
              onRecordDelivery(po);
            }}
          >
            Record Delivery
          </Button>
        )}
      </Box>
    </Drawer>
  );
}
