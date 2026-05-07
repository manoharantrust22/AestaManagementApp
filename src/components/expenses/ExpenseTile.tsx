"use client";

import { Box, Tooltip, Typography } from "@mui/material";
import { type ReactNode } from "react";
import { formatINR } from "@/lib/utils/expenseGrouping";

export interface ExpenseTileProps {
  label: string;
  amount: number;
  count: number;
  /** Sub-line below count (e.g. "2 advance"). */
  meta?: string;
  /** Active filter state — adds a tinted background and primary border. */
  active?: boolean;
  /** Mutes the tile when amount is zero. */
  muted?: boolean;
  onClick?: () => void;
  /** Tone hint for amount + accent. */
  tone?: "default" | "warning" | "subtle";
  /** Small icon shown next to the label. */
  icon?: ReactNode;
  /** Optional tooltip on the whole tile. */
  tooltip?: string;
  /** Indented sub-tile rendering — flatter, smaller. */
  variant?: "tile" | "subrow";
}

export default function ExpenseTile({
  label,
  amount,
  count,
  meta,
  active = false,
  muted = false,
  onClick,
  tone = "default",
  icon,
  tooltip,
  variant = "tile",
}: ExpenseTileProps) {
  const isSubrow = variant === "subrow";

  const accentColor =
    tone === "warning"
      ? "warning.main"
      : tone === "subtle"
        ? "text.disabled"
        : "primary.main";

  const inner = (
    <Box
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      sx={{
        display: "flex",
        flexDirection: isSubrow ? "row" : "column",
        alignItems: isSubrow ? "center" : "flex-start",
        justifyContent: isSubrow ? "space-between" : "flex-start",
        gap: isSubrow ? 1.5 : 0.25,
        px: isSubrow ? 1.25 : 1.5,
        py: isSubrow ? 0.75 : 1.25,
        bgcolor: active ? "primary.lighter" : isSubrow ? "transparent" : "action.hover",
        border: 1,
        borderColor: active ? "primary.main" : "transparent",
        borderRadius: 1.25,
        cursor: onClick ? "pointer" : "default",
        opacity: muted ? 0.55 : 1,
        transition: "background-color 120ms, border-color 120ms",
        "&:hover": onClick
          ? {
              bgcolor: active ? "primary.lighter" : isSubrow ? "action.hover" : "action.selected",
            }
          : undefined,
        "&:focus-visible": {
          outline: "2px solid",
          outlineColor: "primary.main",
          outlineOffset: 1,
        },
        minWidth: isSubrow ? "auto" : 130,
        flex: isSubrow ? "1 1 auto" : "0 0 auto",
        fontFeatureSettings: "'tnum'",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0 }}>
        {icon ? (
          <Box sx={{ display: "flex", alignItems: "center", color: accentColor, fontSize: 14, mr: 0.25 }}>
            {icon}
          </Box>
        ) : null}
        <Typography
          variant="caption"
          color="text.secondary"
          noWrap
          sx={{
            fontSize: isSubrow ? 11.5 : 11,
            letterSpacing: isSubrow ? 0 : 0.3,
            textTransform: isSubrow ? "none" : "uppercase",
            fontWeight: isSubrow ? 500 : 600,
          }}
        >
          {label}
        </Typography>
      </Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "baseline",
          gap: 0.75,
          flexDirection: isSubrow ? "row" : "row",
          ml: isSubrow ? "auto" : 0,
        }}
      >
        <Typography
          variant={isSubrow ? "body2" : "subtitle1"}
          fontWeight={isSubrow ? 600 : 700}
          sx={{ fontFeatureSettings: "'tnum'", lineHeight: 1.2 }}
        >
          {formatINR(amount)}
        </Typography>
        <Typography
          variant="caption"
          color="text.disabled"
          sx={{ fontSize: 10.5, letterSpacing: 0.2, fontFeatureSettings: "'tnum'" }}
        >
          {count}
          {meta ? ` · ${meta}` : ""}
        </Typography>
      </Box>
    </Box>
  );

  return tooltip ? <Tooltip title={tooltip}>{inner}</Tooltip> : inner;
}
