"use client";

import React from "react";
import {
  Box,
  Chip,
  Grid,
  Paper,
  Skeleton,
  Typography,
  useTheme,
} from "@mui/material";
import { ArrowUpward, ArrowDownward, TrendingUp } from "@mui/icons-material";
import type { SiteFinancialSummary } from "@/hooks/queries/useSiteFinancialSummary";
import type { BurnRateResult } from "@/hooks/queries/useExpensePageKPIs";

// ─── Formatters ─────────────────────────────────────────────────────────────

function formatINR(n: number): string {
  return (
    "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.abs(n))
  );
}

function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_00_00_000) return `₹${(abs / 1_00_00_000).toFixed(1)}Cr`;
  if (abs >= 1_00_000) return `₹${(abs / 1_00_000).toFixed(2)}L`;
  if (abs >= 1_000) return `₹${(abs / 1_000).toFixed(1)}k`;
  return formatINR(abs);
}

// ─── Sparkline ───────────────────────────────────────────────────────────────

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data.length) return null;
  const W = 84, H = 26;
  const max = Math.max(...data, 1);
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = H - (v / max) * (H - 2) - 1;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.7}
      />
    </svg>
  );
}

// ─── BudgetGauge ─────────────────────────────────────────────────────────────

function BudgetGauge({
  spentPct,
  progressPct,
}: {
  spentPct: number;
  progressPct: number;
}) {
  const theme = useTheme();
  const isHealthy = spentPct <= progressPct + 5;
  const fillColor = isHealthy ? theme.palette.success.main : theme.palette.error.main;
  const clampedSpent = Math.min(spentPct, 100);
  const clampedProgress = Math.min(progressPct, 100);

  return (
    <Box sx={{ mt: 1 }}>
      <Box
        sx={{
          position: "relative",
          height: 6,
          bgcolor: "action.hover",
          borderRadius: 99,
          overflow: "visible",
        }}
      >
        {/* Spent fill */}
        <Box
          sx={{
            position: "absolute",
            left: 0,
            top: 0,
            height: "100%",
            width: `${clampedSpent}%`,
            bgcolor: fillColor,
            borderRadius: 99,
            transition: "width 0.6s ease",
          }}
        />
        {/* Progress marker */}
        <Box
          sx={{
            position: "absolute",
            top: -3,
            left: `${clampedProgress}%`,
            width: 2,
            height: 12,
            bgcolor: "text.primary",
            borderRadius: 1,
            transform: "translateX(-50%)",
          }}
        />
      </Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", mt: 0.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
          <Box component="span" sx={{ fontWeight: 700, color: fillColor }}>
            {clampedSpent.toFixed(0)}%
          </Box>{" "}
          of budget spent
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {clampedProgress.toFixed(0)}% complete
        </Typography>
      </Box>
    </Box>
  );
}

// ─── Card shell ──────────────────────────────────────────────────────────────

function KPICard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 1.25, md: 2 },
        borderRadius: 2,
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Typography
        variant="caption"
        fontWeight={700}
        color="text.secondary"
        textTransform="uppercase"
        letterSpacing={0.5}
        sx={{ mb: 0.5, fontSize: { xs: 10, md: 11 } }}
      >
        {label}
      </Typography>
      {children}
    </Paper>
  );
}

// ─── Individual cards ────────────────────────────────────────────────────────

function TotalSpentCard({
  total,
  totalCount,
  burnTrend,
}: {
  total: number;
  totalCount: number;
  burnTrend: number[];
}) {
  const theme = useTheme();
  // Simple trend: compare current week to previous week
  const trend =
    burnTrend.length >= 2
      ? burnTrend[burnTrend.length - 1] - burnTrend[burnTrend.length - 2]
      : 0;
  const trendPct =
    burnTrend.length >= 2 && burnTrend[burnTrend.length - 2] > 0
      ? Math.round(
          (trend / burnTrend[burnTrend.length - 2]) * 100,
        )
      : 0;
  const isUp = trendPct > 0;

  return (
    <KPICard label="Total Spent">
      <Typography
        variant="h5"
        fontWeight={700}
        sx={{
          fontVariantNumeric: "tabular-nums",
          letterSpacing: -0.4,
          lineHeight: 1.2,
          fontSize: { xs: "1.05rem", md: "1.5rem" },
        }}
      >
        {formatINR(total)}
      </Typography>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ mt: 0.25, fontSize: { xs: 11, md: 14 } }}
      >
        across {totalCount} records
      </Typography>
      {trendPct !== 0 && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.25, mt: 1 }}>
          {isUp ? (
            <ArrowUpward sx={{ fontSize: 13, color: "error.main" }} />
          ) : (
            <ArrowDownward sx={{ fontSize: 13, color: "success.main" }} />
          )}
          <Typography
            variant="caption"
            color={isUp ? "error.main" : "success.main"}
          >
            {Math.abs(trendPct)}% vs last week
          </Typography>
        </Box>
      )}
    </KPICard>
  );
}

