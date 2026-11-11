"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import dayjs from "dayjs";
import { useAuth } from "@/contexts/AuthContext";
import { useSelectedSite, useSitesData } from "@/contexts/SiteContext";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useAssignableUsers, useCreateTask } from "@/hooks/queries/useTasks";
import VoiceRecorder, { type VoiceRecording } from "@/components/common/VoiceRecorder";
import {
  CATEGORY_LABELS,
  type Task,
  type TaskCategory,
  type TaskPriority,
  type TaskSize,
  type TaskUserRef,
} from "@/types/task.types";

interface TaskCreateDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (task: Task) => void;
  defaultAssigneeId?: string | null;
}

type DueChoice = "today" | "tomorrow" | "pick" | "none";

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  office: "Office",
  site_engineer: "Site engineer",
};

export default function TaskCreateDialog({ open, onClose, onCreated, defaultAssigneeId }: TaskCreateDialogProps) {
  const isMobile = useIsMobile("md");
  const { userProfile } = useAuth();
  const { selectedSite } = useSelectedSite();
  const { sites } = useSitesData();
  const { data: users = [] } = useAssignableUsers();
  const createTask = useCreateTask();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState<TaskUserRef | null>(null);
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [size, setSize] = useState<TaskSize>("small");
  const [category, setCategory] = useState<TaskCategory>("other");
  const [dueChoice, setDueChoice] = useState<DueChoice>("today");
  const [dueDate, setDueDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [siteId, setSiteId] = useState<string>("");
  const [voice, setVoice] = useState<VoiceRecording | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDescription("");
    setPriority("medium");
    setSize("small");
    setCategory("other");
    setDueChoice("today");
    setDueDate(dayjs().format("YYYY-MM-DD"));
    setSiteId(selectedSite?.id ?? "");
    setVoice(null);
    setError(null);
    createTask.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const want = defaultAssigneeId ?? null;
    setAssignee(want ? users.find((u) => u.id === want) ?? null : null);
  }, [open, defaultAssigneeId, users]);

  // Voice fills the title when the user hasn't typed one.
  const onVoice = (rec: VoiceRecording | null) => {
    setVoice(rec);
    const t = rec?.transcription;
    if (t && !title.trim()) {
      const src = (t.transcript_en || t.transcript).trim();
      const firstSentence = src.split(/(?<=[.!?])\s/)[0] ?? src;
      setTitle(firstSentence.length > 90 ? `${firstSentence.slice(0, 87)}…` : firstSentence);
    }
  };

  const sortedUsers = useMemo(() => {
    const me = userProfile?.id;
    return [...users].sort((a, b) => (a.id === me ? -1 : b.id === me ? 1 : a.name.localeCompare(b.name)));
  }, [users, userProfile?.id]);

  const resolvedDue =
    dueChoice === "today"
      ? dayjs().format("YYYY-MM-DD")
      : dueChoice === "tomorrow"
        ? dayjs().add(1, "day").format("YYYY-MM-DD")
        : dueChoice === "pick"
          ? dueDate
          : null;

  const submit = async () => {
    setError(null);
    if (!title.trim()) return setError("Add a short title (or speak it)");
    if (!assignee) return setError("Choose who should do this");
    try {
      const task = await createTask.mutateAsync({
        title,
        description: description.trim() || null,
        assignee_id: assignee.id,
        site_id: siteId || null,
        category,
        priority,
        size,
        due_date: resolvedDue,
        transcript: voice?.transcription?.transcript || null,
        transcript_en: voice?.transcription?.transcript_en || null,
        attachments: voice ? [{ kind: "voice", blob: voice.blob, mime: voice.mime }] : [],
      });
      onCreated?.(task);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the task");
    }
  };

  return (
    <Dialog open={open} onClose={createTask.isPending ? undefined : onClose} fullScreen={isMobile} fullWidth maxWidth="sm">
      <DialogTitle sx={{ display: "flex", alignItems: "center", pr: 1 }}>
        <Box sx={{ flex: 1 }}>New task</Box>
        <IconButton aria-label="Close" onClick={onClose} disabled={createTask.isPending}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.25}>
          <VoiceRecorder value={voice} onChange={onVoice} label="Speak the task (Tamil / English)" disabled={createTask.isPending} />

          <TextField
            label="What needs to be done?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            fullWidth
            inputProps={{ maxLength: 200 }}
          />

          <Autocomplete
            options={sortedUsers}
            value={assignee}
            onChange={(_, v) => setAssignee(v)}
            getOptionLabel={(u) => (u.id === userProfile?.id ? `${u.name} (me)` : u.name)}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            groupBy={(u) => (u.id === userProfile?.id ? "Me" : ROLE_LABEL[u.role ?? ""] ?? "Others")}
            slotProps={{ popper: { disablePortal: false } }}
            renderInput={(params) => <TextField {...params} label="Assign to" required />}
          />

          <Box>
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.5 }}>
              Priority
            </Typography>
            <ToggleButtonGroup exclusive fullWidth value={priority} onChange={(_, v) => v && setPriority(v)} size="small">
              <ToggleButton value="high" color="error">High</ToggleButton>
              <ToggleButton value="medium" color="warning">Medium</ToggleButton>
              <ToggleButton value="low">Low</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.5 }}>
              Task size
            </Typography>
            <ToggleButtonGroup exclusive fullWidth value={size} onChange={(_, v) => v && setSize(v)} size="small" color="primary">
              <ToggleButton value="small">Small</ToggleButton>
              <ToggleButton value="medium">Medium</ToggleButton>
              <ToggleButton value="large">Big</ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Box>
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.5 }}>
              Due
            </Typography>
            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" alignItems="center">
              {(["today", "tomorrow", "pick", "none"] as DueChoice[]).map((c) => (
                <Chip
                  key={c}
                  label={c === "today" ? "Today" : c === "tomorrow" ? "Tomorrow" : c === "pick" ? "Pick date" : "No date"}
                  color={dueChoice === c ? "primary" : "default"}
                  variant={dueChoice === c ? "filled" : "outlined"}
                  onClick={() => setDueChoice(c)}
                />
              ))}
              {dueChoice === "pick" && (
                <TextField type="date" size="small" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              )}
            </Stack>
          </Box>

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField select label="Type" value={category} onChange={(e) => setCategory(e.target.value as TaskCategory)} fullWidth>
              {(Object.keys(CATEGORY_LABELS) as TaskCategory[]).map((c) => (
                <MenuItem key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label="Site (optional)" value={siteId} onChange={(e) => setSiteId(e.target.value)} fullWidth>
              <MenuItem value="">
                <em>No site</em>
              </MenuItem>
              {sites.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          <TextField
            label="Details (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            multiline
            minRows={2}
            fullWidth
          />

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} disabled={createTask.isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={submit} disabled={createTask.isPending} size="large">
          {createTask.isPending ? "Assigning…" : "Assign task"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
