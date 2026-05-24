"use client";

/**
 * Right-side action button on a rental thread row. Renders the next-action
 * verb in the row's accent color, or "All clear ✓" when the thread has nothing
 * pending (settled or cancelled).
 *
 * Color is driven by nextAction().tone, not the row's accent — so an overdue
 * "Record return" stays danger-red even on a primary-banded row.
 */

import { Box } from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CheckIcon from "@mui/icons-material/Check";
import { hubTokens } from "@/lib/material-hub/tokens";
import { nextAction } from "@/lib/rental-hub/nextAction";
import type { RentalThread } from "@/lib/rental-hub/threadTypes";

export interface RentalThreadActionButtonProps {
  thread: RentalThread;
  fullWidth?: boolean;
  onAction: (thread: RentalThread) => void;
}

const TONE_BG: Record<"primary" | "warn" | "danger", string> = {
  primary: hubTokens.primary,
  warn: hubTokens.warn,
  danger: hubTokens.danger,
};

export default function RentalThreadActionButton({
  thread,
  fullWidth,
  onAction,
}: RentalThreadActionButtonProps) {
  const next = nextAction(thread);

  if (!next) {
    return (
      <Box
        component="span"
        sx={{
          fontSize: 11.5,
          color: hubTokens.success,
          fontWeight: 600,
          display: "inline-flex",
          alignItems: "center",
          gap: "5px",
          padding: "8px 12px",
          background: hubTokens.successSoft,
          borderRadius: "8px",
          width: fullWidth ? "100%" : undefined,
          justifyContent: fullWidth ? "center" : "flex-start",
        }}
      >
        <CheckIcon sx={{ fontSize: 13 }} />
        All clear
      </Box>
    );
  }

  const bg = TONE_BG[next.tone];

  return (
    <Box
      component="button"
      onClick={(e) => {
        e.stopPropagation();
        onAction(thread);
      }}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "6px",
        padding: fullWidth ? "10px" : "8px 12px",
        borderRadius: fullWidth ? "9px" : "8px",
        border: "none",
        cursor: "pointer",
        background: bg,
        color: "#fff",
        fontSize: fullWidth ? 12.5 : 12,
        fontWeight: 700,
        fontFamily: hubTokens.font,
        boxShadow: "0 1px 2px rgba(15,23,42,.08)",
        width: fullWidth ? "100%" : undefined,
        transition: "filter .12s",
        "&:hover": { filter: "brightness(0.92)" },
        whiteSpace: "nowrap",
      }}
    >
      {next.label}
      <ArrowForwardIcon sx={{ fontSize: 13 }} />
    </Box>
  );
}
