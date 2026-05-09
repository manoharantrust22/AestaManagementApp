"use client";

import React from "react";
import { Box, Card, CardContent, Skeleton, Stack, Typography, Chip } from "@mui/material";
import { TrendingUp, TrendingDown, AccountBalanceWallet } from "@mui/icons-material";
import dayjs from "dayjs";
import type { WalletBalance } from "@/types/engineer-wallet-v2.types";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));

interface WalletBalanceCardProps {
  engineerName: string;
  /** When supplied, rendered as the card heading instead of "<engineer>'s Wallet".
   *  Used on the office detail panel where each card represents one site pool. */
  siteName?: string;
  balance: { balance: number; last_txn_at: string | null; total_deposited?: number; total_spent?: number; total_returned?: number } | undefined;
  isLoading: boolean;
  /** Optional CTAs rendered below the metrics — e.g. Add Funds / Return buttons. */
  actions?: React.ReactNode;
}

export default function WalletBalanceCard({
  engineerName,
  siteName,
  balance,
  isLoading,
  actions,
}: WalletBalanceCardProps) {
  const value = balance?.balance ?? 0;
  const isOwed = value < 0;
  const lastTxn = balance?.last_txn_at ? dayjs(balance.last_txn_at).format("D MMM YYYY") : null;

  return (
    <Card
      elevation={0}
      sx={{
        background: isOwed
          ? "linear-gradient(135deg, #d97706 0%, #b45309 100%)"
          : "linear-gradient(135deg, #1976d2 0%, #1565c0 100%)",
        color: "common.white",
        borderRadius: 3,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          position: "absolute",
          top: -40,
          right: -40,
          width: 160,
          height: 160,
          borderRadius: "50%",
          backgroundColor: "rgba(255,255,255,0.06)",
        }}
      />
      <CardContent sx={{ position: "relative", zIndex: 1, p: { xs: 2.5, sm: 3 } }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ opacity: 0.85, mb: 0.5 }}>
          <AccountBalanceWallet fontSize="small" />
          <Typography variant="caption" sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
            {siteName ?? `${engineerName}'s Wallet`}
          </Typography>
        </Stack>

        {siteName && (
          <Typography variant="caption" sx={{ opacity: 0.7, display: "block", mb: 0.5 }}>
            {engineerName}
          </Typography>
        )}
        <Typography variant="caption" sx={{ opacity: 0.85, fontWeight: isOwed ? 600 : 400 }}>
          {isOwed ? "Office owes engineer" : "Available balance"}
        </Typography>
        {isLoading ? (
          <Skeleton variant="text" width={180} height={56} sx={{ bgcolor: "rgba(255,255,255,0.2)" }} />
        ) : (
          <Typography
            variant="h3"
            fontWeight={700}
            sx={{ fontFamily: "var(--font-numeric, inherit)", lineHeight: 1.1 }}
          >
            ₹ {fmt(Math.abs(value))}
          </Typography>
        )}
        {isOwed && (
          <Typography variant="caption" sx={{ opacity: 0.85, display: "block" }}>
            Out-of-pocket spend exceeds the wallet pool — settle this with a deposit.
          </Typography>
        )}

        {lastTxn && (
          <Typography variant="caption" sx={{ opacity: 0.75 }}>
            Last activity: {lastTxn}
          </Typography>
        )}

        <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: "wrap", gap: 1 }}>
          <Chip
            size="small"
            icon={<TrendingUp sx={{ color: "inherit !important" }} fontSize="small" />}
            label={`Received ₹${fmt(balance?.total_deposited ?? 0)}`}
            sx={{
              bgcolor: "rgba(255,255,255,0.18)",
              color: "common.white",
              "& .MuiChip-icon": { color: "common.white" },
            }}
          />
          <Chip
            size="small"
            icon={<TrendingDown sx={{ color: "inherit !important" }} fontSize="small" />}
            label={`Spent ₹${fmt(balance?.total_spent ?? 0)}`}
            sx={{
              bgcolor: "rgba(255,255,255,0.18)",
              color: "common.white",
              "& .MuiChip-icon": { color: "common.white" },
            }}
          />
          {(balance?.total_returned ?? 0) > 0 && (
            <Chip
              size="small"
              label={`Returned ₹${fmt(balance?.total_returned ?? 0)}`}
              sx={{
                bgcolor: "rgba(255,255,255,0.18)",
                color: "common.white",
              }}
            />
          )}
        </Stack>

        {actions && <Box sx={{ mt: 2 }}>{actions}</Box>}
      </CardContent>
    </Card>
  );
}
