"use client";

import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import SyncProblemIcon from "@mui/icons-material/SyncProblem";
import { formatCurrency } from "@/lib/formatters";
import type { RentalSettlement } from "@/types/rental.types";

interface SettlementSyncDialogProps {
  open: boolean;
  onClose: () => void;
  /** The existing settlement record for this order (vendor party) */
  settlement: RentalSettlement;
  /** New calculated rental total after correction */
  newTotal: number;
  /** Called when user wants to edit the settlement */
  onUpdateSettlement: () => void;
}

export function SettlementSyncDialog({
  open,
  onClose,
  settlement,
  newTotal,
  onUpdateSettlement,
}: SettlementSyncDialogProps) {
  const oldTotal = settlement.total_rental_amount ?? 0;
  const diff = newTotal - oldTotal;
  const isIncrease = diff > 0;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <SyncProblemIcon color="warning" />
        Settlement Out of Sync
      </DialogTitle>

      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          The corrected order total differs from the recorded settlement. Review and decide how to handle it.
        </Typography>

        <Stack spacing={1.5}>
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">Settlement recorded</Typography>
            <Typography variant="body2" fontWeight={600}>
              {formatCurrency(oldTotal)}
            </Typography>
          </Stack>
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">New calculated total</Typography>
            <Typography variant="body2" fontWeight={600}>
              {formatCurrency(newTotal)}
            </Typography>
          </Stack>
          <Divider />
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="body2" fontWeight={600}>Difference</Typography>
            <Typography
              variant="body2"
              fontWeight={700}
              color={isIncrease ? "error.main" : "success.main"}
            >
              {isIncrease ? "+" : ""}{formatCurrency(diff)}
              {isIncrease ? " owed to vendor" : " over-recorded"}
            </Typography>
          </Stack>
        </Stack>

        <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: "block" }}>
          Choosing &quot;Update Settlement&quot; opens the settlement editor pre-filled with the new amount.
          Choosing &quot;Leave As-Is&quot; keeps the current settlement unchanged.
        </Typography>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button onClick={onClose}>Leave As-Is</Button>
        <Button
          variant="contained"
          color="warning"
          onClick={() => {
            onClose();
            onUpdateSettlement();
          }}
        >
          Update Settlement
        </Button>
      </DialogActions>
    </Dialog>
  );
}
