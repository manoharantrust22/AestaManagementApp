"use client";

import React, { useEffect, useState } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Stack, MenuItem, Alert,
} from "@mui/material";
import type { Database } from "@/types/database.types";
import type { SiteAdditionalWork } from "@/types/site.types";
import { useCreateClientPayment, useUpdateClientPayment } from "@/hooks/queries/useClientPayments";
import { useSiteClients } from "@/hooks/queries/useSiteClients";
import SiteClientPicker from "@/components/clients/SiteClientPicker";
import FileUploader, { type UploadedFile } from "@/components/common/FileUploader";
import { createClient } from "@/lib/supabase/client";

type PaymentMode = "cash" | "upi" | "bank_transfer" | "cheque";
type PaymentPhase = Database["public"]["Tables"]["payment_phases"]["Row"];
type ClientPayment = Database["public"]["Tables"]["client_payments"]["Row"];

export interface RecordPaymentDialogProps {
  open: boolean;
  onClose: () => void;
  siteId: string;
  phases: PaymentPhase[];
  additionalWorks: SiteAdditionalWork[];
  /** When provided, the dialog edits this payment instead of recording a new one. */
  initial?: ClientPayment;
}

type ApplyToOption = { value: string; label: string };

/** Modes that can carry a payment proof (screenshot / transfer slip / cheque photo). */
const PROOF_LABELS: Partial<Record<PaymentMode, { label: string; helper: string }>> = {
  upi: { label: "UPI screenshot", helper: "Upload, drop, or paste (Ctrl+V) the UPI payment screenshot" },
  bank_transfer: { label: "Transfer proof", helper: "Upload, drop, or paste (Ctrl+V) the bank transfer proof" },
  cheque: { label: "Cheque photo", helper: "Upload, drop, or paste (Ctrl+V) a photo of the cheque" },
};

function proofFromUrl(url: string | null | undefined): UploadedFile | null {
  if (!url) return null;
  const name = decodeURIComponent(url.split("?")[0].split("/").pop() ?? "receipt");
  return { name, size: 0, url };
}

export function RecordPaymentDialog({
  open, onClose, siteId, phases, additionalWorks, initial,
}: RecordPaymentDialogProps) {
  const create = useCreateClientPayment();
  const update = useUpdateClientPayment();
  const [supabase] = useState(() => createClient());
  const isEdit = Boolean(initial);
  const saving = create.isPending || update.isPending;
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState<PaymentMode>("cash");
  const [applyTo, setApplyTo] = useState<string>("general");
  const [notes, setNotes] = useState("");
  const [receivedFrom, setReceivedFrom] = useState<string | null>(null);
  const [proof, setProof] = useState<UploadedFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: siteClients = [] } = useSiteClients(siteId);
  const primaryClientId = siteClients.find((c) => c.is_primary)?.id ?? null;

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setReceivedFrom(initial.received_from_client_id ?? null);
      setAmount(String(initial.amount ?? ""));
      setPaymentDate((initial.payment_date ?? new Date().toISOString()).slice(0, 10));
      setMode((initial.payment_mode as PaymentMode) ?? "cash");
      setApplyTo(
        initial.tagged_additional_work_id
          ? `work:${initial.tagged_additional_work_id}`
          : initial.payment_phase_id
            ? `phase:${initial.payment_phase_id}`
            : "general",
      );
      setNotes(initial.notes ?? "");
      setProof(proofFromUrl(initial.receipt_url));
    } else {
      setAmount("");
      setPaymentDate(new Date().toISOString().slice(0, 10));
      setMode("cash");
      setApplyTo("general");
      setNotes("");
      setReceivedFrom(null);
      setProof(null);
    }
    setError(null);
  }, [open, initial]);

  // New payments default to the primary client once the roster has loaded.
  useEffect(() => {
    if (open && !initial && primaryClientId) {
      setReceivedFrom((cur) => cur ?? primaryClientId);
    }
  }, [open, initial, primaryClientId]);

  const applyOptions: ApplyToOption[] = [
    { value: "general", label: "General (untagged)" },
    ...phases.map((p) => ({
      value: `phase:${p.id}`,
      label: `Base Phase: ${p.phase_name ?? `#${p.sequence_order}`}`,
    })),
    ...additionalWorks
      // Keep a cancelled work selectable if this payment is already tagged to it.
      .filter((w) => w.status !== "cancelled" || w.id === initial?.tagged_additional_work_id)
      .map((w) => ({ value: `work:${w.id}`, label: `Extra: ${w.title}` })),
  ];

  const proofConfig = PROOF_LABELS[mode];

  async function handleSave() {
    setError(null);
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError("Amount must be a positive number");
      return;
    }
    const paymentPhaseId = applyTo.startsWith("phase:") ? applyTo.slice("phase:".length) : null;
    const taggedAdditionalWorkId = applyTo.startsWith("work:") ? applyTo.slice("work:".length) : null;

    try {
      const fields = {
        siteId,
        amount: amountNum,
        paymentDate,
        paymentMode: mode,
        notes: notes || null,
        paymentPhaseId,
        taggedAdditionalWorkId,
        receivedFromClientId: receivedFrom,
        // Cash payments carry no proof; drop any screenshot left from a mode switch.
        receiptUrl: proofConfig ? proof?.url ?? null : null,
      };
      if (initial) {
        await update.mutateAsync({ id: initial.id, ...fields });
      } else {
        await create.mutateAsync(fields);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? "Edit Client Payment" : "Record Client Payment"}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField label="Amount (₹)" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} fullWidth required inputProps={{ min: 0, step: "0.01" }} />
            <TextField label="Payment date" type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
          </Stack>
          <SiteClientPicker
            siteId={siteId}
            label="Received from"
            value={receivedFrom}
            onChange={(c) => setReceivedFrom(c?.id ?? null)}
          />
          <TextField select label="Mode" value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)} fullWidth>
            <MenuItem value="cash">Cash</MenuItem>
            <MenuItem value="upi">UPI</MenuItem>
            <MenuItem value="bank_transfer">Bank transfer</MenuItem>
            <MenuItem value="cheque">Cheque</MenuItem>
          </TextField>
          {proofConfig && (
            <FileUploader
              supabase={supabase}
              bucketName="client-payment-receipts"
              folderPath={`${siteId}/${paymentDate || "undated"}`}
              fileNamePrefix={mode}
              accept="all"
              maxSizeMB={10}
              label={`${proofConfig.label} (optional)`}
              helperText={proofConfig.helper}
              value={proof}
              onUpload={(f) => setProof(f)}
              onRemove={() => setProof(null)}
              onError={(msg) => setError(msg)}
              compact
            />
          )}
          <TextField select label="Apply to" value={applyTo} onChange={(e) => setApplyTo(e.target.value)} fullWidth helperText="Defaults to general — only tag if it matters">
            {applyOptions.map((o) => (
              <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
            ))}
          </TextField>
          <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} fullWidth multiline rows={2} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {isEdit ? "Save changes" : "Record payment"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default RecordPaymentDialog;
