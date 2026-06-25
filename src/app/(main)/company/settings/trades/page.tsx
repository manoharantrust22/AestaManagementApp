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
  MenuItem,
  Select,
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
  const createC = useCreateLaborCategory();
  const updateC = useUpdateLaborCategory();
  const deleteC = useDeleteLaborCategory();
  const saving = createC.isPending || updateC.isPending || deleteC.isPending;

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

  const handleTeaModeChange = async (
    c: LaborCategory,
    mode: "pool" | "own" | "off",
    hostId: string | null
  ) => {
    try {
      await updateC.mutateAsync({
        id: c.id,
        tea_mode: mode,
        // 'own' hosts itself; 'pool' uses the chosen host (fallback = current/self);
        // 'off' keeps whatever host was set (ignored while off).
        tea_pool_host_category_id:
          mode === "own"
            ? c.id
            : mode === "pool"
              ? hostId ?? c.tea_pool_host_category_id
              : c.tea_pool_host_category_id,
      });
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
    return (
    <Card key={c.id} variant="outlined" sx={{ p: 1.5, opacity: c.is_active ? 1 : 0.6 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap" }}>
            <Typography variant="subtitle2" fontWeight={600}>
              {c.display_order}. {c.name}
            </Typography>
            {c.is_system_seed && <Chip size="small" variant="outlined" label="built-in" />}
            {!c.is_active && <Chip size="small" color="warning" label="retired" />}
          </Stack>
          {c.description && (
            <Typography variant="body2" color="text.secondary">
              {c.description}
            </Typography>
          )}
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
          {/* Tea: how this trade takes part in the shared tea pool. */}
          <Box sx={{ textAlign: "center", minWidth: 140 }}>
            <Typography variant="caption" sx={{ display: "block", color: "text.secondary", lineHeight: 1.1 }}>
              Tea
            </Typography>
            <Select
              size="small"
              value={c.tea_mode}
              onChange={(e) =>
                handleTeaModeChange(c, e.target.value as "pool" | "own" | "off", c.tea_pool_host_category_id)
              }
              sx={{ fontSize: 12 }}
            >
              <MenuItem value="pool">Share pool</MenuItem>
              <MenuItem value="own">Own tea</MenuItem>
              <MenuItem value="off">No tea</MenuItem>
            </Select>
            {c.tea_mode === "pool" && (
              <Select
                size="small"
                displayEmpty
                value={c.tea_pool_host_category_id ?? ""}
                onChange={(e) => handleTeaModeChange(c, "pool", (e.target.value as string) || null)}
                sx={{ fontSize: 12, mt: 0.5, display: "block" }}
              >
                {categories
                  .filter((o) => o.tea_mode !== "off" || o.id === c.tea_pool_host_category_id)
                  .map((o) => (
                    <MenuItem key={o.id} value={o.id}>
                      with {o.name}
                    </MenuItem>
                  ))}
              </Select>
            )}
          </Box>
          {/* In catalog = the trade exists for sites to use. Retiring hides it everywhere;
              per-site offering & workspace are set under Site Settings → Trade Workspaces. */}
          <Tooltip
            title={
              c.is_active
                ? "In catalog — available to all sites. Offering & workspace are set per-site (Site Settings → Trade Workspaces)."
                : "Retired — hidden from every site"
            }
          >
            <Box sx={{ textAlign: "center" }}>
              <Typography variant="caption" sx={{ display: "block", color: "text.secondary", lineHeight: 1.1 }}>
                In catalog
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
        Trades are defined once and shared across <strong>every site</strong> — set a trade&apos;s name, tea
        and order here. Whether a trade runs its <strong>workspace</strong> (per-labourer attendance, salary,
        tea &amp; holidays) and is <strong>offered for new contracts</strong> is now set
        <strong> per-site</strong> under <strong>Site Settings → Trade Workspaces</strong>.
        <strong> In catalog</strong> keeps a trade available to sites; retiring it hides the trade everywhere
        (existing data is never deleted). Built-in trades can be retired but not deleted.
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
              In catalog
            </Typography>
            {active.length === 0 ? (
              <Typography variant="body2" color="text.disabled" sx={{ fontStyle: "italic" }}>
                No trades in the catalog.
              </Typography>
            ) : (
              <Stack spacing={1}>{active.map(renderCard)}</Stack>
            )}
          </Box>

          {inactive.length > 0 && (
            <Box>
              <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
                Retired
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
