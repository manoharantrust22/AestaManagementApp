"use client";

import * as React from "react";
import {
  Box,
  IconButton,
  InputAdornment,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import {
  Search as SearchIcon,
  Clear as ClearIcon,
  Bolt as BoltIcon,
  AttachFile as AttachFileIcon,
  SwapHoriz as SwapHorizIcon,
} from "@mui/icons-material";

/** Independent, combinable quick filters for the by-settlement list. */
export type SettlementQuickFlag = "advance-paid" | "with-proof" | "moved";

export interface SettlementFilterBarProps {
  /** Currently-active quick flags (multi-select — they narrow together). */
  flags: SettlementQuickFlag[];
  onFlagsChange: (next: SettlementQuickFlag[]) => void;
  /** Free-text search against the settlement reference/ID. */
  search: string;
  onSearchChange: (next: string) => void;
  /** Rows visible after all filters — shown as "N matches" when filtering. */
  matchCount: number;
}

/**
 * Compact filter strip rendered above the by-settlement list. The quick flags
 * are independent toggles that combine (e.g. Advance + Proof), and stack on top
 * of the app's global date-range picker and the Hide-cancelled toggle. Sticky so
 * it stays reachable while the list scrolls. Every field it binds to already
 * lives on SettlementListRow, so filtering is pure client-side.
 */
export function SettlementFilterBar({
  flags,
  onFlagsChange,
  search,
  onSearchChange,
  matchCount,
}: SettlementFilterBarProps) {
  const isFiltering = flags.length > 0 || search.trim().length > 0;

  return (
    <Box
      sx={{
        position: "sticky",
        top: 0,
        zIndex: 2,
        bgcolor: "background.paper",
        px: { xs: 1, sm: 1.5 },
        py: 0.75,
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
        size="small"
        value={flags}
        onChange={(_, next) => onFlagsChange(next as SettlementQuickFlag[])}
        aria-label="Settlement quick filters"
        sx={{
          flexShrink: 0,
          "& .MuiToggleButton-root": {
            fontSize: { xs: 10.5, sm: 11 },
            fontWeight: 600,
            textTransform: "none",
            py: 0.25,
            px: { xs: 0.75, sm: 1.25 },
            whiteSpace: "nowrap",
            gap: 0.5,
          },
        }}
      >
        <ToggleButton value="advance-paid" aria-label="Advances paid only">
          <BoltIcon sx={{ fontSize: 14 }} /> Advance
        </ToggleButton>
        <ToggleButton value="with-proof" aria-label="With proof only">
          <AttachFileIcon sx={{ fontSize: 14 }} /> Proof
        </ToggleButton>
        <ToggleButton value="moved" aria-label="Moved to another site only">
          <SwapHorizIcon sx={{ fontSize: 14 }} /> Moved
        </ToggleButton>
      </ToggleButtonGroup>

      <TextField
        size="small"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search settlement ID…"
        aria-label="Search settlement ID"
        sx={{
          flex: { xs: "1 1 100%", sm: 1 },
          minWidth: { sm: 140 },
          "& .MuiInputBase-root": { fontSize: 12 },
        }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ fontSize: 16 }} />
            </InputAdornment>
          ),
          endAdornment: search ? (
            <InputAdornment position="end">
              <IconButton
                size="small"
                onClick={() => onSearchChange("")}
                aria-label="Clear search"
                edge="end"
              >
                <ClearIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </InputAdornment>
          ) : undefined,
        }}
      />

      {isFiltering && (
        <Typography
          variant="caption"
          sx={{
            color: "text.secondary",
            whiteSpace: "nowrap",
            flexShrink: 0,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {matchCount} match{matchCount === 1 ? "" : "es"}
        </Typography>
      )}
    </Box>
  );
}
