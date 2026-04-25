"use client";

import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  Box,
  Button,
  Chip,
  IconButton,
  Popover,
  Typography,
  List,
  ListItemButton,
  ListItemText,
  Divider,
  TextField,
} from "@mui/material";
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  KeyboardArrowDown as ArrowDownIcon,
} from "@mui/icons-material";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useDateRange, formatScopeLabel } from "@/contexts/DateRangeContext";
import { computeStep } from "@/contexts/DateRangeContext/DateRangeProvider";
import { DateRange, Range, RangeKeyDict } from "react-date-range";
import dayjs from "dayjs";
import "react-date-range/dist/styles.css";
import "react-date-range/dist/theme/default.css";

// OPTIMIZED: Replaced date-fns with dayjs to reduce bundle size
// Helper functions that match date-fns API but use dayjs internally
const startOfDay = (date: Date): Date => dayjs(date).startOf("day").toDate();
const endOfDay = (date: Date): Date => dayjs(date).endOf("day").toDate();
const subDays = (date: Date, days: number): Date => dayjs(date).subtract(days, "day").toDate();
const startOfWeek = (date: Date): Date => dayjs(date).startOf("week").toDate();
const endOfWeek = (date: Date): Date => dayjs(date).endOf("week").toDate();
const startOfMonth = (date: Date): Date => dayjs(date).startOf("month").toDate();
const endOfMonth = (date: Date): Date => dayjs(date).endOf("month").toDate();
const subMonths = (date: Date, months: number): Date => dayjs(date).subtract(months, "month").toDate();
const format = (date: Date, formatStr: string): string => {
  // Convert date-fns format tokens to dayjs format tokens
  const dayjsFormat = formatStr
    .replace(/yyyy/g, "YYYY")
    .replace(/yy/g, "YY")
    .replace(/dd/g, "DD")
    .replace(/d(?!a)/g, "D") // 'd' but not 'da' (day)
    .replace(/MMM/g, "MMM")
    .replace(/MM/g, "MM")
    .replace(/M(?!M)/g, "M");
  return dayjs(date).format(dayjsFormat);
};

interface DateRangePickerProps {
  startDate: Date | null;
  endDate: Date | null;
  onChange: (startDate: Date | null, endDate: Date | null) => void;
  minDate?: Date;
  maxDate?: Date;
  /**
   * Externally driven open signal. While true, the popover opens (or stays
   * open) with the calendar focused and the preset list visually present but
   * not highlighted. Toggle back to false (typically via `onPopoverClose`)
   * after each open cycle so the next true→false→true transition re-opens.
   *
   * Today this is wired to `pickerOpen` from `DateRangeContext`, which
   * `<ScopeChip />` and other consumers can flip via `openPicker()`.
   */
  forceOpen?: boolean;
  /**
   * Called when the user closes the picker without applying.
   * Lets the parent reset `forceOpen` flags.
   */
  onPopoverClose?: () => void;
}

type PresetGroup = "quick" | "rolling" | "previous" | "special";

type PresetKey =
  | "today"
  | "yesterday"
  | "thisWeek"
  | "last7days"
  | "lastWeek"
  | "last14days"
  | "last30days"
  | "last90days"
  | "thisMonth"
  | "lastMonth"
  | "allTime";

interface Preset {
  key: PresetKey;
  label: string;
  group: PresetGroup;
  getRange: () => { start: Date; end: Date };
}

const PRESET_GROUP_LABELS: Record<PresetGroup, string> = {
  quick: "Quick",
  rolling: "Rolling",
  previous: "Previous",
  special: "Special",
};

