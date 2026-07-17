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
import { usePayCrewLaborerWeek } from "@/hooks/mutations/usePayCrewLaborerWeek";
import { allocatePayAllOwed } from "@/lib/payments/crewLedger";
import { blurOnWheel } from "@/lib/utils/numberInput";
import { requiresPayerName, type PayerSource } from "@/types/settlement.types";
import type { PaymentMode } from "@/types/payment.types";
import { formatCurrencyFull } from "@/lib/formatters";
import { formatWeekRange } from "@/lib/workforce/ledgerWeeks";

const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "net_banking", label: "Bank transfer" },
  { value: "other", label: "Other" },
];

export interface CrewOwedWeek {
  weekStart: string; // Sunday
  weekEnd: string;   // Saturday
  unpaid: number;
}

/**
 * Record a hand payment to ONE company laborer against their crew-pay weeks.
 * Mirrors ContractLaborerPayDialog (amount, date, mode, payer source / engineer
 * wallet, receipt, notes); the amount splits across the owed weeks OLDEST FIRST
 * (one clamped settlement per week — the server never lets a stale dialog overpay).
 */
export default function CrewLaborerPayDialog({
  open,
  onClose,
  siteId,
  crewSubcontractId,
  laborerId,
  laborerName,
  weeks,
  onPaid,
}: {
  open: boolean;
  onClose: () => void;
  siteId: string;
  crewSubcontractId: string;
  laborerId: string;
  laborerName: string;
  /** Owed post-cutover weeks (any order; the dialog sorts oldest-first). */
  weeks: CrewOwedWeek[];
  onPaid?: () => void;
}) {
  const { userProfile } = useAuth();
  const { selectedSite } = useSite();
  const payMut = usePayCrewLaborerWeek();

  // A site engineer pays ONLY from their own wallet (project convention).
  const isSiteEngineer = userProfile?.role === "site_engineer";
  const balanceQuery = useEngineerWalletBalance(
    isSiteEngineer ? userProfile?.id : undefined,
    siteId,
  );

  const owedWeeks = useMemo(
    () =>
      [...weeks]
        .filter((w) => w.unpaid > 0)
        .sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
    [weeks],
  );
  const totalOwed = useMemo(
    () => owedWeeks.reduce((sum, w) => sum + w.unpaid, 0),
    [owedWeeks],
  );

  const [amount, setAmount] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash");
  const [payerSource, setPayerSource] = useState<PayerSource>("own_money");
  const [payerName, setPayerName] = useState("");
  const [screenshot, setScreenshot] = useState<ReceiptCaptureValue | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmount(Math.max(0, Math.round(totalOwed * 100) / 100));
    setPaymentDate(dayjs().format("YYYY-MM-DD"));
    setPaymentMode("cash");
    setPayerSource("own_money");
    setPayerName("");
    setScreenshot(null);
    setNotes("");
    setError("");
  }, [open, totalOwed]);

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
    const allocations = allocatePayAllOwed(amount, owedWeeks);
    if (allocations.length === 0) {
      setError("Nothing left to pay for these weeks.");
      return;
    }
    const channel = isSiteEngineer ? "engineer_wallet" : "direct";
    const weekEndByStart = new Map(owedWeeks.map((w) => [w.weekStart, w.weekEnd]));
    setSubmitting(true);
    try {
      for (const alloc of allocations) {
        await payMut.mutateAsync({
          siteId,
          crewSubcontractId,
          laborerId,
          laborerName,
          weekStart: alloc.weekStart,
          weekEnd: weekEndByStart.get(alloc.weekStart)!,
          amount: alloc.amount,
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
      }
      onPaid?.();
      onClose();
    } catch (err: any) {
      // Earlier weeks in the loop are already recorded (and stay recorded) —
      // reopening the dialog shows the refreshed remaining.
      setError(err?.message || "Failed to record the payment.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>
        Pay {laborerName}
        <Typography variant="caption" color="text.secondary" component="div">
          Owed {formatCurrencyFull(totalOwed)}
          {owedWeeks.length === 1
            ? ` · ${formatWeekRange(owedWeeks[0].weekStart)}`
            : ` across ${owedWeeks.length} weeks`}
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
              amount > totalOwed
                ? "More than what's still owed — the extra will not be recorded"
                : amount > 0 && amount < totalOwed
                  ? `Partial — ${formatCurrencyFull(totalOwed - amount)} will still be owed (oldest week fills first)`
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
              folder="crew-wage-receipts"
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
        <Button variant="contained" onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Recording…" : "Record payment"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
