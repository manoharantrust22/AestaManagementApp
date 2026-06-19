"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { AccountBalanceWallet as WalletIcon } from "@mui/icons-material";
import dayjs from "dayjs";
import { useAuth } from "@/contexts/AuthContext";
import {
  ReceiptCapture,
  type ReceiptCaptureValue,
} from "@/components/common/ReceiptCapture";
import PayerSourceSelector from "@/components/settlement/PayerSourceSelector";
import { useCreateTaskWorkPayment } from "@/hooks/queries/useTaskWorkPayments";
import { blurOnWheel } from "@/lib/utils/numberInput";
import type { PayerSource } from "@/types/settlement.types";
import {
  TASK_WORK_PAYMENT_TYPE_LABEL,
  type TaskWorkPackageWithMeta,
  type TaskWorkPaymentChannel,
  type TaskWorkPaymentMode,
  type TaskWorkPaymentType,
} from "@/types/taskWork.types";

interface Props {
  open: boolean;
  onClose: () => void;
  pkg: TaskWorkPackageWithMeta;
  balanceDue: number;
  defaultType?: TaskWorkPaymentType;
  onSaved?: () => void;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export default function TaskWorkPaymentDialog({
  open,
  onClose,
  pkg,
  balanceDue,
  defaultType = "advance",
  onSaved,
}: Props) {
  const { userProfile } = useAuth();
  const createMut = useCreateTaskWorkPayment();

  // Only a site engineer can pay from a wallet — and only from their OWN wallet.
  // Admins / office record company-direct payments, so the wallet channel and the
  // engineer picker are hidden for them entirely.
  const isSiteEngineer = userProfile?.role === "site_engineer";

  const [paymentType, setPaymentType] = useState<TaskWorkPaymentType>(defaultType);
  const [amount, setAmount] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [paymentMode, setPaymentMode] = useState<TaskWorkPaymentMode>("cash");
  const [channel, setChannel] = useState<TaskWorkPaymentChannel>("direct");
  const [payerSource, setPayerSource] = useState<PayerSource>("own_money");
  const [payerName, setPayerName] = useState("");
  const [screenshot, setScreenshot] = useState<ReceiptCaptureValue | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setPaymentType(defaultType);
    setAmount(defaultType === "final_settlement" ? Math.max(balanceDue, 0) : 0);
    setPaymentDate(dayjs().format("YYYY-MM-DD"));
    setPaymentMode("cash");
    setChannel("direct");
    setPayerSource("own_money");
    setPayerName("");
    setScreenshot(null);
    setNotes("");
    setError("");
  }, [open, defaultType, balanceDue]);

  const balanceAfter = useMemo(
    () => Math.round((balanceDue - amount) * 100) / 100,
    [balanceDue, amount]
  );

  const isUpi = paymentMode === "upi";
  // Cash is handed over physically — no proof to attach. Every other mode (UPI,
  // bank transfer, cheque, other) leaves a digital trail, so we offer the upload.
  const isCash = paymentMode === "cash";

  const handleSubmit = async () => {
    if (!(amount > 0)) {
      setError("Enter a valid amount.");
      return;
    }
    if (channel === "engineer_wallet" && !userProfile?.id) {
      setError("Could not identify your wallet — please re-login and try again.");
      return;
    }
    try {
      await createMut.mutateAsync({
        packageId: pkg.id,
        siteId: pkg.site_id,
        packageNumber: pkg.package_number,
        packageTitle: pkg.title,
        paymentType,
        amount,
        paymentDate,
        paymentMode,
        paymentChannel: channel,
        payer:
          channel === "direct"
            ? { mode: "single", source: payerSource, name: payerName }
            : null,
        // Site engineers pay only from their own wallet.
        engineerId: channel === "engineer_wallet" ? userProfile?.id ?? null : null,
        balanceAfterPayment: balanceAfter,
        proofUrl: screenshot?.url ?? null,
        notes: notes.trim() || null,
      });
      onSaved?.();
      onClose();
    } catch (e: any) {
      setError(e?.message || "Failed to record the payment.");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Record payment — {pkg.title}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          <Alert severity="info" sx={{ py: 0.5 }}>
            Price {inr(pkg.total_value)} · Balance due {inr(balanceDue)}
          </Alert>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth>
                <InputLabel>Type</InputLabel>
                <Select
                  value={paymentType}
                  label="Type"
                  onChange={(e) =>
                    setPaymentType(e.target.value as TaskWorkPaymentType)
                  }
                >
                  {(
                    [
                      "advance",
                      "part_payment",
                      "final_settlement",
                      "retention_release",
                    ] as TaskWorkPaymentType[]
                  ).map((t) => (
                    <MenuItem key={t} value={t}>
                      {TASK_WORK_PAYMENT_TYPE_LABEL[t]}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Amount"
                type="number"
                value={amount || ""}
                onChange={(e) => setAmount(Number(e.target.value))}
                onWheel={blurOnWheel}
                slotProps={{ input: { startAdornment: "₹" } }}
              />
            </Grid>
          </Grid>

          {amount > balanceDue && (
            <Alert severity="warning" sx={{ py: 0.5 }}>
              This is more than the balance due — make sure you&apos;re not paying
              ahead of work done.
            </Alert>
          )}

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Date"
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth>
                <InputLabel>Mode</InputLabel>
                <Select
                  value={paymentMode}
                  label="Mode"
                  onChange={(e) => {
                    const mode = e.target.value as TaskWorkPaymentMode;
                    setPaymentMode(mode);
                    // Cash has no screenshot — drop any proof captured for a
                    // previously selected mode so it isn't submitted by mistake.
                    if (mode === "cash") setScreenshot(null);
                  }}
                >
                  <MenuItem value="cash">Cash</MenuItem>
                  <MenuItem value="upi">UPI</MenuItem>
                  <MenuItem value="bank_transfer">Bank transfer</MenuItem>
                  <MenuItem value="cheque">Cheque</MenuItem>
                  <MenuItem value="other">Other</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>

          {/* Wallet channel is available to site engineers only. Admins / office
              always pay company-direct, so the toggle isn't shown for them. */}
          {isSiteEngineer && (
            <ToggleButtonGroup
              value={channel}
              exclusive
              fullWidth
              size="small"
              onChange={(_e, v: TaskWorkPaymentChannel | null) => v && setChannel(v)}
            >
              <ToggleButton value="direct" sx={{ textTransform: "none" }}>
                Paid directly
              </ToggleButton>
              <ToggleButton value="engineer_wallet" sx={{ textTransform: "none" }}>
                From my wallet
              </ToggleButton>
            </ToggleButtonGroup>
          )}

          {channel === "direct" ? (
            <PayerSourceSelector
              value={payerSource}
              customName={payerName}
              onChange={setPayerSource}
              onCustomNameChange={setPayerName}
              siteId={pkg.site_id}
            />
          ) : (
            <Paper
              variant="outlined"
              sx={{
                p: 1.5,
                borderRadius: 2,
                display: "flex",
                alignItems: "center",
                gap: 1,
                bgcolor: "action.hover",
              }}
            >
              <WalletIcon fontSize="small" color="primary" />
              <Box>
                <Typography variant="body2" fontWeight={600}>
                  From your wallet ({userProfile?.name || "you"})
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Debits your engineer wallet and posts the expense.
                </Typography>
              </Box>
            </Paper>
          )}

          {/* Payment proof — required-feel for UPI, optional for other non-cash
              modes. Cash is handed over physically, so no screenshot is offered. */}
          {!isCash && (
            <Box>
              <ReceiptCapture
                label={isUpi ? "UPI screenshot" : "Payment screenshot (optional)"}
                value={screenshot}
                onChange={setScreenshot}
                folder="task-work-receipts"
                bucket="settlement-proofs"
              />
              {isUpi && !screenshot && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mt: 0.5, display: "block" }}
                >
                  Attach the UPI payment screenshot — paste it straight from the
                  clipboard.
                </Typography>
              )}
            </Box>
          )}

          <TextField
            fullWidth
            label="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            multiline
            rows={2}
          />

          {error && (
            <Alert severity="error" onClose={() => setError("")}>
              {error}
            </Alert>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={createMut.isPending}
        >
          Record
        </Button>
      </DialogActions>
    </Dialog>
  );
}
