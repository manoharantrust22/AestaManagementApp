"use client";

import { useEffect, useMemo, useState } from "react";
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
import { useSettleContractLaborer } from "@/hooks/mutations/useSettleContractLaborer";
import { blurOnWheel } from "@/lib/utils/numberInput";
import { requiresPayerName, type PayerSource } from "@/types/settlement.types";
import type { PaymentMode } from "@/types/payment.types";
import type { ContractLedgerKind } from "@/hooks/queries/useContractLaborLedger";
import { formatCurrencyFull } from "@/lib/formatters";

const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "net_banking", label: "Bank transfer" },
  { value: "other", label: "Other" },
];

/**
 * Record a payment to ONE company laborer against their contract dues (direct-pay mode) — the
 * full remaining or a partial / already-paid amount (back-date via the Date field). Company/office
 * picks a payer source; a site engineer pays from their own wallet only. Reused from the crew ledger
 * rows + the maistry strip. The amount is clamped server-side to what's still owed.
 */
export default function ContractLaborerPayDialog({
  open,
  onClose,
  siteId,
  kind,
  refId,
  laborerId,
  laborerName,
  amountOwed,
  dateFrom,
  dateTo,
  windowLabel,
  onPaid,
}: {
  open: boolean;
  onClose: () => void;
  siteId: string;
  kind: ContractLedgerKind;
  refId: string;
  laborerId: string;
  laborerName: string;
  amountOwed: number;
  dateFrom: string | null;
  dateTo: string | null;
  windowLabel: string;
  onPaid?: () => void;
}) {
  const { userProfile } = useAuth();
  const { selectedSite } = useSite();
  const settleMut = useSettleContractLaborer();

  // A site engineer pays ONLY from their own wallet (like Miscellaneous / task-work).
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
    setAmount(Math.max(0, Math.round(amountOwed * 100) / 100));
    setPaymentDate(dayjs().format("YYYY-MM-DD"));
    setPaymentMode("cash");
    setPayerSource("own_money");
    setPayerName("");
    setScreenshot(null);
    setNotes("");
    setError("");
  }, [open, amountOwed]);

  const isCash = paymentMode === "cash";
  const isUpi = paymentMode === "upi";
  const balanceAfter = useMemo(
    () => (balanceQuery.data?.balance ?? 0) - amount,
    [balanceQuery.data?.balance, amount],
  );

  const handleSubmit = async () => {
    if (!userProfile) {
      setError("Not signed in.");
      return;
    }
    if (!(amount > 0)) {
      setError("Enter an amount greater than zero.");
      return;
    }
    if (!isSiteEngineer && requiresPayerName(payerSource) && !payerName.trim()) {
      setError("Name the payer.");
      return;
    }
    const channel = isSiteEngineer ? "engineer_wallet" : "direct";
    const res = await settleMut.mutateAsync({
      siteId,
      kind,
      refId,
      laborerId,
      laborerName,
      dateFrom,
      dateTo,
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
      onPaid?.();
      onClose();
    } else {
      setError(res.error || "Failed to record the payment.");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>
        Pay {laborerName}
        <Typography variant="caption" color="text.secondary" component="div">
          Owed {windowLabel}: {formatCurrencyFull(amountOwed)}
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
            helperText={
              amount > amountOwed
                ? "More than what's still owed"
                : amount > 0 && amount < amountOwed
                  ? `Partial — ${formatCurrencyFull(amountOwed - amount)} will still be owed`
                  : undefined
            }
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
              folder="contract-wage-receipts"
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

          {isSiteEngineer && balanceAfter < 0 && (
            <Alert severity="info" sx={{ py: 0.5 }}>
              Your wallet goes {formatCurrencyFull(Math.abs(balanceAfter))} negative — the office
              will owe you this.
            </Alert>
          )}
          {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={settleMut.isPending}>
          {settleMut.isPending ? "Recording…" : "Record payment"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
