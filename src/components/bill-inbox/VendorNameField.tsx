"use client";

/**
 * Shop name picker: choose an existing vendor or type a new name.
 * Used by the review screen and the quick "Add shop name" action.
 */

import { Autocomplete, TextField } from "@mui/material";
import { useQuery } from "@tanstack/react-query";

import { AI_CATALOG_QUERY_KEYS, fetchVendorsForMatch } from "@/lib/ai-ingestion/modes/purchase";

export interface VendorOption {
  id: string;
  name: string;
  city: string | null;
  phone: string | null;
  gst_number: string | null;
}

export function useVendorOptions() {
  return useQuery({
    queryKey: AI_CATALOG_QUERY_KEYS.vendors,
    queryFn: fetchVendorsForMatch,
    staleTime: 30 * 60 * 1000,
  });
}

interface Props {
  value: string;
  vendorId: string | null;
  onChange: (next: { name: string; vendor: VendorOption | null }) => void;
  label?: string;
  helperText?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}

export default function VendorNameField({ value, vendorId, onChange, label = "Shop name", helperText, autoFocus, disabled }: Props) {
  const { data: vendors = [], isLoading } = useVendorOptions();
  const options = vendors as VendorOption[];
  const selected = vendorId ? options.find((v) => v.id === vendorId) ?? null : null;

  return (
    <Autocomplete<VendorOption, false, false, true>
      freeSolo
      options={options}
      loading={isLoading}
      disabled={disabled}
      value={selected ?? (value || null)}
      inputValue={value}
      getOptionLabel={(o) => (typeof o === "string" ? o : o.name)}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      renderOption={(props, o) => {
        const { key, ...rest } = props as typeof props & { key: string };
        return (
          <li key={key} {...rest}>
            {o.name}
            {o.city ? ` · ${o.city}` : ""}
          </li>
        );
      }}
      onInputChange={(_, text, reason) => {
        if (reason === "input" || reason === "clear") onChange({ name: text, vendor: null });
      }}
      onChange={(_, v) => {
        if (v && typeof v !== "string") onChange({ name: v.name, vendor: v });
        else onChange({ name: (v as string | null) ?? "", vendor: null });
      }}
      slotProps={{ popper: { disablePortal: false } }}
      renderInput={(params) => (
        <TextField {...params} label={label} helperText={helperText} autoFocus={autoFocus} fullWidth size="small" />
      )}
    />
  );
}
