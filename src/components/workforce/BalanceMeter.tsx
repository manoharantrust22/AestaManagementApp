"use client";

import { Box, Typography } from "@mui/material";
import { meterGeometry, type ExposureResult } from "@/lib/workforce/exposure";
import { severityMeta, wsColors, wsRadius } from "@/lib/workforce/workspaceTokens";
import { formatCurrencyFull } from "@/lib/formatters";

/**
 * THE hero of the redesign — a diverging "balance meter". Centre = in step. The fill grows
 * RIGHT (into the amber "exposed" half) when paid is ahead of work, LEFT (into the green
 * "safe" half) when money is held back. Colour + copy come from the exposure severity.
 *
 * `compact` renders the slimmer variant used inside the live preview banners / mobile.
 */
export function BalanceMeter({
  exposure,
  compact = false,
}: {
  exposure: ExposureResult;
  compact?: boolean;
}) {
  const meta = severityMeta[exposure.severity];
  const Icon = meta.icon;

  if (!exposure.tracked || exposure.ratio === null || exposure.exposure === null) {
    return (
      <Box
        sx={{
          border: `1px dashed ${wsColors.hairline}`,
          borderRadius: `${wsRadius.card}px`,
          bgcolor: wsColors.surface,
          p: compact ? 1.5 : 2.25,
          display: "flex",
          alignItems: "center",
          gap: 1.25,
        }}
      >
        <Icon sx={{ color: meta.color, fontSize: 22 }} />
        <Box>
          <Typography sx={{ fontWeight: 800, fontSize: 14, color: wsColors.ink }}>
            {meta.label}
          </Typography>
          <Typography sx={{ fontSize: 12.5, color: wsColors.ink2 }}>
            Set how much of this work is done to see if you&apos;ve paid ahead.
          </Typography>
        </Box>
      </Box>
    );
  }

  const g = meterGeometry(exposure.ratio);
  const ahead = exposure.exposure >= 0;
  const magnitude = formatCurrencyFull(Math.abs(Math.round(exposure.exposure)));
  const headline = ahead
    ? `${magnitude} paid ahead of work`
    : `${magnitude} still in hand`;

  return (
    <Box
      sx={{
        bgcolor: wsColors.surface,
        border: `1px solid ${wsColors.hairline}`,
        borderRadius: `${wsRadius.card}px`,
        p: compact ? 1.75 : 2.5,
      }}
    >
      {/* Verdict header */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mb: compact ? 1.25 : 1.75 }}>
        <Box
          sx={{
            width: 34,
            height: 34,
            borderRadius: "50%",
            bgcolor: meta.bg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon sx={{ color: meta.color, fontSize: 20 }} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            sx={{
              fontWeight: 800,
              fontSize: 15,
              color: meta.color,
              letterSpacing: "-.01em",
              lineHeight: 1.2,
            }}
          >
            {meta.label} · {headline}
          </Typography>
          <Typography sx={{ fontSize: 12.5, color: wsColors.ink2 }}>{meta.sub}</Typography>
        </Box>
      </Box>

      {/* Diverging track */}
      <Box
        sx={{
          position: "relative",
          height: compact ? 14 : 18,
          borderRadius: 999,
          overflow: "hidden",
          display: "flex",
        }}
      >
        <Box sx={{ width: "50%", bgcolor: wsColors.meterSafeTrack }} />
        <Box sx={{ width: "50%", bgcolor: wsColors.meterExposedTrack }} />
        {/* centre divider */}
        <Box
          sx={{
            position: "absolute",
            left: "calc(50% - 1px)",
            top: 0,
            bottom: 0,
            width: 2,
            bgcolor: wsColors.meterDivider,
          }}
        />
        {/* fill */}
        <Box
          sx={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: `${g.fillLeftPct}%`,
            width: `${g.fillWidthPct}%`,
            bgcolor: meta.color,
            opacity: 0.9,
            transition: "left .25s ease, width .25s ease",
          }}
        />
        {/* end marker */}
        <Box
          sx={{
            position: "absolute",
            top: -2,
            bottom: -2,
            left: `calc(${g.markerPct}% - 1.5px)`,
            width: 3,
            bgcolor: wsColors.markerInk,
            borderRadius: 999,
            transition: "left .25s ease",
          }}
        />
      </Box>

      {/* Labels */}
      {!compact && (
        <Box sx={{ display: "flex", justifyContent: "space-between", mt: 1 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: wsColors.green }}>
            ◀ Safe — money in hand
          </Typography>
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: wsColors.muted2 }}>
            In step
          </Typography>
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: wsColors.amber }}>
            Paid ahead ▶
          </Typography>
        </Box>
      )}
    </Box>
  );
}
