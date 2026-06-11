"use client";

import {
  Autocomplete,
  TextField,
  Chip,
  createFilterOptions,
} from "@mui/material";

const filter = createFilterOptions<string>();

/** Wrap free text typed by the user as a creatable "Add …" option. */
const ADD_PREFIX = 'Add "';
const ADD_SUFFIX = '"';
const makeAddOption = (input: string) => `${ADD_PREFIX}${input}${ADD_SUFFIX}`;
const isAddOption = (value: string) =>
  value.startsWith(ADD_PREFIX) && value.endsWith(ADD_SUFFIX);
/** If `value` is an "Add …" option, return the inner trade; else the value itself. */
const unwrapAddOption = (value: string) =>
  isAddOption(value)
    ? value.slice(ADD_PREFIX.length, value.length - ADD_SUFFIX.length)
    : value;

/**
 * Append a creatable "Add «input»" entry when the typed value isn't already an
 * option, so the user can add a brand-new trade with one tap (no Enter needed).
 */
function withAddOption(options: string[], inputValue: string): string[] {
  const filtered = filter(options, {
    inputValue,
    getOptionLabel: (o) => o,
  });
  const trimmed = inputValue.trim();
  const exists = options.some(
    (o) => o.toLowerCase() === trimmed.toLowerCase()
  );
  if (trimmed !== "" && !exists) filtered.push(makeAddOption(trimmed));
  return filtered;
}

/**
 * Render a dropdown row: the "Add …" entry keeps its prompt text, everything
 * else shows the plain label. `getOptionLabel` (which unwraps) is what feeds the
 * input box, so the committed value always reads clean.
 */
function renderTradeOption(
  props: React.HTMLAttributes<HTMLLIElement> & { key?: React.Key },
  option: string
) {
  const { key, ...liProps } = props;
  return (
    <li {...liProps} key={key ?? option}>
      {isAddOption(option) ? `Add “${unwrapAddOption(option)}”` : option}
    </li>
  );
}

interface TradeAutocompleteProps {
  value: string | null;
  onChange: (value: string | null) => void;
  options: string[];
  label?: string;
  placeholder?: string;
  required?: boolean;
  helperText?: string;
}

/**
 * Single-trade picker (freeSolo) for a technician's primary trade.
 * Options = labor categories ∪ TECHNICIAN_TRADES ∪ trades already in use; the
 * user may also type a brand-new one and tap the "Add …" entry.
 */
export function TradeAutocomplete({
  value,
  onChange,
  options,
  label = "Trade",
  placeholder = "e.g. Electrician, CCTV, Carpenter…",
  required,
  helperText,
}: TradeAutocompleteProps) {
  return (
    <Autocomplete
      freeSolo
      autoHighlight
      selectOnFocus
      handleHomeEndKeys
      options={options}
      value={value}
      getOptionLabel={(o) => unwrapAddOption(o as string)}
      renderOption={renderTradeOption}
      filterOptions={(opts, params) => withAddOption(opts, params.inputValue)}
      onChange={(_, v) => onChange(v ? unwrapAddOption(v as string) : null)}
      onInputChange={(_, v, reason) => {
        if (reason === "input") onChange(v || null);
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={placeholder}
          required={required}
          helperText={helperText}
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
      selectOnFocus
      handleHomeEndKeys
      options={options}
      value={value}
      getOptionLabel={(o) => unwrapAddOption(o as string)}
      renderOption={renderTradeOption}
      filterOptions={(opts, params) => withAddOption(opts, params.inputValue)}
      onChange={(_, v) => {
        const cleaned = (v as string[]).map(unwrapAddOption).map((s) => s.trim());
        // Dedupe case-insensitively, keep first spelling.
        const seen = new Set<string>();
        const out: string[] = [];
        for (const s of cleaned) {
          if (!s) continue;
          const k = s.toLowerCase();
          if (seen.has(k)) continue;
          seen.add(k);
          out.push(s);
        }
        onChange(out);
      }}
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
