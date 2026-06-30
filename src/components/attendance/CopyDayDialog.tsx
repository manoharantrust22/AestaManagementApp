"use client";

import * as React from "react";
import dayjs, { Dayjs } from "dayjs";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Stack,
  Chip,
  Typography,
  Switch,
  FormControlLabel,
  Divider,
  Alert,
  CircularProgress,
  IconButton,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import EventBusyIcon from "@mui/icons-material/EventBusy";
import LockIcon from "@mui/icons-material/Lock";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { DateCalendar } from "@mui/x-date-pickers/DateCalendar";
import { PickersDay, PickersDayProps } from "@mui/x-date-pickers/PickersDay";
import {
  useCopyDayAttendance,
  usePrecheckCopyTargets,
  type CopyDayResult,
} from "@/hooks/queries/useCopyDayAttendance";

export interface CopyDayDialogProps {
  open: boolean;
  onClose: () => void;
  /** The day being copied FROM (YYYY-MM-DD). */
  sourceDate: string | null;
  siteId: string;
  /** non-null => trade workspace */
  subcontractId: string | null;
  /** non-null => scope market rows by role category */
  tradeCategoryId: string | null;
  tradeName: string | null;
  sourceNamedCount: number;
  sourceMarketCount: number;
  onSuccess?: () => void;
}

type Phase = "pick" | "confirm" | "result";

const fmt = (d: string) => dayjs(d).format("DD MMM (ddd)");

/** A DateCalendar day that reflects multi-selection from a Set of keys. */
function MultiSelectDay(
  props: PickersDayProps & { selectedKeys?: Set<string>; sourceKey?: string }
) {
  const { selectedKeys, sourceKey, day, ...other } = props;
  const key = (day as Dayjs).format("YYYY-MM-DD");
  const isSource = key === sourceKey;
  return (
    <PickersDay
      {...other}
      day={day}
      selected={!!selectedKeys?.has(key)}
      disabled={other.disabled || isSource}
    />
  );
}

