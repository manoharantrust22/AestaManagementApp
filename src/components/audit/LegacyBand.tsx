"use client";

import React, { useEffect, useState } from "react";
import {
  Box,
  Button,
  Collapse,
  IconButton,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  CheckCircleOutline,
} from "@mui/icons-material";

interface LegacyBandProps {
  /** ISO date — used in the header text. */
  cutoffDate: string;
  /** Persists collapse/expand state per page across reloads. */
  storageKey: string;
  /** Optional summary slot rendered in the header chrome (e.g. "₹X owed · ₹Y paid"). */
  summary?: React.ReactNode;
  /** Optional Reconcile button click handler. When provided, the button is rendered. */
  onReconcileClick?: () => void;
  /** Whether reconcile is currently in flight. Disables the button + shows label. */
  reconciling?: boolean;
  /** The actual band content (tab body scoped to legacy data). */
  children: React.ReactNode;
}

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Collapsible "Legacy" band wrapper used for sites in audit mode. Wraps the
 * legacy-scoped copy of a tab's content. Header is always visible with the
 * audit tone; body collapses to reclaim vertical space (default collapsed).
 *
 * Pattern mirrors MobileCollapsibleHero (localStorage persistence, MUI Collapse)
 * but with audit-tone styling and a Reconcile button slot in the header.
 */
export default function LegacyBand({
  cutoffDate,
  storageKey,
  summary,
  onReconcileClick,
  reconciling = false,
  children,
}: LegacyBandProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState<boolean>(false);

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
        // localStorage may be unavailable
      }
      return next;
    });
  };

  const tone = {
    fg: theme.palette.warning.dark,
    bg: alpha(theme.palette.warning.main, 0.1),
    border: alpha(theme.palette.warning.main, 0.35),
  };

  return (
    <Box
      sx={{
        mb: 1.5,
        bgcolor: "background.paper",
        border: `1px solid ${tone.border}`,
        borderRadius: 1.5,
        overflow: "hidden",
      }}
    >
      <Box
        component="button"
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse legacy band" : "Expand legacy band"}
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
          🟡 Legacy
        </Typography>
        <Typography
          sx={{
            fontSize: 12,
            color: "text.secondary",
            flexShrink: 0,
          }}
        >
          before {formatDate(cutoffDate)}
        </Typography>
        {summary && (
          <Box sx={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "flex-start", minWidth: 0, ml: 1 }}>
            {summary}
          </Box>
        )}
        {!summary && <Box sx={{ flex: 1 }} />}
        {onReconcileClick && (
          <Button
            size="small"
            variant="outlined"
            color="success"
            startIcon={<CheckCircleOutline fontSize="small" />}
            disabled={reconciling}
            onClick={(e) => {
              e.stopPropagation();
              onReconcileClick();
            }}
            sx={{
              flexShrink: 0,
              fontSize: 12,
              textTransform: "none",
              py: 0.25,
            }}
          >
            {reconciling ? "Reconciling…" : "Reconcile site"}
          </Button>
        )}
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
            borderTop: `1px solid ${tone.border}`,
            bgcolor: alpha(theme.palette.warning.main, 0.02),
          }}
        >
          {children}
        </Box>
      </Collapse>
    </Box>
  );
}
