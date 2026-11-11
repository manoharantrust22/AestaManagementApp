"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import BlockIcon from "@mui/icons-material/Block";
import ReplayIcon from "@mui/icons-material/Replay";
import SendIcon from "@mui/icons-material/Send";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import dayjs from "dayjs";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  useAddTaskUpdate,
  useEditTask,
  useTask,
  useTaskAttachments,
  useTaskUpdates,
  useUpdateTaskStatus,
  type TaskAttachmentWithUrl,
} from "@/hooks/queries/useTasks";
import VoiceRecorder, { type VoiceRecording } from "@/components/common/VoiceRecorder";
import { TaskMetaChips } from "./TaskCard";
import { CATEGORY_LABELS, STATUS_META, type Task, type TaskStatus, type TaskUpdate } from "@/types/task.types";

interface TaskDetailDrawerProps {
  taskId: string | null;
  onClose: () => void;
}

function Attachments({ items }: { items: TaskAttachmentWithUrl[] }) {
  if (!items.length) return null;
  return (
    <Stack spacing={1}>
      {items.map((a) =>
        a.kind === "voice" ? (
          <audio key={a.id} src={a.url ?? undefined} controls style={{ width: "100%", height: 36 }} />
        ) : (
          <Box
            key={a.id}
            component="a"
            href={a.url ?? undefined}
            target="_blank"
            rel="noreferrer"
            sx={{ display: "block", borderRadius: 1, overflow: "hidden", border: 1, borderColor: "divider" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.url ?? undefined} alt={a.kind} style={{ width: "100%", display: "block" }} />
          </Box>
        )
      )}
    </Stack>
  );
}

function UpdateRow({ u, attachments }: { u: TaskUpdate; attachments: TaskAttachmentWithUrl[] }) {
  const text = u.body || u.transcript;
  const statusLine =
    u.to_status && u.from_status !== u.to_status
      ? `${STATUS_META[u.from_status ?? "todo"].label} → ${STATUS_META[u.to_status].label}`
      : null;
  return (
    <Box sx={{ py: 1 }}>
      <Stack direction="row" spacing={1} alignItems="baseline">
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {u.author?.name ?? "Someone"}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {dayjs(u.created_at).format("DD MMM, h:mm A")}
        </Typography>
      </Stack>
      {statusLine && (
        <Typography variant="caption" color={u.kind === "blocker" ? "error.main" : "text.secondary"} component="div">
          {statusLine}
        </Typography>
      )}
      {text && (
        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mt: 0.25 }}>
          {text}
        </Typography>
      )}
      {u.transcript && u.transcript_en && u.transcript_en !== u.transcript && (
        <Typography variant="caption" color="text.secondary" component="div" sx={{ whiteSpace: "pre-wrap" }}>
          EN: {u.transcript_en}
        </Typography>
      )}
      {attachments.length > 0 && (
        <Box sx={{ mt: 0.75 }}>
          <Attachments items={attachments} />
        </Box>
      )}
    </Box>
  );
}

export function buildClaudeCodeBrief(task: Task, attachments: TaskAttachmentWithUrl[], updates: TaskUpdate[]): string {
  const c = task.context ?? {};
  const lines: string[] = [];
  lines.push(`## Bug report: ${task.title}`);
  lines.push("");
  lines.push(`- Task id: \`${task.id}\``);
  lines.push(`- Reported by: ${task.creator?.name ?? task.created_by} on ${dayjs(task.created_at).format("YYYY-MM-DD HH:mm")}`);
  lines.push(`- Priority: ${task.priority} · Size: ${task.size}`);
  if (c.url) lines.push(`- Page: ${c.url}`);
  if (c.site_name) lines.push(`- Site: ${c.site_name}`);
  if (c.selector) lines.push(`- Element: \`${c.selector}\`${c.element_text ? ` ("${c.element_text}")` : ""}`);
  if (c.viewport) lines.push(`- Viewport: ${c.viewport.w}×${c.viewport.h} @${c.viewport.dpr}x`);
  if (c.user_agent) lines.push(`- Device: ${c.user_agent}`);
  if (c.app_version) lines.push(`- App version: ${c.app_version}`);
  lines.push("");
  lines.push("### What the user said");
  lines.push(task.transcript_en || task.description || task.title);
  if (task.transcript && task.transcript !== task.transcript_en) {
    lines.push("");
    lines.push(`Original: ${task.transcript}`);
  }
  if (task.description && task.description !== task.transcript_en) {
    lines.push("");
    lines.push(`Notes: ${task.description}`);
  }
  const shots = attachments.filter((a) => a.kind === "screenshot" && a.url);
  if (shots.length) {
    lines.push("");
    lines.push("### Screenshot (signed link, 1h)");
    shots.forEach((s) => lines.push(s.url!));
  }
  if (c.console_errors?.length) {
    lines.push("");
    lines.push("### Recent console errors");
    lines.push("```");
    c.console_errors.slice(-15).forEach((e) => lines.push(`[${e.level}] ${e.message}`));
    lines.push("```");
  }
  const comments = updates.filter((u) => u.body || u.transcript_en);
  if (comments.length) {
    lines.push("");
    lines.push("### Thread");
    comments.forEach((u) => lines.push(`- ${u.author?.name ?? "?"}: ${u.body || u.transcript_en}`));
  }
  return lines.join("\n");
}

