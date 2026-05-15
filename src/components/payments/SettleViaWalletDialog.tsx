"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  InputAdornment,
  TextField,
  Typography,
} from "@mui/material";
import dayjs from "dayjs";
import {
  AccountBalanceWallet as WalletIcon,
  Close as CloseIcon,
} from "@mui/icons-material";
import {
  useEngineerWalletBalance,
  useLatestDepositSource,
  broadcastWalletChange,
} from "@/hooks/queries/useEngineerWalletV2";
import { usePayerSources } from "@/hooks/queries/usePayerSources";
import { useToast } from "@/contexts/ToastContext";
import { requiresPayerName, type PayerSource } from "@/types/settlement.types";
import type {
  SettleViaWalletDialogProps,
  SettleViaWalletPayload,
} from "@/types/settle-via-wallet.types";
import WalletBalanceCard from "./WalletBalanceCard";
import SubcontractLinkSelector from "./SubcontractLinkSelector";

/**
 * Canonical wallet-settle dialog. Owns balance fetch, LIFO funded-by
 * resolution, override toggle, optional subcontract link, notes.
 *
 * The dialog does NOT own any mutation — it calls `onConfirm(payload)`
 * and lets the caller invoke the domain-specific service
 * (processSettlement / processContractPayment / useCreateRentalSettlementParty
 * / useSettleMaterialPurchase / createMiscExpense).
 *
 * Note on payer-source override: the override picks the metadata
 * `payerSource` written on the settlement row only. The wallet debit
 * itself still draws from the engineer's single pool — overriding does
 * not re-attribute wallet batches.
 */
