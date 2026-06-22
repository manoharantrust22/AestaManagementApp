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
  TextField,
  Typography,
} from "@mui/material";
import dayjs from "dayjs";
import { useCreateTaskWorkVariation } from "@/hooks/queries/useTaskWorkVariations";

interface Props {
  open: boolean;
  onClose: () => void;
  packageId: string;
  siteId: string;
}

/**
 * Record an extra-money request from the maistry (e.g. "owner added a balcony
 * band — ₹3,500 extra"). It starts as PENDING; the engineer reviews the reason
 * and approves/rejects it from the variations list. Approved requests add to the
 * package's agreed amount.
 */
export default function TaskWorkVariationDialog({
  open,
  onClose,
  packageId,
  siteId,
}: Props) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [requestedDate, setRequestedDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [error, setError] = useState("");

  const createMut = useCreateTaskWorkVariation();

  useEffect(() => {
    if (!open) return;
    setAmount("");
    setReason("");
    setRequestedDate(dayjs().format("YYYY-MM-DD"));
    setError("");
  }, [open]);

  const handleSubmit = async () => {
    const amt = Number(amount) || 0;
    if (amt <= 0) {
      setError("Enter the extra amount.");
      return;
    }
    if (!reason.trim()) {
      setError("Add a reason — why is the extra being asked?");
      return;
    }
    try {
      await createMut.mutateAsync({
        package_id: packageId,
        site_id: siteId,
        amount: amt,
        reason: reason.trim(),
        requested_date: requestedDate,
      });
      onClose();
    } catch (e: any) {
      setError(e?.message || "Failed to record the extra.");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Record extra work</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            The maistry is asking for extra money beyond the agreed price. Capture
            it here for review — it only changes the agreed amount once you approve
            it.
          </Typography>
          <TextField
            label="Extra amount (₹)"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            fullWidth
            autoFocus
          />
          <TextField
            label="Reason"
            placeholder="e.g. owner added an elevation band over the porch"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            fullWidth
            multiline
            minRows={2}
          />
          <TextField
            label="Requested on"
            type="date"
            value={requestedDate}
            onChange={(e) => setRequestedDate(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            fullWidth
          />
          {error && (
            <Alert severity="error" onClose={() => setError("")}>
              {error}
            </Alert>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={createMut.isPending}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
