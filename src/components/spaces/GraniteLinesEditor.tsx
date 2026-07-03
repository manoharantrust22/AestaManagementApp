"use client";

import React from "react";
import {
  Box,
  Button,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  Add as AddIcon,
  DeleteOutline as DeleteIcon,
} from "@mui/icons-material";

import type { GraniteLine } from "@/types/spaces.types";
import { graniteSqft, sqInToSqFt, round2 } from "@/lib/spaces/measurements";
import FeetInchesField from "./FeetInchesField";

interface GraniteLinesEditorProps {
  value: GraniteLine[];
  onChange: (next: GraniteLine[]) => void;
  disabled?: boolean;
}

/**
 * Manual granite line items (kitchen top, staircase steps…) — granite is
 * bought by slab dimensions, never derived from room dimensions.
 */
export default function GraniteLinesEditor({
  value,
  onChange,
  disabled = false,
}: GraniteLinesEditorProps) {
  const update = (id: string, patch: Partial<GraniteLine>) =>
    onChange(value.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="subtitle2">
          Granite
          {value.length > 0 && (
            <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
              {graniteSqft(value)} sq.ft
            </Typography>
          )}
        </Typography>
        <Button
          size="small"
          startIcon={<AddIcon />}
          disabled={disabled}
          onClick={() =>
            onChange([
              ...value,
              {
                id: `g-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                label: "",
                length_in: 0,
                width_in: 0,
                count: 1,
              },
            ])
          }
        >
          Add line
        </Button>
      </Stack>

      {value.length === 0 ? (
        <Typography variant="caption" color="text.secondary">
          e.g. Kitchen top 12&apos; × 2&apos;, staircase steps 4&apos; × 11&quot; × 10
        </Typography>
      ) : (
        <Stack spacing={1} sx={{ mt: 1 }}>
          {value.map((l) => (
            <Stack
              key={l.id}
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ flexWrap: { xs: "wrap", sm: "nowrap" }, rowGap: 1 }}
            >
              <TextField
                label="Item"
                size="small"
                value={l.label}
                onChange={(e) => update(l.id, { label: e.target.value })}
                placeholder="Kitchen top"
                disabled={disabled}
                sx={{ flex: 1, minWidth: 120 }}
              />
              <FeetInchesField
                label="Length"
                value={l.length_in || null}
                onChange={(v) => update(l.id, { length_in: v ?? 0 })}
                disabled={disabled}
                sx={{ width: 110 }}
              />
              <FeetInchesField
                label="Width"
                value={l.width_in || null}
                onChange={(v) => update(l.id, { width_in: v ?? 0 })}
                disabled={disabled}
                sx={{ width: 110 }}
              />
              <TextField
                label="Count"
                type="number"
                size="small"
                value={l.count}
                onChange={(e) =>
                  update(l.id, {
                    count: Math.max(1, Math.floor(Number(e.target.value) || 1)),
                  })
                }
                inputProps={{ min: 1, inputMode: "numeric" }}
                disabled={disabled}
                sx={{ width: 80 }}
              />
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ width: 64, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
              >
                {round2(sqInToSqFt(l.length_in * l.width_in * l.count))} sf
              </Typography>
              <IconButton
                size="small"
                aria-label="remove granite line"
                disabled={disabled}
                onClick={() => onChange(value.filter((x) => x.id !== l.id))}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Stack>
          ))}
        </Stack>
      )}
    </Box>
  );
}
