"use client";

import React, { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Stack,
  Typography,
} from "@mui/material";
import { StraightenOutlined as TapeIcon } from "@mui/icons-material";

import type { Space } from "@/types/spaces.types";
import {
  dimensionVariance,
  formatFeetInches,
  VARIANCE_TOLERANCE_IN,
} from "@/lib/spaces/measurements";
import FeetInchesField from "./FeetInchesField";

interface VerifyDimensionsPanelProps {
  space: Space;
  canEdit: boolean;
  saving?: boolean;
  onVerify: (dims: {
    lengthIn: number | null;
    widthIn: number | null;
    heightIn: number | null;
  }) => void;
}

/**
 * Drawing vs field-measured values side by side. Field values beyond
 * VARIANCE_TOLERANCE_IN of the drawing highlight amber — the drawing stays
 * on record so the difference is never lost.
 */
export default function VerifyDimensionsPanel({
  space,
  canEdit,
  saving = false,
  onVerify,
}: VerifyDimensionsPanelProps) {
  const [lengthIn, setLengthIn] = useState<number | null>(space.verified_length_in);
  const [widthIn, setWidthIn] = useState<number | null>(space.verified_width_in);
  const [heightIn, setHeightIn] = useState<number | null>(space.verified_height_in);

  const variance = dimensionVariance({
    ...space,
    verified_length_in: lengthIn,
    verified_width_in: widthIn,
    verified_height_in: heightIn,
  });

  const dirty =
    lengthIn !== space.verified_length_in ||
    widthIn !== space.verified_width_in ||
    heightIn !== space.verified_height_in;

  const rows: Array<{
    label: string;
    drawing: number | null;
    value: number | null;
    set: (v: number | null) => void;
    varianceIn: number | null;
  }> = [
    { label: "Length", drawing: space.drawing_length_in, value: lengthIn, set: setLengthIn, varianceIn: variance.length },
    { label: "Width", drawing: space.drawing_width_in, value: widthIn, set: setWidthIn, varianceIn: variance.width },
    { label: "Height", drawing: space.drawing_height_in, value: heightIn, set: setHeightIn, varianceIn: variance.height },
  ];

  const anyVariance = rows.some(
    (r) => r.varianceIn !== null && r.varianceIn > VARIANCE_TOLERANCE_IN
  );

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Field verification
      </Typography>
      <Stack spacing={1}>
        {rows.map((r) => {
          const flagged =
            r.varianceIn !== null && r.varianceIn > VARIANCE_TOLERANCE_IN;
          return (
            <Stack key={r.label} direction="row" spacing={1.5} alignItems="center">
              <Box sx={{ width: 88 }}>
                <Typography variant="caption" color="text.secondary">
                  {r.label}
                </Typography>
                <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>
                  {formatFeetInches(r.drawing)}
                </Typography>
              </Box>
              <FeetInchesField
                label="Measured"
                value={r.value}
                onChange={r.set}
                disabled={!canEdit || saving}
                sx={{
                  width: 130,
                  ...(flagged && {
                    "& .MuiOutlinedInput-notchedOutline": {
                      borderColor: "warning.main",
                    },
                  }),
                }}
              />
              {flagged && (
                <Typography variant="caption" color="warning.main">
                  {formatFeetInches(r.varianceIn)} off drawing
                </Typography>
              )}
            </Stack>
          );
        })}
      </Stack>

      {anyVariance && (
        <Alert severity="warning" sx={{ mt: 1.5 }} icon={<TapeIcon fontSize="inherit" />}>
          Site measurement differs from the drawing beyond {VARIANCE_TOLERANCE_IN}
          &quot;. The drawing value stays on record — quantities use the measured
          value in &quot;Verified&quot; mode.
        </Alert>
      )}

      {space.verified_at && !dirty && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
          Verified {new Date(space.verified_at).toLocaleDateString()}
        </Typography>
      )}

      {canEdit && dirty && (
        <Button
          variant="contained"
          size="small"
          sx={{ mt: 1.5 }}
          disabled={saving}
          onClick={() => onVerify({ lengthIn, widthIn, heightIn })}
        >
          Save field measurements
        </Button>
      )}
    </Box>
  );
}
