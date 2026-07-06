"use client";

import React, { useState } from "react";
import {
  Box,
  Button,
  Collapse,
  IconButton,
  Paper,
  Stack,
  Typography,
} from "@mui/material";
import {
  Add as AddIcon,
  ExpandLess as CollapseIcon,
  ExpandMore as ExpandIcon,
  MapOutlined as PlanIcon,
  PictureAsPdf as PdfIcon,
} from "@mui/icons-material";

import type { ScopePhotoRef } from "@/types/spaces.types";
import type { SpaceQuantities } from "@/types/spaces.types";
import { isPdfRef } from "@/lib/spaces/floors";
import FloorPlanViewer from "./FloorPlanViewer";

interface FloorGroupProps {
  floorName: string;
  siteId: string;
  /** Null for the "Unassigned" pseudo-group (no plan, no add-with-floor). */
  sectionId: string | null;
  plan: ScopePhotoRef | null;
  subtotals: SpaceQuantities | undefined;
  spaceCount: number;
  canEdit: boolean;
  onAddSpace: (sectionId: string | null) => void;
  onSetPlan: (sectionId: string, plan: ScopePhotoRef) => void;
  /** Manually-entered built-up sqft (incl. walls) for this floor. */
  builtAreaSqft?: number | null;
  onSetBuiltArea?: (sectionId: string, sqft: number | null) => void;
  children: React.ReactNode;
}

/** Collapsible floor group: header with plan thumbnail + subtotals. */
export default function FloorGroup({
  floorName,
  siteId,
  sectionId,
  plan,
  subtotals,
  spaceCount,
  canEdit,
  onAddSpace,
  onSetPlan,
  builtAreaSqft = null,
  onSetBuiltArea,
  children,
}: FloorGroupProps) {
  const [expanded, setExpanded] = useState(true);
  const [planOpen, setPlanOpen] = useState(false);

  return (
    <Paper variant="outlined" sx={{ overflow: "hidden" }}>
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{
          px: { xs: 1.5, sm: 2 },
          py: 1,
          bgcolor: "action.hover",
          cursor: "pointer",
        }}
        onClick={() => setExpanded((e) => !e)}
      >
        <IconButton size="small" aria-label={expanded ? "collapse floor" : "expand floor"}>
          {expanded ? <CollapseIcon /> : <ExpandIcon />}
        </IconButton>

        {sectionId && (
          <IconButton
            size="small"
            aria-label="floor plan"
            onClick={(e) => {
              e.stopPropagation();
              setPlanOpen(true);
            }}
            sx={{ p: plan ? 0.25 : undefined }}
          >
            {plan && !isPdfRef(plan) ? (
              <Box
                component="img"
                src={plan.url}
                alt={`${floorName} plan`}
                sx={{
                  width: 32,
                  height: 32,
                  objectFit: "cover",
                  borderRadius: 0.5,
                  border: 1,
                  borderColor: "divider",
                }}
              />
            ) : plan ? (
              <PdfIcon fontSize="small" color="error" />
            ) : (
              <PlanIcon fontSize="small" color={canEdit ? "action" : "disabled"} />
            )}
          </IconButton>
        )}

        <Typography variant="subtitle1" sx={{ fontWeight: 600, flex: 1, minWidth: 0 }} noWrap>
          {floorName}
          <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
            {spaceCount} {spaceCount === 1 ? "space" : "spaces"}
          </Typography>
        </Typography>

        {subtotals && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display: { xs: "none", md: "block" },
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {subtotals.floorTileSqft} sqft · {subtotals.skirtingRft} rft
            {subtotals.wallTileSqft > 0 && <> · wall {subtotals.wallTileSqft} sqft</>}
            {subtotals.graniteSqft > 0 && <> · granite {subtotals.graniteSqft} sqft</>}
            {builtAreaSqft !== null && <> · built-up {builtAreaSqft} sqft</>}
          </Typography>
        )}

        {canEdit && (
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={(e) => {
              e.stopPropagation();
              onAddSpace(sectionId);
            }}
          >
            Space
          </Button>
        )}
      </Stack>

      <Collapse in={expanded}>
        <Box>{children}</Box>
      </Collapse>

      {sectionId && (
        <FloorPlanViewer
          open={planOpen}
          onClose={() => setPlanOpen(false)}
          floorName={floorName}
          siteId={siteId}
          sectionId={sectionId}
          plan={plan}
          canEdit={canEdit}
          onSetPlan={(p) => onSetPlan(sectionId, p)}
          builtAreaSqft={builtAreaSqft}
          onSetBuiltArea={
            onSetBuiltArea ? (v) => onSetBuiltArea(sectionId, v) : undefined
          }
        />
      )}
    </Paper>
  );
}
