"use client";

/**
 * KPI strip for the Material Hub. Four cards across desktop, 2x2 on mobile.
 * Each card: 3px tinted left band + soft tinted icon box + label + big mono
 * value + 11px muted sub.
 *
 * Mirrors `ProtoKpiStrip` in docs/MaterialHub_Redesign/proto-screens.jsx.
 */

import { Box, Typography } from "@mui/material";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import ReceiptIcon from "@mui/icons-material/Receipt";
import LinkIcon from "@mui/icons-material/Link";
import { hubTokens, hubToneColors, type HubTone } from "@/lib/material-hub/tokens";
import type { ThreadCounts, InterSiteDebt } from "@/lib/material-hub/nextAction";
import { inrK } from "@/lib/material-hub/formatters";

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
          ? {
              boxShadow: "0 4px 14px rgba(15,23,42,.08)",
            }
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
      <Typography
        sx={{
          fontSize: 11,
          color: hubTokens.muted,
          lineHeight: 1.4,
        }}
      >
        {sub}
      </Typography>
    </Box>
  );
}

export interface MaterialHubKpiStripProps {
  counts: ThreadCounts;
  settlementDueAmount: number;
  debt: InterSiteDebt;
  /** Display name of the *other* primary cluster site, for the inter-site sub-label */
  otherSiteShort?: string;
  onClickInterSite?: () => void;
}

export default function MaterialHubKpiStrip({
  counts,
  settlementDueAmount,
  debt,
  otherSiteShort = "cluster",
  onClickInterSite,
}: MaterialHubKpiStripProps) {
  const kpis: KpiCardSpec[] = [
    {
      label: "Needs your action",
      value: counts.needsAction.toString(),
      sub: `${counts.pendingApproval} approvals · ${counts.awaitingPO} POs · ${counts.awaitingDelivery} deliveries`,
      tone: "warn",
      icon: <NotificationsActiveIcon />,
    },
    {
      label: "In flight",
      value: (counts.awaitingPO + counts.awaitingDelivery).toString(),
      sub: "orders, deliveries pending",
      tone: "primary",
      icon: <TrendingUpIcon />,
    },
    {
      label: "Settlement due",
      value: inrK(settlementDueAmount),
      sub: `${counts.pendingSettlement} vendor bill${counts.pendingSettlement !== 1 ? "s" : ""}`,
      tone: "danger",
      icon: <ReceiptIcon />,
    },
    {
      label: "Inter-site net",
      value: (debt.net < 0 ? "−" : "+") + inrK(Math.abs(debt.net)),
      sub: debt.net < 0 ? `You owe ${otherSiteShort}` : `${otherSiteShort} owes you`,
      tone: "pink",
      icon: <LinkIcon />,
      onClick: onClickInterSite,
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