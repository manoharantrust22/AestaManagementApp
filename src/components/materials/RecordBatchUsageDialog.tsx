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
import { useRecordBatchUsage, useBatchVariantSummary } from "@/hooks/queries/useBatchUsage";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency } from "@/lib/formatters";
import QuantityWithPercentInput from "@/components/common/QuantityWithPercentInput";
import type { MaterialPurchaseExpenseWithDetails } from "@/types/material.types";

interface RecordBatchUsageDialogProps {
  open: boolean;
  onClose: () => void;
  siteId: string;
  preselectedBatchRefCode?: string;
  preselectedMaterialId?: string;
  preselectedBrandId?: string | null;
}

// Encoded "(batch, variant)" selection key — batch_ref_code::material_id::brand_id
const VARIANT_KEY_SEP = "::";
const NO_BRAND = "";

function makeVariantKey(refCode: string, materialId: string, brandId: string | null | undefined) {
  return [refCode, materialId, brandId ?? NO_BRAND].join(VARIANT_KEY_SEP);
}

function parseVariantKey(key: string): { refCode: string; materialId: string; brandId: string | null } | null {
  if (!key) return null;
  const parts = key.split(VARIANT_KEY_SEP);
  if (parts.length !== 3) return null;
  return {
    refCode: parts[0],
    materialId: parts[1],
    brandId: parts[2] === NO_BRAND ? null : parts[2],
  };
}

