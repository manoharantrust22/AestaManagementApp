"use client";

import React from "react";
import { Box, Button, Chip, Typography } from "@mui/material";
import {
  BeachAccess as BeachAccessIcon,
  EventBusy as HolidayIcon,
} from "@mui/icons-material";
import dayjs from "dayjs";
import type { HolidayGroup } from "@/lib/utils/holidayUtils";

interface UpcomingHolidaysStripProps {
  /** Future holiday groups in scope, soonest first. */
  groups: HolidayGroup[];
  canEdit: boolean;
  onEdit: (group: HolidayGroup) => void;
  onPlan: () => void;
  maxChips?: number;
}

/**
 * One-line "Upcoming holidays" strip shown above the attendance table.
 * Replaces the standalone /site/holidays page for planning ahead: chips open
 * the edit dialog, "Plan holiday" opens the mark dialog in range mode.
 */
export default function UpcomingHolidaysStrip({
  groups,
  canEdit,
  onEdit,
  onPlan,
  maxChips = 6,
}: UpcomingHolidaysStripProps) {
  if (groups.length === 0 && !canEdit) return null;

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.75,
        flexWrap: "wrap",
        mt: 1,
        px: { xs: 1, sm: 0 },
      }}
    >
      <BeachAccessIcon sx={{ fontSize: 18, color: "warning.main" }} />
      <Typography variant="caption" color="text.secondary" fontWeight={600}>
        Upcoming holidays:
      </Typography>
      {groups.length === 0 && (
        <Typography variant="caption" color="text.secondary">
          none planned
        </Typography>
      )}
      {groups.slice(0, maxChips).map((g) => (
        <Chip
          key={g.id}
          size="small"
          variant="outlined"
          color="warning"
          label={`${
            g.dayCount === 1
              ? dayjs(g.startDate).format("DD MMM")
              : `${dayjs(g.startDate).format("DD MMM")}–${dayjs(g.endDate).format("DD MMM")}`
          }${g.reason ? ` · ${g.reason}` : ""}`}
          onClick={canEdit ? () => onEdit(g) : undefined}
          sx={{ height: 24, fontSize: "0.72rem", maxWidth: 240 }}
        />
      ))}
      {groups.length > maxChips && (
        <Typography variant="caption" color="text.secondary">
          +{groups.length - maxChips} more
        </Typography>
      )}
      {canEdit && (
        <Button
          size="small"
          startIcon={<HolidayIcon sx={{ fontSize: 16 }} />}
          onClick={onPlan}
          sx={{ textTransform: "none", py: 0, minHeight: 24, fontSize: "0.75rem" }}
        >
          Plan holiday
        </Button>
      )}
    </Box>
  );
}
