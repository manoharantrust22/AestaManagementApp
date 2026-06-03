"use client";

import { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
} from "@mui/material";
import type { UsageLogRow } from "@/hooks/queries/useUsageLog";

/** Only the fields this dialog actually reads — lets callers pass any
 *  structurally-compatible row (UsageLogRow satisfies this). */
export type PoolUsageEditRow = Pick<UsageLogRow, "id" | "quantity" | "work_description">;

export interface PoolUsageEditDialogProps {
  open: boolean;
  row: PoolUsageEditRow | null;
  unit: string;
  isSaving: boolean;
  onClose: () => void;
  onSave: (quantity: number, work_description: string) => void;
}

export default function PoolUsageEditDialog({
  open,
  row,
  unit,
  isSaving,
  onClose,
  onSave,
}: PoolUsageEditDialogProps) {
  const [quantity, setQuantity] = useState<number>(0);
  const [desc, setDesc] = useState<string>("");
  const [touched, setTouched] = useState(false);

  // Seed fields when a new row opens.
  if (open && row && !touched) {
    setQuantity(row.quantity);
    setDesc(row.work_description ?? "");
    setTouched(true);
  }
  if (!open && touched) setTouched(false);

  if (!row) return null;
  const invalid = quantity <= 0;

  return (
    <Dialog open={open} onClose={() => !isSaving && onClose()} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontSize: 16, fontWeight: 700 }}>Edit usage</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 0.5 }}>
          <TextField
            label={`Quantity (${unit})`}
            type="number"
            size="small"
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            error={invalid}
            helperText={invalid ? "Must be greater than 0" : `Original: ${row.quantity} ${unit}`}
            inputProps={{ min: 0.001, step: 0.001 }}
            fullWidth
          />
          <TextField
            label="Work description"
            size="small"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            multiline
            rows={2}
            fullWidth
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSaving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => onSave(quantity, desc)}
          disabled={isSaving || invalid}
        >
          {isSaving ? "Saving…" : "Save changes"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
