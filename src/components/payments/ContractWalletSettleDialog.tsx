"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  TextField,
  Typography,
} from "@mui/material";
import {
  AccountBalanceWallet as WalletIcon,
  Close as CloseIcon,
} from "@mui/icons-material";
import dayjs from "dayjs";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSiteSubcontracts } from "@/hooks/queries/useSubcontracts";
import { useWeekContractSubcontracts } from "@/hooks/queries/useWeekContractSubcontracts";
import { processContractPayment } from "@/lib/services/settlementService";
import {
  useEngineerWalletBalance,
  useLatestDepositSource,
} from "@/hooks/queries/useEngineerWalletV2";
import { usePayerSources } from "@/hooks/queries/usePayerSources";
import { useToast } from "@/contexts/ToastContext";

interface ContractWalletSettleDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  siteId: string;
  engineerId: string;
  /** Pre-selected subcontract from week context (null = show picker) */
  subcontractId?: string | null;
  /** Outstanding wages for the week — pre-fills the amount field */
  suggestedAmount?: number;
  /** ISO week start date — used to narrow subcontract auto-pick */
  weekStart?: string;
  /** ISO week end date */
  weekEnd?: string;
}

export function ContractWalletSettleDialog({
  open,
  onClose,
  onSuccess,
  siteId,
  engineerId,
  subcontractId: initialSubcontractId,
  suggestedAmount = 0,
  weekStart,
  weekEnd,
}: ContractWalletSettleDialogProps) {
  const { userProfile } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data: subcontracts, isLoading: subcontractsLoading } =
    useSiteSubcontracts(siteId);
  const { data: weekSubcontractIds } = useWeekContractSubcontracts(
    siteId,
    weekStart,
    weekEnd
  );

  const balanceQuery = useEngineerWalletBalance(engineerId, siteId);
  const depositSourceQuery = useLatestDepositSource(engineerId, siteId);
  const payerSourcesQuery = usePayerSources(siteId);

  // Form state
  const [subcontractId, setSubcontractId] = useState<string | null>(
    initialSubcontractId ?? null
  );
  const [amount, setAmount] = useState<string>(
    suggestedAmount > 0 ? String(suggestedAmount) : ""
  );
  const [paymentDate, setPaymentDate] = useState<string>(
    dayjs().format("YYYY-MM-DD")
  );
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-pick subcontract when context narrows to one
  useEffect(() => {
    if (!open || initialSubcontractId) return;
    if (!subcontracts || subcontracts.length === 0) return;

    const candidates = weekSubcontractIds?.length
      ? subcontracts.filter((s) => weekSubcontractIds.includes(s.id))
      : subcontracts;

    if (candidates.length === 1) setSubcontractId(candidates[0].id);
  }, [open, subcontracts, weekSubcontractIds, initialSubcontractId]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setSubcontractId(initialSubcontractId ?? null);
      setAmount(suggestedAmount > 0 ? String(suggestedAmount) : "");
      setPaymentDate(dayjs().format("YYYY-MM-DD"));
      setNotes("");
      setError(null);
    }
  }, [open, initialSubcontractId, suggestedAmount]);

  const balance = balanceQuery.data?.balance ?? 0;
  const lifoSource =
    depositSourceQuery.data?.payer_source ?? "own_money";
  const sourceLabel =
    payerSourcesQuery.data?.find((s) => s.key === lifoSource)?.label ??
    lifoSource.replace(/_/g, " ");
  const amountNum = parseFloat(amount);
  const isInsufficient = balance < amountNum;
  const hasNoDeposit =
    depositSourceQuery.data?.payer_source === null &&
    !depositSourceQuery.isLoading;

  const selectedSubcontract = subcontracts?.find((s) => s.id === subcontractId);

  const weekLabel =
    weekStart && weekEnd
      ? `${dayjs(weekStart).format("D MMM")} – ${dayjs(weekEnd).format("D MMM")}`
      : undefined;

  const candidateSubcontracts = useMemo(() => {
    if (!subcontracts) return [];
    if (weekSubcontractIds?.length) {
      return subcontracts.filter((s) => weekSubcontractIds.includes(s.id));
    }
    return subcontracts;
  }, [subcontracts, weekSubcontractIds]);

  const walletLoading =
    balanceQuery.isLoading || depositSourceQuery.isLoading;
  const canConfirm =
    !walletLoading &&
    !isInsufficient &&
    !hasNoDeposit &&
    !submitting &&
    subcontractId !== null &&
    Number.isFinite(amountNum) &&
    amountNum > 0;

  const handleConfirm = async () => {
    if (!userProfile || !subcontractId || !selectedSubcontract) return;
    setError(null);
    setSubmitting(true);
    try {
      const { data: subRow, error: subErr } = await supabase
        .from("subcontracts")
        .select("laborer_id")
        .eq("id", subcontractId)
        .single();
      if (subErr) throw subErr;
      const laborerId = (subRow as { laborer_id: string | null })?.laborer_id;
      if (!laborerId) {
        throw new Error(
          "This subcontract has no laborer (mestri) attached — ask admin to assign one."
        );
      }

      const result = await processContractPayment(supabase, {
        siteId,
        laborerId,
        laborerName: selectedSubcontract.laborer_name ?? "Mestri",
        amount: amountNum,
        paymentType: "salary",
        actualPaymentDate: paymentDate,
        paymentForDate: paymentDate,
        paymentMode: "cash",
        paymentChannel: "engineer_wallet",
        payerSource: lifoSource,
        engineerId,
        notes: notes || undefined,
        subcontractId,
        userId: userProfile.id,
        userName: userProfile.name || userProfile.email || "Unknown",
      });

      if (!result.success) throw new Error(result.error || "Settlement failed");

      queryClient.invalidateQueries({ queryKey: ["salary-settlements"] });
      queryClient.invalidateQueries({ queryKey: ["contract-payments"] });
      queryClient.invalidateQueries({ queryKey: ["engineer-wallet"] });

      showToast(
        `₹${amountNum.toLocaleString("en-IN")} settled from wallet`,
        "success"
      );
      onSuccess();
    } catch (err: any) {
      setError(err.message || "Settlement failed");
    } finally {
      setSubmitting(false);
    }
  };

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
          disabled={submitting}
        >
          <CloseIcon fontSize="small" />
        </Button>
      </DialogTitle>

      <DialogContent>
        {weekLabel && (
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {weekLabel}
          </Typography>
        )}

        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          {/* Subcontract picker */}
          <Autocomplete
            options={candidateSubcontracts}
            getOptionLabel={(o) =>
              o.laborer_name ? `${o.title} · ${o.laborer_name}` : o.title
            }
            value={candidateSubcontracts.find((s) => s.id === subcontractId) ?? null}
            onChange={(_, val) => setSubcontractId(val?.id ?? null)}
            loading={subcontractsLoading}
            disabled={submitting}
            slotProps={{ popper: { disablePortal: false } }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Subcontract / Mestri"
                required
                size="small"
              />
            )}
          />

          {/* Amount */}
          <TextField
            label="Amount (₹)"
            required
            size="small"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={submitting}
            inputProps={{ inputMode: "numeric" }}
            InputProps={{ startAdornment: <Typography sx={{ mr: 0.5 }}>₹</Typography> }}
          />

          {/* Payment date */}
          <TextField
            label="Payment date"
            type="date"
            size="small"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            disabled={submitting}
            inputProps={{ max: dayjs().format("YYYY-MM-DD") }}
            InputLabelProps={{ shrink: true }}
          />

          <Divider />

          {/* Wallet info */}
          {walletLoading ? (
            <Box display="flex" justifyContent="center" py={1}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <Box display="flex" justifyContent="space-between">
                <Typography variant="body2" color="text.secondary">
                  Wallet balance
                </Typography>
                <Typography
                  variant="body2"
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
            </Box>
          )}

          {isInsufficient && !walletLoading && (
            <Alert severity="error">Insufficient wallet balance</Alert>
          )}
          {hasNoDeposit && (
            <Alert severity="warning">
              No wallet deposit found — ask admin to add funds
            </Alert>
          )}
          {error && <Alert severity="error">{error}</Alert>}

          {/* Notes */}
          <TextField
            label="Notes (optional)"
            multiline
            rows={2}
            fullWidth
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={submitting}
          />
        </Box>
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
