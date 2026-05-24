"use client";

import { useState, useEffect } from "react";
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
  Autocomplete,
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useRecordRentalAdvance } from "@/hooks/queries/useRentals";
import { useSiteSubcontracts } from "@/hooks/queries/useSubcontracts";
import FileUploader, { UploadedFile } from "@/components/common/FileUploader";
import PayerSourceSplitInput from "@/components/settlement/PayerSourceSplitInput";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import {
  validatePayerSourceInput,
  toRpcArgs,
} from "@/lib/settlement/payerSource";
import type {
  RentalOrderWithDetails,
  RentalAdvanceFormData,
} from "@/types/rental.types";
import type { PayerSourceInput } from "@/types/settlement.types";
import dayjs from "dayjs";

type PaymentMode = "cash" | "upi" | "bank_transfer" | "cheque";

interface RentalAdvanceDialogProps {
  open: boolean;
  onClose: () => void;
  order: RentalOrderWithDetails;
  onSuccess?: () => void;
}

const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cheque", label: "Cheque" },
];

const PAYMENT_CHANNELS = [
  { value: "direct", label: "Direct to Vendor" },
  { value: "engineer_wallet", label: "Engineer Wallet" },
];

export default function RentalAdvanceDialog({
  open,
  onClose,
  order,
  onSuccess,
}: RentalAdvanceDialogProps) {
  const isMobile = useIsMobile();
  const supabase = createClient();
  const recordAdvance = useRecordRentalAdvance();
  const { userProfile } = useAuth();
  const isSiteEngineer = userProfile?.role === "site_engineer";
  const { data: subcontracts = [] } = useSiteSubcontracts(order.site_id);

  const [subcontractId, setSubcontractId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState<Omit<RentalAdvanceFormData, "rental_order_id">>({
    advance_date: dayjs().format("YYYY-MM-DD"),
    amount: 0,
    payment_mode: "upi",
    payment_channel: "direct",
    payer_source: undefined,
    payer_name: undefined,
    proof_url: undefined,
    notes: undefined,
  });
  const [payer, setPayer] = useState<PayerSourceInput>({
    mode: "single",
    source: "own_money",
  });

  // Calculate current totals
  const totalAdvancesPaid = order.total_advance_paid || 0;
  // For completed orders use stored actual_total; live accrual would over-count past today
  const accruedCost =
    order.status === "completed"
      ? (order.actual_total || order.accrued_rental_cost || 0)
      : (order.accrued_rental_cost || 0);
  const currentBalance = accruedCost - totalAdvancesPaid;

  // For completed/historical orders default to return date; otherwise today
  const defaultDate =
    order.status === "completed" && order.actual_return_date
      ? dayjs(order.actual_return_date).format("YYYY-MM-DD")
      : dayjs().format("YYYY-MM-DD");

  useEffect(() => {
    if (open) {
      // Reset form
      setFormData({
        advance_date: defaultDate,
        amount: Math.max(0, currentBalance),
        payment_mode: "upi",
        payment_channel: "direct",
        payer_source: undefined,
        payer_name: undefined,
        proof_url: undefined,
        notes: undefined,
      });
      setPayer({ mode: "single", source: "own_money" });
      setSubcontractId(null);
      setError("");
    }
  }, [open, currentBalance, defaultDate]);

  const handleChange = (field: keyof typeof formData, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  // Site engineers always pay via their wallet from own_money; the picker is
  // hidden for them, so we force a single-source own_money input regardless of
  // any stale state in `payer`.
  const effectivePayer: PayerSourceInput = isSiteEngineer
    ? { mode: "single", source: "own_money" }
    : payer;

  const handleSubmit = async () => {
    if (formData.amount <= 0) {
      setError("Amount must be greater than 0");
      return;
    }

    const payerCheck = validatePayerSourceInput(effectivePayer, formData.amount);
    if (!payerCheck.ok) {
      setError(payerCheck.reason);
      return;
    }
    const payerRpc = toRpcArgs(effectivePayer);

    try {
      await recordAdvance.mutateAsync({
        rental_order_id: order.id,
        advance_date: formData.advance_date,
        amount: formData.amount,
        payment_mode: formData.payment_mode,
        payment_channel: isSiteEngineer ? "engineer_wallet" : formData.payment_channel,
        payer_source: payerRpc.p_payer_source,
        payer_name: payerRpc.p_payer_name ?? undefined,
        payer_source_split: payerRpc.p_payer_source_split,
        proof_url: formData.proof_url || undefined,
        notes: formData.notes || undefined,
        subcontract_id: subcontractId || undefined,
      });
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message || "Failed to record advance");
    }
  };

  const isLoading = recordAdvance.isPending;

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
          <Typography variant="h6" component="span">Record Advance Payment</Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
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
            </Paper>
          </Grid>

          {/* Current Balance Summary */}
          <Grid size={12}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Box display="flex" justifyContent="space-between" mb={1}>
                <Typography variant="body2" color="text.secondary">
                  {order.status === "completed" ? "Total Rental Amount" : "Accrued Rental Cost"}
                </Typography>
                <Typography variant="body2" fontWeight={600}>
                  ₹{accruedCost.toLocaleString()}
                </Typography>
              </Box>
              <Box display="flex" justifyContent="space-between" mb={1}>
                <Typography variant="body2" color="text.secondary">
                  Advances Paid So Far
                </Typography>
                <Typography variant="body2" fontWeight={600} color="success.main">
                  -₹{totalAdvancesPaid.toLocaleString()}
                </Typography>
              </Box>
              <Box
                display="flex"
                justifyContent="space-between"
                pt={1}
                borderTop={1}
                borderColor="divider"
              >
                <Typography variant="body2" fontWeight={600}>
                  Current Balance
                </Typography>
                <Typography
                  variant="body2"
                  fontWeight={700}
                  color={currentBalance > 0 ? "error.main" : "success.main"}
                >
                  ₹{currentBalance.toLocaleString()}
                </Typography>
              </Box>
            </Paper>
          </Grid>

          {/* Advance Date */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              required
              type="date"
              label="Payment Date"
              value={formData.advance_date}
              onChange={(e) => handleChange("advance_date", e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>

          {/* Amount */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              required
              type="number"
              label="Amount"
              value={formData.amount || ""}
              onChange={(e) =>
                handleChange("amount", Math.max(0, parseFloat(e.target.value) || 0))
              }
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">₹</InputAdornment>
                ),
              }}
            />
          </Grid>

          {/* Payment Mode */}
          <Grid size={{ xs: 12, sm: 6 }}>
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

          {/* Payment Channel */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControl fullWidth required>
              <InputLabel>Payment Channel</InputLabel>
              <Select
                value={formData.payment_channel}
                label="Payment Channel"
                onChange={(e) => handleChange("payment_channel", e.target.value)}
              >
                {PAYMENT_CHANNELS.map((channel) => (
                  <MenuItem key={channel.value} value={channel.value}>
                    {channel.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {/* Payer Source */}
          <Grid size={12}>
            {isSiteEngineer ? (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  px: 1.5,
                  py: 1,
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 1,
                  bgcolor: "grey.50",
                }}
              >
                <AccountBalanceWalletIcon fontSize="small" color="action" />
                <Typography variant="body2" color="text.secondary">
                  Payment source: <strong>Engineer Wallet</strong>
                </Typography>
              </Box>
            ) : (
              <>
                <PayerSourceSplitInput
                  value={payer}
                  onChange={setPayer}
                  total={formData.amount}
                  siteId={order.site_id}
                  disabled={isLoading}
                />
                {(() => {
                  const c = validatePayerSourceInput(payer, formData.amount);
                  return !c.ok && payer.mode === "split" ? (
                    <Typography variant="caption" color="error.main">
                      {c.reason}
                    </Typography>
                  ) : null;
                })()}
              </>
            )}
          </Grid>

          {/* Payment Proof */}
          {formData.payment_mode === "upi" && (
            <Grid size={12}>
              <FileUploader
                supabase={supabase}
                bucketName="payment-proofs"
                folderPath={`rentals/${order.id}`}
                fileNamePrefix="advance"
                accept="image"
                label="Payment Screenshot"
                helperText="Upload screenshot of UPI payment"
                compact
                uploadOnSelect
                value={
                  formData.proof_url
                    ? { name: "Payment Proof", size: 0, url: formData.proof_url }
                    : null
                }
                onUpload={(file: UploadedFile) =>
                  handleChange("proof_url", file.url)
                }
                onRemove={() => handleChange("proof_url", undefined)}
              />
            </Grid>
          )}

          {/* Notes */}
          <Grid size={12}>
            <TextField
              fullWidth
              multiline
              rows={2}
              label="Notes"
              value={formData.notes || ""}
              onChange={(e) => handleChange("notes", e.target.value)}
              placeholder="Any additional notes..."
            />
          </Grid>

          {/* Subcontract / Trade */}
          {subcontracts.length > 0 && (
            <Grid size={12}>
              <Autocomplete
                options={subcontracts}
                getOptionLabel={(opt) =>
                  opt.laborer_name ? `${opt.title} (${opt.laborer_name})` : opt.title
                }
                value={subcontracts.find((s) => s.id === subcontractId) ?? null}
                onChange={(_, newVal) => setSubcontractId(newVal?.id ?? null)}
                slotProps={{ popper: { disablePortal: false } }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Subcontract / Trade (optional)"
                    helperText="Links this advance to the correct trade in expenses"
                  />
                )}
              />
            </Grid>
          )}

          {/* After Payment Summary */}
          <Grid size={12}>
            <Paper
              variant="outlined"
              sx={{
                p: 2,
                bgcolor: formData.amount > 0 ? "success.50" : "grey.50",
              }}
            >
              <Box display="flex" justifyContent="space-between">
                <Typography variant="body2" fontWeight={600}>
                  Balance After This Payment
                </Typography>
                <Typography
                  variant="body2"
                  fontWeight={700}
                  color={
                    currentBalance - formData.amount > 0
                      ? "error.main"
                      : "success.main"
                  }
                >
                  ₹{(currentBalance - formData.amount).toLocaleString()}
                </Typography>
              </Box>
            </Paper>
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={
            isLoading ||
            formData.amount <= 0 ||
            !validatePayerSourceInput(effectivePayer, formData.amount).ok
          }
        >
          {isLoading ? "Recording..." : "Record Advance"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
