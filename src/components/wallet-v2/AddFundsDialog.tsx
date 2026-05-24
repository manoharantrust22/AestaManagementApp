"use client";

import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { Close, CloudUpload, Image as ImageIcon, LocationOn } from "@mui/icons-material";
import dayjs from "dayjs";
import PayerSourceSplitInput from "@/components/settlement/PayerSourceSplitInput";
import { useImageUpload } from "@/hooks/useImageUpload";
import { createClient } from "@/lib/supabase/client";
import { useSitesData } from "@/contexts/SiteContext";
import {
  useRecordWalletDeposit,
  useRecordWalletReturn,
} from "@/hooks/mutations/useEngineerWalletMutations";
import { useEngineerWalletBalance } from "@/hooks/queries/useEngineerWalletV2";
import { WalletValidationError } from "@/types/engineer-wallet-v2.types";
import type { WalletPaymentMode } from "@/types/engineer-wallet-v2.types";
import type { PayerSourceInput } from "@/types/settlement.types";
import { validatePayerSourceInput } from "@/lib/settlement/payerSource";

interface AddFundsDialogProps {
  open: boolean;
  onClose: () => void;
  engineerId: string;
  engineerName: string;
  recordedBy: string;
  recordedByUserId: string;
  /** Defaults to "deposit" — pass "return" to reuse this dialog for returns. */
  mode?: "deposit" | "return";
  /** When provided, the site picker is locked to this site (e.g. when the dialog
   *  is opened from a per-site card's Add Funds button). */
  lockedSiteId?: string;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));