export default function CopyDayDialog({
  open,
  onClose,
  sourceDate,
  siteId,
  subcontractId,
  tradeCategoryId,
  tradeName,
  sourceNamedCount,
  sourceMarketCount,
  onSuccess,
}: CopyDayDialogProps) {
  const [phase, setPhase] = React.useState<Phase>("pick");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [overwrite, setOverwrite] = React.useState(false);

  const copyMut = useCopyDayAttendance();

  // Reset whenever the dialog (re)opens for a (new) source day.
  React.useEffect(() => {
    if (open) {
      setPhase("pick");
      setSelected([]);
      setOverwrite(false);
      copyMut.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sourceDate]);

  const selectedSet = React.useMemo(() => new Set(selected), [selected]);

  const toggleDate = (key: string) => {
    if (key === sourceDate) return;
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((d) => d !== key) : [...prev, key].sort()
    );
  };

  const precheck = usePrecheckCopyTargets({
    siteId,
    dates: selected,
    subcontractId,
    tradeCategoryId,
    enabled: open && phase === "confirm",
  });

  const groups = React.useMemo(() => {
    const map = new Map((precheck.data ?? []).map((p) => [p.date, p]));
    const ready: string[] = [];
    const overwritable: string[] = [];
    const settled: string[] = [];
    const holiday: string[] = [];
    for (const d of selected) {
      const p = map.get(d);
      if (!p) {
        ready.push(d);
        continue;
      }
      if (p.holiday) holiday.push(d);
      else if (p.settled) settled.push(d);
      else if (p.existing) overwritable.push(d);
      else ready.push(d);
    }
    return { ready, overwritable, settled, holiday };
  }, [precheck.data, selected]);

  const copyCount =
    groups.ready.length + (overwrite ? groups.overwritable.length : 0);

  const handleCopy = async () => {
    if (!sourceDate || selected.length === 0) return;
    try {
      await copyMut.mutateAsync({
        siteId,
        sourceDate,
        targetDates: selected, // RPC sorts copied vs skipped per date
        subcontractId,
        tradeCategoryId,
        overwrite,
      });
      setPhase("result");
      onSuccess?.();
    } catch {
      // surfaced via copyMut.error below
    }
  };

  const results = (copyMut.data ?? []) as CopyDayResult[];
  const byStatus = (s: CopyDayResult["status"]) =>
    results.filter((r) => r.status === s);

  const handleClose = () => {
    onClose();
  };

  const scopeLabel =
    subcontractId && tradeName && tradeName !== "Civil" ? tradeName : null;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <ContentCopyIcon fontSize="small" color="primary" />
          <Box>
            <Typography variant="subtitle1" fontWeight={700} component="div">
              Copy day{sourceDate ? ` — ${fmt(sourceDate)}` : ""}
            </Typography>
            <Typography variant="caption" color="text.secondary" component="div">
              {sourceNamedCount} named · {sourceMarketCount} market
              {scopeLabel ? ` · ${scopeLabel}` : ""}
            </Typography>
          </Box>
        </Stack>
        <IconButton
          onClick={handleClose}
          size="small"
          sx={{ position: "absolute", right: 8, top: 8 }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {/* ---------------- PICK ---------------- */}
        {phase === "pick" && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Tap the dates to copy this day&apos;s laborers onto. Same laborers,
              rates and times — tea shop, work notes and photos are not copied.
            </Typography>
            <LocalizationProvider dateAdapter={AdapterDayjs}>
              <DateCalendar
                value={null}
                maxDate={dayjs()}
                onChange={(d) => d && toggleDate((d as Dayjs).format("YYYY-MM-DD"))}
                slots={{ day: MultiSelectDay as any }}
                slotProps={{
                  day: {
                    selectedKeys: selectedSet,
                    sourceKey: sourceDate ?? undefined,
                  } as any,
                }}
                sx={{ mx: "auto" }}
              />
            </LocalizationProvider>

            {selected.length > 0 ? (
              <Box sx={{ mt: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  {selected.length} date{selected.length > 1 ? "s" : ""} selected
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
                  {selected.map((d) => (
                    <Chip
                      key={d}
                      label={fmt(d)}
                      size="small"
                      onDelete={() => toggleDate(d)}
                    />
                  ))}
                </Box>
              </Box>
            ) : (
              <Typography variant="caption" color="text.secondary">
                No dates selected yet.
              </Typography>
            )}
          </Box>
        )}

        {/* ---------------- CONFIRM ---------------- */}
        {phase === "confirm" && (
          <Box>
            {precheck.isLoading ? (
              <Stack alignItems="center" sx={{ py: 4 }} spacing={1}>
                <CircularProgress size={28} />
                <Typography variant="body2" color="text.secondary">
                  Checking selected dates…
                </Typography>
              </Stack>
            ) : (
              <Stack spacing={1.5}>
                <GroupBlock
                  icon={<CheckCircleIcon fontSize="small" color="success" />}
                  title={`Will copy (${groups.ready.length})`}
                  dates={groups.ready}
                  color="success"
                />

                {groups.overwritable.length > 0 && (
                  <Box>
                    <GroupBlock
                      icon={<EventBusyIcon fontSize="small" color="warning" />}
                      title={`Already recorded (${groups.overwritable.length})`}
                      dates={groups.overwritable}
                      color="warning"
                    />
                    <FormControlLabel
                      sx={{ mt: 0.5 }}
                      control={
                        <Switch
                          checked={overwrite}
                          onChange={(e) => setOverwrite(e.target.checked)}
                          size="small"
                        />
                      }
                      label={
                        <Typography variant="body2">
                          Overwrite these {groups.overwritable.length} day
                          {groups.overwritable.length > 1 ? "s" : ""}
                        </Typography>
                      }
                    />
                  </Box>
                )}

                {groups.settled.length > 0 && (
                  <GroupBlock
                    icon={<LockIcon fontSize="small" color="error" />}
                    title={`Settled — protected, will skip (${groups.settled.length})`}
                    dates={groups.settled}
                    color="error"
                  />
                )}

                {groups.holiday.length > 0 && (
                  <GroupBlock
                    icon={<EventBusyIcon fontSize="small" color="disabled" />}
                    title={`Holiday — will skip (${groups.holiday.length})`}
                    dates={groups.holiday}
                    color="default"
                  />
                )}

                {copyCount === 0 && (
                  <Alert severity="info">
                    Nothing to copy with the current choices. Turn on overwrite or
                    pick different dates.
                  </Alert>
                )}

                {copyMut.isError && (
                  <Alert severity="error">
                    Copy failed. Please try again.
                  </Alert>
                )}
              </Stack>
            )}
          </Box>
        )}

        {/* ---------------- RESULT ---------------- */}
        {phase === "result" && (
          <Stack spacing={1.5}>
            <ResultBlock
              icon={<CheckCircleIcon fontSize="small" color="success" />}
              title="Copied"
              items={byStatus("copied").map(
                (r) =>
                  `${fmt(r.date)} — ${(r.named ?? 0) + (r.market ?? 0)} laborer${
                    (r.named ?? 0) + (r.market ?? 0) === 1 ? "" : "s"
                  }`
              )}
            />
            <ResultBlock
              icon={<EventBusyIcon fontSize="small" color="warning" />}
              title="Skipped — already recorded"
              items={byStatus("skipped_existing").map((r) => fmt(r.date))}
            />
            <ResultBlock
              icon={<LockIcon fontSize="small" color="error" />}
              title="Skipped — settled"
              items={byStatus("skipped_settled").map((r) => fmt(r.date))}
            />
            <ResultBlock
              icon={<EventBusyIcon fontSize="small" color="disabled" />}
              title="Skipped — holiday"
              items={byStatus("skipped_holiday").map((r) => fmt(r.date))}
            />
            <ResultBlock
              icon={<ErrorOutlineIcon fontSize="small" color="error" />}
              title="Errors"
              items={byStatus("error").map(
                (r) => `${fmt(r.date)}${r.message ? ` — ${r.message}` : ""}`
              )}
            />
          </Stack>
        )}
      </DialogContent>

      <DialogActions>
        {phase === "pick" && (
          <>
            <Button onClick={handleClose} color="inherit">
              Cancel
            </Button>
            <Button
              variant="contained"
              disabled={selected.length === 0}
              onClick={() => setPhase("confirm")}
            >
              Continue
            </Button>
          </>
        )}

        {phase === "confirm" && (
          <>
            <Button
              onClick={() => setPhase("pick")}
              color="inherit"
              disabled={copyMut.isPending}
            >
              Back
            </Button>
            <Button
              variant="contained"
              startIcon={
                copyMut.isPending ? (
                  <CircularProgress size={16} color="inherit" />
                ) : (
                  <ContentCopyIcon />
                )
              }
              disabled={
                copyCount === 0 || precheck.isLoading || copyMut.isPending
              }
              onClick={handleCopy}
            >
              {copyMut.isPending
                ? "Copying…"
                : `Copy to ${copyCount} day${copyCount === 1 ? "" : "s"}`}
            </Button>
          </>
        )}

        {phase === "result" && (
          <>
            <Button
              onClick={() => {
                setSelected([]);
                setOverwrite(false);
                copyMut.reset();
                setPhase("pick");
              }}
              color="inherit"
            >
              Copy to more dates
            </Button>
            <Button variant="contained" onClick={handleClose}>
              Done
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

function GroupBlock({
  icon,
  title,
  dates,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  dates: string[];
  color: "success" | "warning" | "error" | "default";
}) {
  if (dates.length === 0) return null;
  return (
    <Box>
      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.5 }}>
        {icon}
        <Typography variant="body2" fontWeight={600}>
          {title}
        </Typography>
      </Stack>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
        {dates.map((d) => (
          <Chip
            key={d}
            label={fmt(d)}
            size="small"
            color={color === "default" ? undefined : color}
            variant={color === "default" ? "outlined" : "outlined"}
          />
        ))}
      </Box>
    </Box>
  );
}

function ResultBlock({
  icon,
  title,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
}) {
  if (items.length === 0) return null;
  return (
    <Box>
      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.5 }}>
        {icon}
        <Typography variant="body2" fontWeight={600}>
          {title} ({items.length})
        </Typography>
      </Stack>
      <Stack spacing={0.25} sx={{ pl: 3 }}>
        {items.map((t, i) => (
          <Typography key={i} variant="caption" color="text.secondary">
            {t}
          </Typography>
        ))}
      </Stack>
    </Box>
  );
}