const presets: Preset[] = [
  {
    key: "today",
    label: "Today",
    group: "quick",
    getRange: () => ({
      start: startOfDay(new Date()),
      end: endOfDay(new Date()),
    }),
  },
  {
    key: "yesterday",
    label: "Yesterday",
    group: "quick",
    getRange: () => ({
      start: startOfDay(subDays(new Date(), 1)),
      end: endOfDay(subDays(new Date(), 1)),
    }),
  },
  {
    key: "thisWeek",
    label: "This Week",
    group: "quick",
    getRange: () => ({
      start: startOfWeek(new Date()),
      end: endOfDay(new Date()),
    }),
  },
  {
    key: "thisMonth",
    label: "This Month",
    group: "quick",
    getRange: () => ({
      start: startOfMonth(new Date()),
      end: endOfDay(new Date()),
    }),
  },
  {
    key: "last7days",
    label: "Last 7 days",
    group: "rolling",
    getRange: () => ({
      start: startOfDay(subDays(new Date(), 6)),
      end: endOfDay(new Date()),
    }),
  },
  {
    key: "last14days",
    label: "Last 14 days",
    group: "rolling",
    getRange: () => ({
      start: startOfDay(subDays(new Date(), 13)),
      end: endOfDay(new Date()),
    }),
  },
  {
    key: "last30days",
    label: "Last 30 days",
    group: "rolling",
    getRange: () => ({
      start: startOfDay(subDays(new Date(), 29)),
      end: endOfDay(new Date()),
    }),
  },
  {
    key: "last90days",
    label: "Last 90 days",
    group: "rolling",
    getRange: () => ({
      start: startOfDay(subDays(new Date(), 89)),
      end: endOfDay(new Date()),
    }),
  },
  {
    key: "lastWeek",
    label: "Last Week",
    group: "previous",
    getRange: () => ({
      start: startOfWeek(subDays(new Date(), 7)),
      end: endOfWeek(subDays(new Date(), 7)),
    }),
  },
  {
    key: "lastMonth",
    label: "Last Month",
    group: "previous",
    getRange: () => ({
      start: startOfMonth(subMonths(new Date(), 1)),
      end: endOfMonth(subMonths(new Date(), 1)),
    }),
  },
  {
    key: "allTime",
    label: "All Time",
    group: "special",
    getRange: () => ({
      start: new Date(2020, 0, 1),
      end: endOfDay(new Date()),
    }),
  },
];

// Create presets with dynamic minDate for allTime
const getPresetsWithMinDate = (minDate?: Date): Preset[] =>
  presets.map((preset) =>
    preset.key === "allTime"
      ? {
          ...preset,
          getRange: () => ({
            start: minDate || new Date(2020, 0, 1),
            end: endOfDay(new Date()),
          }),
        }
      : preset
  );

// Find matching preset for current date range
const findMatchingPreset = (start: Date, end: Date, presetList: Preset[] = presets): PresetKey | null => {
  for (const preset of presetList) {
    const range = preset.getRange();
    if (
      format(start, "yyyy-MM-dd") === format(range.start, "yyyy-MM-dd") &&
      format(end, "yyyy-MM-dd") === format(range.end, "yyyy-MM-dd")
    ) {
      return preset.key;
    }
  }
  return null;
};

