"use client";

/**
 * Single-select filter chip row for the Rental Hub.
 * Active · Needs action · Overdue · To settle · History · All
 *
 * Default selection: Active. Mirrors MaterialHubFilterChips chrome.
 */

import { Box } from "@mui/material";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ReceiptIcon from "@mui/icons-material/Receipt";
import HistoryIcon from "@mui/icons-material/History";
import BoltIcon from "@mui/icons-material/Bolt";
import { hubTokens, hubToneColors, type HubTone } from "@/lib/material-hub/tokens";
import type { RentalCounts } from "@/lib/rental-hub/nextAction";

export type RentalFilterKey =
  | "active"
  | "action"
  | "overdue"
  | "toSettle"
  | "history"
  | "all";

interface ChipSpec {
  key: RentalFilterKey;
  label: string;
  count: number;
  accent?: HubTone;
  icon?: React.ReactNode;
}

interface FilterChipProps {
  spec: ChipSpec;
  active: boolean;
  onClick: () => void;
}

function FilterChip({ spec, active, onClick }: FilterChipProps) {
  const colors = hubToneColors(spec.accent ?? "neutral");
  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "7px 12px",
        borderRadius: "8px",
        border: "none",
        background: active ? hubTokens.text : hubTokens.card,
        color: active ? "#fff" : spec.accent && !active ? colors.fg : hubTokens.muted,
        fontFamily: hubTokens.font,
        fontWeight: active ? 700 : 600,
        fontSize: 12.5,
        cursor: "pointer",
        transition: "background-color .12s, color .12s",
        "& svg": { fontSize: 13, color: "currentColor" },
      }}
    >
      {spec.icon}
      {spec.label}
      <Box
        component="span"
        sx={{
          background: active ? "rgba(255,255,255,.18)" : hubTokens.hairline,
          color: active ? "#fff" : hubTokens.subtle,
          padding: "1px 7px",
          borderRadius: "6px",
          fontSize: 11,
          fontWeight: 700,
          fontFamily: hubTokens.mono,
        }}
      >
        {spec.count}
      </Box>
    </Box>
  );
}

export interface RentalHubFilterChipsProps {
  active: RentalFilterKey;
  onChange: (key: RentalFilterKey) => void;
  counts: RentalCounts;
}

export default function RentalHubFilterChips({
  active,
  onChange,
  counts,
}: RentalHubFilterChipsProps) {
  const chips: ChipSpec[] = [
    {
      key: "active",
      label: "Active",
      count: counts.active,
      accent: "primary",
      icon: <BoltIcon />,
    },
    {
      key: "action",
      label: "Needs action",
      count: counts.needsAction,
      accent: "warn",
      icon: <NotificationsActiveIcon />,
    },
    {
      key: "overdue",
      label: "Overdue",
      count: counts.overdue,
      accent: "danger",
      icon: <WarningAmberIcon />,
    },
    {
      key: "toSettle",
      label: "To settle",
      count: counts.toSettle,
      accent: "warn",
      icon: <ReceiptIcon />,
    },
    {
      key: "history",
      label: "History",
      count: counts.history,
      icon: <HistoryIcon />,
    },
    { key: "all", label: "All", count: counts.all },
  ];

  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
      {chips.map((chip) => (
        <FilterChip
          key={chip.key}
          spec={chip}
          active={active === chip.key}
          onClick={() => onChange(chip.key)}
        />
      ))}
    </Box>
  );
}
