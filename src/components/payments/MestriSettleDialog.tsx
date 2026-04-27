"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";
import dayjs from "dayjs";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSiteSubcontracts } from "@/hooks/queries/useSubcontracts";
import { processContractPayment } from "@/lib/services/settlementService";
import FileUploader, { type UploadedFile } from "@/components/common/FileUploader";
import type {
  ContractPaymentType,
  PaymentChannel,
  PaymentMode,
} from "@/types/payment.types";

interface MestriSettleDialogProps {
  open: boolean;
  onClose: () => void;
  siteId: string;
  weekStart: string; // YYYY-MM-DD
  weekEnd: string; // YYYY-MM-DD
  /** Default amount to fill — typically wagesDue - paid for the week. */
  suggestedAmount: number;
  /** Pre-selected subcontract (when the page already has a scope). */
  initialSubcontractId?: string | null;
}

const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "net_banking", label: "Net banking" },
  { value: "other", label: "Other" },
];

const PAYMENT_CHANNELS: { value: PaymentChannel; label: string }[] = [
  { value: "direct", label: "Direct (company)" },
  { value: "engineer_wallet", label: "From engineer wallet" },
];

const PAYER_SOURCES: { value: string; label: string }[] = [
  { value: "company", label: "Company" },
  { value: "site_cash", label: "Site cash" },
  { value: "engineer_own", label: "Engineer (own funds)" },
  { value: "custom", label: "Custom payer" },
];

const PAYMENT_TYPES: { value: ContractPaymentType; label: string }[] = [
  { value: "salary", label: "Salary (waterfall)" },
  { value: "advance", label: "Advance (separate)" },
  { value: "excess", label: "Excess / overpayment" },
  { value: "other", label: "Other" },
];

