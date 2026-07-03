"use client";

import React, { useEffect, useState } from "react";
import { TextField } from "@mui/material";

import { formatFeetInches, parseFeetInches } from "@/lib/spaces/measurements";

interface FeetInchesFieldProps {
  label: string;
  /** Total inches, or null when empty. */
  value: number | null;
  onChange: (inches: number | null) => void;
  disabled?: boolean;
  required?: boolean;
  size?: "small" | "medium";
  helperText?: string;
  sx?: object;
}

/**
 * Feet-and-inches input. Free-typed (accepts 14' 6", 14'6, 14 6, 14.5),
 * parsed on blur and re-rendered canonically as 14' 6". Internally the
 * value is always total inches.
 */
export default function FeetInchesField({
  label,
  value,
  onChange,
  disabled = false,
  required = false,
  size = "small",
  helperText,
  sx,
}: FeetInchesFieldProps) {
  const [text, setText] = useState(value !== null ? formatFeetInches(value) : "");
  const [invalid, setInvalid] = useState(false);
  const [focused, setFocused] = useState(false);

  // Reflect external changes while not editing.
  useEffect(() => {
    if (!focused) {
      setText(value !== null ? formatFeetInches(value) : "");
      setInvalid(false);
    }
  }, [value, focused]);

  const commit = () => {
    setFocused(false);
    const trimmed = text.trim();
    if (!trimmed) {
      setInvalid(false);
      onChange(null);
      setText("");
      return;
    }
    const inches = parseFeetInches(trimmed);
    if (inches === null || inches <= 0) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setText(formatFeetInches(inches));
    onChange(inches);
  };

  return (
    <TextField
      label={label}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      disabled={disabled}
      required={required}
      size={size}
      error={invalid}
      helperText={invalid ? `Use feet & inches, e.g. 14' 6"` : helperText}
      placeholder={`e.g. 14' 6"`}
      inputProps={{ inputMode: "text" }}
      sx={sx}
    />
  );
}
