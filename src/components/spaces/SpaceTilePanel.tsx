"use client";

import React, { useState } from "react";
import {
  Box,
  Button,
  Divider,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import {
  Add as AddIcon,
  DeleteOutline as DeleteIcon,
  GridOn as TileIcon,
} from "@mui/icons-material";

import type {
  MeasureMode,
  Space,
  SpaceTileOption,
  SpaceUpdate,
  TileExclusion,
  TileLayout,
} from "@/types/spaces.types";
import { resolveDims } from "@/lib/spaces/measurements";
import { computeTileLayout, DEFAULT_WASTAGE_PCT } from "@/lib/spaces/tiles";
import FeetInchesField from "./FeetInchesField";
import SpaceTileLayoutView from "./SpaceTileLayoutView";

interface SpaceTilePanelProps {
  space: Space;
  mode: MeasureMode;
  canEdit: boolean;
  tileOptions: SpaceTileOption[];
  onUpdate: (updates: SpaceUpdate) => void;
  onManageTileOptions: () => void;
}

const NONE = "__none__";
const MANAGE = "__manage__";

const rid = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `ex-${Math.random().toString(36).slice(2)}`;

/**
 * Tiling section of a space: pick the shop tile, see the 2D layout with
 * no-tile zones, and get the actual tile + box count (skirting strips cut
 * from the same tile included).
 */
export default function SpaceTilePanel({
  space,
  mode,
  canEdit,
  tileOptions,
  onUpdate,
  onManageTileOptions,
}: SpaceTilePanelProps) {
  const [selectedExclusionId, setSelectedExclusionId] = useState<string | null>(null);
  const [zoneFormOpen, setZoneFormOpen] = useState(false);
  const [zoneLabel, setZoneLabel] = useState("");
  const [zoneW, setZoneW] = useState<number | null>(null);
  const [zoneH, setZoneH] = useState<number | null>(null);

  const layout: TileLayout = space.tile_layout ?? {};
  const tile = tileOptions.find((t) => t.id === space.tile_option_id) ?? null;
  const result = tile ? computeTileLayout(space, tile, mode) : null;
  const dims = resolveDims(space, mode);

  const saveLayout = (next: TileLayout) => onUpdate({ tile_layout: next });

  const handleTileChange = (value: string) => {
    if (value === MANAGE) {
      onManageTileOptions();
      return;
    }
    onUpdate({ tile_option_id: value === NONE ? null : value });
  };

  const handleAddZone = () => {
    if (dims.lengthIn === null || dims.widthIn === null) return;
    if (zoneW === null || zoneH === null) return;
    const w = Math.min(zoneW, dims.lengthIn);
    const h = Math.min(zoneH, dims.widthIn);
    const zone: TileExclusion = {
      id: rid(),
      // Drop it centred; the user drags it into place (or edits later).
      x_in: Math.max(0, Math.round((dims.lengthIn - w) / 2)),
      y_in: Math.max(0, Math.round((dims.widthIn - h) / 2)),
      w_in: w,
      h_in: h,
      label: zoneLabel.trim() || undefined,
    };
    saveLayout({ ...layout, exclusions: [...(layout.exclusions ?? []), zone] });
    setZoneFormOpen(false);
    setZoneLabel("");
    setZoneW(null);
    setZoneH(null);
    setSelectedExclusionId(zone.id);
  };

  const handleDeleteZone = () => {
    if (!selectedExclusionId) return;
    saveLayout({
      ...layout,
      exclusions: (layout.exclusions ?? []).filter(
        (e) => e.id !== selectedExclusionId
      ),
    });
    setSelectedExclusionId(null);
  };

  const handleMoveZone = (id: string, xIn: number, yIn: number) => {
    saveLayout({
      ...layout,
      exclusions: (layout.exclusions ?? []).map((e) =>
        e.id === id ? { ...e, x_in: xIn, y_in: yIn } : e
      ),
    });
  };

  const wastage = layout.wastage_pct ?? DEFAULT_WASTAGE_PCT;

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Tiling
      </Typography>
      <Stack spacing={1.5}>
        <TextField
          select
          label="Tile"
          size="small"
          value={space.tile_option_id ?? NONE}
          onChange={(e) => handleTileChange(e.target.value)}
          disabled={!canEdit}
          sx={{ maxWidth: 340 }}
        >
          <MenuItem value={NONE}>
            <em>Not chosen yet</em>
          </MenuItem>
          {tileOptions.map((t) => (
            <MenuItem key={t.id} value={t.id}>
              {t.label}
            </MenuItem>
          ))}
          <Divider />
          <MenuItem value={MANAGE} sx={{ color: "primary.main" }}>
            <TileIcon fontSize="small" sx={{ mr: 1 }} /> Manage tile options…
          </MenuItem>
        </TextField>

        {tile && result && dims.lengthIn !== null && dims.widthIn !== null && (
          <>
            <SpaceTileLayoutView
              roomXIn={dims.lengthIn}
              roomYIn={dims.widthIn}
              tile={tile}
              layout={layout}
              result={result}
              canEdit={canEdit}
              selectedExclusionId={selectedExclusionId}
              onSelectExclusion={setSelectedExclusionId}
              onMoveExclusion={handleMoveZone}
            />

            {canEdit && (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap", rowGap: 1 }}>
                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() => setZoneFormOpen((v) => !v)}
                >
                  No-tile zone
                </Button>
                {selectedExclusionId && (
                  <Button
                    size="small"
                    color="error"
                    startIcon={<DeleteIcon />}
                    onClick={handleDeleteZone}
                  >
                    Remove zone
                  </Button>
                )}
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={layout.skirting_from_same_tile ?? false}
                      onChange={(e) =>
                        saveLayout({
                          ...layout,
                          skirting_from_same_tile: e.target.checked,
                        })
                      }
                    />
                  }
                  label={
                    <Typography variant="body2">Skirting cut from this tile</Typography>
                  }
                />
                <TextField
                  label="Wastage %"
                  size="small"
                  defaultValue={String(wastage)}
                  onBlur={(e) => {
                    const n = Number(e.target.value);
                    saveLayout({
                      ...layout,
                      wastage_pct:
                        Number.isFinite(n) && n >= 0 ? n : DEFAULT_WASTAGE_PCT,
                    });
                  }}
                  inputProps={{ inputMode: "decimal" }}
                  sx={{ width: 110 }}
                />
              </Stack>
            )}

            {zoneFormOpen && canEdit && (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap", rowGap: 1 }}>
                <TextField
                  label="Zone label"
                  size="small"
                  value={zoneLabel}
                  onChange={(e) => setZoneLabel(e.target.value)}
                  placeholder="Wardrobe"
                  sx={{ width: 140 }}
                />
                <FeetInchesField label="Width" value={zoneW} onChange={setZoneW} sx={{ width: 110 }} />
                <FeetInchesField label="Depth" value={zoneH} onChange={setZoneH} sx={{ width: 110 }} />
                <Button
                  size="small"
                  variant="contained"
                  onClick={handleAddZone}
                  disabled={zoneW === null || zoneH === null}
                >
                  Add
                </Button>
              </Stack>
            )}

            <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
              {result.fullTiles} full + {result.cutTiles} cut
              {result.excludedTiles > 0 && <> − {result.excludedTiles} excluded</>}
              {" = "}
              <strong>{result.tilesNeeded}</strong> tiles
              {result.skirtingTiles > 0 && (
                <> + {result.skirtingTiles} skirting ({result.skirtingRft} rft)</>
              )}
              {result.floorAppearances > 1 && <> × {result.floorAppearances} floors</>}
              {" + "}
              {result.wastagePct}% waste → <strong>{result.totalTiles} tiles</strong>
              {result.boxes !== null && (
                <>
                  {" ≈ "}
                  <strong>{result.boxes} boxes</strong>
                </>
              )}
              {result.price !== null && <> · ₹{result.price.toLocaleString("en-IN")}</>}
            </Typography>
          </>
        )}

        {!tile && tileOptions.length === 0 && (
          <Typography variant="caption" color="text.secondary">
            Add your shortlisted shop tiles under “Manage tile options…”, then
            pick one here to see the layout and the exact tile & box count.
          </Typography>
        )}
      </Stack>
    </Box>
  );
}
