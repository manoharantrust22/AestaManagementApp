"use client";

import React, { useMemo, useState } from "react";
import {
  Box,
  Button,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Paper,
  Typography,
} from "@mui/material";
import { Add, Delete, Edit, PlaylistAdd } from "@mui/icons-material";
import dayjs from "dayjs";
import {
  useTaskWorkDayLogs,
  useDeleteTaskWorkDayLog,
} from "@/hooks/queries/useTaskWorkDayLogs";
import {
  dayLogValue,
  sumDayLogValue,
  summarizeLines,
} from "@/lib/taskWork/dayLogCost";
import type { TaskWorkDayLog } from "@/types/taskWork.types";
import TaskWorkDayLogDialog from "./TaskWorkDayLogDialog";
import TaskWorkPullDaysDialog from "./TaskWorkPullDaysDialog";

interface Props {
  packageId: string;
  siteId: string;
  laborCategoryId: string | null;
  canEdit: boolean;
  /** Package title + money, for the "pull days" dialog's balance preview. */
  packageTitle: string;
  totalValue: number;
  alreadyPaid: number;
  /** Package start date, seeds the pull dialog's default range. */
  startDateHint?: string | null;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/**
 * Daily per-type log + running totals for a package. Each day carries a worker
 * breakdown (Mason ×2 @ ₹1000 …) whose value rolls up into "Labour value" — the
 * basis for the over/under-paid view. Effort + value tracking, not payroll.
 */
export default function TaskWorkEffortPanel({
  packageId,
  siteId,
  laborCategoryId,
  canEdit,
  packageTitle,
  totalValue,
  alreadyPaid,
  startDateHint,
}: Props) {
  const { data: logs = [], isLoading } = useTaskWorkDayLogs(packageId);
  const deleteMut = useDeleteTaskWorkDayLog();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pullOpen, setPullOpen] = useState(false);
  const [editing, setEditing] = useState<TaskWorkDayLog | null>(null);

  const totals = useMemo(() => {
    const manDays = logs.reduce((s, l) => s + (l.man_days || 0), 0);
    return { manDays, days: logs.length, value: sumDayLogValue(logs) };
  }, [logs]);

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (l: TaskWorkDayLog) => {
    setEditing(l);
    setDialogOpen(true);
  };

  return (
    <Box>
      <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, mb: 1.5 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between" }}>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Total man-days
            </Typography>
            <Typography variant="h6" fontWeight={700}>
              {totals.manDays}
            </Typography>
          </Box>
          <Box sx={{ textAlign: "center" }}>
            <Typography variant="caption" color="text.secondary">
              Working days
            </Typography>
            <Typography variant="h6" fontWeight={700}>
              {totals.days}
            </Typography>
          </Box>
          <Box sx={{ textAlign: "right" }}>
            <Typography variant="caption" color="text.secondary">
              Labour value
            </Typography>
            <Typography variant="h6" fontWeight={700} color="primary.main">
              {inr(totals.value)}
            </Typography>
          </Box>
        </Box>
      </Paper>

      {canEdit && (
        <Box sx={{ display: "flex", gap: 1, mb: 1 }}>
          <Button
            fullWidth
            variant="outlined"
            size="small"
            startIcon={<Add />}
            onClick={openNew}
          >
            Log a day
          </Button>
          {/* The fast path when the work was recorded as ordinary attendance first
              (including days already settled) — pull those days onto this package in
              one go instead of retagging each date in the attendance drawer. */}
          <Button
            fullWidth
            variant="outlined"
            size="small"
            startIcon={<PlaylistAdd />}
            onClick={() => setPullOpen(true)}
          >
            Pull days from attendance
          </Button>
        </Box>
      )}

      <Divider />

      {isLoading ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Loading…
        </Typography>
      ) : logs.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          No days logged yet. Add the daily headcount as the crew works so you
          can see whether the package paid off.
        </Typography>
      ) : (
        <List dense disablePadding>
          {logs.map((l) => {
            const breakdown = summarizeLines(l.worker_lines);
            const value = dayLogValue(l);
            const secondaryBits = [breakdown, l.worker_note]
              .filter(Boolean)
              .join(" — ");
            return (
              <ListItem
                key={l.id}
                disableGutters
                secondaryAction={
                  canEdit ? (
                    <Box>
                      <IconButton size="small" onClick={() => openEdit(l)}>
                        <Edit fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() =>
                          deleteMut.mutate({
                            id: l.id,
                            packageId,
                            siteId,
                          })
                        }
                      >
                        <Delete fontSize="small" />
                      </IconButton>
                    </Box>
                  ) : undefined
                }
              >
                <ListItemText
                  primary={
                    <Box
                      component="span"
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 1,
                        pr: canEdit ? 7 : 0,
                      }}
                    >
                      <Typography variant="body2" fontWeight={600} component="span">
                        {dayjs(l.log_date).format("ddd, DD MMM")} · {l.worker_count}{" "}
                        worker{l.worker_count === 1 ? "" : "s"}
                      </Typography>
                      {value > 0 && (
                        <Typography
                          variant="body2"
                          fontWeight={700}
                          color="primary.main"
                          component="span"
                        >
                          {inr(value)}
                        </Typography>
                      )}
                    </Box>
                  }
                  primaryTypographyProps={{ component: "div" }}
                  secondary={secondaryBits || undefined}
                />
              </ListItem>
            );
          })}
        </List>
      )}

      <TaskWorkDayLogDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        packageId={packageId}
        siteId={siteId}
        laborCategoryId={laborCategoryId}
        editing={editing}
      />

      <TaskWorkPullDaysDialog
        open={pullOpen}
        onClose={() => setPullOpen(false)}
        packageId={packageId}
        packageTitle={packageTitle}
        siteId={siteId}
        totalValue={totalValue}
        alreadyPaid={alreadyPaid}
        startDateHint={startDateHint}
      />
    </Box>
  );
}
