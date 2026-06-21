"use client";

import { useEffect, useMemo, useState } from "react";
import { Box, Button, Slider, Typography, CircularProgress, Alert } from "@mui/material";
import { computeExposure } from "@/lib/workforce/exposure";
import { useUpdateSubcontractProgress } from "@/hooks/queries/useSubcontractProgress";
import type { WorkspaceTask } from "@/lib/workforce/workspaceModel";
import { wsColors, wsRadius } from "@/lib/workforce/workspaceTokens";
import { ResponsiveSheet } from "./ResponsiveSheet";
import { BalanceMeter } from "./BalanceMeter";

/**
 * Set "how much of this work is done". A live meter swings as the supervisor drags the
 * slider, so they immediately see whether the current payments are ahead of the new progress.
 */
export function UpdateProgressSheet({
  open,
  onClose,
  siteId,
  task,
  notify,
}: {
  open: boolean;
  onClose: () => void;
  siteId: string;
  task: WorkspaceTask;
  notify: (msg: string, severity?: "success" | "error") => void;
}) {
  const update = useUpdateSubcontractProgress(siteId);
  const [pct, setPct] = useState<number>(task.workPercent ?? 0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPct(task.workPercent ?? 0);
      setError(null);
    }
  }, [open, task.workPercent]);

  const preview = useMemo(
    () => computeExposure({ quoted: task.quoted, paid: task.paid, work: pct / 100 }),
    [task.quoted, task.paid, pct]
  );

  const save = async (value: number | null) => {
    setError(null);
    try {
      await update.mutateAsync({ contractId: task.id, percent: value });
      notify(value == null ? "Progress tracking cleared" : `Progress set to ${value}%`);
      onClose();
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  };

  return (
    <ResponsiveSheet
      open={open}
      onClose={onClose}
      title="Update progress"
      subtitle={`${task.who} · ${task.title}`}
      footer={
        <>
          <Button onClick={onClose} disabled={update.isPending} sx={{ textTransform: "none", color: wsColors.ink2 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disableElevation
            onClick={() => save(pct)}
            disabled={update.isPending}
            startIcon={update.isPending ? <CircularProgress size={16} /> : null}
            sx={{ textTransform: "none", fontWeight: 700, bgcolor: wsColors.primary, borderRadius: `${wsRadius.input}px`, "&:hover": { bgcolor: "#2a60d6" } }}
          >
            {update.isPending ? "Saving…" : "Save progress"}
          </Button>
        </>
      }
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, py: 1 }}>
        <Box sx={{ textAlign: "center" }}>
          <Typography sx={{ fontSize: 40, fontWeight: 800, color: wsColors.ink, letterSpacing: "-.03em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
            {pct}%
          </Typography>
          <Typography sx={{ fontSize: 12.5, color: wsColors.muted }}>of the work is done</Typography>
        </Box>

        <Slider
          value={pct}
          onChange={(_, v) => setPct(v as number)}
          step={5}
          min={0}
          max={100}
          marks={[
            { value: 0, label: "0%" },
            { value: 50, label: "50%" },
            { value: 100, label: "100%" },
          ]}
          sx={{ color: wsColors.primary, mx: 1 }}
        />

        <BalanceMeter exposure={preview} />

        {task.workPercent != null && (
          <Button
            size="small"
            onClick={() => save(null)}
            disabled={update.isPending}
            sx={{ textTransform: "none", color: wsColors.muted, alignSelf: "flex-start" }}
          >
            Clear tracking
          </Button>
        )}

        {error && <Alert severity="error">{error}</Alert>}
      </Box>
    </ResponsiveSheet>
  );
}
