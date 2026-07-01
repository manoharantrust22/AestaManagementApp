"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  RadioGroup,
  FormControlLabel,
  Radio,
  TextField,
  Divider,
  CircularProgress,
  Alert,
  Chip,
  IconButton,
  useTheme,
  useMediaQuery,
  Paper,
  alpha,
  FormControl,
  FormLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import {
  Close as CloseIcon,
  AccountBalanceWallet,
  CurrencyRupee,
  CalendarMonth,
  Business,
  Engineering,
} from "@mui/icons-material";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSite } from "@/contexts/SiteContext";
import FileUploader, { UploadedFile } from "@/components/common/FileUploader";
import dayjs from "dayjs";
import { processWeeklySettlement } from "@/lib/services/settlementService";
import type { PayerSource } from "@/types/settlement.types";
import type { PaymentMode as ServicePaymentMode, PaymentChannel } from "@/types/payment.types";

interface WeeklySummaryForSettlement {
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  totalLaborers: number;
  totalWorkDays: number;
  pendingDailySalary: number;
  pendingContractSalary: number;
  pendingMarketSalary: number;
  teaShopExpenses: number;
  totalPending: number;
  contractLaborerIds: string[];
}

interface WeeklySettlementDialogProps {
  open: boolean;
  onClose: () => void;
  weeklySummary: WeeklySummaryForSettlement | null;
  onSuccess?: () => void;
}

type PaymentMode = "upi" | "cash" | "bank";
type PayerType = "company" | "site_engineer";
type SettlementType = "daily" | "contract" | "market" | "all";

