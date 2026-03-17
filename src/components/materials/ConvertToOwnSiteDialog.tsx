"use client";

import { useState } from "react";
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
  Chip,
  Paper,
  MenuItem,
  Divider,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@mui/material";
import {
  Close as CloseIcon,
  SwapHoriz as ConvertIcon,
  Warning as WarningIcon,
} from "@mui/icons-material";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { GroupStockBatch } from "@/types/material.types";
import { useSiteGroupMembership } from "@/hooks/queries/useSiteGroups";
import { useConvertGroupToOwnSite } from "@/hooks/queries/useMaterialPurchases";
import { formatCurrency } from "@/lib/formatters";
import {
  MATERIAL_BATCH_STATUS_LABELS,
  MATERIAL_BATCH_STATUS_COLORS,
} from "@/types/material.types";
import dayjs from "dayjs";

interface ConvertToOwnSiteDialogProps {
  open: boolean;
  onClose: () => void;
  batch: GroupStockBatch | null;
  siteId: string;
}

export default function ConvertToOwnSiteDialog({
  open,
  onClose,
  batch,
  siteId,
}: ConvertToOwnSiteDialogProps) {
  const isMobile = useIsMobile();
  const { data: groupMembership } = useSiteGroupMembership(siteId);
  const convertToOwnSite = useConvertGroupToOwnSite();

  const [targetSiteId, setTargetSiteId] = useState<string>(siteId);
  const [error, setError] = useState("");

  const handleConvert = async () => {
    if (!batch) return;

    if (!targetSiteId) {
      setError("Please select a target site");
      return;
    }

    try {
      await convertToOwnSite.mutateAsync({
        batch_code: batch.ref_code,
        target_site_id: targetSiteId,
      });
      onClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to convert batch";
      setError(message);
    }
  };

  const isSubmitting = convertToOwnSite.isPending;
  const canConvert = batch?.status === "in_stock" || batch?.status === "partial_used";

  if (!batch) return null;

  return (
    <Dialog
      open={open}
      onClose={(_event, reason) => { if (reason !== "backdropClick") onClose(); }}
      maxWidth="sm"
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
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <ConvertIcon color="primary" />
          <Typography component="span" variant="h6">
            Convert to Own Site
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

        <Alert severity="warning" icon={<WarningIcon />} sx={{ mb: 3 }}>
          <Typography variant="body2" fontWeight={600}>
            This action is irreversible
          </Typography>
          <Typography variant="body2">
            Converting this group stock batch to an own-site purchase will:
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2 }}>
            <li>
              <Typography variant="body2">
                Remove it from group stock tracking
              </Typography>
            </li>
            <li>
              <Typography variant="body2">
                Create a new direct expense for the selected site
              </Typography>
            </li>
            <li>
              <Typography variant="body2">
                Cancel any pending settlements related to this batch
              </Typography>
            </li>
          </Box>
        </Alert>

        {/* Batch Details */}
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Box
            display="flex"
            justifyContent="space-between"
            alignItems="flex-start"
            mb={2}
          >
            <Box>
              <Typography variant="subtitle2" color="text.secondary">
                Batch Reference
              </Typography>
              <Typography variant="h6">{batch.ref_code}</Typography>
            </Box>
            <Chip
              label={MATERIAL_BATCH_STATUS_LABELS[batch.status]}
              color={MATERIAL_BATCH_STATUS_COLORS[batch.status]}
              size="small"
            />
          </Box>

          <Grid container spacing={2}>
            <Grid size={{ xs: 6 }}>
              <Typography variant="caption" color="text.secondary">
                Purchase Date
              </Typography>
              <Typography variant="body2">
                {dayjs(batch.purchase_date).format("DD MMM YYYY")}
              </Typography>
            </Grid>
            <Grid size={{ xs: 6 }}>
              <Typography variant="caption" color="text.secondary">
                Total Amount
              </Typography>
              <Typography variant="body2" fontWeight={600}>
                {formatCurrency(batch.total_amount)}
              </Typography>
            </Grid>
            {batch.vendor_name && (
              <Grid size={{ xs: 12 }}>
                <Typography variant="caption" color="text.secondary">
                  Vendor
                </Typography>
                <Typography variant="body2">{batch.vendor_name}</Typography>
              </Grid>
            )}
            {batch.payment_source_site_name && (
              <Grid size={{ xs: 12 }}>
                <Typography variant="caption" color="text.secondary">
                  Originally Paid By
                </Typography>
                <Typography variant="body2">
                  {batch.payment_source_site_name}
                </Typography>
              </Grid>
            )}
          </Grid>

          {/* Materials in batch */}
          {batch.items && batch.items.length > 0 && (
            <>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" gutterBottom>
                Materials
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ py: 0.5 }}>Material</TableCell>
                    <TableCell align="right" sx={{ py: 0.5 }}>
                      Qty
                    </TableCell>
                    <TableCell align="right" sx={{ py: 0.5 }}>
                      Amount
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {batch.items.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell sx={{ py: 0.5 }}>
                        <Typography variant="body2">
                          {item.material_name}
                        </Typography>
                        {item.brand_name && (
                          <Typography variant="caption" color="text.secondary">
                            {item.brand_name}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right" sx={{ py: 0.5 }}>
                        {item.quantity} {item.unit}
                      </TableCell>
                      <TableCell align="right" sx={{ py: 0.5 }}>
                        {formatCurrency(item.quantity * item.unit_price)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </Paper>

        {/* Target Site Selection */}
        <TextField
          select
          fullWidth
          label="Convert to Site"
          value={targetSiteId}
          onChange={(e) => setTargetSiteId(e.target.value)}
          required
          helperText="Select the site this purchase will be assigned to"
        >
          {(groupMembership?.allSites || []).map((site) => (
            <MenuItem key={site.id} value={site.id}>
              {site.name}
              {site.id === batch.payment_source_site_id && " (Paid for this)"}
              {site.id === siteId && " (Current)"}
            </MenuItem>
          ))}
        </TextField>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="warning"
          onClick={handleConvert}
          disabled={isSubmitting || !canConvert || !targetSiteId}
          startIcon={<ConvertIcon />}
        >
          {isSubmitting ? "Converting..." : "Convert to Own Site"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