export function MestriSettleDialog({
  open,
  onClose,
  siteId,
  weekStart,
  weekEnd,
  suggestedAmount,
  initialSubcontractId,
}: MestriSettleDialogProps) {
  const { userProfile } = useAuth();
  const queryClient = useQueryClient();
  const supabase = useMemo(() => createClient(), []);
  const { data: subcontracts, isLoading: subcontractsLoading } =
    useSiteSubcontracts(siteId);

  // Form state
  const [subcontractId, setSubcontractId] = useState<string | null>(
    initialSubcontractId ?? null
  );
  const [amount, setAmount] = useState<string>(String(Math.max(0, suggestedAmount)));
  const [paymentDate, setPaymentDate] = useState<string>(
    dayjs().format("YYYY-MM-DD")
  );
  const [paymentType, setPaymentType] = useState<ContractPaymentType>("salary");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash");
  const [paymentChannel, setPaymentChannel] = useState<PaymentChannel>("direct");
  const [payerSource, setPayerSource] = useState<string>("site_cash");
  const [customPayerName, setCustomPayerName] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [proofFile, setProofFile] = useState<UploadedFile | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when reopened
  useEffect(() => {
    if (open) {
      setSubcontractId(initialSubcontractId ?? null);
      setAmount(String(Math.max(0, suggestedAmount)));
      setPaymentDate(dayjs().format("YYYY-MM-DD"));
      setPaymentType("salary");
      setPaymentMode("cash");
      setPaymentChannel("direct");
      setPayerSource("site_cash");
      setCustomPayerName("");
      setNotes("");
      setProofFile(null);
      setError(null);
      setSubmitting(false);
    }
  }, [open, initialSubcontractId, suggestedAmount]);

  // Auto-pick the subcontract if there's only one on the site (saves a click)
  useEffect(() => {
    if (
      open &&
      !subcontractId &&
      subcontracts &&
      subcontracts.length === 1
    ) {
      setSubcontractId(subcontracts[0].id);
    }
  }, [open, subcontractId, subcontracts]);

  const selectedSubcontract = subcontracts?.find((s) => s.id === subcontractId);

  // Validate before allowing submit
  const amountNum = Number(amount);
  const amountValid = Number.isFinite(amountNum) && amountNum > 0;
  // UPI requires a proof screenshot — matches the existing settlement dialog's
  // pattern (see SettlementFormDialog), where bank/UPI transfers must be
  // accompanied by an upload to the settlement-proofs bucket.
  const upiNeedsProof = paymentMode === "upi" && !proofFile;
  const canSubmit =
    amountValid &&
    Boolean(subcontractId) &&
    Boolean(selectedSubcontract?.laborer_name) &&
    Boolean(paymentDate) &&
    Boolean(userProfile) &&
    !upiNeedsProof;

  async function handleSubmit() {
    if (!canSubmit || !userProfile || !selectedSubcontract) return;
    setError(null);
    setSubmitting(true);

    // The mestri's laborer_id lives on subcontracts but useSiteSubcontracts
    // flattens to laborer_name only — fetch the laborer_id via a raw query.
    try {
      const { data: subRow, error: subErr } = await supabase
        .from("subcontracts")
        .select("laborer_id")
        .eq("id", selectedSubcontract.id)
        .single();
      if (subErr) throw subErr;
      const laborerId = (subRow as { laborer_id: string | null })?.laborer_id;
      if (!laborerId) {
        throw new Error(
          "This subcontract has no laborer (mestri) attached — assign one before settling."
        );
      }

      const result = await processContractPayment(supabase, {
        siteId,
        laborerId,
        laborerName: selectedSubcontract.laborer_name ?? "Mestri",
        amount: amountNum,
        paymentType,
        actualPaymentDate: paymentDate,
        paymentForDate: weekStart,
        paymentMode,
        paymentChannel,
        payerSource,
        customPayerName:
          payerSource === "custom" ? customPayerName : undefined,
        subcontractId: selectedSubcontract.id,
        proofUrl: proofFile?.url || undefined,
        notes: notes || undefined,
        userId: userProfile.id,
        userName: userProfile.name ?? userProfile.email ?? "Unknown",
      });

      if (!result.success) {
        throw new Error(result.error ?? "Settlement failed");
      }

      // Refresh everything that touches this data
      queryClient.invalidateQueries({ queryKey: ["salary-waterfall"] });
      queryClient.invalidateQueries({ queryKey: ["salary-slice-summary"] });
      queryClient.invalidateQueries({ queryKey: ["payments-ledger"] });
      queryClient.invalidateQueries({ queryKey: ["advances"] });
      queryClient.invalidateQueries({ queryKey: ["subcontract-spend"] });

      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ pr: 6 }}>
        Record settlement
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block" }}
        >
          Week {dayjs(weekStart).format("DD MMM")}–
          {dayjs(weekEnd).format("DD MMM YYYY")}
        </Typography>
        <IconButton
          onClick={onClose}
          sx={{ position: "absolute", right: 8, top: 8 }}
          aria-label="Close"
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}

          {/* Subcontract picker */}
          <Autocomplete
            options={subcontracts ?? []}
            loading={subcontractsLoading}
            value={selectedSubcontract ?? null}
            onChange={(_, v) => setSubcontractId(v?.id ?? null)}
            getOptionLabel={(opt) =>
              opt.laborer_name
                ? `${opt.title} · ${opt.laborer_name}`
                : opt.title
            }
            slotProps={{ popper: { disablePortal: false } }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Subcontract / Mestri"
                size="small"
                required
              />
            )}
          />

          {/* Amount + date */}
          <Stack direction="row" spacing={1.5}>
            <TextField
              label="Amount (₹)"
              size="small"
              type="number"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputProps={{ min: 0, step: 1, inputMode: "numeric" }}
              sx={{ flex: 1 }}
              error={amount !== "" && !amountValid}
              helperText={
                suggestedAmount > 0
                  ? `Suggested: ₹${suggestedAmount.toLocaleString("en-IN")} (week's outstanding)`
                  : undefined
              }
            />
            <TextField
              label="Payment date"
              size="small"
              type="date"
              required
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={{ flex: 1 }}
            />
          </Stack>

          {/* Payment type */}
          <TextField
            label="Payment type"
            size="small"
            select
            value={paymentType}
            onChange={(e) =>
              setPaymentType(e.target.value as ContractPaymentType)
            }
          >
            {PAYMENT_TYPES.map((p) => (
              <MenuItem key={p.value} value={p.value}>
                {p.label}
              </MenuItem>
            ))}
          </TextField>

          {/* Mode + channel */}
          <Stack direction="row" spacing={1.5}>
            <TextField
              label="Payment mode"
              size="small"
              select
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
              sx={{ flex: 1 }}
            >
              {PAYMENT_MODES.map((p) => (
                <MenuItem key={p.value} value={p.value}>
                  {p.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Channel"
              size="small"
              select
              value={paymentChannel}
              onChange={(e) =>
                setPaymentChannel(e.target.value as PaymentChannel)
              }
              sx={{ flex: 1 }}
            >
              {PAYMENT_CHANNELS.map((p) => (
                <MenuItem key={p.value} value={p.value}>
                  {p.label}
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          {/* UPI proof screenshot — required when payment mode is UPI */}
          {paymentMode === "upi" && (
            <Box>
              <FileUploader
                supabase={supabase}
                bucketName="settlement-proofs"
                folderPath={`settlements/${siteId}/${weekStart}-${dayjs().format("HHmmss")}`}
                fileNamePrefix="proof"
                accept="image"
                maxSizeMB={10}
                label="Payment screenshot *"
                helperText="Upload screenshot of UPI/bank transfer (required for UPI)"
                value={proofFile}
                onUpload={(file) => setProofFile(file)}
                onRemove={() => setProofFile(null)}
                compact
              />
            </Box>
          )}

          {/* Payer source */}
          <TextField
            label="Paid by"
            size="small"
            select
            value={payerSource}
            onChange={(e) => setPayerSource(e.target.value)}
          >
            {PAYER_SOURCES.map((p) => (
              <MenuItem key={p.value} value={p.value}>
                {p.label}
              </MenuItem>
            ))}
          </TextField>

          {payerSource === "custom" && (
            <TextField
              label="Custom payer name"
              size="small"
              value={customPayerName}
              onChange={(e) => setCustomPayerName(e.target.value)}
            />
          )}

          {/* Notes */}
          <TextField
            label="Notes (optional)"
            size="small"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            multiline
            minRows={2}
          />

          <Typography variant="caption" color="text.secondary">
            This payment will be allocated to outstanding weeks via the
            waterfall (oldest week first). Advances are tracked separately and
            don&apos;t reduce the salary owed.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="success"
          disabled={!canSubmit || submitting}
          onClick={handleSubmit}
        >
          {submitting ? "Recording…" : "Record settlement"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
