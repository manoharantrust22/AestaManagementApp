"use client";

import React from "react";
import { Box, Card, Skeleton, Stack, Typography } from "@mui/material";
import {
  AccountBalanceWallet,
  TrendingUp,
  TrendingDown,
  KeyboardReturn,
} from "@mui/icons-material";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));

export interface SummaryMetrics {
  held: number;
  deposited: number;
  spent: number;
  returned: number;
}

interface SummaryMetricsRowProps {
  metrics: SummaryMetrics | undefined;
  isLoading?: boolean;
  /** Optional caption shown under each metric. */
  caption?: { held?: string; deposited?: string; spent?: string; returned?: string };
}

const ITEMS: Array<{
  key: keyof SummaryMetrics;
  label: string;
  icon: React.ReactNode;
  color: string;
  defaultCaption: string;
}> = [
  {
    key: "held",
    label: "Currently held",
    icon: <AccountBalanceWallet fontSize="small" />,
    color: "#1976d2",
    defaultCaption: "Balance in engineer wallets",
  },
  {
    key: "deposited",
    label: "Deposited",
    icon: <TrendingUp fontSize="small" />,
    color: "#2e7d32",
    defaultCaption: "Funds added in period",
  },
  {
    key: "spent",
    label: "Spent",
    icon: <TrendingDown fontSize="small" />,
    color: "#ed6c02",
    defaultCaption: "Paid out from wallets",
  },
  {
    key: "returned",
    label: "Returned",
    icon: <KeyboardReturn fontSize="small" />,
    color: "#0288d1",
    defaultCaption: "Sent back to company",
  },
];

export default function SummaryMetricsRow({
  metrics,
  isLoading,
  caption,
}: SummaryMetricsRowProps) {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(4, 1fr)" },
        gap: { xs: 1, sm: 1.5 },
      }}
    >
      {ITEMS.map(({ key, label, icon, color, defaultCaption }) => {
        const value = metrics?.[key] ?? 0;
        const captionText = caption?.[key] ?? defaultCaption;
        return (
          <Card
            key={key}
            elevation={0}
            sx={{
              border: 1,
              borderColor: "divider",
              borderRadius: 2,
              p: { xs: 1.5, sm: 2 },
              minHeight: 96,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <Stack direction="row" spacing={1} alignItems="center" sx={{ color }}>
              {icon}
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  fontWeight: 600,
                }}
              >
                {label}
              </Typography>
            </Stack>
            {isLoading ? (
              <Skeleton variant="text" width={120} height={32} />
            ) : (
              <Typography
                variant="h5"
                fontWeight={700}
                sx={{ lineHeight: 1.15, mt: 0.5 }}
              >
                ₹{fmt(value)}
              </Typography>
            )}
            <Typography variant="caption" color="text.disabled" sx={{ mt: 0.25 }}>
              {captionText}
            </Typography>
          </Card>
        );
      })}
    </Box>
  );
}