export default function SettleViaWalletDialog({
  open,
  onClose,
  onSuccess,
  siteId,
  engineerId,
  amount,
  editableAmount = false,
  maxAmount,
  title = "Settle via Wallet",
  summary,
  renderSummary,
  enablePayerSourceOverride = true,
  defaultPayerSource,
  enableSubcontractLink = false,
  initialSubcontractId = null,
  showNotes = true,
  showProofUpload: _showProofUpload = false,
  showPaymentDate = true,
  onConfirm,
  allowPartial = false,
}: SettleViaWalletDialogProps) {
  const today = useMemo(() => dayjs().format("YYYY-MM-DD"), []);
  const { showToast } = useToast();

  const balanceQuery = useEngineerWalletBalance(engineerId, siteId);
  const depositSourceQuery = useLatestDepositSource(engineerId, siteId);
  const payerSourcesQuery = usePayerSources(siteId);

  const balance = balanceQuery.data?.balance ?? 0;
  const lifoSource = (depositSourceQuery.data?.payer_source ?? "own_money") as PayerSource;
  const hasNoDeposit =
    depositSourceQuery.data?.payer_source === null && !depositSourceQuery.isLoading;

  const [currentAmount, setCurrentAmount] = useState<string>(String(amount));
  const [notes, setNotes] = useState("");
  const [subcontractId, setSubcontractId] = useState<string | null>(initialSubcontractId);
  const [payerSource, setPayerSource] = useState<PayerSource>(defaultPayerSource ?? lifoSource);
  const [customName, setCustomName] = useState("");
  const [showOverride, setShowOverride] = useState(false);
  const [paymentDate, setPaymentDate] = useState<string>(today);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when dialog re-opens; also re-seed payerSource from LIFO
  // once it's resolved (the query is async).
  useEffect(() => {
    if (!open) return;
    setCurrentAmount(String(amount));
    setNotes("");
    setSubcontractId(initialSubcontractId);
    setCustomName("");
    setShowOverride(false);
    setPaymentDate(today);
    setSubmitting(false);
    setError(null);
  }, [open, amount, initialSubcontractId, today]);

  // Sync payerSource with LIFO whenever it resolves, unless user has
  // already opened the override (don't clobber their choice).
  useEffect(() => {
    if (!open || showOverride) return;
    setPayerSource(defaultPayerSource ?? lifoSource);
  }, [open, showOverride, defaultPayerSource, lifoSource]);

  const amountNum = Number(currentAmount);
  const amountValid = Number.isFinite(amountNum) && amountNum > 0;
  const overMax = typeof maxAmount === "number" && amountNum > maxAmount;
  const isInsufficient = balance < amountNum && !allowPartial;
  const needsCustomName =
    requiresPayerName(payerSource) && !customName.trim();
  const paymentDateValid = Boolean(paymentDate) && paymentDate <= today;

  const sourceLabel = useMemo(() => {
    const fromRegistry = payerSourcesQuery.data?.find((s) => s.key === lifoSource)?.label;
    return fromRegistry ?? lifoSource.replace(/_/g, " ");
  }, [payerSourcesQuery.data, lifoSource]);

  const isLoading = balanceQuery.isLoading || depositSourceQuery.isLoading;
  const canConfirm =
    !isLoading &&
    amountValid &&
    !overMax &&
    !isInsufficient &&
    !hasNoDeposit &&
    !needsCustomName &&
    (!showPaymentDate || paymentDateValid) &&
    !submitting;

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const payload: SettleViaWalletPayload = {
        amount: amountNum,
        notes: notes.trim() || undefined,
        payerSource,
        customPayerName: requiresPayerName(payerSource) ? customName.trim() : undefined,
        subcontractId: enableSubcontractLink ? subcontractId : undefined,
        siteId,
        engineerId,
        paymentDate: showPaymentDate ? paymentDate : today,
      };
      await onConfirm(payload);
      broadcastWalletChange();
      showToast(
        `₹${amountNum.toLocaleString("en-IN")} settled from wallet`,
        "success"
      );
      onSuccess?.();
      onClose();
    } catch (err: any) {
      const msg = err?.message || "Settlement failed";
      setError(msg);
      showToast(msg, "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <WalletIcon fontSize="small" color="primary" />
        {title}
        <Box flexGrow={1} />
        <Button
          size="small"
          onClick={onClose}
          sx={{ minWidth: 0, p: 0.5 }}
          disabled={submitting}
        >
          <CloseIcon fontSize="small" />
        </Button>
      </DialogTitle>

      <DialogContent>
        {summary && (
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {summary}
          </Typography>
        )}

        {renderSummary && <Box sx={{ mb: 1.5 }}>{renderSummary()}</Box>}

        {editableAmount && (
          <TextField
            label="Amount"
            type="number"
            fullWidth
            value={currentAmount}
            onChange={(e) => setCurrentAmount(e.target.value)}
            disabled={submitting}
            InputProps={{
              startAdornment: <InputAdornment position="start">₹</InputAdornment>,
            }}
            error={overMax || (currentAmount !== "" && !amountValid)}
            helperText={
              overMax
                ? `Exceeds maximum of ₹${maxAmount?.toLocaleString("en-IN")}`
                : !amountValid && currentAmount !== ""
                ? "Enter a positive amount"
                : undefined
            }
            sx={{ mt: 1, mb: 1.5 }}
          />
        )}

        {showPaymentDate && (
          <TextField
            label="Payment date"
            type="date"
            fullWidth
            size="small"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            disabled={submitting}
            inputProps={{ max: today }}
            InputLabelProps={{ shrink: true }}
            error={Boolean(paymentDate) && !paymentDateValid}
            helperText={
              Boolean(paymentDate) && !paymentDateValid
                ? "Payment date cannot be in the future"
                : undefined
            }
            sx={{ mt: editableAmount ? 0 : 1, mb: 1.5 }}
          />
        )}

        <Box sx={{ mt: editableAmount ? 0 : 2 }}>
          <WalletBalanceCard
            amount={amountValid ? amountNum : amount}
            balance={balance}
            isLoading={isLoading}
            sourceLabel={sourceLabel}
            hasNoDeposit={hasNoDeposit}
            isInsufficient={isInsufficient}
            payerSource={payerSource}
            customName={customName}
            showOverride={showOverride}
            onToggleOverride={() => {
              setShowOverride((v) => {
                const next = !v;
                if (!next) {
                  setPayerSource(defaultPayerSource ?? lifoSource);
                  setCustomName("");
                }
                return next;
              });
            }}
            onPayerSourceChange={setPayerSource}
            onCustomNameChange={setCustomName}
            enableOverride={enablePayerSourceOverride}
            siteId={siteId}
          />
        </Box>

        {enableSubcontractLink && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography
              variant="subtitle2"
              fontWeight={600}
              color="text.secondary"
              gutterBottom
            >
              Link to subcontract (optional)
            </Typography>
            <SubcontractLinkSelector
              selectedSubcontractId={subcontractId}
              onSelect={setSubcontractId}
              paymentAmount={amountValid ? amountNum : 0}
              disabled={submitting}
            />
          </>
        )}

        {showNotes && (
          <TextField
            label="Notes (optional)"
            multiline
            rows={2}
            fullWidth
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={submitting}
            sx={{ mt: 2 }}
          />
        )}

        {error && (
          <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={!canConfirm}
          startIcon={submitting ? <CircularProgress size={16} /> : undefined}
        >
          {submitting ? "Settling…" : "Confirm"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
