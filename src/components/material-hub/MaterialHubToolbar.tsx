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
  selectedMaterialId: string | null;
  onMaterialChange: (id: string | null) => void;
  dateStart: Date | null;
  dateEnd: Date | null;
  onDateChange: (start: Date | null, end: Date | null) => void;
  onClear: () => void;
}

export default function MaterialHubToolbar({
  materialOptions,
  selectedMaterialId,
  onMaterialChange,
  dateStart,
  dateEnd,
  onDateChange,
  onClear,
}: MaterialHubToolbarProps) {
  const selectedOption =
    materialOptions.find((o) => o.material_id === selectedMaterialId) ?? null;
  const hasActiveFilters =
    !!selectedMaterialId || (!!dateStart && !!dateEnd);

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
        value={selectedOption}
        onChange={(_, val) => onMaterialChange(val?.material_id ?? null)}
        getOptionLabel={(o) => o.material_name}
        isOptionEqualToValue={(o, v) => o.material_id === v.material_id}
        sx={{ width: 240 }}
        renderInput={(params) => (
          <TextField {...params} placeholder="Filter by material…" />
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
