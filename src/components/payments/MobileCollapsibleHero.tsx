"use client";

import React, { useEffect, useState } from "react";
import {
  Box,
  Collapse,
  IconButton,
  Typography,
  alpha,
  useTheme,
  type Theme,
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from "@mui/icons-material";
import type { KpiTileVariant } from "./KpiTile";

export interface MobileCollapsibleHeroProps {
  storageKey: string;
  statusLabel: string;
  statusValue: string;
  statusVariant: KpiTileVariant;
  /**
   * Optional second headline for tabs where two figures are true at once (crew
   * pay can owe wages AND hold unapplied excess). Rendered as a muted chip so
   * the collapsed bar never hides half the story.
   */
  secondaryLabel?: string;
  secondaryValue?: string;
  progressPct: number;
  progressColor: string;
  children: React.ReactNode;
}

const variantToTone = (variant: KpiTileVariant, theme: Theme) => {
  switch (variant) {
    case "success":
      return { fg: theme.palette.success.dark, bg: alpha(theme.palette.success.main, 0.1) };
    case "warning":
      return { fg: theme.palette.warning.dark, bg: alpha(theme.palette.warning.main, 0.12) };
    case "info":
      return { fg: theme.palette.info.dark, bg: alpha(theme.palette.info.main, 0.1) };
    case "error":
      return { fg: theme.palette.error.dark, bg: alpha(theme.palette.error.main, 0.12) };
    default:
      return { fg: theme.palette.text.primary, bg: theme.palette.action.hover };
  }
};

/**
 * Wraps a per-tab "summary card" section so that it collapses to a single-row
 * bar showing the headline status + progress %, reclaiming ~210px of vertical
 * space for the table below. Applies on every breakpoint — the table is the
 * primary surface on this page; KPIs are one tap away. Expanded state is
 * persisted to localStorage per storageKey so users who prefer the KPI tiles
 * keep them open across navigations.
 */
export function MobileCollapsibleHero({
  storageKey,
  statusLabel,
  statusValue,
  statusVariant,
  secondaryLabel,
  secondaryValue,
  progressPct,
  progressColor,
  children,
}: MobileCollapsibleHeroProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState<boolean>(false);

  // Hydrate persisted choice on mount only. SSR-safe: state starts collapsed,
  // then snaps to the persisted value on the client. Prevents hydration drift.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(storageKey);
    if (stored === "1") setExpanded(true);
  }, [storageKey]);

  const toggle = () => {
    setExpanded((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        // localStorage may be unavailable (private mode) — silently ignore
      }
      return next;
    });
  };

  const tone = variantToTone(statusVariant, theme);

  return (
    <Box
      sx={{
        mb: 1.5,
        bgcolor: "background.paper",
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 1.5,
        overflow: "hidden",
      }}
    >
      <Box
        component="button"
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse summary" : "Expand summary"}
        sx={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 1.5,
          py: 0.875,
          bgcolor: tone.bg,
          border: 0,
          cursor: "pointer",
          textAlign: "left",
          font: "inherit",
        }}
      >
        <Typography
          sx={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.4,
            color: tone.fg,
            flexShrink: 0,
          }}
        >
          {statusLabel}
        </Typography>
        <Typography
          sx={{
            fontSize: 13.5,
            fontWeight: 700,
            color: tone.fg,
            fontVariantNumeric: "tabular-nums",
            flexShrink: 0,
          }}
        >
          {statusValue}
        </Typography>
        {secondaryLabel && secondaryValue && (
          <Typography
            sx={{
              fontSize: 11,
              fontWeight: 700,
              color: "text.secondary",
              fontVariantNumeric: "tabular-nums",
              flexShrink: 0,
              px: 0.75,
              py: 0.125,
              borderRadius: 0.75,
              bgcolor: alpha(theme.palette.text.primary, 0.06),
              display: { xs: "none", sm: "block" },
            }}
          >
            {secondaryLabel} {secondaryValue}
          </Typography>
        )}

        <Box sx={{ flex: 1, display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>
          <Box
            sx={{
              flex: 1,
              height: 6,
              borderRadius: 0.5,
              bgcolor: alpha(theme.palette.text.primary, 0.08),
              overflow: "hidden",
              minWidth: 30,
            }}
          >
            <Box
              sx={{
                height: "100%",
                width: `${progressPct}%`,
                bgcolor: progressColor,
                transition: "width 200ms",
              }}
            />
          </Box>
          <Typography
            sx={{
              fontSize: 11.5,
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
              color: "text.secondary",
              flexShrink: 0,
              minWidth: 32,
              textAlign: "right",
            }}
          >
            {progressPct}%
          </Typography>
        </Box>

        <IconButton
          size="small"
          component="span"
          tabIndex={-1}
          sx={{ p: 0.25, color: "text.secondary", flexShrink: 0 }}
        >
          {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
      </Box>

      <Collapse in={expanded} unmountOnExit>
        <Box
          sx={{
            p: 1.5,
            borderTop: `1px solid ${theme.palette.divider}`,
          }}
        >
          {children}
        </Box>
      </Collapse>
    </Box>
  );
}

export default MobileCollapsibleHero;
