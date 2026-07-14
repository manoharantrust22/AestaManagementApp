"use client";

import { Box, Chip, IconButton, Typography } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import dayjs from "dayjs";
import { weekStartOf, weekStartStr } from "@/lib/utils/weekUtils";

/**
 * Sun–Sat week stepper for the payout console. Payday convention: Saturday pays
 * the running week, Sunday/Monday pay the week that just closed — so the parent
 * defaults to the last closed week and this navigator steps from there.
 */
export default function PayoutWeekNavigator({
  weekStart,
  onChange,
}: {
  weekStart: string; // YYYY-MM-DD, always a Sunday
  onChange: (weekStart: string) => void;
}) {
  const start = dayjs(weekStart);
  const end = start.add(6, "day");
  const currentWeekStart = weekStartOf(dayjs());
  const isCurrentWeek = start.isSame(currentWeekStart, "day");
  const lastClosedStart = weekStartStr(currentWeekStart.subtract(7, "day"));
  const isDefaultWeek = weekStart === lastClosedStart;

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
      <IconButton
        size="small"
        aria-label="Previous week"
        onClick={() => onChange(weekStartStr(start.subtract(7, "day")))}
      >
        <ChevronLeftIcon fontSize="small" />
      </IconButton>
      <Typography
        variant="subtitle1"
        sx={{ fontWeight: 700, minWidth: 150, textAlign: "center", whiteSpace: "nowrap" }}
      >
        {start.format("DD MMM")} – {end.format("DD MMM")}
      </Typography>
      <IconButton
        size="small"
        aria-label="Next week"
        disabled={isCurrentWeek}
        onClick={() => onChange(weekStartStr(start.add(7, "day")))}
      >
        <ChevronRightIcon fontSize="small" />
      </IconButton>
      {!isDefaultWeek && (
        <Chip
          label="Payday week"
          size="small"
          variant="outlined"
          onClick={() => onChange(lastClosedStart)}
          sx={{ ml: 0.5 }}
        />
      )}
    </Box>
  );
}
