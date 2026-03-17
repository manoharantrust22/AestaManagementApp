"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  IconButton,
  Alert,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Paper,
  Chip,
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useAuth } from "@/contexts/AuthContext";
import { useApproveMaterialRequest } from "@/hooks/queries/useMaterialRequests";
import type { MaterialRequestWithDetails, RequestPriority } from "@/types/material.types";
import { formatDate } from "@/lib/formatters";

interface RequestApprovalDialogProps {
  open: boolean;
  onClose: () => void;
  request: MaterialRequestWithDetails | null;
}

interface ApprovalItem {
  itemId: string;
  materialName: string;
  unit: string;
  requested_qty: number;
  approved_qty: number;
}

const PRIORITY_COLORS: Record<RequestPriority, "default" | "info" | "warning" | "error"> = {
  low: "default",
  normal: "info",
  high: "warning",
  urgent: "error",
};

export default function RequestApprovalDialog({
  open,
  onClose,
  request,
}: RequestApprovalDialogProps) {
  const isMobile = useIsMobile();
  const { userProfile } = useAuth();

  const approveRequest = useApproveMaterialRequest();

  const [error, setError] = useState("");
  const [items, setItems] = useState<ApprovalItem[]>([]);

  // Reset form when request changes
  useEffect(() => {
    if (request?.items) {
      const approvalItems: ApprovalItem[] = request.items.map((item) => ({
        itemId: item.id,
        materialName: item.material?.name || "",
        unit: item.material?.unit || "",
        requested_qty: item.requested_qty,
        approved_qty: item.requested_qty, // Default to requested amount
      }));
      setItems(approvalItems);
    } else {
      setItems([]);
    }
    setError("");
  }, [request, open]);

  const handleQtyChange = (index: number, value: number) => {
    setItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, approved_qty: value } : item
      )
    );
  };

  const handleApprove = async () => {
    if (!request || !userProfile?.id) return;

    // Validate quantities
    const invalidItem = items.find(
      (item) => item.approved_qty < 0 || item.approved_qty > item.requested_qty
    );
    if (invalidItem) {
      setError(
        `Invalid quantity for ${invalidItem.materialName}. Must be between 0 and ${invalidItem.requested_qty}`
      );
      return;
    }

    try {
      await approveRequest.mutateAsync({
        id: request.id,
        userId: userProfile.id,
        approvedItems: items.map((item) => ({
          itemId: item.itemId,
          approved_qty: item.approved_qty,
        })),
        siteId: request.site_id, // Added for optimistic update
      });
      onClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to approve request";
      setError(message);
    }
  };

  const isSubmitting = approveRequest.isPending;

  if (!request) return null;

  return (
    <Dialog
      open={open}
      onClose={(_event, reason) => { if (reason !== "backdropClick") onClose(); }}
      maxWidth="md"
      fullWidth
      fullScreen={isMobile}
    >
      <DialogTitle
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Box>
          <Typography variant="h6" component="span">Approve Request</Typography>
          <Typography variant="body2" color="text.secondary">
            {request.request_number}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Request Info */}
        <Box sx={{ mb: 2, display: "flex", gap: 2, flexWrap: "wrap" }}>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Request Date
            </Typography>
            <Typography variant="body2">
              {formatDate(request.request_date)}
            </Typography>
          </Box>
          {request.required_by_date && (
            <Box>
              <Typography variant="caption" color="text.secondary">
                Required By
              </Typography>
              <Typography variant="body2">
                {formatDate(request.required_by_date)}
              </Typography>
            </Box>
          )}
          <Box>
            <Typography variant="caption" color="text.secondary">
              Priority
            </Typography>
            <Box>
              <Chip
                label={request.priority}
                color={PRIORITY_COLORS[request.priority]}
                size="small"
              />
            </Box>
          </Box>
          {request.section?.name && (
            <Box>
              <Typography variant="caption" color="text.secondary">
                Section
              </Typography>
              <Typography variant="body2">{request.section.name}</Typography>
            </Box>
          )}
        </Box>

        {request.notes && (
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="body2">{request.notes}</Typography>
          </Alert>
        )}

        {/* Items Table */}
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Review Items
        </Typography>
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Material</TableCell>
                <TableCell align="right">Requested</TableCell>
                <TableCell align="right" sx={{ width: 120 }}>
                  Approve Qty
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item, index) => (
                <TableRow key={item.itemId}>
                  <TableCell>
                    <Typography variant="body2">{item.materialName}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {item.unit}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">{item.requested_qty}</TableCell>
                  <TableCell align="right">
                    <TextField
                      size="small"
                      type="number"
                      value={item.approved_qty}
                      onChange={(e) =>
                        handleQtyChange(index, parseFloat(e.target.value) || 0)
                      }
                      slotProps={{
                        input: {
                          inputProps: {
                            min: 0,
                            max: item.requested_qty,
                            step: 0.01,
                          },
                        },
                      }}
                      sx={{ width: 100 }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>

        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
          Adjust quantities if needed. Setting to 0 will exclude the item from approval.
        </Typography>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="success"
          onClick={handleApprove}
          disabled={isSubmitting || items.every((i) => i.approved_qty === 0)}
        >
          {isSubmitting ? "Approving..." : "Approve Request"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
