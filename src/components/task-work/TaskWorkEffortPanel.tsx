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
import { Add, Delete, Edit } from "@mui/icons-material";
import dayjs from "dayjs";
import {
  useTaskWorkDayLogs,
  useDeleteTaskWorkDayLog,
} from "@/hooks/queries/useTaskWorkDayLogs";
import type { TaskWorkDayLog } from "@/types/taskWork.types";
import TaskWorkDayLogDialog from "./TaskWorkDayLogDialog";

interface Props {
  packageId: string;
  siteId: string;
  canEdit: boolean;
}

/**
 * Daily headcount log + running man-day totals for a package. This is the raw
 * material for the profitability numbers — it is effort tracking, not payroll.
 */
export default function TaskWorkEffortPanel({ packageId, siteId, canEdit }: Props) {
  const { data: logs = [], isLoading } = useTaskWorkDayLogs(packageId);
  const deleteMut = useDeleteTaskWorkDayLog();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TaskWorkDayLog | null>(null);

  const totals = useMemo(() => {
    const manDays = logs.reduce((s, l) => s + (l.man_days || 0), 0);
    return { manDays, days: logs.length };
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
          <Box sx={{ textAlign: "right" }}>
            <Typography variant="caption" color="text.secondary">
              Working days
            </Typography>
            <Typography variant="h6" fontWeight={700}>
              {totals.days}
            </Typography>
          </Box>
        </Box>
      </Paper>

      {canEdit && (
        <Button
          fullWidth
          variant="outlined"
          size="small"
          startIcon={<Add />}
          onClick={openNew}
          sx={{ mb: 1 }}
        >
          Log a day
        </Button>
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
          {logs.map((l) => (
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
                  <Typography variant="body2" fontWeight={600}>
                    {dayjs(l.log_date).format("ddd, DD MMM")} ·{" "}
                    {l.worker_count} workers
                    {l.man_days !== l.worker_count
                      ? ` (${l.man_days} man-days)`
                      : ""}
                  </Typography>
                }
                secondary={l.worker_note || undefined}
              />
            </ListItem>
          ))}
        </List>
      )}

      <TaskWorkDayLogDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        packageId={packageId}
        siteId={siteId}
        editing={editing}
      />
    </Box>
  );
}
