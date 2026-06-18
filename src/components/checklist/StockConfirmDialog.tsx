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
  ToggleButtonGroup,
  ToggleButton,
} from "@mui/material";
import { CheckCircle, ReportProblem } from "@mui/icons-material";

/**
 * Morning stock confirmation: did the physical stock match the system?
 * Writes a daily_stock_confirmations row, which the checklist auto-detects.
 */
export default function StockConfirmDialog({
  open,
  saving,
  onClose,
  onConfirm,
}: {
  open: boolean;
  saving?: boolean;
  onClose: () => void;
  onConfirm: (matches: boolean, discrepancyNote: string) => void;
}) {
  const [matches, setMatches] = useState<boolean>(true);
  const [note, setNote] = useState("");

  const handleClose = () => {
    setMatches(true);
    setNote("");
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Typography variant="h6" component="span" fontWeight={600}>
          Confirm morning stock
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Does the system stock match what&apos;s physically on site?
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <ToggleButtonGroup
            exclusive
            fullWidth
            value={matches}
            onChange={(_, v) => v !== null && setMatches(v)}
            color={matches ? "success" : "warning"}
          >
            <ToggleButton value={true}>
              <CheckCircle fontSize="small" sx={{ mr: 1 }} /> Matches
            </ToggleButton>
            <ToggleButton value={false}>
              <ReportProblem fontSize="small" sx={{ mr: 1 }} /> Discrepancy
            </ToggleButton>
          </ToggleButtonGroup>
          {!matches && (
            <TextField
              label="What's the discrepancy?"
              placeholder="e.g. 2 cement bags short of system count"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              multiline
              rows={2}
              fullWidth
              autoFocus
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={handleClose}>Cancel</Button>
        <Button
          variant="contained"
          color={matches ? "success" : "warning"}
          disabled={saving}
          onClick={() => {
            onConfirm(matches, note.trim());
            setMatches(true);
            setNote("");
          }}
        >
          Confirm stock
        </Button>
      </DialogActions>
    </Dialog>
  );
}
