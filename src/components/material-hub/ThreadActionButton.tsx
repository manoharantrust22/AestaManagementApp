"use client";

/**
 * Right-side action button on a thread row. Renders the next-action verb
 * (e.g., "Approve →") in the row's accent color, or "All clear ✓" when the
 * thread has nothing pending.
 *
 * Mirrors the action-button block inside `ProtoThreadRow`.
 */

import { Box, Tooltip } from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CheckIcon from "@mui/icons-material/Check";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
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

  // Mirror threads (cluster-mate's group POs surfaced read-only on this site).
  // We render a distinct "Read-only" pill instead of "All clear" so the
  // engineer doesn't mistake the absence of an action for a completed thread.
  if (thread.is_mirror) {
    const sharedFrom = thread.mirrored_from_site_name
      ? `Managed on ${thread.mirrored_from_site_name}`
      : "Managed on the originating site";
    return (
      <Tooltip title={sharedFrom} arrow>
        <Box
          component="span"
          sx={{
            fontSize: 11.5,
            color: hubTokens.muted,
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            padding: "8px 12px",
            background: hubTokens.chip,
            borderRadius: "8px",
            width: fullWidth ? "100%" : undefined,
            justifyContent: fullWidth ? "center" : "flex-start",
          }}
        >
          <VisibilityOutlinedIcon sx={{ fontSize: 13 }} />
          Read-only
        </Box>
      </Tooltip>
    );
  }

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