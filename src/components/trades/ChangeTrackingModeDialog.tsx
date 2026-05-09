"use client";

import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Radio,
  RadioGroup,
  FormControlLabel,
  Typography,
  Alert,
  Stack,
  Box,
  CircularProgress,
} from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

type Mode = "detailed" | "headcount" | "mesthri_only" | "mid";

interface ChangeTrackingModeDialogProps {
  open: boolean;
  onClose: () => void;
  contractId: string;
  contractTitle: string;
  currentMode: Mode;
  tradeCategoryId: string;
}

interface Counts {
  headcount: number;
  detailed: number;
  payments: number;
  mid: number;
}

const MODE_DESCRIPTIONS: Record<Mode, { title: string; sub: string }> = {
  detailed: {
    title: "Detailed",
    sub: "Per-laborer attendance with hours and individual pay (like Civil).",
  },
  headcount: {
    title: "Headcount",
    sub: "Total people per role per day. No individual laborer roster.",
  },
  mid: {
    title: "Mid (Laborer + Crew)",
    sub: "Roster of who came + one daily total for the crew (mesthri-led).",
  },
  mesthri_only: {
    title: "Mesthri-only",
    sub: "Just record payments to the mesthri. No daily attendance.",
  },
};

/**
 * Lets an admin change a contract's labor_tracking_mode after creation.
 *
 * Safety: blocks the switch if entries already exist for the OLD mode that
 * would lose meaning under the NEW mode (e.g., headcount entries don't
 * apply in detailed mode). User must delete those entries first.
 *
 * Side-effect: switching INTO headcount mode seeds default role rates from
 * labor_roles.default_daily_rate (matches QuickCreateContractDialog).
 */
export function ChangeTrackingModeDialog({
  open,
  onClose,
  contractId,
  contractTitle,
  currentMode,
  tradeCategoryId,
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

      // 1. Update labor_tracking_mode
      const { error: e1 } = await sb
        .from("subcontracts")
        .update({ labor_tracking_mode: target })
        .eq("id", contractId);
      if (e1) throw e1;

      // 2. If switching INTO headcount, seed role rates from labor_roles
      //    (skip if rates already exist — re-entering headcount preserves
      //    previously edited rates).
      if (target === "headcount") {
        const { data: existing } = await sb
          .from("subcontract_role_rates")
          .select("role_id")
          .eq("subcontract_id", contractId);
        if (!existing || existing.length === 0) {
          const { data: roles } = await sb
            .from("labor_roles")
            .select("id, default_daily_rate")
            .eq("trade_category_id", tradeCategoryId);
          if (roles && roles.length > 0) {
            const seed = roles.map((r: any) => ({
              subcontract_id: contractId,
              role_id: r.id,
              daily_rate: r.default_daily_rate ?? 0,
            }));
            const { error: e2 } = await sb
              .from("subcontract_role_rates")
              .insert(seed);
            if (e2) throw e2;
          }
        }
      }

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

        <RadioGroup value={target} onChange={(_, v) => setTarget(v as Mode)}>
          {(["detailed", "headcount", "mid", "mesthri_only"] as Mode[]).map((m) => {
            const desc = MODE_DESCRIPTIONS[m];
            return (
              <FormControlLabel
                key={m}
                value={m}
                control={<Radio />}
                sx={{ alignItems: "flex-start", mb: 1 }}
                label={
                  <Box sx={{ pt: 0.5 }}>
                    <Typography variant="body2" fontWeight={600}>
                      {desc.title}
                      {m === currentMode && (
                        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                          (current)
                        </Typography>
                      )}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {desc.sub}
                    </Typography>
                  </Box>
                }
              />
            );
          })}
        </RadioGroup>

        {blockedReason && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {blockedReason}
          </Alert>
        )}

        {!blockedReason && target !== currentMode && counts && (
          <Alert severity="info" sx={{ mt: 2 }}>
            {target === "headcount"
              ? "Default role rates will be seeded from the trade's role catalog. You can edit them right after."
              : "Changing modes preserves existing payment ledger entries."}
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
