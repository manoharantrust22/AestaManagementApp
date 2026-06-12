"use client";

/**
 * Summary strip shown above the Hub results when a material filter is active.
 * Rolls up the filtered threads into Ordered / Delivered / Used / Remaining
 * plus a per-site used breakdown so the engineer can cross-check the numbers
 * against the material usage ledger without leaving the page.
 *
 * Used/Remaining come from batch-scoped inventory (group/historical batches);
 * own-site shared-bucket POs have no per-PO inventory, so for those filters the
 * Ordered/Delivered figures carry the signal.
 */

import { useMemo } from "react";
import { Box, Typography } from "@mui/material";
import { hubTokens } from "@/lib/material-hub/tokens";
import { fmtQty } from "@/lib/formatters";
import { summarizeFilteredThreads } from "@/lib/material-hub/filteredSummary";
import type { MaterialThread } from "@/lib/material-hub/threadTypes";

interface HubFilteredSummaryProps {
  threads: MaterialThread[];
  materialLabel: string;
  viewingSiteName: string;
}

function Metric({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: number;
  unit: string | null;
  tone?: string;
}) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", minWidth: 64 }}>
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
      <Typography
        sx={{
          fontSize: 16,
          fontWeight: 800,
          lineHeight: "20px",
          color: tone ?? hubTokens.text,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {fmtQty(value)}
        {unit ? (
          <Box component="span" sx={{ fontSize: 10, fontWeight: 600, color: hubTokens.muted, ml: 0.5 }}>
            {unit}
          </Box>
        ) : null}
      </Typography>
    </Box>
  );
}

export default function HubFilteredSummary({
  threads,
  materialLabel,
  viewingSiteName,
}: HubFilteredSummaryProps) {
  const s = useMemo(
    () => summarizeFilteredThreads(threads, viewingSiteName),
    [threads, viewingSiteName]
  );

  if (threads.length === 0) return null;

  return (
    <Box
      sx={{
        background: hubTokens.card,
        border: `1px solid ${hubTokens.border}`,
        borderRadius: "12px",
        padding: "12px 16px",
        mb: 1.5,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "18px",
      }}
    >
      <Box sx={{ display: "flex", flexDirection: "column", mr: 0.5 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 800, color: hubTokens.text }}>
          {materialLabel}
        </Typography>
        <Typography sx={{ fontSize: 10.5, color: hubTokens.muted }}>
          {s.threadCount} thread{s.threadCount === 1 ? "" : "s"}
          {s.unit === null ? " · mixed units" : ""}
        </Typography>
      </Box>

      <Metric label="Ordered" value={s.ordered} unit={s.unit} />
      <Metric label="Delivered" value={s.delivered} unit={s.unit} />
      <Metric label="Used" value={s.used} unit={s.unit} />
      <Metric label="Remaining" value={s.remaining} unit={s.unit} tone={hubTokens.success} />

      {s.perSiteUsed.length > 0 && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: "3px", ml: "auto" }}>
          <Typography
            sx={{
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: "0.4px",
              color: hubTokens.muted,
              textTransform: "uppercase",
            }}
          >
            Used by site
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            {s.perSiteUsed.map((p) => (
              <Box
                key={p.site_name}
                component="span"
                sx={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "2px 8px",
                  borderRadius: "6px",
                  background: hubTokens.chip,
                  color: hubTokens.text,
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {p.site_name}
                <Box component="span" sx={{ color: hubTokens.muted }}>
                  {fmtQty(p.used)}
                  {s.unit ? ` ${s.unit}` : ""}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
