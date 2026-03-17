"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  Box,
  Typography,
  IconButton,
  Alert,
  MenuItem,
  Chip,
  LinearProgress,
  Paper,
  Divider,
} from "@mui/material";
import {
  Close as CloseIcon,
  Inventory as BatchIcon,
  Store as SiteIcon,
} from "@mui/icons-material";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useSiteGroupMembership } from "@/hooks/queries/useSiteGroups";
import { useGroupMaterialPurchases } from "@/hooks/queries/useMaterialPurchases";
import { useRecordBatchUsage, useBatchSettlementSummary } from "@/hooks/queries/useBatchUsage";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/formatters";
import type { MaterialPurchaseExpenseWithDetails } from "@/types/material.types";

interface RecordBatchUsageDialogProps {
  open: boolean;
  onClose: () => void;
  siteId: string;
  preselectedBatchRefCode?: string;
}

export default function RecordBatchUsageDialog({
  open,
  onClose,
  siteId,
  preselectedBatchRefCode,
}: RecordBatchUsageDialogProps) {
  const isMobile = useIsMobile();
  const { user } = useAuth();

  // Hooks
  const { data: groupMembership } = useSiteGroupMembership(siteId);
  const { data: batches = [] } = useGroupMaterialPurchases(groupMembership?.groupId, {
    status: undefined, // Get all statuses except completed
  });

  const recordUsage = useRecordBatchUsage();

  // Form state
  const [selectedBatchRefCode, setSelectedBatchRefCode] = useState<string>("");
  const [usageSiteId, setUsageSiteId] = useState<string>(siteId);
  const [quantity, setQuantity] = useState<string>("");
  const [usageDate, setUsageDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [workDescription, setWorkDescription] = useState<string>("");
  const [error, setError] = useState<string>("");

  // Get batch settlement summary for selected batch
  const { data: batchSummary } = useBatchSettlementSummary(selectedBatchRefCode || undefined);

  // Filter out completed batches
  const activeBatches = useMemo(() => {
    return batches.filter(
      (b) => b.status !== "completed" && b.status !== "converted"
    );
  }, [batches]);

  // Get selected batch details
  const selectedBatch = useMemo(() => {
    return activeBatches.find((b) => b.ref_code === selectedBatchRefCode);
  }, [activeBatches, selectedBatchRefCode]);

  // Calculate unit cost and remaining quantity
  const batchInfo = useMemo(() => {
    if (!selectedBatch) return null;

    const items = selectedBatch.items || [];
    const totalQty = items.reduce((sum, item) => sum + Number(item.quantity), 0);
    const totalAmount = Number(selectedBatch.total_amount) || 0;
    const unitCost = totalQty > 0 ? totalAmount / totalQty : 0;

    // Use summary data if available, otherwise calculate from batch
    const originalQty = batchSummary?.original_qty || selectedBatch.original_qty || totalQty;
    const usedQty = batchSummary?.used_qty || selectedBatch.used_qty || 0;
    const remainingQty = batchSummary?.remaining_qty || selectedBatch.remaining_qty || (originalQty - usedQty);

    const material = items[0]?.material;
    const brand = items[0]?.brand;

    return {
      materialName: material?.name || "Unknown Material",
      brandName: brand?.brand_name,
      unit: material?.unit || "nos",
      unitCost,
      totalAmount,
      originalQty,
      usedQty,
      remainingQty,
      usagePercent: originalQty > 0 ? (usedQty / originalQty) * 100 : 0,
    };
  }, [selectedBatch, batchSummary]);

  // Set preselected batch on mount
  useEffect(() => {
    if (preselectedBatchRefCode && open) {
      setSelectedBatchRefCode(preselectedBatchRefCode);
    }
  }, [preselectedBatchRefCode, open]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedBatchRefCode(preselectedBatchRefCode || "");
      setUsageSiteId(siteId);
      setQuantity("");
      setUsageDate(new Date().toISOString().split("T")[0]);
      setWorkDescription("");
      setError("");
    }
  }, [open, siteId, preselectedBatchRefCode]);

  // Handle submit
  const handleSubmit = async () => {
    setError("");

    // Validation
    if (!selectedBatchRefCode) {
      setError("Please select a batch");
      return;
    }
    if (!usageSiteId) {
      setError("Please select which site used the material");
      return;
    }
    if (!quantity || parseFloat(quantity) <= 0) {
      setError("Please enter a valid quantity");
      return;
    }
    if (!usageDate) {
      setError("Please select a usage date");
      return;
    }

    const qty = parseFloat(quantity);

    // Check remaining quantity
    if (batchInfo && qty > batchInfo.remainingQty) {
      setError(
        `Insufficient quantity. Available: ${batchInfo.remainingQty} ${batchInfo.unit}`
      );
      return;
    }

    try {
      await recordUsage.mutateAsync({
        batch_ref_code: selectedBatchRefCode,
        usage_site_id: usageSiteId,
        quantity: qty,
        usage_date: usageDate,
        work_description: workDescription || undefined,
        created_by: user?.id,
      });

      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to record usage");
    }
  };

  // Determine if this is self-use
  const isSelfUse = useMemo(() => {
    if (!selectedBatch) return false;
    return usageSiteId === selectedBatch.paying_site_id;
  }, [selectedBatch, usageSiteId]);

  // Calculate estimated cost
  const estimatedCost = useMemo(() => {
    if (!batchInfo || !quantity) return 0;
    return parseFloat(quantity) * batchInfo.unitCost;
  }, [batchInfo, quantity]);

  return (
    <Dialog
      open={open}
      onClose={(_event, reason) => { if (reason !== "backdropClick") onClose(); }}
      maxWidth="sm"
      fullWidth
      fullScreen={isMobile}
    >
      <DialogTitle>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <BatchIcon color="primary" />
          <Typography variant="h6" component="span">Record Batch Usage</Typography>
        </Box>
        <IconButton
          onClick={onClose}
          sx={{ position: "absolute", right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Grid container spacing={2}>
          {/* Error Alert */}
          {error && (
            <Grid size={12}>
              <Alert severity="error" onClose={() => setError("")}>
                {error}
              </Alert>
            </Grid>
          )}

          {/* Batch Selection */}
          <Grid size={12}>
            <TextField
              select
              fullWidth
              label="Select Batch"
              value={selectedBatchRefCode}
              onChange={(e) => setSelectedBatchRefCode(e.target.value)}
              required
              disabled={!!preselectedBatchRefCode}
            >
              {activeBatches.length === 0 ? (
                <MenuItem disabled>No active batches available</MenuItem>
              ) : (
                activeBatches.map((batch) => {
                  const items = batch.items || [];
                  const material = items[0]?.material;
                  return (
                    <MenuItem key={batch.ref_code} value={batch.ref_code}>
                      <Box>
                        <Typography variant="body2" fontWeight={500}>
                          {batch.ref_code} - {material?.name || "Material"}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatCurrency(batch.total_amount)} | {batch.vendor_name || "Unknown Vendor"}
                        </Typography>
                      </Box>
                    </MenuItem>
                  );
                })
              )}
            </TextField>
          </Grid>

          {/* Batch Info Display */}
          {batchInfo && selectedBatch && (
            <Grid size={12}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "start", mb: 1 }}>
                  <Box>
                    <Typography variant="subtitle2" fontWeight={600}>
                      {batchInfo.materialName}
                    </Typography>
                    {batchInfo.brandName && (
                      <Typography variant="caption" color="text.secondary">
                        {batchInfo.brandName}
                      </Typography>
                    )}
                  </Box>
                  <Chip
                    label={`${formatCurrency(batchInfo.unitCost)}/${batchInfo.unit}`}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                </Box>

                <Divider sx={{ my: 1 }} />

                <Grid container spacing={1}>
                  <Grid size={4}>
                    <Typography variant="caption" color="text.secondary">
                      Original
                    </Typography>
                    <Typography variant="body2" fontWeight={500}>
                      {batchInfo.originalQty} {batchInfo.unit}
                    </Typography>
                  </Grid>
                  <Grid size={4}>
                    <Typography variant="caption" color="text.secondary">
                      Used
                    </Typography>
                    <Typography variant="body2" fontWeight={500} color="warning.main">
                      {batchInfo.usedQty} {batchInfo.unit}
                    </Typography>
                  </Grid>
                  <Grid size={4}>
                    <Typography variant="caption" color="text.secondary">
                      Remaining
                    </Typography>
                    <Typography variant="body2" fontWeight={500} color="success.main">
                      {batchInfo.remainingQty} {batchInfo.unit}
                    </Typography>
                  </Grid>
                </Grid>

                <Box sx={{ mt: 1 }}>
                  <LinearProgress
                    variant="determinate"
                    value={Math.min(batchInfo.usagePercent, 100)}
                    sx={{ height: 6, borderRadius: 1 }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {batchInfo.usagePercent.toFixed(1)}% used
                  </Typography>
                </Box>

                {/* Paying site info */}
                <Box sx={{ mt: 1.5, display: "flex", alignItems: "center", gap: 0.5 }}>
                  <SiteIcon fontSize="small" color="action" />
                  <Typography variant="caption" color="text.secondary">
                    Paid by:
                  </Typography>
                  <Chip
                    label={selectedBatch.paying_site?.name || selectedBatch.site?.name || "Unknown"}
                    size="small"
                    color="success"
                    variant="outlined"
                  />
                </Box>
              </Paper>
            </Grid>
          )}

          {/* Usage Site Selection */}
          <Grid size={12}>
            <TextField
              select
              fullWidth
              label="Which Site Used This Material?"
              value={usageSiteId}
              onChange={(e) => setUsageSiteId(e.target.value)}
              required
            >
              {groupMembership?.allSites?.map((site) => (
                <MenuItem key={site.id} value={site.id}>
                  {site.name}
                  {site.id === siteId && " (Current)"}
                  {selectedBatch && site.id === selectedBatch.paying_site_id && (
                    <Chip
                      label="Payer"
                      size="small"
                      color="success"
                      sx={{ ml: 1, height: 20 }}
                    />
                  )}
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          {/* Self-use indicator */}
          {isSelfUse && (
            <Grid size={12}>
              <Alert severity="info" sx={{ py: 0.5 }}>
                This is <strong>self-use</strong> - no settlement needed since the same site paid for and used the material.
              </Alert>
            </Grid>
          )}

          {/* Quantity */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              label={`Quantity (${batchInfo?.unit || "units"})`}
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
              inputProps={{ min: 0, step: "0.001" }}
              helperText={
                batchInfo
                  ? `Max: ${batchInfo.remainingQty} ${batchInfo.unit}`
                  : undefined
              }
            />
          </Grid>

          {/* Usage Date */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              label="Usage Date"
              type="date"
              value={usageDate}
              onChange={(e) => setUsageDate(e.target.value)}
              required
              InputLabelProps={{ shrink: true }}
            />
          </Grid>

          {/* Estimated Cost Display */}
          {estimatedCost > 0 && (
            <Grid size={12}>
              <Paper
                variant="outlined"
                sx={{
                  p: 1.5,
                  bgcolor: isSelfUse ? "info.50" : "warning.50",
                  borderColor: isSelfUse ? "info.main" : "warning.main",
                }}
              >
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Typography variant="body2" color="text.secondary">
                    Estimated Cost:
                  </Typography>
                  <Typography variant="h6" fontWeight={600} color={isSelfUse ? "info.main" : "warning.main"}>
                    {formatCurrency(estimatedCost)}
                  </Typography>
                </Box>
                {!isSelfUse && (
                  <Typography variant="caption" color="text.secondary">
                    This amount will need to be settled with the paying site.
                  </Typography>
                )}
              </Paper>
            </Grid>
          )}

          {/* Work Description */}
          <Grid size={12}>
            <TextField
              fullWidth
              label="Work Description (Optional)"
              value={workDescription}
              onChange={(e) => setWorkDescription(e.target.value)}
              multiline
              rows={2}
              placeholder="e.g., Foundation work, Brick wall construction"
            />
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={recordUsage.isPending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={recordUsage.isPending || !selectedBatchRefCode || !usageSiteId || !quantity}
        >
          {recordUsage.isPending ? "Recording..." : "Record Usage"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
