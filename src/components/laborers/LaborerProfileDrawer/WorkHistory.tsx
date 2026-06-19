"use client";

import { Box, Chip, Skeleton, Stack, Typography } from "@mui/material";
import dayjs from "dayjs";
import { formatCurrency } from "@/lib/formatters";
import { useLaborerWorkHistory } from "@/hooks/queries/useLaborerWorkHistory";
import { InfoRow, SectionTitle } from "./shared";

interface WorkHistoryProps {
  laborerId: string;
}

function fmt(d: string): string {
  return dayjs(d).format("DD MMM YY");
}

/**
 * Lifetime work history reconstructed from attendance: total days/earnings
 * across the laborer's whole time with the company, plus the distinct work
 * "stints" (separated by >30-day gaps) so re-hires read as separate spans.
 * Also surfaces the estimated commission this laborer passes to their mesthri.
 */
export default function WorkHistory({ laborerId }: WorkHistoryProps) {
  const { data, isLoading, isError } = useLaborerWorkHistory(laborerId);

  return (
    <Box>
      <SectionTitle>Work history (all time)</SectionTitle>

      {isLoading ? (
        <Stack spacing={0.5}>
          <Skeleton variant="text" width="60%" />
          <Skeleton variant="text" width="40%" />
          <Skeleton variant="rounded" height={48} />
        </Stack>
      ) : isError || !data ? (
        <Typography variant="body2" color="text.secondary">
          Couldn&apos;t load work history.
        </Typography>
      ) : data.daysWorked === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No attendance recorded yet.
        </Typography>
      ) : (
        <>
          <InfoRow label="Total days worked" value={data.daysWorked} />
          <InfoRow label="Total earned" value={formatCurrency(data.earningsTotal)} />
          <InfoRow
            label="Stints"
            value={`${data.stintCount} ${data.stintCount === 1 ? "spell" : "spells"}`}
          />
          {data.firstDay && data.lastDay && (
            <InfoRow
              label="Span"
              value={`${fmt(data.firstDay)} → ${fmt(data.lastDay)}`}
            />
          )}
          {data.hasMesthri && (
            <InfoRow
              label={`Commission to ${data.mesthriName ?? "mesthri"} (est.)`}
              value={`${formatCurrency(data.commissionEst)} · ₹${data.commissionPerDay}/day`}
            />
          )}

          {/* Stint timeline (most recent first) */}
          <Stack spacing={0.75} sx={{ mt: 1 }}>
            {data.stints.map((s, i) => (
              <Box
                key={`${s.startDate}-${i}`}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 1,
                  px: 1,
                  py: 0.75,
                  borderRadius: 1,
                  border: 1,
                  borderColor: "divider",
                }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={600} noWrap>
                    {fmt(s.startDate)}
                    {s.endDate !== s.startDate ? ` → ${fmt(s.endDate)}` : ""}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {s.days} {s.days === 1 ? "day" : "days"}
                  </Typography>
                </Box>
                <Chip
                  size="small"
                  variant="outlined"
                  label={formatCurrency(s.earned)}
                />
              </Box>
            ))}
          </Stack>
        </>
      )}
    </Box>
  );
}
