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
  Paper,
  Divider,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@mui/material";
import {
  Close as CloseIcon,
  AccountBalance as SettlementIcon,
  ArrowForward as ArrowIcon,
  CheckCircle as SuccessIcon,
} from "@mui/icons-material";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useBatchSettlementSummary, useProcessBatchSettlement, useBatchUsageRecords } from "@/hooks/queries/useBatchUsage";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency, formatDate } from "@/lib/formatters";
import {
  BATCH_USAGE_SETTLEMENT_STATUS_LABELS,
  BATCH_USAGE_SETTLEMENT_STATUS_COLORS,
} from "@/types/material.types";

interface InitiateBatchSettlementDialogProps {
  open: boolean;
  onClose: () => void;
  batchRefCode: string;
  debtorSiteId: string;
  debtorSiteName: string;
  creditorSiteId: string;
  creditorSiteName: string;
  amount: number;
}

export default function InitiateBatchSettlementDialog({
  open,
  onClose,
  batchRefCode,
  debtorSiteId,
  debtorSiteName,
  creditorSiteId,
  creditorSiteName,
  amount,
}: InitiateBatchSettlementDialogProps) {
  const isMobile = useIsMobile();
  const { user } = useAuth();

  // Hooks
  const { data: batchSummary } = useBatchSettlementSummary(batchRefCode);
  const { data: usageRecords = [] } = useBatchUsageRecords(batchRefCode);
  const processSettlement = useProcessBatchSettlement();

  // Form state
  const [paymentMode, setPaymentMode] = useState<string>("upi");
  const [paymentDate, setPaymentDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [paymentReference, setPaymentReference] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<boolean>(false);
  const [settlementCode, setSettlementCode] = useState<string>("");

  // Bargaining support - allow modifying settlement amount
  const [settlementAmount, setSettlementAmount] = useState<string>("");
  const [isBargaining, setIsBargaining] = useState<boolean>(false);

  // Get pending usage records for the debtor site
  const pendingUsageRecords = useMemo(() => {
    return usageRecords.filter(
      (r) => r.usage_site_id === debtorSiteId && r.settlement_status === "pending"
    );
  }, [usageRecords, debtorSiteId]);

  // Calculate total from pending records
  const calculatedAmount = useMemo(() => {
    return pendingUsageRecords.reduce((sum, r) => sum + Number(r.total_cost), 0);
  }, [pendingUsageRecords]);

  // Total quantity
  const totalQuantity = useMemo(() => {
    return pendingUsageRecords.reduce((sum, r) => sum + Number(r.quantity), 0);
  }, [pendingUsageRecords]);

  // Unit from first record
  const unit = pendingUsageRecords[0]?.unit || "nos";

  // Final settlement amount (bargained or original)
  const finalSettlementAmount = useMemo(() => {
    if (isBargaining && settlementAmount) {
      const parsed = parseFloat(settlementAmount);
      return isNaN(parsed) ? calculatedAmount : parsed;
    }
    return calculatedAmount;
  }, [isBargaining, settlementAmount, calculatedAmount]);

  // Calculate savings from bargaining
  const bargainingSavings = useMemo(() => {
    return calculatedAmount - finalSettlementAmount;
  }, [calculatedAmount, finalSettlementAmount]);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setPaymentMode("upi");
      setPaymentDate(new Date().toISOString().split("T")[0]);
      setPaymentReference("");
      setError("");
      setSuccess(false);
      setSettlementCode("");
      setSettlementAmount("");
      setIsBargaining(false);
    }
  }, [open]);

  // Initialize settlement amount when calculated amount changes
  useEffect(() => {
    if (calculatedAmount > 0 && !settlementAmount) {
      setSettlementAmount(calculatedAmount.toString());
    }
  }, [calculatedAmount, settlementAmount]);

  // Handle submit
  const handleSubmit = async () => {
    setError("");

    if (!paymentMode) {
      setError("Please select a payment mode");
      return;
    }
    if (!paymentDate) {
      setError("Please select a payment date");
      return;
    }

    try {
      const result = await processSettlement.mutateAsync({
        batch_ref_code: batchRefCode,
        debtor_site_id: debtorSiteId,
        payment_mode: paymentMode,
        payment_date: paymentDate,
        payment_reference: paymentReference || undefined,
        // Pass settlement_amount if bargaining (different from calculated)
        settlement_amount: isBargaining && finalSettlementAmount !== calculatedAmount
          ? finalSettlementAmount
          : undefined,
        created_by: user?.id,
      });

      setSuccess(true);
      setSettlementCode(result.settlement_code);
    } catch (err: any) {
      setError(err.message || "Failed to process settlement");
    }
  };

  // Success view
  if (success) {
    return (
      <Dialog
        open={open}
        onClose={(_event, reason) => { if (reason !== "backdropClick") onClose(); }}
        maxWidth="sm"
        fullWidth
      >
        <DialogContent sx={{ textAlign: "center", py: 4 }}>
          <SuccessIcon color="success" sx={{ fontSize: 64, mb: 2 }} />
          <Typography variant="h5" gutterBottom fontWeight={600}>
            Settlement Complete!
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
            The settlement has been processed successfully.
          </Typography>

          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Typography variant="caption" color="text.secondary">
              Settlement Code
            </Typography>
            <Typography variant="h6" fontFamily="monospace" fontWeight={600}>
              {settlementCode}
            </Typography>
          </Paper>

          <Box sx={{ display: "flex", justifyContent: "center", gap: 2, alignItems: "center", mb: 2 }}>
            <Chip label={debtorSiteName} color="warning" />
            <ArrowIcon />
            <Chip label={creditorSiteName} color="success" />
          </Box>

          <Typography variant="h5" fontWeight={600} color="success.main">
            {formatCurrency(finalSettlementAmount)}
          </Typography>
          {bargainingSavings > 0 && (
            <Typography variant="body2" color="text.secondary">
              Original: {formatCurrency(calculatedAmount)} • Saved: {formatCurrency(bargainingSavings)}
            </Typography>
          )}

          <Divider sx={{ my: 2 }} />

          <Typography variant="body2" color="text.secondary">
            A material expense record has been created for {debtorSiteName}.
            The creditor&apos;s ({creditorSiteName}) expense has been updated.
          </Typography>
        </DialogContent>

        <DialogActions sx={{ justifyContent: "center", pb: 3 }}>
          <Button variant="contained" onClick={onClose}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

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
          <SettlementIcon color="primary" />
          <Typography variant="h6" component="span">Process Settlement</Typography>
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

          {/* Settlement Summary */}
          <Grid size={12}>
            <Paper variant="outlined" sx={{ p: 2, bgcolor: "primary.50" }}>
              <Box sx={{ display: "flex", justifyContent: "center", gap: 2, alignItems: "center", mb: 2 }}>
                <Box sx={{ textAlign: "center" }}>
                  <Typography variant="caption" color="text.secondary">
                    Debtor (Owes)
                  </Typography>
                  <Chip
                    label={debtorSiteName}
                    color="warning"
                    sx={{ display: "block", mt: 0.5 }}
                  />
                </Box>
                <ArrowIcon color="action" />
                <Box sx={{ textAlign: "center" }}>
                  <Typography variant="caption" color="text.secondary">
                    Creditor (Paid)
                  </Typography>
                  <Chip
                    label={creditorSiteName}
                    color="success"
                    sx={{ display: "block", mt: 0.5 }}
                  />
                </Box>
              </Box>

              <Divider sx={{ my: 1.5 }} />

              <Box sx={{ textAlign: "center" }}>
                <Typography variant="caption" color="text.secondary">
                  Settlement Amount
                </Typography>
                {isBargaining ? (
                  <TextField
                    type="number"
                    value={settlementAmount}
                    onChange={(e) => setSettlementAmount(e.target.value)}
                    size="small"
                    sx={{
                      mt: 1,
                      mb: 1,
                      "& input": { textAlign: "center", fontSize: "1.5rem", fontWeight: 600 }
                    }}
                    inputProps={{ min: 0, step: 0.01 }}
                  />
                ) : (
                  <Typography variant="h4" fontWeight={600} color="primary.main">
                    {formatCurrency(calculatedAmount)}
                  </Typography>
                )}
                {bargainingSavings > 0 && (
                  <Chip
                    label={`Saving ${formatCurrency(bargainingSavings)}`}
                    color="success"
                    size="small"
                    sx={{ mb: 1 }}
                  />
                )}
                <Typography variant="body2" color="text.secondary">
                  {totalQuantity} {unit} used from batch {batchRefCode}
                </Typography>
                <Button
                  size="small"
                  variant="text"
                  onClick={() => {
                    if (isBargaining) {
                      // Reset to original amount when turning off bargaining
                      setSettlementAmount(calculatedAmount.toString());
                    }
                    setIsBargaining(!isBargaining);
                  }}
                  sx={{ mt: 1, textTransform: "none" }}
                >
                  {isBargaining ? "Use original amount" : "Adjust amount (bargaining)"}
                </Button>
              </Box>
            </Paper>
          </Grid>

          {/* Usage Details Table */}
          {pendingUsageRecords.length > 0 && (
            <Grid size={12}>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                Usage Details
              </Typography>
              <Paper variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Date</TableCell>
                      <TableCell>Material</TableCell>
                      <TableCell align="right">Qty</TableCell>
                      <TableCell align="right">Amount</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pendingUsageRecords.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell>
                          <Typography variant="body2">
                            {formatDate(record.usage_date)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {record.material?.name || "Material"}
                          </Typography>
                          {record.work_description && (
                            <Typography variant="caption" color="text.secondary">
                              {record.work_description}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2">
                            {record.quantity} {record.unit}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={500}>
                            {formatCurrency(record.total_cost)}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell colSpan={3}>
                        <Typography variant="body2" fontWeight={600}>
                          Total
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={600}>
                          {formatCurrency(calculatedAmount)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </Paper>
            </Grid>
          )}

          <Grid size={12}>
            <Divider>
              <Typography variant="caption" color="text.secondary">
                Payment Details
              </Typography>
            </Divider>
          </Grid>

          {/* Payment Mode */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              select
              fullWidth
              label="Payment Mode"
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value)}
              required
            >
              <MenuItem value="cash">Cash</MenuItem>
              <MenuItem value="upi">UPI</MenuItem>
              <MenuItem value="bank_transfer">Bank Transfer</MenuItem>
              <MenuItem value="adjustment">Adjustment</MenuItem>
            </TextField>
          </Grid>

          {/* Payment Date */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              label="Payment Date"
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              required
              InputLabelProps={{ shrink: true }}
            />
          </Grid>

          {/* Payment Reference */}
          <Grid size={12}>
            <TextField
              fullWidth
              label="Payment Reference (Optional)"
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              placeholder="e.g., UPI transaction ID, bank reference"
            />
          </Grid>

          {/* Info Alert */}
          <Grid size={12}>
            <Alert severity="info" sx={{ fontSize: "0.85rem" }}>
              <strong>What happens next:</strong>
              <ul style={{ margin: "8px 0 0 0", paddingLeft: "20px" }}>
                <li>A settlement record will be created</li>
                <li>A material expense record will be added to {debtorSiteName}</li>
                <li>The usage will be marked as settled</li>
                <li>If batch is fully settled, it will be auto-completed</li>
              </ul>
            </Alert>
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={processSettlement.isPending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="success"
          onClick={handleSubmit}
          disabled={processSettlement.isPending || pendingUsageRecords.length === 0}
          startIcon={<SettlementIcon />}
        >
          {processSettlement.isPending ? "Processing..." : "Confirm Settlement"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
