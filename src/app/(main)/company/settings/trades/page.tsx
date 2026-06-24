"use client";

import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { Add, Edit, Delete, Restore } from "@mui/icons-material";
import PageHeader from "@/components/layout/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { hasEditPermission } from "@/lib/permissions";
import {
  useLaborCategories,
  useCreateLaborCategory,
  useUpdateLaborCategory,
  useDeleteLaborCategory,
  TradeInUseError,
  SystemSeedTradeError,
  type LaborCategory,
} from "@/hooks/queries/useLaborCategories";
import { useTradeWorkspaceUsage } from "@/hooks/queries/useTradeWorkspaceUsage";

interface FormState {
  name: string;
  description: string;
  display_order: number;
  is_active: boolean;
}

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  display_order: 0,
  is_active: true,
};

export default function TradesSettingsPage() {
  const { userProfile } = useAuth();
  const canEdit = hasEditPermission(userProfile?.role);

  const { data: categories = [], isLoading } = useLaborCategories(false);
  const { data: usage = [] } = useTradeWorkspaceUsage();
  const createC = useCreateLaborCategory();
  const updateC = useUpdateLaborCategory();
  const deleteC = useDeleteLaborCategory();
  const saving = createC.isPending || updateC.isPending || deleteC.isPending;

  // Workspace-data counts per trade → lock the "Workspace" toggle ON when a trade
  // already holds data (turning it off is hide-only and must never lose anything).
  const usageMap = useMemo(
    () => new Map(usage.map((u) => [u.trade_category_id, u.total_workspace_rows])),
    [usage]
  );

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LaborCategory | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState("");
  const [reactivateCandidate, setReactivateCandidate] = useState<LaborCategory | null>(null);

  const active = useMemo(() => categories.filter((c) => c.is_active), [categories]);
  const inactive = useMemo(() => categories.filter((c) => !c.is_active), [categories]);
  const nextOrder = useMemo(
    () => categories.reduce((max, c) => Math.max(max, c.display_order), 0) + 1,
    [categories]
  );

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, display_order: nextOrder });
    setError("");
    setReactivateCandidate(null);
    setOpen(true);
  };

  const openEdit = (c: LaborCategory) => {
    setEditing(c);
    setForm({
      name: c.name,
      description: c.description ?? "",
      display_order: c.display_order,
      is_active: c.is_active,
    });
    setError("");
    setReactivateCandidate(null);
    setOpen(true);
  };

  const handleSave = async () => {
    const name = form.name.trim();
    if (!name) {
      setError("Name is required");
      return;
    }

    // Trade names are UNIQUE. On create, catch a clash early — if a DISABLED
    // trade already owns the name, offer to reactivate it instead.
    if (!editing) {
      const clash = categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
      if (clash) {
        if (clash.is_active) {
          setError(`A trade named "${clash.name}" already exists.`);
        } else {
          setReactivateCandidate(clash);
          setError(`"${clash.name}" already exists but is disabled.`);
        }
        return;
      }
    }

    try {
      if (editing) {
        await updateC.mutateAsync({
          id: editing.id,
          name,
          description: form.description,
          display_order: Number(form.display_order) || 0,
          is_active: form.is_active,
        });
      } else {
        await createC.mutateAsync({
          name,
          description: form.description,
          display_order: Number(form.display_order) || nextOrder,
          is_active: form.is_active,
        });
      }
      setOpen(false);
    } catch (e) {
      const err = e as { code?: string; message?: string };
      if (err.code === "23505") {
        setError("A trade with this name already exists.");
      } else {
        setError(err.message ?? "Could not save trade.");
      }
    }
  };

  const handleReactivate = async (c: LaborCategory) => {
    try {
      await updateC.mutateAsync({
        id: c.id,
        is_active: true,
        description: form.description.trim() || c.description,
        display_order: Number(form.display_order) || c.display_order,
      });
      setOpen(false);
      setReactivateCandidate(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleToggleActive = async (c: LaborCategory) => {
    try {
      await updateC.mutateAsync({ id: c.id, is_active: !c.is_active });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleToggleWorkspace = async (c: LaborCategory) => {
    // Guard (defensive — the disabled Switch already blocks this): a trade holding
    // workspace data can never be switched off. Turning off is hide-only; data stays.
    const lockedOn = (usageMap.get(c.id) ?? 0) > 0;
    if (c.has_workspace && lockedOn) return;
    try {
      await updateC.mutateAsync({ id: c.id, has_workspace: !c.has_workspace });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleDelete = async (c: LaborCategory) => {
    if (c.is_system_seed) {
      setError(`"${c.name}" is a built-in trade — disable it instead of deleting.`);
      return;
    }
    if (!confirm(`Delete "${c.name}" permanently?`)) return;
    try {
      await deleteC.mutateAsync(c.id);
    } catch (e) {
      if (e instanceof SystemSeedTradeError) {
        setError(e.message);
        return;
      }
      if (e instanceof TradeInUseError) {
        if (
          c.is_active &&
          confirm(
            `${e.message}\n\nIt can't be deleted while in use. Disable it instead so it stops appearing as an option but existing contracts keep their trade?`
          )
        ) {
          try {
            await updateC.mutateAsync({ id: c.id, is_active: false });
          } catch (e2) {
            setError((e2 as Error).message);
          }
        } else if (!c.is_active) {
          setError(`${e.message} It's already disabled, so leave it as-is.`);
        }
        return;
      }
      setError((e as Error).message);
    }
  };

  const renderCard = (c: LaborCategory) => {
    // Workspace toggle guard: any live workspace data locks it ON.
    const usageRows = usageMap.get(c.id) ?? 0;
    const lockedOn = usageRows > 0;
    const wsDisabled = !canEdit || saving || (c.has_workspace && lockedOn);
    const wsTooltip = c.has_workspace
      ? lockedOn
        ? `Workspace ON — this trade has ${usageRows} attendance / settlement ${
            usageRows === 1 ? "entry" : "entries"
          } linked to all-site expenses, so it can't be switched off.`
        : "Workspace ON — full attendance, salary, tea & holidays. No data yet, so you can switch it off."
      : "Workspace OFF — ladder only (contracts, sections, tasks). Switch on to add attendance, salary, tea & holidays.";

    return (
    <Card key={c.id} variant="outlined" sx={{ p: 1.5, opacity: c.is_active ? 1 : 0.6 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap" }}>
            <Typography variant="subtitle2" fontWeight={600}>
              {c.display_order}. {c.name}
            </Typography>
            {c.is_system_seed && <Chip size="small" variant="outlined" label="built-in" />}
            {!c.is_active && <Chip size="small" color="warning" label="disabled" />}
            {!c.has_workspace && <Chip size="small" variant="outlined" label="ladder only" />}
          </Stack>
          {c.description && (
            <Typography variant="body2" color="text.secondary">
              {c.description}
            </Typography>
          )}
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
          {/* Workspace = the full attendance/salary/tea/holiday surface for this trade. */}
          <Tooltip title={wsTooltip}>
            <Box sx={{ textAlign: "center" }}>
              <Typography variant="caption" sx={{ display: "block", color: "text.secondary", lineHeight: 1.1 }}>
                Workspace
              </Typography>
              <Switch
                size="small"
                checked={c.has_workspace}
                disabled={wsDisabled}
                onChange={() => handleToggleWorkspace(c)}
              />
            </Box>
          </Tooltip>
          {/* Active = offered as a choice when creating new contracts. */}
          <Tooltip title={c.is_active ? "Active — offered for new contracts" : "Disabled — hidden from new contracts"}>
            <Box sx={{ textAlign: "center" }}>
              <Typography variant="caption" sx={{ display: "block", color: "text.secondary", lineHeight: 1.1 }}>
                Active
              </Typography>
              <Switch
                size="small"
                checked={c.is_active}
                disabled={!canEdit || saving}
                onChange={() => handleToggleActive(c)}
              />
            </Box>
          </Tooltip>
          {!c.is_active && (
            <Tooltip title="Reactivate">
              <span>
                <IconButton size="small" disabled={!canEdit || saving} onClick={() => handleToggleActive(c)}>
                  <Restore fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          )}
          <IconButton size="small" disabled={!canEdit} onClick={() => openEdit(c)}>
            <Edit fontSize="small" />
          </IconButton>
          {/* Built-in trades can't be deleted, only disabled. */}
          {!c.is_system_seed && (
            <IconButton size="small" color="error" disabled={!canEdit || saving} onClick={() => handleDelete(c)}>
              <Delete fontSize="small" />
            </IconButton>
          )}
        </Stack>
      </Stack>
    </Card>
    );
  };

  return (
    <Box>
      <PageHeader
        title="Trades"
        subtitle="Trade categories used across the Workforce workspace (Civil, Electrical, Painting…)"
        actions={
          <Button variant="contained" startIcon={<Add />} disabled={!canEdit} onClick={openCreate}>
            Add trade
          </Button>
        }
      />

      <Alert severity="info" sx={{ mb: 2 }}>
        Trades are shared across <strong>every site</strong>. <strong>Workspace ON</strong> gives a trade its own
        full operating surface — per-labourer attendance, salary settlements, tea &amp; holidays (like Civil).
        <strong> Workspace OFF</strong> keeps only the contract ▸ section ▸ task ladder (organise, cost &amp;
        pay out) — no attendance or salary. Once a trade holds attendance/settlement data its workspace locks
        ON (turning off only hides — it never deletes). <strong>Active</strong> simply controls whether the
        trade is offered when creating new contracts. Built-in trades can be disabled but not deleted.
      </Alert>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      {isLoading ? (
        <Typography color="text.secondary">Loading…</Typography>
      ) : categories.length === 0 ? (
        <Typography variant="body2" color="text.disabled" sx={{ fontStyle: "italic" }}>
          No trades yet. Add the first one.
        </Typography>
      ) : (
        <Stack spacing={3}>
          <Box>
            <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
              Active
            </Typography>
            {active.length === 0 ? (
              <Typography variant="body2" color="text.disabled" sx={{ fontStyle: "italic" }}>
                No active trades.
              </Typography>
            ) : (
              <Stack spacing={1}>{active.map(renderCard)}</Stack>
            )}
          </Box>

          {inactive.length > 0 && (
            <Box>
              <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
                Disabled
              </Typography>
              <Stack spacing={1}>{inactive.map(renderCard)}</Stack>
            </Box>
          )}
        </Stack>
      )}

      {/* Add / edit dialog */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? "Edit trade" : "Add trade"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {error && (
              <Alert
                severity={reactivateCandidate ? "warning" : "error"}
                action={
                  reactivateCandidate ? (
                    <Button
                      color="inherit"
                      size="small"
                      disabled={!canEdit || saving}
                      onClick={() => handleReactivate(reactivateCandidate)}
                    >
                      Reactivate
                    </Button>
                  ) : undefined
                }
              >
                {error}
              </Alert>
            )}
            <TextField
              label="Name"
              value={form.name}
              onChange={(e) => {
                setForm({ ...form, name: e.target.value });
                if (error) {
                  setError("");
                  setReactivateCandidate(null);
                }
              }}
              fullWidth
              required
              autoFocus
              slotProps={{ htmlInput: { maxLength: 100 } }}
            />
            <TextField
              label="Description (optional)"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              fullWidth
              multiline
              rows={2}
            />
            <Stack direction="row" spacing={2} alignItems="center">
              <TextField
                label="Order"
                type="number"
                value={form.display_order}
                onChange={(e) => setForm({ ...form, display_order: Number(e.target.value) })}
                size="small"
                sx={{ width: 110 }}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  />
                }
                label="Active"
              />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!canEdit || saving} onClick={handleSave}>
            {editing ? "Save" : "Add trade"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
