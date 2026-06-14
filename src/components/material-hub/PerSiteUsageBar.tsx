"use client";

/**
 * Segmented per-site usage bar for a shared group batch — shows how a batch's
 * consumption splits across cluster sites, with a clear unused remainder.
 *
 * Replaces the old single-colour "X/Y used" bar that read off the per-GRN FIFO
 * allocation (which undercounts cross-site usage). Driven purely by the
 * ledger-true `inventory.per_site` split. Visual pattern ported from
 * inter-site/SharedBatchCard.
 */

import { Box, Typography } from "@mui/material";
import { hubTokens } from "@/lib/material-hub/tokens";
import { fmtQty } from "@/lib/formatters";
import { usageSegments, type PerSiteUsed } from "@/lib/material-hub/siteAccents";

export interface PerSiteUsageBarProps {
  perSite: PerSiteUsed[];
  /** Total received across the batch (bar width = used / received). */
  received: number;
  /** Total unused remainder (rendered as the trailing grey segment + legend). */
  remaining: number;
  unit: string;
  /** Highlights the viewing site's segment in primary blue. */
  viewingSiteId?: string | null;
  /** Optional small uppercase header above the bar, e.g. "Usage across sites". */
  label?: string;
  /** Denser variant for the per-row batch card. */
  compact?: boolean;
}

export default function PerSiteUsageBar({
  perSite,
  received,
  remaining,
  unit,
  viewingSiteId,
  label,
  compact = false,
}: PerSiteUsageBarProps) {
  const segments = usageSegments(perSite, received, viewingSiteId);
  if (segments.length === 0 || received <= 0) return null;

  const rem = Math.max(0, Math.round(remaining * 1000) / 1000);
  const barH = compact ? 7 : 10;
  const dot = compact ? 7 : 8;
  const fs = compact ? 9.5 : 10.5;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: compact ? "4px" : "6px" }}>
      {label && (
        <Typography
          sx={{
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: "0.4px",
            color: hubTokens.muted,
            textTransform: "uppercase",
          }}
        >
          {label}
        </Typography>
      )}

      {/* Stacked bar — the hairline background shows through as the unused remainder. */}
      <Box
        sx={{
          height: barH,
          borderRadius: `${barH / 2}px`,
          background: hubTokens.hairline,
          overflow: "hidden",
          display: "flex",
        }}
      >
        {segments.map((seg) => (
          <Box
            key={seg.siteId}
            title={`${seg.name}: ${fmtQty(seg.used)} ${unit}`}
            sx={{ width: `${seg.widthPct}%`, background: seg.accent }}
          />
        ))}
      </Box>

      {/* Legend — one entry per consuming site + the unused remainder. */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: compact ? "8px" : "10px",
        }}
      >
        {segments.map((seg) => (
          <Box key={seg.siteId} sx={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <Box sx={{ width: dot, height: dot, borderRadius: "2px", background: seg.accent }} />
            <Typography sx={{ fontSize: fs, color: hubTokens.muted, fontWeight: 600 }}>
              {seg.name}
            </Typography>
            <Typography
              sx={{ fontSize: fs, fontFamily: hubTokens.mono, color: hubTokens.text, fontWeight: 700 }}
            >
              {fmtQty(seg.used)} {unit}
            </Typography>
          </Box>
        ))}

        <Box sx={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <Box
            sx={{
              width: dot,
              height: dot,
              borderRadius: "2px",
              background: hubTokens.hairline,
              border: `1px solid ${hubTokens.border}`,
            }}
          />
          <Typography sx={{ fontSize: fs, color: hubTokens.subtle, fontWeight: 600 }}>
            {rem > 0 ? `${fmtQty(rem)} ${unit} left` : "fully used"}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
