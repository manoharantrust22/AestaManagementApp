"use client";

/**
 * KPI strip for the Inventory page. 4 cards:
 *   - Own stock (₹value, primary)
 *   - Group stock (₹value, pink)
 *   - Low stock (count, warn)
 *   - Total batches (count, text-900 / neutral)
 */

import { Box, Typography } from "@mui/material";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import LinkIcon from "@mui/icons-material/Link";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import AppsIcon from "@mui/icons-material/Apps";
import { hubTokens, hubToneColors, type HubTone } from "@/lib/material-hub/tokens";
import { inrK } from "@/lib/material-hub/formatters";

interface KpiSpec {
  label: string;
  value: string;
  sub: string;
  tone: HubTone;
  icon: React.ReactNode;
}

function KpiCard({ label, value, sub, tone, icon }: KpiSpec) {
  const colors = hubToneColors(tone);
  const accent = colors.dot;
  const soft = colors.bg;
  return (
    <Box
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

export interface InventoryKpiStripProps {
  ownStockValue: number;
  groupStockValue: number;
  lowStockCount: number;
  totalBatches: number;
}

export default function InventoryKpiStrip({
  ownStockValue,
  groupStockValue,
  lowStockCount,
  totalBatches,
}: InventoryKpiStripProps) {
  const kpis: KpiSpec[] = [
    {
      label: "Own stock",
      value: inrK(ownStockValue),
      sub: "value at avg unit cost",
      tone: "primary",
      icon: <Inventory2Icon />,
    },
    {
      label: "Group stock",
      value: inrK(groupStockValue),
      sub: "shared with cluster",
      tone: "pink",
      icon: <LinkIcon />,
    },
    {
      label: "Low stock",
      value: lowStockCount.toString(),
      sub: "below reorder threshold",
      tone: "warn",
      icon: <WarningAmberIcon />,
    },
    {
      label: "Total batches",
      value: totalBatches.toString(),
      sub: "active inventory rows",
      tone: "neutral",
      icon: <AppsIcon />,
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
