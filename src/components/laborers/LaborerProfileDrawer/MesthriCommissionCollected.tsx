"use client";

import { Box, Skeleton, Stack, Typography } from "@mui/material";
import { formatCurrency } from "@/lib/formatters";
import { useMesthriCommissionSummary } from "@/hooks/queries/useMesthriCommissionSummary";
import { InfoRow, SectionTitle } from "./shared";

interface MesthriCommissionCollectedProps {
  laborerId: string;
}

// All-time window so the drawer mirrors the "all time" work-history view.
const ALL_TIME_FROM = "2020-01-01";
const ALL_TIME_TO = "2035-12-31";

/**
 * For a laborer who is a mesthri (leads a team), shows the estimated
 * commission collected from the laborers they brought + their own salary ->
 * total. Estimate only. Renders nothing if this laborer collects no commission.
 */
export default function MesthriCommissionCollected({
  laborerId,
}: MesthriCommissionCollectedProps) {
  const { data, isLoading } = useMesthriCommissionSummary(
    ALL_TIME_FROM,
    ALL_TIME_TO,
    null,
  );

  if (isLoading) {
    return (
      <Box>
        <SectionTitle>Commission collected (all time)</SectionTitle>
        <Skeleton variant="rounded" height={64} />
      </Box>
    );
  }

  const row = data?.mesthris.find((m) => m.leaderLaborerId === laborerId);
  if (!row) return null;

  return (
    <Box>
      <SectionTitle>Commission collected (all time)</SectionTitle>
      <InfoRow
        label="Own salary"
        value={formatCurrency(row.ownSalary)}
      />
      <InfoRow
        label={`Commission from ${row.laborers.length} ${
          row.laborers.length === 1 ? "laborer" : "laborers"
        } (est.)`}
        value={formatCurrency(row.commissionCollected)}
      />
      <InfoRow
        label="Total earned"
        chip={
          <Typography variant="body2" fontWeight={700} color="success.main">
            {formatCurrency(row.total)}
          </Typography>
        }
      />

      <Stack spacing={0.5} sx={{ mt: 1 }}>
        {row.laborers.map((l) => (
          <Box
            key={l.laborerId}
            sx={{
              display: "flex",
              justifyContent: "space-between",
              gap: 1,
              px: 1,
              py: 0.5,
              borderRadius: 1,
              bgcolor: (t) =>
                t.palette.mode === "dark" ? "background.default" : "grey.50",
            }}
          >
            <Typography variant="caption" noWrap sx={{ minWidth: 0 }}>
              {l.laborerName} · {l.days}d × ₹{l.rate}
            </Typography>
            <Typography variant="caption" fontWeight={600}>
              {formatCurrency(l.commissionEst)}
            </Typography>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
