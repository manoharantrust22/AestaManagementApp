"use client";

import React from "react";
import {
  Autocomplete,
  Box,
  Button,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Add as AddIcon, DeleteOutline as DeleteIcon } from "@mui/icons-material";
import {
  useWorkerTypeOptions,
  type WorkerTypeOption,
} from "@/hooks/queries/useWorkerTypeOptions";
import { estimateRollup } from "@/lib/taskWork/estimateLines";
import type { DayWorkerLine, DayWorkerLineKind } from "@/types/taskWork.types";

/** A row being edited — numbers stay as strings so the inputs can be blank. */
export interface DraftLine {
  kind: DayWorkerLineKind;
  ref_id: string | null;
  label: string;
  count: string;
  daily_rate: string;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const num = (s: string) => Math.max(0, Number(s) || 0);
const sanitize = (s: string) => s.replace(/[^0-9.]/g, "");

export const emptyDraftLine = (): DraftLine => ({
  kind: "custom",
  ref_id: null,
  label: "",
  count: "",
  daily_rate: "",
});

/** Saved breakdown → editable rows (for the edit dialog). */
export function draftFromLines(lines: DayWorkerLine[] | null | undefined): DraftLine[] {
  if (!lines?.length) return [emptyDraftLine()];
  return lines.map((l) => ({
    kind: l.kind,
    ref_id: l.ref_id,
    label: l.label,
    count: String(l.count || ""),
    daily_rate: String(l.daily_rate || ""),
  }));
}

/** Editable rows → persistable lines (drops blank rows). */
export function cleanDraftLines(lines: DraftLine[]): DayWorkerLine[] {
  return lines
    .filter((l) => l.label.trim() !== "" && num(l.count) > 0)
    .map((l) => ({
      kind: l.kind,
      ref_id: l.ref_id,
      label: l.label.trim(),
      count: num(l.count),
      daily_rate: num(l.daily_rate),
    }));
}

interface Props {
  lines: DraftLine[];
  onLinesChange: (next: DraftLine[]) => void;
  days: string;
  onDaysChange: (next: string) => void;
  /** Trade of the package — sources the role/laborer rate prefills. */
  laborCategoryId: string | null;
}

/**
 * Per-worker-type daywage estimate editor. A real crew is mixed (Mason @ ₹1000,
 * female helper @ ₹600, male helper @ ₹700), so the "basis for the price" is one
 * row per worker type (type + count + ₹/day) sharing a single Days value. The
 * benchmark = (Σ count × ₹/day) × days. A single-type estimate is just one row.
 */
export default function EstimateLinesEditor({
  lines,
  onLinesChange,
  days,
  onDaysChange,
  laborCategoryId,
}: Props) {
  const { data: options = [] } = useWorkerTypeOptions(laborCategoryId);

  const update = (i: number, patch: Partial<DraftLine>) =>
    onLinesChange(lines.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const addLine = () => onLinesChange([...lines, emptyDraftLine()]);
  const removeLine = (i: number) =>
    onLinesChange(
      lines.length === 1 ? [emptyDraftLine()] : lines.filter((_, idx) => idx !== i)
    );

  const cleaned = cleanDraftLines(lines);
  const roll = estimateRollup(cleaned, num(days));

  return (
    <Box>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1}
        alignItems={{ sm: "flex-start" }}
        sx={{ mb: 1 }}
      >
        <TextField
          label="Days"
          type="number"
          value={days}
          onChange={(e) => onDaysChange(sanitize(e.target.value))}
          sx={{ width: { xs: "100%", sm: 140 } }}
          helperText="Shared by the crew"
        />
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ pt: { sm: 1.5 } }}
        >
          Add a row per worker type — different daily wages are blended into the
          benchmark.
        </Typography>
      </Stack>

      <Stack spacing={1}>
        {lines.map((row, i) => {
          const lineTotal = num(row.count) * num(row.daily_rate);
          return (
            <Stack
              key={i}
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              alignItems={{ sm: "center" }}
            >
              <Autocomplete
                freeSolo
                size="small"
                sx={{ flex: 1, minWidth: 150 }}
                options={options}
                groupBy={(o) =>
                  typeof o === "string" ? "" : (o as WorkerTypeOption).group
                }
                getOptionLabel={(o) =>
                  typeof o === "string" ? o : (o as WorkerTypeOption).label
                }
                value={row.label}
                onInputChange={(_e, v, reason) => {
                  if (reason === "input")
                    update(i, { label: v, kind: "custom", ref_id: null });
                }}
                onChange={(_e, v) => {
                  if (v && typeof v !== "string") {
                    const opt = v as WorkerTypeOption;
                    update(i, {
                      kind: opt.kind,
                      ref_id: opt.id,
                      label: opt.label,
                      daily_rate: opt.rate ? String(opt.rate) : row.daily_rate,
                    });
                  } else {
                    update(i, {
                      label: (v as string) ?? "",
                      kind: "custom",
                      ref_id: null,
                    });
                  }
                }}
                slotProps={{ popper: { disablePortal: false } }}
                renderInput={(params) => (
                  <TextField {...params} label="Worker type" placeholder="Mason" />
                )}
              />
              <TextField
                size="small"
                label="Count"
                value={row.count}
                onChange={(e) => update(i, { count: sanitize(e.target.value) })}
                sx={{ width: { xs: "100%", sm: 80 } }}
              />
              <TextField
                size="small"
                label="₹/day"
                value={row.daily_rate}
                onChange={(e) =>
                  update(i, { daily_rate: sanitize(e.target.value) })
                }
                sx={{ width: { xs: "100%", sm: 100 } }}
              />
              <Typography
                variant="body2"
                fontWeight={600}
                sx={{ width: 90, textAlign: { xs: "left", sm: "right" } }}
              >
                {inr(lineTotal)}/day
              </Typography>
              <IconButton size="small" onClick={() => removeLine(i)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Stack>
          );
        })}
      </Stack>

      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mt: 1 }}
      >
        <Button size="small" startIcon={<AddIcon />} onClick={addLine}>
          Add worker type
        </Button>
        {roll.crewSize > 0 && (
          <Typography variant="caption" color="text.secondary">
            {roll.crewSize} worker{roll.crewSize === 1 ? "" : "s"}
            {roll.days > 0 ? ` × ${roll.days} days = ${roll.manDays} man-days` : ""}
          </Typography>
        )}
      </Stack>
    </Box>
  );
}
