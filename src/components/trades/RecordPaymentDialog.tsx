"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  FormControl,
  FormLabel,
  Select,
  MenuItem,
  InputLabel,
  Alert,
  CircularProgress,
  InputAdornment,
  Typography,
  Box,
} from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type {
  ContractPaymentType,
  PaymentChannel,
  PaymentMode,
} from "@/hooks/queries/useContractPayments";

interface RecordPaymentDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  siteId: string;
  contractId: string;
  contractTitle: string;
  /** Live remaining balance (quoted - paid). Drives the preset chips. */
  remainingBalance: number;
}

const PAYMENT_TYPES: Array<{
  value: ContractPaymentType;
  label: string;
  hint: string;
}> = [
  {
    value: "weekly_advance",
    label: "Daily / Weekly money",
    hint: "Cash given to the mesthri as he goes — typical daily expenses.",
  },
  {
    value: "part_payment",
    label: "Part payment",
    hint: "Lump payment for work done so far (interim instalment).",
  },
  {
    value: "milestone",
    label: "Milestone payment",
    hint: "Payment tied to a specific milestone being reached.",
  },
  {
    value: "final_settlement",
    label: "Final settlement",
    hint: "Closes the contract balance. Use when work is fully done.",
  },
];

function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatINR(n: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
}

export function RecordPaymentDialog({
  open,
  onClose,
  onSaved,
  siteId,
  contractId,
  contractTitle,
  remainingBalance,
}: RecordPaymentDialogProps) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  const [paymentType, setPaymentType] = useState<ContractPaymentType>("weekly_advance");
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash");
  const [paymentChannel, setPaymentChannel] = useState<PaymentChannel>("via_site_engineer");
  const [reference, setReference] = useState("");
  const [comments, setComments] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPaymentType("weekly_advance");
    setAmount("");
    setPaymentDate(todayISO());
    setPaymentMode("cash");
    setPaymentChannel("via_site_engineer");
    setReference("");
    setComments("");
    setError(null);
    setSubmitting(false);
  }, [open]);

  const presets = useMemo(() => {
    // Sensible amount chips based on remaining balance
    const out: Array<{ label: string; value: number }> = [];
    if (remainingBalance > 0) {
      const round = (n: number) => Math.max(100, Math.round(n / 100) * 100);
      const half = round(remainingBalance / 2);
      out.push({ label: `½ balance ₹${formatINR(half)}`, value: half });
      out.push({ label: `Full balance ₹${formatINR(remainingBalance)}`, value: remainingBalance });
    }
    return out;
  }, [remainingBalance]);

  const amountNum = Number(amount || "0");
  const canSubmit =
    !submitting && amount !== "" && !Number.isNaN(amountNum) && amountNum > 0 && !!paymentDate;

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const sb = supabase as any;
      const insertRes = await sb
        .from("subcontract_payments")
        .insert({
          contract_id: contractId,
          amount: amountNum,
          payment_date: paymentDate,
          payment_type: paymentType,
          payment_mode: paymentMode,
          payment_channel: paymentChannel,
          reference_number: reference.trim() || null,
          comments: comments.trim() || null,
          is_deleted: false,
        })
        .select("id")
        .single();
      if (insertRes.error) throw insertRes.error;

      // Invalidate everything that depends on contract money
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["contract-payments", contractId] }),
        queryClient.invalidateQueries({
          queryKey: ["trade-reconciliations", "site", siteId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["trade-activity", "site", siteId],
        }),
        queryClient.invalidateQueries({ queryKey: ["trades", "site", siteId] }),
      ]);
      if (typeof BroadcastChannel !== "undefined") {
        const bc = new BroadcastChannel("subcontracts-changed");
        bc.postMessage({ siteId, contractId, kind: "payment", at: Date.now() });
        bc.close();
      }
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const selectedTypeHint = PAYMENT_TYPES.find((t) => t.value === paymentType)?.hint;

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        Record payment
        <Typography variant="caption" color="text.secondary" component="div">
          {contractTitle} · Remaining balance ₹{formatINR(remainingBalance)}
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5}>
          <FormControl>
            <FormLabel>What kind of payment?</FormLabel>
            <ToggleButtonGroup
              value={paymentType}
              exclusive
              onChange={(_, v) => v && setPaymentType(v)}
              size="small"
              sx={{ mt: 1, flexWrap: "wrap" }}
            >
              {PAYMENT_TYPES.map((t) => (
                <ToggleButton key={t.value} value={t.value} sx={{ textTransform: "none" }}>
                  {t.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            {selectedTypeHint && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75 }}>
                {selectedTypeHint}
              </Typography>
            )}
          </FormControl>

          <Box>
            <TextField
              label="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              required
              fullWidth
              autoFocus
              InputProps={{
                startAdornment: <InputAdornment position="start">₹</InputAdornment>,
              }}
            />
            {presets.length > 0 && (
              <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: "wrap", gap: 1 }}>
                {presets.map((p) => (
                  <Button
                    key={p.label}
                    size="small"
                    variant="outlined"
                    onClick={() => setAmount(String(p.value))}
                  >
                    {p.label}
                  </Button>
                ))}
              </Stack>
            )}
          </Box>

          <TextField
            label="Payment date"
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            required
            fullWidth
            InputLabelProps={{ shrink: true }}
          />

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <FormControl fullWidth>
              <InputLabel id="pmode-label">Payment mode</InputLabel>
              <Select
                labelId="pmode-label"
                value={paymentMode}
                label="Payment mode"
                onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
              >
                <MenuItem value="cash">Cash</MenuItem>
                <MenuItem value="upi">UPI</MenuItem>
                <MenuItem value="bank_transfer">Bank transfer</MenuItem>
                <MenuItem value="cheque">Cheque</MenuItem>
                <MenuItem value="other">Other</MenuItem>
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel id="pchan-label">Paid via</InputLabel>
              <Select
                labelId="pchan-label"
                value={paymentChannel}
                label="Paid via"
                onChange={(e) => setPaymentChannel(e.target.value as PaymentChannel)}
              >
                <MenuItem value="via_site_engineer">Site engineer (cash on-site)</MenuItem>
                <MenuItem value="mesthri_at_office">Mesthri at office</MenuItem>
                <MenuItem value="company_direct_online">Company direct (bank/online)</MenuItem>
              </Select>
            </FormControl>
          </Stack>

          <TextField
            label="Reference / receipt number (optional)"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            fullWidth
          />

          <TextField
            label="Notes (optional)"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            fullWidth
            multiline
            minRows={2}
          />

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!canSubmit}
          startIcon={submitting ? <CircularProgress size={16} /> : null}
        >
          {submitting ? "Saving…" : "Record payment"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
