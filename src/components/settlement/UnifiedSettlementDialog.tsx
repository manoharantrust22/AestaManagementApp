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
  TextField,
  Alert,
  CircularProgress,
  Divider,
  Chip,
  Paper,
  alpha,
  useTheme,
  useMediaQuery,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Slide,
} from "@mui/material";
import { TransitionProps } from "@mui/material/transitions";
import {
  Payment as PaymentIcon,
  Close as CloseIcon,
  CalendarMonth,
  CalendarToday,
  Person,
  Groups,
} from "@mui/icons-material";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSite } from "@/contexts/SiteContext";
import FileUploader, { UploadedFile } from "@/components/common/FileUploader";
import SubcontractLinkSelector from "@/components/payments/SubcontractLinkSelector";
import PayerSourceSplitInput from "./PayerSourceSplitInput";
import { isSiteEngineerPayingFromWallet } from "@/components/expenses/walletPayerLock";
import { validatePayerSourceInput } from "@/lib/settlement/payerSource";
import dayjs from "dayjs";
import type {
  UnifiedSettlementConfig,
  SettlementRecord,
  PayerSourceInput,
  SettlementTypeSelection,
} from "@/types/settlement.types";
import type { PaymentMode, PaymentChannel } from "@/types/payment.types";
import {
  processSettlement,
  type SettlementConfig,
  type SettlementResult,
} from "@/lib/services/settlementService";
import { useOptimisticMutation } from "@/hooks/mutations/useOptimisticMutation";
import { useQueryClient } from "@tanstack/react-query";

