"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Button,
  Typography,
  RadioGroup,
  Radio,
  FormControlLabel,
  FormControl,
  Select,
  MenuItem,
  TextField,
  Alert,
  CircularProgress,
  Divider,
  Avatar,
  LinearProgress,
  Collapse,
} from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import {
  Payment as PaymentIcon,
  Info as InfoIcon,
} from "@mui/icons-material";
import { createClient } from "@/lib/supabase/client";
import { ensureFreshSession } from "@/lib/auth/sessionManager";
import { useAuth } from "@/contexts/AuthContext";
import { useSite } from "@/contexts/SiteContext";
import { createSalaryExpense } from "@/lib/services/notificationService";
import { processContractPayment, processSettlement } from "@/lib/services/settlementService";
import FileUploader, { UploadedFile } from "@/components/common/FileUploader";
import SubcontractLinkSelector from "./SubcontractLinkSelector";
import PayerSourceSplitInput from "@/components/settlement/PayerSourceSplitInput";
import { isSiteEngineerPayingFromWallet } from "@/components/expenses/walletPayerLock";
import { validatePayerSourceInput } from "@/lib/settlement/payerSource";
import { useToast } from "@/contexts/ToastContext";
import dayjs from "dayjs";
import type {
  PaymentDialogProps,
  PaymentMode,
  PaymentChannel,
  WeeklyContractLaborer,
  ContractPaymentType,
} from "@/types/payment.types";
import type {
  PayerSourceInput,
  SettlementRecord,
} from "@/types/settlement.types";

