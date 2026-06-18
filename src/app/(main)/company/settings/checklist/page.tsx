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
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { Add, Edit, Delete, AutoMode, TouchApp } from "@mui/icons-material";
import PageHeader from "@/components/layout/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useSelectedSite } from "@/contexts/SiteContext";
import { hasEditPermission } from "@/lib/permissions";
import {
  useChecklistTemplates,
  useCreateChecklistTemplate,
  useUpdateChecklistTemplate,
  useDeleteChecklistTemplate,
  type ChecklistTemplateInput,
} from "@/hooks/queries/useChecklistTemplates";
import type {
  ChecklistTemplate,
  ChecklistRole,
  DetectionSource,
} from "@/types/checklist.types";

const ROLE_ORDER: ChecklistRole[] = ["site_engineer", "office", "admin"];
const ROLE_LABEL: Record<ChecklistRole, string> = {
  site_engineer: "Site engineer",
  office: "Office",
  admin: "Admin",
};

const DETECTION_SOURCES: { value: DetectionSource; label: string }[] = [
  { value: "attendance_morning", label: "Morning attendance" },
  { value: "attendance_evening", label: "Evening closing" },
  { value: "stock_confirmation", label: "Stock confirmation" },
  { value: "material_usage", label: "Material usage" },
  { value: "wallet_settlement", label: "Wallet settlements" },
  { value: "delivery_status", label: "Delivery status" },
];

interface FormState {
  role: ChecklistRole;
  item_key: string;
  label: string;
  description: string;
  detection_type: "auto" | "manual";
  detection_source: DetectionSource | "";
  deep_link_path: string;
  applies_scope: "per_site" | "per_user";
  allow_defer: boolean;
  requires_defer_reason: boolean;
  sort_order: number;
  is_active: boolean;
}

const EMPTY_FORM: FormState = {
  role: "site_engineer",
  item_key: "",
  label: "",
  description: "",
  detection_type: "manual",
  detection_source: "",
  deep_link_path: "",
  applies_scope: "per_site",
  allow_defer: true,
  requires_defer_reason: true,
  sort_order: 0,
  is_active: true,
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
}

