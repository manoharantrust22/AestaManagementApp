"use client";

import { useRouter } from "next/navigation";
import { Box, Button, CircularProgress, Paper, Stack, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import type { AssistantActionCard } from "@/lib/assistant/types";

const TOOL_LABEL: Record<string, string> = {
  create_task: "New task",
  update_task_status: "Task status",
  add_task_comment: "Task update",
  create_bug_report: "Problem report",
  record_staff_payment: "Staff payment",
};

interface Props {
  action: AssistantActionCard;
  onDecide: (decision: "confirm" | "cancel") => void;
  onNavigate?: () => void;
}

export default function ConfirmActionCard({ action, onDecide, onNavigate }: Props) {
  const router = useRouter();
  const busy = action.status === "executing";

  return (
    <Paper variant="outlined" sx={{ p: 1.25, mt: 1, bgcolor: "background.paper", borderRadius: 1.5 }}>
      <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1.6 }}>
        {TOOL_LABEL[action.tool] ?? action.tool}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 500, whiteSpace: "pre-wrap" }}>
        {action.summary}
      </Typography>

      {action.status === "proposed" || busy ? (
        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          <Button
            size="small"
            variant="contained"
            startIcon={busy ? <CircularProgress size={14} color="inherit" /> : <CheckIcon />}
            disabled={busy}
            onClick={() => onDecide("confirm")}
            sx={{ flex: 1 }}
          >
            Confirm
          </Button>
          <Button size="small" startIcon={<CloseIcon />} disabled={busy} onClick={() => onDecide("cancel")}>
            Cancel
          </Button>
        </Stack>
      ) : action.status === "executed" ? (
        <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mt: 0.75, color: "success.main" }}>
          <TaskAltIcon fontSize="small" />
          <Typography variant="body2" sx={{ flex: 1 }}>
            {action.resultMessage ?? "Done"}
          </Typography>
          {action.url && (
            <Button
              size="small"
              onClick={() => {
                router.push(action.url!);
                onNavigate?.();
              }}
            >
              Open
            </Button>
          )}
        </Stack>
      ) : action.status === "cancelled" ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
          Cancelled
        </Typography>
      ) : (
        <Box sx={{ mt: 0.75 }}>
          <Stack direction="row" alignItems="center" spacing={0.75} sx={{ color: "error.main" }}>
            <ErrorOutlineIcon fontSize="small" />
            <Typography variant="body2">{action.error ?? "Failed"}</Typography>
          </Stack>
        </Box>
      )}
    </Paper>
  );
}
