"use client";

import { Box, Paper, Skeleton, Tooltip, Typography } from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { formatCurrency } from "@/lib/formatters";
import type { LaborerProfileSummary } from "@/hooks/queries/useLaborerProfileSummary";

interface HeroStatsProps {
  summary: LaborerProfileSummary | undefined;
  isLoading: boolean;
  monthLabel: string;
}

function Stat({
  label,
  value,
  loading,
  hint,
  emphasize,
}: {
  label: string;
  value: string;
  loading: boolean;
  hint?: string;
  emphasize?: boolean;
}) {
  return (
    <Box sx={{ minWidth: 0, flex: 1 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          fontWeight: 500,
        }}
      >
        {label}
        {hint && (
          <Tooltip title={hint} arrow>
            <InfoOutlinedIcon
              sx={{ fontSize: 14, color: "text.disabled", cursor: "help" }}
            />
          </Tooltip>
        )}
      </Typography>
      {loading ? (
        <Skeleton variant="text" width={70} height={30} />
      ) : (
        <Typography
          variant="h6"
          sx={{
            fontWeight: 600,
            color: emphasize ? "warning.main" : "text.primary",
            lineHeight: 1.2,
            wordBreak: "break-word",
          }}
        >
          {value}
        </Typography>
      )}
    </Box>
  );
}

export default function HeroStats({
  summary,
  isLoading,
  monthLabel,
}: HeroStatsProps) {
  const isContract = summary?.laborerType === "contract";
  const days = summary?.daysWorked ?? 0;
  const earnings = summary?.earningsTotal ?? 0;
  const paid = summary?.paidTotal ?? 0;
  const outstanding = summary?.outstanding ?? 0;

  const sites = summary?.sites ?? [];
  const breakdown =
    sites.length > 1
      ? `${sites.length} sites: ${sites
          .slice(0, 3)
          .map((s) => `${s.siteName} ${s.days}d`)
          .join(", ")}${sites.length > 3 ? ", …" : ""}`
      : sites.length === 1
        ? `${sites[0].siteName} ${sites[0].days}d`
        : null;

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 1.5,
        borderRadius: 2,
        bgcolor: (t) =>
          t.palette.mode === "dark" ? "background.default" : "grey.50",
      }}
    >
      <Typography
        variant="overline"
        color="text.secondary"
        sx={{ fontWeight: 600, letterSpacing: 0.5, display: "block" }}
      >
        {monthLabel} at a glance
      </Typography>

      <Box
        sx={{
          display: "flex",
          gap: 1,
          mt: 1,
          flexWrap: "wrap",
        }}
      >
        <Stat
          label="Days"
          value={isLoading ? "…" : `${days}`}
          loading={isLoading}
        />
        <Stat
          label="Earned"
          value={formatCurrency(earnings)}
          loading={isLoading}
        />
        <Stat
          label="Paid"
          value={isContract ? "Via mesthri" : formatCurrency(paid)}
          loading={isLoading}
          hint={
            isContract
              ? "Contract laborers are paid through their mesthri's team settlement, not directly. See Active task work below."
              : undefined
          }
        />
        <Stat
          label="Outstanding"
          value={isContract ? "—" : formatCurrency(outstanding)}
          loading={isLoading}
          emphasize={!isContract && outstanding > 0}
          hint={
            isContract
              ? "Settled via mesthri team — no direct outstanding to this laborer."
              : undefined
          }
        />
      </Box>

      {breakdown && !isLoading && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mt: 1 }}
        >
          {breakdown}
        </Typography>
      )}
    </Paper>
  );
}