export default function WeeklySettlementDialog({
  open,
  onClose,
  weeklySummary,
  onSuccess,
}: WeeklySettlementDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { userProfile } = useAuth();
  const { selectedSite } = useSite();
  const [supabase] = useState(() => createClient());

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Settlement type selection
  const [settlementType, setSettlementType] = useState<SettlementType>("all");

  // Form state
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash");
  const [payerType, setPayerType] = useState<PayerType>("site_engineer");
  const [proofFile, setProofFile] = useState<UploadedFile | null>(null);
  const [notes, setNotes] = useState("");

  // Reset when dialog opens
  useEffect(() => {
    if (open && weeklySummary) {
      setSettlementType("all");
      setPaymentMode("cash");
      setPayerType("site_engineer");
      setProofFile(null);
      setNotes("");
      setError(null);
    }
  }, [open, weeklySummary]);

  // Calculate selected amount based on settlement type
  const getSelectedAmount = () => {
    if (!weeklySummary) return 0;
    switch (settlementType) {
      case "daily":
        return weeklySummary.pendingDailySalary;
      case "contract":
        return weeklySummary.pendingContractSalary;
      case "market":
        return weeklySummary.pendingMarketSalary;
      case "all":
      default:
        return weeklySummary.totalPending;
    }
  };

  const selectedAmount = getSelectedAmount();

  const handleSubmit = async () => {
    if (!weeklySummary || !userProfile || !selectedSite) return;

    if (selectedAmount === 0) {
      setError("No pending amount to settle");
      return;
    }

    if ((paymentMode === "upi" || paymentMode === "bank") && !proofFile) {
      setError("Please upload payment screenshot for UPI/Bank payment");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Map payment mode to service format
      const servicePaymentMode: ServicePaymentMode =
        paymentMode === "bank" ? "net_banking" : paymentMode;

      // Map payer type to payer source
      const payerSource: PayerSource =
        payerType === "company" ? "client_money" : "own_money";

      // Use processWeeklySettlement to properly create settlement_group
      const result = await processWeeklySettlement(supabase, {
        siteId: selectedSite.id,
        dateFrom: weeklySummary.weekStart,
        dateTo: weeklySummary.weekEnd,
        settlementType: settlementType,
        totalAmount: selectedAmount,
        paymentMode: servicePaymentMode,
        paymentChannel: "direct" as PaymentChannel,
        payerSource: payerSource,
        proofUrl: proofFile?.url,
        notes: notes || undefined,
        userId: userProfile.id,
        userName: userProfile.name || userProfile.email || "Unknown",
      });

      if (!result.success) {
        throw new Error(result.error || "Settlement failed");
      }

      onSuccess?.();
      handleClose();
    } catch (err) {
      console.error("Weekly settlement error:", err);
      setError(err instanceof Error ? err.message : "Failed to record settlement");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setSettlementType("all");
    setPaymentMode("cash");
    setPayerType("site_engineer");
    setProofFile(null);
    setNotes("");
    setError(null);
    onClose();
  };

  if (!weeklySummary) return null;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      fullScreen={isMobile}
      PaperProps={{
        sx: {
          borderRadius: isMobile ? 0 : 2,
        },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          pb: 1,
          bgcolor: "primary.main",
          color: "white",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <CalendarMonth />
          <Box>
            <Typography variant="h6" component="span" fontWeight={600}>
              Weekly Settlement
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.9 }}>
              {weeklySummary.weekLabel}
            </Typography>
          </Box>
        </Box>
        <IconButton onClick={handleClose} size="small" sx={{ color: "white" }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 2 }}>
        {/* Summary Card */}
        <Paper
          elevation={0}
          sx={{
            p: 2,
            mb: 2,
            bgcolor: alpha(theme.palette.primary.main, 0.08),
            borderRadius: 2,
            border: `1px solid ${alpha(theme.palette.primary.main, 0.2)}`,
          }}
        >
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Week Summary
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 1 }}>
            <Chip
              size="small"
              label={`${weeklySummary.totalWorkDays} days`}
              variant="outlined"
            />
            <Chip
              size="small"
              label={`${weeklySummary.totalLaborers} laborers`}
              variant="outlined"
            />
          </Box>
        </Paper>

        {/* Amount Breakdown */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" fontWeight={600} gutterBottom>
            Pending Amounts
          </Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: "action.hover" }}>
                  <TableCell>Type</TableCell>
                  <TableCell align="right">Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow
                  selected={settlementType === "daily"}
                  onClick={() => setSettlementType("daily")}
                  sx={{ cursor: "pointer" }}
                >
                  <TableCell>Daily Laborers</TableCell>
                  <TableCell align="right">
                    <Chip
                      size="small"
                      label={`₹${weeklySummary.pendingDailySalary.toLocaleString()}`}
                      color={weeklySummary.pendingDailySalary > 0 ? "info" : "default"}
                      variant={settlementType === "daily" ? "filled" : "outlined"}
                    />
                  </TableCell>
                </TableRow>
                <TableRow
                  selected={settlementType === "contract"}
                  onClick={() => setSettlementType("contract")}
                  sx={{ cursor: "pointer" }}
                >
                  <TableCell>Company Laborers</TableCell>
                  <TableCell align="right">
                    <Chip
                      size="small"
                      label={`₹${weeklySummary.pendingContractSalary.toLocaleString()}`}
                      color={weeklySummary.pendingContractSalary > 0 ? "secondary" : "default"}
                      variant={settlementType === "contract" ? "filled" : "outlined"}
                    />
                  </TableCell>
                </TableRow>
                <TableRow
                  selected={settlementType === "market"}
                  onClick={() => setSettlementType("market")}
                  sx={{ cursor: "pointer" }}
                >
                  <TableCell>Market Laborers</TableCell>
                  <TableCell align="right">
                    <Chip
                      size="small"
                      label={`₹${weeklySummary.pendingMarketSalary.toLocaleString()}`}
                      color={weeklySummary.pendingMarketSalary > 0 ? "warning" : "default"}
                      variant={settlementType === "market" ? "filled" : "outlined"}
                    />
                  </TableCell>
                </TableRow>
                <TableRow
                  selected={settlementType === "all"}
                  onClick={() => setSettlementType("all")}
                  sx={{ cursor: "pointer", bgcolor: "action.hover" }}
                >
                  <TableCell sx={{ fontWeight: 700 }}>Total</TableCell>
                  <TableCell align="right">
                    <Chip
                      size="small"
                      label={`₹${weeklySummary.totalPending.toLocaleString()}`}
                      color={weeklySummary.totalPending > 0 ? "success" : "default"}
                      variant={settlementType === "all" ? "filled" : "outlined"}
                    />
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
            Click a row to settle only that type
          </Typography>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Payer Type */}
        <FormControl component="fieldset" sx={{ mb: 2, width: "100%" }}>
          <FormLabel component="legend">
            <Typography variant="subtitle2" fontWeight={600}>
              Paid By
            </Typography>
          </FormLabel>
          <RadioGroup
            row
            value={payerType}
            onChange={(e) => setPayerType(e.target.value as PayerType)}
          >
            <FormControlLabel
              value="site_engineer"
              control={<Radio size="small" />}
              label={
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <Engineering sx={{ fontSize: 18, color: "primary.main" }} />
                  <Typography variant="body2">Site Engineer</Typography>
                </Box>
              }
            />
            <FormControlLabel
              value="company"
              control={<Radio size="small" />}
              label={
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <Business sx={{ fontSize: 18, color: "info.main" }} />
                  <Typography variant="body2">Company Direct</Typography>
                </Box>
              }
            />
          </RadioGroup>
        </FormControl>

        {/* Payment Mode */}
        <FormControl component="fieldset" sx={{ mb: 2, width: "100%" }}>
          <FormLabel component="legend">
            <Typography variant="subtitle2" fontWeight={600}>
              Payment Mode
            </Typography>
          </FormLabel>
          <RadioGroup
            row
            value={paymentMode}
            onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
          >
            <FormControlLabel
              value="cash"
              control={<Radio size="small" />}
              label="Cash"
            />
            <FormControlLabel
              value="upi"
              control={<Radio size="small" />}
              label="UPI"
            />
            <FormControlLabel
              value="bank"
              control={<Radio size="small" />}
              label="Bank Transfer"
            />
          </RadioGroup>
        </FormControl>

        {/* Conditional Fields */}
        {(paymentMode === "upi" || paymentMode === "bank") && (
          <Box sx={{ mb: 2 }}>
            <FileUploader
              supabase={supabase}
              bucketName="settlement-proofs"
              folderPath={`weekly-settlements/${selectedSite?.id}/${weeklySummary.weekStart}`}
              fileNamePrefix="proof"
              accept="image"
              maxSizeMB={10}
              label={paymentMode === "upi" ? "Payment Screenshot *" : "Transfer Proof *"}
              helperText={`Upload screenshot of ${paymentMode === "upi" ? "UPI" : "bank"} transfer`}
              value={proofFile}
              onUpload={(file) => setProofFile(file)}
              onRemove={() => setProofFile(null)}
              compact
            />
          </Box>
        )}

        <TextField
          fullWidth
          multiline
          rows={2}
          label="Notes (Optional)"
          placeholder="Any additional notes about this settlement..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          size="small"
        />

        {error && (
          <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
      </DialogContent>

      <Divider />

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={handleClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="primary"
          onClick={handleSubmit}
          disabled={
            submitting ||
            selectedAmount === 0 ||
            ((paymentMode === "upi" || paymentMode === "bank") && !proofFile)
          }
          startIcon={submitting ? <CircularProgress size={16} /> : <CurrencyRupee />}
        >
          {submitting
            ? "Processing..."
            : `Settle ${settlementType === "all" ? "All" : settlementType.charAt(0).toUpperCase() + settlementType.slice(1)} (₹${selectedAmount.toLocaleString()})`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
