"use client";

import React from "react";
import { Box, Typography, useTheme } from "@mui/material";
import { KpiTile, formatINR } from "@/components/payments/KpiTile";
import { MobileCollapsibleHero } from "@/components/payments/MobileCollapsibleHero";
import type { SiteFinancialSummary } from "@/hooks/queries/useSiteFinancialSummary";

export interface SiteMoneyOverviewHeroProps {
  siteId: string;
  summary: SiteFinancialSummary;
}

export function SiteMoneyOverviewHero({ siteId, summary }: SiteMoneyOverviewHeroProps) {
  const theme = useTheme();

  const progressColor =
    summary.progressPct < 50
      ? theme.palette.error.main
      : summary.progressPct < 80
        ? theme.palette.warning.main
        : theme.palette.success.main;

  const netVariant: "success" | "error" = summary.netInHand >= 0 ? "success" : "error";

  return (
    <MobileCollapsibleHero
      storageKey={`client-payments.hero.${siteId}.expanded`}
      statusLabel="Remaining from Client"
      statusValue={formatINR(summary.remainingFromClient)}
      statusVariant="warning"
      progressPct={summary.progressPct}
      progressColor={progressColor}
    >
      <Box
        sx={{
          display: "grid",
          gap: 1.25,
          gridTemplateColumns: {
            xs: "repeat(2, minmax(0, 1fr))",
            sm: "repeat(3, minmax(0, 1fr))",
            md: "repeat(6, minmax(0, 1fr))",
          },
          mb: 1.5,
        }}
      >
        <KpiTile label="Base Contract"          variant="neutral" value={formatINR(summary.baseContract)} />
        <KpiTile label="Additional Works"       variant="info"    value={formatINR(summary.additionalWorksConfirmed)} sub="confirmed only" />
        <KpiTile label="Total Contract"         variant="neutral" value={formatINR(summary.totalContract)} formula="base + extras" />
        <KpiTile label="Client Paid"            variant="success" value={formatINR(summary.clientPaid)} />
        <KpiTile label="Remaining From Client"  variant="warning" value={formatINR(summary.remainingFromClient)} />
        <KpiTile label="Net In Hand"            variant={netVariant} value={formatINR(summary.netInHand)} sub="paid − supervisor cost" />
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
        <Typography sx={{ fontSize: 11, color: "text.secondary", minWidth: 130 }}>
          Client collection progress
        </Typography>
        <Box sx={{ flex: 1, height: 10, borderRadius: 1, bgcolor: "divider", overflow: "hidden" }}>
          <Box
            sx={{
              height: "100%",
              width: `${summary.progressPct}%`,
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
          {summary.progressPct}%
        </Typography>
      </Box>
    </MobileCollapsibleHero>
  );
}

export default SiteMoneyOverviewHero;
