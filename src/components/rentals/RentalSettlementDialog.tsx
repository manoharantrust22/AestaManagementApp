"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Box,
  Typography,
  IconButton,
  Alert,
  Paper,
  InputAdornment,
  Divider,
} from "@mui/material";
import {
  AccountBalanceWallet as WalletIcon,
  Close as CloseIcon,
} from "@mui/icons-material";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  useSettleRental,
  useRentalCostCalculation,
} from "@/hooks/queries/useRentals";
import { useSiteSubcontracts } from "@/hooks/queries/useSubcontracts";
import FileUploader, { UploadedFile } from "@/components/common/FileUploader";
import PayerSourceSplitInput from "@/components/settlement/PayerSourceSplitInput";
import { useAuth } from "@/contexts/AuthContext";
import { isSiteEngineerPayingFromWallet } from "@/components/expenses/walletPayerLock";
import { createClient } from "@/lib/supabase/client";
import {
  validatePayerSourceInput,
  toRpcArgs,
} from "@/lib/settlement/payerSource";
import type {
  RentalOrderWithDetails,
  RentalSettlementFormData,
} from "@/types/rental.types";
import type { PayerSourceInput } from "@/types/settlement.types";
import dayjs from "dayjs";

type PaymentMode = "cash" | "upi" | "bank_transfer" | "cheque";

interface RentalSettlementDialogProps {
  open: boolean;
  onClose: () => void;
  order: RentalOrderWithDetails;
  onSuccess?: () => void;
  /**
   * When provided, renders a "Pay from wallet instead" affordance at the top
   * of the dialog. Caller is expected to close this dialog and open
   * RentalSettleViaWallet with the same order context. Wired by callers that
   * detect a wallet-enabled site engineer.
   */
  onSwitchToWallet?: () => void;
}

const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cheque", label: "Cheque" },
];

