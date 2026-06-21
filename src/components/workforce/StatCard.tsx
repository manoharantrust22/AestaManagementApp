"use client";

import { Box, Typography } from "@mui/material";
import { wsColors, wsRadius, wsShadow } from "@/lib/workforce/workspaceTokens";

/** One of the three stat cards in the detail pane (Contract value / Work done / Paid out). */
export function StatCard({
  label,
  value,
  sub,
  valueColor = wsColors.ink,
}: {
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
}) {
  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        bgcolor: wsColors.surface,
        border: `1px solid ${wsColors.hairline}`,
        borderRadius: `${wsRadius.card}px`,
        boxShadow: wsShadow.card,
        px: 1.75,
        py: 1.5,
      }}
    >
      <Typography
        sx={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: ".04em",
          textTransform: "uppercase",
          color: wsColors.muted,
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          mt: 0.5,
          fontSize: 20,
          fontWeight: 800,
          letterSpacing: "-.02em",
          color: valueColor,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.1,
        }}
      >
        {value}
      </Typography>
      {sub && (
        <Typography sx={{ mt: 0.25, fontSize: 12, color: wsColors.ink2 }}>
          {sub}
        </Typography>
      )}
    </Box>
  );
}
