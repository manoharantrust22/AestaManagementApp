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
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import {
  Handyman as HandymanIcon,
  Storefront as StorefrontIcon,
} from "@mui/icons-material";
import { createClient } from "@/lib/supabase/client";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  useCreateTechnician,
  useUpdateTechnician,
} from "@/hooks/queries/useTechnicians";
import type {
  ContactKind,
  TechnicianFormData,
  TechnicianRow,
} from "@/types/directory.types";
import TechnicianPhotoField from "./TechnicianPhotoField";
import { TradeAutocomplete, SpecialtiesAutocomplete } from "./TradeAutocomplete";

interface TechnicianFormDialogProps {
  open: boolean;
  onClose: () => void;
  editing: TechnicianRow | null;
  tradeOptions: string[];
  /** Kind to preselect when adding a new contact (ignored when editing). */
  defaultKind?: ContactKind;
  onSaved?: (kind: ContactKind) => void;
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
  contact_kind: "technician",
  website: "",
};

export default function TechnicianFormDialog({
  open,
  onClose,
  editing,
  tradeOptions,
  defaultKind = "technician",
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
        contact_kind: editing.contact_kind ?? "technician",
        website: editing.website ?? "",
      });
    } else {
      setForm({ ...EMPTY, contact_kind: defaultKind });
    }
    setError("");
  }, [open, editing, defaultKind]);

  const set = <K extends keyof TechnicianFormData>(
    key: K,
    value: TechnicianFormData[K]
  ) => setForm((f) => ({ ...f, [key]: value }));

  const isBrand = form.contact_kind === "brand";
  const noun = isBrand ? "brand contact" : "technician";
  const saving = createMut.isPending || updateMut.isPending;

  const handleSave = async () => {
    setError("");
    if (!form.name.trim()) {
      setError(isBrand ? "Brand / company name is required." : "Name is required.");
      return;
    }
    const hasPhone = !!form.phone?.trim();
    const hasWhatsapp = !!form.whatsapp_number?.trim();
    const hasWebsite = !!form.website?.trim();
    if (isBrand) {
      if (!hasPhone && !hasWhatsapp && !hasWebsite) {
        setError("Add a phone, WhatsApp, or website so you can reach this brand.");
        return;
      }
    } else if (!hasPhone && !hasWhatsapp) {
      setError("Add a phone or WhatsApp number so you can reach them.");
      return;
    }
    // Normalize empty strings to null for nullable columns. For brand contacts,
    // clear technician-only fields so a technician→brand switch leaves no stale data.
    const payload: TechnicianFormData = {
      ...form,
      name: form.name.trim(),
      phone: form.phone?.trim() || null,
      whatsapp_number: form.whatsapp_number?.trim() || null,
      email: form.email?.trim() || null,
      trade: form.trade?.trim() || null,
      area: isBrand ? null : form.area?.trim() || null,
      notes: form.notes?.trim() || null,
      website: form.website?.trim() || null,
      specialties: isBrand ? [] : form.specialties,
      worked_with: isBrand ? false : form.worked_with,
    };
    try {
      if (editing) {
        await updateMut.mutateAsync({ id: editing.id, data: payload });
      } else {
        await createMut.mutateAsync(payload);
      }
      onSaved?.(form.contact_kind);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to save ${noun}.`);
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
      <DialogTitle>{editing ? `Edit ${noun}` : `Add ${noun}`}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          {error ? <Alert severity="error">{error}</Alert> : null}

          <ToggleButtonGroup
            exclusive
            fullWidth
            size="small"
            color="primary"
            value={form.contact_kind}
            onChange={(_, v) => {
              if (v) set("contact_kind", v as ContactKind);
            }}
            aria-label="Contact kind"
          >
            <ToggleButton value="technician">
              <HandymanIcon fontSize="small" sx={{ mr: 0.75 }} />
              Technician
            </ToggleButton>
            <ToggleButton value="brand">
              <StorefrontIcon fontSize="small" sx={{ mr: 0.75 }} />
              Brand / company
            </ToggleButton>
          </ToggleButtonGroup>

          <TechnicianPhotoField
            currentPhotoUrl={form.photo_url}
            name={form.name || (isBrand ? "New brand" : "New technician")}
            technicianId={editing?.id}
            onPhotoChange={(url) => set("photo_url", url)}
            onError={(msg) => setError(msg)}
            supabase={supabase}
          />

          <TextField
            label={isBrand ? "Brand / company" : "Name"}
            required
            size="small"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            autoFocus
            fullWidth
            placeholder={isBrand ? "e.g. Asian Paints Customer Care" : undefined}
          />

          <Box sx={{ display: "flex", gap: 1.5, flexDirection: { xs: "column", sm: "row" } }}>
            <TextField
              label={isBrand ? "Enquiry / care number" : "Phone"}
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
            label={isBrand ? "Products / category" : "Trade"}
            placeholder={
              isBrand
                ? "e.g. Paint, Cement, Tiles…"
                : "e.g. Electrician, CCTV, Carpenter…"
            }
            required={!isBrand}
            helperText={
              isBrand
                ? "What this brand supplies (optional)."
                : "Not listed? Type it and tap “Add …” — it’s saved to your trades."
            }
          />

          {!isBrand ? (
            <SpecialtiesAutocomplete
              value={form.specialties}
              onChange={(v) => set("specialties", v)}
              options={tradeOptions}
            />
          ) : null}

          <Box sx={{ display: "flex", gap: 1.5, flexDirection: { xs: "column", sm: "row" } }}>
            {isBrand ? (
              <TextField
                label="Website / order page"
                size="small"
                value={form.website ?? ""}
                onChange={(e) => set("website", e.target.value)}
                fullWidth
                inputProps={{ inputMode: "url" }}
                placeholder="e.g. asianpaints.com"
              />
            ) : (
              <TextField
                label="Area / location served"
                size="small"
                value={form.area ?? ""}
                onChange={(e) => set("area", e.target.value)}
                fullWidth
                placeholder="e.g. Velachery, Whole Chennai"
              />
            )}
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
            placeholder={
              isBrand
                ? "Contact person, best time to call, product lines…"
                : "Rate, quality, who referred them…"
            }
          />

          {!isBrand ? (
            <FormControlLabel
              control={
                <Switch
                  checked={form.worked_with}
                  onChange={(e) => set("worked_with", e.target.checked)}
                />
              }
              label="We've worked with them before"
            />
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : editing ? "Save changes" : `Add ${noun}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
