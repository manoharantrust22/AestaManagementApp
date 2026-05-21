"use client";

import React from "react";
import {
  Alert,
  Avatar,
  Box,
  Card,
  CardActionArea,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import { Person } from "@mui/icons-material";
import dayjs from "dayjs";
import type { WalletEnabledEngineer } from "@/types/engineer-wallet-v2.types";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));

interface EngineerRailProps {
  engineers: WalletEnabledEngineer[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (engineerId: string) => void;
}

export default function EngineerRail({
  engineers,
  isLoading,
  selectedId,
  onSelect,
}: EngineerRailProps) {
  if (isLoading) {
    return (
      <Stack direction="row" spacing={1.5} sx={{ overflowX: "auto", pb: 1 }}>
        <Skeleton variant="rounded" width={196} height={104} />
        <Skeleton variant="rounded" width={196} height={104} />
        <Skeleton variant="rounded" width={196} height={104} />
      </Stack>
    );
  }

  if (engineers.length === 0) {
    return (
      <Alert severity="info">
        No wallet-enabled members yet. Set <code>wallet_enabled = true</code> on a
        company_members row to opt them in.
      </Alert>
    );
  }

  return (
    <Box
      sx={{
        display: "flex",
        gap: 1.5,
        overflowX: "auto",
        pb: 1,
        // Hide scrollbar but keep scrollable
        "&::-webkit-scrollbar": { height: 6 },
        "&::-webkit-scrollbar-thumb": {
          borderRadius: 3,
          bgcolor: "action.disabled",
        },
      }}
    >
      {engineers.map((eng) => {
        const isActive = selectedId === eng.user_id;
        return (
          <Card
            key={eng.user_id}
            elevation={0}
            sx={{
              flexShrink: 0,
              width: 196,
              border: "1px solid",
              borderColor: isActive ? "primary.main" : "divider",
              bgcolor: isActive ? "primary.50" : "background.paper",
              borderRadius: 2,
              transition: "border-color 0.15s, background-color 0.15s",
            }}
          >
            <CardActionArea
              onClick={() => onSelect(eng.user_id)}
              sx={{ p: 1.5, height: "100%" }}
            >
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <Avatar
                  src={eng.avatar_url ?? undefined}
                  sx={{ width: 32, height: 32, bgcolor: "primary.light" }}
                >
                  {eng.name?.[0] ?? <Person />}
                </Avatar>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2" fontWeight={600} noWrap>
                    {eng.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {eng.sites.length} site{eng.sites.length === 1 ? "" : "s"}
                  </Typography>
                </Box>
              </Stack>
              <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.15 }}>
                ₹{fmt(eng.total_balance)}
              </Typography>
              <Typography variant="caption" color="text.disabled">
                {eng.last_txn_at
                  ? `Last ${dayjs(eng.last_txn_at).format("D MMM")}`
                  : "No activity"}
              </Typography>
            </CardActionArea>
          </Card>
        );
      })}
    </Box>
  );
}
