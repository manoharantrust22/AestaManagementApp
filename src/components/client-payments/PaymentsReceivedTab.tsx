"use client";

import React, { useState } from "react";
import {
  Alert, Button, Chip, IconButton, Paper, Stack, Tooltip, Typography,
  Table, TableBody, TableCell, TableHead, TableRow,
} from "@mui/material";
import { Add, DeleteOutline, EditOutlined, Receipt } from "@mui/icons-material";
import type { Database } from "@/types/database.types";
import type { SiteAdditionalWork } from "@/types/site.types";
import { formatINR } from "@/components/payments/KpiTile";
import { formatDateDDMMMYY } from "@/lib/formatters";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { useDeleteClientPayment } from "@/hooks/queries/useClientPayments";
import RecordPaymentDialog from "./RecordPaymentDialog";
import SiteClientLabel from "@/components/clients/SiteClientLabel";

type ClientPayment = Database["public"]["Tables"]["client_payments"]["Row"];
type PaymentPhase = Database["public"]["Tables"]["payment_phases"]["Row"];

export interface PaymentsReceivedTabProps {
  siteId: string;
  payments: ClientPayment[];
  phases: PaymentPhase[];
  additionalWorks: SiteAdditionalWork[];
}

function applyToLabel(
  payment: ClientPayment,
  phases: PaymentPhase[],
  works: SiteAdditionalWork[],
): { label: string; color: "default" | "info" | "primary" } {
  if (payment.tagged_additional_work_id) {
    const w = works.find((x) => x.id === payment.tagged_additional_work_id);
    return { label: w ? `Extra: ${w.title}` : "Extra (deleted)", color: "info" };
  }
  if (payment.payment_phase_id) {
    const p = phases.find((x) => x.id === payment.payment_phase_id);
    return { label: p ? `Phase: ${p.phase_name ?? `#${p.sequence_order}`}` : "Phase (deleted)", color: "primary" };
  }
  return { label: "General", color: "default" };
}

export function PaymentsReceivedTab({ siteId, payments, phases, additionalWorks }: PaymentsReceivedTabProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ClientPayment | undefined>(undefined);
  const [deleting, setDeleting] = useState<ClientPayment | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const del = useDeleteClientPayment();

  const openDialog = (payment?: ClientPayment) => {
    setEditing(payment);
    setDialogOpen(true);
  };

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteError(null);
    try {
      await del.mutateAsync({ id: deleting.id, siteId });
      setDeleting(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Delete failed");
      setDeleting(null);
    }
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="subtitle1">Payments Received ({payments.length})</Typography>
        <Button startIcon={<Add />} onClick={() => openDialog()} variant="contained" size="small">
          Record Payment
        </Button>
      </Stack>

      {deleteError && (
        <Alert severity="error" onClose={() => setDeleteError(null)}>{deleteError}</Alert>
      )}

      {payments.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 3, textAlign: "center", color: "text.secondary" }}>
          <Typography>No payments recorded yet.</Typography>
        </Paper>
      ) : (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>From</TableCell>
                <TableCell>Mode</TableCell>
                <TableCell>Apply to</TableCell>
                <TableCell>Receipt</TableCell>
                <TableCell>Notes</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {payments
                .slice()
                .sort((a, b) => (b.payment_date ?? "").localeCompare(a.payment_date ?? ""))
                .map((p) => {
                  const tag = applyToLabel(p, phases, additionalWorks);
                  return (
                    <TableRow key={p.id} hover>
                      <TableCell>{formatDateDDMMMYY(p.payment_date)}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                        {formatINR(Number(p.amount))}
                      </TableCell>
                      <TableCell sx={{ maxWidth: 180 }}>
                        <SiteClientLabel siteId={siteId} clientId={p.received_from_client_id} />
                      </TableCell>
                      <TableCell><Chip size="small" label={p.payment_mode} /></TableCell>
                      <TableCell><Chip size="small" color={tag.color} label={tag.label} /></TableCell>
                      <TableCell>
                        {p.receipt_url ? (
                          <Button size="small" startIcon={<Receipt />} href={p.receipt_url} target="_blank" rel="noopener noreferrer">View</Button>
                        ) : "—"}
                      </TableCell>
                      <TableCell>{p.notes ?? "—"}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                        <Tooltip title="Edit payment">
                          <IconButton size="small" aria-label="Edit payment" onClick={() => openDialog(p)}>
                            <EditOutlined fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete payment">
                          <IconButton size="small" color="error" aria-label="Delete payment" onClick={() => setDeleting(p)}>
                            <DeleteOutline fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </Paper>
      )}

      <RecordPaymentDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        siteId={siteId}
        phases={phases}
        additionalWorks={additionalWorks}
        initial={editing}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this payment?"
        message={
          deleting
            ? `${formatINR(Number(deleting.amount))} received on ${formatDateDDMMMYY(deleting.payment_date)} (${deleting.payment_mode}) will be permanently removed and the remaining-from-client balance will go up by this amount. This cannot be undone.`
            : ""
        }
        confirmText="Delete"
        confirmColor="error"
        isLoading={del.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </Stack>
  );
}

export default PaymentsReceivedTab;