export default function DateRangePicker({
  startDate,
  endDate,
  onChange,
  minDate,
  maxDate = new Date(),
  forceOpen,
  onPopoverClose,
}: DateRangePickerProps) {
  const isMobile = useIsMobile();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Create dynamic presets with minDate for allTime.
  // Memoised on minDate's timestamp (NOT the Date reference) because the parent
  // likely instantiates `new Date(siteStartDate)` on every render, which would
  // otherwise invalidate this memo every render and cascade into the sync-effect
  // below overwriting the user's in-picker selections.
  const minDateMs = minDate?.getTime();
  const dynamicPresets = useMemo(
    () => getPresetsWithMinDate(minDate),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [minDateMs]
  );

  const [tempRange, setTempRange] = useState<Range[]>([
    {
      startDate: startDate || new Date(),
      endDate: endDate || new Date(),
      key: "selection",
    },
  ]);
  const [selectedPreset, setSelectedPreset] = useState<PresetKey | null>(() =>
    startDate && endDate ? findMatchingPreset(startDate, endDate) : null
  );

  // We remount <DateRange> on every preset/open so its internal [rangeIndex, step]
  // focus always starts fresh (i.e. "next click picks the start"). Without this, an
  // active preset leaves the library mid-sequence at step 1 and the user's first
  // calendar click after a preset unexpectedly extends the end instead of beginning
  // a new range. Using a `key` that increments on reset is simpler and more robust
  // than trying to control `focusedRange` from the outside — controlled focus mode
  // interacts poorly with `moveRangeOnFirstSelection={false}` and sometimes absorbs
  // the click silently.
  const [pickerKey, setPickerKey] = useState(0);
  const [clickStage, setClickStage] = useState<"start" | "end">("start");
  const [typedStart, setTypedStart] = useState("");
  const [typedEnd, setTypedEnd] = useState("");

  useEffect(() => {
    if (tempRange[0].startDate) {
      setTypedStart(format(tempRange[0].startDate, "MMM d, yyyy"));
    }
    if (tempRange[0].endDate) {
      setTypedEnd(format(tempRange[0].endDate, "MMM d, yyyy"));
    }
  }, [tempRange]);

  const open = Boolean(anchorEl);

  // Open popover when forceOpen changes to true
  useEffect(() => {
    if (forceOpen && triggerRef.current && !anchorEl) {
      setAnchorEl(triggerRef.current);
    }
  }, [forceOpen, anchorEl]);

  // Sync temp range when the parent's committed range changes. We intentionally
  // don't depend on `dynamicPresets` here: its reference can churn (see above),
  // and we never want a churning-preset reference to overwrite whatever the user
  // is mid-selecting inside the calendar. Preset highlight for a new prop range
  // is still recomputed via `findMatchingPreset(..., dynamicPresets)` at the
  // moment this effect runs.
  useEffect(() => {
    if (startDate && endDate) {
      setTempRange([
        {
          startDate: startDate,
          endDate: endDate,
          key: "selection",
        },
      ]);
      setSelectedPreset(findMatchingPreset(startDate, endDate, dynamicPresets));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  const handleOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
    // Use current dates or default to last 7 days for picker
    const defaultStart = startDate || subDays(new Date(), 7);
    const defaultEnd = endDate || new Date();
    setTempRange([
      {
        startDate: defaultStart,
        endDate: defaultEnd,
        key: "selection",
      },
    ]);
    setClickStage("start");
    setPickerKey((k) => k + 1);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleApply = () => {
    // If "All Time" is selected, pass null dates to trigger special handling
    if (selectedPreset === "allTime") {
      onChange(null, null);
    } else if (tempRange[0].startDate && tempRange[0].endDate) {
      onChange(tempRange[0].startDate, tempRange[0].endDate);
    }
    handleClose();
  };

  const handlePresetClick = (preset: Preset) => {
    const range = preset.getRange();
    setTempRange([
      {
        startDate: range.start,
        endDate: range.end,
        key: "selection",
      },
    ]);
    setSelectedPreset(preset.key);
    setClickStage("start");
    setPickerKey((k) => k + 1);

    // Auto-apply on mobile for quick preset selection
    if (isMobile) {
      // For "All Time", pass null dates to trigger special handling in context
      if (preset.key === "allTime") {
        onChange(null, null);
      } else {
        onChange(range.start, range.end);
      }
      handleClose();
    }
  };

  const handleRangeChange = (ranges: RangeKeyDict) => {
    const selection = ranges.selection;
    setTempRange([selection]);

    if (selection.startDate && selection.endDate) {
      setSelectedPreset(
        findMatchingPreset(selection.startDate, selection.endDate, dynamicPresets)
      );
    }

    // After a fresh-mount first click, react-date-range sets start === end
    // (single-day). That's our cue we've consumed the "start" click and the
    // next click is the end. After the second click the two dates diverge,
    // and we reset for the next round.
    if (
      selection.startDate &&
      selection.endDate &&
      format(selection.startDate, "yyyy-MM-dd") ===
        format(selection.endDate, "yyyy-MM-dd")
    ) {
      setClickStage("end");
    } else {
      setClickStage("start");
    }
  };

  const commitTypedDate = (which: "start" | "end", raw: string) => {
    const parsed = dayjs(raw);
    if (!parsed.isValid()) {
      // Revert displayed value
      if (which === "start" && tempRange[0].startDate) {
        setTypedStart(format(tempRange[0].startDate, "MMM d, yyyy"));
      } else if (which === "end" && tempRange[0].endDate) {
        setTypedEnd(format(tempRange[0].endDate, "MMM d, yyyy"));
      }
      return;
    }
    const next = parsed.toDate();

    if (which === "start") {
      const currentEnd = tempRange[0].endDate;
      if (currentEnd && next > currentEnd) {
        // Typed start is AFTER current end → swap so the user keeps a valid range
        setTempRange([
          { startDate: currentEnd, endDate: next, key: "selection" },
        ]);
      } else {
        setTempRange([
          { startDate: next, endDate: currentEnd ?? next, key: "selection" },
        ]);
      }
    } else {
      const currentStart = tempRange[0].startDate;
      if (currentStart && next < currentStart) {
        // Typed end is BEFORE current start → swap
        setTempRange([
          { startDate: next, endDate: currentStart, key: "selection" },
        ]);
      } else {
        setTempRange([
          { startDate: currentStart ?? next, endDate: next, key: "selection" },
        ]);
      }
    }
    setSelectedPreset(null);
    setClickStage("start");
    setPickerKey((k) => k + 1);
  };

  // Current label: spec §5.3 requires the pill and ScopeChip to read identically,
  // so we use the shared formatScopeLabel helper here (NOT context.label, which
  // returns preset names like "Custom range" / "Mar 2026" that diverge from the chip).
  const {
    isAllTime,
    days,
    stepBackward,
    stepForward,
    pickerContainer,
  } = useDateRange();
  const currentLabel = isAllTime
    ? "All Time"
    : formatScopeLabel(startDate, endDate, days);

  const isPrevDisabled = useMemo(() => {
    // null result from computeStep means out of bounds
    return computeStep(startDate, endDate, "backward", minDate ?? null) === null;
  }, [startDate, endDate, minDate]);

  const isNextDisabled = useMemo(() => {
    return computeStep(startDate, endDate, "forward", minDate ?? null) === null;
  }, [startDate, endDate, minDate]);

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 0, sm: 1 } }}>
      {/* Main dropdown trigger */}
      <Box sx={{ display: "flex", alignItems: "center" }}>
        {/* Prev arrow - Hidden on mobile */}
        <IconButton
          size="small"
          onClick={() => stepBackward(minDate ?? null)}
          disabled={isPrevDisabled}
          sx={{ p: 0.5, display: { xs: "none", sm: "flex" } }}
        >
          <ChevronLeftIcon fontSize="small" />
        </IconButton>

        {/* Date range button */}
        <Button
          ref={triggerRef}
          variant="outlined"
          size="small"
          onClick={handleOpen}
          endIcon={<ArrowDownIcon sx={{ fontSize: { xs: 16, sm: 20 } }} />}
          sx={{
            textTransform: "none",
            minWidth: { xs: 80, sm: 240 },
            justifyContent: "space-between",
            px: { xs: 0.75, sm: 1.5 },
            py: { xs: 0.25, sm: 0.5 },
            bgcolor: "background.paper",
            borderColor: "divider",
            color: "text.primary",
            fontSize: { xs: "0.7rem", sm: "0.875rem" },
            "& .MuiButton-endIcon": {
              ml: { xs: 0.25, sm: 1 },
            },
            "&:hover": {
              bgcolor: "action.hover",
              borderColor: "divider",
            },
          }}
        >
          <Typography
            variant="body2"
            noWrap
            sx={{ fontSize: { xs: "0.7rem", sm: "0.875rem" } }}
          >
            {currentLabel}
          </Typography>
        </Button>

        {/* Next arrow - Hidden on mobile */}
        <IconButton
          size="small"
          onClick={() => stepForward(minDate ?? null)}
          disabled={isNextDisabled}
          sx={{ p: 0.5, display: { xs: "none", sm: "flex" } }}
        >
          <ChevronRightIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Popover with presets and calendar.
          `container` defaults to document.body. When a page registers a
          pickerContainer (e.g. attendance-content while fullscreened), the
          popover renders inside that subtree so it remains visible inside the
          fullscreened element — the native Fullscreen API only paints
          descendants of the fullscreened element. */}
      <Popover
        open={open}
        anchorEl={anchorEl}
        container={pickerContainer ?? undefined}
        onClose={() => {
          handleClose();
          onPopoverClose?.();
        }}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        PaperProps={{
          sx: {
            mt: 1,
            maxWidth: { xs: "95vw", sm: "auto" },
            maxHeight: { xs: "85vh", sm: "auto" },
            overflow: "hidden",
          },
        }}
      >
        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            minWidth: { xs: "auto", sm: 780 },
          }}
        >
          {/* Mobile: Horizontal preset chips */}
          <Box
            sx={{
              display: { xs: "flex", sm: "none" },
              overflowX: "auto",
              gap: 0.5,
              p: 1,
              borderBottom: 1,
              borderColor: "divider",
              WebkitOverflowScrolling: "touch",
              "&::-webkit-scrollbar": { display: "none" },
              scrollbarWidth: "none",
            }}
          >
            {dynamicPresets.map((preset) => (
              <Chip
                key={preset.key}
                label={preset.label}
                size="small"
                variant={selectedPreset === preset.key ? "filled" : "outlined"}
                color={selectedPreset === preset.key ? "primary" : "default"}
                onClick={() => handlePresetClick(preset)}
                sx={{ flexShrink: 0, fontSize: "0.7rem", height: 26 }}
              />
            ))}
          </Box>

          {/* Desktop: Grouped presets */}
          <Box
            sx={{
              display: { xs: "none", sm: "block" },
              width: 200,
              borderRight: 1,
              borderColor: "divider",
              maxHeight: 460,
              overflow: "auto",
              py: 1,
            }}
          >
            {(["quick", "rolling", "previous"] as PresetGroup[]).map((group) => (
              <Box key={group} sx={{ mb: 1.5 }}>
                <Typography
                  variant="caption"
                  sx={{
                    px: 2,
                    pt: 0.5,
                    display: "block",
                    color: "text.secondary",
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    fontWeight: 600,
                    fontSize: "0.65rem",
                  }}
                >
                  {PRESET_GROUP_LABELS[group]}
                </Typography>
                <List dense disablePadding>
                  {dynamicPresets
                    .filter((p) => p.group === group)
                    .map((preset) => (
                      <ListItemButton
                        key={preset.key}
                        selected={selectedPreset === preset.key}
                        onClick={() => handlePresetClick(preset)}
                        sx={{
                          py: 0.75,
                          "&.Mui-selected": {
                            bgcolor: "primary.50",
                            color: "primary.main",
                            "&:hover": { bgcolor: "primary.100" },
                          },
                        }}
                      >
                        <ListItemText
                          primary={preset.label}
                          primaryTypographyProps={{
                            fontSize: "0.8rem",
                            fontWeight: selectedPreset === preset.key ? 600 : 400,
                          }}
                        />
                      </ListItemButton>
                    ))}
                </List>
              </Box>
            ))}

            <Divider sx={{ my: 1 }} />

            {/* Special: All Time */}
            {dynamicPresets
              .filter((p) => p.group === "special")
              .map((preset) => (
                <ListItemButton
                  key={preset.key}
                  selected={selectedPreset === preset.key}
                  onClick={() => handlePresetClick(preset)}
                  sx={{
                    py: 1,
                    mx: 1,
                    borderRadius: 1,
                    bgcolor:
                      selectedPreset === preset.key ? "primary.50" : "transparent",
                  }}
                >
                  <Typography
                    component="span"
                    sx={{ mr: 1, fontSize: "0.9rem" }}
                    aria-hidden
                  >
                    ★
                  </Typography>
                  <ListItemText
                    primary={preset.label}
                    primaryTypographyProps={{
                      fontSize: "0.85rem",
                      fontWeight: 600,
                    }}
                  />
                </ListItemButton>
              ))}
          </Box>

          {/* Calendar panel */}
          <Box sx={{ p: { xs: 0.5, sm: 2 }, overflow: "auto" }}>
            {/* Typed date inputs — desktop only */}
            <Box
              sx={{
                display: { xs: "none", sm: "flex" },
                alignItems: "center",
                gap: 1,
                mb: 1.5,
              }}
            >
              <TextField
                size="small"
                label="Start"
                value={typedStart}
                onChange={(e) => setTypedStart(e.target.value)}
                onBlur={() => commitTypedDate("start", typedStart)}
                sx={{
                  width: 160,
                  "& .MuiOutlinedInput-root": clickStage === "start"
                    ? { "& fieldset": { borderColor: "primary.main", borderWidth: 2 } }
                    : {},
                }}
                inputProps={{ "aria-label": "Start date" }}
              />
              <Typography sx={{ color: "text.secondary" }}>→</Typography>
              <TextField
                size="small"
                label="End"
                value={typedEnd}
                onChange={(e) => setTypedEnd(e.target.value)}
                onBlur={() => commitTypedDate("end", typedEnd)}
                sx={{
                  width: 160,
                  "& .MuiOutlinedInput-root": clickStage === "end"
                    ? { "& fieldset": { borderColor: "primary.main", borderWidth: 2 } }
                    : {},
                }}
                inputProps={{ "aria-label": "End date" }}
              />
            </Box>

            <DateRange
              key={pickerKey}
              ranges={tempRange}
              onChange={handleRangeChange}
              months={isMobile ? 1 : 2}
              direction="horizontal"
              maxDate={maxDate}
              minDate={minDate}
              rangeColors={["#1976d2"]}
              showDateDisplay={false}
              editableDateInputs={false}
              moveRangeOnFirstSelection={false}
            />

            <Typography
              variant="caption"
              sx={{
                display: { xs: "none", sm: "block" },
                mt: 0.5,
                color: "text.secondary",
              }}
            >
              {clickStage === "start"
                ? "Click a start date, then an end date."
                : "Now pick the end date."}
            </Typography>
          </Box>
        </Box>

        {/* Desktop actions */}
        <Box sx={{ display: { xs: "none", sm: "block" } }}>
          <Divider />
          <Box
            sx={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 1,
              p: 1.5,
            }}
          >
            <Button size="small" onClick={() => { handleClose(); onPopoverClose?.(); }}>
              Cancel
            </Button>
            <Button size="small" variant="contained" onClick={handleApply}>
              Apply
            </Button>
          </Box>
        </Box>

        {/* Mobile actions */}
        <Box
          sx={{
            display: { xs: "flex", sm: "none" },
            justifyContent: "space-between",
            alignItems: "center",
            gap: 1,
            p: 1,
            borderTop: 1,
            borderColor: "divider",
          }}
        >
          <Typography variant="caption" color="text.secondary">
            Tap preset to quick-apply
          </Typography>
          <Box sx={{ display: "flex", gap: 0.5 }}>
            <Button
              size="small"
              onClick={() => { handleClose(); onPopoverClose?.(); }}
              sx={{ minWidth: 60, py: 0.25 }}
            >
              Close
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={handleApply}
              sx={{ minWidth: 60, py: 0.25 }}
            >
              Apply
            </Button>
          </Box>
        </Box>
      </Popover>
    </Box>
  );
}
