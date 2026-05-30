"use client";

/**
 * Cluster site-chips strip (design section 4). Shows the two cluster members as
 * accent-bordered chips joined by bidirectional arrows, plus a one-line net
 * summary ("Net: Padmavathy pays Srinivasan ₹X." / "All even.").
 *
 * Mirrors the `SiteChip` strip in docs/design_handoff_intersite/mat-intersite.jsx.
 */

import { Box, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { hubTokens } from "@/lib/material-hub/tokens";
import { inr } from "@/lib/material-hub/formatters";
import type { ClusterSite } from "@/hooks/queries/useClusterInterSiteDebt";

export interface SiteChipsStripProps {
  mySite: ClusterSite;
  otherSite: ClusterSite | null;
  netAmount: number;
  netPayer: ClusterSite | null;
  netReceiver: ClusterSite | null;
}

function SiteChip({ site }: { site: ClusterSite }) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "6px 12px",
        background: hubTokens.card,
        borderRadius: "99px",
        border: `1.5px solid ${site.accent}33`,
      }}
    >
      <Box
        sx={{
          width: 24,
          height: 24,
          borderRadius: "50%",
          background: site.accent,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 800,
          fontSize: 10,
          letterSpacing: "0.3px",
        }}
      >
        {site.short}
      </Box>
      <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: hubTokens.text }}>
        {site.name}
      </Typography>
    </Box>
  );
}

export default function SiteChipsStrip({
  mySite,
  otherSite,
  netAmount,
  netPayer,
  netReceiver,
}: SiteChipsStripProps) {
  const summary =
    netAmount > 0 && netPayer && netReceiver
      ? `Net: ${netPayer.name} pays ${netReceiver.name} ${inr(netAmount)}.`
      : "All even.";

  return (
    <Box
      sx={{
        padding: "14px 18px",
        display: "flex",
        alignItems: "center",
        gap: "14px",
        flexWrap: "wrap",
        background: hubTokens.card,
        border: `1px solid ${hubTokens.border}`,
        borderRadius: "12px",
        marginBottom: "16px",
      }}
    >
      <SiteChip site={mySite} />
      {otherSite && (
        <>
          <Box sx={{ display: "flex", alignItems: "center", color: hubTokens.subtle }}>
            <ArrowBackIcon sx={{ fontSize: 16 }} />
            <ArrowForwardIcon sx={{ fontSize: 16 }} />
          </Box>
          <SiteChip site={otherSite} />
        </>
      )}
      <Box sx={{ flex: 1 }} />
      <Typography sx={{ fontSize: 11.5, color: hubTokens.muted }}>{summary}</Typography>
    </Box>
  );
}
