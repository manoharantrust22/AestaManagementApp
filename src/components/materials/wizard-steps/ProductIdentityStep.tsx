"use client";

import { MenuItem, Stack, TextField } from "@mui/material";
import type { MaterialUnit } from "@/types/material.types";
import { UNIT_OPTIONS } from "@/lib/materials/unitOptions";

interface ProductIdentityStepProps {
  name: string;
  onNameChange: (v: string) => void;
  unit: MaterialUnit;
  onUnitChange: (v: MaterialUnit) => void;
  gstRate: string;
  onGstRateChange: (v: string) => void;
  /** True when converting an existing flat material — unit can't change mid-conversion. */
  unitDisabled?: boolean;
}

/** Step 2 of the branded wizard: what the product actually is, not who sells it. */
export default function ProductIdentityStep({
  name,
  onNameChange,
  unit,
  onUnitChange,
  gstRate,
  onGstRateChange,
  unitDisabled = false,
}: ProductIdentityStepProps) {
  return (
    <Stack gap={2.5} sx={{ maxWidth: 480, mx: "auto" }}>
      <TextField
        label="Product name"
        placeholder="e.g. M1010 Bond Plus"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        required
        autoFocus
        fullWidth
        helperText="The generic product engineers request — not the color/size."
      />
      <Stack direction="row" gap={2}>
        <TextField
          select
          label="Unit"
          value={unit}
          onChange={(e) => onUnitChange(e.target.value as MaterialUnit)}
          disabled={unitDisabled}
          sx={{ flex: 1 }}
        >
          {UNIT_OPTIONS.map((u) => (
            <MenuItem key={u.value} value={u.value}>
              {u.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="GST %"
          type="number"
          value={gstRate}
          onChange={(e) => onGstRateChange(e.target.value)}
          inputProps={{ min: 0, max: 100, step: 0.5 }}
          sx={{ width: 110 }}
        />
      </Stack>
    </Stack>
  );
}
