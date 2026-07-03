"use client";

import React from "react";
import {
  Box,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  EditOutlined as OverrideIcon,
  RestartAltOutlined as ResetIcon,
} from "@mui/icons-material";

import type {
  MeasureMode,
  Space,
  SpaceOverrides,
} from "@/types/spaces.types";
import { computeQuantities } from "@/lib/spaces/measurements";

interface ComputedQuantitiesPanelProps {
  space: Space;
  mode: MeasureMode;
  canEdit: boolean;
  onSaveOverrides: (overrides: SpaceOverrides) => void;
}

const ROWS: Array<{
  key: keyof SpaceOverrides;
  qKey: "floorTileSqft" | "skirtingRft" | "wallTileSqft" | "graniteSqft";
  label: string;
  unit: string;
}> = [
  { key: "floor_tile_sqft", qKey: "floorTileSqft", label: "Floor tile", unit: "sq.ft" },
  { key: "skirting_rft", qKey: "skirtingRft", label: "Skirting", unit: "r.ft" },
  { key: "wall_tile_sqft", qKey: "wallTileSqft", label: "Wall tile", unit: "sq.ft" },
  { key: "granite_sqft", qKey: "graniteSqft", label: "Granite", unit: "sq.ft" },
];

/**
 * The four derived finish quantities. Each row can be manually overridden
 * (for L-shaped rooms etc.); an override wins in every display mode and is
 * marked so it's obvious the number is hand-set.
 */
export default function ComputedQuantitiesPanel({
  space,
  mode,
  canEdit,
  onSaveOverrides,
}: ComputedQuantitiesPanelProps) {
  const quantities = computeQuantities(space, mode);
  const overrides = space.overrides ?? {};

  const setOverride = (key: keyof SpaceOverrides, value: number | undefined) => {
    const next = { ...overrides };
    if (value === undefined) delete next[key];
    else next[key] = value;
    onSaveOverrides(next);
  };

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Quantities
      </Typography>
      <Stack spacing={0.75}>
        {ROWS.map((row) => {
          const overridden = typeof overrides[row.key] === "number";
          const hidden =
            row.qKey === "wallTileSqft" && !space.wall_tile_enabled && !overridden;
          if (hidden) return null;
          return (
            <Stack
              key={row.key}
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{ minHeight: 36 }}
            >
              <Typography variant="body2" sx={{ flex: 1 }}>
                {row.label}
              </Typography>
              {overridden ? (
                <TextField
                  size="small"
                  type="number"
                  value={overrides[row.key]}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n) && n >= 0) setOverride(row.key, n);
                  }}
                  disabled={!canEdit}
                  inputProps={{ min: 0, inputMode: "decimal" }}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">{row.unit}</InputAdornment>
                    ),
                  }}
                  sx={{ width: 140 }}
                />
              ) : (
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
                >
                  {quantities[row.qKey]}{" "}
                  <Typography component="span" variant="caption" color="text.secondary">
                    {row.unit}
                  </Typography>
                </Typography>
              )}
              {canEdit && (
                <Tooltip
                  title={
                    overridden
                      ? "Remove manual value — go back to computed"
                      : "Set a manual value (odd-shaped room)"
                  }
                >
                  <IconButton
                    size="small"
                    aria-label={
                      overridden ? `reset ${row.label}` : `override ${row.label}`
                    }
                    color={overridden ? "warning" : "default"}
                    onClick={() =>
                      overridden
                        ? setOverride(row.key, undefined)
                        : setOverride(row.key, quantities[row.qKey])
                    }
                  >
                    {overridden ? (
                      <ResetIcon fontSize="small" />
                    ) : (
                      <OverrideIcon fontSize="small" />
                    )}
                  </IconButton>
                </Tooltip>
              )}
            </Stack>
          );
        })}
      </Stack>
    </Box>
  );
}
