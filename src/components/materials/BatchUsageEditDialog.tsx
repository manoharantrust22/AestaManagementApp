"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  TextField,
  Alert,
  CircularProgress,
  Chip,
} from "@mui/material";
import {
  Edit as EditIcon,
  Block as BlockIcon,
} from "@mui/icons-material";
import { formatCurrency, formatDate } from "@/lib/formatters";
import type { BatchUsageRecordWithDetails } from "@/types/material.types";
import {
  BATCH_USAGE_SETTLEMENT_STATUS_LABELS,
  BATCH_USAGE_SETTLEMENT_STATUS_COLORS,
} from "@/types/material.types";

interface BatchUsageEditDialogProps {
  open: boolean;
  record: BatchUsageRecordWithDetails | null;
  onClose: () => void;
  onSave: (data: { quantity?: number; work_description?: string }) => void;
  isSaving: boolean;
}

export default function BatchUsageEditDialog({
  open,
  record,
  onClose,
  onSave,
  isSaving,
}: BatchUsageEditDialogProps) {
  const [quantity, setQuantity] = useState<number>(0);
  const [workDescription, setWorkDescription] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && record) {
      setQuantity(Number(record.quantity));
      setWorkDescription(record.work_description || "");
      setError(null);
    }
  }, [open, record]);

  if (!record) return null;

  const materialName = record.material?.name || "Unknown Material";
  const brandName = record.brand?.brand_name;
  const unit = record.unit || record.material?.unit || "nos";
  const unitCost = Number(record.unit_cost) || 0;
  const isSettled = record.settlement_status === "settled";

  const originalQuantity = Number(record.quantity);
  const quantityDelta = quantity - originalQuantity;

  const validateQuantity = () => {
    if (quantity <= 0) return "Quantity must be greater than 0";
    return null;
  };

  const validationError = validateQuantity();
  const hasChanges =
    quantity !== originalQuantity ||
    workDescription !== (record.work_description || "");

  const handleSave = () => {
    const err = validateQuantity();
    if (err) {
      setError(err);
      return;
    }
    onSave({
      quantity: quantity !== originalQuantity ? quantity : undefined,
      work_description: workDescription,
    });
  };

  const newTotalCost = quantity * unitCost;

  return (
    <Dialog
      open={open}
      onClose={(_event, reason) => { if (reason !== "backdropClick" && !isSaving) onClose(); }}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderTop: 4,
          borderColor: isSettled ? "warning.main" : "primary.main",
        },
      }}
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        {isSettled ? (
          <BlockIcon color="warning" />
        ) : (
          <EditIcon color="primary" />
        )}
        <Typography variant="h6" component="span">
          {isSettled ? "Cannot Edit Usage Record" : "Edit Batch Usage Record"}
        </Typography>
      </DialogTitle>

      <DialogContent>
        {/* Record Info (Read-only) */}
        <Box sx={{ p: 2, bgcolor: "action.hover", borderRadius: 1, mb: 2 }}>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Material
              </Typography>
              <Typography variant="body2" fontWeight={500}>
                {materialName}
              </Typography>
              {brandName && (
                <Typography variant="caption" color="text.secondary">
                  {brandName}
                </Typography>
              )}
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Batch
              </Typography>
              <Typography
                variant="body2"
                sx={{ fontFamily: "monospace", fontSize: "0.8rem" }}
              >
                {record.batch_ref_code}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Date
              </Typography>
              <Typography variant="body2">
                {formatDate(record.usage_date)}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Used By
              </Typography>
              <Typography variant="body2">
                {record.usage_site?.name || "Unknown"}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Current Quantity
              </Typography>
              <Typography variant="body2">
                {originalQuantity} {unit}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Status
              </Typography>
              <Chip
                label={
                  BATCH_USAGE_SETTLEMENT_STATUS_LABELS[
                    record.settlement_status as keyof typeof BATCH_USAGE_SETTLEMENT_STATUS_LABELS
                  ] || record.settlement_status
                }
                size="small"
                color={
                  BATCH_USAGE_SETTLEMENT_STATUS_COLORS[
                    record.settlement_status as keyof typeof BATCH_USAGE_SETTLEMENT_STATUS_COLORS
                  ] || "default"
                }
                sx={{ mt: 0.5 }}
              />
            </Box>
          </Box>
        </Box>

        {isSettled ? (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="body2" fontWeight={500}>
              This usage is part of a completed settlement and cannot be
              modified.
            </Typography>
            <Typography variant="caption" sx={{ mt: 1, display: "block" }}>
              To make changes, the settlement must first be reversed.
            </Typography>
          </Alert>
        ) : (
          <>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <TextField
                label={`Quantity (${unit})`}
                type="number"
                value={quantity}
                onChange={(e) => {
                  setQuantity(Number(e.target.value));
                  setError(null);
                }}
                error={!!validationError}
                helperText={
                  validationError || `Original: ${originalQuantity} ${unit}`
                }
                fullWidth
                inputProps={{ min: 0.001, step: 0.001 }}
              />

              <TextField
                label="Work Description"
                value={workDescription}
                onChange={(e) => setWorkDescription(e.target.value)}
                fullWidth
                multiline
                rows={2}
                placeholder="e.g., foundation, plastering, etc."
              />
            </Box>

            {hasChanges && (
              <Box sx={{ mt: 2, p: 2, bgcolor: "info.50", borderRadius: 1 }}>
                <Typography
                  variant="subtitle2"
                  fontWeight={600}
                  sx={{ mb: 1 }}
                >
                  Changes:
                </Typography>
                {quantity !== originalQuantity && (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      mb: 0.5,
                    }}
                  >
                    <Typography variant="body2">Quantity:</Typography>
                    <Chip
                      label={`${originalQuantity} → ${quantity} ${unit}`}
                      size="small"
                      color={quantityDelta > 0 ? "error" : "success"}
                    />
                    {quantityDelta !== 0 && (
                      <Typography
                        variant="caption"
                        color={
                          quantityDelta > 0 ? "error.main" : "success.main"
                        }
                      >
                        ({quantityDelta > 0 ? "+" : ""}
                        {quantityDelta} {unit})
                      </Typography>
                    )}
                  </Box>
                )}
                {quantity !== originalQuantity && (
                  <Box
                    sx={{ display: "flex", alignItems: "center", gap: 1 }}
                  >
                    <Typography variant="body2">New Total Cost:</Typography>
                    <Typography variant="body2" fontWeight={600}>
                      {formatCurrency(newTotalCost)}
                    </Typography>
                    {newTotalCost !== Number(record.total_cost) && (
                      <Typography variant="caption" color="text.secondary">
                        (was {formatCurrency(Number(record.total_cost) || 0)})
                      </Typography>
                    )}
                  </Box>
                )}
              </Box>
            )}
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={isSaving}>
          {isSettled ? "Close" : "Cancel"}
        </Button>
        {!isSettled && (
          <Button
            variant="contained"
            color="primary"
            onClick={handleSave}
            disabled={isSaving || !hasChanges || !!validationError}
            startIcon={
              isSaving ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <EditIcon />
              )
            }
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