export default function ChecklistSettingsPage() {
  const { userProfile } = useAuth();
  const { selectedSite } = useSelectedSite();
  const companyId = selectedSite?.company_id ?? undefined;
  const canEdit = hasEditPermission(userProfile?.role);

  const { data: templates = [], isLoading } = useChecklistTemplates(companyId);
  const createT = useCreateChecklistTemplate();
  const updateT = useUpdateChecklistTemplate();
  const deleteT = useDeleteChecklistTemplate();
  const saving = createT.isPending || updateT.isPending || deleteT.isPending;

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ChecklistTemplate | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState("");

  const grouped = useMemo(() => {
    const m = new Map<ChecklistRole, ChecklistTemplate[]>();
    for (const t of templates) {
      const arr = m.get(t.role as ChecklistRole) ?? [];
      arr.push(t);
      m.set(t.role as ChecklistRole, arr);
    }
    return m;
  }, [templates]);

  const openCreate = (role: ChecklistRole) => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, role, sort_order: (grouped.get(role)?.length ?? 0) + 1 });
    setError("");
    setOpen(true);
  };

  const openEdit = (t: ChecklistTemplate) => {
    setEditing(t);
    setForm({
      role: t.role as ChecklistRole,
      item_key: t.item_key,
      label: t.label,
      description: t.description ?? "",
      detection_type: t.detection_type,
      detection_source: (t.detection_source ?? "") as DetectionSource | "",
      deep_link_path: t.deep_link_path ?? "",
      applies_scope: t.applies_scope,
      allow_defer: t.allow_defer,
      requires_defer_reason: t.requires_defer_reason,
      sort_order: t.sort_order,
      is_active: t.is_active,
    });
    setError("");
    setOpen(true);
  };

  const handleSave = async () => {
    if (!form.label.trim()) {
      setError("Label is required");
      return;
    }
    if (form.detection_type === "auto" && !form.detection_source) {
      setError("Pick a detection source for an auto item");
      return;
    }
    const payload: ChecklistTemplateInput = {
      role: form.role,
      item_key: editing ? form.item_key : form.item_key.trim() || slugify(form.label),
      label: form.label.trim(),
      description: form.description.trim() || null,
      detection_type: form.detection_type,
      detection_source:
        form.detection_type === "auto" ? (form.detection_source as DetectionSource) : null,
      deep_link_path: form.deep_link_path.trim() || null,
      applies_scope: form.applies_scope,
      allow_defer: form.allow_defer,
      requires_defer_reason: form.requires_defer_reason,
      sort_order: Number(form.sort_order) || 0,
      is_active: form.is_active,
    };
    try {
      if (editing) {
        await updateT.mutateAsync({ id: editing.id, ...payload });
      } else {
        await createT.mutateAsync({ ...payload, company_id: companyId as string });
      }
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleDelete = async (t: ChecklistTemplate) => {
    if (!confirm(`Delete "${t.label}"? Its history will be removed.`)) return;
    try {
      await deleteT.mutateAsync(t.id);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Box>
      <PageHeader
        title="Daily checklist setup"
        subtitle="Define the recurring duties each role must complete every day"
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      {!companyId ? (
        <Alert severity="warning">Pick a site from the menu to load company settings.</Alert>
      ) : isLoading ? (
        <Typography color="text.secondary">Loading…</Typography>
      ) : (
        ROLE_ORDER.map((role) => {
          const items = grouped.get(role) ?? [];
          return (
            <Box key={role} sx={{ mb: 3 }}>
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                <Typography variant="h6" fontWeight={600}>
                  {ROLE_LABEL[role]}
                </Typography>
                <Button
                  size="small"
                  startIcon={<Add />}
                  disabled={!canEdit}
                  onClick={() => openCreate(role)}
                >
                  Add item
                </Button>
              </Stack>
              {items.length === 0 ? (
                <Typography variant="body2" color="text.disabled" sx={{ fontStyle: "italic" }}>
                  No items for this role yet.
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {items.map((t) => (
                    <Card key={t.id} variant="outlined" sx={{ p: 1.5, opacity: t.is_active ? 1 : 0.55 }}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between">
                        <Box sx={{ minWidth: 0 }}>
                          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap" }}>
                            <Typography variant="subtitle2" fontWeight={600}>
                              {t.sort_order}. {t.label}
                            </Typography>
                            <Tooltip title={t.detection_type === "auto" ? "Auto-detected from records" : "Manual confirmation"}>
                              <Chip
                                size="small"
                                icon={t.detection_type === "auto" ? <AutoMode /> : <TouchApp />}
                                label={t.detection_type === "auto" ? t.detection_source : "manual"}
                                color={t.detection_type === "auto" ? "primary" : "default"}
                                variant="outlined"
                              />
                            </Tooltip>
                            <Chip size="small" label={t.applies_scope} variant="outlined" />
                            {!t.is_active && <Chip size="small" color="warning" label="disabled" />}
                          </Stack>
                          {t.description && (
                            <Typography variant="body2" color="text.secondary">
                              {t.description}
                            </Typography>
                          )}
                        </Box>
                        <Stack direction="row" spacing={0.5}>
                          <IconButton size="small" disabled={!canEdit} onClick={() => openEdit(t)}>
                            <Edit fontSize="small" />
                          </IconButton>
                          <IconButton size="small" color="error" disabled={!canEdit} onClick={() => handleDelete(t)}>
                            <Delete fontSize="small" />
                          </IconButton>
                        </Stack>
                      </Stack>
                    </Card>
                  ))}
                </Stack>
              )}
            </Box>
          );
        })
      )}

      {/* Add / edit dialog */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? "Edit item" : "Add checklist item"}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl size="small" fullWidth>
              <InputLabel>Role</InputLabel>
              <Select
                label="Role"
                value={form.role}
                disabled={!!editing}
                onChange={(e) => setForm({ ...form, role: e.target.value as ChecklistRole })}
              >
                {ROLE_ORDER.map((r) => (
                  <MenuItem key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Label"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              fullWidth
              required
            />
            <TextField
              label="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              fullWidth
              multiline
              rows={2}
            />

            <FormControl size="small" fullWidth>
              <InputLabel>Detection</InputLabel>
              <Select
                label="Detection"
                value={form.detection_type}
                onChange={(e) =>
                  setForm({
                    ...form,
                    detection_type: e.target.value as "auto" | "manual",
                    detection_source:
                      e.target.value === "manual" ? "" : form.detection_source,
                  })
                }
              >
                <MenuItem value="manual">Manual confirmation</MenuItem>
                <MenuItem value="auto">Auto-detected from records</MenuItem>
              </Select>
            </FormControl>

            {form.detection_type === "auto" && (
              <FormControl size="small" fullWidth>
                <InputLabel>Detection source</InputLabel>
                <Select
                  label="Detection source"
                  value={form.detection_source}
                  onChange={(e) =>
                    setForm({ ...form, detection_source: e.target.value as DetectionSource })
                  }
                >
                  {DETECTION_SOURCES.map((s) => (
                    <MenuItem key={s.value} value={s.value}>
                      {s.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            <TextField
              label="Deep link path (optional)"
              placeholder="/site/attendance"
              value={form.deep_link_path}
              onChange={(e) => setForm({ ...form, deep_link_path: e.target.value })}
              fullWidth
            />

            <Stack direction="row" spacing={2}>
              <FormControl size="small" fullWidth>
                <InputLabel>Scope</InputLabel>
                <Select
                  label="Scope"
                  value={form.applies_scope}
                  onChange={(e) =>
                    setForm({ ...form, applies_scope: e.target.value as "per_site" | "per_user" })
                  }
                >
                  <MenuItem value="per_site">Per site</MenuItem>
                  <MenuItem value="per_user">Per user</MenuItem>
                </Select>
              </FormControl>
              <TextField
                label="Order"
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
                sx={{ width: 110 }}
                size="small"
              />
            </Stack>

            <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap" }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={form.allow_defer}
                    onChange={(e) => setForm({ ...form, allow_defer: e.target.checked })}
                  />
                }
                label="Allow defer"
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={form.requires_defer_reason}
                    onChange={(e) => setForm({ ...form, requires_defer_reason: e.target.checked })}
                  />
                }
                label="Require defer reason"
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
            {editing ? "Save" : "Add item"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