export default function RecordBatchUsageDialog({
  open,
  onClose,
  siteId,
  preselectedBatchRefCode,
  preselectedMaterialId,
  preselectedBrandId,
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
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [usageSiteId, setUsageSiteId] = useState<string>(siteId);
  const [quantity, setQuantity] = useState<number>(0);
  const [usageDate, setUsageDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [workDescription, setWorkDescription] = useState<string>("");
  const [error, setError] = useState<string>("");

  // Filter out completed batches
  const activeBatches = useMemo(() => {
    return batches.filter(
      (b) => b.status !== "completed" && b.status !== "converted"
    );
  }, [batches]);

  // Derive the selection (refCode, materialId, brandId) once from the key
  const parsedSelection = useMemo(() => parseVariantKey(selectedKey), [selectedKey]);
  const selectedRefCode = parsedSelection?.refCode ?? "";

  // Get selected batch (whole MAT-xxx record, for paying site etc.)
  const selectedBatch = useMemo(() => {
    if (!selectedRefCode) return null;
    return activeBatches.find((b) => b.ref_code === selectedRefCode);
  }, [activeBatches, selectedRefCode]);

  // Per-variant breakdown (used/remaining scoped to the variant, not the whole batch)
  const { data: variantSummary = [] } = useBatchVariantSummary(selectedRefCode || undefined);

  // Selected variant row from the summary
  const selectedVariant = useMemo(() => {
    if (!parsedSelection || variantSummary.length === 0) return null;
    return (
      variantSummary.find(
        (v) =>
          v.material_id === parsedSelection.materialId &&
          (v.brand_id ?? null) === (parsedSelection.brandId ?? null)
      ) ?? null
    );
  }, [parsedSelection, variantSummary]);

  // Build (batch × variant) options for the dropdown
  const variantOptions = useMemo(() => {
    const options: Array<{
      key: string;
      refCode: string;
      materialId: string;
      brandId: string | null;
      materialName: string;
      brandName: string | null;
      unit: string;
      unitCost: number;
      originalQty: number;
      remainingQty: number;
      vendorName: string | null;
      totalAmount: number;
    }> = [];
    for (const batch of activeBatches) {
      for (const item of batch.items || []) {
        const itemMaterialId = (item as any).material_id ?? item.material?.id;
        const itemBrandId = (item as any).brand_id ?? item.brand?.id ?? null;
        if (!itemMaterialId) continue;
        // Try to pull live remaining from variantSummary when this is the selected batch
        const liveVariant =
          batch.ref_code === selectedRefCode
            ? variantSummary.find(
                (v) => v.material_id === itemMaterialId && (v.brand_id ?? null) === (itemBrandId ?? null)
              )
            : undefined;
        const original = Number(item.quantity);
        const remaining = liveVariant ? liveVariant.remaining_qty : original;
        options.push({
          key: makeVariantKey(batch.ref_code, itemMaterialId, itemBrandId),
          refCode: batch.ref_code,
          materialId: itemMaterialId,
          brandId: itemBrandId,
          materialName: item.material?.name || "Material",
          brandName: item.brand?.brand_name ?? null,
          unit: item.material?.unit || "nos",
          unitCost: Number(item.unit_price) || 0,
          originalQty: original,
          remainingQty: remaining,
          vendorName: batch.vendor_name ?? null,
          totalAmount: Number(batch.total_amount) || 0,
        });
      }
    }
    return options;
  }, [activeBatches, variantSummary, selectedRefCode]);

  // Variant-scoped batchInfo for the info panel
  const batchInfo = useMemo(() => {
    if (!selectedBatch || !parsedSelection) return null;

    const matchingOption = variantOptions.find((o) => o.key === selectedKey);
    const materialName = matchingOption?.materialName ?? "Material";
    const brandName = matchingOption?.brandName ?? null;
    const unit = matchingOption?.unit ?? "nos";
    const unitCost = selectedVariant?.unit_cost ?? matchingOption?.unitCost ?? 0;
    const originalQty = selectedVariant?.original_qty ?? matchingOption?.originalQty ?? 0;
    const usedQty = selectedVariant?.used_qty ?? 0;
    const remainingQty = selectedVariant?.remaining_qty ?? matchingOption?.remainingQty ?? originalQty;

    return {
      materialName,
      brandName,
      unit,
      unitCost,
      totalAmount: Number(selectedBatch.total_amount) || 0,
      originalQty,
      usedQty,
      remainingQty,
      usagePercent: originalQty > 0 ? (usedQty / originalQty) * 100 : 0,
    };
  }, [selectedBatch, parsedSelection, selectedKey, variantOptions, selectedVariant]);

  // Set preselected (refCode, material, brand) on open
  useEffect(() => {
    if (!open) return;
    if (preselectedBatchRefCode && preselectedMaterialId) {
      setSelectedKey(
        makeVariantKey(preselectedBatchRefCode, preselectedMaterialId, preselectedBrandId ?? null)
      );
      return;
    }
    // Fall back: if only the batch was given (no variant), pick its first variant
    if (preselectedBatchRefCode) {
      const firstOption = variantOptions.find((o) => o.refCode === preselectedBatchRefCode);
      if (firstOption) setSelectedKey(firstOption.key);
    }
  }, [open, preselectedBatchRefCode, preselectedMaterialId, preselectedBrandId, variantOptions]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedKey("");
      setUsageSiteId(siteId);
      setQuantity(0);
      setUsageDate(new Date().toISOString().split("T")[0]);
      setWorkDescription("");
      setError("");
    }
  }, [open, siteId]);

  // Handle submit
  const handleSubmit = async () => {
    setError("");

    // Validation
    if (!parsedSelection) {
      setError("Please select a batch and variant");
      return;
    }
    if (!usageSiteId) {
      setError("Please select which site used the material");
      return;
    }
    if (!quantity || quantity <= 0) {
      setError("Please enter a valid quantity");
      return;
    }
    if (!usageDate) {
      setError("Please select a usage date");
      return;
    }

    const qty = quantity;

    // Check remaining quantity (variant-scoped)
    if (batchInfo && qty > batchInfo.remainingQty) {
      setError(
        `Insufficient quantity. Available: ${batchInfo.remainingQty} ${batchInfo.unit}`
      );
      return;
    }

    try {
      await recordUsage.mutateAsync({
        batch_ref_code: parsedSelection.refCode,
        usage_site_id: usageSiteId,
        material_id: parsedSelection.materialId,
        brand_id: parsedSelection.brandId,
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

  // Landed unit cost: scale the variant's product unit price up to the actual
  // amount paid for the whole batch (which folds in transport/loading), keeping
  // per-variant proportions. Mirrors the record_batch_usage RPC exactly
  //   ratio        = COALESCE(amount_paid, total_amount) / SUM(item.total_price)
  //   landed_unit  = variant.unit_price * ratio
  // so the preview equals what actually gets stored on the usage row.
  const landed = useMemo(() => {
    const productUnit = batchInfo?.unitCost ?? 0;
    if (!selectedBatch || !productUnit) {
      return { unitCost: productUnit, ratio: 1, hasTransport: false };
    }
    const items = (selectedBatch.items ?? []) as Array<any>;
    const itemsTotal = items.reduce((sum, it) => {
      const tp =
        it?.total_price != null
          ? Number(it.total_price)
          : Number(it?.quantity ?? 0) * Number(it?.unit_price ?? 0);
      return sum + (Number.isFinite(tp) ? tp : 0);
    }, 0);
    const finalPayment =
      Number((selectedBatch as any).amount_paid ?? selectedBatch.total_amount ?? 0) || 0;
    if (itemsTotal <= 0 || finalPayment <= 0) {
      return { unitCost: productUnit, ratio: 1, hasTransport: false };
    }
    const ratio = finalPayment / itemsTotal;
    return {
      unitCost: productUnit * ratio,
      ratio,
      hasTransport: Math.abs(ratio - 1) > 0.0001,
    };
  }, [selectedBatch, batchInfo]);

  // Calculate estimated cost (landed — incl. proportional transport/loading)
  const estimatedCost = useMemo(() => {
    if (!landed.unitCost || !quantity) return 0;
    return quantity * landed.unitCost;
  }, [landed, quantity]);

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

          {/* Batch + Variant Selection */}
          <Grid size={12}>
            <TextField
              select
              fullWidth
              label="Select Batch · Variant"
              value={selectedKey}
              onChange={(e) => setSelectedKey(e.target.value)}
              required
              disabled={!!preselectedBatchRefCode && !!preselectedMaterialId}
              helperText={
                variantOptions.length > 0
                  ? "Pick the specific size / variant. Quantity below is variant-scoped."
                  : undefined
              }
            >
              {variantOptions.length === 0 ? (
                <MenuItem disabled>No active batches available</MenuItem>
              ) : (
                variantOptions.map((opt) => (
                  <MenuItem key={opt.key} value={opt.key}>
                    <Box>
                      <Typography variant="body2" fontWeight={500}>
                        {opt.refCode} · {opt.materialName}
                        {opt.brandName ? ` · ${opt.brandName}` : ""}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {opt.remainingQty} {opt.unit} remaining of {opt.originalQty}
                        {opt.vendorName ? ` · ${opt.vendorName}` : ""}
                      </Typography>
                    </Box>
                  </MenuItem>
                ))
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

          {/* Quantity (with #/% toggle for fluid materials like sand, PPC) */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <QuantityWithPercentInput
              value={quantity}
              onChange={setQuantity}
              unit={batchInfo?.unit || "units"}
              remaining={batchInfo?.remainingQty ?? 0}
              required
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
                {landed.hasTransport && (
                  <Typography variant="caption" color="text.secondary" display="block">
                    Incl. proportional transport — {formatCurrency(landed.unitCost)}/{batchInfo?.unit} landed
                    {" "}(product {formatCurrency(batchInfo?.unitCost ?? 0)}/{batchInfo?.unit})
                  </Typography>
                )}
                {!isSelfUse && (
                  <Typography variant="caption" color="text.secondary" display="block">
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
          disabled={recordUsage.isPending || !parsedSelection || !usageSiteId || quantity <= 0}
        >
          {recordUsage.isPending ? "Recording..." : "Record Usage"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
