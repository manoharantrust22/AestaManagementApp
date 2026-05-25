"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Box,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  InputAdornment,
} from "@mui/material";

type Mode = "qty" | "pct";

interface QuantityWithPercentInputProps {
  /** Resolved numeric quantity in `unit`. Parent owns this. */
  value: number;
  /** Called with the resolved numeric qty (in `unit`), whichever mode the user is in. */
  onChange: (qty: number) => void;
  unit: string;
  /** Denominator used for percentage → qty resolution. Usually the variant's remaining qty. */
  remaining: number;
  label?: string;
  helperText?: React.ReactNode;
  disabled?: boolean;
  required?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  /** localStorage key for sticky-per-user mode preference. */
  storageKey?: string;
}

const DEFAULT_STORAGE_KEY = "aesta.usage.inputMode";

function readStoredMode(key: string): Mode {
  if (typeof window === "undefined") return "qty";
  try {
    const v = window.localStorage.getItem(key);
    return v === "pct" ? "pct" : "qty";
  } catch {
    return "qty";
  }
}

function writeStoredMode(key: string, mode: Mode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, mode);
  } catch {
    /* swallow */
  }
}

function roundQty(n: number) {
  return Math.round(n * 1000) / 1000;
}

/**
 * Quantity input with a small [#] [%] toggle. Supervisors who think "we used
 * about 40%" (sand, PPC, aggregates) can type 40 and the component resolves
 * to numeric qty against `remaining`. The parent only ever sees a number in
 * `unit` — storage and validation downstream stay numeric-only.
 *
 * The mode is sticky per-user via localStorage so a supervisor who prefers
 * % gets it pre-selected next time.
 */
export default function QuantityWithPercentInput({
  value,
  onChange,
  unit,
  remaining,
  label = "Quantity",
  helperText,
  disabled,
  required,
  inputRef,
  storageKey = DEFAULT_STORAGE_KEY,
}: QuantityWithPercentInputProps) {
  const [mode, setMode] = useState<Mode>("qty");
  const [rawInput, setRawInput] = useState<string>(value > 0 ? String(value) : "");

  // Hydrate sticky mode preference on mount only
  useEffect(() => {
    const stored = readStoredMode(storageKey);
    if (stored !== mode) setMode(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // If parent resets value externally (e.g. dialog close), clear the raw input.
  useEffect(() => {
    if (value === 0 && rawInput !== "" && parseFloat(rawInput) === 0) {
      setRawInput("");
    }
    if (value === 0 && rawInput === "0") {
      setRawInput("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const resolved = useMemo(() => {
    const n = parseFloat(rawInput);
    if (!Number.isFinite(n) || n <= 0) return 0;
    if (mode === "pct") {
      const safeRemaining = remaining > 0 ? remaining : 0;
      return roundQty((n / 100) * safeRemaining);
    }
    return roundQty(n);
  }, [rawInput, mode, remaining]);

  const handleModeChange = (next: Mode | null) => {
    if (!next || next === mode) return;
    // Try to preserve the resolved numeric value across the toggle:
    // if user typed "20 bag" and flips to %, show the equivalent % (when remaining > 0).
    if (next === "pct" && remaining > 0 && resolved > 0) {
      const pct = (resolved / remaining) * 100;
      setRawInput(String(Math.round(pct * 10) / 10));
    } else if (next === "qty" && resolved > 0) {
      setRawInput(String(resolved));
    }
    setMode(next);
    writeStoredMode(storageKey, next);
  };

  const handleRawChange = (raw: string) => {
    setRawInput(raw);
    const n = parseFloat(raw);
    if (!Number.isFinite(n) || n <= 0) {
      onChange(0);
      return;
    }
    if (mode === "pct") {
      const safeRemaining = remaining > 0 ? remaining : 0;
      onChange(roundQty((n / 100) * safeRemaining));
    } else {
      onChange(roundQty(n));
    }
  };

  const overflow = resolved > remaining && remaining > 0;
  const previewText =
    mode === "pct"
      ? rawInput && resolved > 0
        ? `= ${resolved} ${unit} of ${remaining} ${unit} remaining`
        : `% of ${remaining} ${unit} remaining`
      : helperText
        ? null
        : remaining > 0
          ? `Max: ${remaining} ${unit}`
          : null;

  return (
    <Box>
      <Box sx={{ display: "flex", gap: 1, alignItems: "stretch" }}>
        <TextField
          fullWidth
          inputRef={inputRef}
          label={mode === "pct" ? `${label} (%)` : `${label} (${unit})`}
          type="number"
          value={rawInput}
          onChange={(e) => handleRawChange(e.target.value)}
          disabled={disabled}
          required={required}
          error={overflow}
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <Typography variant="caption" color="text.secondary">
                    {mode === "pct" ? "%" : unit}
                  </Typography>
                </InputAdornment>
              ),
              inputProps: {
                min: 0,
                step: mode === "pct" ? 0.1 : 0.001,
                max: mode === "pct" ? 100 : undefined,
              },
            },
          }}
        />
        <ToggleButtonGroup
          value={mode}
          exclusive
          size="small"
          onChange={(_e, v) => handleModeChange(v as Mode | null)}
          disabled={disabled}
          sx={{
            "& .MuiToggleButton-root": {
              px: 1.25,
              minWidth: 36,
              fontWeight: 600,
              lineHeight: 1,
            },
          }}
        >
          <ToggleButton value="qty" aria-label="Enter as quantity">#</ToggleButton>
          <ToggleButton value="pct" aria-label="Enter as percentage">%</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      {(previewText || helperText) && (
        <Typography
          variant="caption"
          color={overflow ? "error.main" : "text.secondary"}
          sx={{ display: "block", mt: 0.5, ml: 0.5 }}
        >
          {overflow
            ? `Exceeds available (${remaining} ${unit})`
            : (helperText ?? previewText)}
        </Typography>
      )}
    </Box>
  );
}
