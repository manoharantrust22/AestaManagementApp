"use client";

import React from "react";
import {
  Box,
  Card,
  CardContent,
  Skeleton,
  Stack,
  Typography,
  Chip,
  LinearProgress,
} from "@mui/material";
import {
  Person as PersonIcon,
  Business as ClientIcon,
  Savings as TrustIcon,
  AccountBalance as OwnMoneyIcon,
  LocationOn as SiteIcon,
  Edit as CustomIcon,
  WarningAmber as OverdraftIcon,
} from "@mui/icons-material";
import { getPayerSourceLabel } from "@/components/settlement/PayerSourceSelector";
import type { WalletPool } from "@/hooks/queries/useEngineerWalletV2";
import type { PayerSource } from "@/types/settlement.types";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
    Math.round(Math.abs(n))
  );

const ICON_BY_SOURCE: Record<string, React.ReactNode> = {
  own_money: <OwnMoneyIcon fontSize="small" />,
  amma_money: <PersonIcon fontSize="small" />,
  client_money: <ClientIcon fontSize="small" />,
  trust_account: <TrustIcon fontSize="small" />,
  other_site_money: <SiteIcon fontSize="small" />,
  custom: <CustomIcon fontSize="small" />,
  pending: <OverdraftIcon fontSize="small" color="warning" />,
};

const COLOR_BY_SOURCE: Record<string, string> = {
  own_money: "#1976d2",
  amma_money: "#9c27b0",
  client_money: "#2e7d32",
  trust_account: "#0288d1",
  other_site_money: "#ed6c02",
  custom: "#616161",
  pending: "#ed6c02",
};

interface WalletSourcePoolsCardProps {
  pools: WalletPool[] | undefined;
  isLoading: boolean;
}

export default function WalletSourcePoolsCard({
  pools,
  isLoading,
}: WalletSourcePoolsCardProps) {
  if (isLoading) {
    return (
      <Card variant="outlined">
        <CardContent>
          <Skeleton variant="text" width="40%" height={24} />
          <Skeleton variant="rectangular" height={120} sx={{ mt: 1 }} />
        </CardContent>
      </Card>
    );
  }

  if (!pools || pools.length === 0) {
    return null;
  }

  // Separate source pools from the pending (engineer-fronted) total for layout.
  // Source pools sorted by available descending (most-funded first).
  const sourcePools = pools
    .filter((p) => p.kind === "source")
    .sort((a, b) => b.available - a.available);
  const pending = pools.find((p) => p.kind === "pending");

  const totalAvailable = sourcePools.reduce((acc, p) => acc + p.available, 0);

  return (
    <Card variant="outlined">
      <CardContent sx={{ "&:last-child": { pb: 2 } }}>
        <Stack direction="row" alignItems="baseline" justifyContent="space-between" sx={{ mb: 1.5 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}
          >
            By payment source
          </Typography>
          {pending && pending.spent > 0 && (
            <Chip
              size="small"
              icon={<OverdraftIcon fontSize="small" />}
              label={`Pending ₹${fmt(pending.spent)}`}
              color="warning"
              variant="outlined"
            />
          )}
        </Stack>

        {sourcePools.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
            No deposit attribution yet.
          </Typography>
        ) : (
          <Stack spacing={1.5}>
            {sourcePools.map((p) => {
              const pct = p.deposited > 0 ? (p.spent / p.deposited) * 100 : 0;
              const label = getPayerSourceLabel(p.payer_source as PayerSource);
              const color = COLOR_BY_SOURCE[p.payer_source] ?? "#757575";
              const icon = ICON_BY_SOURCE[p.payer_source] ?? <OwnMoneyIcon fontSize="small" />;
              return (
                <Box key={p.payer_source}>
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.25 }}>
                    <Box sx={{ color, display: "flex", alignItems: "center" }}>{icon}</Box>
                    <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>
                      {label}
                    </Typography>
                    <Typography variant="body2" fontWeight={700} color={p.available > 0 ? "text.primary" : "text.disabled"}>
                      ₹{fmt(p.available)}
                    </Typography>
                  </Stack>
                  <LinearProgress
                    variant="determinate"
                    value={Math.min(100, pct)}
                    sx={{
                      height: 6,
                      borderRadius: 3,
                      bgcolor: "action.hover",
                      "& .MuiLinearProgress-bar": { bgcolor: color },
                    }}
                  />
                  <Typography variant="caption" color="text.disabled" sx={{ display: "block", mt: 0.25 }}>
                    Spent ₹{fmt(p.spent)} of ₹{fmt(p.deposited)} ({pct.toFixed(0)}%)
                  </Typography>
                </Box>
              );
            })}

            {totalAvailable > 0 && (
              <Box
                sx={{
                  pt: 1,
                  borderTop: 1,
                  borderColor: "divider",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                  Attributed available
                </Typography>
                <Typography variant="subtitle2" fontWeight={700}>
                  ₹{fmt(totalAvailable)}
                </Typography>
              </Box>
            )}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
