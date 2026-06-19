"use client";

import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from "@mui/material";
import { Payments as PaymentsIcon } from "@mui/icons-material";
import type { CompletionChoice } from "@/lib/taskWork/completion";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  balanceDue: number;
  isPending: boolean;
  onSettle: () => void;
  onConfirm: (choice: CompletionChoice, reason: string) => void;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export default function TaskWorkCompleteDialog({
  open,
  onClose,
  title,
  balanceDue,
  isPending,
  onSettle,
  onConfirm,
}: Props) {
  const hasBalance = balanceDue > 0;
  const [choice, setChoice] = useState<"waive" | "owe">("waive");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) {
      setChoice("waive");
      setReason("");
    }
  }, [open]);

  const canComplete = !hasBalance || reason.trim().length > 0;

  const handleComplete = () => {
    if (!hasBalance) {
      onConfirm("no_balance", "");
    } else {
      onConfirm(choice, reason);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Complete — {title}</DialogTitle>
      <DialogContent>
        {!hasBalance ? (
          <Typography variant="body2" sx={{ mt: 1 }}>
            Mark this package as completed? You can reopen it later if needed.
          </Typography>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, mt: 1 }}>
            <Alert severity="warning" sx={{ py: 0.5 }}>
              {inr(balanceDue)} is still unpaid.
            </Alert>

            <Button
              variant="contained"
              color="success"
              startIcon={<PaymentsIcon />}
              onClick={onSettle}
            >
              Record final settlement instead
            </Button>

            <Divider>or complete without full payment</Divider>

            <RadioGroup
              value={choice}
              onChange={(e) => setChoice(e.target.value as "waive" | "owe")}
            >
              <FormControlLabel
                value="waive"
                control={<Radio size="small" />}
                label={`Balance waived — bargained down / scope reduced (${inr(
                  balanceDue
                )} no longer owed)`}
              />
              <FormControlLabel
                value="owe"
                control={<Radio size="small" />}
                label={`Still owed — will be paid later (${inr(
                  balanceDue
                )} stays payable)`}
              />
            </RadioGroup>

            <TextField
              fullWidth
              required
              label="Reason"
              placeholder="Why is the balance unsettled?"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              multiline
              rows={2}
            />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          color="success"
          onClick={handleComplete}
          disabled={isPending || !canComplete}
        >
          Complete
        </Button>
      </DialogActions>
    </Dialog>
  );
}
