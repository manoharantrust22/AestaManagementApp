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
  FormControl,
  Grid,
  InputLabel,
  Link,
  MenuItem,
  Select,
  TextField,
} from "@mui/material";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { blurOnWheel } from "@/lib/utils/numberInput";
import type { ContractStatus } from "@/types/trade.types";
import type { WorkspaceTask } from "@/lib/workforce/workspaceModel";
import { useSubcontractScopeSheet } from "@/hooks/queries/useSubcontractScopeSheet";
import { isMissingAfter } from "@/types/scopeSheet.types";

const STATUS_OPTIONS: { value: ContractStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On hold" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  siteId: string;
  task: WorkspaceTask;
  onSaved?: () => void;
}

/**
 * In-context edit for a contract (subcontract) — title, description, scope of
 * work, agreed value, status, dates. Deliberately does NOT touch contractor or
 * labor_tracking_mode (mode lives in ChangeTrackingModeDialog; contractor
 * reassignment is an edge case handled on /site/subcontracts). Reuses the same
 * `subcontracts.update(...)` path the old Contracts page uses.
 */
export default function EditContractDialog({ open, onClose, siteId, task, onSaved }: Props) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState("");
  const [totalValue, setTotalValue] = useState<number>(0);
  const [status, setStatus] = useState<ContractStatus>("active");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Scope sheet — to remind (not block) when closing with "after" photos still missing.
  const { data: scopeItems } = useSubcontractScopeSheet(open ? task.id : undefined);
  const missingAfter = (scopeItems ?? []).filter(isMissingAfter).length;

  // Load the full row (the workspace model only carries a projection).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError("");
    setLoading(true);
    void (async () => {
      const { data, error: e } = await (supabase as any)
        .from("subcontracts")
        .select("title, description, scope_of_work, total_value, status, start_date, expected_end_date")
        .eq("id", task.id)
        .single();
      if (cancelled) return;
      if (e) {
        setError(e.message ?? "Could not load the contract.");
      } else if (data) {
        setTitle(data.title ?? "");
        setDescription(data.description ?? "");
        setScope(data.scope_of_work ?? "");
        setTotalValue(Number(data.total_value ?? 0));
        setStatus((data.status as ContractStatus) ?? "active");
        setStartDate(data.start_date ?? "");
        setEndDate(data.expected_end_date ?? "");
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, task.id, supabase]);

  // A crew-less plan can't be activated here — the crew is required at handover.
  // (The DB's contract_party_check enforces this too; this is the friendly guard.)
  const crewless = !task.isInHouse && !task.teamId && !task.laborerId;

  const handleSave = async () => {
    if (!title.trim()) {
      setError("Give the contract a title.");
      return;
    }
    if (crewless && status !== "draft" && status !== "cancelled") {
      setError(
        'This plan has no crew yet — use "Hand to crew" on the contract page to pick one and activate it.'
      );
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { error: e } = await (supabase as any)
        .from("subcontracts")
        .update({
          title: title.trim(),
          description: description.trim() || null,
          scope_of_work: scope.trim() || null,
          total_value: totalValue,
          status,
          start_date: startDate || null,
          expected_end_date: endDate || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", task.id);
      if (e) throw e;

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
      onSaved?.();
      onClose();
    } catch (e: any) {
      if (e?.code === "23514") {
        setError(
          'This plan has no crew yet — use "Hand to crew" on the contract page to pick one and activate it.'
        );
      } else {
        setError(e?.message ?? "Failed to save the contract.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit contract</DialogTitle>
      <DialogContent dividers>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 0.5 }}>
            <TextField
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              fullWidth
              autoFocus
              slotProps={{ htmlInput: { maxLength: 200 } }}
            />
            <TextField
              label="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              fullWidth
              multiline
              rows={2}
            />
            <TextField
              label="Scope of work (optional)"
              placeholder="e.g. Whole house · 2 coats primer + 2 coats interior & exterior"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              fullWidth
              multiline
              rows={3}
            />
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Agreed value"
                  type="number"
                  value={totalValue || ""}
                  onChange={(e) => setTotalValue(Number(e.target.value))}
                  onWheel={blurOnWheel}
                  fullWidth
                  slotProps={{ input: { startAdornment: "₹" } }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <FormControl fullWidth>
                  <InputLabel>Status</InputLabel>
                  <Select
                    value={status}
                    label="Status"
                    onChange={(e) => setStatus(e.target.value as ContractStatus)}
                  >
                    {STATUS_OPTIONS.map((o) => (
                      <MenuItem key={o.value} value={o.value}>
                        {o.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Start date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  fullWidth
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Expected end date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  fullWidth
                  slotProps={{ inputLabel: { shrink: true } }}
                />
              </Grid>
            </Grid>

            {status === "completed" && missingAfter > 0 && (
              <Alert severity="warning">
                Reminder: {missingAfter} work item{missingAfter === 1 ? "" : "s"} still{" "}
                {missingAfter === 1 ? "has" : "have"} no &ldquo;after&rdquo; photo. You can close now
                and add {missingAfter === 1 ? "it" : "them"} later under Scope &amp; photos.
              </Alert>
            )}

            <Link
              component="button"
              type="button"
              underline="hover"
              onClick={() => router.push(`/site/subcontracts?contractId=${task.id}`)}
              sx={{ fontSize: 12.5, alignSelf: "flex-start" }}
            >
              More options (contractor, trade) → open in Contract details
            </Link>

            {error && (
              <Alert severity="error" onClose={() => setError("")}>
                {error}
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={saving || loading}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
