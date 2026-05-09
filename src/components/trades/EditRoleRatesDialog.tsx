"use client";

import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Stack,
  Typography,
  InputAdornment,
  Alert,
  CircularProgress,
} from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useContractHeadcount } from "@/hooks/queries/useContractHeadcount";

interface EditRoleRatesDialogProps {
  open: boolean;
  onClose: () => void;
  contractId: string;
  contractTitle: string;
}

/**
 * Edit ₹/day per role for a headcount-mode contract. Updates rows in
 * subcontract_role_rates. Existing headcount entries continue to use the
 * rate that was active when they were entered (rates aren't denormalized
 * onto entries today, so changing rates retroactively re-prices history —
 * a deliberate trade-off until we add rate history).
 */
export function EditRoleRatesDialog({
  open,
  onClose,
  contractId,
  contractTitle,
}: EditRoleRatesDialogProps) {
  const queryClient = useQueryClient();
  const supabase = createClient();
  const { data: headcount, isLoading } = useContractHeadcount(
    open ? contractId : undefined
  );

  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (headcount?.rates) {
      const map: Record<string, string> = {};
      for (const r of headcount.rates) {
        map[r.roleId] = String(r.dailyRate);
      }
      setDraft(map);
    }
  }, [headcount]);

  const handleSave = async () => {
    if (!headcount) return;
    setSaving(true);
    setError(null);
    try {
      const sb = supabase as any;
      const updates = headcount.rates
        .map((r) => ({
          roleId: r.roleId,
          oldRate: r.dailyRate,
          newRate: Number(draft[r.roleId] ?? 0),
        }))
        .filter(
          (u) =>
            !Number.isNaN(u.newRate) && u.newRate > 0 && u.newRate !== u.oldRate
        );

      if (updates.length === 0) {
        onClose();
        return;
      }

      // One update per row — small N, simple UPSERT-style by (subcontract_id, role_id).
      for (const u of updates) {
        const { error: e } = await sb
          .from("subcontract_role_rates")
          .update({ daily_rate: u.newRate })
          .eq("subcontract_id", contractId)
          .eq("role_id", u.roleId);
        if (e) throw e;
      }

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["contract-headcount", contractId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["trade-attendance-summary", contractId],
        }),
      ]);
      onClose();
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  const isHeadcountWithRates =
    !!headcount && headcount.rates && headcount.rates.length > 0;

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Edit role rates</DialogTitle>
      <DialogContent dividers>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
          {contractTitle}
        </Typography>

        {isLoading && (
          <Stack alignItems="center" sx={{ py: 3 }}>
            <CircularProgress size={24} />
          </Stack>
        )}

        {!isLoading && !isHeadcountWithRates && (
          <Alert severity="info">
            This contract isn&apos;t in headcount mode, or no roles have been
            seeded. Switch to headcount mode first to manage per-role rates.
          </Alert>
        )}

        {isHeadcountWithRates && (
          <>
            <Stack spacing={2}>
              {headcount!.rates.map((r) => (
                <TextField
                  key={r.roleId}
                  label={r.roleName}
                  type="number"
                  value={draft[r.roleId] ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [r.roleId]: e.target.value }))
                  }
                  fullWidth
                  size="small"
                  InputProps={{
                    startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                    endAdornment: <InputAdornment position="end">/day</InputAdornment>,
                  }}
                  inputProps={{ min: 0, step: 10 }}
                />
              ))}
            </Stack>
            <Alert severity="warning" sx={{ mt: 2 }}>
              Changing a rate re-prices any past headcount entries that used
              the old rate. KPIs and balances refresh immediately.
            </Alert>
          </>
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
          disabled={saving || !isHeadcountWithRates}
        >
          {saving ? "Saving…" : "Save rates"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
