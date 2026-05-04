"use client";

import React from "react";
import { Box, Typography, alpha, useTheme } from "@mui/material";
import { ScienceOutlined } from "@mui/icons-material";

interface LegacyAuditBannerProps {
  siteName: string;
  cutoffDate: string;
  /** Optional pending-week count (legacy only) — surfaced inline if provided. */
  legacyPendingCount?: number;
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Page-level "this site is in legacy audit mode" banner. Surfaces just below the
 * PageHeader on /site/payments (and other pages once Slice 3 lands). Mirrors the
 * UnsettledBanner shape so the warning tone reads as a known pattern.
 */
export default function LegacyAuditBanner({
  siteName,
  cutoffDate,
  legacyPendingCount,
}: LegacyAuditBannerProps) {
  const theme = useTheme();
  const tone = theme.palette.warning.dark;
  return (
    <Box
      role="status"
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        px: 1.5,
        py: 0.625,
        bgcolor: alpha(theme.palette.warning.main, 0.08),
        borderTop: `1px solid ${alpha(theme.palette.warning.main, 0.25)}`,
        borderBottom: `1px solid ${alpha(theme.palette.warning.main, 0.25)}`,
        color: tone,
        minHeight: 36,
        flexShrink: 0,
      }}
    >
      <ScienceOutlined sx={{ fontSize: 16 }} />
      <Typography
        component="span"
        sx={{ fontSize: 12.5, color: "text.primary", fontVariantNumeric: "tabular-nums" }}
      >
        <Box component="span" sx={{ fontWeight: 700 }}>{siteName}</Box>{" "}
        is in audit mode
        <Box component="span" sx={{ color: "text.secondary", mx: 0.75 }} aria-hidden>·</Box>
        <Box component="span">
          data before <Box component="span" sx={{ fontWeight: 600 }}>{formatDate(cutoffDate)}</Box>
          {" "}is sealed in the Legacy band
        </Box>
        {typeof legacyPendingCount === "number" && legacyPendingCount > 0 && (
          <>
            <Box component="span" sx={{ color: "text.secondary", mx: 0.75 }} aria-hidden>·</Box>
            <Box component="span">
              <Box component="span" sx={{ fontWeight: 700 }}>{legacyPendingCount}</Box>
              {" "}{legacyPendingCount === 1 ? "week" : "weeks"} pending review
            </Box>
          </>
        )}
      </Typography>
    </Box>
  );
}
