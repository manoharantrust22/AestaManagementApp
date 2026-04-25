"use client";

import React from "react";
import { Chip, IconButton } from "@mui/material";
import {
  CalendarMonth as CalendarMonthIcon,
  Close as CloseIcon,
} from "@mui/icons-material";
import { useDateRange, formatScopeLabel } from "@/contexts/DateRangeContext";

export default function ScopeChip() {
  const { isAllTime, startDate, endDate, days, setAllTime, openPicker } =
    useDateRange();

  const isFiltered = !isAllTime && startDate && endDate && days != null;

  return (
    <Chip
      icon={<CalendarMonthIcon fontSize="small" />}
      label={formatScopeLabel(startDate, endDate, days)}
      size="small"
      color={isFiltered ? "primary" : "default"}
      variant="outlined"
      role="status"
      clickable
      onClick={() => openPicker()}
      aria-label={
        isFiltered
          ? "Open date filter"
          : "Date filter: All Time, click to change"
      }
      deleteIcon={
        isFiltered ? (
          <IconButton
            size="small"
            aria-label="Clear date filter and show all time"
            sx={{ p: 0 }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        ) : undefined
      }
      onDelete={isFiltered ? () => setAllTime() : undefined}
      sx={{
        height: 28,
        fontWeight: 500,
        maxWidth: { xs: 220, sm: "none" },
        "& .MuiChip-label": {
          overflow: "hidden",
          textOverflow: "ellipsis",
        },
      }}
    />
  );
}
