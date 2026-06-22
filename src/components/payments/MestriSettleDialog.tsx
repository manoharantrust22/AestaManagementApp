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
import {
  AccountBalanceWallet as WalletIcon,
  Close as CloseIcon,
} from "@mui/icons-material";
import dayjs from "dayjs";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSiteSubcontracts } from "@/hooks/queries/useSubcontracts";
import { buildSubcontractOptions } from "@/lib/workforce/subcontractOptions";
import { useWeekContractSubcontracts } from "@/hooks/queries/useWeekContractSubcontracts";
import { useLaborers } from "@/hooks/queries/useLaborers";
import { processContractPayment } from "@/lib/services/settlementService";
import FileUploader, { type UploadedFile } from "@/components/common/FileUploader";
import type {
  ContractPaymentType,
  PaymentMode,
} from "@/types/payment.types";
import type { PayerSourceInput } from "@/types/settlement.types";
import PayerSourceSplitInput from "@/components/settlement/PayerSourceSplitInput";
import { validatePayerSourceInput } from "@/lib/settlement/payerSource";
import { isSiteEngineerPayingFromWallet } from "@/components/expenses/walletPayerLock";
import { hasEditPermission } from "@/lib/permissions";
import { withTimeout, TIMEOUTS } from "@/lib/utils/timeout";

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
  /**
   * When provided, renders a "Pay from wallet instead" affordance at the top
   * of the dialog. Clicking closes Mestri and the caller is expected to open
   * SettleViaWalletDialog (or the ContractSettleViaWallet launcher) with the
   * same week / subcontract / amount context. Wired by callers that detect a
   * wallet-enabled site engineer (e.g. TradeSettlementView).
   */
  onSwitchToWallet?: () => void;
}

