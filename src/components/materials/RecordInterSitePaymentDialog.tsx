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
  Receipt as ExpenseIcon,
} from "@mui/icons-material";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  useRecordSettlementPayment,
  useInterSiteSettlement,
  useUsedOffsetExpenseIds,
} from "@/hooks/queries/useInterSiteSettlements";
import { useGroupMaterialPurchases } from "@/hooks/queries/useMaterialPurchases";
import { useSiteSubcontracts } from "@/hooks/queries/useSubcontracts";
import {
  eligibleOffsetPurchases,
  suggestedOffsetAmount,
  offsetReference,
  offsetNote,
} from "@/lib/material-hub/offsetPurchase";
import { useAuth } from "@/contexts/AuthContext";
import { formatCurrency, formatDate } from "@/lib/formatters";
import FileUploader, { UploadedFile } from "@/components/common/FileUploader";
import { createClient } from "@/lib/supabase/client";

interface RecordInterSitePaymentDialogProps {
  open: boolean;
  onClose: () => void;
  settlementId: string;
  debtorSiteId: string;
  debtorSiteName: string;
  creditorSiteId: string;
  creditorSiteName: string;
  amount: number;
}

export default function RecordInterSitePaymentDialog({
  open,
  onClose,
  settlementId,
  debtorSiteId,
  debtorSiteName,
  creditorSiteId,
  creditorSiteName,
  amount,
}: RecordInterSitePaymentDialogProps) {
  const isMobile = useIsMobile();
  const { userProfile } = useAuth();
  const supabase = createClient();

  // Fetch settlement details with items
  const { data: settlement } = useInterSiteSettlement(settlementId);
  const recordPayment = useRecordSettlementPayment();

  // Fetch subcontracts for debtor site (payment source)
  const { data: subcontracts = [] } = useSiteSubcontracts(debtorSiteId);

  // Offset-against-a-purchase (adjustment mode): the debtor can clear the debt
  // with a material purchase they funded for the creditor instead of cash.
  const groupId = (settlement?.site_group_id as string | undefined) ?? undefined;
  const { data: groupPurchases = [] } = useGroupMaterialPurchases(groupId);
  const { data: usedOffsetIds } = useUsedOffsetExpenseIds(groupId);
  const offsetCandidates = useMemo(
    () => eligibleOffsetPurchases(groupPurchases as any[], debtorSiteId, usedOffsetIds),
    [groupPurchases, debtorSiteId, usedOffsetIds]
  );
  // Amount still outstanding on this settlement (total − already paid).
  const pending = Number(
    settlement?.pending_amount ??
      Number(settlement?.total_amount ?? amount) - Number(settlement?.paid_amount ?? 0)
  );

  // Form state
  const [paymentMode, setPaymentMode] = useState<string>("upi");
  const [paymentSource, setPaymentSource] = useState<string>("company");
  const [paymentDate, setPaymentDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [paymentReference, setPaymentReference] = useState<string>("");
  const [paymentProof, setPaymentProof] = useState<UploadedFile | null>(null);
  const [subcontractId, setSubcontractId] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<boolean>(false);
  // Adjustment-mode offset: which funded purchase, and the amount to apply.
  const [offsetPurchaseId, setOffsetPurchaseId] = useState<string>("");
  const [payAmountStr, setPayAmountStr] = useState<string>("");
  // True once the user edits the amount, so the default stops tracking `pending`.
  const [amountTouched, setAmountTouched] = useState<boolean>(false);

  // Get active subcontracts
  const activeSubcontracts = subcontracts.filter(
    (sc: any) => sc.status === "active" || sc.status === "on_hold"
  );

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setPaymentMode("upi");
      setPaymentSource("company");
      setPaymentDate(new Date().toISOString().split("T")[0]);
      setPaymentReference("");
      setPaymentProof(null);
      setSubcontractId("");
      setNotes("");
      setError("");
      setSuccess(false);
      setOffsetPurchaseId("");
      setPayAmountStr("");
      setAmountTouched(false);
    }
  }, [open]);

  // Default the (adjustment) amount to the outstanding balance, and keep it in
  // sync if `pending` changes (e.g. after a reciprocal offset partially pays this
  // settlement) — until the user edits it.
  useEffect(() => {
    if (open && settlement && !amountTouched) {
      setPayAmountStr(String(pending));
    }
  }, [open, settlement, pending, amountTouched]);

  // Apply a chosen offset purchase: suggest the amount + fill the reference/note.
  const applyOffsetPurchase = (purchaseId: string) => {
    setOffsetPurchaseId(purchaseId);
    const p = offsetCandidates.find((c) => c.id === purchaseId);
    if (!p) return;
    setAmountTouched(true);
    setPayAmountStr(String(suggestedOffsetAmount(Number(p.total_amount), pending)));
    setPaymentReference(offsetReference(p.ref_code));
    setNotes((prev) => (prev ? prev : offsetNote(p)));
  };

  // Adjustment (offset) pays a user-chosen amount; cash/UPI/bank settle the
  // outstanding balance (= total for a fresh settlement, the remainder after a
  // partial offset). `fullySettles` drives the partial-vs-complete copy.
  const isAdjustment = paymentMode === "adjustment";
  const payAmount = isAdjustment ? Number(payAmountStr) : pending;
  const fullySettles = payAmount >= pending - 0.005;

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
    if (isAdjustment) {
      if (!payAmount || payAmount <= 0) {
        setError("Enter the amount this offset covers");
        return;
      }
      if (payAmount > pending + 0.005) {
        setError(`Offset can't exceed the ${formatCurrency(pending)} still owed`);
        return;
      }
    }
    if ((paymentMode === "upi" || paymentMode === "bank_transfer") && !paymentProof) {
      setError("Please upload payment proof for UPI/Bank Transfer");
      return;
    }

    try {
      await recordPayment.mutateAsync({
        settlement_id: settlementId,
        amount: payAmount,
        payment_date: paymentDate,
        payment_mode: paymentMode as any,
        // Adjustments aren't a cash source, so don't attribute a payment source.
        payment_source: isAdjustment ? undefined : paymentSource || undefined,
        // Hard-link the offsetting purchase (audit + prevents double-use).
        offset_expense_id: isAdjustment ? offsetPurchaseId || undefined : undefined,
        reference_number: paymentReference || undefined,
        notes: notes ? `${notes}${subcontractId ? ` | Linked to subcontract` : ""}${paymentProof ? ` | Proof: ${paymentProof.url}` : ""}` : undefined,
        userId: userProfile?.id,
      });

      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "Failed to record payment");
    }
  };

  // Success view
  if (success) {
    return (
      <Dialog open={open} onClose={(_event, reason) => { if (reason !== "backdropClick") onClose(); }} maxWidth="sm" fullWidth>
        <DialogContent sx={{ textAlign: "center", py: 4 }}>
          <SuccessIcon color="success" sx={{ fontSize: 64, mb: 2 }} />
          <Typography variant="h5" gutterBottom fontWeight={600}>
            {fullySettles ? "Settlement Completed!" : "Payment Recorded"}
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
            {fullySettles
              ? `${isAdjustment ? "Offset" : "Payment"} recorded — the settlement is fully cleared.`
              : `${formatCurrency(payAmount)} applied. ${formatCurrency(Math.max(0, pending - payAmount))} is still owed.`}
          </Typography>

          <Box sx={{ display: "flex", justifyContent: "center", gap: 2, alignItems: "center", mb: 2 }}>
            <Chip label={debtorSiteName} color="warning" />
            <ArrowIcon />
            <Chip label={creditorSiteName} color="success" />
          </Box>

          <Typography variant="h5" fontWeight={600} color="success.main" sx={{ mb: 2 }}>
            {formatCurrency(payAmount)}
          </Typography>

          <Divider sx={{ my: 2 }} />

          {fullySettles ? (
            <Alert severity="success" sx={{ textAlign: "left" }}>
              <strong>What was created:</strong>
              <ul style={{ margin: "8px 0 0 0", paddingLeft: "20px" }}>
                <li>Settlement marked as completed</li>
                <li>Material expense added to {debtorSiteName}</li>
                <li>Payment record{isAdjustment ? " (offset)" : " with proof"} stored</li>
                <li>Visible in All-Site Expenses under Materials</li>
              </ul>
            </Alert>
          ) : (
            <Alert severity="info" sx={{ textAlign: "left" }}>
              Partial {isAdjustment ? "offset" : "payment"} recorded. The settlement stays{" "}
              <strong>raised · awaiting payment</strong> until the balance is cleared.
            </Alert>
          )}
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
      onClose={onClose}
      maxWidth="md"
      fullWidth
      fullScreen={isMobile}
    >
      <DialogTitle>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <SettlementIcon color="primary" />
          <Typography variant="h6" component="span">Record Inter-Site Payment</Typography>
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
                <Typography variant="h4" fontWeight={600} color="primary.main">
                  {formatCurrency(settlement?.total_amount || amount)}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                  {settlement?.items?.length || 0} material usage records
                </Typography>
              </Box>
            </Paper>
          </Grid>

          {/* Settlement Items Table */}
          {settlement?.items && settlement.items.length > 0 && (
            <Grid size={12}>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                Material Usage Details
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
                    {settlement.items.map((item: any) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <Typography variant="body2">
                            {formatDate(item.usage_date)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {item.material?.name || "Material"}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2">
                            {item.quantity_used} {item.unit}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" fontWeight={500}>
                            {formatCurrency(item.total_cost)}
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
                          {formatCurrency(settlement.total_amount)}
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

          {/* Adjustment → editable offset amount; cash paths → payment source. */}
          {isAdjustment ? (
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                type="number"
                label="Offset amount"
                value={payAmountStr}
                onChange={(e) => {
                  setPayAmountStr(e.target.value);
                  setAmountTouched(true);
                }}
                required
                inputProps={{ min: 0, max: pending, step: "0.01" }}
                helperText={`Outstanding: ${formatCurrency(pending)}`}
              />
            </Grid>
          ) : (
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
          )}

          {/* Offset against a purchase (adjustment only) */}
          {isAdjustment && (
            <>
              <Grid size={12}>
                <TextField
                  select
                  fullWidth
                  label="Offset against a purchase (optional)"
                  value={offsetPurchaseId}
                  onChange={(e) => applyOffsetPurchase(e.target.value)}
                  helperText={
                    offsetCandidates.length === 0
                      ? `No purchases funded by ${debtorSiteName} found to offset against`
                      : `Pick a purchase ${debtorSiteName} funded for ${creditorSiteName}`
                  }
                >
                  <MenuItem value="">
                    <em>None — manual adjustment</em>
                  </MenuItem>
                  {offsetCandidates.map((p) => (
                    <MenuItem key={p.id} value={p.id}>
                      {p.ref_code} · {(p.vendor_name ?? p.vendor?.name) || "vendor"} ·{" "}
                      {formatCurrency(Number(p.total_amount))}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={12}>
                <Alert severity="warning" sx={{ fontSize: "0.85rem" }}>
                  Use an offset only for a purchase <strong>{debtorSiteName}</strong> funded for{" "}
                  <strong>{creditorSiteName}</strong> that isn&apos;t already settling as group stock —
                  otherwise the debt is counted twice. No cash is recorded as leaving; this just clears the debt.
                </Alert>
              </Grid>
            </>
          )}

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
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                Payment Proof *
              </Typography>
              <FileUploader
                supabase={supabase}
                bucketName="settlements"
                folderPath={`inter-site/${settlementId}`}
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
                helperText={`Link this payment to a subcontract for ${debtorSiteName}`}
              >
                <MenuItem value="">
                  <em>No subcontract</em>
                </MenuItem>
                {activeSubcontracts.map((sc: any) => (
                  <MenuItem key={sc.id} value={sc.id}>
                    {sc.title}{sc.laborer_name ? ` - ${sc.laborer_name}` : ""}
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
            <Alert severity="info" icon={<ExpenseIcon />} sx={{ fontSize: "0.85rem" }}>
              <strong>What will happen:</strong>
              {fullySettles ? (
                <ul style={{ margin: "8px 0 0 0", paddingLeft: "20px" }}>
                  <li>Settlement will be marked as <strong>Completed</strong></li>
                  <li>A <strong>Material Expense</strong> record will be created for <strong>{debtorSiteName}</strong></li>
                  <li>This expense will appear in <strong>All-Site Expenses</strong> under the Materials category</li>
                  <li>Payment {isAdjustment ? "offset" : "proof"} and reference will be stored with the expense record</li>
                  <li>Settlement details including all material usage will be linked to the expense</li>
                </ul>
              ) : (
                <ul style={{ margin: "8px 0 0 0", paddingLeft: "20px" }}>
                  <li><strong>{formatCurrency(payAmount)}</strong> will be applied; <strong>{formatCurrency(Math.max(0, pending - payAmount))}</strong> will remain owed</li>
                  <li>The settlement stays <strong>raised · awaiting payment</strong> until fully cleared</li>
                  <li>The material expense is created only when the balance reaches zero</li>
                </ul>
              )}
            </Alert>
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={recordPayment.isPending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="success"
          onClick={handleSubmit}
          disabled={recordPayment.isPending}
          startIcon={<SettlementIcon />}
        >
          {recordPayment.isPending ? "Processing..." : "Confirm Payment"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
