"use client";

import React, { useEffect, useMemo, useState } from "react";
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
  IconButton,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { Close, CloudUpload, Delete, LocationOn } from "@mui/icons-material";
import dayjs from "dayjs";
import PayerSourceSplitInput from "@/components/settlement/PayerSourceSplitInput";
import { validatePayerSourceInput } from "@/lib/settlement/payerSource";
import { useImageUpload } from "@/hooks/useImageUpload";
import { createClient } from "@/lib/supabase/client";
import { useSitesData } from "@/contexts/SiteContext";
import {
  useUpdateWalletDeposit,
  useCancelWalletDeposit,
} from "@/hooks/mutations/useEngineerWalletMutations";
import { useEngineerWalletBalance } from "@/hooks/queries/useEngineerWalletV2";
import {
  WalletValidationError,
  WalletInsufficientBalanceError,
} from "@/types/engineer-wallet-v2.types";
import type {
  WalletLedgerEntry,
  WalletPaymentMode,
} from "@/types/engineer-wallet-v2.types";
import type {
  PayerSource,
  PayerSourceInput,
} from "@/types/settlement.types";

interface EditDepositDialogProps {
  open: boolean;
  onClose: () => void;
  /** The deposit row being edited. site_id is required (v2 model). */
  deposit: WalletLedgerEntry | null;
  engineerName: string;
  editorName: string;
  editorUserId: string;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));

