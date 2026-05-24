"use client";

/**
 * Right-side action button on a thread row. Renders the next-action verb
 * (e.g., "Approve →") in the row's accent color, or "All clear ✓" when the
 * thread has nothing pending.
 *
 * Mirrors the action-button block inside `ProtoThreadRow`.
 */

import { Box } from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CheckIcon from "@mui/icons-material/Check";
import { hubTokens } from "@/lib/material-hub/tokens";
import { nextAction } from "@/lib/material-hub/nextAction";
import type { MaterialThread } from "@/lib/material-hub/threadTypes";

export interface ThreadActionButtonProps {
  thread: MaterialThread;
  /** Accent color for the row (primary for own, pink for group) */
  accent: string;
  fullWidth?: boolean;
  onAction: (thread: MaterialThread) => void;
}

export default function ThreadActionButton({
  thread,
  accent,
  fullWidth,
  onAction,
}: ThreadActionButtonProps) {
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
        background: accent,
        color: "#fff",
        fontSize: fullWidth ? 12.5 : 12,
        fontWeight: 700,
        fontFamily: hubTokens.font,
        boxShadow: "0 1px 2px rgba(15,23,42,.08)",
        width: fullWidth ? "100%" : undefined,
        transition: "filter .12s",
        "&:hover": { filter: "brightness(0.92)" },
      }}
    >
      {next.label.replace(" →", "")}
      <ArrowForwardIcon sx={{ fontSize: 13 }} />
    </Box>
  );
}