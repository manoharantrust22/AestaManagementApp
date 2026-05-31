"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  Alert,
  CircularProgress,
  Chip,
  alpha,
  useTheme,
} from "@mui/material";
import {
  Close as CloseIcon,
  Delete as DeleteIcon,
  Warning as WarningIcon,
  CalendarMonth as CalendarIcon,
  Receipt as ReceiptIcon,
} from "@mui/icons-material";
import dayjs from "dayjs";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { SettlementDetails } from "./SettlementRefDetailDialog";

interface DeleteDailySettlementDialogProps {
  open: boolean;
  onClose: () => void;
  settlement: SettlementDetails | null;
  onSuccess?: () => void;
}

function formatCurrency(amount: number): string {
  return `Rs.${amount.toLocaleString()}`;
}

export default function DeleteDailySettlementDialog({
  open,
  onClose,
  settlement,
  onSuccess,
}: DeleteDailySettlementDialogProps) {
  const theme = useTheme();
  const { userProfile } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [reason, setReason] = useState("");

  const handleDelete = async () => {
    if (!settlement || confirmText !== "DELETE") return;

    setLoading(true);
    setError(null);

    try {
      // 1. Cancel the settlement_group (soft delete)
      const { error: cancelError } = await (supabase as any)
        .from("settlement_groups")
        .update({
          is_cancelled: true,
          cancelled_at: new Date().toISOString(),
          cancelled_by: userProfile?.name || "Unknown",
          cancelled_by_user_id: userProfile?.id,
          cancellation_reason: reason || "User requested deletion",
        })
        .eq("id", settlement.settlementGroupId);

      if (cancelError) {
        throw cancelError;
      }

      // 1b. Reverse the engineer-wallet debit tied to this settlement, if any.
      // Without this, cancelling the settlement leaves the ₹ spend live — re-settling the
      // same date would double-charge the wallet (the exact bug this dialog is the recovery
      // path for). Cancelling the transaction excludes it from the balance/pools views (which
      // filter cancelled_at IS NULL); clearing its allocations keeps the pool math clean.
      const { data: sgRow } = await (supabase as any)
        .from("settlement_groups")
        .select("engineer_transaction_id")
        .eq("id", settlement.settlementGroupId)
        .maybeSingle();
      const walletTxnId: string | null = sgRow?.engineer_transaction_id ?? null;
      if (walletTxnId) {
        const { error: txnError } = await (supabase as any)
          .from("site_engineer_transactions")
          .update({
            cancelled_at: new Date().toISOString(),
            cancelled_by: userProfile?.name || "Unknown",
            cancelled_by_user_id: userProfile?.id,
            cancellation_reason: `Reversed with settlement ${settlement.settlementReference}`,
          })
          .eq("id", walletTxnId)
          .is("cancelled_at", null);
        if (txnError) {
          console.warn("Error reversing engineer wallet debit:", txnError);
        }
        const { error: allocError } = await (supabase as any)
          .from("engineer_wallet_spend_allocations")
          .delete()
          .eq("spend_id", walletTxnId);
        if (allocError) {
          console.warn("Error clearing wallet spend allocations:", allocError);
        }
      }

      // 2. Reset daily_attendance records linked to this settlement
      const { error: dailyError } = await supabase
        .from("daily_attendance")
        .update({
          is_paid: false,
          payment_date: null,
          payment_mode: null,
          paid_via: null,
          engineer_transaction_id: null,
          payment_proof_url: null,
          payment_notes: null,
          settlement_group_id: null,
        })
        .eq("settlement_group_id", settlement.settlementGroupId);

      if (dailyError) {
        console.warn("Error resetting daily_attendance:", dailyError);
      }

      // 3. Reset market_laborer_attendance records linked to this settlement
      const { error: marketError } = await supabase
        .from("market_laborer_attendance")
        .update({
          is_paid: false,
          payment_date: null,
          payment_mode: null,
          paid_via: null,
          engineer_transaction_id: null,
          payment_proof_url: null,
          payment_notes: null,
          settlement_group_id: null,
        })
        .eq("settlement_group_id", settlement.settlementGroupId);

      if (marketError) {
        console.warn("Error resetting market_laborer_attendance:", marketError);
      }

      onSuccess?.();
      onClose();
      setConfirmText("");
      setReason("");
    } catch (err: any) {
      console.error("Error deleting settlement:", err);
      setError(err.message || "Failed to delete settlement");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setConfirmText("");
    setReason("");
    setError(null);
    onClose();
  };

  if (!settlement) return null;

  const isConfirmValid = confirmText === "DELETE";

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: { borderRadius: 2 },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          pb: 1,
          borderBottom: `1px solid ${theme.palette.divider}`,
          bgcolor: alpha(theme.palette.error.main, 0.04),
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <DeleteIcon color="error" />
          <Typography variant="h6" component="span" color="error.main">
            Delete Settlement
          </Typography>
        </Box>
        <IconButton onClick={handleClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 3 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Warning Alert */}
        <Alert severity="warning" icon={<WarningIcon />} sx={{ mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            This action cannot be undone!
          </Typography>
          <Typography variant="body2">
            Deleting this settlement will reverse all payment records, mark attendance as unpaid, and refund any engineer-wallet charge.
          </Typography>
        </Alert>

        {/* Settlement Details */}
        <Box sx={{ mb: 3, p: 2, bgcolor: alpha(theme.palette.grey[500], 0.05), borderRadius: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
            <ReceiptIcon fontSize="small" color="primary" />
            <Chip
              label={settlement.settlementReference}
              color="primary"
              variant="outlined"
              sx={{ fontFamily: "monospace" }}
            />
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1 }}>
            <CalendarIcon fontSize="small" color="action" />
            <Typography variant="body2">
              {dayjs(settlement.settlementDate).format("ddd, MMM DD, YYYY")}
            </Typography>
          </Box>

          {settlement.laborerCount > 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {settlement.laborerCount} laborer{settlement.laborerCount > 1 ? "s" : ""}
            </Typography>
          )}

          <Typography variant="h5" fontWeight={600} color="error.main">
            {formatCurrency(settlement.totalAmount)}
          </Typography>
        </Box>

        {/* Reason for Deletion */}
        <TextField
          fullWidth
          size="small"
          label="Reason for Deletion (optional)"
          multiline
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why are you deleting this settlement?"
          sx={{ mb: 3 }}
        />

        {/* Confirmation Input */}
        <Box sx={{ p: 2, bgcolor: alpha(theme.palette.error.main, 0.04), borderRadius: 1 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Type <strong>DELETE</strong> to confirm:
          </Typography>
          <TextField
            fullWidth
            size="small"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
            placeholder="DELETE"
            error={confirmText.length > 0 && !isConfirmValid}
            sx={{
              "& .MuiOutlinedInput-root": {
                fontFamily: "monospace",
                fontSize: "1.1rem",
              },
            }}
          />
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, borderTop: `1px solid ${theme.palette.divider}` }}>
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={handleDelete}
          disabled={loading || !isConfirmValid}
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <DeleteIcon />}
        >
          Delete Settlement
        </Button>
      </DialogActions>
    </Dialog>
  );
}