export default function RentalSettlementDialog({
  open,
  onClose,
  order,
  onSuccess,
  onSwitchToWallet,
}: RentalSettlementDialogProps) {
  const isMobile = useIsMobile();
  const supabase = createClient();
  const settleRental = useSettleRental();
  const { userProfile } = useAuth();
  const walletOnly = isSiteEngineerPayingFromWallet({
    userRole: userProfile?.role,
    payerType: "site_engineer",
    createWalletTransaction: true,
  });

  // Get cost calculation
  const costCalc = useRentalCostCalculation(order.id);

  const [error, setError] = useState("");
  const [useNegotiatedAmount, setUseNegotiatedAmount] = useState(false);
  const [negotiatedAmount, setNegotiatedAmount] = useState(0);
  const [payer, setPayer] = useState<PayerSourceInput>({
    mode: "single",
    source: "own_money",
  });
  const [formData, setFormData] = useState({
    settlement_date: dayjs().format("YYYY-MM-DD"),
    payment_mode: "upi" as PaymentMode,
    final_receipt_url: "",
    vendor_bill_url: "",
    upi_screenshot_url: "",
    subcontract_id: "",
    notes: "",
  });

  // Get site subcontracts for linking
  const { data: subcontracts = [] } = useSiteSubcontracts(order.site_id);

  // Calculate totals from cost calculation
  const totalRentalAmount = costCalc?.subtotal || 0;
  const totalTransportAmount = costCalc?.totalTransportCost || 0;
  const totalDamageAmount = costCalc?.damagesCost || 0;
  const discountAmount = costCalc?.discountAmount || 0;
  const grossTotal = costCalc?.grossTotal || 0;
  const totalAdvancePaid = costCalc?.advancesPaid || 0;

  // Final amount (negotiated or calculated)
  const finalAmount = useMemo(() => {
    return useNegotiatedAmount ? negotiatedAmount : grossTotal;
  }, [useNegotiatedAmount, negotiatedAmount, grossTotal]);

  const balanceAmount = finalAmount - totalAdvancePaid;

  useEffect(() => {
    if (open && costCalc) {
      setNegotiatedAmount(costCalc.grossTotal);
      setFormData({
        settlement_date: dayjs().format("YYYY-MM-DD"),
        payment_mode: "upi",
        final_receipt_url: "",
        vendor_bill_url: "",
        upi_screenshot_url: "",
        subcontract_id: "",
        notes: "",
      });
      setUseNegotiatedAmount(false);
      setPayer({ mode: "single", source: "own_money" });
      setError("");
    }
  }, [open, costCalc]);

  const handleChange = (field: keyof typeof formData, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  const handleSubmit = async () => {
    // Check if all items have been returned
    const hasOutstandingItems = (order.items || []).some(
      (item) => (item.quantity_outstanding || item.quantity - item.quantity_returned) > 0
    );

    if (hasOutstandingItems) {
      setError("All items must be returned before settlement");
      return;
    }

    const payerCheck = validatePayerSourceInput(payer, balanceAmount);
    if (!payerCheck.ok) {
      setError(payerCheck.reason);
      return;
    }
    const payerRpc = toRpcArgs(payer);

    try {
      const settlementData: RentalSettlementFormData = {
        rental_order_id: order.id,
        party_type: "vendor",
        settlement_date: formData.settlement_date,
        total_rental_amount: totalRentalAmount,
        total_transport_amount: totalTransportAmount,
        total_damage_amount: totalDamageAmount,
        negotiated_final_amount: useNegotiatedAmount ? negotiatedAmount : undefined,
        total_advance_paid: totalAdvancePaid,
        balance_amount: balanceAmount,
        payment_mode: formData.payment_mode,
        payment_channel: "direct",
        payer_source: payerRpc.p_payer_source,
        payer_name: payerRpc.p_payer_name ?? undefined,
        payer_source_split: payerRpc.p_payer_source_split,
        final_receipt_url: formData.final_receipt_url || undefined,
        vendor_bill_url: formData.vendor_bill_url || undefined,
        upi_screenshot_url: formData.upi_screenshot_url || undefined,
        subcontract_id: formData.subcontract_id || undefined,
        notes: formData.notes || undefined,
      };

      await settleRental.mutateAsync(settlementData);
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message || "Failed to settle rental");
    }
  };

  const isLoading = settleRental.isPending;

  // Check for outstanding items
  const outstandingItemsCount = (order.items || []).filter(
    (item) => (item.quantity_outstanding || item.quantity - item.quantity_returned) > 0
  ).length;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      fullScreen={isMobile}
    >
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h6" component="span">Settle Rental</Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {onSwitchToWallet && balanceAmount > 0 && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<WalletIcon fontSize="small" />}
            onClick={onSwitchToWallet}
            disabled={isLoading}
            sx={{ mb: 2, textTransform: "none" }}
          >
            Pay from wallet instead
          </Button>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {outstandingItemsCount > 0 && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {outstandingItemsCount} item(s) still outstanding. Please record all
            returns before settling.
          </Alert>
        )}

        <Grid container spacing={2}>
          {/* Order Info */}
          <Grid size={12}>
            <Paper variant="outlined" sx={{ p: 2, bgcolor: "grey.50" }}>
              <Typography variant="body2" color="text.secondary">
                Order #{order.rental_order_number}
              </Typography>
              <Typography variant="subtitle2">
                {order.vendor?.shop_name || order.vendor?.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {dayjs(order.start_date).format("DD MMM YYYY")} -{" "}
                {dayjs(formData.settlement_date).format("DD MMM YYYY")} (
                {costCalc?.daysElapsed || 0} days)
              </Typography>
            </Paper>
          </Grid>

          {/* Cost Summary */}
          <Grid size={12}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography
                variant="subtitle2"
                color="text.secondary"
                sx={{ mb: 1.5 }}
              >
                COST SUMMARY
              </Typography>

              <Box display="flex" flexDirection="column" gap={0.75}>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">
                    Rental Cost
                  </Typography>
                  <Typography variant="body2">
                    ₹{totalRentalAmount.toLocaleString()}
                  </Typography>
                </Box>

                {discountAmount > 0 && (
                  <Box display="flex" justifyContent="space-between">
                    <Typography variant="body2" color="success.main">
                      Discount
                    </Typography>
                    <Typography variant="body2" color="success.main">
                      -₹{discountAmount.toLocaleString()}
                    </Typography>
                  </Box>
                )}

                {totalTransportAmount > 0 && (
                  <Box display="flex" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">
                      Transport
                    </Typography>
                    <Typography variant="body2">
                      ₹{totalTransportAmount.toLocaleString()}
                    </Typography>
                  </Box>
                )}

                {totalDamageAmount > 0 && (
                  <Box display="flex" justifyContent="space-between">
                    <Typography variant="body2" color="error.main">
                      Damages
                    </Typography>
                    <Typography variant="body2" color="error.main">
                      ₹{totalDamageAmount.toLocaleString()}
                    </Typography>
                  </Box>
                )}

                <Divider sx={{ my: 0.5 }} />

                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2" fontWeight={600}>
                    Calculated Total
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    ₹{grossTotal.toLocaleString()}
                  </Typography>
                </Box>
              </Box>
            </Paper>
          </Grid>

          {/* Negotiated Amount */}
          <Grid size={12}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Box
                display="flex"
                alignItems="center"
                justifyContent="space-between"
                mb={1}
              >
                <Typography variant="subtitle2" color="text.secondary">
                  FINAL AMOUNT
                </Typography>
                <Button
                  size="small"
                  onClick={() => setUseNegotiatedAmount(!useNegotiatedAmount)}
                >
                  {useNegotiatedAmount ? "Use Calculated" : "Negotiate"}
                </Button>
              </Box>

              {useNegotiatedAmount ? (
                <TextField
                  fullWidth
                  type="number"
                  label="Negotiated Final Amount"
                  value={negotiatedAmount || ""}
                  onChange={(e) =>
                    setNegotiatedAmount(
                      Math.max(0, parseFloat(e.target.value) || 0)
                    )
                  }
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">₹</InputAdornment>
                    ),
                  }}
                  helperText="Enter the final agreed amount after bargaining"
                  size="small"
                />
              ) : (
                <Typography variant="h5" fontWeight={700}>
                  ₹{grossTotal.toLocaleString()}
                </Typography>
              )}
            </Paper>
          </Grid>

          {/* Settlement Summary */}
          <Grid size={12}>
            <Paper
              variant="outlined"
              sx={{
                p: 2,
                bgcolor: balanceAmount > 0 ? "error.50" : "success.50",
              }}
            >
              <Box display="flex" justifyContent="space-between" mb={1}>
                <Typography variant="body2">Final Amount</Typography>
                <Typography variant="body2" fontWeight={600}>
                  ₹{finalAmount.toLocaleString()}
                </Typography>
              </Box>
              <Box display="flex" justifyContent="space-between" mb={1}>
                <Typography variant="body2" color="success.main">
                  Advances Paid
                </Typography>
                <Typography variant="body2" color="success.main">
                  -₹{totalAdvancePaid.toLocaleString()}
                </Typography>
              </Box>
              <Divider sx={{ my: 1 }} />
              <Box display="flex" justifyContent="space-between">
                <Typography variant="subtitle1" fontWeight={700}>
                  {balanceAmount > 0 ? "Balance to Pay" : "Refund Due"}
                </Typography>
                <Typography
                  variant="h6"
                  fontWeight={700}
                  color={balanceAmount > 0 ? "error.main" : "success.main"}
                >
                  ₹{Math.abs(balanceAmount).toLocaleString()}
                </Typography>
              </Box>
            </Paper>
          </Grid>

          {/* Settlement Date */}
          <Grid size={12}>
            <TextField
              fullWidth
              required
              type="date"
              label="Settlement Date"
              value={formData.settlement_date}
              onChange={(e) => handleChange("settlement_date", e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>

          {/* Payment Mode */}
          <Grid size={12}>
            <FormControl fullWidth required>
              <InputLabel>Payment Mode</InputLabel>
              <Select
                value={formData.payment_mode}
                label="Payment Mode"
                onChange={(e) =>
                  handleChange("payment_mode", e.target.value as PaymentMode)
                }
              >
                {PAYMENT_MODES.map((mode) => (
                  <MenuItem key={mode.value} value={mode.value}>
                    {mode.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* Link to Subcontract */}
          <Grid size={12}>
            <FormControl fullWidth>
              <InputLabel>Link to Subcontract (Optional)</InputLabel>
              <Select
                value={formData.subcontract_id}
                label="Link to Subcontract (Optional)"
                onChange={(e) => handleChange("subcontract_id", e.target.value)}
              >
                <MenuItem value="">No subcontract</MenuItem>
                {subcontracts
                  .filter((sc) => sc.status === "active" || sc.status === "on_hold")
                  .map((sc) => (
                    <MenuItem key={sc.id} value={sc.id}>
                      {sc.title}
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
          </Grid>

          {/* Payer Source — hidden for site engineers (source derived from
              wallet deposit attribution in Phase 2). */}
          {!walletOnly && (
            <Grid size={12}>
              <PayerSourceSplitInput
                value={payer}
                onChange={setPayer}
                total={balanceAmount}
                siteId={order.site_id}
                disabled={isLoading}
              />
              {(() => {
                const c = validatePayerSourceInput(payer, balanceAmount);
                return !c.ok && payer.mode === "split" ? (
                  <Typography variant="caption" color="error.main">
                    {c.reason}
                  </Typography>
                ) : null;
              })()}
            </Grid>
          )}

          {/* Vendor Bill */}
          <Grid size={12}>
            <FileUploader
              supabase={supabase}
              bucketName="payment-proofs"
              folderPath={`rentals/${order.id}`}
              fileNamePrefix="vendor-bill"
              accept="image"
              label="Vendor Bill (Optional)"
              helperText="Upload the bill/invoice from the vendor"
              compact
              uploadOnSelect
              value={
                formData.vendor_bill_url
                  ? {
                      name: "Vendor Bill",
                      size: 0,
                      url: formData.vendor_bill_url,
                    }
                  : null
              }
              onUpload={(file: UploadedFile) =>
                handleChange("vendor_bill_url", file.url)
              }
              onRemove={() => handleChange("vendor_bill_url", "")}
            />
          </Grid>

          {/* UPI Payment Screenshot - show only for UPI payment mode */}
          {formData.payment_mode === "upi" && (
            <Grid size={12}>
              <FileUploader
                supabase={supabase}
                bucketName="payment-proofs"
                folderPath={`rentals/${order.id}`}
                fileNamePrefix="upi-proof"
                accept="image"
                label="UPI Payment Screenshot"
                helperText="Upload screenshot of UPI payment confirmation"
                compact
                uploadOnSelect
                value={
                  formData.upi_screenshot_url
                    ? {
                        name: "UPI Screenshot",
                        size: 0,
                        url: formData.upi_screenshot_url,
                      }
                    : null
                }
                onUpload={(file: UploadedFile) =>
                  handleChange("upi_screenshot_url", file.url)
                }
                onRemove={() => handleChange("upi_screenshot_url", "")}
              />
            </Grid>
          )}

          {/* Final Receipt */}
          <Grid size={12}>
            <FileUploader
              supabase={supabase}
              bucketName="payment-proofs"
              folderPath={`rentals/${order.id}`}
              fileNamePrefix="settlement"
              accept="image"
              label="Payment Receipt (Optional)"
              helperText="Upload the payment receipt/proof"
              compact
              uploadOnSelect
              value={
                formData.final_receipt_url
                  ? {
                      name: "Payment Receipt",
                      size: 0,
                      url: formData.final_receipt_url,
                    }
                  : null
              }
              onUpload={(file: UploadedFile) =>
                handleChange("final_receipt_url", file.url)
              }
              onRemove={() => handleChange("final_receipt_url", "")}
            />
          </Grid>

          {/* Notes */}
          <Grid size={12}>
            <TextField
              fullWidth
              multiline
              rows={2}
              label="Notes"
              value={formData.notes}
              onChange={(e) => handleChange("notes", e.target.value)}
              placeholder="Any notes about the settlement..."
            />
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="primary"
          onClick={handleSubmit}
          disabled={
            isLoading ||
            outstandingItemsCount > 0 ||
            (!walletOnly && !validatePayerSourceInput(payer, balanceAmount).ok)
          }
        >
          {isLoading ? "Settling..." : "Complete Settlement"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
