"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Divider,
  Popover,
  Stack,
  Typography,
} from "@mui/material";
import PlayCircleIcon from "@mui/icons-material/PlayCircleFilledWhite";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/cache/keys";
import { neramApi, NeramTaskError } from "@/lib/neram-hub/browser";
import type { HubRunningTask } from "@/lib/neram-hub/types";
import { clockOffsetMs, elapsedMs, formatElapsed, spokenElapsed } from "@/lib/tasks/elapsed";
import { NewTaskFromPageButton } from "./NewTaskFromPage";

const REFRESH_MS = 60_000;
const TICK_MS = 15_000;

const focusRing = {
  "&.Mui-focusVisible, &:focus-visible": {
    outline: "2px solid",
    outlineColor: "primary.main",
    outlineOffset: 2,
  },
} as const;

/** Ticking elapsed time. Not announced (aria-live off); the row's label says it once. */
function Elapsed({ ms }: { ms: number }) {
  return (
    <Box component="span" aria-live="off" sx={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
      {formatElapsed(ms)}
    </Box>
  );
}

function RunningRow({
  task,
  ms,
  onDone,
  onOpen,
  onStillOn,
  busy,
}: {
  task: HubRunningTask;
  ms: number;
  onDone: () => void;
  onOpen: () => void;
  onStillOn: () => void;
  busy: boolean;
}) {
  return (
    <Box sx={{ py: 1 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, wordBreak: "break-word" }}>
        {task.title}
      </Typography>
      <Typography variant="caption" color="text.secondary" component="div">
        Running for <Elapsed ms={ms} />
        {task.page?.siteName ? ` · ${task.page.siteName}` : ""}
      </Typography>
      {task.stale && (
        <Alert severity="warning" icon={false} sx={{ mt: 1, py: 0.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Still on this?
          </Typography>
          <Typography variant="caption" component="div">
            It has been running since an earlier day.
          </Typography>
          <Button size="small" variant="outlined" color="inherit" onClick={onStillOn} disabled={busy} sx={{ mt: 0.75, minHeight: 44, ...focusRing }}>
            Yes, still on it
          </Button>
        </Alert>
      )}
      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
        <Button
          variant="contained"
          color="success"
          startIcon={<CheckCircleIcon />}
          onClick={onDone}
          disabled={busy}
          sx={{ flex: 1, minHeight: 44, ...focusRing }}
        >
          Done
        </Button>
        <Button variant="outlined" startIcon={<OpenInNewIcon />} onClick={onOpen} sx={{ flex: 1, minHeight: 44, ...focusRing }}>
          Open
        </Button>
      </Stack>
    </Box>
  );
}

/** The signed-in person's running hub tasks (shared by the chip and the AppBar layout). */
export function useRunningTasks() {
  const { userProfile } = useAuth();
  const userId = userProfile?.id;
  return useQuery({
    queryKey: [...queryKeys.tasks.all, "running", userId ?? "anon"],
    enabled: !!userId,
    queryFn: () => neramApi.running(),
    refetchInterval: REFRESH_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
    retry: (count, err) => !(err instanceof NeramTaskError && err.status >= 400 && err.status < 500) && count < 2,
  });
}

/**
 * Beside the bell: the task(s) the signed-in person is running now, from the
 * hub's running route. One running → its title and time; several → a count
 * that opens the list. Hidden when nothing runs or the account isn't linked.
 * Below 1536px it is a 48×44 tile (icon over time): the AppBar has no room
 * for the title there, which stays in the label and the popover.
 */
export default function RunningTasksChip() {
  const router = useRouter();
  const qc = useQueryClient();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [clientNow, setClientNow] = useState(() => Date.now());

  const { data, dataUpdatedAt } = useRunningTasks();

  // The hub's clock minus ours, taken when the answer arrived.
  const offset = useMemo(
    () => (data ? clockOffsetMs(data.now, dataUpdatedAt || Date.now()) : 0),
    [data, dataUpdatedAt],
  );

  useEffect(() => {
    const t = window.setInterval(() => setClientNow(Date.now()), TICK_MS);
    return () => window.clearInterval(t);
  }, []);

  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "done" | "still_on" }) => neramApi.action(id, { action }),
    onSuccess: () => {
      setMessage(null);
      qc.invalidateQueries({ queryKey: queryKeys.tasks.all });
    },
    onError: (err) => setMessage(err instanceof Error ? err.message : "Could not update the task"),
  });

  const running = data?.running ?? [];
  if (!running.length) return null;

  const first = running[0];
  const firstMs = elapsedMs(first.startedAt, clientNow, offset);
  const several = running.length > 1;
  const anyStale = running.some((r) => r.stale);
  const label = several
    ? `${running.length} tasks running${anyStale ? ", one needs a check" : ""}. Open the list.`
    : `Running: ${first.title}, for ${spokenElapsed(firstMs)}${first.stale ? ". Still on this?" : ""}. Open.`;

  const open = (id: string) => {
    setAnchor(null);
    router.push(`/tasks?id=${encodeURIComponent(id)}`);
  };

  return (
    <>
      <ButtonBase
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={!!anchor}
        onClick={(e) => {
          setMessage(null);
          setAnchor(e.currentTarget);
        }}
        data-testid="running-tasks-chip"
        sx={{
          height: 44,
          width: { xs: 48, xl: "auto" },
          minWidth: 44,
          px: { xs: 0.25, xl: 1.25 },
          gap: { xs: 0, xl: 0.75 },
          flexDirection: { xs: "column", xl: "row" },
          borderRadius: { xs: 2, xl: 22 },
          // White on these passes 4.5:1 for small text (warning.main does not).
          bgcolor: anyStale ? "#b45309" : "success.main",
          color: "#fff",
          "&:hover": { bgcolor: anyStale ? "#92400e" : "success.dark" },
          fontWeight: 600,
          fontSize: { xs: "0.6875rem", xl: "0.8125rem" },
          lineHeight: 1.1,
          maxWidth: { xl: 300 },
          flexShrink: 0,
          ...focusRing,
        }}
      >
        <PlayCircleIcon aria-hidden sx={{ fontSize: { xs: 18, xl: 20 } }} />
        {several ? (
          <Box component="span" sx={{ whiteSpace: "nowrap" }}>
            {running.length}
            <Box component="span" sx={{ display: { xs: "none", xl: "inline" } }}> running</Box>
          </Box>
        ) : (
          <>
            <Box
              component="span"
              sx={{ display: { xs: "none", xl: "inline" }, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}
            >
              {first.title}
            </Box>
            <Elapsed ms={firstMs} />
          </>
        )}
      </ButtonBase>

      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: {
            role: "dialog",
            "aria-label": several ? "Running tasks" : "Running task",
            sx: { width: 340, maxWidth: "calc(100vw - 32px)", p: 1.5 },
          } as object,
        }}
      >
        <Typography variant="overline" color="text.secondary">
          {several ? `${running.length} running` : "Running now"}
        </Typography>
        {message && (
          <Alert severity="warning" sx={{ my: 1 }} onClose={() => setMessage(null)}>
            {message}
          </Alert>
        )}
        {running.map((task, i) => (
          <Box key={task.id}>
            {i > 0 && <Divider />}
            <RunningRow
              task={task}
              ms={elapsedMs(task.startedAt, clientNow, offset)}
              busy={act.isPending}
              onDone={() => act.mutate({ id: task.id, action: "done" })}
              onStillOn={() => act.mutate({ id: task.id, action: "still_on" })}
              onOpen={() => open(task.id)}
            />
          </Box>
        ))}
      </Popover>
    </>
  );
}

/**
 * The AppBar's task-hub corner: running chip, then "New task from this page".
 * Below 1536px a running task's tile takes the button's place (the AppBar has
 * no room for both there); the button is always in the profile menu.
 */
export function TaskHubBarItems() {
  const { data } = useRunningTasks();
  const hasRunning = (data?.running?.length ?? 0) > 0;
  return (
    <>
      <RunningTasksChip />
      <Box sx={{ display: { xs: "none", sm: hasRunning ? "none" : "flex", xl: "flex" } }}>
        <NewTaskFromPageButton />
      </Box>
    </>
  );
}
