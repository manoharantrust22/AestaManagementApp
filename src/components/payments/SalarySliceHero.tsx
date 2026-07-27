"use client";

import React from "react";
import { Box, Skeleton, Typography, useTheme } from "@mui/material";
import type { SalarySliceSummary } from "@/hooks/queries/useSalarySliceSummary";
import { KpiTile, formatINR, type KpiTileProps } from "./KpiTile";
import { MobileCollapsibleHero } from "./MobileCollapsibleHero";

interface SalarySliceHeroProps {
  summary: SalarySliceSummary | undefined;
  isLoading: boolean;
}

export function SalarySliceHero({ summary, isLoading }: SalarySliceHeroProps) {
  const theme = useTheme();

  if (isLoading || !summary) {
    return (
      <Box
        sx={{
          p: { xs: 1.5, sm: 2 },
          mb: 1.5,
          bgcolor: "background.paper",
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: 1.5,
        }}
      >
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "repeat(2, 1fr)",
              sm: "repeat(3, 1fr)",
              md: "repeat(5, 1fr)",
            },
            gap: 1.25,
            mb: 1.5,
          }}
        >
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton
              key={i}
              variant="rounded"
              height={72}
              data-testid="kpi-skeleton"
            />
          ))}
        </Box>
        <Skeleton variant="rounded" height={10} />
      </Box>
    );
  }

  const progressPct =
    summary.wagesDue > 0
      ? Math.min(100, Math.round((summary.paidToWeeks / summary.wagesDue) * 100))
      : 0;
  const progressColor =
    progressPct < 50
      ? theme.palette.error.main
      : progressPct < 80
        ? theme.palette.warning.main
        : theme.palette.success.main;

  // Below this a residue is float noise, not real money (mirrors SETTLED_EPSILON
  // in crewLedger.ts) — a ₹0.30 rounding tail must not colour a tile red.
  const EPSILON = 0.5;
  const hasOwed = summary.mestriOwed > EPSILON;
  const hasExcess = summary.futureCredit > EPSILON;

  // The collapsed bar has room for one headline + one chip. Owed leads when it
  // exists (it is the actionable half); excess rides along as the secondary.
  let statusLabel: string;
  let statusVariant: KpiTileProps["variant"];
  let statusValue: string;
  let secondaryLabel: string | undefined;
  let secondaryValue: string | undefined;
  if (hasOwed) {
    statusLabel = "Still Owed";
    statusVariant = "error";
    statusValue = formatINR(summary.mestriOwed);
    if (hasExcess) {
      secondaryLabel = "Excess";
      secondaryValue = formatINR(summary.futureCredit);
    }
  } else if (hasExcess) {
    statusLabel = "Excess Paid";
    statusVariant = "info";
    statusValue = formatINR(summary.futureCredit);
  } else {
    statusLabel = "Settled";
    statusVariant = "success";
    statusValue = "₹0";
  }

  return (
    <MobileCollapsibleHero
      storageKey="payments.hero.contract.expanded"
      statusLabel={statusLabel}
      statusValue={statusValue}
      statusVariant={statusVariant}
      secondaryLabel={secondaryLabel}
      secondaryValue={secondaryValue}
      progressPct={progressPct}
      progressColor={progressColor}
    >
      <Typography
        sx={{
          fontSize: 11,
          fontWeight: 700,
          color: "text.secondary",
          textTransform: "uppercase",
          letterSpacing: 0.5,
          mb: 1,
        }}
      >
        Salary slice — payments to mestri
      </Typography>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "repeat(2, 1fr)",
            sm: "repeat(3, 1fr)",
            md: "repeat(5, 1fr)",
          },
          gap: 1.25,
          mb: 1.5,
        }}
      >
        <KpiTile
          label="Wages Due"
          value={formatINR(summary.wagesDue)}
          sub="based on attendance"
          formula={`${summary.weeksCount} weeks`}
          variant="neutral"
        />
        <KpiTile
          label="Applied to weeks"
          value={formatINR(summary.paidToWeeks)}
          sub="covers the weeks above"
          formula={`${progressPct}% of wages due`}
          variant="success"
        />
        <KpiTile
          label="Still Owed"
          value={formatINR(summary.mestriOwed)}
          sub={hasOwed ? "wages not yet covered" : "all weeks covered"}
          variant={hasOwed ? "error" : "success"}
        />
        <KpiTile
          label="Excess Paid"
          value={formatINR(summary.futureCredit)}
          sub={hasExcess ? "paid, not on any week" : "nothing unapplied"}
          formula={hasExcess ? "rolls forward to future work" : undefined}
          variant={hasExcess ? "info" : "neutral"}
        />
        <KpiTile
          label="Paid Out"
          value={formatINR(summary.settlementsTotal)}
          sub={`${summary.settlementCount} settlements`}
          formula={
            summary.advancesTotal > 0
              ? `+ ${formatINR(summary.advancesTotal)} advances (separate)`
              : undefined
          }
          variant="info"
        />
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
        <Typography
          sx={{ fontSize: 11, color: "text.secondary", minWidth: 110 }}
        >
          Salary progress
        </Typography>
        <Box
          sx={{
            flex: 1,
            height: 10,
            borderRadius: 1,
            bgcolor: "divider",
            overflow: "hidden",
          }}
        >
          <Box
            sx={{
              height: "100%",
              width: `${progressPct}%`,
              bgcolor: progressColor,
              transition: "width 200ms",
            }}
          />
        </Box>
        <Typography
          sx={{
            fontSize: 12.5,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            minWidth: 40,
            textAlign: "right",
          }}
        >
          {progressPct}%
        </Typography>
      </Box>

      {/* The bridge. Without it "Paid Out − Wages Due" looks like it should equal
          Excess Paid, and it never does: money that landed on no week is in Paid
          Out but not in Applied, while uncovered wages sit on the other side. */}
      {(hasExcess || hasOwed) && (
        <Typography
          sx={{
            fontSize: 11,
            color: "text.secondary",
            mt: 0.75,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {formatINR(summary.settlementsTotal)} paid out ={" "}
          {formatINR(summary.paidToWeeks)} applied to weeks
          {hasExcess && <> + {formatINR(summary.futureCredit)} not on any week</>}
          {hasOwed && (
            <> · {formatINR(summary.mestriOwed)} of wages still uncovered</>
          )}
        </Typography>
      )}
    </MobileCollapsibleHero>
  );
}
