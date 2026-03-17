"use client";

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
  Alert,
} from "@mui/material";
import {
  Close as CloseIcon,
  Edit as EditIcon,
  CheckCircle as ApproveIcon,
  ShoppingCart as ShoppingCartIcon,
  OpenInNew as OpenInNewIcon,
} from "@mui/icons-material";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useMaterialRequest, useRequestLinkedPOs } from "@/hooks/queries/useMaterialRequests";
import { formatCurrency } from "@/lib/formatters";
import { PO_STATUS_LABELS } from "@/types/material.types";
import type {
  MaterialRequestWithDetails,
  MaterialRequestStatus,
  RequestPriority,
} from "@/types/material.types";
import { formatDate } from "@/lib/formatters";

interface RequestDetailsDrawerProps {
  open: boolean;
  onClose: () => void;
  request: MaterialRequestWithDetails | null;
  onEdit?: (request: MaterialRequestWithDetails) => void;
  onApprove?: (request: MaterialRequestWithDetails) => void;
  onConvertToPO?: (request: MaterialRequestWithDetails) => void;
  canEdit?: boolean;
  isAdmin?: boolean;
}

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
  pending: "Pending Approval",
  approved: "Approved",
  rejected: "Rejected",
  ordered: "Ordered",
  partial_fulfilled: "Partially Fulfilled",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
};

const PRIORITY_COLORS: Record<RequestPriority, "default" | "info" | "warning" | "error"> = {
  low: "default",
  normal: "info",
  high: "warning",
  urgent: "error",
};

