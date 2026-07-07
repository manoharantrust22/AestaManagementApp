"use client";

import React from "react";
import { Box, Paper, Stack, Typography } from "@mui/material";
import { GridOn as TileIcon } from "@mui/icons-material";

import type { SpaceTileOption } from "@/types/spaces.types";
import type { TileOptionTotal } from "@/lib/spaces/tiles";

interface TilePurchaseSummaryProps {
  totals: TileOptionTotal[];
  tileOptions: SpaceTileOption[];
}

/** Per-tile-option purchase totals (floor + contrast skirting split). */
export default function TilePurchaseSummary({ totals, tileOptions }: TilePurchaseSummaryProps) {
  if (totals.length === 0) return null;
  const byId = new Map(tileOptions.map((t) => [t.id, t]));

  return (
    <Paper variant="outlined" sx={{ px: { xs: 1.5, sm: 2 }, py: 1.25, mt: 1 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <TileIcon fontSize="small" color="action" />
        <Typography variant="subtitle2">Tiles to buy</Typography>
      </Stack>
      <Stack spacing={0.5}>
        {totals.map((t) => {
          const opt = byId.get(t.tileOptionId);
          return (
            <Box
              key={t.tileOptionId}
              sx={{
                display: "flex",
                justifyContent: "space-between",
                gap: 2,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <Typography variant="body2" noWrap>
                {opt?.label ?? "Tile"}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t.totalTiles} tiles
                {t.boxes !== null && ` ≈ ${t.boxes} box`}
                {t.price !== null && ` · ₹${t.price.toLocaleString("en-IN")}`}
              </Typography>
            </Box>
          );
        })}
      </Stack>
    </Paper>
  );
}
