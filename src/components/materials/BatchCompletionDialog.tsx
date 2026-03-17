"use client";

import { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Alert,
} from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import WarningIcon from "@mui/icons-material/Warning";
import { formatCurrency } from "@/lib/formatters";
import type { GroupStockBatch, BatchSiteAllocation } from "@/types/material.types";

interface BatchCompletionDialogProps {
  open: boolean;
  onClose: () => void;
  batch: GroupStockBatch | null;
  onComplete: (batchRefCode: string, allocations: BatchSiteAllocation[]) => Promise<void>;
}

export default function BatchCompletionDialog({
  open,
  onClose,
  batch,
  onComplete,
}: BatchCompletionDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!batch) return null;

  const originalQty = batch.original_quantity ?? 0;
  const remainingQty = batch.remaining_quantity ?? 0;
  const usedQty = originalQty - remainingQty;
  const siteAllocations = batch.site_allocations || [];

  // Get the unit from the first item (all items in a batch should have the same unit context)
  const itemUnit = batch.items?.[0]?.unit || batch.material?.unit || "pcs";

  // Calculate allocations with amounts
  const allocations = siteAllocations.map((alloc) => {
    const percentage = originalQty > 0 ? (alloc.quantity_used / originalQty) * 100 : 0;
    const amount = alloc.amount;
    return {
      ...alloc,
      percentage,
      amount,
    };
  });

  // Self-use calculation (remaining quantity for paying site)
  // Use amount_paid (bargained amount) if available, otherwise use total_amount
  const effectiveTotalAmount = batch.amount_paid ?? batch.total_amount ?? 0;
  const selfUseQty = remainingQty;
  const selfUsePercentage = originalQty > 0 ? (selfUseQty / originalQty) * 100 : 0;

  // Calculate total allocated to other sites from actual amounts (uses adjusted unit cost)
  const totalAllocatedAmount = allocations.reduce((sum, a) => sum + a.amount, 0);

  // Self-use amount = Total paid - Amount used by others
  // This ensures the total matches exactly (no rounding issues from percentage calculation)
  const selfUseAmount = effectiveTotalAmount - totalAllocatedAmount;

  // Total should equal the effective amount paid
  const totalAmount = effectiveTotalAmount;

  const handleComplete = async () => {
    try {
      setError("");
      setIsSubmitting(true);

      // Prepare allocations for settlement
      const settlementAllocations = allocations.map((alloc) => ({
        site_id: alloc.site_id,
        site_name: alloc.site_name,
        quantity_used: alloc.quantity_used,
        amount: alloc.amount,
        is_payer: alloc.is_payer,
        settlement_status: alloc.settlement_status,
      }));

      await onComplete(batch.ref_code, settlementAllocations);
      onClose();
    } catch (err: any) {
      console.error("Batch completion failed:", err);
      setError(err.message || "Failed to complete batch. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const canComplete = usedQty > 0 || selfUseQty > 0;

  return (
    <Dialog open={open} onClose={(_event, reason) => { if (reason !== "backdropClick") onClose(); }} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <CheckCircleIcon color="success" />
        Complete Batch Settlement
      </DialogTitle>

      <DialogContent>
        {/* Batch Summary */}
        <Box
          sx={{
            bgcolor: "background.default",
            p: 2,
            borderRadius: 1,
            mb: 3,
          }}
        >
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Batch Details
          </Typography>
          <Typography variant="body2" fontWeight={600} fontFamily="monospace">
            {batch.ref_code}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Vendor: {batch.vendor_name || "Unknown"}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Paid by: {batch.payment_source_site_name || "Unknown Site"}
          </Typography>
          {batch.amount_paid && batch.amount_paid !== batch.total_amount ? (
            <Box sx={{ mt: 1 }}>
              <Typography
                variant="body2"
                sx={{ textDecoration: 'line-through', color: 'text.disabled' }}
              >
                {formatCurrency(batch.total_amount)}
              </Typography>
              <Typography variant="h5" color="success.main" fontWeight={700}>
                {formatCurrency(batch.amount_paid)}
              </Typography>
            </Box>
          ) : (
            <Typography variant="h5" color="primary" fontWeight={700} sx={{ mt: 1 }}>
              {formatCurrency(batch.total_amount)}
            </Typography>
          )}
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
            {error}
          </Alert>
        )}

        {!canComplete && (
          <Alert severity="warning" sx={{ mb: 2 }} icon={<WarningIcon />}>
            This batch has no usage recorded yet. Record usage before completing.
          </Alert>
        )}

        <Typography variant="subtitle1" fontWeight={600} gutterBottom sx={{ mt: 3 }}>
          Quantity Breakdown
        </Typography>

        <Box sx={{ mb: 3 }}>
          <Box display="flex" justifyContent="space-between" mb={1}>
            <Typography variant="body2">Total Quantity:</Typography>
            <Typography variant="body2" fontWeight={600}>
              {originalQty.toFixed(2)} {itemUnit}
            </Typography>
          </Box>
          <Box display="flex" justifyContent="space-between" mb={1}>
            <Typography variant="body2">Used by Others:</Typography>
            <Typography variant="body2" fontWeight={600} color="warning.main">
              {usedQty.toFixed(2)} {itemUnit}
            </Typography>
          </Box>
          <Box display="flex" justifyContent="space-between">
            <Typography variant="body2">Self Use (Paying Site):</Typography>
            <Typography variant="body2" fontWeight={600} color="success.main">
              {selfUseQty.toFixed(2)} {itemUnit}
            </Typography>
          </Box>
        </Box>

        <Divider sx={{ my: 2 }} />

        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          Settlement Allocations
        </Typography>

        <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Site</TableCell>
                <TableCell align="right">Quantity Used</TableCell>
                <TableCell align="right">Percentage</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell align="center">Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {allocations.map((alloc) => (
                <TableRow key={alloc.site_id}>
                  <TableCell>{alloc.site_name}</TableCell>
                  <TableCell align="right">{alloc.quantity_used.toFixed(2)} {itemUnit}</TableCell>
                  <TableCell align="right">{alloc.percentage.toFixed(1)}%</TableCell>
                  <TableCell align="right">{formatCurrency(alloc.amount)}</TableCell>
                  <TableCell align="center">
                    <Chip
                      label={alloc.settlement_status === "pending" ? "Pending" : "Settled"}
                      size="small"
                      color={alloc.settlement_status === "pending" ? "warning" : "success"}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {selfUseQty > 0 && (
                <TableRow sx={{ bgcolor: "success.lighter" }}>
                  <TableCell>
                    <strong>{batch.payment_source_site_name} (Self Use)</strong>
                  </TableCell>
                  <TableCell align="right">
                    <strong>{selfUseQty.toFixed(2)}</strong>
                  </TableCell>
                  <TableCell align="right">
                    <strong>{selfUsePercentage.toFixed(1)}%</strong>
                  </TableCell>
                  <TableCell align="right">
                    <strong>{formatCurrency(selfUseAmount)}</strong>
                  </TableCell>
                  <TableCell align="center">
                    <Chip label="Self Use" size="small" color="info" />
                  </TableCell>
                </TableRow>
              )}
              <TableRow sx={{ bgcolor: "background.default" }}>
                <TableCell colSpan={2}>
                  <strong>Total</strong>
                </TableCell>
                <TableCell align="right">
                  <strong>100%</strong>
                </TableCell>
                <TableCell align="right">
                  <strong>{formatCurrency(totalAmount)}</strong>
                </TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>

        <Alert severity="info" sx={{ mt: 2 }}>
          <Typography variant="body2" fontWeight={600} gutterBottom>
            What happens when you complete this batch:
          </Typography>
          <Typography variant="body2" component="ul" sx={{ m: 0, pl: 2 }}>
            <li>Debtor expenses created for sites that used materials</li>
            <li>Self-use expense created for the paying site ({batch.payment_source_site_name})</li>
            <li>Amounts will appear in each site&apos;s Material Expenses</li>
            <li>All amounts will flow to All Site Expenses</li>
          </Typography>
        </Alert>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleComplete}
          disabled={!canComplete || isSubmitting}
          startIcon={<CheckCircleIcon />}
        >
          {isSubmitting ? "Completing..." : "Complete Batch Settlement"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
