"use client";

/**
 * KPI strip for the Rental Hub. Four cards across desktop, 2x2 on mobile.
 * Each card: 3px tinted left band + soft tinted icon box + label + big mono
 * value + 11px muted sub.
 *
 * Mirrors MaterialHubKpiStrip exactly; only the spec array changes per
 * docs/RentalHub_V2_redesign/README.md lines 116-126.
 */

import { Box, Typography } from "@mui/material";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import BoltIcon from "@mui/icons-material/Bolt";
import { hubTokens, hubToneColors, type HubTone } from "@/lib/material-hub/tokens";
import type { RentalCounts } from "@/lib/rental-hub/nextAction";
import { inrK } from "@/lib/rental-hub/formatters";

interface KpiCardSpec {
  label: string;
  value: string;
  sub: string;
  tone: HubTone;
  icon: React.ReactNode;
  onClick?: () => void;
}

function KpiCard({ label, value, sub, tone, icon, onClick }: KpiCardSpec) {
  const colors = hubToneColors(tone);
  const accent = colors.dot;
  const soft = colors.bg;
  return (
    <Box
      onClick={onClick}
      sx={{
        position: "relative",
        overflow: "hidden",
        background: hubTokens.card,
        border: `1px solid ${hubTokens.border}`,
        borderRadius: "12px",
        padding: "14px",
        display: "flex",
        flexDirection: "column",
        gap: "5px",
        cursor: onClick ? "pointer" : "default",
        transition: "transform .12s, box-shadow .12s",
        "&:hover": onClick
          ? { boxShadow: "0 4px 14px rgba(15,23,42,.08)" }
          : undefined,
      }}
    >
      <Box
        sx={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: accent,
        }}
      />
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "7px",
          color: hubTokens.muted,
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        <Box
          sx={{
            width: 22,
            height: 22,
            borderRadius: "6px",
            background: soft,
            color: accent,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            "& svg": { fontSize: 14 },
          }}
        >
          {icon}
        </Box>
        {label}
      </Box>
      <Typography
        sx={{
          fontSize: 22,
          fontWeight: 800,
          color: hubTokens.text,
          letterSpacing: "-0.6px",
          fontFamily: hubTokens.mono,
          lineHeight: 1.1,
        }}
      >
        {value}
      </Typography>
      <Typography sx={{ fontSize: 11, color: hubTokens.muted, lineHeight: 1.4 }}>
        {sub}
      </Typography>
    </Box>
  );
}

export interface RentalHubKpiStripProps {
  counts: RentalCounts;
}

export default function RentalHubKpiStrip({ counts }: RentalHubKpiStripProps) {
  // "Active" flips to danger tone when any active order is overdue (spec line 124)
  const activeTone: HubTone = counts.overdue > 0 ? "danger" : "primary";

  const kpis: KpiCardSpec[] = [
    {
      label: "Needs your action",
      value: counts.needsAction.toString(),
      sub: `${counts.overdue} overdue · ${counts.toSettle} to settle`,
      tone: "warn",
      icon: <NotificationsActiveIcon />,
    },
    {
      label: "Active orders",
      value: counts.active.toString(),
      sub: counts.overdue > 0 ? `${counts.overdue} overdue` : "on site or pending",
      tone: activeTone,
      icon: <TrendingUpIcon />,
    },
    {
      label: "Balance due",
      value: inrK(counts.balanceDue),
      sub: `${counts.toSettle} vendor bill${counts.toSettle === 1 ? "" : "s"} pending`,
      tone: "pink",
      icon: <AccountBalanceWalletIcon />,
    },
    {
      label: "Accrued · live",
      value: inrK(counts.accruedLive),
      sub: "ticking right now on active orders",
      tone: "primary",
      icon: <BoltIcon />,
    },
  ];

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "1fr 1fr",
          md: "repeat(4, 1fr)",
        },
        gap: "10px",
      }}
    >
      {kpis.map((k, i) => (
        <KpiCard key={i} {...k} />
      ))}
    </Box>
  );
}
