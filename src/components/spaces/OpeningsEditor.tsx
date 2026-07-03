"use client";

import React from "react";
import {
  Box,
  Button,
  IconButton,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import {
  Add as AddIcon,
  DeleteOutline as DeleteIcon,
  DoorFrontOutlined as DoorIcon,
  WindowOutlined as WindowIcon,
} from "@mui/icons-material";

import type { OpeningKind, SpaceOpening } from "@/types/spaces.types";
import FeetInchesField from "./FeetInchesField";

interface OpeningsEditorProps {
  value: SpaceOpening[];
  onChange: (next: SpaceOpening[]) => void;
  disabled?: boolean;
}

const newOpening = (kind: OpeningKind): SpaceOpening => ({
  id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  kind,
  width_in: kind === "door" ? 42 : 48, // 3'6" door / 4' window defaults
  height_in: kind === "door" ? 84 : 48,
  count: 1,
});

/**
 * Doors & windows of a space. Door widths break the skirting run;
 * both kinds deduct from the wall-tile band.
 */
export default function OpeningsEditor({
  value,
  onChange,
  disabled = false,
}: OpeningsEditorProps) {
  const update = (id: string, patch: Partial<SpaceOpening>) =>
    onChange(value.map((o) => (o.id === id ? { ...o, ...patch } : o)));

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="subtitle2">Doors & windows</Typography>
        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            startIcon={<AddIcon />}
            disabled={disabled}
            onClick={() => onChange([...value, newOpening("door")])}
          >
            Door
          </Button>
          <Button
            size="small"
            startIcon={<AddIcon />}
            disabled={disabled}
            onClick={() => onChange([...value, newOpening("window")])}
          >
            Window
          </Button>
        </Stack>
      </Stack>

      {value.length === 0 ? (
        <Typography variant="caption" color="text.secondary">
          None yet — add doors so skirting excludes their width.
        </Typography>
      ) : (
        <Stack spacing={1} sx={{ mt: 1 }}>
          {value.map((o) => (
            <Stack
              key={o.id}
              direction="row"
              spacing={1}
              alignItems="center"
              sx={{ flexWrap: { xs: "wrap", sm: "nowrap" }, rowGap: 1 }}
            >
              <ToggleButtonGroup
                exclusive
                size="small"
                value={o.kind}
                onChange={(_, kind: OpeningKind | null) => {
                  if (kind) update(o.id, { kind });
                }}
                disabled={disabled}
              >
                <ToggleButton value="door" aria-label="door">
                  <DoorIcon fontSize="small" />
                </ToggleButton>
                <ToggleButton value="window" aria-label="window">
                  <WindowIcon fontSize="small" />
                </ToggleButton>
              </ToggleButtonGroup>
              <FeetInchesField
                label="Width"
                value={o.width_in}
                onChange={(v) => update(o.id, { width_in: v ?? 0 })}
                disabled={disabled}
                sx={{ width: 110 }}
              />
              <FeetInchesField
                label="Height"
                value={o.height_in}
                onChange={(v) => update(o.id, { height_in: v ?? 0 })}
                disabled={disabled}
                sx={{ width: 110 }}
              />
              <TextField
                label="Count"
                type="number"
                size="small"
                value={o.count}
                onChange={(e) =>
                  update(o.id, {
                    count: Math.max(1, Math.floor(Number(e.target.value) || 1)),
                  })
                }
                inputProps={{ min: 1, inputMode: "numeric" }}
                disabled={disabled}
                sx={{ width: 80 }}
              />
              <IconButton
                size="small"
                aria-label="remove opening"
                disabled={disabled}
                onClick={() => onChange(value.filter((x) => x.id !== o.id))}
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
