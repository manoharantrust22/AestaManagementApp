"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Stack,
  Typography,
  Paper,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Chip,
  Divider,
} from "@mui/material";
import {
  Save as SaveIcon,
  WbSunny as MorningIcon,
  Brightness3 as EveningIcon,
} from "@mui/icons-material";
import dayjs from "dayjs";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  useContractWorkUpdates,
  useSaveContractWorkUpdates,
} from "@/hooks/queries/useContractWorkUpdates";
import { useUpdateSubcontractProgress } from "@/hooks/queries/useSubcontractProgress";
import type {
  WorkUpdates,
  MorningUpdate,
  EveningUpdate,
} from "@/types/work-updates.types";
import { createEmptyWorkUpdates } from "@/types/work-updates.types";
import MorningUpdateForm from "@/components/attendance/work-updates/MorningUpdateForm";
import EveningUpdateForm from "@/components/attendance/work-updates/EveningUpdateForm";

interface ContractWorkUpdatesPanelProps {
  siteId: string;
  contractId: string;
}

function todayISO(): string {
  return dayjs().format("YYYY-MM-DD");
}

/**
 * Slice B — per-contract daily work updates panel. Sits above the Headcount
 * entry on the trade workspace expanded row.
 *
 * Wraps the existing MorningUpdateForm + EveningUpdateForm by passing a
 * contract-scoped storage key (siteId/`contracts/${contractId}`) so photos
 * are namespaced under the contract instead of mixing with site-level
 * work-updates.
 *
 * Persists to subcontract_work_updates one row per (subcontract_id, date).
 */
export function ContractWorkUpdatesPanel({
  siteId,
  contractId,
}: ContractWorkUpdatesPanelProps) {
  const supabase = useMemo(() => createClient(), []);
  const { userProfile } = useAuth();

  const [date, setDate] = useState<string>(todayISO());
  const { data: existing, isLoading } = useContractWorkUpdates(contractId, date);
  const saveMutation = useSaveContractWorkUpdates();
  // The evening "% done" doubles as the contract's work progress, so saving an
  // update also moves the progress meter (and refreshes the trade tree).
  const progressMut = useUpdateSubcontractProgress(siteId);

  // Local form state — initialized from `existing` and synced via the
  // form children's onChange callbacks.
  const [photoCount, setPhotoCount] = useState<number>(3);
  const [morning, setMorning] = useState<MorningUpdate | null>(null);
  const [evening, setEvening] = useState<EveningUpdate | null>(null);
  const [dirty, setDirty] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Reset to fetched data on contract/date change
  useEffect(() => {
    setDirty(false);
    setSaveError(null);
    if (existing) {
      setPhotoCount(existing.photoCount ?? 3);
      setMorning(existing.morning ?? null);
      setEvening(existing.evening ?? null);
    } else {
      const empty = createEmptyWorkUpdates();
      setPhotoCount(empty.photoCount);
      setMorning(null);
      setEvening(null);
    }
  }, [existing, contractId, date]);

  // Contract-scoped siteId for the form's storage path. The PhotoCaptureButton
  // appends date + period + photo index, so the final path becomes:
  //   ${siteId}/contracts/${contractId}/${date}/${period}/photo_${i}_${ts}.jpg
  // — keeps contract photos cleanly separated from site-level work-updates.
  const scopedSiteId = `${siteId}/contracts/${contractId}`;

  const handleSave = async () => {
    setSaveError(null);
    const payload: WorkUpdates = {
      photoCount,
      morning,
      evening,
    };
    try {
      await saveMutation.mutateAsync({
        contractId,
        date,
        workUpdates: payload,
        userId: userProfile?.id,
      });
      // Carry the evening "% done" through to the contract's progress meter.
      // Best-effort: the work update is already saved, so a progress-write
      // hiccup shouldn't surface as a failure of the save.
      if (evening && typeof evening.completionPercent === "number") {
        try {
          await progressMut.mutateAsync({
            contractId,
            percent: evening.completionPercent,
          });
        } catch {
          /* progress is a derived convenience; ignore */
        }
      }
      setSavedFlash(true);
      setDirty(false);
      setTimeout(() => setSavedFlash(false), 2000);
    } catch (e: any) {
      setSaveError(e.message ?? String(e));
    }
  };

  const handleMorningChange = (data: MorningUpdate | null) => {
    setMorning(data);
    setDirty(true);
  };
  const handleEveningChange = (data: EveningUpdate | null) => {
    setEvening(data);
    setDirty(true);
  };
  const handlePhotoCountChange = (count: number) => {
    setPhotoCount(count);
    setDirty(true);
  };

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ mb: 1 }}
      >
        <Typography variant="subtitle2">Today&apos;s work</Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          {savedFlash && <Chip label="Saved" size="small" color="success" />}
          <TextField
            label="Date"
            type="date"
            size="small"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: 170 }}
          />
        </Stack>
      </Stack>

      {isLoading ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 1 }}>
          <CircularProgress size={16} />
          <Typography variant="caption">Loading {date}…</Typography>
        </Box>
      ) : (
        <Stack spacing={2}>
          {/* Morning */}
          <Box>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <MorningIcon fontSize="small" sx={{ color: "warning.main" }} />
              <Typography variant="body2" fontWeight={600}>
                Morning — what&apos;s planned
              </Typography>
            </Stack>
            <MorningUpdateForm
              supabase={supabase}
              siteId={scopedSiteId}
              date={date}
              initialData={morning}
              photoCount={photoCount}
              onPhotoCountChange={handlePhotoCountChange}
              onChange={handleMorningChange}
              disabled={saveMutation.isPending}
            />
          </Box>

          <Divider />

          {/* Evening */}
          <Box>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
              <EveningIcon fontSize="small" sx={{ color: "info.main" }} />
              <Typography variant="body2" fontWeight={600}>
                Evening — what got done
              </Typography>
            </Stack>
            <EveningUpdateForm
              supabase={supabase}
              siteId={scopedSiteId}
              date={date}
              morningData={morning}
              initialData={evening}
              photoCount={photoCount}
              onChange={handleEveningChange}
              disabled={saveMutation.isPending}
            />
          </Box>

          {saveError && <Alert severity="error">{saveError}</Alert>}

          <Stack direction="row" justifyContent="flex-end">
            <Button
              variant="contained"
              size="small"
              startIcon={
                saveMutation.isPending ? <CircularProgress size={14} /> : <SaveIcon />
              }
              disabled={!dirty || saveMutation.isPending}
              onClick={handleSave}
            >
              {saveMutation.isPending ? "Saving…" : "Save work update"}
            </Button>
          </Stack>
        </Stack>
      )}
    </Paper>
  );
}
