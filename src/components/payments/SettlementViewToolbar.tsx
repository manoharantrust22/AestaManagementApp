"use client";

import * as React from "react";
import {
  Box,
  Button,
  Fab,
  FormControlLabel,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { Add as AddIcon } from "@mui/icons-material";

/**
 * One option in the view-mode toggle. shortLabel renders on phones (xs),
 * longLabel from sm up — keeps the toggle compact without losing clarity.
 */
export interface SettlementToggleOption {
  value: string;
  shortLabel: React.ReactNode;
  longLabel: React.ReactNode;
  ariaLabel: string;
}

export interface SettlementViewToolbarProps {
  viewMode: string;
  onViewModeChange: (next: string) => void;
  toggleOptions: SettlementToggleOption[];
  /** Scope total for the by-settlement strip header ("N settlements"). */
  settlementCount: number;
  /** Cancelled subset of the same scope (rendered in red after the count). */
  cancelledCount: number;
  hideCancelled: boolean;
  onHideCancelledChange: (next: boolean) => void;
  /** Summary node shown when NOT in by-settlement mode
   *  (e.g. Daily+Market's "settled · unsettled"). */
  summary?: React.ReactNode;
  /** When provided, renders the primary Record action: an inline button from
   *  sm up, and a floating action button on phones (matches the attendance
   *  trade workspace). Colour flows from the active theme's primary — which is
   *  the per-trade colour inside createTradeTheme, and default blue for Civil. */
  onRecord?: () => void;
  recordLabel?: string;
}

/**
 * Single source of truth for the /site/payments view-mode toolbar. Every tab
 * (Contract, Daily+Market, All) and every trade workspace renders the same
 * component — a UI change here applies everywhere; only the per-trade colour
 * differs, and that is supplied by the surrounding ThemeProvider, not props.
 *
 * Responsive: a single row from sm up; on phones the toggle stays on row one,
 * the count + Hide-cancelled wrap to row two, and Record becomes a FAB so
 * nothing crowds or overflows the narrow toolbar.
 */
export function SettlementViewToolbar({
  viewMode,
  onViewModeChange,
  toggleOptions,
  settlementCount,
  cancelledCount,
  hideCancelled,
  onHideCancelledChange,
  summary,
  onRecord,
  recordLabel = "Record payment",
}: SettlementViewToolbarProps) {
  const isBySettlement = viewMode === "by-settlement";

  return (
    <>
      <Box
        sx={{
          px: { xs: 1, sm: 1.5 },
          py: { xs: 0.75, sm: 1 },
          display: "flex",
          alignItems: "center",
          gap: { xs: 0.75, sm: 1 },
          rowGap: 0.75,
          flexWrap: { xs: "wrap", sm: "nowrap" },
          borderBottom: 1,
          borderColor: "divider",
          flexShrink: 0,
        }}
      >
        <ToggleButtonGroup
          value={viewMode}
          exclusive
          size="small"
          onChange={(_, v) => v && onViewModeChange(v as string)}
          aria-label="View mode"
          sx={{
            flexShrink: 0,
            "& .MuiToggleButton-root": {
              fontSize: { xs: 10.5, sm: 11 },
              fontWeight: 600,
              textTransform: "none",
              py: 0.25,
              px: { xs: 0.75, sm: 1.25 },
              whiteSpace: "nowrap",
            },
          }}
        >
          {toggleOptions.map((opt) => (
            <ToggleButton key={opt.value} value={opt.value} aria-label={opt.ariaLabel}>
              <Box component="span" sx={{ display: { xs: "inline", sm: "none" } }}>
                {opt.shortLabel}
              </Box>
              <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>
                {opt.longLabel}
              </Box>
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        {/* Non-by-settlement summary (e.g. Daily+Market settled · unsettled). */}
        {!isBySettlement && summary && (
          <Box sx={{ minWidth: 0, ml: 1 }}>{summary}</Box>
        )}

        {/* By-settlement: scope count + Hide-cancelled. Fills the rest of the
            row from sm up; wraps to a full second row on phones. */}
        {isBySettlement && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: { xs: 0.5, sm: 1.25 },
              flex: { xs: "1 1 100%", sm: 1 },
              minWidth: 0,
            }}
          >
            <Typography
              variant="caption"
              sx={{
                color: "text.secondary",
                whiteSpace: "nowrap",
                fontVariantNumeric: "tabular-nums",
                ml: { xs: 0, sm: 1 },
              }}
            >
              {settlementCount} settlements
              {cancelledCount > 0 && (
                <Box component="span" sx={{ color: "error.main", ml: 0.75 }}>
                  · {cancelledCount} cancelled
                </Box>
              )}
            </Typography>
            <Box sx={{ ml: "auto" }}>
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={hideCancelled}
                    onChange={(_, v) => onHideCancelledChange(v)}
                  />
                }
                label={<Typography variant="caption">Hide cancelled</Typography>}
                sx={{ m: 0 }}
              />
            </Box>
          </Box>
        )}

        {/* Desktop / tablet inline Record (phones use the FAB below). */}
        {onRecord && (
          <Button
            variant="contained"
            color="primary"
            size="small"
            startIcon={<AddIcon />}
            onClick={onRecord}
            sx={{
              display: { xs: "none", sm: "inline-flex" },
              flexShrink: 0,
              whiteSpace: "nowrap",
              ml: "auto",
            }}
          >
            {recordLabel}
          </Button>
        )}
      </Box>

      {/* Phone FAB — matches the attendance trade workspace. */}
      {onRecord && (
        <Tooltip title={recordLabel}>
          <Fab
            color="primary"
            aria-label={recordLabel}
            onClick={onRecord}
            sx={{
              display: { xs: "flex", sm: "none" },
              position: "fixed",
              bottom: 24,
              right: 16,
              zIndex: (t) => t.zIndex.fab,
            }}
          >
            <AddIcon />
          </Fab>
        </Tooltip>
      )}
    </>
  );
}
