"use client";

import React from "react";
import { Box, Skeleton, Typography, useTheme } from "@mui/material";
import type { PaymentScopeSummary } from "@/types/payment.types";

interface Kpi {
  label: string; value: string; sub: string; accent?: "warn" | "pos";
}

function Cell({ kpi, isLast }: { kpi: Kpi; isLast: boolean }) {
  const theme = useTheme();
  const color =
    kpi.accent === "warn" ? theme.palette.warning.main :
    kpi.accent === "pos"  ? theme.palette.success.main :
    theme.palette.text.primary;
  const labelColor =
    kpi.accent === "warn" ? theme.palette.warning.main :
    kpi.accent === "pos"  ? theme.palette.success.main :
    theme.palette.text.secondary;

  return (
    <Box sx={{
      px: 2,
      borderRight: isLast ? 0 : `1px solid ${theme.palette.divider}`,
      flex: 1, minWidth: 120,
    }}>
      <Typography variant="caption" sx={{
        fontSize: 9, textTransform: "uppercase", letterSpacing: 0.5, color: labelColor, fontWeight: 600,
      }}>
        {kpi.label}
      </Typography>
      <Typography variant="h6" fontWeight={700} sx={{ color, lineHeight: 1.2 }}>
        {kpi.value}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9, display: "block" }}>
        {kpi.sub}
      </Typography>
    </Box>
  );
}

export default function PaymentsKpiStrip({
  summary, isLoading,
}: { summary: PaymentScopeSummary | undefined; isLoading: boolean }) {
  const theme = useTheme();

  if (isLoading || !summary) {
    return (
      <Box sx={{ display: "flex", py: 1.25, px: 1.5, borderBottom: `1px solid ${theme.palette.divider}` }}>
        {[0, 1, 2, 3].map((i) => (
          <Box key={i} sx={{ flex: 1, px: 2 }}>
            <Skeleton variant="text" width="50%" />
            <Skeleton variant="text" width="80%" height={28} />
            <Skeleton variant="text" width="40%" />
          </Box>
        ))}
      </Box>
    );
  }

  const kpis: Kpi[] = [
    {
      label: "Pending", accent: "warn",
      value: `₹${summary.pendingAmount.toLocaleString("en-IN")}`,
      sub:   `${summary.pendingDatesCount} date${summary.pendingDatesCount === 1 ? "" : "s"}`,
    },
    {
      label: "Total Paid", accent: "pos",
      value: `₹${summary.paidAmount.toLocaleString("en-IN")}`,
      sub:   `${summary.paidCount} settled`,
    },
    {
      label: "Daily + Market",
      value: `₹${summary.dailyMarketAmount.toLocaleString("en-IN")}`,
      sub:   `${summary.dailyMarketCount} dates`,
    },
    {
      label: "Weekly Contract",
      value: `₹${summary.weeklyAmount.toLocaleString("en-IN")}`,
      sub:   `${summary.weeklyCount} records`,
    },
  ];

  return (
    <Box sx={{
      display: "flex", py: 1.25, px: 1.5,
      borderBottom: `1px solid ${theme.palette.divider}`,
      bgcolor: "background.paper",
    }}>
      {kpis.map((k, i) => (
        <Cell key={k.label} kpi={k} isLast={i === kpis.length - 1} />
      ))}
    </Box>
  );
}
