"use client";

import { Box, TextField, IconButton, Button, Typography } from "@mui/material";
import { Add as AddIcon, DeleteOutline as DeleteIcon } from "@mui/icons-material";
import type { ParentPackInput } from "@/types/material.types";

/**
 * One standard container/can/bag size a pack-restricted material is sold in.
 * Values are kept as strings while editing; the caller parses on submit.
 */
export interface ContainerSizeRow {
  label: string;
  contents_qty: string;
  /** Optional reference price per container (shown only when `showPrice`). */
  price: string;
}

export const blankContainerSize = (): ContainerSizeRow => ({
  label: "",
  contents_qty: "",
  price: "",
});

/** The noun used in the auto-suggested label, based on the material's unit. */
function containerNoun(unit: string): string {
  const u = unit.toLowerCase();
  if (u.startsWith("lit") || u === "l") return "can";
  if (u.startsWith("kg") || u.startsWith("bag") || u === "ton") return "bag";
  if (u.startsWith("box")) return "box";
  return "pack";
}

/** e.g. (20, "Litre") → "20 Litre can". Empty when contents is blank. */
export function suggestContainerLabel(contents: string, unitLabel: string): string {
  const n = parseFloat(contents);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `${n} ${unitLabel} ${containerNoun(unitLabel)}`;
}

/**
 * Valid, parsed container-size rows -> pack inputs (with optional reference
 * price). Shared parse logic — was duplicated identically across every dialog
 * that uses this editor.
 */
export function parentPacksFromRows(
  rows: ContainerSizeRow[],
  unitLabel: string,
  { includePrice = false }: { includePrice?: boolean } = {}
): ParentPackInput[] {
  return rows
    .map((s) => ({
      contents: parseFloat(s.contents_qty),
      price: includePrice ? parseFloat(s.price) : NaN,
      label: s.label.trim() || suggestContainerLabel(s.contents_qty, unitLabel),
    }))
    .filter((s) => Number.isFinite(s.contents) && s.contents > 0)
    .map((s) => ({
      label: s.label,
      contents_qty: s.contents,
      price: Number.isFinite(s.price) && s.price > 0 ? s.price : null,
    }));
}

interface ContainerSizesEditorProps {
  sizes: ContainerSizeRow[];
  onChange: (sizes: ContainerSizeRow[]) => void;
  /** Human unit label, e.g. "Litre" / "Kg" — used for the suffix + auto-label. */
  unitLabel: string;
  /** Show an optional per-container reference price column (flat materials). */
  showPrice?: boolean;
  /** Currency symbol for the price column. */
  currency?: string;
}

/**
 * Inline editor for the standard container sizes a material is sold in. Used
 * before a `material_id` exists (create dialogs), so it holds no DB state — it
 * edits an in-memory array and reports changes up via `onChange`.
 */
export default function ContainerSizesEditor({
  sizes,
  onChange,
  unitLabel,
  showPrice = false,
  currency = "₹",
}: ContainerSizesEditorProps) {
  const updateRow = (i: number, patch: Partial<ContainerSizeRow>) =>
    onChange(sizes.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const handleContentsChange = (i: number, value: string) => {
    const row = sizes[i];
    // Auto-fill the label while the user hasn't customised it (blank, or still
    // equal to the previous suggestion).
    const prevSuggestion = suggestContainerLabel(row.contents_qty, unitLabel);
    const labelIsAuto = !row.label.trim() || row.label === prevSuggestion;
    updateRow(i, {
      contents_qty: value,
      label: labelIsAuto ? suggestContainerLabel(value, unitLabel) : row.label,
    });
  };

  const addRow = () => onChange([...sizes, blankContainerSize()]);
  const removeRow = (i: number) => onChange(sizes.filter((_, idx) => idx !== i));

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {sizes.map((row, i) => (
        <Box key={i} sx={{ display: "flex", gap: 1, alignItems: "flex-start", flexWrap: "wrap" }}>
          <TextField
            label="Contains"
            type="number"
            value={row.contents_qty}
            onChange={(e) => handleContentsChange(i, e.target.value)}
            size="small"
            inputProps={{ min: 0, step: "any", style: { width: 64, textAlign: "right" } }}
            InputProps={{
              endAdornment: (
                <Typography sx={{ fontSize: 11, color: "text.secondary", ml: 0.5 }}>
                  {unitLabel}
                </Typography>
              ),
            }}
          />
          <TextField
            label="Label"
            placeholder={suggestContainerLabel(row.contents_qty, unitLabel) || "e.g. 20 Litre can"}
            value={row.label}
            onChange={(e) => updateRow(i, { label: e.target.value })}
            size="small"
            sx={{ flex: 1, minWidth: 120 }}
          />
          {showPrice && (
            <TextField
              label="Price / container"
              type="number"
              value={row.price}
              onChange={(e) => updateRow(i, { price: e.target.value })}
              size="small"
              inputProps={{ min: 0, step: "any", style: { textAlign: "right" } }}
              InputProps={{
                startAdornment: <Typography sx={{ mr: 0.5 }}>{currency}</Typography>,
              }}
              sx={{ width: 140 }}
            />
          )}
          <IconButton
            size="small"
            onClick={() => removeRow(i)}
            disabled={sizes.length <= 1}
            sx={{ mt: 0.5 }}
            aria-label="Remove container size"
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}
      <Button
        startIcon={<AddIcon />}
        onClick={addRow}
        size="small"
        sx={{ textTransform: "none", alignSelf: "flex-start" }}
      >
        Add another size
      </Button>
    </Box>
  );
}
