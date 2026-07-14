"use client";

import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import { useReverseLaborerPayout } from "@/hooks/mutations/usePayLaborerPayout";
import { formatCurrencyFull } from "@/lib/formatters";
import type { PayoutBatch, PayoutLaborer } from "@/types/payout.types";

const money = { fontVariantNumeric: "tabular-nums" } as const;

/**
 * Receipt of one payout batch: who/when/how much and the settlement it created
 * on each site's books, with a guarded full reversal (every child settlement is
 * reversed — attendance unmarked, contract ledgers restored, expenses removed).
 */
export default function PayoutBatchReceipt({
  open,
  laborer,
  batch,
  siteNameById,
  onClose,
}: {
  open: boolean;
  laborer: PayoutLaborer | null;
  batch: PayoutBatch | null;
  siteNameById: Record<string, string>;
  onClose: () => void;
}) {
  const reverseMut = useReverseLaborerPayout();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const handleReverse = async () => {
    if (!batch) return;
    try {
      await reverseMut.mutateAsync({ batchId: batch.id, reason: reason.trim() || undefined });
      setConfirming(false);
      setReason("");
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Failed to reverse the payout.");
    }
  };

  if (!batch || !laborer) return null;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <ReceiptLongIcon fontSize="small" />
        Payout receipt — {laborer.name}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5}>
          <Box sx={{ display: "flex", justifyContent: "space-between" }}>
            <Typography variant="body2" color="text.secondary">
              Paid on {batch.paymentDate}
              {batch.paymentMode ? ` · ${batch.paymentMode}` : ""}
              {batch.createdByName ? ` · by ${batch.createdByName}` : ""}
            </Typography>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, ...money }}>
              {formatCurrencyFull(batch.totalAmount)}
            </Typography>
          </Box>
          {batch.notes && (
            <Typography variant="body2" color="text.secondary">
              {batch.notes}
            </Typography>
          )}
          <Divider />
          <Stack spacing={1}>
            {batch.bucketsResult.map((b) => (
              <Box
                key={b.settlement_group_id}
                sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                    {siteNameById[b.site_id] ?? "Site"}
                    {" · "}
                    {b.kind === "company_salary" ? "Company salary" : "Contract"}
                  </Typography>
                  <Chip label={b.settlement_reference} size="small" variant="outlined" sx={{ mt: 0.25 }} />
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: "nowrap", ...money }}>
                  {formatCurrencyFull(b.recorded)}
                </Typography>
              </Box>
            ))}
          </Stack>

          {confirming && (
            <Alert severity="warning">
              This reverses every settlement above on every site — attendance is unmarked and the
              amounts return to owed. Are you sure?
              <TextField
                label="Reason (optional)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                size="small"
                fullWidth
                sx={{ mt: 1 }}
              />
            </Alert>
          )}
          {error && (
            <Alert severity="error" onClose={() => setError("")}>
              {error}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {confirming ? (
          <>
            <Button onClick={() => setConfirming(false)} disabled={reverseMut.isPending}>
              Keep it
            </Button>
            <Button
              color="error"
              variant="contained"
              onClick={handleReverse}
              disabled={reverseMut.isPending}
            >
              {reverseMut.isPending ? "Reversing…" : "Reverse payout"}
            </Button>
          </>
        ) : (
          <>
            <Button color="error" onClick={() => setConfirming(true)}>
              Reverse…
            </Button>
            <Button variant="contained" onClick={onClose}>
              Close
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
