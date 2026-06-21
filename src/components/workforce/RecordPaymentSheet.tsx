"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  TextField,
  InputAdornment,
  ToggleButton,
  ToggleButtonGroup,
  Alert,
  CircularProgress,
  Typography,
} from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { computeExposure } from "@/lib/workforce/exposure";
import type { WorkspaceTask } from "@/lib/workforce/workspaceModel";
import { severityMeta, wsColors, wsRadius } from "@/lib/workforce/workspaceTokens";
import { formatCurrencyFull } from "@/lib/formatters";
import { ResponsiveSheet } from "./ResponsiveSheet";

const QUICK_ADDS = [10000, 25000, 50000];
const METHODS: Array<{ value: string; label: string }> = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank" },
];

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Record a payment with a LIVE exposure preview — before confirming, the supervisor sees
 * whether this payment pushes them ahead of the work. Mirrors the existing light insert into
 * subcontract_payments (RecordPaymentDialog) — no wallet/payer-source complexity.
 */
export function RecordPaymentSheet({
  open,
  onClose,
  siteId,
  task,
  notify,
}: {
  open: boolean;
  onClose: () => void;
  siteId: string;
  task: WorkspaceTask;
  notify: (msg: string, severity?: "success" | "error") => void;
}) {
  const supabase = createClient();
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAmount("");
      setMethod("cash");
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  const amountNum = Number(amount || "0");
  const valid = amount !== "" && !Number.isNaN(amountNum) && amountNum > 0;

  // Live preview: recompute exposure as if this payment had been made.
  const preview = useMemo(
    () => computeExposure({ quoted: task.quoted, paid: task.paid + (valid ? amountNum : 0), work: task.work }),
    [task.quoted, task.paid, task.work, amountNum, valid]
  );
  const meta = severityMeta[preview.severity];
  const PreviewIcon = meta.icon;

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const sb = supabase as any;
      const res = await sb
        .from("subcontract_payments")
        .insert({
          contract_id: task.id,
          amount: amountNum,
          payment_date: todayISO(),
          payment_type: "weekly_advance",
          payment_mode: method,
          payment_channel: "via_site_engineer",
          is_deleted: false,
        })
        .select("id")
        .single();
      if (res.error) throw res.error;

      await Promise.all([
        qc.invalidateQueries({ queryKey: ["subcontract-payments", task.id] }),
        qc.invalidateQueries({ queryKey: ["contract-payments", task.id] }),
        qc.invalidateQueries({ queryKey: ["trade-reconciliations", "site", siteId] }),
        qc.invalidateQueries({ queryKey: ["trade-activity", "site", siteId] }),
        qc.invalidateQueries({ queryKey: ["trades", "site", siteId] }),
      ]);
      if (typeof BroadcastChannel !== "undefined") {
        const bc = new BroadcastChannel("subcontracts-changed");
        bc.postMessage({ siteId, contractId: task.id, kind: "payment", at: Date.now() });
        bc.close();
      }
      notify(`Paid ${formatCurrencyFull(amountNum)} recorded`);
      onClose();
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ResponsiveSheet
      open={open}
      onClose={submitting ? () => {} : onClose}
      title="Record payment"
      subtitle={`${task.who} · ${task.title}`}
      footer={
        <>
          <Button onClick={onClose} disabled={submitting} sx={{ textTransform: "none", color: wsColors.ink2 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disableElevation
            onClick={handleSubmit}
            disabled={!valid || submitting}
            startIcon={submitting ? <CircularProgress size={16} /> : null}
            sx={{ textTransform: "none", fontWeight: 700, bgcolor: wsColors.primary, borderRadius: `${wsRadius.input}px`, "&:hover": { bgcolor: "#2a60d6" } }}
          >
            {submitting ? "Saving…" : "Record payment"}
          </Button>
        </>
      }
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.75, py: 1 }}>
        <TextField
          label="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          autoFocus
          fullWidth
          InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
        />
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          {QUICK_ADDS.map((q) => (
            <Button
              key={q}
              size="small"
              variant="outlined"
              onClick={() => setAmount(String((Number(amount || "0") || 0) + q))}
              sx={{ textTransform: "none", borderColor: wsColors.hairline, color: wsColors.ink2, borderRadius: `${wsRadius.input}px` }}
            >
              +{formatCurrencyFull(q)}
            </Button>
          ))}
        </Box>

        <Box>
          <Typography sx={{ fontSize: 12, fontWeight: 700, color: wsColors.muted, mb: 0.75 }}>Method</Typography>
          <ToggleButtonGroup value={method} exclusive onChange={(_, v) => v && setMethod(v)} size="small">
            {METHODS.map((m) => (
              <ToggleButton key={m.value} value={m.value} sx={{ textTransform: "none", px: 2 }}>
                {m.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>

        {/* Live exposure preview */}
        {valid && preview.tracked && preview.exposure !== null && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.25,
              bgcolor: meta.bg,
              borderRadius: `${wsRadius.input}px`,
              px: 1.5,
              py: 1.25,
            }}
          >
            <PreviewIcon sx={{ color: meta.color, fontSize: 22 }} />
            <Box>
              <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: meta.color }}>
                After this: {meta.label}
              </Typography>
              <Typography sx={{ fontSize: 12.5, color: wsColors.ink2 }}>
                {preview.exposure >= 0
                  ? `${formatCurrencyFull(Math.abs(Math.round(preview.exposure)))} paid ahead of work`
                  : `${formatCurrencyFull(Math.abs(Math.round(preview.exposure)))} still held back`}
              </Typography>
            </Box>
          </Box>
        )}
        {valid && !preview.tracked && (
          <Typography sx={{ fontSize: 12, color: wsColors.muted }}>
            Tip: set work progress to see if this payment runs ahead of the work.
          </Typography>
        )}

        {error && <Alert severity="error">{error}</Alert>}
      </Box>
    </ResponsiveSheet>
  );
}
