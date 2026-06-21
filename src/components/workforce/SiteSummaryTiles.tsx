"use client";

import { Box, Typography } from "@mui/material";
import type { RollupResult } from "@/lib/workforce/exposure";
import { wsColors, wsRadius } from "@/lib/workforce/workspaceTokens";
import { formatCompactINR } from "@/lib/formatters";

const AT_RISK_AMBER_THRESHOLD = 50000;

function Tile({
  label,
  value,
  valueColor,
  bg,
  sub,
}: {
  label: string;
  value: string;
  valueColor: string;
  bg?: string;
  sub?: string;
}) {
  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        bgcolor: bg ?? wsColors.surface,
        border: `1px solid ${wsColors.hairline}`,
        borderRadius: `${wsRadius.row}px`,
        px: 1.25,
        py: 1,
      }}
    >
      <Typography
        sx={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: ".06em",
          textTransform: "uppercase",
          color: wsColors.muted,
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: 16.5,
          fontWeight: 800,
          letterSpacing: "-.02em",
          color: valueColor,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.25,
        }}
      >
        {value}
      </Typography>
      {sub && (
        <Typography sx={{ fontSize: 10.5, color: wsColors.muted, lineHeight: 1.2 }}>
          {sub}
        </Typography>
      )}
    </Box>
  );
}

/** The three site-level tiles above the contract tree: Paid · Work done · At risk. */
export function SiteSummaryTiles({ site }: { site: RollupResult }) {
  const atRiskHigh = site.atRisk > AT_RISK_AMBER_THRESHOLD;
  return (
    <Box sx={{ display: "flex", gap: 1 }}>
      <Tile label="Paid" value={formatCompactINR(site.paid)} valueColor={wsColors.primary} />
      <Tile
        label="Work done"
        value={formatCompactINR(site.workValue)}
        valueColor={wsColors.ink}
        sub={site.untrackedCount > 0 ? `${site.untrackedCount} not tracked` : undefined}
      />
      <Tile
        label="At risk"
        value={formatCompactINR(site.atRisk)}
        valueColor={atRiskHigh ? wsColors.amber : wsColors.green}
        bg={atRiskHigh ? wsColors.amberBg : wsColors.greenBg}
      />
    </Box>
  );
}
