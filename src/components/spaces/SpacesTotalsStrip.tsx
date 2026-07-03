"use client";

import React, { useState } from "react";
import {
  Box,
  IconButton,
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Check as CopiedIcon,
  ContentCopy as CopyIcon,
} from "@mui/icons-material";

import type { MeasureMode } from "@/types/spaces.types";
import type { SpacesTotals } from "@/lib/spaces/measurements";
import { formatTotalsForWhatsApp } from "@/lib/spaces/measurements";

interface SpacesTotalsStripProps {
  totals: SpacesTotals;
  mode: MeasureMode;
  onModeChange: (mode: MeasureMode) => void;
  siteName: string;
  sectionNames: Map<string | null, string>;
}

const TILES: Array<{
  key: keyof SpacesTotals["grand"];
  label: string;
  unit: string;
}> = [
  { key: "floorTileSqft", label: "Floor tile", unit: "sq.ft" },
  { key: "skirtingRft", label: "Skirting", unit: "r.ft" },
  { key: "wallTileSqft", label: "Wall tile", unit: "sq.ft" },
  { key: "graniteSqft", label: "Granite", unit: "sq.ft" },
];

/**
 * Sticky totals strip — the four numbers taken to the vendor and into
 * per-sqft labour contracts, with a Drawing/Verified source toggle and a
 * copy-as-text button for WhatsApp.
 */
export default function SpacesTotalsStrip({
  totals,
  mode,
  onModeChange,
  siteName,
  sectionNames,
}: SpacesTotalsStripProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(
        formatTotalsForWhatsApp(totals, siteName, mode, sectionNames)
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (permissions); nothing to recover.
    }
  };

  return (
    <Paper
      variant="outlined"
      sx={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        px: { xs: 1.5, sm: 2 },
        py: 1.25,
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={{ xs: 1.5, sm: 3 }}
        sx={{ flexWrap: "wrap", rowGap: 1 }}
      >
        {TILES.map((t) => (
          <Box key={t.key} sx={{ minWidth: 76 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              {t.label}
            </Typography>
            <Typography
              variant="h6"
              sx={{ fontVariantNumeric: "tabular-nums", lineHeight: 1.2 }}
            >
              {totals.grand[t.key]}
              <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                {t.unit}
              </Typography>
            </Typography>
          </Box>
        ))}

        <Box sx={{ flex: 1 }} />

        <ToggleButtonGroup
          exclusive
          size="small"
          value={mode}
          onChange={(_, v: MeasureMode | null) => {
            if (v) onModeChange(v);
          }}
        >
          <ToggleButton value="drawing">Drawing</ToggleButton>
          <ToggleButton value="best">Verified</ToggleButton>
        </ToggleButtonGroup>

        <Tooltip title={copied ? "Copied!" : "Copy totals as text (WhatsApp)"}>
          <IconButton size="small" aria-label="copy totals" onClick={handleCopy}>
            {copied ? <CopiedIcon fontSize="small" color="success" /> : <CopyIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Stack>
    </Paper>
  );
}
