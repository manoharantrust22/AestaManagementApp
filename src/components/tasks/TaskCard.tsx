"use client";

import { Box, Card, CardActionArea, Chip, Stack, Typography } from "@mui/material";
import BugReportIcon from "@mui/icons-material/BugReportOutlined";
import BlockIcon from "@mui/icons-material/Block";
import dayjs from "dayjs";
import { PRIORITY_META, SIZE_META, STATUS_META, type Task } from "@/types/task.types";

const PRIORITY_BAR: Record<Task["priority"], string> = {
  high: "error.main",
  medium: "warning.main",
  low: "grey.400",
};

export function dueLabel(due: string | null, status: Task["status"]): { text: string; overdue: boolean } | null {
  if (!due) return null;
  const today = dayjs().startOf("day");
  const d = dayjs(due);
  const diff = d.diff(today, "day");
  const open = status !== "done" && status !== "cancelled";
  if (diff === 0) return { text: "Today", overdue: false };
  if (diff === 1) return { text: "Tomorrow", overdue: false };
  if (diff < 0) return { text: open ? `${-diff}d overdue` : d.format("DD MMM"), overdue: open };
  return { text: d.format("DD MMM"), overdue: false };
}

export function TaskMetaChips({ task }: { task: Task }) {
  const due = dueLabel(task.due_date, task.status);
  const size = "small" as const;
  return (
    <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
      <Chip size={size} label={PRIORITY_META[task.priority].label} color={PRIORITY_META[task.priority].color} variant={task.priority === "low" ? "outlined" : "filled"} />
      <Chip size={size} label={SIZE_META[task.size].label} variant="outlined" />
      {task.status !== "todo" && (
        <Chip size={size} label={STATUS_META[task.status].label} color={STATUS_META[task.status].color} variant="outlined" />
      )}
      {due && <Chip size={size} label={due.text} color={due.overdue ? "error" : "default"} variant="outlined" />}
    </Stack>
  );
}

interface TaskCardProps {
  task: Task;
  onClick: (task: Task) => void;
  /** Which person to show: the assignee (for "assigned by me") or the creator. */
  showPerson?: "assignee" | "creator" | "both";
}

export default function TaskCard({ task, onClick, showPerson = "creator" }: TaskCardProps) {
  const done = task.status === "done" || task.status === "cancelled";
  const person =
    showPerson === "assignee"
      ? `→ ${task.assignee?.name ?? "?"}`
      : showPerson === "both"
        ? `${task.creator?.name ?? "?"} → ${task.assignee?.name ?? "?"}`
        : task.created_by === task.assignee_id
          ? "Self"
          : `From ${task.creator?.name ?? "?"}`;

  return (
    <Card variant="outlined" sx={{ position: "relative", overflow: "hidden", opacity: done ? 0.65 : 1 }}>
      <Box sx={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, bgcolor: PRIORITY_BAR[task.priority] }} />
      <CardActionArea onClick={() => onClick(task)} sx={{ p: 1.5, pl: 2 }}>
        <Stack direction="row" spacing={1} alignItems="flex-start">
          {task.source === "bug_report" && <BugReportIcon fontSize="small" color="action" sx={{ mt: 0.25 }} />}
          <Typography
            variant="subtitle2"
            sx={{ flex: 1, fontWeight: 600, textDecoration: task.status === "done" ? "line-through" : "none", wordBreak: "break-word" }}
          >
            {task.title}
          </Typography>
        </Stack>
        {task.status === "blocked" && task.blocker_note && (
          <Stack direction="row" spacing={0.5} alignItems="flex-start" sx={{ mt: 0.5, color: "error.main" }}>
            <BlockIcon sx={{ fontSize: 16, mt: "2px" }} />
            <Typography variant="caption" sx={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {task.blocker_note}
            </Typography>
          </Stack>
        )}
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ mt: 1 }}>
          <TaskMetaChips task={task} />
          <Typography variant="caption" color="text.secondary" noWrap sx={{ flexShrink: 0, maxWidth: "45%" }}>
            {person}
            {task.site?.name ? ` · ${task.site.name}` : ""}
          </Typography>
        </Stack>
      </CardActionArea>
    </Card>
  );
}
