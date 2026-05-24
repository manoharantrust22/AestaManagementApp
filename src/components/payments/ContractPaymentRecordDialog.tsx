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
  Chip,
  Avatar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import {
  Payment as PaymentIcon,
  Info as InfoIcon,
  CalendarMonth as CalendarIcon,
} from "@mui/icons-material";
import { createClient } from "@/lib/supabase/client";
import { ensureFreshSession } from "@/lib/auth/sessionManager";
import { useAuth } from "@/contexts/AuthContext";
import { useSite } from "@/contexts/SiteContext";
import { processWaterfallContractPayment } from "@/lib/services/settlementService";
import { withTimeout, TIMEOUTS } from "@/lib/utils/timeout";
import FileUploader, { UploadedFile } from "@/components/common/FileUploader";
import SubcontractLinkSelector from "./SubcontractLinkSelector";
import PayerSourceSplitInput from "@/components/settlement/PayerSourceSplitInput";
import { validatePayerSourceInput } from "@/lib/settlement/payerSource";
import { isSiteEngineerPayingFromWallet } from "@/components/expenses/walletPayerLock";
import { useToast } from "@/contexts/ToastContext";
import dayjs from "dayjs";
import type {
  PaymentMode,
  PaymentChannel,
  ContractPaymentType,
} from "@/types/payment.types";
import type { PayerSourceInput } from "@/types/settlement.types";

// Week laborer data for display in dialog
interface WeekLaborerData {
  laborerId: string;
  laborerName: string;
  laborerRole: string | null;
  teamId: string | null;
  teamName: string | null;
  subcontractId: string | null;
  subcontractTitle: string | null;
  daysWorked: number;
  earned: number;
  paid: number;
  balance: number;
  progress: number;
}

// Week row data passed from parent
export interface WeekRowData {
  id: string;
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  laborerCount: number;
  totalSalary: number;
  totalPaid: number;
  totalDue: number;
  paymentProgress: number;
  status: string;
  laborers: WeekLaborerData[];
  settlementReferences: string[];
}

interface ContractPaymentRecordDialogProps {
  open: boolean;
  onClose: () => void;
  weeks: WeekRowData[];
  onSuccess?: () => void;
}

// Allocation preview for a single week
interface WeekAllocationPreview {
  weekLabel: string;
  weekStart: string;
  weekEnd: string;
  weekDue: number;
  allocated: number;
  isFullyPaid: boolean;
  laborerCount: number;
}

