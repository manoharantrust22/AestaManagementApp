"use client";

import { useState } from "react";
import {
  Box,
  Chip,
  TextField,
  InputAdornment,
  IconButton,
  Typography,
  Stack,
} from "@mui/material";
import {
  Add as AddIcon,
  Close as CloseIcon,
  Check as CheckIcon,
} from "@mui/icons-material";

/**
 * One priced thickness. `thickness` becomes the variant name (e.g. "8mm");
 * `price` is the raw input string (kept as string so the field can be empty
 * while typing). Price is per the material's primary unit.
 */
export interface ThicknessRow {
  thickness: string;
  price: string;
}

const PRESETS = ["8mm", "9mm", "10mm", "11mm", "12mm"];

interface ThicknessPriceChipsProps {
  rows: ThicknessRow[];
  onRowsChange: (rows: ThicknessRow[]) => void;
  /** Primary unit label, e.g. "piece" / "box" — shown after the ₹ price. */
  unitLabel?: string;
}

export default function ThicknessPriceChips({
  rows,
  onRowsChange,
  unitLabel = "piece",
}: ThicknessPriceChipsProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState("");

  const hasThickness = (t: string) =>
    rows.some((r) => r.thickness.toLowerCase() === t.toLowerCase());

  const addThickness = (t: string) => {
    const name = t.trim();
    if (!name || hasThickness(name)) return;
    onRowsChange([...rows, { thickness: name, price: "" }]);
  };

  const removeThickness = (t: string) => {
    onRowsChange(rows.filter((r) => r.thickness !== t));
  };

  const togglePreset = (t: string) => {
    if (hasThickness(t)) removeThickness(t);
    else addThickness(t);
  };

  const setPrice = (t: string, price: string) => {
    // Allow digits + one decimal point only.
    const cleaned = price.replace(/[^\d.]/g, "");
    onRowsChange(
      rows.map((r) => (r.thickness === t ? { ...r, price: cleaned } : r)),
    );
  };

  const commitCustom = () => {
    const v = customValue.trim();
    if (v) {
      // Append "mm" if the user typed a bare number.
      const name = /^[\d.]+$/.test(v) ? `${v}mm` : v;
      addThickness(name);
    }
    setCustomValue("");
    setCustomOpen(false);
  };

  return (
    <Box>
      {/* Preset chips — tap to add/remove a thickness */}
      <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mb: rows.length ? 1.5 : 0 }}>
        {PRESETS.map((t) => {
          const active = hasThickness(t);
          return (
            <Chip
              key={t}
              label={t}
              size="small"
              color={active ? "primary" : "default"}
              variant={active ? "filled" : "outlined"}
              icon={active ? <CheckIcon sx={{ fontSize: 15 }} /> : undefined}
              onClick={() => togglePreset(t)}
              sx={{ fontWeight: 600 }}
            />
          );
        })}
        {customOpen ? (
          <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
            <TextField
              size="small"
              autoFocus
              placeholder="e.g. 9.5mm"
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitCustom();
                } else if (e.key === "Escape") {
                  setCustomValue("");
                  setCustomOpen(false);
                }
              }}
              sx={{ width: 110, "& .MuiInputBase-input": { py: 0.5, fontSize: 13 } }}
            />
            <IconButton size="small" color="primary" onClick={commitCustom}>
              <CheckIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Box>
        ) : (
          <Chip
            label="Other…"
            size="small"
            variant="outlined"
            icon={<AddIcon sx={{ fontSize: 15 }} />}
            onClick={() => setCustomOpen(true)}
          />
        )}
      </Stack>

      {/* Per-thickness price rows */}
      {rows.length === 0 ? (
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
          Tap a thickness above, then set its price. Price is by thickness only.
        </Typography>
      ) : (
        <Stack gap={0.75}>
          {rows.map((r) => (
            <Box
              key={r.thickness}
              sx={{ display: "flex", alignItems: "center", gap: 1 }}
            >
              <Typography
                sx={{ fontSize: 13, fontWeight: 700, width: 64, flexShrink: 0 }}
              >
                {r.thickness}
              </Typography>
              <TextField
                size="small"
                placeholder="Price"
                value={r.price}
                onChange={(e) => setPrice(r.thickness, e.target.value)}
                inputMode="decimal"
                sx={{ flex: 1, maxWidth: 200 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">₹</InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
                        /{unitLabel}
                      </Typography>
                    </InputAdornment>
                  ),
                }}
              />
              <IconButton
                size="small"
                onClick={() => removeThickness(r.thickness)}
                aria-label={`Remove ${r.thickness}`}
              >
                <CloseIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Box>
          ))}
        </Stack>
      )}
    </Box>
  );
}
