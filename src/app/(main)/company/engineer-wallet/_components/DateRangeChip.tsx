"use client";

import React from "react";
import { ToggleButton, ToggleButtonGroup } from "@mui/material";
import type { DateRangePreset } from "../_utils/dateRangePreset";

interface DateRangeChipProps {
  value: DateRangePreset;
  onChange: (next: DateRangePreset) => void;
}

const OPTIONS: Array<{ value: DateRangePreset; label: string }> = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

export default function DateRangeChip({ value, onChange }: DateRangeChipProps) {
  return (
    <ToggleButtonGroup
      value={value}
      exclusive
      size="small"
      onChange={(_, next) => {
        if (next) onChange(next as DateRangePreset);
      }}
      sx={{
        bgcolor: "background.paper",
        "& .MuiToggleButton-root": {
          textTransform: "none",
          px: { xs: 1.25, sm: 1.75 },
          py: 0.5,
          fontSize: "0.8125rem",
          fontWeight: 500,
        },
      }}
    >
      {OPTIONS.map((opt) => (
        <ToggleButton key={opt.value} value={opt.value}>
          {opt.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
