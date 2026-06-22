"use client";

import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import {
  decideContractDelete,
  type ContractDeleteCounts,
} from "@/lib/workforce/contractDeleteGuard";
import type { WorkspaceTask } from "@/lib/workforce/workspaceModel";

interface Props {
  open: boolean;
  onClose: () => void;
  siteId: string;
  task: WorkspaceTask;
  /** Called after a permanent delete OR a cancel, so the caller can clear selection. */
  onDeleted?: () => void;
}

/**
 * Guarded delete for a contract. If anything real hangs off it (payments,
 * settlements, attendance, headcount, child packages) the permanent delete is
 * blocked and we offer "Cancel contract" (status='cancelled') instead — only a
 * clean test contract can be removed outright.
 */
export default function DeleteContractDialog({ open, onClose, siteId, task, onDeleted }: Props) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  const [counts, setCounts] = useState<ContractDeleteCounts | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError("");
    setCounts(null);
    setLoading(true);
    void (async () => {
      const sb = supabase as any;
      const [pay, settle, att, head, pkg] = await Promise.all([
        sb.from("subcontract_payments").select("id", { count: "exact", head: true }).eq("contract_id", task.id).eq("is_deleted", false),
        sb.from("settlement_groups").select("id", { count: "exact", head: true }).eq("subcontract_id", task.id).eq("is_cancelled", false),
        sb.from("daily_attendance").select("id", { count: "exact", head: true }).eq("subcontract_id", task.id).eq("is_deleted", false),
        sb.from("subcontract_headcount_attendance").select("id", { count: "exact", head: true }).eq("subcontract_id", task.id),
        sb.from("task_work_packages").select("id", { count: "exact", head: true }).eq("parent_subcontract_id", task.id),
      ]);
      if (cancelled) return;
      setCounts({
        payments: pay.count ?? 0,
        settlements: settle.count ?? 0,
        attendance: att.count ?? 0,
        headcount: head.count ?? 0,
        packages: pkg.count ?? 0,
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, task.id, supabase]);

  const decision = counts ? decideContractDelete(counts) : null;

  const refreshAndClose = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["trades", "site", siteId] }),
      queryClient.invalidateQueries({ queryKey: ["trade-reconciliations", "site", siteId] }),
      queryClient.invalidateQueries({ queryKey: ["trade-activity", "site", siteId] }),
      queryClient.invalidateQueries({ queryKey: ["subcontracts", "site", siteId] }),
    ]);
    if (typeof BroadcastChannel !== "undefined") {
      const bc = new BroadcastChannel("subcontracts-changed");
      bc.postMessage({ siteId, at: Date.now() });
      bc.close();
    }
    onDeleted?.();
    onClose();
  };

  const handleHardDelete = async () => {
    setBusy(true);
    setError("");
    try {
      const { error: e } = await (supabase as any).from("subcontracts").delete().eq("id", task.id);
      if (e) throw e;
      await refreshAndClose();
    } catch (e: any) {
      setError(e?.message ?? "Failed to delete the contract.");
    } finally {
      setBusy(false);
    }
  };

  const handleCancelContract = async () => {
    setBusy(true);
    setError("");
    try {
      const { error: e } = await (supabase as any)
        .from("subcontracts")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", task.id);
      if (e) throw e;
      await refreshAndClose();
    } catch (e: any) {
      setError(e?.message ?? "Failed to cancel the contract.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Delete “{task.title}”?</DialogTitle>
      <DialogContent dividers>
        {loading || !decision ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
            <CircularProgress size={22} />
          </Box>
        ) : decision.canHardDelete ? (
          <Typography variant="body2">
            This contract has no payments, attendance or settlements — it&apos;s safe to remove
            permanently. This can&apos;t be undone.
          </Typography>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            <Alert severity="warning" sx={{ py: 0.5 }}>
              This contract can&apos;t be permanently deleted — it has real history:
            </Alert>
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              {decision.blockers.map((b) => (
                <li key={b}>
                  <Typography variant="body2">{b}</Typography>
                </li>
              ))}
            </Box>
            <Typography variant="body2" color="text.secondary">
              You can <strong>cancel</strong> it instead — it stays on record but drops out of the
              active list.
            </Typography>
          </Box>
        )}
        {error && (
          <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError("")}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Keep it
        </Button>
        {decision && !decision.canHardDelete && (
          <Button color="warning" variant="contained" onClick={handleCancelContract} disabled={busy}>
            {busy ? "Cancelling…" : "Cancel contract"}
          </Button>
        )}
        {decision && decision.canHardDelete && (
          <Button color="error" variant="contained" onClick={handleHardDelete} disabled={busy}>
            {busy ? "Deleting…" : "Delete permanently"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
