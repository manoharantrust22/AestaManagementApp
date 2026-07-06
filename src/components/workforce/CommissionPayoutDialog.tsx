"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import { useAuth } from "@/contexts/AuthContext";
import { useMesthriCommissionPayable } from "@/hooks/queries/useMesthriCommissionPayable";
import { usePayMesthriCommission } from "@/hooks/mutations/usePayMesthriCommission";
import { requiresPayerName, type PayerSource } from "@/types/settlement.types";
import type { PaymentMode } from "@/types/payment.types";
import { formatCurrencyFull } from "@/lib/formatters";
import { blurOnWheel } from "@/lib/utils/numberInput";

const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "net_banking", label: "Bank transfer" },
  { value: "other", label: "Other" },
];

const PAYER_SOURCES: { value: PayerSource; label: string }[] = [
  { value: "own_money", label: "Own money" },
  { value: "client_money", label: "Client money" },
  { value: "amma_money", label: "Amma money" },
  { value: "mothers_money", label: "Mother's money" },
  { value: "trust_account", label: "Trust account" },
  { value: "other_site_money", label: "Other site money" },
  { value: "custom", label: "Other (name it)" },
];

/**
 * Record a commission payout to a mesthri (payment_type='commission'). Direct payment
 * (office/owner pays the mesthri). Defaults the amount to the outstanding payable.
 */
export default function CommissionPayoutDialog({
  open,
  onClose,
  siteId,
  collectorLaborerId,
  collectorName,
}: {
  open: boolean;
  onClose: () => void;
  siteId: string;
  collectorLaborerId: string;
  collectorName: string;
}) {
  const { userProfile } = useAuth();
  const { data: payableRows } = useMesthriCommissionPayable(
    open ? siteId : null,
    collectorLaborerId,
  );
  const payable = payableRows?.[0]?.payable ?? 0;
  const payMut = usePayMesthriCommission();

  const [amount, setAmount] = useState<number>(0);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash");
  const [payerSource, setPayerSource] = useState<PayerSource>("own_money");
  const [customPayerName, setCustomPayerName] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setAmount(Math.max(0, Math.round(payable * 100) / 100));
    setPaymentMode("cash");
    setPayerSource("own_money");
    setCustomPayerName("");
    setNotes("");
    setError("");
  }, [open, payable]);

  const handleSubmit = async () => {
    if (!userProfile) {
      setError("Not signed in.");
      return;
    }
    if (amount <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    if (requiresPayerName(payerSource) && !customPayerName.trim()) {
      setError("Name the payer.");
      return;
    }
    const res = await payMut.mutateAsync({
      siteId,
      collectorLaborerId,
      collectorName,
      amount,
      paymentMode,
      paymentChannel: "direct",
      payerSource,
      customPayerName: customPayerName.trim() || undefined,
      notes: notes.trim() || undefined,
      userId: userProfile.id,
      userName: userProfile.name ?? "",
    });
    if (res.success) {
      onClose();
    } else {
      setError(res.error || "Failed to record commission payout.");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>
        Pay commission — {collectorName}
        <Typography variant="caption" color="text.secondary" component="div">
          Outstanding payable: {formatCurrencyFull(payable)}
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 0.5 }}>
          <TextField
            label="Amount"
            type="number"
            value={amount || ""}
            onChange={(e) => setAmount(Number(e.target.value))}
            onWheel={blurOnWheel}
            slotProps={{ input: { startAdornment: "₹" } }}
            helperText={amount > payable ? "More than the outstanding payable" : undefined}
            fullWidth
          />
          <FormControl fullWidth>
            <InputLabel>Payment mode</InputLabel>
            <Select
              value={paymentMode}
              label="Payment mode"
              onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
            >
              {PAYMENT_MODES.map((m) => (
                <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth>
            <InputLabel>Paid from</InputLabel>
            <Select
              value={payerSource}
              label="Paid from"
              onChange={(e) => setPayerSource(e.target.value as PayerSource)}
            >
              {PAYER_SOURCES.map((s) => (
                <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          {requiresPayerName(payerSource) && (
            <TextField
              label="Payer name"
              value={customPayerName}
              onChange={(e) => setCustomPayerName(e.target.value)}
              fullWidth
            />
          )}
          <TextField
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            multiline
            rows={2}
            fullWidth
          />
          {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={payMut.isPending}>
          {payMut.isPending ? "Recording…" : "Record payout"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
