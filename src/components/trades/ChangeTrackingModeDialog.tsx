"use client";

import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Alert,
  Stack,
  CircularProgress,
} from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { TrackingModeChooser } from "./TrackingModeChooser";

type Mode = "detailed" | "headcount" | "mesthri_only" | "mid";

interface ChangeTrackingModeDialogProps {
  open: boolean;
  onClose: () => void;
  contractId: string;
  contractTitle: string;
  currentMode: Mode;
  /** Kept for caller compatibility — no longer used (headcount seeding removed). */
  tradeCategoryId?: string;
  /** Trade name — lets the chooser hide the Civil-only "detailed" card elsewhere. */
  tradeName?: string;
}

interface Counts {
  headcount: number;
  detailed: number;
  payments: number;
  mid: number;
}

/**
 * One-way exit to payments-only: lets an admin move a grandfathered
 * headcount/mid/detailed contract to "Just record payments". Switching INTO
 * headcount is no longer offered (daily labour lives on /site/attendance).
 *
 * Safety: blocks the switch if entries already exist for the OLD mode that
 * would lose meaning under the NEW mode (e.g., headcount entries don't
 * apply in payments-only mode). User must delete those entries first.
 */
export function ChangeTrackingModeDialog({
  open,
  onClose,
  contractId,
  contractTitle,
  currentMode,
}: ChangeTrackingModeDialogProps) {
  const queryClient = useQueryClient();
  const supabase = createClient();

  const [target, setTarget] = useState<Mode>(currentMode);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loadingCounts, setLoadingCounts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTarget(currentMode);
    setError(null);
    void (async () => {
      setLoadingCounts(true);
      try {
        const sb = supabase as any;
        const [hc, det, pay, mid] = await Promise.all([
          sb
            .from("subcontract_headcount_attendance")
            .select("id", { count: "exact", head: true })
            .eq("subcontract_id", contractId),
          sb
            .from("daily_attendance")
            .select("id", { count: "exact", head: true })
            .eq("subcontract_id", contractId)
            .eq("is_deleted", false),
          sb
            .from("subcontract_payments")
            .select("id", { count: "exact", head: true })
            .eq("contract_id", contractId)
            .eq("is_deleted", false),
          sb
            .from("subcontract_mid_entries")
            .select("id", { count: "exact", head: true })
            .eq("subcontract_id", contractId),
        ]);
        setCounts({
          headcount: hc.count ?? 0,
          detailed: det.count ?? 0,
          payments: pay.count ?? 0,
          mid: mid.count ?? 0,
        });
      } finally {
        setLoadingCounts(false);
      }
    })();
  }, [open, contractId, currentMode, supabase]);

  const blockedReason: string | null = (() => {
    if (!counts) return null;
    if (target === currentMode) return null;
    if (currentMode === "headcount" && counts.headcount > 0) {
      return `${counts.headcount} headcount entries exist. Delete them on /site/attendance before switching modes — otherwise their per-role units would lose meaning.`;
    }
    if (currentMode === "detailed" && counts.detailed > 0) {
      return `${counts.detailed} per-laborer attendance rows exist. Clear them first.`;
    }
    if (currentMode === "mid" && counts.mid > 0) {
      return `${counts.mid} mid-mode day entries exist. Delete them on /site/attendance before switching modes — otherwise their crew rosters and day totals would lose meaning.`;
    }
    return null;
  })();

  const handleSave = async () => {
    if (target === currentMode || blockedReason) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const sb = supabase as any;

      // Headcount/mid are no longer offered as targets (one-way exit to
      // payments-only), so this is just the mode update — no rate seeding.
      const { error: e1 } = await sb
        .from("subcontracts")
        .update({ labor_tracking_mode: target })
        .eq("id", contractId);
      if (e1) throw e1;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["trades"] }),
        queryClient.invalidateQueries({
          queryKey: ["trade-reconciliations"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["contract-headcount", contractId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["trade-attendance-summary", contractId],
        }),
      ]);
      if (typeof BroadcastChannel !== "undefined") {
        const bc = new BroadcastChannel("subcontracts-changed");
        bc.postMessage({ contractId, at: Date.now() });
        bc.close();
      }
      onClose();
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Change tracking mode</DialogTitle>
      <DialogContent dividers>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
          {contractTitle}
        </Typography>

        {loadingCounts && (
          <Stack alignItems="center" sx={{ py: 2 }}>
            <CircularProgress size={20} />
          </Stack>
        )}

        {/* "Full workspace (attendance + salary)" is a trade-level property now, so it
            isn't offered as a per-contract mode here (allowDetailed stays false). */}
        <TrackingModeChooser value={target} onChange={setTarget} allowDetailed={false} />

        {currentMode === "detailed" && (
          <Alert severity="info" sx={{ mt: 2 }}>
            This contract runs the full workspace (attendance + salary). That isn&apos;t
            offered as a per-contract mode here — it belongs to the trade. You can switch it
            to a lighter mode, but existing attendance must be cleared first.
          </Alert>
        )}

        {blockedReason && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {blockedReason}
          </Alert>
        )}

        {!blockedReason && target !== currentMode && counts && (
          <Alert severity="info" sx={{ mt: 2 }}>
            Changing modes preserves existing payment ledger entries.
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          disabled={saving || target === currentMode || !!blockedReason}
        >
          {saving ? "Saving…" : "Change mode"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
