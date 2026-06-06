"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
} from "@mui/material";
import { createClient } from "@/lib/supabase/client";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  useCreateTechnician,
  useUpdateTechnician,
} from "@/hooks/queries/useTechnicians";
import type { TechnicianFormData, TechnicianRow } from "@/types/directory.types";
import TechnicianPhotoField from "./TechnicianPhotoField";
import { TradeAutocomplete, SpecialtiesAutocomplete } from "./TradeAutocomplete";

interface TechnicianFormDialogProps {
  open: boolean;
  onClose: () => void;
  editing: TechnicianRow | null;
  tradeOptions: string[];
  onSaved?: () => void;
}

const EMPTY: TechnicianFormData = {
  name: "",
  phone: "",
  whatsapp_number: "",
  email: "",
  trade: "",
  specialties: [],
  area: "",
  worked_with: false,
  photo_url: null,
  notes: "",
};

export default function TechnicianFormDialog({
  open,
  onClose,
  editing,
  tradeOptions,
  onSaved,
}: TechnicianFormDialogProps) {
  const isMobile = useIsMobile();
  const supabase = useMemo(() => createClient(), []);
  const createMut = useCreateTechnician();
  const updateMut = useUpdateTechnician();
  const [form, setForm] = useState<TechnicianFormData>(EMPTY);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        name: editing.name,
        phone: editing.phone ?? "",
        whatsapp_number: editing.whatsapp_number ?? "",
        email: editing.email ?? "",
        trade: editing.trade ?? "",
        specialties: editing.specialties ?? [],
        area: editing.area ?? "",
        worked_with: editing.worked_with,
        photo_url: editing.photo_url,
        notes: editing.notes ?? "",
      });
    } else {
      setForm(EMPTY);
    }
    setError("");
  }, [open, editing]);

  const set = <K extends keyof TechnicianFormData>(
    key: K,
    value: TechnicianFormData[K]
  ) => setForm((f) => ({ ...f, [key]: value }));

  const saving = createMut.isPending || updateMut.isPending;

  const handleSave = async () => {
    setError("");
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    if (!form.phone?.trim() && !form.whatsapp_number?.trim()) {
      setError("Add a phone or WhatsApp number so you can reach them.");
      return;
    }
    // Normalize empty strings to null for nullable columns.
    const payload: TechnicianFormData = {
      ...form,
      name: form.name.trim(),
      phone: form.phone?.trim() || null,
      whatsapp_number: form.whatsapp_number?.trim() || null,
      email: form.email?.trim() || null,
      trade: form.trade?.trim() || null,
      area: form.area?.trim() || null,
      notes: form.notes?.trim() || null,
    };
    try {
      if (editing) {
        await updateMut.mutateAsync({ id: editing.id, data: payload });
      } else {
        await createMut.mutateAsync(payload);
      }
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save technician.");
    }
  };

  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : onClose}
      fullScreen={isMobile}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>{editing ? "Edit technician" : "Add technician"}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          {error ? <Alert severity="error">{error}</Alert> : null}

          <TechnicianPhotoField
            currentPhotoUrl={form.photo_url}
            name={form.name || "New technician"}
            technicianId={editing?.id}
            onPhotoChange={(url) => set("photo_url", url)}
            onError={(msg) => setError(msg)}
            supabase={supabase}
          />

          <TextField
            label="Name"
            required
            size="small"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            autoFocus
            fullWidth
          />

          <Box sx={{ display: "flex", gap: 1.5, flexDirection: { xs: "column", sm: "row" } }}>
            <TextField
              label="Phone"
              size="small"
              value={form.phone ?? ""}
              onChange={(e) => set("phone", e.target.value)}
              fullWidth
              inputProps={{ inputMode: "tel" }}
            />
            <TextField
              label="WhatsApp (if different)"
              size="small"
              value={form.whatsapp_number ?? ""}
              onChange={(e) => set("whatsapp_number", e.target.value)}
              fullWidth
              inputProps={{ inputMode: "tel" }}
            />
          </Box>

          <TradeAutocomplete
            value={form.trade}
            onChange={(v) => set("trade", v)}
            options={tradeOptions}
            required
          />

          <SpecialtiesAutocomplete
            value={form.specialties}
            onChange={(v) => set("specialties", v)}
            options={tradeOptions}
          />

          <Box sx={{ display: "flex", gap: 1.5, flexDirection: { xs: "column", sm: "row" } }}>
            <TextField
              label="Area / location served"
              size="small"
              value={form.area ?? ""}
              onChange={(e) => set("area", e.target.value)}
              fullWidth
              placeholder="e.g. Velachery, Whole Chennai"
            />
            <TextField
              label="Email (optional)"
              size="small"
              value={form.email ?? ""}
              onChange={(e) => set("email", e.target.value)}
              fullWidth
              inputProps={{ inputMode: "email" }}
            />
          </Box>

          <TextField
            label="Notes"
            size="small"
            value={form.notes ?? ""}
            onChange={(e) => set("notes", e.target.value)}
            fullWidth
            multiline
            minRows={2}
            placeholder="Rate, quality, who referred them…"
          />

          <FormControlLabel
            control={
              <Switch
                checked={form.worked_with}
                onChange={(e) => set("worked_with", e.target.checked)}
              />
            }
            label="We've worked with them before"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : editing ? "Save changes" : "Add technician"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
