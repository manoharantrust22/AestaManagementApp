"use client";

import { Suspense, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Box,
  Chip,
  Fab,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useAuth } from "@/contexts/AuthContext";
import { useTasks, useTasksRealtime, type TaskScope } from "@/hooks/queries/useTasks";
import TaskCard from "@/components/tasks/TaskCard";
import TaskDetailDrawer from "@/components/tasks/TaskDetailDrawer";
import TaskCreateDialog from "@/components/tasks/TaskCreateDialog";
import { TASK_OPEN_STATUSES, type Task, type TaskStatus } from "@/types/task.types";

type StatusFilter = "open" | "blocked" | "done" | "bugs" | "all";

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: "open", label: "Open" },
  { key: "blocked", label: "Blocked" },
  { key: "done", label: "Done" },
  { key: "bugs", label: "Bug reports" },
  { key: "all", label: "All" },
];

function statusesFor(f: StatusFilter): TaskStatus[] | undefined {
  if (f === "open" || f === "bugs") return TASK_OPEN_STATUSES;
  if (f === "blocked") return ["blocked"];
  if (f === "done") return ["done", "cancelled"];
  return undefined;
}

function TasksPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === "admin";
  useTasksRealtime();

  const [scope, setScope] = useState<TaskScope>("mine");
  const [filter, setFilter] = useState<StatusFilter>("open");
  const [createOpen, setCreateOpen] = useState(false);

  const openId = params.get("id");
  const setOpenId = (id: string | null) => {
    const sp = new URLSearchParams(params.toString());
    if (id) sp.set("id", id);
    else sp.delete("id");
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const { data: tasks = [], isLoading } = useTasks(scope, {
    statuses: statusesFor(filter),
    sourceBugOnly: filter === "bugs",
  });

  const groups = useMemo(() => {
    if (scope !== "all") return null;
    const map = new Map<string, Task[]>();
    tasks.forEach((t) => {
      const k = t.assignee?.name ?? "Unknown";
      map.set(k, [...(map.get(k) ?? []), t]);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [scope, tasks]);

  const showPerson = scope === "mine" ? "creator" : scope === "assigned_by_me" ? "assignee" : "both";

  return (
    <Box sx={{ maxWidth: 760, mx: "auto", pb: 10 }}>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>
        Tasks
      </Typography>

      <Tabs value={scope} onChange={(_, v) => setScope(v)} variant="fullWidth" sx={{ mb: 1 }}>
        <Tab value="mine" label="My tasks" />
        <Tab value="assigned_by_me" label="I assigned" />
        {isAdmin && <Tab value="all" label="Team" />}
      </Tabs>

      <Stack direction="row" spacing={0.75} sx={{ mb: 1.5, overflowX: "auto", pb: 0.5 }}>
        {STATUS_FILTERS.map((f) => (
          <Chip
            key={f.key}
            label={f.label}
            onClick={() => setFilter(f.key)}
            color={filter === f.key ? "primary" : "default"}
            variant={filter === f.key ? "filled" : "outlined"}
            sx={{ flexShrink: 0 }}
          />
        ))}
      </Stack>

      {isLoading ? (
        <Stack spacing={1}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rounded" height={72} />
          ))}
        </Stack>
      ) : tasks.length === 0 ? (
        <Box sx={{ py: 6, textAlign: "center" }}>
          <Typography color="text.secondary">No tasks here.</Typography>
        </Box>
      ) : groups ? (
        <Stack spacing={2}>
          {groups.map(([name, list]) => (
            <Box key={name}>
              <Typography variant="overline" color="text.secondary">
                {name} · {list.length}
              </Typography>
              <Stack spacing={1}>
                {list.map((t) => (
                  <TaskCard key={t.id} task={t} onClick={(x) => setOpenId(x.id)} showPerson="creator" />
                ))}
              </Stack>
            </Box>
          ))}
        </Stack>
      ) : (
        <Stack spacing={1}>
          {tasks.map((t) => (
            <TaskCard key={t.id} task={t} onClick={(x) => setOpenId(x.id)} showPerson={showPerson} />
          ))}
        </Stack>
      )}

      <Fab
        color="primary"
        aria-label="New task"
        onClick={() => setCreateOpen(true)}
        sx={{ position: "fixed", right: 20, bottom: "calc(20px + env(safe-area-inset-bottom))" }}
      >
        <AddIcon />
      </Fab>

      <TaskCreateDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(t) => setOpenId(t.id)} />
      <TaskDetailDrawer taskId={openId} onClose={() => setOpenId(null)} />
    </Box>
  );
}

export default function TasksPage() {
  return (
    <Suspense fallback={null}>
      <TasksPageInner />
    </Suspense>
  );
}
