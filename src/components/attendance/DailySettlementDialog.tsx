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
  Checkbox,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  IconButton,
  useTheme,
  useMediaQuery,
  Paper,
  alpha,
  FormControl,
  FormLabel,
} from "@mui/material";
import {
  Close as CloseIcon,
  AccountBalanceWallet,
  CurrencyRupee,
  Person,
  CalendarToday,
  Business,
  Engineering,
} from "@mui/icons-material";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSite } from "@/contexts/SiteContext";
import FileUploader, { UploadedFile } from "@/components/common/FileUploader";
import dayjs from "dayjs";
import { processSettlement } from "@/lib/services/settlementService";
import type { SettlementRecord, PayerSource } from "@/types/settlement.types";
import type { PaymentMode as ServicePaymentMode, PaymentChannel } from "@/types/payment.types";

interface LaborerRecord {
  id: string;
  laborer_id: string;
  laborer_name: string;
  laborer_type: string;
  daily_earnings: number;
  is_paid: boolean;
}

interface MarketLaborerRecord {
  id: string;
  originalDbId: string;
  roleName: string;
  dailyEarnings: number;
  isPaid: boolean;
}

interface DateSummaryForSettlement {
  date: string;
  records: LaborerRecord[];
  marketLaborers: MarketLaborerRecord[];
  pendingCount: number;
  pendingAmount: number;
}

interface DailySettlementDialogProps {
  open: boolean;
  onClose: () => void;
  dateSummary: DateSummaryForSettlement | null;
  onSuccess?: () => void;
}

type PaymentMode = "upi" | "cash" | "bank";
type PayerType = "company" | "site_engineer";