export default function ContractPaymentRecordDialog({
  open,
  onClose,
  weeks,
  onSuccess,
}: ContractPaymentRecordDialogProps) {
  const { userProfile } = useAuth();
  const { selectedSite } = useSite();
  const supabase = createClient();
  const { showSuccess, showError: showErrorToast } = useToast();

  // Form state
  const [amount, setAmount] = useState<number>(0);
  const [amountInput, setAmountInput] = useState<string>(""); // String state for input to prevent browser number issues
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("upi");
  // Phase-2 cleanup: Via-Engineer channel removed; admin payments are always
  // "direct". Kept as a const so downstream readers continue to compile.
  const paymentChannel: PaymentChannel = "direct";
  const [paymentType, setPaymentType] = useState<ContractPaymentType>("salary");
  const [actualPaymentDate, setActualPaymentDate] = useState<dayjs.Dayjs>(dayjs());

  // Payer source (split-aware) — replaces single PayerSource + customPayerName.
  const [payer, setPayer] = useState<PayerSourceInput>({
    mode: "single",
    source: "own_money",
  });

  const [subcontractId, setSubcontractId] = useState<string | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState<string>("");

  // Data state
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get weeks with outstanding balance, sorted oldest first
  const weeksWithBalance = useMemo(
    () => weeks
      .filter((w) => w.totalDue > 0)
      .sort((a, b) => new Date(a.weekStart).getTime() - new Date(b.weekStart).getTime()),
    [weeks]
  );

  // Calculate total outstanding across all weeks
  const totalOutstanding = useMemo(
    () => weeksWithBalance.reduce((sum, w) => sum + w.totalDue, 0),
    [weeksWithBalance]
  );

  // Calculate waterfall allocation preview
  const allocationPreview = useMemo(() => {
    if (amount <= 0 || weeksWithBalance.length === 0) return [];

    const preview: WeekAllocationPreview[] = [];
    let remaining = amount;

    for (const week of weeksWithBalance) {
      if (remaining <= 0) break;

      const allocatedToWeek = Math.min(remaining, week.totalDue);

      preview.push({
        weekLabel: week.weekLabel,
        weekStart: week.weekStart,
        weekEnd: week.weekEnd,
        weekDue: week.totalDue,
        allocated: allocatedToWeek,
        isFullyPaid: allocatedToWeek >= week.totalDue,
        laborerCount: week.laborers.filter(l => l.balance > 0).length,
      });

      remaining -= allocatedToWeek;
    }

    return preview;
  }, [amount, weeksWithBalance]);

  // Check if payment exceeds total outstanding
  const hasExcessPayment = amount > totalOutstanding;

  // Reset form on close
  useEffect(() => {
    if (!open) {
      setAmount(0);
      setAmountInput("");
      setPaymentMode("upi");
      setPaymentType("salary");
      setActualPaymentDate(dayjs());
      setPayer({ mode: "single", source: "own_money" });
      setSubcontractId(null);
      setProofUrl(null);
      setNotes("");
      setError(null);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!selectedSite || !userProfile || amount <= 0) {
      setError("Please enter a valid payment amount");
      return;
    }

    // Validate payer-source input (single OR split) before any side-effects.
    const payerCheck = validatePayerSourceInput(payer, amount);
    if (!payerCheck.ok) {
      setError(payerCheck.reason);
      return;
    }

    // Note: We allow salary payments even when no outstanding balance (excess/overpayment)
    // The excess will be tracked in settlement_groups and shown as "Excess Paid"

    setProcessing(true);
    setError(null);

    try {
      // Ensure session is fresh before database operations
      try {
        await ensureFreshSession();
      } catch (sessionErr) {
        console.warn("[ContractPaymentRecordDialog] Session check failed:", sessionErr);
        setError("Your session has expired. Please refresh the page and try again.");
        setProcessing(false);
        return;
      }

      // Build the weeks data with laborers for the service
      // For advance payments, we pass empty weeks array (no waterfall allocation)
      const weeksToProcess =
        paymentType === "advance" || paymentType === "other"
          ? []
          : allocationPreview.map((preview) => {
              const week = weeksWithBalance.find((w) => w.weekStart === preview.weekStart)!;
              return {
                weekStart: week.weekStart,
                weekEnd: week.weekEnd,
                weekLabel: week.weekLabel,
                allocatedAmount: preview.allocated,
                laborers: week.laborers
                  .filter((l) => l.balance > 0)
                  .map((l) => ({
                    laborerId: l.laborerId,
                    laborerName: l.laborerName,
                    balance: l.balance,
                    subcontractId: l.subcontractId,
                  })),
              };
            });

      const result = await withTimeout(
        processWaterfallContractPayment(supabase, {
          siteId: selectedSite.id,
          weeks: weeksToProcess,
          totalAmount: amount,
          paymentType: paymentType,
          actualPaymentDate: actualPaymentDate.format("YYYY-MM-DD"),
          paymentMode: paymentMode,
          paymentChannel: paymentChannel,
          payer,
          proofUrl: proofUrl || undefined,
          notes: notes || undefined,
          subcontractId: subcontractId || undefined,
          userId: userProfile.id,
          userName: userProfile.name || "Unknown",
        }),
        TIMEOUTS.SETTLEMENT,
        "Payment processing timed out. Please check your connection and try again."
      );

      if (!result.success) {
        throw new Error(result.error || "Failed to process payment");
      }

      showSuccess(`Payment of Rs.${amount.toLocaleString()} recorded successfully`);
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

  const handleFileUpload = useCallback((file: UploadedFile) => {
    setProofUrl(file.url);
  }, []);

  const handleFileRemove = useCallback(() => {
    setProofUrl(null);
  }, []);

  const canSubmit =
    amount > 0 && validatePayerSourceInput(payer, amount).ok;

  // Format currency
  const formatCurrency = (amt: number) => {
    if (amt >= 100000) {
      return `Rs.${(amt / 100000).toFixed(1)}L`;
    }
    return `Rs.${amt.toLocaleString()}`;
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Box>
            <Typography variant="h6" component="span">Record Payment</Typography>
            <Typography variant="body2" color="text.secondary">
              Auto-allocates to oldest week first (waterfall)
            </Typography>
          </Box>
          <CalendarIcon color="primary" />
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Outstanding Summary */}
        {totalOutstanding > 0 ? (
          <Box sx={{ mb: 3, p: 2, bgcolor: "warning.50", borderRadius: 1, border: 1, borderColor: "warning.main" }}>
            <Typography variant="subtitle2" color="warning.dark" gutterBottom>
              Outstanding Balance Summary
            </Typography>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Box>
                <Typography variant="h5" fontWeight={600} color="error.main">
                  {formatCurrency(totalOutstanding)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  across {weeksWithBalance.length} week{weeksWithBalance.length !== 1 ? "s" : ""}
                </Typography>
              </Box>
              {weeksWithBalance.length > 0 && (
                <Box sx={{ textAlign: "right" }}>
                  <Typography variant="body2" color="text.secondary">
                    Oldest: {weeksWithBalance[0].weekLabel}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Due: {formatCurrency(weeksWithBalance[0].totalDue)}
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        ) : (
          <Alert severity="success" sx={{ mb: 3 }}>
            <Typography variant="body2" fontWeight={500}>
              All salary dues are settled!
            </Typography>
            <Typography variant="caption">
              Any payment recorded here will be saved as excess/prepayment. You can use &ldquo;Salary&rdquo; type for future salary prepayment or &ldquo;Advance&rdquo; for tracked advances.
            </Typography>
          </Alert>
        )}

        {/* Payment Amount */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            Payment Amount
          </Typography>
          <TextField
            type="text"
            inputMode="numeric"
            size="small"
            fullWidth
            value={amountInput}
            onChange={(e) => {
              const value = e.target.value;
              // Only allow digits and optional decimal point
              if (value === "" || /^\d*\.?\d*$/.test(value)) {
                setAmountInput(value);
                const numValue = parseFloat(value) || 0;
                setAmount(numValue);
              }
            }}
            InputProps={{
              startAdornment: (
                <Typography variant="body2" sx={{ mr: 0.5, color: "text.secondary" }}>
                  Rs.
                </Typography>
              ),
            }}
            helperText={`Total outstanding: ${formatCurrency(totalOutstanding)}`}
          />
          {hasExcessPayment && paymentType === "salary" && (
            <Alert severity="info" sx={{ mt: 1 }}>
              <Typography variant="body2" fontWeight={500}>
                {totalOutstanding === 0
                  ? `Excess Payment: ${formatCurrency(amount)}`
                  : `Overpayment: ${formatCurrency(amount - totalOutstanding)} excess`}
              </Typography>
              <Typography variant="caption">
                {totalOutstanding === 0
                  ? "This entire amount will be recorded as excess payment. It will show as \"Excess Paid\" in the dashboard until future salary is earned."
                  : "Excess amount will automatically carry forward to future weeks via waterfall allocation. The balance will show as \"Excess Paid\" until future salary is earned."}
              </Typography>
            </Alert>
          )}
        </Box>

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
              <MenuItem value="salary">Salary (Auto-allocate oldest week first)</MenuItem>
              <MenuItem value="advance">Advance (Tracked separately)</MenuItem>
              <MenuItem value="other">Other</MenuItem>
            </Select>
          </FormControl>
          {paymentType === "advance" && (
            <Alert severity="warning" sx={{ mt: 1.5 }} icon={<InfoIcon fontSize="small" />}>
              <Typography variant="body2" fontWeight={500}>
                Advance Payment
              </Typography>
              <Typography variant="caption">
                Advances are tracked separately from salary settlements. They do NOT reduce the weekly
                due amounts and are NOT included in the waterfall allocation. Use this for upfront
                payments that will be adjusted against future earnings.
              </Typography>
            </Alert>
          )}
          {paymentType === "other" && (
            <Alert severity="info" sx={{ mt: 1.5 }}>
              <Typography variant="caption">
                &ldquo;Other&rdquo; payments are recorded but not allocated to specific weeks.
                Use for miscellaneous payments like bonuses or adjustments.
              </Typography>
            </Alert>
          )}
        </Box>

        {/* Waterfall Allocation Preview */}
        {paymentType === "salary" && allocationPreview.length > 0 && (
          <Alert severity="info" sx={{ mb: 3 }} icon={<InfoIcon fontSize="small" />}>
            <Typography variant="body2" fontWeight={500} gutterBottom>
              Payment will be allocated oldest-to-newest:
            </Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ mt: 1 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Week</TableCell>
                    <TableCell align="right">Due</TableCell>
                    <TableCell align="right">Allocated</TableCell>
                    <TableCell align="center">Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {allocationPreview.map((item, index) => (
                    <TableRow key={item.weekStart}>
                      <TableCell>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <Typography variant="body2">{item.weekLabel}</Typography>
                          {index === 0 && (
                            <Chip label="Oldest" size="small" color="warning" variant="outlined" />
                          )}
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                          {item.laborerCount} laborer{item.laborerCount !== 1 ? "s" : ""}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">{formatCurrency(item.weekDue)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>
                        {formatCurrency(item.allocated)}
                      </TableCell>
                      <TableCell align="center">
                        {item.isFullyPaid ? (
                          <Chip label="Fully Cleared" size="small" color="success" variant="outlined" />
                        ) : (
                          <Chip label="Partial" size="small" color="warning" variant="outlined" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {allocationPreview.length < weeksWithBalance.length && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                {weeksWithBalance.length - allocationPreview.length} more week(s) will remain unpaid
              </Typography>
            )}
          </Alert>
        )}

        {/* Payment Date */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            Payment Date
          </Typography>
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <DatePicker
              value={actualPaymentDate}
              onChange={(newValue) => newValue && setActualPaymentDate(newValue)}
              slotProps={{
                textField: { size: "small", fullWidth: true },
              }}
              maxDate={dayjs()}
            />
          </LocalizationProvider>
        </Box>

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
            <FormControlLabel value="upi" control={<Radio size="small" />} label="UPI" />
            <FormControlLabel value="cash" control={<Radio size="small" />} label="Cash" />
            <FormControlLabel value="net_banking" control={<Radio size="small" />} label="Net Banking" />
            <FormControlLabel value="other" control={<Radio size="small" />} label="Other" />
          </RadioGroup>
        </Box>

        {/* Money Source — hidden for site engineers paying from wallet
            (source is derived from deposits). Phase-2 cleanup: Via-Engineer
            channel removed; admin payments are always direct, so the
            createWalletTransaction signal is hardcoded false. */}
        {!isSiteEngineerPayingFromWallet({
          userRole: userProfile?.role,
          payerType: "site_engineer",
          createWalletTransaction: false,
        }) && (
          <Box sx={{ mb: 3 }}>
            <PayerSourceSplitInput
              value={payer}
              onChange={setPayer}
              total={amount}
              siteId={selectedSite?.id}
              disabled={processing}
            />
            {payer.mode === "split" && (() => {
              const check = validatePayerSourceInput(payer, amount);
              return check.ok ? null : (
                <Typography
                  variant="caption"
                  color="error.main"
                  sx={{ display: "block", mt: 0.5 }}
                >
                  {check.reason}
                </Typography>
              );
            })()}
          </Box>
        )}

        {/* Subcontract Link */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            Link to Subcontract
          </Typography>
          <SubcontractLinkSelector
            key={open ? "open" : "closed"}
            selectedSubcontractId={subcontractId}
            onSelect={setSubcontractId}
            paymentAmount={amount}
            disabled={processing}
          />
        </Box>

        {/* Proof Upload */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            Payment Proof (Optional)
          </Typography>
          <FileUploader
            supabase={supabase}
            bucketName="payment-proofs"
            folderPath={`${selectedSite?.id}/${dayjs().format("YYYY-MM")}`}
            fileNamePrefix="contract-payment"
            accept="image"
            label=""
            helperText="Upload payment screenshot or receipt"
            uploadOnSelect
            onUpload={handleFileUpload}
            onRemove={handleFileRemove}
            compact
          />
        </Box>

        {/* Notes */}
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

        {/* Paid By Info */}
        {userProfile && (
          <Box sx={{ mt: 2, display: "flex", alignItems: "center", gap: 1 }}>
            <Avatar src={userProfile.avatar_url || undefined} sx={{ width: 24, height: 24 }}>
              {userProfile.name?.[0]}
            </Avatar>
            <Typography variant="caption" color="text.secondary">
              Paid By: {userProfile.name}
            </Typography>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={processing}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!canSubmit || processing}
          startIcon={processing ? <CircularProgress size={18} /> : <PaymentIcon />}
        >
          {processing ? "Processing..." : `Record ${formatCurrency(amount)}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
