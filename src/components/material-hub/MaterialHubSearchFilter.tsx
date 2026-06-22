"use client";

/**
 * MaterialHubSearchFilter — one compact control that merges the old free-text
 * search box and the "Filter by material" dropdown.
 *
 * A single search icon (badged when any filter is active) opens a popover with
 * one freeSolo Autocomplete:
 *   - typing drives the free-text `search` (matches PO / ref / expense / name);
 *   - picking a grouped option pins a material / variant / brand filter and
 *     clears the free text so the two never double-apply.
 * The pinned material shows as a removable chip above the field.
 *
 * Stateless — the Hub page owns the filter state and AND-combines these with the
 * stage stepper, kind toggle and date range.
 */

import * as React from "react";
import {
  Autocomplete,
  Badge,
  Box,
  Button,
  Chip,
  IconButton,
  Popover,
  TextField,
  Tooltip,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { hubTokens } from "@/lib/material-hub/tokens";
import type { MaterialOption } from "@/lib/material-hub/threadFilters";

export interface MaterialHubSearchFilterProps {
  materialOptions: MaterialOption[];
  selected: MaterialOption | null;
  onSelectedChange: (sel: MaterialOption | null) => void;
  search: string;
  onSearchChange: (value: string) => void;
}

export default function MaterialHubSearchFilter({
  materialOptions,
  selected,
  onSelectedChange,
  search,
  onSearchChange,
}: MaterialHubSearchFilterProps) {
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);
  const active = !!selected || !!search.trim();

  return (
    <>
      <Tooltip title="Search & filter">
        <IconButton
          size="small"
          onClick={(e) => setAnchorEl(e.currentTarget)}
          aria-label="Search and filter materials"
          sx={{
            color: active ? hubTokens.primary : hubTokens.muted,
            background: active ? hubTokens.primarySoft : "transparent",
          }}
        >
          <Badge
            variant="dot"
            color="primary"
            invisible={!active}
            overlap="circular"
          >
            <SearchIcon sx={{ fontSize: 20 }} />
          </Badge>
        </IconButton>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { p: 1.5, width: 320 } } }}
      >
        {selected && (
          <Box sx={{ mb: 1 }}>
            <Chip
              size="small"
              label={`${selected.group}: ${selected.label}`}
              onDelete={() => onSelectedChange(null)}
              sx={{
                background: hubTokens.primarySoft,
                color: hubTokens.primary,
                fontWeight: 600,
                maxWidth: "100%",
              }}
            />
          </Box>
        )}

        <Autocomplete
          size="small"
          freeSolo
          autoHighlight
          openOnFocus
          options={materialOptions}
          groupBy={(o) => (typeof o === "string" ? "" : o.group)}
          getOptionLabel={(o) => (typeof o === "string" ? o : o.label)}
          isOptionEqualToValue={(o, v) =>
            typeof o !== "string" && typeof v !== "string" && o.kind === v.kind && o.id === v.id
          }
          // Controlled input = the live free-text search. We ignore MUI's "reset"
          // (fired when an option is picked) so picking a material clears search.
          inputValue={search}
          onInputChange={(_, val, reason) => {
            if (reason === "input") onSearchChange(val);
            else if (reason === "clear") onSearchChange("");
          }}
          value={null}
          onChange={(_, val) => {
            if (val && typeof val !== "string") {
              onSelectedChange(val);
              onSearchChange("");
            } else if (typeof val === "string") {
              onSearchChange(val);
            }
          }}
          // Render the dropdown outside the Popover DOM so focus / aria-hidden
          // don't conflict (per app a11y guideline for Autocomplete in overlays).
          slotProps={{ popper: { disablePortal: false } }}
          renderInput={(params) => (
            <TextField
              {...params}
              autoFocus
              placeholder="Search PO / ref / expense, or pick a material…"
              inputProps={{
                ...params.inputProps,
                "aria-label": "Search threads or filter by material",
              }}
            />
          )}
        />

        {active && (
          <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 1 }}>
            <Button
              size="small"
              onClick={() => {
                onSelectedChange(null);
                onSearchChange("");
              }}
              sx={{ textTransform: "none", color: hubTokens.muted, fontSize: 12.5 }}
            >
              Clear
            </Button>
          </Box>
        )}
      </Popover>
    </>
  );
}
