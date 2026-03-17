"use client";

import { useState, useEffect } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import {
  CompareArrows as CompareArrowsIcon,
  ArrowForward as ArrowForwardIcon,
  CheckCircle as CheckCircleIcon,
  Close as CloseIcon,
  Receipt as ExpenseIcon,
} from "@mui/icons-material";
import { formatCurrency } from "@/lib/formatters";
import { useNetSettlement } from "@/hooks/queries/useInterSiteSettlements";
import { useSiteSubcontracts } from "@/hooks/queries/useSubcontracts";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/useIsMobile";
import { createClient } from "@/lib/supabase/client";
import FileUploader, { UploadedFile } from "@/components/common/FileUploader";
import type { InterSiteBalance } from "@/types/material.types";

interface NetSettlementDialogProps {
  open: boolean;
  onClose: () => void;
  balanceA: InterSiteBalance;
  balanceB: InterSiteBalance;
  groupId: string;
  onSuccess: () => void;
  /** The site that owes the net remaining amount (for subcontract lookup) */
  debtorSiteId?: string;
}

export default function NetSettlementDialog({
  open,
  onClose,
  balanceA,
  balanceB,
  groupId,
  onSuccess,
  debtorSiteId,
}: NetSettlementDialogProps) {
  const netSettlement = useNetSettlement();
  const { userProfile } = useAuth();
  const isMobile = useIsMobile();
  const supabase = createClient();

  // Step management
  const [step, setStep] = useState<1 | 2>(1);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Payment form state (Step 2)
  const [paymentMode, setPaymentMode] = useState<string>("upi");
  const [paymentSource, setPaymentSource] = useState<string>("company");
  const [paymentDate, setPaymentDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [paymentReference, setPaymentReference] = useState<string>("");
  const [paymentProof, setPaymentProof] = useState<UploadedFile | null>(null);
  const [subcontractId, setSubcontractId] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  // Fetch subcontracts for the debtor (net payer) site
  const { data: subcontracts = [] } = useSiteSubcontracts(debtorSiteId);
  const activeSubcontracts = subcontracts.filter(
    (sc: any) => sc.status === "active" || sc.status === "on_hold"
  );

  const amountA = balanceA.total_amount_owed;
  const amountB = balanceB.total_amount_owed;
  const offsetAmount = Math.min(amountA, amountB);
  const netRemaining = Math.round(Math.abs(amountA - amountB) * 100) / 100;

  // Determine which site pays the net remainder
  const largerIsA = amountA > amountB;
  const netPayerName = largerIsA
    ? balanceA.debtor_site_name
    : balanceB.debtor_site_name;
  const netReceiverName = largerIsA
    ? balanceA.creditor_site_name
    : balanceB.creditor_site_name;

  // Reset form on dialog open/close
  useEffect(() => {
    if (!open) {
      setStep(1);
      setSuccess(false);
      setError(null);
      setPaymentMode("upi");
      setPaymentSource("company");
      setPaymentDate(new Date().toISOString().split("T")[0]);
      setPaymentReference("");
      setPaymentProof(null);
      setSubcontractId("");
      setNotes("");
    }
  }, [open]);

  const handleConfirm = async () => {
    setError(null);

    // Validate payment fields in Step 2
    if (netRemaining > 0 && step === 2) {
      if (!paymentMode) {
        setError("Please select a payment mode");
        return;
      }
      if (!paymentDate) {
        setError("Please select a payment date");
        return;
      }
      if (
        (paymentMode === "upi" || paymentMode === "bank_transfer") &&
        !paymentProof
      ) {
        setError("Please upload payment proof for UPI/Bank Transfer");
        return;
      }
    }

    try {
      await netSettlement.mutateAsync({
        siteGroupId: groupId,
        balanceA,
        balanceB,
        userId: userProfile?.id,
        // Pass payment details for the net remaining amount
        paymentDetails:
          netRemaining > 0
            ? {
                amount: netRemaining,
                payment_mode: paymentMode,
                payment_source: paymentSource || undefined,
                payment_date: paymentDate,
                reference_number: paymentReference || undefined,
                notes: notes
                  ? `${notes}${subcontractId ? " | Linked to subcontract" : ""}${paymentProof ? ` | Proof: ${paymentProof.url}` : ""}`
                  : paymentProof
                    ? `Proof: ${paymentProof.url}`
                    : undefined,
                proof_url: paymentProof?.url || undefined,
                subcontract_id: subcontractId || undefined,
              }
            : undefined,
      });
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onSuccess();
      }, 2000);
    } catch (err) {
      console.error("Net settlement failed:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to process net settlement. Please try again."
      );
    }
  };

  const handleClose = () => {
    if (!netSettlement.isPending) {
      setSuccess(false);
      setError(null);
      onClose();
    }
  };

  // Success view
  if (success) {
    return (
      <Dialog open={open} onClose={(_event, reason) => { if (reason !== "backdropClick") handleClose(); }} maxWidth="sm" fullWidth>
        <DialogContent>
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              py: 4,
            }}
          >
            <CheckCircleIcon
              sx={{ fontSize: 64, color: "success.main", mb: 2 }}
            />
            <Typography variant="h6" gutterBottom>
              Net Settlement Complete
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              textAlign="center"
            >
              {formatCurrency(offsetAmount)} offset applied.
              {netRemaining > 0
                ? ` ${formatCurrency(netRemaining)} payment recorded from ${netPayerName} to ${netReceiverName}.`
                : " All debts fully settled!"}
            </Typography>
            <Typography
              variant="body2"
              color="success.main"
              fontWeight={600}
              sx={{ mt: 1 }}
            >
              Both settlements fully completed.
            </Typography>
          </Box>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={(_event, reason) => { if (reason !== "backdropClick") handleClose(); }}
      maxWidth="sm"
      fullWidth
      fullScreen={isMobile && step === 2}
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <CompareArrowsIcon color="primary" />
        <Typography variant="h6" component="span">
          {step === 1 ? "Net Settlement" : "Payment Details"}
        </Typography>
        <IconButton
          onClick={handleClose}
          disabled={netSettlement.isPending}
          sx={{ position: "absolute", right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {step === 1 ? (
          /* ========== STEP 1: Offset Calculation Summary ========== */
          <>
            {/* Direction A */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                py: 1.5,
                flexWrap: "wrap",
              }}
            >
              <Chip
                label={balanceA.debtor_site_name}
                size="small"
                color="error"
                variant="outlined"
              />
              <Typography variant="caption" color="text.secondary">
                owes
              </Typography>
              <ArrowForwardIcon fontSize="small" color="action" />
              <Chip
                label={balanceA.creditor_site_name}
                size="small"
                color="success"
                variant="outlined"
              />
              <Typography
                variant="body2"
                fontWeight={700}
                sx={{ ml: "auto" }}
              >
                {formatCurrency(amountA)}
              </Typography>
            </Box>

            {/* Direction B */}
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                py: 1.5,
                flexWrap: "wrap",
              }}
            >
              <Chip
                label={balanceB.debtor_site_name}
                size="small"
                color="error"
                variant="outlined"
              />
              <Typography variant="caption" color="text.secondary">
                owes
              </Typography>
              <ArrowForwardIcon fontSize="small" color="action" />
              <Chip
                label={balanceB.creditor_site_name}
                size="small"
                color="success"
                variant="outlined"
              />
              <Typography
                variant="body2"
                fontWeight={700}
                sx={{ ml: "auto" }}
              >
                {formatCurrency(amountB)}
              </Typography>
            </Box>

            <Divider sx={{ my: 2 }} />

            {/* Offset Calculation */}
            <Paper
              sx={{
                p: 2,
                bgcolor: "primary.50",
                border: "1px solid",
                borderColor: "primary.200",
              }}
            >
              <Typography
                variant="subtitle2"
                color="primary.main"
                gutterBottom
              >
                Offset Calculation
              </Typography>

              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  mb: 0.5,
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  Offset amount (auto-adjusted)
                </Typography>
                <Typography variant="body2" fontWeight={600}>
                  {formatCurrency(offsetAmount)}
                </Typography>
              </Box>

              <Box
                sx={{ display: "flex", justifyContent: "space-between" }}
              >
                <Typography variant="body2" color="text.secondary">
                  Net remaining
                </Typography>
                <Typography
                  variant="body2"
                  fontWeight={700}
                  color={
                    netRemaining > 0 ? "warning.main" : "success.main"
                  }
                >
                  {netRemaining > 0
                    ? formatCurrency(netRemaining)
                    : "Fully settled!"}
                </Typography>
              </Box>

              {netRemaining > 0 && (
                <Box
                  sx={{
                    mt: 1.5,
                    pt: 1.5,
                    borderTop: "1px dashed",
                    borderColor: "primary.200",
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    flexWrap: "wrap",
                  }}
                >
                  <Chip label={netPayerName} size="small" color="warning" />
                  <Typography variant="body2">
                    pays {formatCurrency(netRemaining)} to
                  </Typography>
                  <Chip
                    label={netReceiverName}
                    size="small"
                    color="success"
                    variant="outlined"
                  />
                </Box>
              )}
            </Paper>

            {/* What will happen */}
            <Alert severity="info" sx={{ mt: 2 }}>
              <Typography variant="body2">
                <strong>What happens:</strong>
              </Typography>
              <Typography variant="body2" component="div">
                <ul style={{ margin: "4px 0", paddingLeft: 20 }}>
                  <li>Both directions are generated as settlements</li>
                  <li>
                    {formatCurrency(offsetAmount)} offset applied as adjustment
                    on both
                  </li>
                  {netRemaining > 0 ? (
                    <li>
                      You will enter payment details for the remaining{" "}
                      {formatCurrency(netRemaining)} in the next step
                    </li>
                  ) : (
                    <li>Both settlements fully closed (equal amounts)</li>
                  )}
                  <li>Material expenses created for both sites</li>
                </ul>
              </Typography>
            </Alert>

            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}
          </>
        ) : (
          /* ========== STEP 2: Payment Details for Net Remaining ========== */
          <Grid container spacing={2}>
            {/* Error Alert */}
            {error && (
              <Grid size={12}>
                <Alert severity="error" onClose={() => setError("")}>
                  {error}
                </Alert>
              </Grid>
            )}

            {/* Payment Summary */}
            <Grid size={12}>
              <Paper variant="outlined" sx={{ p: 2, bgcolor: "primary.50" }}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "center",
                    gap: 2,
                    alignItems: "center",
                    mb: 1.5,
                  }}
                >
                  <Box sx={{ textAlign: "center" }}>
                    <Typography variant="caption" color="text.secondary">
                      Payer
                    </Typography>
                    <Chip
                      label={netPayerName}
                      color="warning"
                      sx={{ display: "block", mt: 0.5 }}
                    />
                  </Box>
                  <ArrowForwardIcon color="action" />
                  <Box sx={{ textAlign: "center" }}>
                    <Typography variant="caption" color="text.secondary">
                      Receiver
                    </Typography>
                    <Chip
                      label={netReceiverName}
                      color="success"
                      sx={{ display: "block", mt: 0.5 }}
                    />
                  </Box>
                </Box>

                <Divider sx={{ my: 1 }} />

                <Box sx={{ textAlign: "center" }}>
                  <Typography variant="caption" color="text.secondary">
                    Net Payment Amount
                  </Typography>
                  <Typography
                    variant="h4"
                    fontWeight={600}
                    color="primary.main"
                  >
                    {formatCurrency(netRemaining)}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                  >
                    (after {formatCurrency(offsetAmount)} offset)
                  </Typography>
                </Box>
              </Paper>
            </Grid>

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

            {/* Payment Source */}
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                select
                fullWidth
                label="Payment Source"
                value={paymentSource}
                onChange={(e) => setPaymentSource(e.target.value)}
                required
              >
                <MenuItem value="company">Company</MenuItem>
                <MenuItem value="amma_money">Amma Money</MenuItem>
                <MenuItem value="engineer_own">Engineer Own</MenuItem>
                <MenuItem value="client_money">Client Money</MenuItem>
                <MenuItem value="other">Other</MenuItem>
              </TextField>
            </Grid>

            {/* Payment Date */}
            <Grid size={12}>
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
                label="Payment Reference / Transaction ID"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="e.g., UPI transaction ID, bank reference number"
                helperText="Enter the transaction reference for tracking"
              />
            </Grid>

            {/* Payment Proof Upload - for UPI/Bank Transfer */}
            {(paymentMode === "upi" || paymentMode === "bank_transfer") && (
              <Grid size={12}>
                <Typography
                  variant="subtitle2"
                  fontWeight={600}
                  sx={{ mb: 1 }}
                >
                  Payment Proof *
                </Typography>
                <FileUploader
                  supabase={supabase}
                  bucketName="settlements"
                  folderPath={`inter-site/net-settlement`}
                  fileNamePrefix="payment_proof"
                  accept="all"
                  maxSizeMB={10}
                  label=""
                  helperText="Upload screenshot or receipt of payment"
                  value={paymentProof}
                  onUpload={(file) => setPaymentProof(file)}
                  onRemove={() => setPaymentProof(null)}
                  onError={(err) => setError(err)}
                  compact
                />
              </Grid>
            )}

            {/* Subcontract Linking (optional) */}
            {activeSubcontracts.length > 0 && (
              <Grid size={12}>
                <TextField
                  select
                  fullWidth
                  label="Link to Subcontract (Optional)"
                  value={subcontractId}
                  onChange={(e) => setSubcontractId(e.target.value)}
                  helperText={`Link this payment to a subcontract for ${netPayerName}`}
                >
                  <MenuItem value="">
                    <em>No subcontract</em>
                  </MenuItem>
                  {activeSubcontracts.map((sc: any) => (
                    <MenuItem key={sc.id} value={sc.id}>
                      {sc.title}
                      {sc.laborer_name ? ` - ${sc.laborer_name}` : ""}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
            )}

            {/* Notes */}
            <Grid size={12}>
              <TextField
                fullWidth
                multiline
                rows={2}
                label="Notes (Optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any additional notes about this settlement..."
              />
            </Grid>

            {/* Info Alert */}
            <Grid size={12}>
              <Alert
                severity="info"
                icon={<ExpenseIcon />}
                sx={{ fontSize: "0.85rem" }}
              >
                <strong>What will happen:</strong>
                <ul style={{ margin: "8px 0 0 0", paddingLeft: "20px" }}>
                  <li>
                    Both settlements marked as <strong>Completed</strong>
                  </li>
                  <li>
                    <strong>Material Expenses</strong> created for both sites
                  </li>
                  <li>
                    Payment record with proof stored
                  </li>
                  <li>
                    All batch usage records marked as settled
                  </li>
                </ul>
              </Alert>
            </Grid>
          </Grid>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        {step === 2 && (
          <Button
            onClick={() => {
              setStep(1);
              setError(null);
            }}
            disabled={netSettlement.isPending}
          >
            Back
          </Button>
        )}
        <Box sx={{ flex: 1 }} />
        <Button onClick={handleClose} disabled={netSettlement.isPending}>
          Cancel
        </Button>
        {step === 1 ? (
          netRemaining > 0 ? (
            <Button
              variant="contained"
              onClick={() => {
                setError(null);
                setStep(2);
              }}
              startIcon={<ArrowForwardIcon />}
            >
              Next: Enter Payment
            </Button>
          ) : (
            <Button
              variant="contained"
              onClick={handleConfirm}
              disabled={netSettlement.isPending}
              startIcon={
                netSettlement.isPending ? (
                  <CircularProgress size={20} color="inherit" />
                ) : (
                  <CompareArrowsIcon />
                )
              }
            >
              {netSettlement.isPending
                ? "Processing..."
                : "Confirm Net Settlement"}
            </Button>
          )
        ) : (
          <Button
            variant="contained"
            color="success"
            onClick={handleConfirm}
            disabled={netSettlement.isPending}
            startIcon={
              netSettlement.isPending ? (
                <CircularProgress size={20} color="inherit" />
              ) : (
                <CompareArrowsIcon />
              )
            }
          >
            {netSettlement.isPending
              ? "Processing..."
              : `Confirm & Pay ${formatCurrency(netRemaining)}`}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
