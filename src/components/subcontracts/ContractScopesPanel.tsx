"use client";

import React, { useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Layers as LayersIcon,
} from "@mui/icons-material";
import { blurOnWheel } from "@/lib/utils/numberInput";
import {
  useSubcontractScopes,
  useAddSubcontractScope,
  useUpdateSubcontractScope,
  useDeleteSubcontractScope,
  scopeImpliedRate,
  scopeReconciledValue,
  type SubcontractScope,
} from "@/hooks/queries/useSubcontractScopes";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

interface Props {
  contractId: string;
  /** Parent contract total — shown alongside the scopes' estimated total. */
  contractValue?: number;
  canEdit?: boolean;
}

interface DraftScope {
  id?: string;
  name: string;
  estimated_value: string;
  estimated_sqft: string;
}

const emptyDraft: DraftScope = {
  name: "",
  estimated_value: "",
  estimated_sqft: "",
};

/**
 * Phase 5 — manage a contract's optional child scopes (e.g. floors). Money and
 * attendance live on the parent contract; scopes are the breakdown used for the
 * end-of-project sqft reconciliation. A contract with no scopes is a single-scope job.
 */
export default function ContractScopesPanel({
  contractId,
  contractValue,
  canEdit = true,
}: Props) {
  const { data: scopes = [], isLoading } = useSubcontractScopes(contractId);
  const addMut = useAddSubcontractScope(contractId);
  const updateMut = useUpdateSubcontractScope(contractId);
  const deleteMut = useDeleteSubcontractScope(contractId);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<DraftScope>(emptyDraft);
  const [error, setError] = useState("");

  const totals = useMemo(() => {
    const estimated = scopes.reduce(
      (s, sc) => s + (Number(sc.estimated_value) || 0),
      0
    );
    const reconciled = scopes.reduce((s, sc) => s + scopeReconciledValue(sc), 0);
    const anyActual = scopes.some((sc) => sc.actual_sqft != null);
    return { estimated, reconciled, anyActual };
  }, [scopes]);

  const openAdd = () => {
    setDraft({ ...emptyDraft, name: "" });
    setError("");
    setDialogOpen(true);
  };
  const openEdit = (sc: SubcontractScope) => {
    setDraft({
      id: sc.id,
      name: sc.name,
      estimated_value: sc.estimated_value ? String(sc.estimated_value) : "",
      estimated_sqft: sc.estimated_sqft != null ? String(sc.estimated_sqft) : "",
    });
    setError("");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!draft.name.trim()) {
      setError("Scope name is required (e.g. “1st Floor”).");
      return;
    }
    const payload = {
      name: draft.name.trim(),
      estimated_value: Number(draft.estimated_value) || 0,
      estimated_sqft: draft.estimated_sqft === "" ? null : Number(draft.estimated_sqft),
    };
    try {
      if (draft.id) {
        await updateMut.mutateAsync({ id: draft.id, patch: payload });
      } else {
        await addMut.mutateAsync({ ...payload, sort_order: scopes.length });
      }
      setDialogOpen(false);
    } catch (e: any) {
      setError(e?.message || "Failed to save the scope.");
    }
  };

  const saveActualSqft = (sc: SubcontractScope, value: string) => {
    const actual_sqft = value === "" ? null : Number(value);
    if (actual_sqft === sc.actual_sqft) return;
    updateMut.mutate({ id: sc.id, patch: { actual_sqft } });
  };

  const handleDelete = (sc: SubcontractScope) => {
    if (!window.confirm(`Delete scope “${sc.name}”?`)) return;
    deleteMut.mutate(sc.id);
  };

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 1,
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <LayersIcon fontSize="small" color="action" />
          <Typography variant="subtitle2">
            Scopes{scopes.length > 0 ? ` (${scopes.length})` : ""}
          </Typography>
        </Box>
        {canEdit && (
          <Button size="small" startIcon={<AddIcon />} onClick={openAdd}>
            Add scope
          </Button>
        )}
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
        Optional breakdown (e.g. floors). Payments &amp; attendance stay on the contract;
        enter actual sqft at close to reconcile.
      </Typography>

      {isLoading ? (
        <Typography variant="body2" color="text.secondary">
          Loading scopes…
        </Typography>
      ) : scopes.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 1.5, textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary">
            Single-scope contract — no breakdown. Add scopes (floors / sections) to
            split it for the final sqft reckoning.
          </Typography>
        </Paper>
      ) : (
        <Stack spacing={1}>
          {scopes.map((sc) => {
            const rate = scopeImpliedRate(sc);
            const reconciled = scopeReconciledValue(sc);
            return (
              <Paper key={sc.id} variant="outlined" sx={{ p: 1.25 }}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 1,
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} noWrap>
                      {sc.name}
                    </Typography>
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={`Est ${inr(Number(sc.estimated_value) || 0)}`}
                      />
                      {sc.estimated_sqft != null && (
                        <Chip
                          size="small"
                          variant="outlined"
                          label={`${Number(sc.estimated_sqft).toLocaleString("en-IN")} sqft`}
                        />
                      )}
                      {rate != null && (
                        <Chip
                          size="small"
                          variant="outlined"
                          label={`~${inr(rate)}/sqft`}
                        />
                      )}
                    </Box>
                  </Box>
                  {canEdit && (
                    <Box sx={{ flexShrink: 0 }}>
                      <Tooltip title="Edit scope">
                        <IconButton size="small" onClick={() => openEdit(sc)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete scope">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDelete(sc)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  )}
                </Box>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    mt: 1,
                    flexWrap: "wrap",
                  }}
                >
                  <TextField
                    size="small"
                    type="number"
                    label="Actual sqft (at close)"
                    defaultValue={sc.actual_sqft ?? ""}
                    disabled={!canEdit}
                    onWheel={blurOnWheel}
                    onBlur={(e) => saveActualSqft(sc, e.target.value)}
                    sx={{ width: 170 }}
                  />
                  <Typography variant="body2" color="text.secondary">
                    Reconciled:{" "}
                    <strong>{inr(reconciled)}</strong>
                    {sc.actual_sqft != null &&
                      rate != null &&
                      sc.estimated_sqft != null && (
                        <Typography
                          component="span"
                          variant="caption"
                          color={
                            sc.actual_sqft > sc.estimated_sqft
                              ? "error.main"
                              : "success.main"
                          }
                          sx={{ ml: 0.5 }}
                        >
                          ({sc.actual_sqft > sc.estimated_sqft ? "+" : ""}
                          {(
                            Number(sc.actual_sqft) - Number(sc.estimated_sqft)
                          ).toLocaleString("en-IN")}{" "}
                          sqft vs est)
                        </Typography>
                      )}
                  </Typography>
                </Box>
              </Paper>
            );
          })}

          <Divider sx={{ my: 0.5 }} />
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 1,
            }}
          >
            <Typography variant="body2" color="text.secondary">
              Scopes estimated total: <strong>{inr(totals.estimated)}</strong>
              {contractValue != null && (
                <Typography component="span" variant="caption" sx={{ ml: 0.5 }}>
                  (contract {inr(contractValue)})
                </Typography>
              )}
            </Typography>
            {totals.anyActual && (
              <Typography variant="body2" color="primary.main">
                Reconciled total: <strong>{inr(totals.reconciled)}</strong>
              </Typography>
            )}
          </Box>
        </Stack>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{draft.id ? "Edit scope" : "Add scope"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {error && (
              <Typography variant="body2" color="error">
                {error}
              </Typography>
            )}
            <TextField
              label="Scope name"
              placeholder="e.g. 1st Floor Construction"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              fullWidth
              required
            />
            <TextField
              label="Estimated value"
              type="number"
              value={draft.estimated_value}
              onChange={(e) =>
                setDraft({ ...draft, estimated_value: e.target.value })
              }
              onWheel={blurOnWheel}
              fullWidth
              slotProps={{ input: { startAdornment: "₹" } }}
            />
            <TextField
              label="Estimated sqft (optional)"
              type="number"
              value={draft.estimated_sqft}
              onChange={(e) =>
                setDraft({ ...draft, estimated_sqft: e.target.value })
              }
              onWheel={blurOnWheel}
              fullWidth
              helperText="Used to imply a per-sqft rate for reconciliation."
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={addMut.isPending || updateMut.isPending}
          >
            {draft.id ? "Save" : "Add"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
