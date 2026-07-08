"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import { formatCurrencyFull } from "@/lib/formatters";
import {
  useToggleTradeWorkspace,
  type TradeMigrationPreview,
} from "@/hooks/mutations/useToggleTradeWorkspace";

/**
 * Confirms turning a trade's workspace ON or OFF, running the contract-payment
 * migration (ON) or its reversal (OFF). Reused by both the Site-Settings manager and
 * the trades-page shortcut. On ON, previews how many contract-page payments will move
 * to Salary Settlements; on OFF, warns that migrated payments return to the contract page.
 */
export function WorkspaceToggleConfirmDialog({
  open,
  mode,
  siteId,
  tradeCategoryId,
  tradeName,
  onClose,
  onDone,
}: {
  open: boolean;
  mode: "on" | "off";
  siteId: string;
  tradeCategoryId: string;
  tradeName: string;
  onClose: () => void;
  /** message + optional undo batch id (ON only) so the caller can offer an Undo snackbar. */
  onDone: (message: string, undoBatchId?: string | null) => void;
}) {
  const { preview, turnOn, turnOff } = useToggleTradeWorkspace(siteId);
  const [previewData, setPreviewData] = useState<TradeMigrationPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPreviewData(null);
      setError(null);
      setSubmitting(false);
      return;
    }
    if (mode !== "on") return;
    let cancelled = false;
    setLoading(true);
    preview(tradeCategoryId)
      .then((p) => {
        if (!cancelled) setPreviewData(p);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, mode, tradeCategoryId, preview]);

  const blocked = mode === "on" && !!previewData?.blockerReason;

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "on") {
        const batchId = await turnOn(tradeCategoryId);
        const moved =
          previewData && previewData.paymentCount > 0
            ? ` — moved ${previewData.paymentCount} payment${previewData.paymentCount === 1 ? "" : "s"} (${formatCurrencyFull(previewData.totalAmount)}) to Salary Settlements`
            : "";
        onDone(`${tradeName} workspace turned on${moved}`, batchId);
      } else {
        await turnOff(tradeCategoryId);
        onDone(`${tradeName} workspace turned off — payments return to the contract page`);
      }
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>
        {mode === "on" ? `Turn on ${tradeName} workspace` : `Turn off ${tradeName} workspace`}
      </DialogTitle>
      <DialogContent dividers>
        {mode === "on" ? (
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              Attendance-tracked contracts will record money as salary settlements. Their existing
              contract-page payments move into Salary Settlements, and the contract page becomes
              read-only for new payments.
            </Typography>
            {loading ? (
              <Stack direction="row" spacing={1} alignItems="center">
                <CircularProgress size={16} />
                <Typography variant="body2" color="text.secondary">
                  Checking what will move…
                </Typography>
              </Stack>
            ) : previewData ? (
              previewData.paymentCount > 0 ? (
                <Alert severity="info">
                  <strong>{previewData.paymentCount}</strong> payment
                  {previewData.paymentCount === 1 ? "" : "s"} totalling{" "}
                  <strong>{formatCurrencyFull(previewData.totalAmount)}</strong> across{" "}
                  {previewData.contractCount} contract
                  {previewData.contractCount === 1 ? "" : "s"} will move to Salary Settlements.
                </Alert>
              ) : (
                <Alert severity="success">No contract-page payments to move.</Alert>
              )
            ) : null}
            {blocked && <Alert severity="warning">{previewData?.blockerReason}</Alert>}
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary">
            The workspace will be hidden and any payments that were migrated into Salary Settlements
            for this trade will be moved back to the contract page. Attendance and salary you recorded
            directly stay put.
          </Typography>
        )}
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={submitting || loading || blocked}
          startIcon={submitting ? <CircularProgress size={16} /> : null}
        >
          {submitting ? "Working…" : mode === "on" ? "Turn on & move" : "Turn off"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