export default function DailySettlementDialog({
  open,
  onClose,
  dateSummary,
  onSuccess,
}: DailySettlementDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { userProfile } = useAuth();
  const { selectedSite } = useSite();
  const [supabase] = useState(() => createClient());

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selection state
  const [selectedLaborers, setSelectedLaborers] = useState<Set<string>>(new Set());
  const [selectedMarket, setSelectedMarket] = useState<Set<string>>(new Set());

  // Form state
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash");
  const [payerType, setPayerType] = useState<PayerType>("site_engineer");
  const [proofFile, setProofFile] = useState<UploadedFile | null>(null);
  const [notes, setNotes] = useState("");

  // Reset selection when dialog opens
  useEffect(() => {
    if (open && dateSummary) {
      // Pre-select all pending laborers
      const pendingLaborers = dateSummary.records
        .filter((r) => !r.is_paid && r.laborer_type !== "contract")
        .map((r) => r.id);
      const pendingMarket = dateSummary.marketLaborers
        .filter((m) => !m.isPaid)
        .map((m) => m.id);
      setSelectedLaborers(new Set(pendingLaborers));
      setSelectedMarket(new Set(pendingMarket));
      setPaymentMode("cash");
      setPayerType("site_engineer");
      setProofFile(null);
      setNotes("");
      setError(null);
    }
  }, [open, dateSummary]);

  // Get pending items
  const pendingLaborers = dateSummary?.records.filter(
    (r) => !r.is_paid && r.laborer_type !== "contract"
  ) || [];
  const pendingMarket = dateSummary?.marketLaborers.filter((m) => !m.isPaid) || [];

  // Calculate selected amount
  const selectedLaborerAmount = pendingLaborers
    .filter((r) => selectedLaborers.has(r.id))
    .reduce((sum, r) => sum + r.daily_earnings, 0);
  const selectedMarketAmount = pendingMarket
    .filter((m) => selectedMarket.has(m.id))
    .reduce((sum, m) => sum + m.dailyEarnings, 0);
  const totalSelectedAmount = selectedLaborerAmount + selectedMarketAmount;
  const totalSelectedCount = selectedLaborers.size + selectedMarket.size;

  const handleToggleLaborer = (id: string) => {
    setSelectedLaborers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleToggleMarket = (id: string) => {
    setSelectedMarket((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (totalSelectedCount === pendingLaborers.length + pendingMarket.length) {
      // Deselect all
      setSelectedLaborers(new Set());
      setSelectedMarket(new Set());
    } else {
      // Select all
      setSelectedLaborers(new Set(pendingLaborers.map((r) => r.id)));
      setSelectedMarket(new Set(pendingMarket.map((m) => m.id)));
    }
  };

  const handleSubmit = async () => {
    if (!dateSummary || !userProfile || !selectedSite) return;

    if (totalSelectedCount === 0) {
      setError("Please select at least one laborer to settle");
      return;
    }

    if (paymentMode === "upi" && !proofFile) {
      setError("Please upload payment screenshot for UPI payment");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Build SettlementRecord array from selected laborers
      const settlementRecords: SettlementRecord[] = [];

      // Add selected daily laborers
      for (const laborerId of selectedLaborers) {
        const laborer = pendingLaborers.find((l) => l.id === laborerId);
        if (laborer) {
          settlementRecords.push({
            id: `daily-${laborer.id}`,
            sourceType: "daily",
            sourceId: laborer.id,
            laborerName: laborer.laborer_name,
            laborerType: laborer.laborer_type === "daily_wage" ? "daily" : "daily",
            amount: laborer.daily_earnings,
            date: dateSummary.date,
            isPaid: false,
          });
        }
      }

      // Add selected market laborers
      for (const marketId of selectedMarket) {
        const market = pendingMarket.find((m) => m.id === marketId);
        if (market) {
          settlementRecords.push({
            id: `market-${market.originalDbId}`,
            sourceType: "market",
            sourceId: market.originalDbId,
            laborerName: market.roleName,
            laborerType: "market",
            amount: market.dailyEarnings,
            date: dateSummary.date,
            isPaid: false,
            role: market.roleName,
          });
        }
      }

      // Map payment mode to service format
      const servicePaymentMode: ServicePaymentMode =
        paymentMode === "bank" ? "net_banking" : paymentMode;

      // Map payer type to payer source
      const payerSource: PayerSource =
        payerType === "company" ? "client_money" : "own_money";

      // Use processSettlement to properly create settlement_group and update records
      const result = await processSettlement(supabase, {
        siteId: selectedSite.id,
        records: settlementRecords,
        totalAmount: totalSelectedAmount,
        paymentMode: servicePaymentMode,
        paymentChannel: "direct" as PaymentChannel,
        payer: { mode: "single", source: payerSource },
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
      console.error("Settlement error:", err);
      setError(err instanceof Error ? err.message : "Failed to record settlement");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setSelectedLaborers(new Set());
    setSelectedMarket(new Set());
    setPaymentMode("cash");
    setPayerType("site_engineer");
    setProofFile(null);
    setNotes("");
    setError(null);
    onClose();
  };

  if (!dateSummary) return null;

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
          bgcolor: "success.main",
          color: "white",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <AccountBalanceWallet />
          <Box>
            <Typography variant="h6" component="span" fontWeight={600}>
              Daily Settlement
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.9 }}>
              {dayjs(dateSummary.date).format("dddd, DD MMMM YYYY")}
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
            bgcolor: alpha(theme.palette.success.main, 0.08),
            borderRadius: 2,
            border: `1px solid ${alpha(theme.palette.success.main, 0.2)}`,
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Box>
              <Typography variant="body2" color="text.secondary">
                Selected Amount
              </Typography>
              <Typography variant="h5" fontWeight={700} color="success.main">
                ₹{totalSelectedAmount.toLocaleString("en-IN")}
              </Typography>
            </Box>
            <Chip
              icon={<Person sx={{ fontSize: 16 }} />}
              label={`${totalSelectedCount} laborers`}
              color="success"
              variant="outlined"
            />
          </Box>
        </Paper>

        {/* Laborers Selection */}
        <Box sx={{ mb: 2 }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              mb: 1,
            }}
          >
            <Typography variant="subtitle2" fontWeight={600}>
              Select Laborers to Pay
            </Typography>
            <Button size="small" onClick={handleSelectAll}>
              {totalSelectedCount === pendingLaborers.length + pendingMarket.length
                ? "Deselect All"
                : "Select All"}
            </Button>
          </Box>
          <Paper variant="outlined" sx={{ maxHeight: 200, overflow: "auto" }}>
            <List dense disablePadding>
              {pendingLaborers.map((laborer) => (
                <ListItem
                  key={laborer.id}
                  sx={{ borderBottom: "1px solid", borderColor: "divider" }}
                  secondaryAction={
                    <Chip
                      size="small"
                      label={`₹${laborer.daily_earnings.toLocaleString("en-IN")}`}
                      variant="outlined"
                      color={selectedLaborers.has(laborer.id) ? "success" : "default"}
                    />
                  }
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <Checkbox
                      checked={selectedLaborers.has(laborer.id)}
                      onChange={() => handleToggleLaborer(laborer.id)}
                      size="small"
                    />
                  </ListItemIcon>
                  <ListItemText
                    primary={laborer.laborer_name}
                    secondary={laborer.laborer_type === "daily_wage" ? "Daily" : "Market"}
                  />
                </ListItem>
              ))}
              {pendingMarket.map((market) => (
                <ListItem
                  key={market.id}
                  sx={{
                    borderBottom: "1px solid",
                    borderColor: "divider",
                    bgcolor: "action.hover",
                  }}
                  secondaryAction={
                    <Chip
                      size="small"
                      label={`₹${market.dailyEarnings.toLocaleString("en-IN")}`}
                      variant="outlined"
                      color={selectedMarket.has(market.id) ? "secondary" : "default"}
                    />
                  }
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <Checkbox
                      checked={selectedMarket.has(market.id)}
                      onChange={() => handleToggleMarket(market.id)}
                      size="small"
                      color="secondary"
                    />
                  </ListItemIcon>
                  <ListItemText primary={market.roleName} secondary="Market Laborer" />
                </ListItem>
              ))}
              {pendingLaborers.length === 0 && pendingMarket.length === 0 && (
                <ListItem>
                  <ListItemText
                    primary="No pending laborers"
                    secondary="All laborers have been paid for this date"
                  />
                </ListItem>
              )}
            </List>
          </Paper>
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
        {paymentMode === "upi" || paymentMode === "bank" ? (
          <Box sx={{ mb: 2 }}>
            <FileUploader
              supabase={supabase}
              bucketName="settlement-proofs"
              folderPath={`daily-settlements/${selectedSite?.id}/${dateSummary.date}`}
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
        ) : null}

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
          color="success"
          onClick={handleSubmit}
          disabled={
            submitting ||
            totalSelectedCount === 0 ||
            ((paymentMode === "upi" || paymentMode === "bank") && !proofFile)
          }
          startIcon={submitting ? <CircularProgress size={16} /> : <CurrencyRupee />}
        >
          {submitting ? "Processing..." : `Pay ₹${totalSelectedAmount.toLocaleString("en-IN")}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
