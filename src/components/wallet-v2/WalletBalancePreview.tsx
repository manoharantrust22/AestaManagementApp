"use client";

import React from "react";
import {
  Alert,
  Box,
  Card,
  CardContent,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import { AccountBalanceWallet, WarningAmber } from "@mui/icons-material";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
    Math.round(Math.abs(n))
  );

export interface WalletBalancePreviewProps {
  engineerName: string;
  siteName: string;
  currentBalance: number;
  amount: number;
  isLoading?: boolean;
}

export default function WalletBalancePreview({
  engineerName,
  siteName,
  currentBalance,
  amount,
  isLoading = false,
}: WalletBalancePreviewProps) {
  const afterBalance = currentBalance - amount;
  const willOverdraft = afterBalance < 0;

  if (isLoading) {
    return (
      <Card variant="outlined" sx={{ mb: 2 }}>
        <CardContent>
          <Skeleton variant="text" width="60%" height={28} />
          <Skeleton variant="text" width="40%" height={48} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Box sx={{ mb: 2 }}>
      <Card variant="outlined" sx={{ bgcolor: "action.hover" }}>
        <CardContent sx={{ "&:last-child": { pb: 2 } }}>
          <Stack
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{ mb: 0.5 }}
          >
            <AccountBalanceWallet fontSize="small" color="primary" />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}
            >
              Your wallet · {siteName}
            </Typography>
          </Stack>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mb: 1, opacity: 0.7 }}
          >
            {engineerName}
          </Typography>

          <Stack spacing={0.5}>
            <Row label="Current balance" value={`₹${fmt(currentBalance)}`} />
            <Row label="This expense" value={amount > 0 ? `−₹${fmt(amount)}` : `₹${fmt(amount)}`} />
            <Box sx={{ borderTop: 1, borderColor: "divider", my: 0.5 }} />
            <Row
              label="After this expense"
              value={`${willOverdraft ? "−" : ""}₹${fmt(afterBalance)}`}
              bold
              negative={willOverdraft}
            />
          </Stack>
        </CardContent>
      </Card>

      {willOverdraft && (
        <Alert
          severity="warning"
          icon={<WarningAmber fontSize="inherit" />}
          role="status"
          aria-label="Pending amount after this expense"
          sx={{ mt: 1, "& .MuiAlert-message": { fontSize: "0.85rem" } }}
        >
          This is more than your wallet holds — ₹{fmt(afterBalance)} will be pending
          (you&apos;ve fronted it). The next deposit will cover it first.
        </Alert>
      )}
    </Box>
  );
}

function Row({
  label,
  value,
  bold,
  negative,
}: {
  label: string;
  value: string;
  bold?: boolean;
  negative?: boolean;
}) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="baseline">
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ fontWeight: bold ? 600 : 400 }}
      >
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          fontWeight: bold ? 700 : 500,
          fontSize: bold ? "1.05rem" : undefined,
          color: negative ? "error.main" : "text.primary",
        }}
      >
        {value}
      </Typography>
    </Stack>
  );
}
