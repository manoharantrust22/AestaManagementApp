"use client";

import { Box } from "@mui/material";
import { wsColors } from "@/lib/workforce/workspaceTokens";

/**
 * The mini "dual" bar used in tree rows and trade headers: a grey "work done" layer
 * with a thinner blue "paid" layer centred on top. When the blue extends past the grey
 * the crew has been paid ahead of the work; when the grey shows past the blue, money is
 * still held back. Both widths are a fraction (0–1) of the contract value.
 */
export function MiniDualProgressBar({
  paidPct,
  workPct,
  width = 46,
  height = 8,
}: {
  paidPct: number;
  workPct: number | null;
  width?: number | string;
  height?: number;
}) {
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  return (
    <Box
      sx={{
        position: "relative",
        width,
        height,
        borderRadius: 999,
        bgcolor: wsColors.hairline2,
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      {workPct != null && (
        <Box
          sx={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${clamp(workPct) * 100}%`,
            bgcolor: wsColors.workBar,
            borderRadius: 999,
          }}
        />
      )}
      <Box
        sx={{
          position: "absolute",
          left: 0,
          top: height * 0.25,
          height: height * 0.5,
          width: `${clamp(paidPct) * 100}%`,
          bgcolor: wsColors.primary,
          borderRadius: 999,
        }}
      />
    </Box>
  );
}
