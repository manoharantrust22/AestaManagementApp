"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
} from "@mui/material";
import { formatCurrencyFull, formatDateDDMMMYY } from "@/lib/formatters";

export interface RemoveContractPaymentTarget {
  /** Bare subcontract_payments.id (the `sp:` prefix already stripped). */
  paymentId: string;
  amount: number;
  paymentDate: string;
  /** subcontract_payments.payment_channel — "engineer_wallet" | "direct" | null. */
  paymentChannel: string | null;
}

/**
 * Confirm removing a wrongly-recorded contract/section payment.
 *
 * Unlike the shared ConfirmDialog this collects a REQUIRED reason: removing a
 * payment moves real money out of the ledger, and `deletion_reason` is the only
 * record of why. The copy also tells the user up front whether the engineer's
 * wallet is refunded, because that is invisible from the payment row itself.
 */
export function RemoveContractPaymentDialog({
  target,
  isRemoving,
  errorMessage,
  onCancel,
  onConfirm,
}: {
  target: RemoveContractPaymentTarget | null;
  isRemoving: boolean;
  errorMessage?: string | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);

  // A fresh target is a fresh decision — never carry the last reason over.
  useEffect(() => {
    if (target) {
      setReason("");
      setTouched(false);
    }
  }, [target?.paymentId]);

  const trimmed = reason.trim();
  const invalid = trimmed.length === 0;
  const fromWallet = target?.paymentChannel === "engineer_wallet";

  return (
    <Dialog
      open={!!target}
      onClose={isRemoving ? undefined : onCancel}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle>Remove this payment?</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          {target
            ? `This removes the ${formatCurrencyFull(target.amount)} payment recorded on ${formatDateDDMMMYY(
                target.paymentDate
              )}. It stops counting toward this contract's spend.`
            : ""}
        </DialogContentText>

        {fromWallet && (
          <Alert severity="info" sx={{ mb: 2 }}>
            This was paid from the site engineer&apos;s wallet — the wallet balance
            will be refunded.
          </Alert>
        )}

        {errorMessage && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {errorMessage}
          </Alert>
        )}

        <TextField
          autoFocus
          fullWidth
          multiline
          minRows={2}
          label="Why are you removing it?"
          placeholder="e.g. Recorded on the section by mistake — belongs in the WaterTank package"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onBlur={() => setTouched(true)}
          error={touched && invalid}
          helperText={
            touched && invalid
              ? "A reason is required."
              : "Saved with the payment so the correction can be traced later."
          }
          disabled={isRemoving}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={isRemoving}>
          Cancel
        </Button>
        <Button
          onClick={() => {
            setTouched(true);
            if (!invalid) onConfirm(trimmed);
          }}
          color="error"
          variant="contained"
          disabled={isRemoving || invalid}
          startIcon={
            isRemoving ? <CircularProgress size={16} color="inherit" /> : null
          }
        >
          Remove
        </Button>
      </DialogActions>
    </Dialog>
  );
}
