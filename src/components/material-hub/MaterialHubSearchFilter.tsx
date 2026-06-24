"use client";

/**
 * MaterialHubSearchFilter — one compact control that merges the old free-text
 * search box and the "Filter by material" dropdown into a single search panel.
 *
 * A badged search icon opens a self-contained panel:
 *   - the input is pinned at the top and drives the free-text `search`
 *     (matches PO / vendor / ref / expense / MR# / material name on the cards);
 *   - the options below it live-filter as you type and are grouped into
 *     Material / Size·Variant / Brand sections — picking one pins that filter
 *     and clears the free text so the two never double-apply.
 *
 * The option list renders *in normal flow* directly under the input (not as a
 * second popper), so it can never overlap the field — the bug the old nested
 * Autocomplete had. The pinned filter shows as a removable chip under the input.
 *
 * Stateless — the Hub page owns the filter state and AND-combines these with the
 * stage stepper, kind toggle and date range.
 */

import * as React from "react";
import {
  Badge,
  Box,
  Button,
  ButtonBase,
  Chip,
  IconButton,
  InputAdornment,
  Popover,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import CheckIcon from "@mui/icons-material/Check";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import StraightenOutlinedIcon from "@mui/icons-material/StraightenOutlined";
import SellOutlinedIcon from "@mui/icons-material/SellOutlined";
import { hubTokens, hubToneColors, type HubTone } from "@/lib/material-hub/tokens";
import {
  groupMaterialOptions,
  type FilterGroup,
  type MaterialOption,
} from "@/lib/material-hub/threadFilters";

export interface MaterialHubSearchFilterProps {
  materialOptions: MaterialOption[];
  selected: MaterialOption | null;
  onSelectedChange: (sel: MaterialOption | null) => void;
  search: string;
  onSearchChange: (value: string) => void;
}

/** Icon + accent tone per option group — keeps the row visuals on-brand. */
const GROUP_META: Record<
  FilterGroup,
  { tone: HubTone; Icon: typeof Inventory2OutlinedIcon }
> = {
  Material: { tone: "primary", Icon: Inventory2OutlinedIcon },
  "Size / Variant": { tone: "neutral", Icon: StraightenOutlinedIcon },
  Brand: { tone: "pink", Icon: SellOutlinedIcon },
};

const sameOption = (a: MaterialOption, b: MaterialOption | null) =>
  !!b && a.kind === b.kind && a.id === b.id;

export default function MaterialHubSearchFilter({
  materialOptions,
  selected,
  onSelectedChange,
  search,
  onSearchChange,
}: MaterialHubSearchFilterProps) {
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const [highlight, setHighlight] = React.useState(0);
  const open = Boolean(anchorEl);
  const active = !!selected || !!search.trim();
  const close = React.useCallback(() => setAnchorEl(null), []);

  // Live-filtered, render-ready sections + a flat list for keyboard navigation.
  const sections = React.useMemo(
    () => groupMaterialOptions(materialOptions, search),
    [materialOptions, search]
  );
  const flat = React.useMemo(() => sections.flatMap((s) => s.items), [sections]);
  const indexByKey = React.useMemo(() => {
    const m = new Map<string, number>();
    flat.forEach((o, i) => m.set(`${o.kind}:${o.id}`, i));
    return m;
  }, [flat]);

  // Reset the active row when the panel opens; clamp it as the list shrinks.
  React.useEffect(() => {
    if (open) setHighlight(0);
  }, [open]);
  React.useEffect(() => {
    setHighlight((i) => Math.min(i, Math.max(flat.length - 1, 0)));
  }, [flat.length]);

  // Keep the highlighted row scrolled into view during keyboard navigation.
  const highlightRef = React.useRef<HTMLButtonElement | null>(null);
  React.useEffect(() => {
    highlightRef.current?.scrollIntoView({ block: "nearest" });
  }, [highlight]);

  const pick = React.useCallback(
    (opt: MaterialOption) => {
      onSelectedChange(opt);
      onSearchChange("");
      close();
    },
    [onSelectedChange, onSearchChange, close]
  );

  const clearAll = React.useCallback(() => {
    onSelectedChange(null);
    onSearchChange("");
  }, [onSelectedChange, onSearchChange]);

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const opt = flat[highlight];
      if (opt) {
        e.preventDefault();
        pick(opt);
      }
    } else if (e.key === "Escape") {
      close();
    }
  };

  const query = search.trim();

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
          <Badge variant="dot" color="primary" invisible={!active} overlap="circular">
            <SearchIcon sx={{ fontSize: 20 }} />
          </Badge>
        </IconButton>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={close}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: {
            sx: {
              mt: 0.5,
              width: "min(400px, calc(100vw - 32px))",
              borderRadius: 2,
              overflow: "hidden",
              border: `1px solid ${hubTokens.border}`,
              boxShadow: "0 12px 32px rgba(0,0,0,0.16)",
            },
          },
        }}
      >
        {/* Input — pinned at the top, never overlapped by the list below. */}
        <Box sx={{ p: 1.25, pb: selected ? 0.75 : 1.25 }}>
          <TextField
            fullWidth
            size="small"
            autoFocus
            value={search}
            onChange={(e) => {
              onSearchChange(e.target.value);
              setHighlight(0);
            }}
            onKeyDown={onInputKeyDown}
            placeholder="Search PO, vendor, ref, or material…"
            inputProps={{ "aria-label": "Search threads or filter by material" }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ fontSize: 18, color: hubTokens.muted }} />
                </InputAdornment>
              ),
              endAdornment: search ? (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    edge="end"
                    aria-label="Clear search"
                    onClick={() => {
                      onSearchChange("");
                      setHighlight(0);
                    }}
                  >
                    <CloseIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }}
            sx={{
              "& .MuiOutlinedInput-root": {
                borderRadius: 1.5,
                fontSize: 13.5,
                background: hubTokens.bg,
              },
            }}
          />

          {selected && (
            <Box sx={{ mt: 1 }}>
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
        </Box>

        {/* Results — in-flow, scrollable, grouped. */}
        <Box
          role="listbox"
          aria-label="Material filter options"
          sx={{
            borderTop: `1px solid ${hubTokens.hairline}`,
            maxHeight: "min(50vh, 340px)",
            overflowY: "auto",
            py: 0.5,
            scrollbarWidth: "thin",
            "&::-webkit-scrollbar": { width: 8 },
            "&::-webkit-scrollbar-thumb": {
              background: hubTokens.border,
              borderRadius: 4,
            },
          }}
        >
          {sections.length === 0 ? (
            <Box sx={{ px: 2, py: 3, textAlign: "center" }}>
              <Typography sx={{ fontSize: 13, color: hubTokens.muted }}>
                {materialOptions.length === 0
                  ? "No materials yet"
                  : `No materials match “${query}”`}
              </Typography>
            </Box>
          ) : (
            sections.map((section) => {
              const { tone, Icon } = GROUP_META[section.group];
              const colors = hubToneColors(tone);
              return (
                <Box key={section.group} sx={{ pb: 0.5 }}>
                  <Typography
                    sx={{
                      px: 1.5,
                      pt: 1,
                      pb: 0.5,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.6px",
                      textTransform: "uppercase",
                      color: hubTokens.muted,
                    }}
                  >
                    {section.group}
                  </Typography>
                  {section.items.map((opt) => {
                    const idx = indexByKey.get(`${opt.kind}:${opt.id}`) ?? -1;
                    const isHighlighted = idx === highlight;
                    const isSelected = sameOption(opt, selected);
                    return (
                      <ButtonBase
                        key={`${opt.kind}:${opt.id}`}
                        ref={isHighlighted ? highlightRef : undefined}
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => pick(opt)}
                        onMouseMove={() => setHighlight(idx)}
                        sx={{
                          width: "100%",
                          justifyContent: "flex-start",
                          gap: 1.25,
                          px: 1.5,
                          py: 0.75,
                          textAlign: "left",
                          background: isHighlighted
                            ? hubTokens.hairline
                            : "transparent",
                        }}
                      >
                        <Box
                          aria-hidden
                          sx={{
                            flexShrink: 0,
                            width: 28,
                            height: 28,
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: colors.bg,
                            color: colors.fg,
                          }}
                        >
                          <Icon sx={{ fontSize: 16 }} />
                        </Box>
                        <Typography
                          sx={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: 13.5,
                            fontWeight: isSelected ? 600 : 400,
                            color: hubTokens.text,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {opt.label}
                        </Typography>
                        {isSelected && (
                          <CheckIcon
                            sx={{ fontSize: 18, color: hubTokens.primary, flexShrink: 0 }}
                          />
                        )}
                      </ButtonBase>
                    );
                  })}
                </Box>
              );
            })
          )}
        </Box>

        {/* Footer — quiet hint + clear, only while a filter is live. */}
        {active && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              px: 1.5,
              py: 0.75,
              borderTop: `1px solid ${hubTokens.hairline}`,
            }}
          >
            <Typography sx={{ fontSize: 11.5, color: hubTokens.subtle }}>
              Esc to close
            </Typography>
            <Button
              size="small"
              onClick={clearAll}
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
