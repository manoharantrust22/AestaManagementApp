"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  TextField,
  MenuItem,
  Alert,
  CircularProgress,
  Chip,
} from "@mui/material";
import {
  Edit as EditIcon,
  Block as BlockIcon,
} from "@mui/icons-material";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { createClient } from "@/lib/supabase/client";
import { useSiteGroupMembership } from "@/hooks/queries/useSiteGroups";
import type { BatchUsageRecordWithDetails } from "@/types/material.types";
import {
  BATCH_USAGE_SETTLEMENT_STATUS_LABELS,
  BATCH_USAGE_SETTLEMENT_STATUS_COLORS,
} from "@/types/material.types";

interface BatchUsageEditDialogProps {
  open: boolean;
  record: BatchUsageRecordWithDetails | null;
  onClose: () => void;
  onSave: (data: {
    quantity?: number;
    work_description?: string;
    usage_site_id?: string;
  }) => void;
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
  const [usageSiteId, setUsageSiteId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Sites in this batch's group (the candidate consuming sites).
  const { data: membership } = useSiteGroupMembership(record?.usage_site_id);
  const allSites =
    (membership as { allSites?: Array<{ id: string; name: string }> } | undefined)
      ?.allSites ?? [];
  const isGroupBatch = allSites.length > 1;

  // The batch's paying site — needed to preview the self-use vs inter-site
  // consequence of moving the usage. Only fetched for group batches.
  const { data: payerInfo } = useQuery({
    queryKey: ["batch-payer", record?.batch_ref_code],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error: payerError } = await (supabase as any)
        .from("material_purchase_expenses")
        .select("paying_site_id, site_id")
        .eq("ref_code", record!.batch_ref_code)
        .eq("purchase_type", "group_stock")
        .maybeSingle();
      if (payerError) return null;
      return data as { paying_site_id: string | null; site_id: string | null } | null;
    },
    enabled: open && !!record?.batch_ref_code && isGroupBatch,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (open && record) {
      setQuantity(Number(record.quantity));
      setWorkDescription(record.work_description || "");
      setUsageSiteId(record.usage_site_id ?? record.usage_site?.id ?? "");
      setError(null);
    }
  }, [open, record]);

  if (!record) return null;

  const materialName = record.material?.name || "Unknown Material";
  const brandName = record.brand?.brand_name;
  const unit = record.unit || record.material?.unit || "nos";
  const unitCost = Number(record.unit_cost) || 0;

  const isSettled = record.settlement_status === "settled";
  const isInSettlement =
    record.settlement_status === "in_settlement" || !!record.settlement_id;
  const isLocked = isSettled || isInSettlement;
  const canChangeSite = isGroupBatch && !isLocked;

  const payingSiteId = payerInfo?.paying_site_id ?? payerInfo?.site_id ?? null;
  const payerName = payingSiteId
    ? allSites.find((s) => s.id === payingSiteId)?.name ?? null
    : null;

  const originalQuantity = Number(record.quantity);
  const originalSiteId = record.usage_site_id ?? record.usage_site?.id ?? "";
  const quantityDelta = quantity - originalQuantity;
  const siteChanged = usageSiteId !== originalSiteId;
  const newSiteName =
    allSites.find((s) => s.id === usageSiteId)?.name ||
    record.usage_site?.name ||
    "Unknown";
  const oldSiteName = record.usage_site?.name || "Unknown";

  const validateQuantity = () => {
    if (quantity <= 0) return "Quantity must be greater than 0";
    return null;
  };

  const validationError = validateQuantity();
  const hasChanges =
    quantity !== originalQuantity ||
    workDescription !== (record.work_description || "") ||
    siteChanged;

  const handleSave = () => {
    const err = validateQuantity();
    if (err) {
      setError(err);
      return;
    }
    onSave({
      quantity: quantity !== originalQuantity ? quantity : undefined,
      work_description: workDescription,
      usage_site_id: siteChanged ? usageSiteId : undefined,
    });
  };

  const newTotalCost = quantity * unitCost;

  // Preview of the financial effect of moving the usage to a different site.
  const newIsSelfUse = payingSiteId != null && usageSiteId === payingSiteId;
  const oldWasSelfUse = payingSiteId != null && originalSiteId === payingSiteId;
  let siteEffectNote: string | null = null;
  if (siteChanged) {
    if (payingSiteId == null) {
      siteEffectNote =
        "Changing the site may create or remove an inter-site debt; the exact effect is computed on save.";
    } else if (newIsSelfUse) {
      siteEffectNote = `Becomes self-use — no inter-site debt${
        payerName ? ` (${payerName} both paid and used)` : ""
      }.`;
    } else if (oldWasSelfUse) {
      siteEffectNote = `Creates an inter-site debt of ${formatCurrency(
        newTotalCost
      )}${payerName ? ` owed to ${payerName}` : ""}.`;
    } else {
      siteEffectNote = `Debt of ${formatCurrency(
        newTotalCost
      )} moves to ${newSiteName}${
        payerName ? ` (still owed to ${payerName})` : ""
      }.`;
    }
  }

  return (
    <Dialog
      open={open}
      onClose={(_event, reason) => { if (reason !== "backdropClick" && !isSaving) onClose(); }}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderTop: 4,
          borderColor: isLocked ? "warning.main" : "primary.main",
        },
      }}
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        {isLocked ? (
          <BlockIcon color="warning" />
        ) : (
          <EditIcon color="primary" />
        )}
        <Typography variant="h6" component="span">
          {isLocked ? "Cannot Edit Usage Record" : "Edit Batch Usage Record"}
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

        {isLocked ? (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <Typography variant="body2" fontWeight={500}>
              {isSettled
                ? "This usage is part of a completed settlement and cannot be modified."
                : "This usage has been pulled into an inter-site settlement and cannot be modified."}
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
              {canChangeSite && (
                <TextField
                  select
                  label="Used By (site that consumed this)"
                  value={usageSiteId}
                  onChange={(e) => setUsageSiteId(e.target.value)}
                  fullWidth
                  helperText="Move this usage to the site that actually used the material."
                >
                  {allSites.map((site) => (
                    <MenuItem key={site.id} value={site.id}>
                      {site.name}
                      {site.id === originalSiteId && " (Current)"}
                      {payingSiteId && site.id === payingSiteId && (
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
              )}

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
                {siteChanged && (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      mb: 0.5,
                    }}
                  >
                    <Typography variant="body2">Used By:</Typography>
                    <Chip
                      label={`${oldSiteName} → ${newSiteName}`}
                      size="small"
                      color="warning"
                    />
                  </Box>
                )}
                {siteChanged && siteEffectNote && (
                  <Alert
                    severity={newIsSelfUse ? "success" : "info"}
                    sx={{ mb: 0.5, py: 0 }}
                  >
                    <Typography variant="caption">{siteEffectNote}</Typography>
                  </Alert>
                )}
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
          {isLocked ? "Close" : "Cancel"}
        </Button>
        {!isLocked && (
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
