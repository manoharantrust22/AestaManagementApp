"use client";

import React from "react";
import {
  Box,
  Chip,
  Collapse,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import {
  ExpandLess as CollapseIcon,
  ExpandMore as ExpandIcon,
} from "@mui/icons-material";

import type { MeasureMode, Space } from "@/types/spaces.types";
import {
  computeQuantities,
  formatFeetInches,
  spaceStatus,
} from "@/lib/spaces/measurements";
import SpaceStatusChip from "./SpaceStatusChip";

interface SpaceRowProps {
  space: Space;
  mode: MeasureMode;
  /** Desktop: expands inline. Mobile: parent opens the bottom sheet instead. */
  expanded: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}

/**
 * One space in a floor group. The row itself is surface-agnostic — on
 * desktop `children` (SpaceDetailContent) renders inline in a Collapse; on
 * mobile the parent leaves children empty and opens the bottom sheet.
 */
export default function SpaceRow({
  space,
  mode,
  expanded,
  onToggle,
  children,
}: SpaceRowProps) {
  const q = computeQuantities(space, mode);
  const status = spaceStatus(space);

  return (
    <Box>
      <Divider />
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        onClick={onToggle}
        sx={{
          px: { xs: 1.5, sm: 2 },
          py: 1.25,
          cursor: "pointer",
          "&:hover": { bgcolor: "action.hover" },
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" spacing={0.75}>
            <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
              {space.name}
            </Typography>
            {space.mirrored_section_ids.length > 0 && (
              <Chip
                size="small"
                variant="outlined"
                label={`Typical ×${space.mirrored_section_ids.length + 1}`}
                sx={{ height: 18, fontSize: 11 }}
              />
            )}
          </Stack>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontVariantNumeric: "tabular-nums" }}
          >
            {formatFeetInches(space.drawing_length_in)} ×{" "}
            {formatFeetInches(space.drawing_width_in)}
          </Typography>
        </Box>

        <Stack
          direction="row"
          spacing={2}
          sx={{
            display: { xs: "none", sm: "flex" },
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <QuantityCell label="Floor" value={q.floorTileSqft} unit="sqft" />
          <QuantityCell label="Skirting" value={q.skirtingRft} unit="rft" />
          {space.wall_tile_enabled && (
            <QuantityCell label="Wall" value={q.wallTileSqft} unit="sqft" />
          )}
          {q.graniteSqft > 0 && (
            <QuantityCell label="Granite" value={q.graniteSqft} unit="sqft" />
          )}
        </Stack>

        <SpaceStatusChip status={status} />
        <Box sx={{ display: { xs: "none", sm: "block" }, color: "text.secondary", lineHeight: 0 }}>
          {expanded ? <CollapseIcon fontSize="small" /> : <ExpandIcon fontSize="small" />}
        </Box>
      </Stack>

      {children && (
        <Collapse in={expanded} unmountOnExit>
          <Box sx={{ px: { xs: 1.5, sm: 2 }, pb: 2, pt: 0.5 }}>{children}</Box>
        </Collapse>
      )}
    </Box>
  );
}

function QuantityCell({
  label,
  value,
  unit,
}: {
  label: string;
  value: number;
  unit: string;
}) {
  return (
    <Box sx={{ textAlign: "right", minWidth: 64 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {value}
        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.25 }}>
          {unit}
        </Typography>
      </Typography>
    </Box>
  );
}
