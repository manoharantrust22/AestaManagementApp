"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Chip,
  IconButton,
  InputAdornment,
  MenuItem,
  Select,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { Search, Close, Clear, FilterAltOff } from "@mui/icons-material";
import {
  type ExpenseGroup,
  type ExpenseStatus,
} from "@/hooks/queries/useExpensesData";

interface SitePayer {
  id: string;
  name: string;
}

export interface ExpensesFilterBarProps {
  search: string;
  onSearchChange: (next: string) => void;
  group: ExpenseGroup;
  onGroupChange: (next: ExpenseGroup) => void;
  activeTypes: string[];
  /** Friendly label for the active type chip (e.g. "Daily wages"). */
  activeTypesLabel: string | null;
  onClearTypes: () => void;
  status: ExpenseStatus;
  onStatusChange: (next: ExpenseStatus) => void;
  hasMultiplePayers: boolean;
  sitePayers: SitePayer[];
  sitePayerId: string | null;
  onSitePayerChange: (next: string | null) => void;
  onResetAll: () => void;
}

export default function ExpensesFilterBar(props: ExpensesFilterBarProps) {
  const {
    search,
    onSearchChange,
    group,
    onGroupChange,
    activeTypes,
    activeTypesLabel,
    onClearTypes,
    status,
    onStatusChange,
    hasMultiplePayers,
    sitePayers,
    sitePayerId,
    onSitePayerChange,
    onResetAll,
  } = props;

  // Debounced local search input
  const [localSearch, setLocalSearch] = useState(search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalSearch(search);
  }, [search]);

  const onLocalChange = (next: string) => {
    setLocalSearch(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onSearchChange(next), 250);
  };

  const hasAnyFilter =
    !!search ||
    group !== "all" ||
    activeTypes.length > 0 ||
    status !== "all" ||
    !!sitePayerId;

  const sitePayerName = useMemo(() => {
    if (!sitePayerId) return null;
    return sitePayers.find((p) => p.id === sitePayerId)?.name ?? null;
  }, [sitePayerId, sitePayers]);

  return (
    <Box
      sx={{
        flexShrink: 0,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 1,
        px: { xs: 2, md: 2.5 },
        py: 1,
        borderBottom: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
      }}
    >
      <TextField
        size="small"
        placeholder="Search ref code, vendor, or description"
        value={localSearch}
        onChange={(e) => onLocalChange(e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <Search sx={{ fontSize: 18, color: "text.secondary" }} />
            </InputAdornment>
          ),
          endAdornment: localSearch ? (
            <InputAdornment position="end">
              <IconButton size="small" onClick={() => onLocalChange("")}>
                <Clear sx={{ fontSize: 16 }} />
              </IconButton>
            </InputAdornment>
          ) : null,
          sx: { fontSize: 13.5 },
        }}
        sx={{ minWidth: { xs: "100%", md: 280 }, maxWidth: 360, flex: { xs: "1 1 100%", md: "0 0 280px" } }}
      />

      <ToggleButtonGroup
        size="small"
        exclusive
        value={group}
        onChange={(_, v) => {
          if (v) onGroupChange(v as ExpenseGroup);
        }}
        sx={{
          "& .MuiToggleButton-root": {
            textTransform: "none",
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: 0.2,
            py: 0.5,
            px: 1.5,
          },
        }}
      >
        <ToggleButton value="all">All</ToggleButton>
        <ToggleButton value="labor">Labor</ToggleButton>
        <ToggleButton value="building">Building</ToggleButton>
      </ToggleButtonGroup>

      <Select
        size="small"
        value={status}
        onChange={(e) => onStatusChange(e.target.value as ExpenseStatus)}
        sx={{
          fontSize: 13,
          minWidth: 130,
          "& .MuiSelect-select": { py: 0.75 },
        }}
        renderValue={(val) => (
          <Typography variant="body2" sx={{ fontSize: 13 }}>
            {val === "all" ? "All status" : val === "cleared" ? "Cleared only" : "Pending only"}
          </Typography>
        )}
      >
        <MenuItem value="all">All status</MenuItem>
        <MenuItem value="cleared">Cleared only</MenuItem>
        <MenuItem value="pending">Pending only</MenuItem>
      </Select>

      {hasMultiplePayers && sitePayers.length > 0 ? (
        <Select
          size="small"
          displayEmpty
          value={sitePayerId ?? ""}
          onChange={(e) => onSitePayerChange(e.target.value ? String(e.target.value) : null)}
          sx={{ fontSize: 13, minWidth: 160 }}
          renderValue={(val) => (
            <Typography variant="body2" sx={{ fontSize: 13 }}>
              {val ? sitePayers.find((p) => p.id === val)?.name ?? "Paid by…" : "Any payer"}
            </Typography>
          )}
        >
          <MenuItem value="">Any payer</MenuItem>
          {sitePayers.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.name}
            </MenuItem>
          ))}
        </Select>
      ) : null}

      {activeTypes.length > 0 && activeTypesLabel ? (
        <Chip
          size="small"
          label={activeTypesLabel}
          onDelete={onClearTypes}
          deleteIcon={<Close sx={{ fontSize: 14 }} />}
          sx={{ fontSize: 12, fontWeight: 500, bgcolor: "primary.lighter", color: "primary.dark" }}
        />
      ) : null}

      {sitePayerName ? (
        <Chip
          size="small"
          label={`Paid by: ${sitePayerName}`}
          onDelete={() => onSitePayerChange(null)}
          deleteIcon={<Close sx={{ fontSize: 14 }} />}
          sx={{ fontSize: 12 }}
        />
      ) : null}

      {hasAnyFilter ? (
        <Tooltip title="Clear all filters">
          <IconButton size="small" onClick={onResetAll} sx={{ ml: "auto" }}>
            <FilterAltOff sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      ) : null}
    </Box>
  );
}
