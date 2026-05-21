"use client";

import React from "react";
import { Chip, Stack, Typography } from "@mui/material";
import { FilterAlt } from "@mui/icons-material";

export interface ActiveFilter {
  key: string;
  label: string;
  onRemove: () => void;
}

interface FilterChipBarProps {
  filters: ActiveFilter[];
}

export default function FilterChipBar({ filters }: FilterChipBarProps) {
  if (filters.length === 0) return null;
  return (
    <Stack
      direction="row"
      spacing={1}
      alignItems="center"
      sx={{ flexWrap: "wrap", rowGap: 1, py: 1 }}
    >
      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: "text.secondary" }}>
        <FilterAlt fontSize="small" />
        <Typography variant="caption" sx={{ fontWeight: 600, textTransform: "uppercase" }}>
          Filters
        </Typography>
      </Stack>
      {filters.map((f) => (
        <Chip
          key={f.key}
          label={f.label}
          size="small"
          onDelete={f.onRemove}
          color="primary"
          variant="outlined"
        />
      ))}
    </Stack>
  );
}
