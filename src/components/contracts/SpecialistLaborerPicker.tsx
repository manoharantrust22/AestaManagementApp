"use client";

import React, { useMemo } from "react";
import {
  Autocomplete,
  TextField,
  Box,
  Typography,
  createFilterOptions,
} from "@mui/material";

export interface PickerLaborer {
  id: string;
  name: string;
  category_name?: string;
  role_name?: string;
}

interface SpecialistLaborerPickerProps {
  laborers: PickerLaborer[];
  value: string;
  onChange: (laborerId: string) => void;
  required?: boolean;
  label?: string;
}

// Match on name, trade (category) and role so typing "elect" surfaces the
// whole Electrical group, not just laborers whose name contains "elect".
const filterOptions = createFilterOptions<PickerLaborer>({
  stringify: (o) =>
    `${o.name} ${o.category_name ?? ""} ${o.role_name ?? ""}`,
});

/**
 * Searchable laborer picker for Specialist subcontracts, grouped by trade
 * (labor category). Lets the user distinguish same-named workers — e.g. the
 * Civil "Mani" from the Electrician "Mani" — by trade + role.
 */
export default function SpecialistLaborerPicker({
  laborers,
  value,
  onChange,
  required = false,
  label = "Laborer",
}: SpecialistLaborerPickerProps) {
  // MUI's groupBy requires the options to be pre-sorted by the group key,
  // otherwise the same trade header repeats. Sort by trade, then name.
  const sorted = useMemo(
    () =>
      [...laborers].sort(
        (a, b) =>
          (a.category_name ?? "").localeCompare(b.category_name ?? "") ||
          a.name.localeCompare(b.name)
      ),
    [laborers]
  );

  const selected = useMemo(
    () => sorted.find((l) => l.id === value) ?? null,
    [sorted, value]
  );

  return (
    <Autocomplete
      options={sorted}
      value={selected}
      onChange={(_, option) => onChange(option?.id ?? "")}
      getOptionLabel={(o) => o.name}
      isOptionEqualToValue={(o, v) => o.id === v.id}
      groupBy={(o) => o.category_name || "Other"}
      filterOptions={filterOptions}
      // Render the dropdown in a portal outside the Dialog DOM tree to avoid
      // aria-hidden focus conflicts (see CLAUDE.md accessibility guidelines).
      slotProps={{ popper: { disablePortal: false } }}
      renderOption={(props, option) => (
        <Box component="li" {...props} key={option.id}>
          <Box>
            <Typography variant="body2">{option.name}</Typography>
            {option.role_name ? (
              <Typography variant="caption" color="text.secondary">
                {option.role_name}
              </Typography>
            ) : null}
          </Box>
        </Box>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          required={required}
          placeholder="Search by name or trade (e.g. electrical)"
        />
      )}
    />
  );
}