export default function AddFundsDialog({
  open,
  onClose,
  engineerId,
  engineerName,
  recordedBy,
  recordedByUserId,
  mode = "deposit",
  lockedSiteId,
}: AddFundsDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down("sm"));
  const supabase = createClient();
  const isReturn = mode === "return";

  const { sites } = useSitesData();
  const activeSites = sites.filter((s) => s.status === "active");

  const [siteId, setSiteId] = useState<string>(lockedSiteId ?? "");
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
  const [submitError, setSubmitError] = useState<string | null>(null);

  // When the dialog opens, sync site state to the locked site if any.
  useEffect(() => {
    if (open) setSiteId(lockedSiteId ?? "");
  }, [open, lockedSiteId]);

  // Live balance preview for the chosen site (so the operator sees the resulting pool).
  const balanceQuery = useEngineerWalletBalance(engineerId, siteId || undefined);
  const currentBalance = balanceQuery.data?.balance ?? 0;
  const numericAmount = Number(amount) || 0;
  const previewAfter = isReturn
    ? currentBalance - numericAmount
    : currentBalance + numericAmount;

  const upload = useImageUpload({
    supabase,
    bucketName: "settlement-proofs",
    folderPath: isReturn ? "wallet-returns" : "wallet-deposits",
  });

  const deposit = useRecordWalletDeposit();
  const returnMutation = useRecordWalletReturn();

  const reset = () => {
    setSiteId(lockedSiteId ?? "");
    setAmount("");
    setPaymentMode("upi");
    setPayer({ mode: "single", source: "trust_account" });
    setTransactionDate(dayjs().format("YYYY-MM-DD"));
    setNotes("");
    setProofUrl(null);
    setProofPreview(null);
    setSubmitError(null);
    upload.reset();
  };

  const handleClose = () => {
    if (deposit.isPending || upload.isUploading) return;
    reset();
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

  const siteMissing = !siteId;
  const upiProofMissing = paymentMode === "upi" && !proofUrl;
  const amountInvalid = !amount || isNaN(Number(amount)) || Number(amount) <= 0;
  const returnExceedsBalance = isReturn && numericAmount > currentBalance;
  const payerCheck = validatePayerSourceInput(payer, numericAmount);
  const payerInvalid = !isReturn && !payerCheck.ok;
  const canSubmit =
    !amountInvalid &&
    !siteMissing &&
    !upiProofMissing &&
    !payerInvalid &&
    !returnExceedsBalance;

  const handleSubmit = async () => {
    setSubmitError(null);
    try {
      const baseInput = {
        engineer_id: engineerId,
        site_id: siteId,
        amount: Number(amount),
        payment_mode: paymentMode,
        proof_url: proofUrl,
        transaction_date: transactionDate,
        notes: notes.trim() || null,
        recorded_by: recordedBy,
        recorded_by_user_id: recordedByUserId,
      };
      if (isReturn) {
        await returnMutation.mutateAsync(baseInput);
      } else {
        const check = validatePayerSourceInput(payer, Number(amount));
        if (!check.ok) {
          setSubmitError(check.reason);
          return;
        }
        await deposit.mutateAsync({
          ...baseInput,
          payer,
        });
      }
      reset();
      onClose();
    } catch (err) {
      if (err instanceof WalletValidationError) {
        setSubmitError(err.message);
      } else if (err instanceof Error) {
        setSubmitError(err.message);
      } else {
        setSubmitError("Something went wrong. Try again.");
      }
    }
  };

  const isSubmitting = deposit.isPending || returnMutation.isPending || upload.isUploading;

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
            {isReturn ? "Record return" : "Add funds"}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {isReturn ? `${engineerName} returns money` : `Add money to ${engineerName}'s wallet`}
          </Typography>
        </Box>
        <IconButton onClick={handleClose} disabled={isSubmitting}>
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <TextField
            select
            label="Site"
            value={siteId}
            onChange={(e) => setSiteId(e.target.value)}
            fullWidth
            disabled={Boolean(lockedSiteId)}
            helperText={
              lockedSiteId
                ? "This deposit is scoped to the site that opened the dialog."
                : isReturn
                ? "Pick which site's pool the engineer is returning money from."
                : "Pick the site this money is earmarked for."
            }
            InputProps={{
              startAdornment: (
                <LocationOn fontSize="small" sx={{ mr: 1, color: "text.secondary" }} />
              ),
            }}
          >
            {activeSites.length === 0 && (
              <MenuItem value="" disabled>
                No active sites
              </MenuItem>
            )}
            {activeSites.map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {s.name}
              </MenuItem>
            ))}
          </TextField>

          {siteId && balanceQuery.data && (
            <Box
              sx={{
                px: 1.5,
                py: 1,
                bgcolor: "action.hover",
                borderRadius: 1,
                fontSize: "0.85rem",
              }}
            >
              <Typography variant="caption" color="text.secondary" component="div">
                Current pool: <strong>₹ {fmt(currentBalance)}</strong>
                {numericAmount > 0 && (
                  <>
                    {" "}
                    → after this {isReturn ? "return" : "deposit"}:{" "}
                    <strong style={{ color: previewAfter < 0 ? "#d32f2f" : "inherit" }}>
                      ₹ {fmt(previewAfter)}
                    </strong>
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
            placeholder="0"
            fullWidth
            autoFocus
            InputProps={{
              startAdornment: <Typography sx={{ mr: 1, color: "text.secondary" }}>₹</Typography>,
            }}
            error={!!amount && amountInvalid}
            helperText={!!amount && amountInvalid ? "Amount must be a positive number" : " "}
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

          {!isReturn && (
            <Box>
              <PayerSourceSplitInput
                value={payer}
                onChange={setPayer}
                total={numericAmount}
                siteId={siteId || undefined}
                disabled={isSubmitting}
              />
              {(() => {
                const c = validatePayerSourceInput(payer, numericAmount);
                return !c.ok && payer.mode === "split" ? (
                  <Typography
                    variant="caption"
                    color="error.main"
                    sx={{ mt: 0.5, display: "block" }}
                  >
                    {c.reason}
                  </Typography>
                ) : null;
              })()}
            </Box>
          )}

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
                {proofUrl ? "Replace" : paymentMode === "upi" ? "Upload screenshot" : "Add receipt photo"}
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
              {!proofPreview && proofUrl && (
                <ImageIcon color="action" />
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
            placeholder="Optional context (e.g. 'For week 18 wages')"
          />

          {returnExceedsBalance && (
            <Alert severity="warning">
              Return amount ₹{fmt(numericAmount)} exceeds current pool ₹{fmt(currentBalance)}.
            </Alert>
          )}

          {submitError && <Alert severity="error">{submitError}</Alert>}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={handleClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!canSubmit || isSubmitting}
          startIcon={isSubmitting ? <CircularProgress size={16} /> : null}
        >
          {isSubmitting ? "Saving…" : isReturn ? "Record return" : "Add funds"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