export default function RequestDetailsDrawer({
  open,
  onClose,
  request,
  onEdit,
  onApprove,
  onConvertToPO,
  canEdit = false,
  isAdmin = false,
}: RequestDetailsDrawerProps) {
  const isMobile = useIsMobile();

  // Fetch full request details
  const { data: fullRequest } = useMaterialRequest(request?.id);
  const req = fullRequest || request;

  // Fetch linked purchase orders
  const { data: linkedPOs = [] } = useRequestLinkedPOs(request?.id);

  if (!req) return null;

  // Calculate fulfillment progress
  const totalRequested = req.items?.reduce((sum, item) => sum + item.requested_qty, 0) || 0;
  const totalApproved = req.items?.reduce((sum, item) => sum + (item.approved_qty || 0), 0) || 0;
  const totalFulfilled = req.items?.reduce((sum, item) => sum + item.fulfilled_qty, 0) || 0;
  const fulfillmentPercent = totalApproved > 0 ? (totalFulfilled / totalApproved) * 100 : 0;

  const canEditRequest = ["draft", "pending"].includes(req.status) && canEdit;
  const canApproveRequest = req.status === "pending" && isAdmin;
  const canConvertToPO = ["approved", "ordered", "partial_fulfilled"].includes(req.status) && isAdmin;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={(_event, reason) => { if (reason !== "backdropClick") onClose(); }}
      PaperProps={{
        sx: {
          width: { xs: "100%", sm: "65%", md: "50%", lg: "40%" },
          maxWidth: 600,
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
          <Typography variant="h6">{req.request_number}</Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
            <Chip
              label={STATUS_LABELS[req.status]}
              color={STATUS_COLORS[req.status]}
              size="small"
            />
            <Chip
              label={req.priority}
              color={PRIORITY_COLORS[req.priority]}
              size="small"
              variant="outlined"
            />
          </Stack>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Content */}
      <Box sx={{ p: 2, overflow: "auto", flex: 1 }}>
        {/* Request Info */}
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid size={6}>
            <Typography variant="caption" color="text.secondary">
              Request Date
            </Typography>
            <Typography variant="body2">{formatDate(req.request_date)}</Typography>
          </Grid>
          <Grid size={6}>
            <Typography variant="caption" color="text.secondary">
              Required By
            </Typography>
            <Typography variant="body2">
              {req.required_by_date ? formatDate(req.required_by_date) : "-"}
            </Typography>
          </Grid>
          {req.section?.name && (
            <Grid size={6}>
              <Typography variant="caption" color="text.secondary">
                Section
              </Typography>
              <Typography variant="body2">{req.section.name}</Typography>
            </Grid>
          )}
          {req.approved_at && (
            <Grid size={6}>
              <Typography variant="caption" color="text.secondary">
                {req.status === "rejected" ? "Rejected On" : "Approved On"}
              </Typography>
              <Typography variant="body2">{formatDate(req.approved_at)}</Typography>
            </Grid>
          )}
        </Grid>

        {/* Rejection Reason */}
        {req.status === "rejected" && req.rejection_reason && (
          <Alert severity="error" sx={{ mb: 2 }}>
            <Typography variant="body2">
              <strong>Rejection Reason:</strong> {req.rejection_reason}
            </Typography>
          </Alert>
        )}

        {/* Notes */}
        {req.notes && (
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="body2">{req.notes}</Typography>
          </Alert>
        )}

        {/* Fulfillment Progress */}
        {["approved", "ordered", "partial_fulfilled", "fulfilled"].includes(req.status) && (
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
                {totalFulfilled.toFixed(1)} / {totalApproved.toFixed(1)} (
                {fulfillmentPercent.toFixed(0)}%)
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
          Requested Items
        </Typography>
        <Paper variant="outlined" sx={{ mb: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Material</TableCell>
                <TableCell align="right">Requested</TableCell>
                {req.status !== "pending" && req.status !== "draft" && (
                  <>
                    <TableCell align="right">Approved</TableCell>
                    <TableCell align="right">Fulfilled</TableCell>
                  </>
                )}
              </TableRow>
            </TableHead>
            <TableBody>
              {req.items?.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Typography variant="body2">{item.material?.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {item.material?.code} • {item.material?.unit}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">{item.requested_qty}</TableCell>
                  {req.status !== "pending" && req.status !== "draft" && (
                    <>
                      <TableCell align="right">
                        {item.approved_qty !== null ? item.approved_qty : "-"}
                      </TableCell>
                      <TableCell align="right">
                        <Chip
                          label={item.fulfilled_qty}
                          size="small"
                          color={
                            item.fulfilled_qty >= (item.approved_qty || item.requested_qty)
                              ? "success"
                              : item.fulfilled_qty > 0
                              ? "warning"
                              : "default"
                          }
                          variant={item.fulfilled_qty > 0 ? "filled" : "outlined"}
                        />
                      </TableCell>
                    </>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>

        {/* Linked Purchase Orders */}
        {linkedPOs.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Linked Purchase Orders
            </Typography>
            {linkedPOs.map((po) => (
              <Paper
                key={po.id}
                variant="outlined"
                sx={{ p: 1.5, mb: 1, cursor: "pointer", "&:hover": { bgcolor: "action.hover" } }}
                onClick={() => window.open(`/site/purchase-orders?po=${po.id}`, "_blank")}
              >
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <Box>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Typography variant="body2" fontWeight={500} color="primary">
                        {po.po_number}
                      </Typography>
                      <Chip
                        label={PO_STATUS_LABELS[po.status] || po.status}
                        size="small"
                        color={po.status === "delivered" ? "success" : po.status === "cancelled" ? "error" : "info"}
                      />
                    </Box>
                    <Typography variant="caption" color="text.secondary">
                      {po.vendor_name} • {po.item_count} item{po.item_count !== 1 ? "s" : ""}
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: "right" }}>
                    <Typography variant="body2" fontWeight={500}>
                      {po.total_amount ? formatCurrency(po.total_amount) : "-"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatDate(po.order_date)}
                    </Typography>
                  </Box>
                </Box>
              </Paper>
            ))}
          </Box>
        )}

        {/* Convert to PO Section */}
        {canConvertToPO && onConvertToPO && linkedPOs.length === 0 && (
          <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: "primary.50", borderColor: "primary.200" }}>
            <Typography variant="subtitle2" gutterBottom color="primary">
              Ready to Order
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              This request has been approved. You can now create a purchase order.
            </Typography>
            <Button
              variant="contained"
              size="small"
              startIcon={<ShoppingCartIcon />}
              onClick={() => {
                onClose();
                onConvertToPO(req);
              }}
            >
              Convert to Purchase Order
            </Button>
          </Paper>
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
          flexWrap: "wrap",
        }}
      >
        {canEditRequest && onEdit && (
          <Button
            variant="outlined"
            startIcon={<EditIcon />}
            onClick={() => {
              onClose();
              onEdit(req);
            }}
          >
            Edit
          </Button>
        )}
        {canApproveRequest && onApprove && (
          <Button
            variant="contained"
            color="success"
            startIcon={<ApproveIcon />}
            onClick={() => {
              onClose();
              onApprove(req);
            }}
          >
            Approve
          </Button>
        )}
        {canConvertToPO && onConvertToPO && linkedPOs.length > 0 && (
          <Button
            variant="outlined"
            color="primary"
            startIcon={<ShoppingCartIcon />}
            onClick={() => {
              onClose();
              onConvertToPO(req);
            }}
          >
            Add More to PO
          </Button>
        )}
      </Box>
    </Drawer>
  );
}
