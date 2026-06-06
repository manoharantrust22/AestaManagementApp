"use client";

/**
 * Filter toolbar row for the Material Hub, rendered directly under the kind
 * chips. Holds a single-select material Autocomplete + the standalone compact
 * DateRangePicker (by request date) + a "Clear filters" link. Stateless — the
 * Hub page owns the filter state and AND-combines these with the active chip.
 */

import { Autocomplete, Box, Button, TextField } from "@mui/material";
import DateRangePicker from "@/components/common/DateRangePicker";
import { hubTokens } from "@/lib/material-hub/tokens";
import type { MaterialOption } from "@/lib/material-hub/threadFilters";

export interface MaterialHubToolbarProps {
  materialOptions: MaterialOption[];
  selected: MaterialOption | null;
  onSelectedChange: (sel: MaterialOption | null) => void;
  dateStart: Date | null;
  dateEnd: Date | null;
  onDateChange: (start: Date | null, end: Date | null) => void;
  onClear: () => void;
}

export default function MaterialHubToolbar({
  materialOptions,
  selected,
  onSelectedChange,
  dateStart,
  dateEnd,
  onDateChange,
  onClear,
}: MaterialHubToolbarProps) {
  const hasActiveFilters = !!selected || (!!dateStart && !!dateEnd);

  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 1,
      }}
    >
      <Autocomplete
        size="small"
        options={materialOptions}
        value={selected}
        onChange={(_, val) => onSelectedChange(val ?? null)}
        groupBy={(o) => o.group}
        getOptionLabel={(o) => o.label}
        isOptionEqualToValue={(o, v) => o.kind === v.kind && o.id === v.id}
        sx={{ width: 240 }}
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder="Filter by material…"
            inputProps={{
              ...params.inputProps,
              "aria-label": "Filter by material",
            }}
          />
        )}
      />

      <DateRangePicker
        standalone
        compact
        startDate={dateStart}
        endDate={dateEnd}
        onChange={onDateChange}
      />

      {hasActiveFilters && (
        <Button
          size="small"
          onClick={onClear}
          sx={{
            textTransform: "none",
            color: hubTokens.muted,
            fontSize: 12.5,
            minWidth: 0,
          }}
        >
          Clear filters
        </Button>
      )}
    </Box>
  );
}