function CashPositionCard({
  netInHand,
  clientPaid,
  totalSpent,
  onContractsClick,
}: {
  netInHand: number;
  clientPaid: number;
  totalSpent: number;
  onContractsClick?: () => void;
}) {
  const isPositive = netInHand >= 0;

  return (
    <KPICard label="Cash Position">
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <Typography
          variant="h5"
          fontWeight={700}
          color={isPositive ? "success.main" : "error.main"}
          sx={{
            fontVariantNumeric: "tabular-nums",
            letterSpacing: -0.4,
            lineHeight: 1.2,
            fontSize: { xs: "1.05rem", md: "1.5rem" },
          }}
        >
          {isPositive ? "+" : "−"}
          {formatCompact(Math.abs(netInHand))}
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
        collected − spent
      </Typography>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ mt: 0.5, fontVariantNumeric: "tabular-nums" }}
      >
        {formatCompact(clientPaid)} in / {formatCompact(totalSpent)} out
      </Typography>
      {onContractsClick && (
        <Box
          component="span"
          onClick={onContractsClick}
          sx={{
            mt: "auto",
            pt: 1,
            cursor: "pointer",
            color: "primary.main",
            fontSize: 12,
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: 0.25,
            "&:hover": { textDecoration: "underline" },
          }}
        >
          Contracts &amp; Payments →
        </Box>
      )}
    </KPICard>
  );
}

function BudgetProgressCard({
  totalContract,
  totalSpent,
  progressPct,
}: {
  totalContract: number;
  totalSpent: number;
  progressPct: number;
}) {
  const spentPct =
    totalContract > 0 ? Math.min(100, Math.round((totalSpent / totalContract) * 100)) : 0;
  const isHealthy = spentPct <= progressPct + 5;

  if (!totalContract) {
    return (
      <KPICard label="Budget vs Progress">
        <Typography variant="body2" color="text.disabled" sx={{ mt: 1 }}>
          No contract value set
        </Typography>
      </KPICard>
    );
  }

  return (
    <KPICard label="Budget vs Progress">
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Typography
          variant="h5"
          fontWeight={700}
          sx={{
            fontVariantNumeric: "tabular-nums",
            letterSpacing: -0.4,
            lineHeight: 1.2,
            fontSize: { xs: "1.05rem", md: "1.5rem" },
          }}
        >
          {spentPct}%
        </Typography>
        <Chip
          label={isHealthy ? `${Math.abs(spentPct - progressPct)}% under` : `${Math.abs(spentPct - progressPct)}% over`}
          size="small"
          sx={{
            bgcolor: isHealthy ? "success.light" : "error.light",
            color: isHealthy ? "success.dark" : "error.dark",
            fontWeight: 600,
            fontSize: 10,
            height: 18,
          }}
        />
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
        of {formatCompact(totalContract)} budget
      </Typography>
      <BudgetGauge spentPct={spentPct} progressPct={progressPct} />
    </KPICard>
  );
}

function BurnRateCard({
  burnPerWeek,
  burnTrend,
  runwayWeeks,
}: {
  burnPerWeek: number;
  burnTrend: number[];
  runwayWeeks: number | null;
}) {
  const theme = useTheme();

  return (
    <KPICard label="Burn Rate">
      <Typography
        variant="h5"
        fontWeight={700}
        sx={{
          fontVariantNumeric: "tabular-nums",
          letterSpacing: -0.4,
          lineHeight: 1.2,
          fontSize: { xs: "1.05rem", md: "1.5rem" },
        }}
      >
        {burnPerWeek > 0 ? formatCompact(burnPerWeek) : "—"}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
        per week · 4-wk avg
      </Typography>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", mt: "auto", pt: 1 }}>
        {runwayWeeks != null && (
          <Typography variant="caption" color="text.secondary">
            ~{runwayWeeks} wks runway
          </Typography>
        )}
        {burnTrend.length > 0 && (
          <Sparkline data={burnTrend} color={theme.palette.primary.main} />
        )}
      </Box>
    </KPICard>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

export interface ExpenseKPICardsProps {
  total: number;
  totalCount: number;
  financial: SiteFinancialSummary | null | undefined;
  isFinancialLoading?: boolean;
  burnRate: BurnRateResult;
  onContractsClick?: () => void;
}

export function ExpenseKPICards({
  total,
  totalCount,
  financial,
  isFinancialLoading,
  burnRate,
  onContractsClick,
}: ExpenseKPICardsProps) {
  if (isFinancialLoading) {
    return (
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {[0, 1, 2, 3].map((i) => (
          <Grid key={i} size={{ xs: 6, md: 3 }}>
            <Skeleton variant="rounded" height={110} sx={{ borderRadius: 2 }} />
          </Grid>
        ))}
      </Grid>
    );
  }

  const netInHand = financial?.netInHand ?? 0;
  const clientPaid = financial?.clientPaid ?? 0;
  const totalContract = financial?.totalContract ?? 0;
  const progressPct = financial?.progressPct ?? 0;

  return (
    <Grid container spacing={2} sx={{ mb: 2 }}>
      <Grid size={{ xs: 6, md: 3 }}>
        <TotalSpentCard
          total={total}
          totalCount={totalCount}
          burnTrend={burnRate.burnTrend}
        />
      </Grid>
      <Grid size={{ xs: 6, md: 3 }}>
        <CashPositionCard
          netInHand={netInHand}
          clientPaid={clientPaid}
          totalSpent={total}
          onContractsClick={onContractsClick}
        />
      </Grid>
      <Grid size={{ xs: 6, md: 3 }}>
        <BudgetProgressCard
          totalContract={totalContract}
          totalSpent={total}
          progressPct={progressPct}
        />
      </Grid>
      <Grid size={{ xs: 6, md: 3 }}>
        <BurnRateCard
          burnPerWeek={burnRate.burnPerWeek}
          burnTrend={burnRate.burnTrend}
          runwayWeeks={burnRate.runwayWeeks}
        />
      </Grid>
    </Grid>
  );
}
