"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Stack,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Paper,
  Chip,
  Divider,
} from "@mui/material";
import { Save as SaveIcon } from "@mui/icons-material";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import {
  useContractHeadcount,
  type RoleRate,
} from "@/hooks/queries/useContractHeadcount";

interface HeadcountEntryInlineProps {
  siteId: string;
  contractId: string;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatINR(n: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
}

export function HeadcountEntryInline({ siteId, contractId }: HeadcountEntryInlineProps) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useContractHeadcount(contractId);

  const [date, setDate] = useState(todayISO());
  // Per-role unit input keyed by roleId
  const [units, setUnits] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  // Reset units state when the contract changes
  useEffect(() => {
    setUnits({});
    setNote("");
    setSaveError(null);
  }, [contractId]);

  // Pre-fill units from any existing entry for the chosen date so user
  // edits-in-place rather than duplicates
  useEffect(() => {
    if (!data) return;
    const onDate = data.recent.filter((e) => e.attendanceDate === date);
    if (onDate.length === 0) {
      setUnits({});
      return;
    }
    const next: Record<string, string> = {};
    for (const e of onDate) next[e.roleId] = String(e.units);
    setUnits(next);
  }, [data, date]);

  const impliedTotal = useMemo(() => {
    if (!data) return 0;
    let sum = 0;
    for (const r of data.rates) {
      const n = Number(units[r.roleId] || "0");
      if (!Number.isNaN(n)) sum += n * r.dailyRate;
    }
    return sum;
  }, [data, units]);

  const handleSave = async () => {
    if (!data) return;
    setSaveError(null);
    setSaving(true);
    try {
      const sb = supabase as any;
      // Upsert one row per role with units > 0; delete rows where the user
      // cleared the units (set to 0 or empty).
      const upsertRows: Array<{
        subcontract_id: string;
        attendance_date: string;
        role_id: string;
        units: number;
        note: string | null;
      }> = [];
      const deleteRoleIds: string[] = [];

      for (const r of data.rates) {
        const raw = units[r.roleId];
        const n = raw === undefined || raw === "" ? 0 : Number(raw);
        if (Number.isNaN(n) || n < 0) {
          throw new Error(`Invalid units for ${r.roleName}: ${raw}`);
        }
        if (n > 0) {
          upsertRows.push({
            subcontract_id: contractId,
            attendance_date: date,
            role_id: r.roleId,
            units: n,
            note: note.trim() || null,
          });
        } else {
          deleteRoleIds.push(r.roleId);
        }
      }

      if (upsertRows.length > 0) {
        const upsertRes = await sb
          .from("subcontract_headcount_attendance")
          .upsert(upsertRows, { onConflict: "subcontract_id,attendance_date,role_id" });
        if (upsertRes.error) throw upsertRes.error;
      }
      if (deleteRoleIds.length > 0) {
        const delRes = await sb
          .from("subcontract_headcount_attendance")
          .delete()
          .eq("subcontract_id", contractId)
          .eq("attendance_date", date)
          .in("role_id", deleteRoleIds);
        if (delRes.error) throw delRes.error;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["contract-headcount", contractId] }),
        queryClient.invalidateQueries({
          queryKey: ["trade-reconciliations", "site", siteId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["trade-activity", "site", siteId],
        }),
      ]);
      if (typeof BroadcastChannel !== "undefined") {
        const bc = new BroadcastChannel("subcontracts-changed");
        bc.postMessage({ siteId, contractId, kind: "headcount", at: Date.now() });
        bc.close();
      }

      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } catch (e: any) {
      setSaveError(e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 1 }}>
        <CircularProgress size={16} />
        <Typography variant="caption">Loading rate card…</Typography>
      </Box>
    );
  }
  if (error) {
    return (
      <Alert severity="error">
        Failed to load headcount data: {error instanceof Error ? error.message : String(error)}
      </Alert>
    );
  }
  if (!data || data.rates.length === 0) {
    return (
      <Alert severity="info">
        No role rate card set for this contract yet. Open the contract in the
        Subcontracts page to configure roles, then come back here to enter
        headcount.
      </Alert>
    );
  }

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="subtitle2">Headcount entry</Typography>
        {savedFlash && (
          <Chip label="Saved" color="success" size="small" />
        )}
      </Stack>

      <TextField
        label="Date"
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        size="small"
        InputLabelProps={{ shrink: true }}
        sx={{ mb: 1.5, width: 180 }}
      />

      <Stack spacing={1}>
        {data.rates.map((r: RoleRate) => (
          <Stack
            key={r.roleId}
            direction="row"
            alignItems="center"
            spacing={1.5}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2">{r.roleName}</Typography>
              <Typography variant="caption" color="text.secondary">
                ₹{formatINR(r.dailyRate)}/day
              </Typography>
            </Box>
            <TextField
              size="small"
              value={units[r.roleId] ?? ""}
              onChange={(e) =>
                setUnits((u) => ({
                  ...u,
                  [r.roleId]: e.target.value.replace(/[^0-9.]/g, ""),
                }))
              }
              placeholder="0"
              sx={{ width: 100 }}
              inputProps={{ inputMode: "decimal" }}
              helperText="units"
            />
            <Typography variant="caption" sx={{ width: 100, color: "text.secondary" }}>
              {(() => {
                const n = Number(units[r.roleId] || "0");
                return Number.isNaN(n) || n === 0
                  ? "—"
                  : `₹${formatINR(n * r.dailyRate)}`;
              })()}
            </Typography>
          </Stack>
        ))}
      </Stack>

      <Divider sx={{ my: 1.5 }} />

      <TextField
        label="Note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        size="small"
        fullWidth
        sx={{ mb: 1 }}
      />

      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
        <Typography variant="caption" color="text.secondary">
          Implied labor value for {date}: <strong>₹{formatINR(impliedTotal)}</strong>
        </Typography>
        <Button
          variant="contained"
          size="small"
          onClick={handleSave}
          disabled={saving}
          startIcon={saving ? <CircularProgress size={14} /> : <SaveIcon />}
        >
          {saving ? "Saving…" : "Save day"}
        </Button>
      </Stack>

      {saveError && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {saveError}
        </Alert>
      )}
    </Paper>
  );
}
