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
  DeleteForever as DeleteForeverIcon,
  Warning as WarningIcon,
  CalendarMonth as CalendarIcon,
  Receipt as ReceiptIcon,
} from "@mui/icons-material";
import dayjs from "dayjs";
import { createClient } from "@/lib/supabase/client";
import type { SettlementListRow } from "@/hooks/queries/useSettlementsList";

interface HardDeleteCancelledDialogProps {
  open: boolean;
  onClose: () => void;
  settlement: SettlementListRow | null;
  onSuccess?: () => void;
}

function formatINR(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

export default function HardDeleteCancelledDialog({
  open,
  onClose,
  settlement,
  onSuccess,
}: HardDeleteCancelledDialogProps) {
  const theme = useTheme();
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
      // Cast: generated DB types lag behind new RPCs until
      // `supabase gen types` is re-run after the migration ships. Same
      // pattern as DeleteDailySettlementDialog's update calls.
      const { error: rpcError } = await (supabase as any).rpc(
        "hard_delete_cancelled_settlement",
        {
          p_settlement_group_id: settlement.id,
          p_reason: reason || null,
        },
      );

      if (rpcError) {
        throw rpcError;
      }

      onSuccess?.();
      handleClose();
    } catch (err: any) {
      console.error("Hard-delete failed:", err);
      setError(err.message || "Failed to permanently delete settlement");
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
      onClose={loading ? undefined : handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 2 } }}
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
          <DeleteForeverIcon color="error" />
          <Typography variant="h6" component="span" color="error.main">
            Permanently delete cancelled settlement
          </Typography>
        </Box>
        <IconButton onClick={handleClose} size="small" disabled={loading}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 3 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Alert severity="warning" icon={<WarningIcon />} sx={{ mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            This action cannot be undone.
          </Typography>
          <Typography variant="body2">
            This row was previously cancelled and its attendance / payment
            cascade has already been reversed. Hard delete removes the
            settlement_groups row and any orphaned history rows from the
            database. A snapshot is recorded in the audit log before deletion.
          </Typography>
        </Alert>

        <Box
          sx={{
            mb: 3,
            p: 2,
            bgcolor: alpha(theme.palette.grey[500], 0.05),
            borderRadius: 1,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
            <ReceiptIcon fontSize="small" color="primary" />
            <Chip
              label={settlement.ref}
              color="primary"
              variant="outlined"
              sx={{ fontFamily: "monospace" }}
            />
            <Chip label="Cancelled" size="small" color="error" />
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1 }}>
            <CalendarIcon fontSize="small" color="action" />
            <Typography variant="body2">
              {dayjs(settlement.settlementDate).format("ddd, MMM DD, YYYY")}
            </Typography>
          </Box>

          {settlement.laborerCount > 0 && (
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ mb: 1 }}
            >
              {settlement.laborerCount} laborer
              {settlement.laborerCount > 1 ? "s" : ""}
            </Typography>
          )}

          <Typography variant="h5" fontWeight={600} color="error.main">
            {formatINR(settlement.totalAmount)}
          </Typography>
        </Box>

        <TextField
          fullWidth
          size="small"
          label="Reason for permanent deletion (optional)"
          multiline
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. duplicate row, mistaken entry, audit cleanup"
          sx={{ mb: 3 }}
        />

        <Box
          sx={{
            p: 2,
            bgcolor: alpha(theme.palette.error.main, 0.04),
            borderRadius: 1,
          }}
        >
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

      <DialogActions
        sx={{ px: 3, py: 2, borderTop: `1px solid ${theme.palette.divider}` }}
      >
        <Button onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={handleDelete}
          disabled={loading || !isConfirmValid}
          startIcon={
            loading ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <DeleteForeverIcon />
            )
          }
        >
          Delete permanently
        </Button>
      </DialogActions>
    </Dialog>
  );
}
