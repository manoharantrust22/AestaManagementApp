"use client";

import { Box, Typography, Skeleton } from "@mui/material";
import TrendingUp from "@mui/icons-material/TrendingUp";
import { useSubcontractEstimateLines } from "@/hooks/queries/useSubcontractEstimateLines";
import { estimateBenchmark } from "@/lib/workforce/taskWorkMonitor";
import { goodDealSaving } from "@/lib/workforce/exposure";
import { wsColors, wsRadius, wsShadow } from "@/lib/workforce/workspaceTokens";
import { formatCurrencyFull } from "@/lib/formatters";

/**
 * Secondary "Is the price a good deal?" card — the day-wage benchmark vs the agreed price.
 * Separate from the exposure meter (which is about pay-timing, not price fairness).
 */
export function GoodDealCard({
  contractId,
  quoted,
}: {
  contractId: string;
  quoted: number;
}) {
  const { data: lines, isLoading } = useSubcontractEstimateLines(contractId);

  const benchmark = lines
    ? estimateBenchmark(
        lines.map((l) => ({
          workerCount: l.worker_count,
          days: l.days,
          dailyRate: l.daily_rate,
        }))
      )
    : 0;
  const saving = goodDealSaving(benchmark > 0 ? benchmark : null, quoted);

  return (
    <Box
      sx={{
        bgcolor: wsColors.surface,
        border: `1px solid ${wsColors.hairline}`,
        borderRadius: `${wsRadius.card}px`,
        boxShadow: wsShadow.card,
        p: 1.75,
      }}
    >
      <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: wsColors.ink, mb: 1 }}>
        Is the price a good deal?
      </Typography>

      {isLoading ? (
        <Skeleton variant="rounded" height={48} />
      ) : benchmark <= 0 ? (
        <Typography sx={{ fontSize: 12.5, color: wsColors.muted }}>
          Add a day-wage estimate (workers × days × rate) to compare against the agreed price.
        </Typography>
      ) : (
        <Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
            <Typography sx={{ fontSize: 12.5, color: wsColors.ink2 }}>Day-wage benchmark</Typography>
            <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: wsColors.ink, fontVariantNumeric: "tabular-nums" }}>
              {formatCurrencyFull(benchmark)}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", justifyContent: "space-between" }}>
            <Typography sx={{ fontSize: 12.5, color: wsColors.ink2 }}>Agreed lump sum</Typography>
            <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: wsColors.ink, fontVariantNumeric: "tabular-nums" }}>
              {formatCurrencyFull(quoted)}
            </Typography>
          </Box>
          <Box
            sx={{
              mt: 1,
              display: "flex",
              alignItems: "center",
              gap: 0.75,
              bgcolor: (saving ?? 0) > 0 ? wsColors.greenBg : wsColors.canvas,
              borderRadius: `${wsRadius.input}px`,
              px: 1.25,
              py: 0.75,
            }}
          >
            <TrendingUp sx={{ fontSize: 18, color: (saving ?? 0) > 0 ? wsColors.green : wsColors.muted }} />
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: (saving ?? 0) > 0 ? wsColors.green : wsColors.ink2 }}>
              {(saving ?? 0) > 0
                ? `Saves ${formatCurrencyFull(saving as number)} vs day wages`
                : "Priced at or above day wages"}
            </Typography>
          </Box>
        </Box>
      )}
    </Box>
  );
}
