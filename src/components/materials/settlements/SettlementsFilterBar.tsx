"use client";

import {
  Box,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  MenuItem,
  InputAdornment,
  Stack,
  IconButton,
  Tooltip,
  useTheme,
  useMediaQuery,
  Drawer,
  Typography,
  Button,
  Divider,
} from "@mui/material";
import {
  Search as SearchIcon,
  Clear as ClearIcon,
  ViewModule as CardsIcon,
  TableRows as TableIcon,
  FilterList as FilterIcon,
} from "@mui/icons-material";
import { useState } from "react";

export type SettlementsTypeFilter = "all" | "vendor" | "intersite" | "advance";
export type SettlementsStatusFilter = "all" | "pending" | "settled";
export type SettlementsView = "cards" | "table";

export interface SettlementsFilter {
  search: string;
  dateFrom: string;
  dateTo: string;
  typeFilter: SettlementsTypeFilter;
  statusFilter: SettlementsStatusFilter;
}

interface Props {
  filter: SettlementsFilter;
  onFilterChange: (next: SettlementsFilter) => void;
  view: SettlementsView;
  onViewChange: (next: SettlementsView) => void;
  totalCount: number;
  pendingCount: number;
  settledCount: number;
}

export default function SettlementsFilterBar({
  filter,
  onFilterChange,
  view,
  onViewChange,
  totalCount,
  pendingCount,
  settledCount,
}: Props) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [sheetOpen, setSheetOpen] = useState(false);

  const update = (patch: Partial<SettlementsFilter>) =>
    onFilterChange({ ...filter, ...patch });

  const activeFilterCount =
    (filter.search ? 1 : 0) +
    (filter.dateFrom ? 1 : 0) +
    (filter.dateTo ? 1 : 0) +
    (filter.typeFilter !== "all" ? 1 : 0) +
    (filter.statusFilter !== "all" ? 1 : 0);

  const FilterControls = (
    <Stack spacing={2}>
      <TextField
        size="small"
        placeholder="Search ref, PO #, vendor…"
        value={filter.search}
        onChange={(e) => update({ search: e.target.value })}
        fullWidth
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
            endAdornment: filter.search ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => update({ search: "" })}>
                  <ClearIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ) : null,
          },
        }}
      />

      <Stack direction="row" spacing={1}>
        <TextField
          size="small"
          type="date"
          label="From"
          value={filter.dateFrom}
          onChange={(e) => update({ dateFrom: e.target.value })}
          fullWidth
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          size="small"
          type="date"
          label="To"
          value={filter.dateTo}
          onChange={(e) => update({ dateTo: e.target.value })}
          fullWidth
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Stack>

      <TextField
        size="small"
        select
        label="Type"
        value={filter.typeFilter}
        onChange={(e) => update({ typeFilter: e.target.value as SettlementsTypeFilter })}
        fullWidth
      >
        <MenuItem value="all">All types</MenuItem>
        <MenuItem value="vendor">Vendor payments</MenuItem>
        <MenuItem value="intersite">Inter-site</MenuItem>
        <MenuItem value="advance">Advance PO</MenuItem>
      </TextField>

      <ToggleButtonGroup
        value={filter.statusFilter}
        exclusive
        onChange={(_, v) => v && update({ statusFilter: v })}
        size="small"
        fullWidth
      >
        <ToggleButton value="all">All ({totalCount})</ToggleButton>
        <ToggleButton value="pending" sx={{ color: "warning.main" }}>
          Pending ({pendingCount})
        </ToggleButton>
        <ToggleButton value="settled" sx={{ color: "success.main" }}>
          Settled ({settledCount})
        </ToggleButton>
      </ToggleButtonGroup>
    </Stack>
  );

  if (isMobile) {
    return (
      <Box sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<FilterIcon />}
            onClick={() => setSheetOpen(true)}
            sx={{ flex: 1 }}
          >
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </Button>
          <ToggleButtonGroup
            value={view}
            exclusive
            onChange={(_, v) => v && onViewChange(v)}
            size="small"
          >
            <ToggleButton value="cards">
              <CardsIcon fontSize="small" />
            </ToggleButton>
            <ToggleButton value="table">
              <TableIcon fontSize="small" />
            </ToggleButton>
          </ToggleButtonGroup>
        </Stack>

        <Drawer
          anchor="bottom"
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          PaperProps={{ sx: { borderTopLeftRadius: 12, borderTopRightRadius: 12 } }}
        >
          <Box sx={{ p: 2 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
              <Typography variant="h6">Filters</Typography>
              <Button
                size="small"
                onClick={() =>
                  onFilterChange({
                    search: "",
                    dateFrom: "",
                    dateTo: "",
                    typeFilter: "all",
                    statusFilter: "all",
                  })
                }
              >
                Reset
              </Button>
            </Box>
            <Divider sx={{ mb: 2 }} />
            {FilterControls}
            <Box sx={{ mt: 2 }}>
              <Button variant="contained" fullWidth onClick={() => setSheetOpen(false)}>
                Apply
              </Button>
            </Box>
          </Box>
        </Drawer>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        mb: 2,
        p: 2,
        bgcolor: "background.paper",
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
      }}
    >
      <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
        <TextField
          size="small"
          placeholder="Search ref, PO #, vendor…"
          value={filter.search}
          onChange={(e) => update({ search: e.target.value })}
          sx={{ minWidth: 240, flex: 1 }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
              endAdornment: filter.search ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => update({ search: "" })}>
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : null,
            },
          }}
        />

        <TextField
          size="small"
          type="date"
          label="From"
          value={filter.dateFrom}
          onChange={(e) => update({ dateFrom: e.target.value })}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ width: 160 }}
        />
        <TextField
          size="small"
          type="date"
          label="To"
          value={filter.dateTo}
          onChange={(e) => update({ dateTo: e.target.value })}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ width: 160 }}
        />

        <TextField
          size="small"
          select
          label="Type"
          value={filter.typeFilter}
          onChange={(e) => update({ typeFilter: e.target.value as SettlementsTypeFilter })}
          sx={{ width: 170 }}
        >
          <MenuItem value="all">All types</MenuItem>
          <MenuItem value="vendor">Vendor payments (incl. advance)</MenuItem>
          <MenuItem value="intersite">Inter-site</MenuItem>
          <MenuItem value="advance">Advance only (pay before delivery)</MenuItem>
        </TextField>

        <ToggleButtonGroup
          value={filter.statusFilter}
          exclusive
          onChange={(_, v) => v && update({ statusFilter: v })}
          size="small"
        >
          <ToggleButton value="all">All ({totalCount})</ToggleButton>
          <ToggleButton value="pending" sx={{ color: "warning.main" }}>
            Pending ({pendingCount})
          </ToggleButton>
          <ToggleButton value="settled" sx={{ color: "success.main" }}>
            Settled ({settledCount})
          </ToggleButton>
        </ToggleButtonGroup>

        <Box sx={{ ml: "auto" }}>
          <ToggleButtonGroup
            value={view}
            exclusive
            onChange={(_, v) => v && onViewChange(v)}
            size="small"
          >
            <Tooltip title="Cards view">
              <ToggleButton value="cards">
                <CardsIcon fontSize="small" />
              </ToggleButton>
            </Tooltip>
            <Tooltip title="Table view">
              <ToggleButton value="table">
                <TableIcon fontSize="small" />
              </ToggleButton>
            </Tooltip>
          </ToggleButtonGroup>
        </Box>
      </Stack>
    </Box>
  );
}

