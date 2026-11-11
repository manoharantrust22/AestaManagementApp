"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Button, Card, CardContent, Skeleton, Stack, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ChecklistIcon from "@mui/icons-material/Checklist";
import { useMyTasksToday, useTasksRealtime } from "@/hooks/queries/useTasks";
import TaskCard from "./TaskCard";
import TaskDetailDrawer from "./TaskDetailDrawer";
import TaskCreateDialog from "./TaskCreateDialog";

/** "What do I have to do today?" — top of the site engineer's Today page. */
export default function MyTasksTodayCard({ maxItems = 5 }: { maxItems?: number }) {
  const router = useRouter();
  const { data: tasks = [], isLoading } = useMyTasksToday();
  useTasksRealtime();
  const [openId, setOpenId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const blocked = tasks.filter((t) => t.status === "blocked").length;
  const shown = tasks.slice(0, maxItems);

  return (
    <Card variant="outlined">
      <CardContent sx={{ pb: "12px !important" }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
          <ChecklistIcon color="primary" />
          <Typography variant="subtitle1" sx={{ fontWeight: 600, flex: 1 }}>
            My tasks today
            {tasks.length > 0 && (
              <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 0.75 }}>
                {tasks.length} open{blocked ? ` · ${blocked} blocked` : ""}
              </Typography>
            )}
          </Typography>
          <Button size="small" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
            New
          </Button>
        </Stack>

        {isLoading ? (
          <Stack spacing={1}>
            <Skeleton variant="rounded" height={64} />
            <Skeleton variant="rounded" height={64} />
          </Stack>
        ) : tasks.length === 0 ? (
          <Box sx={{ py: 1.5, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              Nothing pending for today 🎉
            </Typography>
          </Box>
        ) : (
          <Stack spacing={1}>
            {shown.map((t) => (
              <TaskCard key={t.id} task={t} onClick={(task) => setOpenId(task.id)} />
            ))}
          </Stack>
        )}

        <Button fullWidth size="small" sx={{ mt: 1 }} onClick={() => router.push("/tasks")}>
          {tasks.length > maxItems ? `See all ${tasks.length} tasks` : "Open tasks"}
        </Button>
      </CardContent>

      <TaskDetailDrawer taskId={openId} onClose={() => setOpenId(null)} />
      <TaskCreateDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </Card>
  );
}