export default function PaymentDialog({
  open,
  onClose,
  dailyRecords = [],
  weeklyPayment,
  allowSubcontractLink = true,
  defaultSubcontractId,
  onSuccess,
}: PaymentDialogProps) {
  const { userProfile } = useAuth();
  const { selectedSite } = useSite();
  const supabase = createClient();
  const { showSuccess, showError: showErrorToast } = useToast();

  // Form state
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("upi");
  // Phase-1 payer-source-split refactor removed the "Via Site Engineer"
  // channel toggle from this dialog. Engineer-wallet flows now happen in
  // dedicated dialogs (MestriSettleDialog etc.). PaymentDialog always
  // records a direct payment; the const is kept so downstream readers and
  // the SettlementConfig field stay populated without further changes.
  const paymentChannel: PaymentChannel = "direct";
  const [subcontractId, setSubcontractId] = useState<string | null>(
    defaultSubcontractId || null
  );
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState<string>("");

  // New: Payment date and type (for contract weekly payments)
  const [actualPaymentDate, setActualPaymentDate] = useState<dayjs.Dayjs>(dayjs());
  const [paymentType, setPaymentType] = useState<ContractPaymentType>("salary");

  // Payer source — unified single-or-split input. Phase 1 of the
  // payer-source-split refactor: this replaces the previous
  // moneySource / moneySourceName pair.
  const [payer, setPayer] = useState<PayerSourceInput>({
    mode: "single",
    source: "own_money",
  });

  // For partial payments (weekly)
  const [isPartialPayment, setIsPartialPayment] = useState(false);
  const [partialAmount, setPartialAmount] = useState<number>(0);

  // Data state
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Soft confirmation when the user tries to save without a subcontract link.
  // Daily/market settlements can legitimately be unlinked, but it's rare —
  // most are tied to a subcontract. We pre-fill from attendance when we can
  // (see open-effect below) and warn before saving with a NULL link.
  const [showNoLinkConfirm, setShowNoLinkConfirm] = useState(false);

  // Determine if this is a weekly payment or daily/market
  const isWeeklyPayment = !!weeklyPayment;

  // Calculate totals
  const totalAmount = useMemo(() => {
    if (isWeeklyPayment && weeklyPayment) {
      return weeklyPayment.laborer.runningBalance;
    }
    return dailyRecords.reduce((sum, r) => sum + r.amount, 0);
  }, [isWeeklyPayment, weeklyPayment, dailyRecords]);

  const paymentAmount = useMemo(() => {
    if (isPartialPayment && partialAmount > 0) {
      return partialAmount;
    }
    return totalAmount;
  }, [isPartialPayment, partialAmount, totalAmount]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setPaymentMode("upi");
      setSubcontractId(defaultSubcontractId || null);
      setProofUrl(null);
      setNotes("");
      setIsPartialPayment(false);
      setPartialAmount(0);
      setError(null);
      setPayer({ mode: "single", source: "own_money" });
      setActualPaymentDate(dayjs()); // Default to today
      setPaymentType("salary"); // Default to salary

      // Set default subcontract for weekly payment
      if (weeklyPayment?.laborer.subcontractId) {
        setSubcontractId(weeklyPayment.laborer.subcontractId);
      } else if (!defaultSubcontractId && dailyRecords.length > 0) {
        // Auto-suggest from the attendance rows being settled. If every
        // record shares the same subcontract, pre-select it. Mixed or all-
        // null means we leave it empty so the user makes a deliberate pick.
        const distinct = new Set<string>();
        for (const r of dailyRecords) {
          if (r.subcontractId) distinct.add(r.subcontractId);
        }
        if (distinct.size === 1) {
          setSubcontractId(Array.from(distinct)[0] as string);
        }
      }

      setShowNoLinkConfirm(false);
    }
  }, [open, defaultSubcontractId, weeklyPayment, dailyRecords]);

  const handleSubmit = async (bypassNoLinkConfirm = false) => {
    if (!selectedSite?.id || !userProfile) return;

    if (isPartialPayment && partialAmount <= 0) {
      setError("Please enter a valid payment amount");
      return;
    }

    const payerCheckSubmit = validatePayerSourceInput(payer, paymentAmount);
    if (!payerCheckSubmit.ok) {
      setError(payerCheckSubmit.reason);
      return;
    }

    // Soft confirm before saving without a subcontract link. Only applies to
    // the daily/market path — weekly contract payments are handled by
    // MestriSettleDialog (which hard-requires a mestri/subcontract).
    if (
      allowSubcontractLink &&
      !subcontractId &&
      !isWeeklyPayment &&
      !bypassNoLinkConfirm
    ) {
      setShowNoLinkConfirm(true);
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      // Ensure session is fresh before database operations
      try {
        await ensureFreshSession();
      } catch (sessionErr) {
        console.warn("[PaymentDialog] Session check failed:", sessionErr);
        setError("Your session has expired. Please refresh the page and try again.");
        setProcessing(false);
        return;
      }

      // For weekly payments, the service handles everything including engineer transactions
      if (isWeeklyPayment && weeklyPayment) {
        // Guard: processContractPayment is still on the legacy single-source
        // shape until Phase 2. A split payload would be silently collapsed to
        // row 0 (data loss). Block submit with a clear message instead.
        if (payer.mode === "split") {
          setError(
            "Split sources for weekly contract payments will be supported in Phase 2. Please choose a single source for now."
          );
          setProcessing(false);
          return;
        }
        // Weekly contract laborer payment - uses new service
        await processWeeklyPayment(
          weeklyPayment.laborer,
          weeklyPayment.weekStart
        );

        // Success - close dialog (expense handled by service via settlement_groups)
        showSuccess(`Payment of Rs.${paymentAmount.toLocaleString()} recorded successfully`);
        onSuccess?.();
        onClose();
        return;
      }

      // Daily/Market payments — direct path only after the phase-1 cleanup;
      // the wallet channel was removed from this dialog. processSettlement
      // writes attendance is_paid / settlement_group_id / payer_source(_split)
      // internally.
      const settlementRecords: SettlementRecord[] = dailyRecords.map(record => ({
        id: record.id,
        sourceType: record.sourceType,
        sourceId: record.sourceId,
        laborerName: record.laborerName,
        laborerType: record.laborerType,
        amount: record.amount,
        date: record.date,
        isPaid: record.isPaid,
        role: record.role,
        count: record.count,
      }));

      const result = await processSettlement(supabase, {
        siteId: selectedSite.id,
        records: settlementRecords,
        totalAmount: paymentAmount,
        paymentMode: paymentMode,
        paymentChannel: paymentChannel,
        payer,
        proofUrl: proofUrl || undefined,
        notes: notes || undefined,
        subcontractId: subcontractId || undefined,
        userId: userProfile.id,
        userName: userProfile.name || userProfile.email || "Unknown",
      });

      if (!result.success) {
        throw new Error(result.error || "Settlement failed");
      }

      showSuccess(`Payment of Rs.${paymentAmount.toLocaleString()} recorded successfully`);
      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error("Payment error:", err);
      const errorMsg = err.message || "Failed to process payment";
      setError(errorMsg);
      showErrorToast(errorMsg);
    } finally {
      setProcessing(false);
    }
  };

  const processWeeklyPayment = async (
    laborer: WeeklyContractLaborer,
    weekStart: string
  ) => {
    // processContractPayment now takes PayerSourceInput (union of single/split).
    // The Phase 1 guard at the top of the weekly branch blocks split submissions
    // before we get here, so in practice `payer.mode === "single"`. We pass the
    // union through directly — the validator inside processContractPayment will
    // reject any unexpected split that slips past the guard.
    // Use the new processContractPayment service for contract weekly payments
    const result = await processContractPayment(supabase, {
      siteId: selectedSite!.id,
      laborerId: laborer.laborerId,
      laborerName: laborer.laborerName,
      amount: paymentAmount,
      paymentType: paymentType,
      actualPaymentDate: actualPaymentDate.format("YYYY-MM-DD"),
      paymentForDate: weekStart,
      paymentMode: paymentMode,
      paymentChannel: paymentChannel,
      payer,
      proofUrl: proofUrl || undefined,
      notes: notes || undefined,
      subcontractId: subcontractId || undefined,
      userId: userProfile!.id,
      userName: userProfile!.name || "Unknown",
    });

    if (!result.success) {
      throw new Error(result.error || "Failed to process contract payment");
    }

    // Update daily_attendance records for this week with the payment info
    const attendanceIds = laborer.dailySalary.map((d) => d.attendanceId);

    if (attendanceIds.length > 0 && result.paymentId) {
      // For salary payments, check if fully paid based on allocation
      const newTotalPaid = laborer.cumulativePaid + paymentAmount;
      const isFullyPaid = newTotalPaid >= laborer.cumulativeSalary;

      const { error: updateError } = await supabase
        .from("daily_attendance")
        .update({
          payment_id: result.paymentId,
          is_paid: isFullyPaid,
          payment_date: isFullyPaid ? actualPaymentDate.format("YYYY-MM-DD") : null,
          paid_via: paymentChannel === "direct" ? "direct" : "engineer_wallet",
          subcontract_id: subcontractId,
          settlement_group_id: result.settlementGroupId || null,
        })
        .in("id", attendanceIds);

      if (updateError) throw updateError;
    }
  };

  // Wrapped in useCallback to prevent re-renders when file is uploaded
  const handleFileUpload = useCallback((file: UploadedFile) => {
    setProofUrl(file.url);
  }, []);

  const handleFileRemove = useCallback(() => {
    setProofUrl(null);
  }, []);

  // Payer-source validation result, used by both the submit-button disabled
  // prop and the inline reason rendered under the actions row.
  const payerCheck = validatePayerSourceInput(payer, paymentAmount);

  // Title based on payment type
  const dialogTitle = isWeeklyPayment
    ? `Weekly Settlement - ${weeklyPayment?.laborer.laborerName}`
    : `Salary Settlement (${dailyRecords.length} ${dailyRecords.length === 1 ? "record" : "records"})`;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <Box>
            <Typography variant="h6" component="span">{dialogTitle}</Typography>
            <Typography variant="body2" color="text.secondary">
              Total: Rs.{totalAmount.toLocaleString()}
            </Typography>
          </Box>
          <PaymentIcon color="primary" />
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Weekly Payment Details */}
        {isWeeklyPayment && weeklyPayment && (
          <Box sx={{ mb: 3, p: 2, bgcolor: "action.hover", borderRadius: 1 }}>
            <Typography variant="subtitle2" gutterBottom>
              {weeklyPayment.laborer.laborerName}
            </Typography>
            <Typography variant="caption" color="text.secondary" display="block">
              Week: {dayjs(weeklyPayment.weekStart).format("MMM D")} -{" "}
              {dayjs(weeklyPayment.weekEnd).format("MMM D, YYYY")}
            </Typography>

            <Box sx={{ mt: 2 }}>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  mb: 0.5,
                }}
              >
                <Typography variant="body2">This Week Salary:</Typography>
                <Typography variant="body2" fontWeight={500}>
                  Rs.{weeklyPayment.laborer.weekSalary.toLocaleString()}
                </Typography>
              </Box>
              {weeklyPayment.laborer.previousBalance > 0 && (
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    mb: 0.5,
                  }}
                >
                  <Typography variant="body2" color="warning.main">
                    Previous Balance:
                  </Typography>
                  <Typography
                    variant="body2"
                    fontWeight={500}
                    color="warning.main"
                  >
                    Rs.{weeklyPayment.laborer.previousBalance.toLocaleString()}
                  </Typography>
                </Box>
              )}
              <Divider sx={{ my: 1 }} />
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  mb: 0.5,
                }}
              >
                <Typography variant="body2">Total Due:</Typography>
                <Typography variant="body2" fontWeight={600}>
                  Rs.
                  {(
                    weeklyPayment.laborer.weekSalary +
                    weeklyPayment.laborer.previousBalance
                  ).toLocaleString()}
                </Typography>
              </Box>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  mb: 0.5,
                }}
              >
                <Typography variant="body2">Already Paid:</Typography>
                <Typography
                  variant="body2"
                  fontWeight={500}
                  color="success.main"
                >
                  Rs.{weeklyPayment.laborer.weekPaid.toLocaleString()}
                </Typography>
              </Box>
              <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                <Typography variant="body2" fontWeight={600}>
                  Balance Due:
                </Typography>
                <Typography
                  variant="body2"
                  fontWeight={600}
                  color="error.main"
                >
                  Rs.{weeklyPayment.laborer.runningBalance.toLocaleString()}
                </Typography>
              </Box>
            </Box>

            {/* Progress bar */}
            <Box sx={{ mt: 2 }}>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  mb: 0.5,
                }}
              >
                <Typography variant="caption" color="text.secondary">
                  Payment Progress
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {weeklyPayment.laborer.paymentProgress.toFixed(0)}%
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={Math.min(weeklyPayment.laborer.paymentProgress, 100)}
                color={
                  weeklyPayment.laborer.paymentProgress >= 100
                    ? "success"
                    : weeklyPayment.laborer.paymentProgress > 50
                      ? "warning"
                      : "error"
                }
                sx={{ height: 8, borderRadius: 1 }}
              />
            </Box>

            {/* Partial payment option */}
            <Box sx={{ mt: 2 }}>
              <FormControlLabel
                control={
                  <Radio
                    checked={!isPartialPayment}
                    onChange={() => setIsPartialPayment(false)}
                    size="small"
                  />
                }
                label={`Full Balance Rs.${weeklyPayment.laborer.runningBalance.toLocaleString()}`}
              />
              <FormControlLabel
                control={
                  <Radio
                    checked={isPartialPayment}
                    onChange={() => setIsPartialPayment(true)}
                    size="small"
                  />
                }
                label="Partial Payment"
              />
              <Collapse in={isPartialPayment}>
                <TextField
                  size="small"
                  type="number"
                  label="Amount"
                  value={partialAmount || ""}
                  onChange={(e) => setPartialAmount(Number(e.target.value))}
                  InputProps={{
                    startAdornment: (
                      <Typography variant="body2" sx={{ mr: 0.5 }}>
                        Rs.
                      </Typography>
                    ),
                  }}
                  sx={{ mt: 1, width: 200 }}
                />
              </Collapse>
            </Box>
          </Box>
        )}

        {/* Payment Type and Date - Only for weekly payments */}
        {isWeeklyPayment && (
          <>
            {/* Payment Type */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                Payment Type
              </Typography>
              <FormControl fullWidth size="small">
                <Select
                  value={paymentType}
                  onChange={(e) => setPaymentType(e.target.value as ContractPaymentType)}
                >
                  <MenuItem value="salary">Salary (Reduces weekly due)</MenuItem>
                  <MenuItem value="advance">Advance (Tracked separately)</MenuItem>
                  <MenuItem value="other">Other</MenuItem>
                </Select>
              </FormControl>
              {paymentType === "advance" && (
                <Alert severity="info" sx={{ mt: 1 }} icon={<InfoIcon fontSize="small" />}>
                  Advance payments reduce subcontract balance but are tracked separately from weekly salary.
                  They will be deducted from future salary payments.
                </Alert>
              )}
              {paymentType === "salary" && (
                <Alert severity="success" sx={{ mt: 1 }} icon={<InfoIcon fontSize="small" />}>
                  This payment will be automatically allocated to the oldest unpaid weeks first.
                </Alert>
              )}
            </Box>

            {/* Actual Payment Date */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" gutterBottom>
                Payment Date
              </Typography>
              <LocalizationProvider dateAdapter={AdapterDayjs}>
                <DatePicker
                  value={actualPaymentDate}
                  onChange={(newValue) => newValue && setActualPaymentDate(newValue)}
                  slotProps={{
                    textField: {
                      size: "small",
                      fullWidth: true,
                      helperText: "When was the actual payment made?",
                    },
                  }}
                  maxDate={dayjs()} // Can't select future dates
                />
              </LocalizationProvider>
            </Box>
          </>
        )}

        {/* Payment Mode */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            Payment Mode
          </Typography>
          <RadioGroup
            row
            value={paymentMode}
            onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
          >
            <FormControlLabel value="upi" control={<Radio />} label="UPI" />
            <FormControlLabel value="cash" control={<Radio />} label="Cash" />
            <FormControlLabel
              value="net_banking"
              control={<Radio />}
              label="Net Banking"
            />
            <FormControlLabel value="other" control={<Radio />} label="Other" />
          </RadioGroup>
        </Box>

        {/* Payer Source — single or split. The outer guard suppresses the
            picker when a site engineer pays from their own wallet (source
            is derived from deposits). With the channel toggle removed in
            phase-1, paymentChannel is always "direct", so the predicate
            is effectively false; the guard stays in place for symmetry
            with other dialogs and for the future phase-2 wallet path. */}
        {!isSiteEngineerPayingFromWallet({
          userRole: userProfile?.role,
          payerType: "site_engineer",
          // paymentChannel is hardcoded "direct" after phase-1 cleanup; this
          // wallet flag is always false until phase-2 reintroduces the
          // engineer wallet path. Kept as a literal so TS narrows correctly.
          createWalletTransaction: false,
        }) && (
          <Box sx={{ mb: 3 }}>
            <PayerSourceSplitInput
              value={payer}
              onChange={setPayer}
              total={paymentAmount}
              siteId={selectedSite?.id}
              disabled={processing}
            />
          </Box>
        )}

        {/* Subcontract Linking */}
        {allowSubcontractLink && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" gutterBottom>
              Link to Subcontract
            </Typography>
            <SubcontractLinkSelector
              selectedSubcontractId={subcontractId}
              onSelect={setSubcontractId}
              paymentAmount={paymentAmount}
              disabled={processing}
            />
          </Box>
        )}

        {/* Proof Upload */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            Payment Proof (Optional)
          </Typography>
          <FileUploader
            supabase={supabase}
            bucketName="payment-proofs"
            folderPath={`${selectedSite?.id}/${dayjs().format("YYYY-MM")}`}
            fileNamePrefix="payment"
            accept="image"
            label=""
            helperText={
              paymentMode === "upi"
                ? "Upload UPI payment screenshot"
                : "Upload payment receipt"
            }
            uploadOnSelect
            onUpload={handleFileUpload}
            onRemove={handleFileRemove}
            compact
          />
        </Box>

        {/* Notes */}
        <Box sx={{ mb: 3 }}>
          <TextField
            fullWidth
            size="small"
            label="Notes (Optional)"
            placeholder="Add any notes about this payment..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            multiline
            rows={2}
          />
        </Box>

        {/* Paid By */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            p: 1.5,
            bgcolor: "action.hover",
            borderRadius: 1,
          }}
        >
          <Avatar
            src={userProfile?.avatar_url || undefined}
            sx={{ width: 32, height: 32 }}
          >
            {userProfile?.name?.[0]}
          </Avatar>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Paid By
            </Typography>
            <Typography variant="body2" fontWeight={500}>
              {userProfile?.name} (You)
            </Typography>
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, flexDirection: "column", alignItems: "stretch" }}>
        {!payerCheck.ok && payer.mode === "split" && (
          <Typography
            variant="caption"
            color="error.main"
            sx={{ display: "block", mb: 1, textAlign: "right" }}
          >
            {payerCheck.reason}
          </Typography>
        )}
        <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
          <Button onClick={onClose} disabled={processing}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => handleSubmit()}
            disabled={
              processing ||
              (isPartialPayment && partialAmount <= 0) ||
              !payerCheck.ok
            }
            startIcon={processing ? <CircularProgress size={20} /> : undefined}
          >
            {processing
              ? "Processing..."
              : `Confirm Settlement Rs.${paymentAmount.toLocaleString()}`}
          </Button>
        </Box>
      </DialogActions>

      {/* Soft confirm before saving with no subcontract link. Stacked dialog
          so the user can either go back and pick one (most cases) or proceed
          deliberately for the rare unlinked settlement. */}
      <Dialog
        open={showNoLinkConfirm}
        onClose={() => setShowNoLinkConfirm(false)}
        maxWidth="xs"
      >
        <DialogTitle>Settle without subcontract link?</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb: 1 }}>
            This settlement isn&apos;t linked to any subcontract. Most
            settlements should be tied to one — leaving it unlinked makes the
            payment harder to reconcile against subcontract balances later.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            If this is intentional (e.g. a one-off site expense), continue.
            Otherwise, go back and pick a subcontract.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 1.5 }}>
          <Button onClick={() => setShowNoLinkConfirm(false)}>
            Go back
          </Button>
          <Button
            color="warning"
            variant="contained"
            onClick={() => {
              setShowNoLinkConfirm(false);
              handleSubmit(true);
            }}
          >
            Yes, settle anyway
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