// ─────────────────────────────────────────────────────────────
// Search helper — applies search + date range to an item list
// ─────────────────────────────────────────────────────────────

import type { SettlementItem } from "./settlementClassifiers";
import { getItemDate, getItemRefCode, getItemVendorName } from "./settlementClassifiers";
import type { MaterialPurchaseExpenseWithDetails } from "@/types/material.types";

export function applySearchAndDate(
  items: SettlementItem[],
  filter: SettlementsFilter,
): SettlementItem[] {
  const search = filter.search.trim().toLowerCase();
  const fromTs = filter.dateFrom ? Date.parse(filter.dateFrom) : null;
  const toTs = filter.dateTo ? Date.parse(filter.dateTo) + 24 * 60 * 60 * 1000 - 1 : null;

  return items.filter((item) => {
    if (search) {
      const ref = getItemRefCode(item).toLowerCase();
      const vendor = getItemVendorName(item).toLowerCase();
      const poNumber =
        item.itemType === "expense"
          ? (item as MaterialPurchaseExpenseWithDetails).purchase_order?.po_number?.toLowerCase() || ""
          : item.po_number?.toLowerCase() || "";
      if (!ref.includes(search) && !vendor.includes(search) && !poNumber.includes(search)) {
        return false;
      }
    }
    if (fromTs !== null || toTs !== null) {
      const t = Date.parse(getItemDate(item));
      if (Number.isNaN(t)) return false;
      if (fromTs !== null && t < fromTs) return false;
      if (toTs !== null && t > toTs) return false;
    }
    return true;
  });
}