export default function TaskDetailDrawer({ taskId, onClose }: TaskDetailDrawerProps) {
  const isMobile = useIsMobile("md");
  const { userProfile } = useAuth();
  const { data: task, isLoading } = useTask(taskId);
  const { data: updates = [] } = useTaskUpdates(taskId);
  const { data: attachments = [] } = useTaskAttachments(taskId);
  const updateStatus = useUpdateTaskStatus();
  const addUpdate = useAddTaskUpdate();
  const editTask = useEditTask();

  const [blockMode, setBlockMode] = useState(false);
  const [note, setNote] = useState("");
  const [voice, setVoice] = useState<VoiceRecording | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setBlockMode(false);
    setNote("");
    setVoice(null);
    setError(null);
  }, [taskId]);

  const busy = updateStatus.isPending || addUpdate.isPending || editTask.isPending;
  const me = userProfile?.id;
  const isAdmin = userProfile?.role === "admin";
  const canCancel = !!task && (task.created_by === me || isAdmin);

  const taskAttachments = attachments.filter((a) => !a.update_id);
  const attachmentsFor = (updateId: string) => attachments.filter((a) => a.update_id === updateId);

  const voiceAttachment = () => (voice ? [{ kind: "voice" as const, blob: voice.blob, mime: voice.mime }] : []);
  const resetComposer = () => {
    setNote("");
    setVoice(null);
    setBlockMode(false);
  };

  const changeStatus = async (to: TaskStatus) => {
    if (!task) return;
    setError(null);
    try {
      await updateStatus.mutateAsync({
        taskId: task.id,
        from: task.status,
        to,
        note: note.trim() || null,
        transcript: voice?.transcription?.transcript ?? null,
        transcript_en: voice?.transcription?.transcript_en ?? null,
        attachments: voiceAttachment(),
      });
      resetComposer();
      setToast(to === "done" ? "Marked as done ✅" : `Moved to ${STATUS_META[to].label}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update");
    }
  };

  const sendComment = async () => {
    if (!task) return;
    setError(null);
    try {
      await addUpdate.mutateAsync({
        taskId: task.id,
        body: note,
        transcript: voice?.transcription?.transcript ?? null,
        transcript_en: voice?.transcription?.transcript_en ?? null,
        attachments: voiceAttachment(),
      });
      resetComposer();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send");
    }
  };

  const copyBrief = async () => {
    if (!task) return;
    try {
      await navigator.clipboard.writeText(buildClaudeCodeBrief(task, attachments, updates));
      setToast("Copied — paste into Claude Code");
    } catch {
      setToast("Clipboard not available");
    }
  };

  const hasComposerContent = !!note.trim() || !!voice;

  return (
    <Drawer
      anchor={isMobile ? "bottom" : "right"}
      open={!!taskId}
      onClose={onClose}
      PaperProps={{
        sx: isMobile
          ? { height: "92vh", borderTopLeftRadius: 16, borderTopRightRadius: 16 }
          : { width: 480, maxWidth: "100vw" },
      }}
    >
      <Stack direction="row" alignItems="center" sx={{ px: 2, py: 1, borderBottom: 1, borderColor: "divider" }}>
        <Typography variant="subtitle1" sx={{ flex: 1, fontWeight: 600 }}>
          {task?.source === "bug_report" ? "Bug report" : "Task"}
        </Typography>
        <IconButton aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Stack>

      {isLoading || !task ? (
        <Box sx={{ p: 4, textAlign: "center" }}>
          {isLoading ? <CircularProgress /> : <Typography color="text.secondary">Task not found or not visible to you.</Typography>}
        </Box>
      ) : (
        <>
          <Box sx={{ flex: 1, overflowY: "auto", px: 2, py: 1.5 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, lineHeight: 1.3, wordBreak: "break-word" }}>
              {task.title}
            </Typography>
            <Box sx={{ mt: 1 }}>
              <TaskMetaChips task={task} />
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {task.creator?.name ?? "?"} → {task.assignee?.name ?? "?"} · {CATEGORY_LABELS[task.category]}
              {task.site?.name ? ` · ${task.site.name}` : ""}
            </Typography>

            {task.status === "blocked" && task.blocker_note && (
              <Alert severity="error" icon={<BlockIcon />} sx={{ mt: 1.5 }}>
                {task.blocker_note}
              </Alert>
            )}

            {task.description && (
              <Typography variant="body2" sx={{ mt: 1.5, whiteSpace: "pre-wrap" }}>
                {task.description}
              </Typography>
            )}
            {task.transcript && (
              <Box sx={{ mt: 1.5, p: 1.25, borderRadius: 1, bgcolor: "action.hover" }}>
                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                  🎤 {task.transcript}
                </Typography>
                {task.transcript_en && task.transcript_en !== task.transcript && (
                  <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5, whiteSpace: "pre-wrap" }}>
                    EN: {task.transcript_en}
                  </Typography>
                )}
              </Box>
            )}
            {taskAttachments.length > 0 && (
              <Box sx={{ mt: 1.5 }}>
                <Attachments items={taskAttachments} />
              </Box>
            )}
            {task.source === "bug_report" && task.context?.url && (
              <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1, wordBreak: "break-all" }}>
                Page: {task.context.url}
              </Typography>
            )}
            {task.source === "bug_report" && isAdmin && (
              <Button size="small" startIcon={<ContentCopyIcon />} onClick={copyBrief} sx={{ mt: 1 }}>
                Copy for Claude Code
              </Button>
            )}

            <Divider sx={{ my: 2 }} />
            <Typography variant="overline" color="text.secondary">
              Updates
            </Typography>
            {updates.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No updates yet.
              </Typography>
            ) : (
              updates.map((u) => <UpdateRow key={u.id} u={u} attachments={attachmentsFor(u.id)} />)
            )}
          </Box>

          {/* Action + composer area */}
          <Box sx={{ borderTop: 1, borderColor: "divider", p: 1.5, pb: "calc(12px + env(safe-area-inset-bottom))" }}>
            {error && (
              <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            <Stack spacing={1}>
              <TextField
                size="small"
                placeholder={blockMode ? "What is stopping you? What do you need?" : "Write an update…"}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                multiline
                maxRows={4}
                fullWidth
                error={blockMode && !hasComposerContent}
              />
              <VoiceRecorder value={voice} onChange={setVoice} label={blockMode ? "Explain the problem by voice" : "Voice update"} disabled={busy} />

              {blockMode ? (
                <Stack direction="row" spacing={1}>
                  <Button fullWidth onClick={() => setBlockMode(false)} disabled={busy}>
                    Back
                  </Button>
                  <Button
                    fullWidth
                    variant="contained"
                    color="error"
                    startIcon={<BlockIcon />}
                    disabled={busy || !hasComposerContent}
                    onClick={() => changeStatus("blocked")}
                  >
                    Send blocker
                  </Button>
                </Stack>
              ) : (
                <>
                  {hasComposerContent && (
                    <Button variant="outlined" startIcon={<SendIcon />} onClick={sendComment} disabled={busy}>
                      Send update
                    </Button>
                  )}
                  <Stack direction="row" spacing={1}>
                    {task.status === "todo" && (
                      <Button fullWidth variant="outlined" startIcon={<PlayArrowIcon />} onClick={() => changeStatus("in_progress")} disabled={busy}>
                        Start
                      </Button>
                    )}
                    {task.status === "blocked" && (
                      <Button fullWidth variant="outlined" startIcon={<PlayArrowIcon />} onClick={() => changeStatus("in_progress")} disabled={busy}>
                        Resume
                      </Button>
                    )}
                    {(task.status === "todo" || task.status === "in_progress") && (
                      <Button fullWidth variant="outlined" color="error" startIcon={<BlockIcon />} onClick={() => setBlockMode(true)} disabled={busy}>
                        Blocked
                      </Button>
                    )}
                    {task.status !== "done" && task.status !== "cancelled" ? (
                      <Button fullWidth variant="contained" color="success" startIcon={<CheckCircleIcon />} onClick={() => changeStatus("done")} disabled={busy}>
                        Done
                      </Button>
                    ) : (
                      <Button fullWidth variant="outlined" startIcon={<ReplayIcon />} onClick={() => changeStatus("todo")} disabled={busy}>
                        Reopen
                      </Button>
                    )}
                  </Stack>
                  {canCancel && task.status !== "cancelled" && task.status !== "done" && (
                    <Button size="small" color="inherit" onClick={() => changeStatus("cancelled")} disabled={busy} sx={{ alignSelf: "center", opacity: 0.7 }}>
                      Cancel task
                    </Button>
                  )}
                </>
              )}
            </Stack>
          </Box>
        </>
      )}

      <Snackbar open={!!toast} autoHideDuration={2500} onClose={() => setToast(null)} message={toast} />
    </Drawer>
  );
}
