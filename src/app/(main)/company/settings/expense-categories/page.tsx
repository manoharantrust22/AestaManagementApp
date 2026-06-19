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
  useMiscExpenseCategories,
  useCreateMiscExpenseCategory,
  useUpdateMiscExpenseCategory,
  useDeleteMiscExpenseCategory,
  CategoryInUseError,
  type MiscExpenseCategory,
} from "@/hooks/queries/useMiscExpenseCategories";

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

export default function ExpenseCategoriesSettingsPage() {
  const { userProfile } = useAuth();
  const canEdit = hasEditPermission(userProfile?.role);

  const { data: categories = [], isLoading } = useMiscExpenseCategories(false);
  const createC = useCreateMiscExpenseCategory();
  const updateC = useUpdateMiscExpenseCategory();
  const deleteC = useDeleteMiscExpenseCategory();
  const saving = createC.isPending || updateC.isPending || deleteC.isPending;

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MiscExpenseCategory | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState("");
  // Set when a new name collides with an existing DISABLED category — offer to reactivate it.
  const [reactivateCandidate, setReactivateCandidate] = useState<MiscExpenseCategory | null>(null);

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

  const openEdit = (c: MiscExpenseCategory) => {
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

    // Names are unique per module (DB enforces UNIQUE(module, name)). On create, catch a
    // clash early — if a DISABLED category already owns the name, offer to reactivate it.
    if (!editing) {
      const clash = categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
      if (clash) {
        if (clash.is_active) {
          setError(`A category named "${clash.name}" already exists.`);
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
      // Backstop for a race on the UNIQUE(module, name) constraint.
      if (err.code === "23505") {
        setError("A category with this name already exists.");
      } else {
        setError(err.message ?? "Could not save category.");
      }
    }
  };

  const handleReactivate = async (c: MiscExpenseCategory) => {
    try {
      await updateC.mutateAsync({
        id: c.id,
        is_active: true,
        // carry over any description/order the user typed while attempting to re-create it
        description: form.description.trim() || c.description,
        display_order: Number(form.display_order) || c.display_order,
      });
      setOpen(false);
      setReactivateCandidate(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleToggleActive = async (c: MiscExpenseCategory) => {
    try {
      await updateC.mutateAsync({ id: c.id, is_active: !c.is_active });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleDelete = async (c: MiscExpenseCategory) => {
    if (!confirm(`Delete "${c.name}" permanently?`)) return;
    try {
      await deleteC.mutateAsync(c.id);
    } catch (e) {
      if (e instanceof CategoryInUseError) {
        if (
          c.is_active &&
          confirm(
            `${e.message}\n\nIt can't be deleted while in use. Disable it instead so it stops appearing in dropdowns but past expenses keep their category?`
          )
        ) {
          try {
            await updateC.mutateAsync({ id: c.id, is_active: false });
          } catch (e2) {
            setError((e2 as Error).message);
          }
        } else if (!c.is_active) {
          setError(`${e.message} It's already disabled, so leave it as-is to preserve those expenses.`);
        }
        return;
      }
      setError((e as Error).message);
    }
  };

  const renderCard = (c: MiscExpenseCategory) => (
    <Card key={c.id} variant="outlined" sx={{ p: 1.5, opacity: c.is_active ? 1 : 0.6 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap" }}>
            <Typography variant="subtitle2" fontWeight={600}>
              {c.display_order}. {c.name}
            </Typography>
            {!c.is_active && <Chip size="small" color="warning" label="disabled" />}
          </Stack>
          {c.description && (
            <Typography variant="body2" color="text.secondary">
              {c.description}
            </Typography>
          )}
        </Box>
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
          <Tooltip title={c.is_active ? "Active — shown in dropdowns" : "Disabled — hidden from dropdowns"}>
            <Switch
              size="small"
              checked={c.is_active}
              disabled={!canEdit || saving}
              onChange={() => handleToggleActive(c)}
            />
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
          <IconButton size="small" color="error" disabled={!canEdit || saving} onClick={() => handleDelete(c)}>
            <Delete fontSize="small" />
          </IconButton>
        </Stack>
      </Stack>
    </Card>
  );

  return (
    <Box>
      <PageHeader
        title="Expense categories"
        subtitle="Miscellaneous expense types used across the app and the bulk-upload template"
        actions={
          <Button variant="contained" startIcon={<Add />} disabled={!canEdit} onClick={openCreate}>
            Add category
          </Button>
        }
      />

      <Alert severity="info" sx={{ mb: 2 }}>
        These categories are shared across every site and company. An active category appears in the
        miscellaneous-expense form, the expenses filters, and the <strong>category</strong> dropdown in the
        bulk-upload Excel template the next time it&apos;s downloaded.
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
          No categories yet. Add the first one.
        </Typography>
      ) : (
        <Stack spacing={3}>
          <Box>
            <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
              Active
            </Typography>
            {active.length === 0 ? (
              <Typography variant="body2" color="text.disabled" sx={{ fontStyle: "italic" }}>
                No active categories.
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
        <DialogTitle>{editing ? "Edit category" : "Add category"}</DialogTitle>
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
            {editing ? "Save" : "Add category"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