// Slide up transition for mobile fullscreen
const SlideTransition = React.forwardRef(function Transition(
  props: TransitionProps & { children: React.ReactElement },
  ref: React.Ref<unknown>
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

interface UnifiedSettlementDialogProps {
  open: boolean;
  onClose: () => void;
  config: UnifiedSettlementConfig | null;
  onSuccess?: () => void;
}

export default function UnifiedSettlementDialog({
  open,
  onClose,
  config,
  onSuccess,
}: UnifiedSettlementDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { userProfile } = useAuth();
  const { selectedSite } = useSite();
  const supabase = createClient();

  // Selection state (for daily context)
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(new Set());

  // Settlement type selection (for weekly context)
  const [settlementType, setSettlementType] = useState<SettlementTypeSelection>("all");

  // Payment details
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash");
  // Phase-2 cleanup: Via-Engineer channel removed; admin payments are always
  // "direct". Kept as a const so downstream reads continue to compile.
  const paymentChannel: PaymentChannel = "direct";

  // Payer source (split-aware)
  const [payer, setPayer] = useState<PayerSourceInput>({
    mode: "single",
    source: "own_money",
  });

  // Additional details
  const [subcontractId, setSubcontractId] = useState<string | null>(null);
  const [proofFile, setProofFile] = useState<UploadedFile | null>(null);
  const [notes, setNotes] = useState<string>("");

  // Data state
  const [error, setError] = useState<string | null>(null);

  // Settlement mutation with optimistic updates
  const queryClient = useQueryClient();
  const settlementMutation = useOptimisticMutation<
    SettlementResult,
    Error,
    SettlementConfig,
    unknown
  >({
    mutationFn: async (config: SettlementConfig) => {
      return await processSettlement(supabase, config);
    },
    // Query keys that will be invalidated on success
    queryKey: ["settlements", selectedSite?.id],
    successMessage: "Settlement processed successfully!",
    errorMessage: "Failed to process settlement",
    onSuccess: () => {
      clearFormState();
      onSuccess?.();
      onClose();
    },
    onError: (error) => {
      setError(error.message || "Failed to process settlement");
    },
  });

  // Generate a unique storage key for this settlement context
  const storageKey = useMemo(() => {
    if (!config || !selectedSite?.id) return null;
    const contextId = config.context === "weekly"
      ? `weekly-${config.weekLabel}`
      : `daily-${config.date}`;
    return `settlement-form-${selectedSite.id}-${contextId}`;
  }, [config, selectedSite?.id]);

  // Save form state to sessionStorage
  const saveFormState = useCallback(() => {
    if (!storageKey) return;
    const formState = {
      paymentMode,
      payer,
      subcontractId,
      notes,
      settlementType,
      selectedRecords: Array.from(selectedRecords),
    };
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(formState));
    } catch (e) {
      console.warn("Failed to save form state:", e);
    }
  }, [storageKey, paymentMode, payer, subcontractId, notes, settlementType, selectedRecords]);

  // Auto-save form state when values change (debounced)
  useEffect(() => {
    if (!open || !storageKey) return;
    const timeout = setTimeout(saveFormState, 300);
    return () => clearTimeout(timeout);
  }, [open, saveFormState, storageKey]);

  // Clear form state from sessionStorage
  const clearFormState = useCallback(() => {
    if (storageKey) {
      try {
        sessionStorage.removeItem(storageKey);
      } catch (e) {
        console.warn("Failed to clear form state:", e);
      }
    }
  }, [storageKey]);

  // Reset form when dialog opens - restore from sessionStorage if available
  useEffect(() => {
    if (open && config) {
      // Try to restore from sessionStorage first
      let restored = false;
      if (storageKey) {
        try {
          const saved = sessionStorage.getItem(storageKey);
          if (saved) {
            const formState = JSON.parse(saved);
            setPaymentMode(formState.paymentMode || "cash");
            setPayer(
              formState.payer && typeof formState.payer === "object"
                ? formState.payer
                : { mode: "single", source: "own_money" }
            );
            setSubcontractId(formState.subcontractId ?? config.defaultSubcontractId ?? null);
            setNotes(formState.notes || "");
            setSettlementType(formState.settlementType || "all");
            if (formState.selectedRecords) {
              setSelectedRecords(new Set(formState.selectedRecords));
            }
            restored = true;
          }
        } catch (e) {
          console.warn("Failed to restore form state:", e);
        }
      }

      // If not restored, use defaults
      if (!restored) {
        // Pre-select all pending records for daily context
        if (config.context === "daily_single") {
          const pendingIds = config.records
            .filter((r) => !r.isPaid)
            .map((r) => r.id);
          setSelectedRecords(new Set(pendingIds));
        } else {
          setSelectedRecords(new Set());
        }

        setSettlementType("all");
        setPaymentMode("cash");
        setPayer({ mode: "single", source: "own_money" });
        setSubcontractId(config.defaultSubcontractId || null);
        setNotes("");
      }

      setProofFile(null);
      setError(null);
    }
  }, [open, config, storageKey]);

  // Calculate amounts based on selection
  const calculatedAmounts = useMemo(() => {
    if (!config) return { total: 0, selected: 0, count: 0 };

    if (config.context === "weekly") {
      // Weekly context - based on type selection
      let amount = 0;
      switch (settlementType) {
        case "daily":
          amount = config.dailyLaborPending;
          break;
        case "contract":
          amount = config.contractLaborPending;
          break;
        case "market":
          amount = config.marketLaborPending;
          break;
        case "all":
        default:
          amount = config.pendingAmount;
      }
      return { total: config.pendingAmount, selected: amount, count: 0 };
    } else {
      // Daily context - based on record selection
      const selectedAmount = config.records
        .filter((r) => selectedRecords.has(r.id))
        .reduce((sum, r) => sum + r.amount, 0);
      return {
        total: config.pendingAmount,
        selected: selectedAmount,
        count: selectedRecords.size,
      };
    }
  }, [config, settlementType, selectedRecords]);

  // Toggle record selection
  const handleToggleRecord = (id: string) => {
    setSelectedRecords((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Select all/none
  const handleSelectAll = () => {
    if (!config) return;
    const pendingRecords = config.records.filter((r) => !r.isPaid);
    if (selectedRecords.size === pendingRecords.length) {
      setSelectedRecords(new Set());
    } else {
      setSelectedRecords(new Set(pendingRecords.map((r) => r.id)));
    }
  };

  // Handle file upload
  const handleFileUpload = (file: UploadedFile) => {
    setProofFile(file);
  };

  const handleFileRemove = () => {
    setProofFile(null);
  };

  // Submit settlement
  const handleSubmit = async () => {
    // Guard against rapid double-clicks (React Query also handles this)
    if (settlementMutation.isPending) {
      console.warn('[UnifiedSettlementDialog] Submission already in progress');
      return;
    }

    if (!config || !selectedSite?.id || !userProfile) return;

    // Validation
    if (config.context === "daily_single" && selectedRecords.size === 0) {
      setError("Please select at least one laborer to settle");
      return;
    }

    if (calculatedAmounts.selected === 0) {
      setError("No pending amount to settle");
      return;
    }

    // Validate payer-source input (single OR split) before any side-effects.
    const payerCheck = validatePayerSourceInput(payer, calculatedAmounts.selected);
    if (!payerCheck.ok) {
      setError(payerCheck.reason);
      return;
    }

    if ((paymentMode === "upi" || paymentMode === "net_banking") && !proofFile) {
      setError("Please upload payment proof for UPI/Bank transfer");
      return;
    }

    setError(null);

    // Build settlement configuration
    const selectedIds = Array.from(selectedRecords);
    const settlementRecords: SettlementRecord[] = config.records.filter((r) =>
      config.context === "weekly" ? !r.isPaid : selectedIds.includes(r.id)
    );

    const settlementConfig: SettlementConfig = {
      siteId: selectedSite.id,
      records: settlementRecords,
      totalAmount: calculatedAmounts.selected,
      paymentMode,
      paymentChannel,
      payer,
      proofUrl: proofFile?.url,
      notes: notes || undefined,
      subcontractId: subcontractId || undefined,
      userId: userProfile.id,
      userName: userProfile.name || "Unknown",
    };

    // Submit via mutation - handles loading state, retries, errors automatically
    settlementMutation.mutate(settlementConfig);
  };


  if (!config) return null;

  const pendingRecords = config.records.filter((r) => !r.isPaid);
  const isWeekly = config.context === "weekly";

  // Dialog title
  const dialogTitle = isWeekly
    ? "Weekly Settlement"
    : `Daily Settlement - ${dayjs(config.date).format("MMM D, YYYY")}`;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      fullScreen={isMobile}
      TransitionComponent={isMobile ? SlideTransition : undefined}
      PaperProps={{
        sx: {
          borderRadius: isMobile ? 0 : 2,
          maxHeight: isMobile ? "100%" : "90vh",
        },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          pb: 1,
          bgcolor: isWeekly ? "primary.main" : "success.main",
          color: "white",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {isWeekly ? <CalendarMonth /> : <CalendarToday />}
          <Box>
            <Typography variant="h6" component="span" fontWeight={600}>
              {dialogTitle}
            </Typography>
            {isWeekly && config.weekLabel && (
              <Typography variant="caption" sx={{ opacity: 0.9 }}>
                {config.weekLabel}
              </Typography>
            )}
          </Box>
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ color: "white" }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 2 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Summary Card */}
        <Paper
          elevation={0}
          sx={{
            p: 2,
            mb: 2,
            bgcolor: alpha(isWeekly ? theme.palette.primary.main : theme.palette.success.main, 0.08),
            borderRadius: 2,
            border: `1px solid ${alpha(isWeekly ? theme.palette.primary.main : theme.palette.success.main, 0.2)}`,
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
                Settlement Amount
              </Typography>
              <Typography
                variant="h5"
                fontWeight={700}
                color={isWeekly ? "primary.main" : "success.main"}
              >
                Rs.{calculatedAmounts.selected.toLocaleString("en-IN")}
              </Typography>
            </Box>
            {!isWeekly && (
              <Chip
                icon={<Person sx={{ fontSize: 16 }} />}
                label={`${calculatedAmounts.count} laborers`}
                color="success"
                variant="outlined"
              />
            )}
          </Box>
        </Paper>

        {/* Weekly Type Selection */}
        {isWeekly && config.allowTypeSelection && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>
              Settlement Type
            </Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: "action.hover" }}>
                    <TableCell>Type</TableCell>
                    <TableCell align="right">Pending Amount</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TableRow
                    selected={settlementType === "daily"}
                    onClick={() => setSettlementType("daily")}
                    sx={{ cursor: "pointer" }}
                  >
                    <TableCell>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Person fontSize="small" />
                        Daily Laborers
                      </Box>
                    </TableCell>
                    <TableCell align="right">
                      <Chip
                        size="small"
                        label={`Rs.${config.dailyLaborPending.toLocaleString()}`}
                        color={config.dailyLaborPending > 0 ? "info" : "default"}
                        variant={settlementType === "daily" ? "filled" : "outlined"}
                      />
                    </TableCell>
                  </TableRow>
                  <TableRow
                    selected={settlementType === "market"}
                    onClick={() => setSettlementType("market")}
                    sx={{ cursor: "pointer" }}
                  >
                    <TableCell>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Groups fontSize="small" />
                        Market Laborers
                      </Box>
                    </TableCell>
                    <TableCell align="right">
                      <Chip
                        size="small"
                        label={`Rs.${config.marketLaborPending.toLocaleString()}`}
                        color={config.marketLaborPending > 0 ? "warning" : "default"}
                        variant={settlementType === "market" ? "filled" : "outlined"}
                      />
                    </TableCell>
                  </TableRow>
                  {config.contractLaborPending > 0 && (
                    <TableRow
                      selected={settlementType === "contract"}
                      onClick={() => setSettlementType("contract")}
                      sx={{ cursor: "pointer" }}
                    >
                      <TableCell>Contract Laborers</TableCell>
                      <TableCell align="right">
                        <Chip
                          size="small"
                          label={`Rs.${config.contractLaborPending.toLocaleString()}`}
                          color="secondary"
                          variant={settlementType === "contract" ? "filled" : "outlined"}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow
                    selected={settlementType === "all"}
                    onClick={() => setSettlementType("all")}
                    sx={{ cursor: "pointer", bgcolor: "action.hover" }}
                  >
                    <TableCell sx={{ fontWeight: 700 }}>Total</TableCell>
                    <TableCell align="right">
                      <Chip
                        size="small"
                        label={`Rs.${config.pendingAmount.toLocaleString()}`}
                        color="success"
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
        )}

        {/* Daily Laborer Selection */}
        {!isWeekly && (
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
                {selectedRecords.size === pendingRecords.length ? "Deselect All" : "Select All"}
              </Button>
            </Box>
            <Paper variant="outlined" sx={{ maxHeight: 200, overflow: "auto" }}>
              <List dense disablePadding>
                {pendingRecords.map((record) => (
                  <ListItem
                    key={record.id}
                    sx={{ borderBottom: "1px solid", borderColor: "divider" }}
                    secondaryAction={
                      <Chip
                        size="small"
                        label={`Rs.${record.amount.toLocaleString("en-IN")}`}
                        variant="outlined"
                        color={selectedRecords.has(record.id) ? "success" : "default"}
                      />
                    }
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <Checkbox
                        checked={selectedRecords.has(record.id)}
                        onChange={() => handleToggleRecord(record.id)}
                        size="small"
                      />
                    </ListItemIcon>
                    <ListItemText
                      primary={record.laborerName}
                      secondary={record.role || record.laborerType}
                    />
                  </ListItem>
                ))}
                {pendingRecords.length === 0 && (
                  <ListItem>
                    <ListItemText
                      primary="No pending laborers"
                      secondary="All laborers have been paid"
                    />
                  </ListItem>
                )}
              </List>
            </Paper>
          </Box>
        )}

        <Divider sx={{ my: 2 }} />

        {/* Payer Source — hidden for site engineers paying from wallet
            (source is derived from deposits). Phase-2 cleanup: Via-Engineer
            channel removed; admin payments are always direct, so the
            createWalletTransaction signal is hardcoded false. */}
        {!isSiteEngineerPayingFromWallet({
          userRole: userProfile?.role,
          payerType: "site_engineer",
          createWalletTransaction: false,
        }) && (
          <Box sx={{ mb: 2 }}>
            <PayerSourceSplitInput
              value={payer}
              onChange={setPayer}
              total={calculatedAmounts.selected}
              siteId={selectedSite?.id}
              disabled={settlementMutation.isPending}
            />
            {payer.mode === "split" && (() => {
              const check = validatePayerSourceInput(payer, calculatedAmounts.selected);
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

        {/* Payment Mode */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" fontWeight={600} gutterBottom>
            Payment Mode
          </Typography>
          <RadioGroup
            row
            value={paymentMode}
            onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
          >
            <FormControlLabel value="cash" control={<Radio size="small" />} label="Cash" />
            <FormControlLabel value="upi" control={<Radio size="small" />} label="UPI" />
            <FormControlLabel value="net_banking" control={<Radio size="small" />} label="Bank Transfer" />
          </RadioGroup>
        </Box>

        {/* Subcontract Linking */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" fontWeight={600} gutterBottom>
            Link to Subcontract (Optional)
          </Typography>
          <SubcontractLinkSelector
            selectedSubcontractId={subcontractId}
            onSelect={setSubcontractId}
            paymentAmount={calculatedAmounts.selected}
            disabled={settlementMutation.isPending}
          />
        </Box>

        {/* Proof Upload */}
        {(paymentMode === "upi" || paymentMode === "net_banking") && (
          <Box sx={{ mb: 2 }}>
            <FileUploader
              supabase={supabase}
              bucketName="settlement-proofs"
              folderPath={`${selectedSite?.id}/${dayjs().format("YYYY-MM")}`}
              fileNamePrefix="settlement"
              accept="image"
              maxSizeMB={10}
              label="Payment Proof *"
              helperText={`Upload screenshot of ${paymentMode === "upi" ? "UPI" : "bank"} transfer`}
              value={proofFile}
              onUpload={handleFileUpload}
              onRemove={handleFileRemove}
              compact
            />
          </Box>
        )}

        {/* Notes */}
        <TextField
          fullWidth
          multiline
          rows={2}
          label="Settlement Notes (Optional)"
          placeholder="Any additional notes about this settlement..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          size="small"
        />
      </DialogContent>

      <Divider />

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} disabled={settlementMutation.isPending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color={isWeekly ? "primary" : "success"}
          onClick={handleSubmit}
          disabled={
            settlementMutation.isPending ||
            calculatedAmounts.selected === 0 ||
            !validatePayerSourceInput(payer, calculatedAmounts.selected).ok ||
            ((paymentMode === "upi" || paymentMode === "net_banking") && !proofFile)
          }
          startIcon={settlementMutation.isPending ? <CircularProgress size={20} /> : <PaymentIcon />}
        >
          {settlementMutation.isPending
            ? "Processing..."
            : `Settle Rs.${calculatedAmounts.selected.toLocaleString("en-IN")}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
