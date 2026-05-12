"use client";

import React, { useState } from "react";
import {
  Box, Typography, Button, TextField, SwipeableDrawer,
  ToggleButton, ToggleButtonGroup,
} from "@mui/material";
import { format, subDays, startOfMonth, startOfWeek, endOfWeek } from "date-fns";
import { allocateFIFO, type ConsolidatedStockItem } from "@/lib/utils/fifoAllocator";
import { useCreateMaterialUsageFIFO } from "@/hooks/queries/useMaterialUsage";

export type DatePreset = "today" | "yesterday" | "this_week" | "last_week" | "this_month";

export function getDateRangeFromPreset(
  preset: DatePreset,
  anchor: Date = new Date(),
): { startDate: string; endDate: string | null } {
  const fmt = (d: Date) => format(d, "yyyy-MM-dd");

  switch (preset) {
    case "today":
      return { startDate: fmt(anchor), endDate: null };
    case "yesterday":
      return { startDate: fmt(subDays(anchor, 1)), endDate: null };
    case "this_week": {
      const sun = startOfWeek(anchor, { weekStartsOn: 0 });
      return { startDate: fmt(sun), endDate: fmt(anchor) };
    }
    case "last_week": {
      const lastSun = startOfWeek(subDays(anchor, 7), { weekStartsOn: 0 });
      const lastSat = endOfWeek(subDays(anchor, 7), { weekStartsOn: 0 });
      return { startDate: fmt(lastSun), endDate: fmt(lastSat) };
    }
    case "this_month":
      return { startDate: fmt(startOfMonth(anchor)), endDate: fmt(anchor) };
  }
}

const PRESET_LABELS: Record<DatePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  this_week: "This week",
  last_week: "Last week",
  this_month: "This month",
};

interface Props {
  open: boolean;
  item: ConsolidatedStockItem | null;
  siteId: string;
  onClose: () => void;
  onSaved: () => void;
}

export function QuickUsageSheet({ open, item, siteId, onClose, onSaved }: Props) {
  const [qty, setQty] = useState<string>("");
  const [preset, setPreset] = useState<DatePreset>("today");
  const [note, setNote] = useState("");

  const createUsageFIFO = useCreateMaterialUsageFIFO();

  function handleClose() {
    setQty("");
    setPreset("today");
    setNote("");
    onClose();
  }

  async function handleSave() {
    if (!item || !qty || parseFloat(qty) <= 0) return;
    const quantity = parseFloat(qty);
    const allocations = allocateFIFO(item.batches, quantity, siteId);
    if (allocations.length === 0) return;

    const { startDate, endDate } = getDateRangeFromPreset(preset);
    await createUsageFIFO.mutateAsync({
      siteId,
      usageDate: startDate,
      usageDateEnd: endDate ?? undefined,
      workDescription: note || undefined,
      allocations,
    });
    onSaved();
    handleClose();
  }

  const { startDate, endDate } = getDateRangeFromPreset(preset);
  const dateLabel = endDate ? `${startDate} → ${endDate}` : startDate;

  return (
    <SwipeableDrawer
      anchor="bottom"
      open={open}
      onClose={handleClose}
      onOpen={() => {}}
      PaperProps={{ sx: { borderRadius: "18px 18px 0 0", maxWidth: 520, mx: "auto" } }}
      disableSwipeToOpen
    >
      <Box sx={{ p: 2 }}>
        {/* Handle */}
        <Box sx={{ width: 36, height: 4, bgcolor: "#e0e0e0", borderRadius: 1, mx: "auto", mb: 2 }} />

        <Typography variant="subtitle1" fontWeight={800} mb={2}>
          Record Usage{item ? ` — ${item.material_name}` : ""}
        </Typography>

        {/* Quantity */}
        <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
          Quantity Used
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5, mb: 2 }}>
          <TextField
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            type="number"
            inputProps={{ min: 0, step: 0.5, style: { fontSize: 24, fontWeight: 800, textAlign: "center" } }}
            sx={{ flex: 1, "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
            placeholder="0"
            autoFocus
          />
          <Typography variant="body1" color="text.secondary" fontWeight={600}>
            {item?.unit ?? ""}
          </Typography>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            <Button
              size="small"
              variant="outlined"
              onClick={() => setQty((v) => String(Math.max(0, (parseFloat(v) || 0) + 1)))}
              sx={{ minWidth: 36, px: 0, py: 0.5 }}
            >+</Button>
            <Button
              size="small"
              variant="outlined"
              onClick={() => setQty((v) => String(Math.max(0, (parseFloat(v) || 0) - 1)))}
              sx={{ minWidth: 36, px: 0, py: 0.5 }}
            >−</Button>
          </Box>
        </Box>

        {/* Date presets */}
        <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
          When was it used?
        </Typography>
        <ToggleButtonGroup
          value={preset}
          exclusive
          onChange={(_, v) => v && setPreset(v as DatePreset)}
          sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0.5, mt: 0.5, mb: 0.5, "& .MuiToggleButton-root": { borderRadius: 1.5, border: "1.5px solid #e0e0e0", fontSize: 11, py: 0.75 } }}
        >
          {(Object.keys(PRESET_LABELS) as DatePreset[]).map((p) => (
            <ToggleButton key={p} value={p}>{PRESET_LABELS[p]}</ToggleButton>
          ))}
        </ToggleButtonGroup>
        <Typography variant="caption" color="primary" fontWeight={600} mb={1.5} display="block">
          {dateLabel}
        </Typography>

        {/* Note */}
        <TextField
          fullWidth
          multiline
          rows={2}
          placeholder="Work note — e.g. Foundation slab, Block A (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          sx={{ mb: 2, "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
        />

        {/* Actions */}
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button fullWidth variant="outlined" onClick={handleClose} sx={{ borderRadius: 2 }}>
            Cancel
          </Button>
          <Button
            fullWidth
            variant="contained"
            onClick={handleSave}
            disabled={!qty || parseFloat(qty) <= 0 || createUsageFIFO.isPending}
            sx={{ flex: 2, borderRadius: 2, fontWeight: 700 }}
          >
            {createUsageFIFO.isPending ? "Saving…" : "✓ Save Usage"}
          </Button>
        </Box>
      </Box>
    </SwipeableDrawer>
  );
}
