"use client";

import { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Alert,
  Stack,
} from "@mui/material";
import { ImportBatch } from "@/types/mass-upload.types";

export type BatchAction = "revert" | "restore" | "purge";

interface Props {
  open: boolean;
  action: BatchAction;
  batch: ImportBatch | null;
  busy?: boolean;
  errorText?: string | null;
  onClose: () => void;
  onConfirm: (reason: string | null) => void;
}

const COPY: Record<
  BatchAction,
  { title: string; body: string; confirmLabel: string; color: "warning" | "error" | "primary"; needsReason: boolean }
> = {
  revert: {
    title: "Revoke this import?",
    body: "Every expense in this batch will be hidden from the Miscellaneous page, All-Site Expenses and subcontract totals. The records stay in the database and can be restored later.",
    confirmLabel: "Revoke batch",
    color: "warning",
    needsReason: true,
  },
  restore: {
    title: "Restore this import?",
    body: "The batch's expenses will become visible again everywhere.",
    confirmLabel: "Restore batch",
    color: "primary",
    needsReason: false,
  },
  purge: {
    title: "Permanently purge this import?",
    body: "This HARD-DELETES every expense in the batch. It cannot be undone or restored. Use this only when you are sure the data should be gone for good.",
    confirmLabel: "Purge permanently",
    color: "error",
    needsReason: true,
  },
};

export function ImportBatchActionsDialog({
  open,
  action,
  batch,
  busy,
  errorText,
  onClose,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState("");
  const copy = COPY[action];

  const handleClose = () => {
    if (busy) return;
    setReason("");
    onClose();
  };

  const count = batch?.inserted_count ?? 0;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>{copy.title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {batch && (
            <Typography variant="body2" color="text.secondary">
              {batch.file_name || "Imported batch"} · {count} record{count === 1 ? "" : "s"}
              {batch.site_name ? ` · ${batch.site_name}` : ""}
            </Typography>
          )}
          <Alert severity={copy.color === "primary" ? "info" : copy.color}>{copy.body}</Alert>
          {copy.needsReason && (
            <TextField
              label={action === "purge" ? "Reason (recorded in audit log)" : "Reason"}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              fullWidth
              multiline
              minRows={2}
              placeholder={action === "purge" ? "e.g. duplicated, wrong site" : "e.g. wrong figures, re-uploading"}
            />
          )}
          {errorText && <Alert severity="error">{errorText}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color={copy.color}
          disabled={busy}
          onClick={() => onConfirm(reason.trim() ? reason.trim() : null)}
        >
          {busy ? "Working…" : copy.confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default ImportBatchActionsDialog;