export default function EditDepositDialog({
  open,
  onClose,
  deposit,
  engineerName,
  editorName,
  editorUserId,
}: EditDepositDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const supabase = createClient();
  const { sites } = useSitesData();

  const [amount, setAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState<WalletPaymentMode>("upi");
  const [payer, setPayer] = useState<PayerSourceInput>({
    mode: "single",
    source: "trust_account",
  });
  const [transactionDate, setTransactionDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [notes, setNotes] = useState("");
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [editReason, setEditReason] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const siteName = useMemo(() => {
    if (!deposit?.site_id) return "—";
    return sites.find((s) => s.id === deposit.site_id)?.name ?? deposit.site_id;
  }, [deposit?.site_id, sites]);

  // Prime form whenever the dialog opens against a new deposit.
  useEffect(() => {
    if (!open || !deposit) return;
    setAmount(String(deposit.amount ?? ""));
    setPaymentMode((deposit.payment_mode ?? "upi") as WalletPaymentMode);
    // Hydrate payer-source state from either the new split JSONB column or the
    // legacy single-source pair. Old rows (created before Phase 4 shipped) only
    // populate payer_source / payer_name.
    if (deposit.payer_source_split && deposit.payer_source_split.length > 0) {
      setPayer({ mode: "split", rows: deposit.payer_source_split });
    } else {
      setPayer({
        mode: "single",
        source: (deposit.payer_source ?? "trust_account") as PayerSource,
        name: deposit.payer_name ?? undefined,
      });
    }
    setTransactionDate(deposit.transaction_date ?? dayjs().format("YYYY-MM-DD"));
    setNotes(deposit.notes ?? "");
    setProofUrl(deposit.proof_url ?? null);
    setProofPreview(deposit.proof_url ?? null);
    setEditReason("");
    setSubmitError(null);
    setConfirmCancel(false);
    setCancelReason("");
  }, [open, deposit]);

  const balanceQuery = useEngineerWalletBalance(
    deposit?.user_id ?? "",
    deposit?.site_id ?? undefined
  );
  const currentBalance = balanceQuery.data?.balance ?? 0;
  const oldAmount = Number(deposit?.amount ?? 0);
  const numericAmount = Number(amount) || 0;
  const delta = numericAmount - oldAmount;
  const previewAfter = currentBalance + delta;

  const upload = useImageUpload({
    supabase,
    bucketName: "settlement-proofs",
    folderPath: "wallet-deposits",
  });

  const updateMutation = useUpdateWalletDeposit();
  const cancelMutation = useCancelWalletDeposit();

  const handleClose = () => {
    if (updateMutation.isPending || cancelMutation.isPending || upload.isUploading) return;
    onClose();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubmitError(null);
    try {
      const result = await upload.upload(file);
      setProofUrl(result.url);
      setProofPreview(URL.createObjectURL(file));
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Upload failed");
    }
  };

  const amountInvalid = !amount || isNaN(Number(amount)) || Number(amount) <= 0;
  const wouldGoNegative = delta < 0 && previewAfter < 0;
  const upiProofMissing = paymentMode === "upi" && !proofUrl;
  const payerCheck = validatePayerSourceInput(payer, numericAmount);
  const payerInvalid = !payerCheck.ok;
  const reasonMissing = editReason.trim() === "";

  const canSubmit =
    !amountInvalid &&
    !upiProofMissing &&
    !payerInvalid &&
    !reasonMissing &&
    !wouldGoNegative;

  const handleSubmit = async () => {
    if (!deposit) return;
    setSubmitError(null);
    const check = validatePayerSourceInput(payer, Number(amount));
    if (!check.ok) {
      setSubmitError(check.reason);
      return;
    }
    try {
      await updateMutation.mutateAsync({
        id: deposit.id,
        engineer_id: deposit.user_id,
        amount: Number(amount),
        payment_mode: paymentMode,
        payer,
        proof_url: proofUrl,
        transaction_date: transactionDate,
        notes: notes.trim() || null,
        edit_reason: editReason.trim(),
        edited_by: editorName,
        edited_by_user_id: editorUserId,
      });
      onClose();
    } catch (err) {
      if (err instanceof WalletInsufficientBalanceError) {
        setSubmitError(
          `Cannot lower amount: pool would go negative. Available ₹${fmt(err.available)}, reduction needed ₹${fmt(err.requested)}.`
        );
      } else if (err instanceof WalletValidationError) {
        setSubmitError(err.message);
      } else if (err instanceof Error) {
        setSubmitError(err.message);
      } else {
        setSubmitError("Something went wrong. Try again.");
      }
    }
  };

  const handleCancelDeposit = async () => {
    if (!deposit) return;
    setSubmitError(null);
    try {
      await cancelMutation.mutateAsync({
        id: deposit.id,
        engineer_id: deposit.user_id,
        reason: cancelReason.trim() || "Admin cancelled deposit",
        cancelled_by: editorName,
        cancelled_by_user_id: editorUserId,
      });
      onClose();
    } catch (err) {
      if (err instanceof WalletInsufficientBalanceError) {
        setSubmitError(
          `Cannot cancel: this deposit's ₹${fmt(oldAmount)} has already been used. Cancel the dependent spends first.`
        );
      } else if (err instanceof Error) {
        setSubmitError(err.message);
      } else {
        setSubmitError("Cancellation failed");
      }
    }
  };

  const isSubmitting =
    updateMutation.isPending || cancelMutation.isPending || upload.isUploading;

  if (!deposit) return null;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      fullScreen={fullScreen}
      PaperProps={{ sx: { borderRadius: fullScreen ? 0 : 3 } }}
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pr: 1 }}>
        <Box>
          <Typography variant="h6" fontWeight={700}>
            Edit deposit
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {engineerName} · {siteName}
          </Typography>
        </Box>
        <IconButton onClick={handleClose} disabled={isSubmitting}>
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          {deposit.edited_at && (
            <Alert severity="info" icon={false} sx={{ py: 0.5 }}>
              <Typography variant="caption">
                Previously edited{" "}
                {dayjs(deposit.edited_at).format("D MMM YYYY")} by{" "}
                {deposit.edited_by ?? "—"}
                {deposit.edit_reason ? ` · "${deposit.edit_reason}"` : ""}
              </Typography>
            </Alert>
          )}

          <Box
            sx={{
              px: 1.5,
              py: 1,
              bgcolor: "action.hover",
              borderRadius: 1,
              display: "flex",
              alignItems: "center",
              gap: 1,
            }}
          >
            <LocationOn fontSize="small" sx={{ color: "text.secondary" }} />
            <Typography variant="caption" color="text.secondary">
              Site: <strong>{siteName}</strong> (locked — cannot be changed)
            </Typography>
          </Box>

          {balanceQuery.data && (
            <Box
              sx={{
                px: 1.5,
                py: 1,
                bgcolor: previewAfter < 0 ? "error.light" : "action.hover",
                borderRadius: 1,
              }}
            >
              <Typography variant="caption" component="div">
                Current pool: <strong>₹ {fmt(currentBalance)}</strong>
                {delta !== 0 && (
                  <>
                    {" "}→ after this edit:{" "}
                    <strong style={{ color: previewAfter < 0 ? "#d32f2f" : "inherit" }}>
                      ₹ {fmt(previewAfter)}
                    </strong>
                    {" "}({delta > 0 ? "+" : ""}₹{fmt(delta)})
                  </>
                )}
              </Typography>
            </Box>
          )}

          <TextField
            label="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            inputMode="decimal"
            fullWidth
            autoFocus
            InputProps={{
              startAdornment: <Typography sx={{ mr: 1, color: "text.secondary" }}>₹</Typography>,
            }}
            error={(!!amount && amountInvalid) || wouldGoNegative}
            helperText={
              wouldGoNegative
                ? "This would push the pool below zero — money has already been spent."
                : amount && amountInvalid
                ? "Amount must be a positive number"
                : " "
            }
          />

          <Box>
            <Typography variant="subtitle2" fontWeight={600} color="text.secondary" gutterBottom>
              Payment mode
            </Typography>
            <ToggleButtonGroup
              value={paymentMode}
              exclusive
              onChange={(_, v) => v && setPaymentMode(v)}
              fullWidth
              size="small"
            >
              <ToggleButton value="cash">Cash</ToggleButton>
              <ToggleButton value="upi">UPI</ToggleButton>
              <ToggleButton value="bank_transfer">Bank transfer</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Box>
            <PayerSourceSplitInput
              value={payer}
              onChange={setPayer}
              total={numericAmount}
              siteId={deposit.site_id ?? undefined}
              disabled={isSubmitting}
            />
            {payerInvalid && payer.mode === "split" && (
              <Typography
                variant="caption"
                color="error.main"
                sx={{ mt: 0.5, display: "block" }}
              >
                {!payerCheck.ok ? payerCheck.reason : null}
              </Typography>
            )}
          </Box>

          <TextField
            label="Date"
            type="date"
            value={transactionDate}
            onChange={(e) => setTransactionDate(e.target.value)}
            fullWidth
            InputLabelProps={{ shrink: true }}
          />

          <Box>
            <Typography variant="subtitle2" fontWeight={600} color="text.secondary" gutterBottom>
              Proof / receipt {paymentMode === "upi" && (
                <Typography component="span" variant="caption" color="error.main" sx={{ ml: 0.5 }}>
                  required for UPI
                </Typography>
              )}
            </Typography>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Button
                component="label"
                variant="outlined"
                startIcon={upload.isUploading ? <CircularProgress size={16} /> : <CloudUpload />}
                disabled={upload.isUploading}
                size="small"
              >
                {proofUrl ? "Replace" : "Upload"}
                <input type="file" hidden accept="image/*" onChange={handleFile} />
              </Button>
              {proofPreview && (
                <Box
                  component="img"
                  src={proofPreview}
                  alt="proof"
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: 1,
                    objectFit: "cover",
                    border: "1px solid",
                    borderColor: "divider",
                  }}
                />
              )}
            </Stack>
            {upload.error && (
              <Typography variant="caption" color="error" sx={{ mt: 0.5, display: "block" }}>
                {upload.error}
              </Typography>
            )}
          </Box>

          <TextField
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            fullWidth
            multiline
            minRows={2}
          />

          <TextField
            label="Reason for edit"
            value={editReason}
            onChange={(e) => setEditReason(e.target.value)}
            fullWidth
            required
            placeholder="e.g. Actual cash handed over was ₹9,440 not ₹10,000"
            error={!!editReason && reasonMissing}
            helperText="Recorded in the audit trail. Required."
          />

          {submitError && <Alert severity="error">{submitError}</Alert>}

          {/* Cancel-deposit affordance: behind a confirm step. */}
          {!confirmCancel ? (
            <Button
              startIcon={<Delete />}
              color="error"
              size="small"
              onClick={() => setConfirmCancel(true)}
              disabled={isSubmitting}
              sx={{ alignSelf: "flex-start" }}
            >
              Cancel this deposit
            </Button>
          ) : (
            <Box sx={{ p: 1.5, border: "1px solid", borderColor: "error.light", borderRadius: 1 }}>
              <Typography variant="subtitle2" color="error.main" fontWeight={700}>
                Cancel deposit?
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Marks this ₹{fmt(oldAmount)} deposit as cancelled. Pool drops by ₹{fmt(oldAmount)}.
                If the money has already been spent, the cancellation will be rejected.
              </Typography>
              <TextField
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Reason (optional)"
                fullWidth
                size="small"
                sx={{ mt: 1 }}
              />
              <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                <Button size="small" onClick={() => setConfirmCancel(false)} disabled={isSubmitting}>
                  Keep deposit
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  color="error"
                  onClick={handleCancelDeposit}
                  disabled={isSubmitting}
                  startIcon={cancelMutation.isPending ? <CircularProgress size={14} /> : null}
                >
                  Yes, cancel
                </Button>
              </Stack>
            </Box>
          )}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={handleClose} disabled={isSubmitting}>
          Close
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!canSubmit || isSubmitting}
          startIcon={updateMutation.isPending ? <CircularProgress size={16} /> : null}
        >
          {updateMutation.isPending ? "Saving…" : "Save changes"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
