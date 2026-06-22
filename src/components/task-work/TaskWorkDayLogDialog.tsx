"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Add as AddIcon, DeleteOutline as DeleteIcon } from "@mui/icons-material";
import dayjs from "dayjs";
import { useUpsertTaskWorkDayLog } from "@/hooks/queries/useTaskWorkDayLogs";
import {
  useWorkerTypeOptions,
  type WorkerTypeOption,
} from "@/hooks/queries/useWorkerTypeOptions";
import type {
  DayWorkerLine,
  DayWorkerLineKind,
  TaskWorkDayLog,
} from "@/types/taskWork.types";

interface Props {
  open: boolean;
  onClose: () => void;
  packageId: string;
  siteId: string;
  /** Trade of the package — sources the role/laborer rate prefills. */
  laborCategoryId: string | null;
  editing?: TaskWorkDayLog | null;
}

interface DraftLine {
  kind: DayWorkerLineKind;
  ref_id: string | null;
  label: string;
  count: string;
  daily_rate: string;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const num = (s: string) => Math.max(0, Number(s) || 0);
const sanitize = (s: string) => s.replace(/[^0-9.]/g, "");

const emptyLine = (): DraftLine => ({
  kind: "custom",
  ref_id: null,
  label: "",
  count: "",
  daily_rate: "",
});

/**
 * Log a single day's crew as a per-type breakdown (Mason ×2 @ ₹1000, Helper ×2
 * @ ₹800). The day's labour VALUE = Σ(count × rate) is what lets the package
 * tell whether the maistry has been paid ahead of / behind the work done. This
 * is effort + value capture for profitability — the crew is NOT paid here (the
 * maistry pays his own crew from the lump sum). One row per date; re-logging a
 * date overwrites.
 */
export default function TaskWorkDayLogDialog({
  open,
  onClose,
  packageId,
  siteId,
  laborCategoryId,
  editing,
}: Props) {
  const [logDate, setLogDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [workerNote, setWorkerNote] = useState("");
  const [error, setError] = useState("");

  const upsertMut = useUpsertTaskWorkDayLog();
  const { data: options = [] } = useWorkerTypeOptions(laborCategoryId, open);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setLogDate(editing.log_date);
      setWorkerNote(editing.worker_note ?? "");
      const existing = editing.worker_lines ?? [];
      setLines(
        existing.length
          ? existing.map((l) => ({
              kind: l.kind,
              ref_id: l.ref_id,
              label: l.label,
              count: String(l.count || ""),
              daily_rate: String(l.daily_rate || ""),
            }))
          : [emptyLine()]
      );
    } else {
      setLogDate(dayjs().format("YYYY-MM-DD"));
      setWorkerNote("");
      setLines([emptyLine()]);
    }
    setError("");
  }, [open, editing]);

  const dayValue = useMemo(
    () => lines.reduce((s, l) => s + num(l.count) * num(l.daily_rate), 0),
    [lines]
  );
  const headcount = useMemo(
    () => lines.reduce((s, l) => s + num(l.count), 0),
    [lines]
  );

  const update = (i: number, patch: Partial<DraftLine>) =>
    setLines((d) => d.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const addLine = () => setLines((d) => [...d, emptyLine()]);
  const removeLine = (i: number) =>
    setLines((d) => (d.length === 1 ? [emptyLine()] : d.filter((_, idx) => idx !== i)));

  const handleSubmit = async () => {
    if (!logDate) {
      setError("Pick a date.");
      return;
    }
    const cleaned: DayWorkerLine[] = lines
      .filter((l) => l.label.trim() !== "" && num(l.count) > 0)
      .map((l) => ({
        kind: l.kind,
        ref_id: l.ref_id,
        label: l.label.trim(),
        count: num(l.count),
        daily_rate: num(l.daily_rate),
      }));
    if (cleaned.length === 0) {
      setError("Add at least one worker type with a count.");
      return;
    }
    try {
      await upsertMut.mutateAsync({
        package_id: packageId,
        site_id: siteId,
        log_date: logDate,
        worker_note: workerNote.trim() || null,
        worker_lines: cleaned,
      });
      onClose();
    } catch (e: any) {
      setError(e?.message || "Failed to save the day log.");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{editing ? "Edit day" : "Log a day"}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          <TextField
            label="Date"
            type="date"
            value={logDate}
            onChange={(e) => setLogDate(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            fullWidth
            disabled={!!editing}
          />

          <Box>
            <Typography variant="caption" color="text.secondary">
              Workers present (by type)
            </Typography>
            <Stack spacing={1} sx={{ mt: 0.5 }}>
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
                            daily_rate: opt.rate
                              ? String(opt.rate)
                              : row.daily_rate,
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
                        <TextField
                          {...params}
                          label="Worker type"
                          placeholder="Mason"
                        />
                      )}
                    />
                    <TextField
                      size="small"
                      label="Count"
                      value={row.count}
                      onChange={(e) =>
                        update(i, { count: sanitize(e.target.value) })
                      }
                      sx={{ width: 80 }}
                      helperText="0.5 = ½ day"
                    />
                    <TextField
                      size="small"
                      label="₹/day"
                      value={row.daily_rate}
                      onChange={(e) =>
                        update(i, { daily_rate: sanitize(e.target.value) })
                      }
                      sx={{ width: 100 }}
                    />
                    <Typography
                      variant="body2"
                      fontWeight={600}
                      sx={{ width: 90, textAlign: "right" }}
                    >
                      {inr(lineTotal)}
                    </Typography>
                    <IconButton size="small" onClick={() => removeLine(i)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                );
              })}
            </Stack>
            <Button size="small" startIcon={<AddIcon />} onClick={addLine} sx={{ mt: 1 }}>
              Add worker type
            </Button>
          </Box>

          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              p: 1.25,
              borderRadius: 1.5,
              bgcolor: "action.hover",
            }}
          >
            <Typography variant="body2" color="text.secondary">
              {headcount > 0 ? `${headcount} worker${headcount === 1 ? "" : "s"}` : "—"}
            </Typography>
            <Typography variant="subtitle2" fontWeight={700}>
              Day total {inr(dayValue)}
            </Typography>
          </Box>

          <TextField
            label="Note (optional)"
            placeholder="e.g. footing + lintel"
            value={workerNote}
            onChange={(e) => setWorkerNote(e.target.value)}
            fullWidth
          />

          {error && (
            <Alert severity="error" onClose={() => setError("")}>
              {error}
            </Alert>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={upsertMut.isPending}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
