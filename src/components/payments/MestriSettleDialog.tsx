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
import { useWeekContractSubcontracts } from "@/hooks/queries/useWeekContractSubcontracts";
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
  /**
   * "fill-week" — week-scoped settle (the original "Settle this week" CTA).
   *               Requires weekStart/weekEnd, and the amount field pre-fills
   *               from `suggestedAmount` (typically wagesDue - paid).
   * "date-only" — ledger-style entry from the page header. The user records
   *               an arbitrary "paid ₹X today" and the waterfall RPC handles
   *               which week(s) it fills automatically. Default: empty amount,
   *               today's date, no week subtitle.
   */
  mode?: "fill-week" | "date-only";
  /** Required in "fill-week" mode; ignored in "date-only" mode. */
  weekStart?: string;
  /** Required in "fill-week" mode; ignored in "date-only" mode. */
  weekEnd?: string;
  /** Default amount to fill — typically wagesDue - paid. Used in "fill-week" mode only. */
  suggestedAmount?: number;
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
  mode = "fill-week",
  weekStart,
  weekEnd,
  suggestedAmount = 0,
  initialSubcontractId,
}: MestriSettleDialogProps) {
  const isDateOnly = mode === "date-only";
  const { userProfile } = useAuth();
  const queryClient = useQueryClient();
  const supabase = useMemo(() => createClient(), []);
  const { data: subcontracts, isLoading: subcontractsLoading } =
    useSiteSubcontracts(siteId);

  // Auto-suggest the subcontract from contract-laborer attendance for this
  // week. Only meaningful in fill-week mode — date-only entries don't have
  // a week to derive from. The hook is enabled lazily by passing undefined
  // for the date args when not applicable.
  const { data: weekSubcontractIds } = useWeekContractSubcontracts(
    siteId,
    isDateOnly ? undefined : weekStart,
    isDateOnly ? undefined : weekEnd,
  );

  // Form state
  const [subcontractId, setSubcontractId] = useState<string | null>(
    initialSubcontractId ?? null
  );
  const [amount, setAmount] = useState<string>(
    isDateOnly ? "" : String(Math.max(0, suggestedAmount))
  );
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
      setAmount(isDateOnly ? "" : String(Math.max(0, suggestedAmount)));
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
  }, [open, initialSubcontractId, suggestedAmount, isDateOnly]);

  // Force-refresh the subcontracts cache while the dialog is open. The
  // "Assign one →" alert deep-links to /site/subcontracts in a new tab; when
  // the user assigns a head mestri there and returns, this tab's cache is
  // still within useSiteSubcontracts' 5-min staleTime, so the default
  // refetchOnWindowFocus skips the refetch and the alert keeps showing.
  //
  // We listen on three channels for max coverage:
  //   1. BroadcastChannel("subcontracts-changed") — explicit cross-tab signal
  //      posted by the subcontracts edit form after a successful save. Most
  //      reliable; doesn't depend on tab focus.
  //   2. visibilitychange — fires when the user switches back to this tab.
  //   3. window.focus — fallback for environments where visibilitychange is
  //      flaky (some embedded webviews / older Safari).
  // Plus an immediate invalidate on dialog open to flush any stale data
  // from a prior session.
  useEffect(() => {
    if (!open) return;
    const invalidate = () =>
      queryClient.invalidateQueries({
        queryKey: ["subcontracts", "site", siteId],
      });
    invalidate();

    const onVisible = () => {
      if (document.visibilityState === "visible") invalidate();
    };
    window.addEventListener("focus", invalidate);
    document.addEventListener("visibilitychange", onVisible);

    let bc: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      bc = new BroadcastChannel("subcontracts-changed");
      bc.onmessage = () => invalidate();
    }

    return () => {
      window.removeEventListener("focus", invalidate);
      document.removeEventListener("visibilitychange", onVisible);
      bc?.close();
    };
  }, [open, siteId, queryClient]);

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

  // Week-scoped auto-pick: if every contract attendance row for this week
  // points to the same subcontract, pre-select it. Layered AFTER the single-
  // subcontract-on-site heuristic above so the simpler one wins for sites
  // with only one subcontract (avoids a churn between the two effects).
  useEffect(() => {
    if (
      open &&
      !subcontractId &&
      !isDateOnly &&
      weekSubcontractIds &&
      weekSubcontractIds.length === 1
    ) {
      setSubcontractId(weekSubcontractIds[0]);
    }
  }, [open, subcontractId, isDateOnly, weekSubcontractIds]);

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

      // In date-only mode there is no week to bind to — pass the actual
      // payment date itself. The waterfall RPC is the only consumer that
      // matters and it ignores `payment_for_date` (it allocates based on
      // settlement_groups.settlement_date oldest-first).
      const result = await processContractPayment(supabase, {
        siteId,
        laborerId,
        laborerName: selectedSubcontract.laborer_name ?? "Mestri",
        amount: amountNum,
        paymentType,
        actualPaymentDate: paymentDate,
        paymentForDate: isDateOnly ? paymentDate : (weekStart as string),
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
        {isDateOnly ? "Record mesthri payment" : "Record settlement"}
        {!isDateOnly && weekStart && weekEnd && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block" }}
          >
            Week {dayjs(weekStart).format("DD MMM")}–
            {dayjs(weekEnd).format("DD MMM YYYY")}
          </Typography>
        )}
        {isDateOnly && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block" }}
          >
            Auto-allocates to outstanding weeks via the waterfall.
          </Typography>
        )}
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
                id="mestri-subcontract"
                name="mestri-subcontract"
                label="Subcontract / Mestri"
                size="small"
                required
              />
            )}
          />

          {/* Warn when the chosen subcontract has no mestri attached — otherwise
              the Record button stays disabled with no visible explanation. */}
          {subcontractId && selectedSubcontract && !selectedSubcontract.laborer_name && (
            <Alert severity="warning" sx={{ mt: -1 }}>
              This subcontract has no mestri attached, so it can&apos;t receive a
              salary payment.{" "}
              <Box
                component="a"
                // Deep-links to the subcontracts page with ?edit=<id> so the
                // user lands directly on this subcontract's edit dialog and
                // can pick a Head Mestri without hunting for the row.
                href={`/site/subcontracts?edit=${subcontractId}`}
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  fontWeight: 600,
                  color: "inherit",
                  textDecoration: "underline",
                }}
              >
                Assign one →
              </Box>
            </Alert>
          )}

          {/* Amount + date */}
          <Stack direction="row" spacing={1.5}>
            <TextField
              id="mestri-amount"
              name="mestri-amount"
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
                !isDateOnly && suggestedAmount > 0
                  ? `Suggested: ₹${suggestedAmount.toLocaleString("en-IN")} (week's outstanding)`
                  : undefined
              }
            />
            <TextField
              id="mestri-payment-date"
              name="mestri-payment-date"
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
            id="mestri-payment-type"
            name="mestri-payment-type"
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
              id="mestri-payment-mode"
              name="mestri-payment-mode"
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
              id="mestri-payment-channel"
              name="mestri-payment-channel"
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
                folderPath={`settlements/${siteId}/${weekStart ?? paymentDate}-${dayjs().format("HHmmss")}`}
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
            id="mestri-payer-source"
            name="mestri-payer-source"
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
              id="mestri-custom-payer"
              name="mestri-custom-payer"
              label="Custom payer name"
              size="small"
              value={customPayerName}
              onChange={(e) => setCustomPayerName(e.target.value)}
            />
          )}

          {/* Notes */}
          <TextField
            id="mestri-notes"
            name="mestri-notes"
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
