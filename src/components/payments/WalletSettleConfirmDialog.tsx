"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Button,
  Typography,
  CircularProgress,
  Alert,
  TextField,
} from "@mui/material";
import {
  AccountBalanceWallet as WalletIcon,
  Close as CloseIcon,
} from "@mui/icons-material";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { processSettlement } from "@/lib/services/settlementService";
import {
  useEngineerWalletBalance,
  useLatestDepositSource,
} from "@/hooks/queries/useEngineerWalletV2";
import { usePayerSources } from "@/hooks/queries/usePayerSources";
import { useToast } from "@/contexts/ToastContext";
import type { DailyPaymentRecord } from "@/types/payment.types";
import type { PayerSource, SettlementRecord } from "@/types/settlement.types";

interface WalletSettleConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  date: string;
  dateLabel: string;
  dailyRecords: DailyPaymentRecord[];
  siteId: string;
  engineerId: string;
}

export default function WalletSettleConfirmDialog({
  open,
  onClose,
  onSuccess,
  // date is intentionally accepted but not used in the body — callers
  // pass it for symmetry with PaymentDialog and possible future use.
  date: _date,
  dateLabel,
  dailyRecords,
  siteId,
  engineerId,
}: WalletSettleConfirmDialogProps) {
  const { userProfile } = useAuth();
  const supabase = createClient();
  const { showToast } = useToast();
  const [processing, setProcessing] = useState(false);
  const [notes, setNotes] = useState("");

  const balanceQuery = useEngineerWalletBalance(engineerId, siteId);
  const depositSourceQuery = useLatestDepositSource(engineerId, siteId);
  const payerSourcesQuery = usePayerSources(siteId);

  const balance = balanceQuery.data?.balance ?? 0;
  const totalAmount = dailyRecords.reduce((sum, r) => sum + r.amount, 0);
  const lifoSource = depositSourceQuery.data?.payer_source ?? "own_money";
  const isInsufficient = balance < totalAmount;
  const hasNoDeposit =
    depositSourceQuery.data?.payer_source === null && !depositSourceQuery.isLoading;

  const sourceLabel =
    payerSourcesQuery.data?.find((s) => s.key === lifoSource)?.label ??
    lifoSource.replace(/_/g, " ");

  const laborerSummary = (() => {
    const daily = dailyRecords.filter((r) => r.laborerType === "daily").length;
    const market = dailyRecords.filter((r) => r.laborerType === "market").length;
    const parts: string[] = [];
    if (daily > 0) parts.push(`${daily} lab`);
    if (market > 0) parts.push(`${market} mkt`);
    return parts.join(" + ") || `${dailyRecords.length} laborers`;
  })();

  const handleConfirm = async () => {
    if (!userProfile) return;
    setProcessing(true);
    try {
      const settlementRecords: SettlementRecord[] = dailyRecords.map((r) => ({
        id: r.id,
        sourceType: r.sourceType,
        sourceId: r.sourceId,
        laborerName: r.laborerName,
        laborerType: r.laborerType,
        amount: r.amount,
        date: r.date,
        isPaid: r.isPaid,
        role: r.role,
        count: r.count,
      }));

      const result = await processSettlement(supabase, {
        siteId,
        records: settlementRecords,
        totalAmount,
        paymentMode: "cash",
        paymentChannel: "engineer_wallet",
        payerSource: lifoSource as PayerSource,
        engineerId,
        notes: notes || undefined,
        userId: userProfile.id,
        userName: userProfile.name || userProfile.email || "Unknown",
      });

      if (!result.success) throw new Error(result.error || "Settlement failed");
      showToast(
        `₹${totalAmount.toLocaleString("en-IN")} settled from wallet`,
        "success"
      );
      onSuccess();
      setNotes("");
    } catch (err: any) {
      showToast(err.message || "Settlement failed", "error");
    } finally {
      setProcessing(false);
    }
  };

  const isLoading = balanceQuery.isLoading || depositSourceQuery.isLoading;
  const canConfirm = !isLoading && !isInsufficient && !hasNoDeposit && !processing;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <WalletIcon fontSize="small" color="primary" />
        Settle via Wallet
        <Box flexGrow={1} />
        <Button
          size="small"
          onClick={onClose}
          sx={{ minWidth: 0, p: 0.5 }}
          disabled={processing}
        >
          <CloseIcon fontSize="small" />
        </Button>
      </DialogTitle>

      <DialogContent>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {dateLabel} · {laborerSummary}
        </Typography>

        {isLoading ? (
          <Box display="flex" justifyContent="center" py={3}>
            <CircularProgress size={32} />
          </Box>
        ) : (
          <Box sx={{ mt: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
            <Box display="flex" justifyContent="space-between">
              <Typography variant="body2" color="text.secondary">
                Amount
              </Typography>
              <Typography variant="body1" fontWeight={700}>
                ₹{totalAmount.toLocaleString("en-IN")}
              </Typography>
            </Box>

            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Typography variant="body2" color="text.secondary">
                Wallet balance
              </Typography>
              <Typography
                variant="body1"
                fontWeight={600}
                color={isInsufficient ? "error.main" : "success.main"}
              >
                ₹{balance.toLocaleString("en-IN")}
              </Typography>
            </Box>

            {!hasNoDeposit && (
              <Box display="flex" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">
                  Funded by
                </Typography>
                <Typography variant="body2">{sourceLabel}</Typography>
              </Box>
            )}

            {isInsufficient && (
              <Alert severity="error" sx={{ mt: 1 }}>
                Insufficient wallet balance
              </Alert>
            )}

            {hasNoDeposit && (
              <Alert severity="warning" sx={{ mt: 1 }}>
                No wallet deposit found — ask admin to add funds
              </Alert>
            )}

            <TextField
              label="Notes (optional)"
              multiline
              rows={2}
              fullWidth
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={processing}
              sx={{ mt: 1 }}
            />
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={() => { onClose(); setNotes(""); }} disabled={processing}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={!canConfirm}
          startIcon={processing ? <CircularProgress size={16} /> : undefined}
        >
          {processing ? "Settling…" : "Confirm"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
