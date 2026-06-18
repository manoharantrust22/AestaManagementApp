"use client";

import { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Stack,
  Typography,
} from "@mui/material";

/**
 * "I'll record this tomorrow" — captures the reason so a late fill counts as a
 * deliberate deferral, not a missed duty.
 */
export default function DeferDialog({
  open,
  itemLabel,
  requireReason,
  saving,
  onClose,
  onConfirm,
}: {
  open: boolean;
  itemLabel: string;
  requireReason: boolean;
  saving?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const canSubmit = !requireReason || reason.trim().length > 0;

  const handleClose = () => {
    setReason("");
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Typography variant="h6" component="span" fontWeight={600}>
          Defer to tomorrow
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {itemLabel}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Mark this as something you&apos;ll record tomorrow (e.g. measurement only
            possible at end of batch). It won&apos;t be flagged as late.
          </Typography>
          <TextField
            label={requireReason ? "Reason (required)" : "Reason (optional)"}
            placeholder="e.g. PPC sand — measurable only when this batch finishes"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            multiline
            rows={2}
            fullWidth
            autoFocus
            required={requireReason}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          variant="contained"
          color="info"
          disabled={!canSubmit || saving}
          onClick={() => {
            onConfirm(reason.trim());
            setReason("");
          }}
        >
          Defer to tomorrow
        </Button>
      </DialogActions>
    </Dialog>
  );
}