const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "net_banking", label: "Net banking" },
  { value: "other", label: "Other" },
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
  onSwitchToWallet,
}: MestriSettleDialogProps) {
  const isDateOnly = mode === "date-only";
  const { userProfile } = useAuth();
  const queryClient = useQueryClient();
  const supabase = useMemo(() => createClient(), []);
  const { data: subcontracts, isLoading: subcontractsLoading } =
    useSiteSubcontracts(siteId);
  // Active laborers, for the inline "assign a mestri" picker shown when the
  // chosen subcontract has no head mestri attached yet.
  const { data: laborers, isLoading: laborersLoading } = useLaborers();
  const canEdit = hasEditPermission(userProfile?.role);

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
  const [payer, setPayer] = useState<PayerSourceInput>({
    mode: "single",
    source: "own_money",
  });
  const [notes, setNotes] = useState<string>("");
  const [proofFile, setProofFile] = useState<UploadedFile | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inline mestri-assignment state — lets the user attach a head mestri to a
  // subcontract right here instead of navigating to /site/subcontracts.
  const [assignLaborerId, setAssignLaborerId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  // Reset form when reopened
  useEffect(() => {
    if (open) {
      setSubcontractId(initialSubcontractId ?? null);
      setAmount(isDateOnly ? "" : String(Math.max(0, suggestedAmount)));
      setPaymentDate(dayjs().format("YYYY-MM-DD"));
      setPaymentType("salary");
      setPaymentMode("cash");
      setPayer({ mode: "single", source: "own_money" });
      setNotes("");
      setProofFile(null);
      setError(null);
      setSubmitting(false);
      setAssignLaborerId(null);
      setAssigning(false);
      setAssignError(null);
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

  // Order the picker so a combined parent contract leads, with its floor children
  // indented beneath it (the parent is the default choice; the floor is optional).
  const subcontractRows = useMemo(
    () => buildSubcontractOptions(subcontracts ?? []),
    [subcontracts]
  );
  const subcontractOptions = useMemo(() => subcontractRows.map((r) => r.item), [subcontractRows]);
  const subcontractRowById = useMemo(
    () => new Map(subcontractRows.map((r) => [r.item.id, r])),
    [subcontractRows]
  );

  // Inline-assign picker options: laborers in the subcontract's trade category
  // (e.g. Civil) float to the top under a "Suggested" group; everyone else
  // follows. If the trade has no matching laborers, the whole active list shows
  // — mirrors the subcontracts edit form's "pick any active laborer" fallback.
  const tradeCategoryId = selectedSubcontract?.trade_category_id ?? null;
  const mestriOptions = useMemo(() => {
    const all = (laborers ?? []).slice();
    all.sort((a, b) => {
      const am = tradeCategoryId && a.category_id === tradeCategoryId ? 0 : 1;
      const bm = tradeCategoryId && b.category_id === tradeCategoryId ? 0 : 1;
      if (am !== bm) return am - bm;
      return (a.name ?? "").localeCompare(b.name ?? "");
    });
    return all;
  }, [laborers, tradeCategoryId]);

  // Clear a stale mestri pick (and any error) when the subcontract changes.
  useEffect(() => {
    setAssignLaborerId(null);
    setAssignError(null);
  }, [subcontractId]);

  // Attach the chosen laborer as this subcontract's head mestri, then refresh
  // the subcontracts cache so laborer_name populates and the warning clears.
  async function handleAssignMestri() {
    if (!subcontractId || !assignLaborerId) return;
    setAssignError(null);
    setAssigning(true);
    try {
      const result = (await withTimeout(
        (supabase.from("subcontracts") as any)
          .update({ laborer_id: assignLaborerId })
          .eq("id", subcontractId),
        TIMEOUTS.DATABASE_OPERATION,
        "Assigning the mestri timed out — check your connection and try again."
      )) as { error: unknown };
      if (result.error) throw result.error;

      // Signal any open /site/subcontracts tab, then force this tab's cache to
      // refetch immediately (bypassing the 5-min staleTime).
      if (typeof BroadcastChannel !== "undefined") {
        const bc = new BroadcastChannel("subcontracts-changed");
        bc.postMessage({ siteId, at: Date.now() });
        bc.close();
      }
      await queryClient.invalidateQueries({
        queryKey: ["subcontracts", "site", siteId],
      });
      setAssignLaborerId(null);
    } catch (e) {
      setAssignError(e instanceof Error ? e.message : String(e));
    } finally {
      setAssigning(false);
    }
  }

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

    const payerCheck = validatePayerSourceInput(payer, amountNum);
    if (!payerCheck.ok) {
      setError(payerCheck.reason);
      setSubmitting(false);
      return;
    }

    // The mestri's laborer_id lives on subcontracts but useSiteSubcontracts
    // flattens to laborer_name only — fetch the laborer_id via a raw query.
    try {
      // Defensive date checks — empty strings reach Postgres as the literal
      // "" and explode with "invalid input syntax for type date". Guard here
      // so the user gets a clear message instead of a silent hang.
      if (!paymentDate) {
        throw new Error("Payment date is required.");
      }
      if (!isDateOnly && !weekStart) {
        throw new Error(
          "Week boundary is missing — close and reopen the dialog from a week's Settle button."
        );
      }

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

      // 30-second hard timeout so the dialog can never hang forever on a
      // dropped request or a poisoned proxy connection. Without this, the
      // button would stay stuck on "Recording…" indefinitely with no error.
      const SETTLE_TIMEOUT_MS = 30000;
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                "Settlement is taking too long — check your connection and try again."
              )
            ),
          SETTLE_TIMEOUT_MS
        )
      );

      // In date-only mode there is no week to bind to — pass the actual
      // payment date itself. The waterfall RPC is the only consumer that
      // matters and it ignores `payment_for_date` (it allocates based on
      // settlement_groups.settlement_date oldest-first).
      const result = await Promise.race([
        processContractPayment(supabase, {
          siteId,
          laborerId,
          laborerName: selectedSubcontract.laborer_name ?? "Mestri",
          amount: amountNum,
          paymentType,
          actualPaymentDate: paymentDate,
          paymentForDate: isDateOnly ? paymentDate : (weekStart as string),
          paymentMode,
          paymentChannel: "direct",
          payer,
          subcontractId: selectedSubcontract.id,
          proofUrl: proofFile?.url || undefined,
          notes: notes || undefined,
          userId: userProfile.id,
          userName: userProfile.name ?? userProfile.email ?? "Unknown",
        }),
        timeoutPromise,
      ]);

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
          {onSwitchToWallet && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<WalletIcon fontSize="small" />}
              onClick={onSwitchToWallet}
              disabled={submitting}
              sx={{ alignSelf: "flex-start", textTransform: "none" }}
            >
              Pay from wallet instead
            </Button>
          )}

          {error && <Alert severity="error">{error}</Alert>}

          {/* Contract picker — parent contract first, floors indented under it */}
          <Autocomplete
            options={subcontractOptions}
            loading={subcontractsLoading}
            value={selectedSubcontract ?? null}
            onChange={(_, v) => setSubcontractId(v?.id ?? null)}
            getOptionLabel={(opt) =>
              opt.laborer_name
                ? `${opt.title} · ${opt.laborer_name}`
                : opt.title
            }
            renderOption={(props, opt) => {
              const row = subcontractRowById.get(opt.id);
              const child = row?.depth === 1;
              return (
                <Box
                  component="li"
                  {...props}
                  key={opt.id}
                  sx={{ pl: child ? 4 : 2, fontWeight: row?.isParent ? 700 : 400 }}
                >
                  {child ? "↳ " : ""}
                  {opt.title}
                  {opt.laborer_name ? ` · ${opt.laborer_name}` : ""}
                </Box>
              );
            }}
            slotProps={{ popper: { disablePortal: false } }}
            renderInput={(params) => (
              <TextField
                {...params}
                id="mestri-subcontract"
                name="mestri-subcontract"
                label="Contract / Mestri"
                size="small"
                required
              />
            )}
          />

          {/* No mestri attached — the subcontract can't receive a salary payment
              until a head mestri (the wage recipient) is linked. Editors get an
              inline picker so they never have to leave the dialog; everyone else
              falls back to the deep-link into the subcontracts edit page. */}
          {subcontractId && selectedSubcontract && !selectedSubcontract.laborer_name && (
            <Alert severity="warning" sx={{ mt: -1 }}>
              {canEdit ? (
                <Stack spacing={1}>
                  <Typography variant="body2">
                    No mestri attached yet — pick who receives this
                    subcontract&apos;s wages.
                  </Typography>
                  <Autocomplete
                    options={mestriOptions}
                    loading={laborersLoading}
                    value={
                      mestriOptions.find((l) => l.id === assignLaborerId) ?? null
                    }
                    onChange={(_, v) => setAssignLaborerId(v?.id ?? null)}
                    getOptionLabel={(opt) => opt.name ?? ""}
                    groupBy={(opt) =>
                      tradeCategoryId && opt.category_id === tradeCategoryId
                        ? "Suggested for this trade"
                        : "All laborers"
                    }
                    isOptionEqualToValue={(o, v) => o.id === v.id}
                    slotProps={{ popper: { disablePortal: false } }}
                    size="small"
                    disabled={assigning}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Head mestri"
                        placeholder="Select a laborer"
                      />
                    )}
                  />
                  <Box
                    sx={{ display: "flex", alignItems: "center", gap: 1.5 }}
                  >
                    <Button
                      size="small"
                      variant="contained"
                      color="warning"
                      disabled={!assignLaborerId || assigning}
                      onClick={handleAssignMestri}
                    >
                      {assigning ? "Assigning…" : "Assign mestri"}
                    </Button>
                    <Box
                      component="a"
                      href={`/site/subcontracts?edit=${subcontractId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      sx={{
                        fontSize: "0.8125rem",
                        color: "inherit",
                        textDecoration: "underline",
                      }}
                    >
                      or edit on the subcontracts page →
                    </Box>
                  </Box>
                  {assignError && (
                    <Typography variant="caption" color="error.main">
                      {assignError}
                    </Typography>
                  )}
                </Stack>
              ) : (
                <>
                  This subcontract has no mestri attached, so it can&apos;t
                  receive a salary payment.{" "}
                  <Box
                    component="a"
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
                </>
              )}
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

          {/* Mode */}
          <TextField
            id="mestri-payment-mode"
            name="mestri-payment-mode"
            label="Payment mode"
            size="small"
            select
            value={paymentMode}
            onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
          >
            {PAYMENT_MODES.map((p) => (
              <MenuItem key={p.value} value={p.value}>
                {p.label}
              </MenuItem>
            ))}
          </TextField>

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

          {/* Payer source — hidden for site engineers paying from wallet
              (source is derived from deposit attribution in Phase 2). */}
          {!isSiteEngineerPayingFromWallet({
            userRole: userProfile?.role,
            payerType: "site_engineer",
            createWalletTransaction: true,
          }) && (
            <PayerSourceSplitInput
              value={payer}
              onChange={setPayer}
              total={amountNum}
              siteId={siteId}
              disabled={submitting}
            />
          )}

          {(() => {
            const c = validatePayerSourceInput(payer, amountNum);
            return !c.ok && payer.mode === "split" ? (
              <Typography variant="caption" color="error.main">
                {c.reason}
              </Typography>
            ) : null;
          })()}

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

          {/* Inline error so users actually see why the settle failed instead
              of the button silently snapping back from "Recording…" to "Settle". */}
          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="success"
          disabled={
            !canSubmit ||
            submitting ||
            !validatePayerSourceInput(payer, amountNum).ok
          }
          onClick={handleSubmit}
        >
          {submitting ? "Recording…" : "Record settlement"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
