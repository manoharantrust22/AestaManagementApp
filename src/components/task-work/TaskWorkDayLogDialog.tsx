"use client";

import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import dayjs from "dayjs";
import { useUpsertTaskWorkDayLog } from "@/hooks/queries/useTaskWorkDayLogs";
import type { TaskWorkDayLog } from "@/types/taskWork.types";

interface Props {
  open: boolean;
  onClose: () => void;
  packageId: string;
  siteId: string;
  editing?: TaskWorkDayLog | null;
}

/**
 * Log a single day's crew headcount against a package. This is effort capture
 * for profitability only — these workers are NOT paid here (the maistry pays his
 * own crew from the lump sum). One row per date; re-logging a date overwrites.
 */
export default function TaskWorkDayLogDialog({
  open,
  onClose,
  packageId,
  siteId,
  editing,
}: Props) {
  const [logDate, setLogDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [workerCount, setWorkerCount] = useState<number>(0);
  const [workerNote, setWorkerNote] = useState("");
  const [useFractional, setUseFractional] = useState(false);
  const [manDays, setManDays] = useState<number>(0);
  const [error, setError] = useState("");

  const upsertMut = useUpsertTaskWorkDayLog();

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setLogDate(editing.log_date);
      setWorkerCount(editing.worker_count);
      setWorkerNote(editing.worker_note ?? "");
      const fractional = editing.man_days !== editing.worker_count;
      setUseFractional(fractional);
      setManDays(editing.man_days);
    } else {
      setLogDate(dayjs().format("YYYY-MM-DD"));
      setWorkerCount(0);
      setWorkerNote("");
      setUseFractional(false);
      setManDays(0);
    }
    setError("");
  }, [open, editing]);

  const handleSubmit = async () => {
    if (!logDate) {
      setError("Pick a date.");
      return;
    }
    if (workerCount <= 0) {
      setError("Enter how many workers were present.");
      return;
    }
    try {
      await upsertMut.mutateAsync({
        package_id: packageId,
        site_id: siteId,
        log_date: logDate,
        worker_count: workerCount,
        worker_note: workerNote.trim() || null,
        man_days: useFractional && manDays > 0 ? manDays : null,
      });
      onClose();
    } catch (e: any) {
      setError(e?.message || "Failed to save the day log.");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
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
          <TextField
            label="Workers present"
            type="number"
            value={workerCount || ""}
            onChange={(e) => {
              const n = Number(e.target.value);
              setWorkerCount(n);
              if (!useFractional) setManDays(n);
            }}
            fullWidth
            autoFocus
          />
          <TextField
            label="Note (optional)"
            placeholder="e.g. 1 mason + 5 helpers"
            value={workerNote}
            onChange={(e) => setWorkerNote(e.target.value)}
            fullWidth
          />
          <FormControlLabel
            control={
              <Switch
                checked={useFractional}
                onChange={(e) => {
                  setUseFractional(e.target.checked);
                  if (!e.target.checked) setManDays(workerCount);
                }}
              />
            }
            label={
              <Typography variant="body2">
                Adjust man-days (half-days etc.)
              </Typography>
            }
          />
          <Collapse in={useFractional}>
            <TextField
              label="Man-days"
              type="number"
              value={manDays || ""}
              onChange={(e) => setManDays(Number(e.target.value))}
              fullWidth
              helperText="Defaults to the worker count; override for part-days"
            />
          </Collapse>

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
