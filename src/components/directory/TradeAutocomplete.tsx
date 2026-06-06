"use client";

import { Autocomplete, TextField, Chip } from "@mui/material";

interface TradeAutocompleteProps {
  value: string | null;
  onChange: (value: string | null) => void;
  options: string[];
  label?: string;
  placeholder?: string;
  required?: boolean;
}

/**
 * Single-trade picker (freeSolo) for a technician's primary trade.
 * Options = labor categories ∪ TECHNICIAN_TRADES; users may also type a new one.
 */
export function TradeAutocomplete({
  value,
  onChange,
  options,
  label = "Trade",
  placeholder = "e.g. Electrician, CCTV, Carpenter…",
  required,
}: TradeAutocompleteProps) {
  return (
    <Autocomplete
      freeSolo
      autoHighlight
      options={options}
      value={value}
      onChange={(_, v) => onChange((v as string) ?? null)}
      onInputChange={(_, v, reason) => {
        if (reason === "input") onChange(v || null);
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={placeholder}
          required={required}
          size="small"
        />
      )}
      slotProps={{ popper: { disablePortal: false } }}
    />
  );
}

interface SpecialtiesAutocompleteProps {
  value: string[];
  onChange: (value: string[]) => void;
  options: string[];
  label?: string;
  placeholder?: string;
}

/** Multi-select (freeSolo) picker for extra specialties. */
export function SpecialtiesAutocomplete({
  value,
  onChange,
  options,
  label = "Other specialties",
  placeholder = "Add more…",
}: SpecialtiesAutocompleteProps) {
  return (
    <Autocomplete
      multiple
      freeSolo
      options={options}
      value={value}
      onChange={(_, v) => onChange(v as string[])}
      renderTags={(tags, getTagProps) =>
        tags.map((option, index) => {
          const { key, ...chipProps } = getTagProps({ index });
          return (
            <Chip
              key={key}
              size="small"
              variant="outlined"
              label={option}
              {...chipProps}
            />
          );
        })
      }
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={value.length === 0 ? placeholder : undefined}
          size="small"
        />
      )}
      slotProps={{ popper: { disablePortal: false } }}
    />
  );
}
