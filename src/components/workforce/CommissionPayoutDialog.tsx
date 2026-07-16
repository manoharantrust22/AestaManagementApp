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
import dayjs from "dayjs";
import { useAuth } from "@/contexts/AuthContext";
import { useSite } from "@/contexts/SiteContext";
import {
  ReceiptCapture,
  type ReceiptCaptureValue,
} from "@/components/common/ReceiptCapture";
import PayerSourceSelector from "@/components/settlement/PayerSourceSelector";
import WalletBalancePreview from "@/components/wallet-v2/WalletBalancePreview";
import { useEngineerWalletBalance } from "@/hooks/queries/useEngineerWalletV2";
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

/**
 * Record a commission payout to a mesthri (payment_type='commission'). Company/office
 * picks a payer source; a site engineer pays from their own wallet only. Defaults the
 * amount to the outstanding payable.
 */
export default function CommissionPayoutDialog({
  open,
  onClose,
  siteId,
  collectorLaborerId,
  collectorName,
  contractRefKind,
  contractRefId,
}: {
  open: boolean;
  onClose: () => void;
  siteId: string;
  collectorLaborerId: string;
  collectorName: string;
  /** When set, the payout is tagged to this contract and the amount defaults to the
   *  contract's payable rather than the mesthri's whole-site pot. */
  contractRefKind?: "task_work" | "subcontract";
  contractRefId?: string;
}) {
  const { userProfile } = useAuth();
  const { selectedSite } = useSite();
  const { data: payableRows } = useMesthriCommissionPayable(
    open ? siteId : null,
    collectorLaborerId,
    null,
    null,
    contractRefKind ?? null,
    contractRefId ?? null,
  );
  const payable = payableRows?.[0]?.payable ?? 0;
  const payMut = usePayMesthriCommission();

  const isSiteEngineer = userProfile?.role === "site_engineer";
  const balanceQuery = useEngineerWalletBalance(
    isSiteEngineer ? userProfile?.id : undefined,
    siteId,
  );

  const [amount, setAmount] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash");
  const [payerSource, setPayerSource] = useState<PayerSource>("own_money");
  const [payerName, setPayerName] = useState("");
  const [screenshot, setScreenshot] = useState<ReceiptCaptureValue | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setAmount(Math.max(0, Math.round(payable * 100) / 100));
    setPaymentDate(dayjs().format("YYYY-MM-DD"));
    setPaymentMode("cash");
    setPayerSource("own_money");
    setPayerName("");
    setScreenshot(null);
    setNotes("");
    setError("");
  }, [open, payable]);

  const isCash = paymentMode === "cash";
  const isUpi = paymentMode === "upi";

  const handleSubmit = async () => {
    if (!userProfile) {
      setError("Not signed in.");
      return;
    }
    if (amount <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    if (!isSiteEngineer && requiresPayerName(payerSource) && !payerName.trim()) {
      setError("Name the payer.");
      return;
    }
    const channel = isSiteEngineer ? "engineer_wallet" : "direct";
    const res = await payMut.mutateAsync({
      siteId,
      collectorLaborerId,
      collectorName,
      contractRefKind,
      contractRefId,
      amount,
      settlementDate: paymentDate,
      paymentMode,
      paymentChannel: channel,
      payerSource: isSiteEngineer ? "own_money" : payerSource,
      customPayerName: payerName.trim() || undefined,
      engineerId: isSiteEngineer ? userProfile.id : undefined,
      proofUrl: screenshot?.url ?? undefined,
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
          Outstanding {contractRefId ? "on this contract" : "across this site"}:{" "}
          {formatCurrencyFull(payable)}
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

          <Box sx={{ display: "flex", gap: 2 }}>
            <TextField
              label="Date"
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel>Mode</InputLabel>
              <Select
                value={paymentMode}
                label="Mode"
                onChange={(e) => {
                  const mode = e.target.value as PaymentMode;
                  setPaymentMode(mode);
                  if (mode === "cash") setScreenshot(null);
                }}
              >
                {PAYMENT_MODES.map((m) => (
                  <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          {isSiteEngineer ? (
            <WalletBalancePreview
              engineerName={userProfile?.name || "You"}
              siteName={selectedSite?.name ?? ""}
              currentBalance={balanceQuery.data?.balance ?? 0}
              amount={amount}
              isLoading={balanceQuery.isLoading}
            />
          ) : (
            <PayerSourceSelector
              value={payerSource}
              customName={payerName}
              onChange={setPayerSource}
              onCustomNameChange={setPayerName}
              siteId={siteId}
            />
          )}

          {!isCash && (
            <ReceiptCapture
              label={isUpi ? "UPI screenshot" : "Payment screenshot (optional)"}
              value={screenshot}
              onChange={setScreenshot}
              folder="commission-receipts"
              bucket="settlement-proofs"
            />
          )}

          <TextField
            label="Notes (optional)"
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
