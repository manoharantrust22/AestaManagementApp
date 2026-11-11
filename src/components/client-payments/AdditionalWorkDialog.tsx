"use client";

import React, { useEffect, useState } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Stack, MenuItem, Alert,
} from "@mui/material";
import type {
  SiteAdditionalWork,
  SiteAdditionalWorkInsert,
  AdditionalWorkStatus,
} from "@/types/site.types";
import {
  useCreateSiteAdditionalWork,
  useUpdateSiteAdditionalWork,
} from "@/hooks/queries/useSiteAdditionalWorks";
import SiteClientPicker from "@/components/clients/SiteClientPicker";

export interface AdditionalWorkDialogProps {
  open: boolean;
  onClose: () => void;
  siteId: string;
  initial?: SiteAdditionalWork;
}

type FormState = {
  title: string;
  description: string;
  estimated_amount: string;
  confirmed_amount: string;
  confirmation_date: string;
  expected_payment_date: string;
  status: AdditionalWorkStatus;
  quote_document_url: string;
  client_approved_by: string;
  client_approved_by_id: string | null;
  notes: string;
};

const empty: FormState = {
  title: "",
  description: "",
  estimated_amount: "",
  confirmed_amount: "",
  confirmation_date: "",
  expected_payment_date: "",
  status: "quoted",
  quote_document_url: "",
  client_approved_by: "",
  client_approved_by_id: null,
  notes: "",
};

export function AdditionalWorkDialog({ open, onClose, siteId, initial }: AdditionalWorkDialogProps) {
  const create = useCreateSiteAdditionalWork();
  const update = useUpdateSiteAdditionalWork();
  const [form, setForm] = useState<FormState>(empty);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        title: initial.title ?? "",
        description: initial.description ?? "",
        estimated_amount: String(initial.estimated_amount ?? ""),
        confirmed_amount: initial.confirmed_amount == null ? "" : String(initial.confirmed_amount),
        confirmation_date: initial.confirmation_date ?? "",
        expected_payment_date: initial.expected_payment_date ?? "",
        status: initial.status,
        quote_document_url: initial.quote_document_url ?? "",
        client_approved_by: initial.client_approved_by ?? "",
        client_approved_by_id: initial.client_approved_by_id ?? null,
        notes: initial.notes ?? "",
      });
    } else {
      setForm(empty);
    }
    setError(null);
  }, [open, initial]);

  const onChange = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSave() {
    setError(null);
    const estimated = Number(form.estimated_amount);
    if (!form.title.trim()) { setError("Title is required"); return; }
    if (!Number.isFinite(estimated) || estimated < 0) { setError("Estimated amount must be a non-negative number"); return; }

    const confirmedNum = form.confirmed_amount === "" ? null : Number(form.confirmed_amount);
    if (confirmedNum != null && (!Number.isFinite(confirmedNum) || confirmedNum < 0)) {
      setError("Confirmed amount must be a non-negative number"); return;
    }

    let status = form.status;
    if (status === "quoted" && confirmedNum != null && form.confirmation_date) {
      status = "confirmed";
    }

    const payload: SiteAdditionalWorkInsert = {
      site_id: siteId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      estimated_amount: estimated,
      confirmed_amount: confirmedNum,
      confirmation_date: form.confirmation_date || null,
      expected_payment_date: form.expected_payment_date || null,
      status,
      quote_document_url: form.quote_document_url.trim() || null,
      // Keep the name as a snapshot so the row still reads right if the
      // client is later removed from the site.
      client_approved_by: form.client_approved_by.trim() || null,
      client_approved_by_id: form.client_approved_by_id,
      notes: form.notes.trim() || null,
    };

    try {
      if (initial) {
        await update.mutateAsync({ id: initial.id, siteId, patch: payload });
      } else {
        await create.mutateAsync(payload);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{initial ? "Edit Additional Work" : "Add Additional Work"}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Title" value={form.title} onChange={onChange("title")} fullWidth required />
          <TextField label="Description" value={form.description} onChange={onChange("description")} fullWidth multiline rows={2} />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField label="Estimated amount (₹)" type="number" value={form.estimated_amount} onChange={onChange("estimated_amount")} fullWidth required inputProps={{ min: 0, step: "0.01" }} />
            <TextField label="Confirmed amount (₹)" type="number" value={form.confirmed_amount} onChange={onChange("confirmed_amount")} fullWidth inputProps={{ min: 0, step: "0.01" }} />
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField label="Confirmation date" type="date" value={form.confirmation_date} onChange={onChange("confirmation_date")} InputLabelProps={{ shrink: true }} fullWidth />
            <TextField label="Expected payment date" type="date" value={form.expected_payment_date} onChange={onChange("expected_payment_date")} InputLabelProps={{ shrink: true }} fullWidth />
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <SiteClientPicker
              siteId={siteId}
              label="Approved by (client)"
              value={form.client_approved_by_id}
              fallbackName={form.client_approved_by || null}
              onChange={(c) =>
                setForm((f) => ({
                  ...f,
                  client_approved_by_id: c?.id ?? null,
                  client_approved_by: c?.name ?? "",
                }))
              }
            />
            <TextField select label="Status" value={form.status} onChange={onChange("status")} fullWidth>
              <MenuItem value="quoted">Quoted</MenuItem>
              <MenuItem value="confirmed">Confirmed</MenuItem>
              <MenuItem value="paid">Paid</MenuItem>
              <MenuItem value="cancelled">Cancelled</MenuItem>
            </TextField>
          </Stack>
          <TextField
            label="Quote document URL (optional)"
            value={form.quote_document_url}
            onChange={onChange("quote_document_url")}
            fullWidth
            placeholder="Paste a link to the quote PDF/image"
            helperText="v1 accepts a pasted URL. File-upload integration is a follow-up."
          />
          <TextField label="Notes" value={form.notes} onChange={onChange("notes")} fullWidth multiline rows={2} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={create.isPending || update.isPending}>
          {initial ? "Save changes" : "Add work"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default AdditionalWorkDialog;
