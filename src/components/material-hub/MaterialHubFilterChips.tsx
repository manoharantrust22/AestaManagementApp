"use client";

/**
 * Single-select filter chip row for the Material Hub.
 * All · Needs action (warn) · Own · Group (pink) · Advance (warn) · Spot (warn).
 *
 * Mirrors the chip block in `ProtoHub` (proto-screens.jsx).
 */

import { Box } from "@mui/material";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import HomeIcon from "@mui/icons-material/Home";
import LinkIcon from "@mui/icons-material/Link";
import EventNoteIcon from "@mui/icons-material/EventNote";
import ReceiptIcon from "@mui/icons-material/Receipt";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import { hubTokens, hubToneColors, type HubTone } from "@/lib/material-hub/tokens";
import type { ThreadCounts } from "@/lib/material-hub/nextAction";

export type HubFilterKey =
  | "all"
  | "action"
  | "own"
  | "group"
  | "advance"
  | "spot"
  | "historical";

interface ChipSpec {
  key: HubFilterKey;
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
        "& svg": {
          fontSize: 13,
          color: "currentColor",
        },
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

export interface MaterialHubFilterChipsProps {
  active: HubFilterKey;
  onChange: (key: HubFilterKey) => void;
  counts: ThreadCounts;
}

export default function MaterialHubFilterChips({
  active,
  onChange,
  counts,
}: MaterialHubFilterChipsProps) {
  const chips: ChipSpec[] = [
    { key: "all", label: "All", count: counts.all },
    {
      key: "action",
      label: "Needs action",
      count: counts.needsAction,
      accent: "warn",
      icon: <NotificationsActiveIcon />,
    },
    { key: "own", label: "Own", count: counts.own, icon: <HomeIcon /> },
    {
      key: "group",
      label: "Group",
      count: counts.group,
      accent: "pink",
      icon: <LinkIcon />,
    },
    {
      key: "advance",
      label: "Advance",
      count: counts.advance,
      accent: "warn",
      icon: <EventNoteIcon />,
    },
    {
      key: "spot",
      label: "Spot",
      count: counts.spot,
      accent: "warn",
      icon: <ReceiptIcon />,
    },
    {
      key: "historical",
      label: "Historical",
      count: counts.historical,
      accent: "warn",
      icon: <CalendarMonthIcon />,
    },
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