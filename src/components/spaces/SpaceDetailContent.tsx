"use client";

import React from "react";
import { Box, Button, Chip, Divider, Stack, Typography } from "@mui/material";
import {
  DeleteOutline as DeleteIcon,
  EditOutlined as EditIcon,
} from "@mui/icons-material";

import type {
  MeasureMode,
  ScopePhotoRef,
  Space,
  SpaceOverrides,
  SpaceTileOption,
  SpaceUpdate,
} from "@/types/spaces.types";
import { SPACE_TYPE_LABELS } from "@/types/spaces.types";
import { formatFeetInches } from "@/lib/spaces/measurements";
import ComputedQuantitiesPanel from "./ComputedQuantitiesPanel";
import SpacePhotosSection from "./SpacePhotosSection";
import SpaceTilePanel from "./SpaceTilePanel";
import VerifyDimensionsPanel from "./VerifyDimensionsPanel";

interface SpaceDetailContentProps {
  space: Space;
  mode: MeasureMode;
  canEdit: boolean;
  saving?: boolean;
  tileOptions: SpaceTileOption[];
  onEdit: () => void;
  onDelete: () => void;
  onSaveOverrides: (overrides: SpaceOverrides) => void;
  onSavePhotos: (photos: ScopePhotoRef[]) => void;
  onUpdate: (updates: SpaceUpdate) => void;
  onManageTileOptions: () => void;
  onVerify: (dims: {
    lengthIn: number | null;
    widthIn: number | null;
    heightIn: number | null;
  }) => void;
}

/**
 * The expanded body of a space — shared by the desktop expandable row and
 * the mobile bottom sheet so both surfaces behave identically.
 */
export default function SpaceDetailContent({
  space,
  mode,
  canEdit,
  saving = false,
  tileOptions,
  onEdit,
  onDelete,
  onSaveOverrides,
  onSavePhotos,
  onUpdate,
  onManageTileOptions,
  onVerify,
}: SpaceDetailContentProps) {
  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ flexWrap: "wrap", rowGap: 1 }}>
        <Chip size="small" variant="outlined" label={SPACE_TYPE_LABELS[space.space_type]} />
        <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
          {formatFeetInches(space.drawing_length_in)} × {formatFeetInches(space.drawing_width_in)}
          {space.drawing_height_in !== null && <> × {formatFeetInches(space.drawing_height_in)} h</>}
        </Typography>
        {space.wall_tile_enabled && space.tiling_height_in !== null && (
          <Chip
            size="small"
            variant="outlined"
            color="info"
            label={`Wall tile to ${formatFeetInches(space.tiling_height_in)}`}
          />
        )}
        <Box sx={{ flex: 1 }} />
        {canEdit && (
          <Stack direction="row" spacing={1}>
            <Button size="small" startIcon={<EditIcon />} onClick={onEdit}>
              Edit
            </Button>
            <Button size="small" color="error" startIcon={<DeleteIcon />} onClick={onDelete}>
              Delete
            </Button>
          </Stack>
        )}
      </Stack>

      {space.notes && (
        <Typography variant="body2" color="text.secondary">
          {space.notes}
        </Typography>
      )}

      <ComputedQuantitiesPanel
        space={space}
        mode={mode}
        canEdit={canEdit}
        onSaveOverrides={onSaveOverrides}
      />

      <Divider />

      <SpaceTilePanel
        space={space}
        mode={mode}
        canEdit={canEdit}
        tileOptions={tileOptions}
        onUpdate={onUpdate}
        onManageTileOptions={onManageTileOptions}
      />

      <Divider />

      <VerifyDimensionsPanel
        space={space}
        canEdit={canEdit}
        saving={saving}
        onVerify={onVerify}
      />

      <Divider />

      <SpacePhotosSection space={space} canEdit={canEdit} onSave={onSavePhotos} />
    </Stack>
  );
}
