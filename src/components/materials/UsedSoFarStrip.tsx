"use client";

import { useMemo } from "react";
import { Box, Typography, Link, Skeleton } from "@mui/material";
import { useMaterialUsageLedger } from "@/hooks/queries/useMaterialUsageLedger";
import { hubTokens } from "@/lib/material-hub/tokens";
import { formatCurrency } from "@/lib/formatters";

export interface UsedSoFarStripProps {
  siteId: string | undefined;
  materialId: string | null | undefined;
  materialName: string;
  unit: string;
  onViewDetails?: () => void;
}

function fmtQty(n: number, unit: string): string {
  const rounded = n % 1 === 0 ? n.toFixed(0) : n.toFixed(1);
  return `${rounded} ${unit}`;
}

export default function UsedSoFarStrip({
  siteId,
  materialId,
  materialName,
  unit,
  onViewDetails,
}: UsedSoFarStripProps) {
  // Guard: nothing to show without both identifiers
  if (!siteId || !materialId) return null;

  return (
    <UsedSoFarStripInner
      siteId={siteId}
      materialId={materialId}
      materialName={materialName}
      unit={unit}
      onViewDetails={onViewDetails}
    />
  );
}

// Inner component so the hook is always called at top-level (Rules of Hooks)
function UsedSoFarStripInner({
  siteId,
  materialId,
  materialName,
  unit,
  onViewDetails,
}: Required<Pick<UsedSoFarStripProps, "siteId" | "materialId" | "materialName" | "unit">> & {
  onViewDetails?: () => void;
}) {
  const { data: allRows, isLoading } = useMaterialUsageLedger({ site_id: siteId });

  const stats = useMemo(() => {
    if (!allRows) return null;
    const rows = allRows.filter((r) => r.material_id === materialId);
    if (rows.length === 0) return { isEmpty: true, totalQty: 0, totalCost: 0, batchCount: 0, ownCount: 0 };
    const totalQty = rows.reduce((s, r) => s + Number(r.quantity), 0);
    const totalCost = rows.reduce((s, r) => s + (r.total_cost ?? 0), 0);
    const batchCodes = new Set(
      rows
        .filter((r) => r.source === "batch" && r.batch_ref_code != null)
        .map((r) => r.batch_ref_code as string)
    );
    const ownCount = rows.filter((r) => r.source === "own").length;
    return { isEmpty: false, totalQty, totalCost, batchCount: batchCodes.size, ownCount };
  }, [allRows, materialId]);

  const stripSx = {
    px: 1.25,
    py: 0.75,
    borderRadius: "6px",
    bgcolor: hubTokens.hairline,
    display: "flex",
    alignItems: "baseline",
    flexWrap: "wrap" as const,
    gap: "4px 8px",
  };

  const labelSx = {
    fontSize: 11,
    fontWeight: 700,
    color: hubTokens.subtle,
    textTransform: "uppercase" as const,
    letterSpacing: "0.3px",
    flexShrink: 0,
  };

  const valueSx = {
    fontSize: 12,
    color: hubTokens.muted,
    fontFamily: hubTokens.mono,
  };

  const mutedSx = {
    fontSize: 12,
    color: hubTokens.subtle,
    fontStyle: "italic" as const,
  };

  if (isLoading) {
    return (
      <Box sx={stripSx}>
        <Typography component="span" sx={labelSx}>
          Used so far ·{" "}
        </Typography>
        <Skeleton variant="text" width={140} sx={{ fontSize: 12, display: "inline-block" }} />
      </Box>
    );
  }

  if (!stats || stats.isEmpty) {
    return (
      <Box sx={stripSx}>
        <Typography component="span" sx={mutedSx}>
          No prior usage recorded for this material at this site.
        </Typography>
      </Box>
    );
  }

  const batchLabel =
    stats.batchCount === 1 ? "1 batch" : `${stats.batchCount} batches`;
  const ownLabel = stats.ownCount > 0 ? ` · ${stats.ownCount} own-stock` : "";

  return (
    <Box sx={stripSx}>
      <Typography component="span" sx={labelSx}>
        Used so far · {materialName}
      </Typography>
      <Typography component="span" sx={valueSx}>
        {fmtQty(stats.totalQty, unit)} · {batchLabel}
        {ownLabel} · {formatCurrency(stats.totalCost)}
      </Typography>
      {onViewDetails && (
        <Link
          component="button"
          type="button"
          onClick={onViewDetails}
          underline="hover"
          sx={{
            fontSize: 11,
            color: hubTokens.primary,
            cursor: "pointer",
            lineHeight: 1.4,
            flexShrink: 0,
          }}
        >
          View details ›
        </Link>
      )}
    </Box>
  );
}
