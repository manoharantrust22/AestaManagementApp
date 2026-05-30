"use client";

/**
 * One shared-batch card with a stacked per-site usage bar (design section 5).
 * Ports `SharedBatchCard` from docs/design_handoff_intersite/mat-intersite.jsx
 * to MUI + hubTokens. Site id → label/accent comes from the page's siteMetaById.
 */

import { Box, Typography } from "@mui/material";
import { hubTokens } from "@/lib/material-hub/tokens";
import { inr } from "@/lib/material-hub/formatters";
import type { ClusterSite } from "@/hooks/queries/useClusterInterSiteDebt";
import type { SharedBatchRow } from "@/hooks/queries/useClusterSharedBatches";

export interface SharedBatchCardProps {
  batch: SharedBatchRow;
  siteMetaById: Map<string, ClusterSite>;
}

export default function SharedBatchCard({ batch, siteMetaById }: SharedBatchCardProps) {
  const payer = batch.payerSiteId ? siteMetaById.get(batch.payerSiteId) : null;

  return (
    <Box
      sx={{
        padding: "14px 18px",
        background: hubTokens.card,
        border: `1px solid ${hubTokens.border}`,
        borderRadius: "12px",
      }}
    >
      {/* Header row */}
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "10px",
          marginBottom: "8px",
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: 10,
              fontFamily: hubTokens.mono,
              color: hubTokens.subtle,
              letterSpacing: "0.3px",
              marginBottom: "3px",
            }}
          >
            {batch.batchCode}
          </Typography>
          <Typography sx={{ fontSize: 14, fontWeight: 700, color: hubTokens.text }}>
            {batch.materialName}{" "}
            <Box component="span" sx={{ color: hubTokens.muted, fontWeight: 500 }}>
              · {batch.receivedQty} {batch.unit}
            </Box>
          </Typography>
          <Typography sx={{ fontSize: 11, color: hubTokens.muted, marginTop: "2px" }}>
            {batch.vendorName ?? "—"} · paid by{" "}
            <Box component="span" sx={{ color: payer?.accent ?? hubTokens.text, fontWeight: 700 }}>
              {payer?.short ?? "—"}
            </Box>
          </Typography>
        </Box>
        <Box sx={{ textAlign: "right", flexShrink: 0 }}>
          <Typography
            sx={{ fontSize: 13, fontFamily: hubTokens.mono, fontWeight: 700, color: hubTokens.text }}
          >
            {inr(batch.amount)}
          </Typography>
          <Typography sx={{ fontSize: 11, color: hubTokens.muted }}>
            {batch.pctUsed}% used
          </Typography>
        </Box>
      </Box>

      {/* Stacked usage bar */}
      <Box
        sx={{
          height: 10,
          borderRadius: "5px",
          background: hubTokens.hairline,
          overflow: "hidden",
          display: "flex",
        }}
      >
        {batch.segments.map((seg) => {
          const meta = siteMetaById.get(seg.siteId);
          const widthPct = Math.min(100, (seg.used / batch.receivedQty) * 100);
          return (
            <Box
              key={seg.siteId}
              title={`${meta?.name ?? "Site"}: ${seg.used} ${batch.unit}`}
              sx={{ width: `${widthPct}%`, background: meta?.accent ?? hubTokens.subtle }}
            />
          );
        })}
      </Box>

      {/* Legend */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "10px",
          marginTop: "8px",
        }}
      >
        {batch.segments.map((seg) => {
          const meta = siteMetaById.get(seg.siteId);
          return (
            <Box key={seg.siteId} sx={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: "2px",
                  background: meta?.accent ?? hubTokens.subtle,
                }}
              />
              <Typography sx={{ fontSize: 10.5, color: hubTokens.muted, fontWeight: 600 }}>
                {meta?.short ?? "—"}
              </Typography>
              <Typography
                sx={{ fontSize: 10.5, fontFamily: hubTokens.mono, color: hubTokens.text, fontWeight: 700 }}
              >
                {seg.used}
              </Typography>
            </Box>
          );
        })}
        <Box sx={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <Box sx={{ width: 8, height: 8, borderRadius: "2px", background: hubTokens.hairline }} />
          <Typography sx={{ fontSize: 10.5, color: hubTokens.subtle, fontWeight: 600 }}>
            Unused
          </Typography>
          <Typography
            sx={{ fontSize: 10.5, fontFamily: hubTokens.mono, color: hubTokens.subtle, fontWeight: 700 }}
          >
            {Math.round(batch.remaining * 100) / 100}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
