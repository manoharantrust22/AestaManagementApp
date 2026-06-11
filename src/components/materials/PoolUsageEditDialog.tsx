"use client";

import { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Box,
} from "@mui/material";
import { useMaterialBrands } from "@/hooks/queries/useMaterials";
import type { UsageLogRow } from "@/hooks/queries/useUsageLog";

/** Only the fields this dialog actually reads — lets callers pass any
 *  structurally-compatible row (UsageLogRow satisfies this). */
export type PoolUsageEditRow = Pick<UsageLogRow, "id" | "quantity" | "work_description">;

export interface PoolUsageEditDialogProps {
  open: boolean;
  row: PoolUsageEditRow | null;
  unit: string;
  /** Parent/group material id — its brands populate the brand picker. When
   *  omitted, the brand picker is hidden (callers that don't edit brand). */
  materialId?: string;
  /** The row's current brand id (null = Brand not set). Seeds the picker. */
  currentBrandId?: string | null;
  isSaving: boolean;
  onClose: () => void;
  onSave: (quantity: number, work_description: string, brand_id: string | null) => void;
}

const UNBRANDED = "__unbranded__";

export default function PoolUsageEditDialog({
  open,
  row,
  unit,
  materialId,
  currentBrandId,
  isSaving,
  onClose,
  onSave,
}: PoolUsageEditDialogProps) {
  const [quantity, setQuantity] = useState<number>(0);
  const [desc, setDesc] = useState<string>("");
  const [brandId, setBrandId] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const showBrandPicker = !!materialId;
  const { data: brands = [] } = useMaterialBrands(materialId);

  // Seed fields when a new row opens.
  if (open && row && !touched) {
    setQuantity(row.quantity);
    setDesc(row.work_description ?? "");
    setBrandId(currentBrandId ?? null);
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
          {showBrandPicker && (
            <TextField
              select
              label="Brand"
              size="small"
              value={brandId ?? UNBRANDED}
              onChange={(e) =>
                setBrandId(e.target.value === UNBRANDED ? null : e.target.value)
              }
              helperText="Correct the brand if it's missing or wrong."
              fullWidth
            >
              <MenuItem value={UNBRANDED}>Unbranded (no brand)</MenuItem>
              {brands.map((b) => (
                <MenuItem key={b.id} value={b.id}>
                  {b.brand_name}
                  {b.variant_name ? ` ${b.variant_name}` : ""}
                </MenuItem>
              ))}
            </TextField>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSaving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => onSave(quantity, desc, brandId)}
          disabled={isSaving || invalid}
        >
          {isSaving ? "Saving…" : "Save changes"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
