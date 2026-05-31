"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Button,
  Typography,
  CircularProgress,
  Alert,
  useTheme,
  useMediaQuery,
  Divider,
} from "@mui/material";
import { Edit as EditIcon } from "@mui/icons-material";
import { createClient } from "@/lib/supabase/client";
import { useSite } from "@/contexts/SiteContext";
import { useAuth } from "@/contexts/AuthContext";
import PayerSourceSelector from "@/components/settlement/PayerSourceSelector";
import SubcontractLinkSelector from "./SubcontractLinkSelector";
import type { DateGroup, DailyPaymentRecord } from "@/types/payment.types";
import type { PayerSource } from "@/types/settlement.types";
import dayjs from "dayjs";

interface DateEditDialogProps {
  open: boolean;
  onClose: () => void;
  date: string;
  group: DateGroup | null;
  onSuccess: () => void;
}

export default function DateEditDialog({
  open,
  onClose,
  date,
  group,
  onSuccess,
}: DateEditDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { selectedSite } = useSite();
  const { userProfile } = useAuth();
  const supabase = createClient();

  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [payerSource, setPayerSource] = useState<PayerSource>("own_money");
  const [customPayerName, setCustomPayerName] = useState("");
  const [subcontractId, setSubcontractId] = useState<string | null>(null);

  // Reset form when dialog opens
  useEffect(() => {
    if (open && group) {
      // Get the first record's payer source as default
      const firstRecord = [...group.dailyRecords, ...group.marketRecords][0];
      if (firstRecord) {
        // We don't have payer source in the record type, so default to own_money
        setPayerSource("own_money");
        setSubcontractId(firstRecord.subcontractId || null);
      }
      setError(null);
    }
  }, [open, group]);

  if (!group) return null;

  const allRecords = [...group.dailyRecords, ...group.marketRecords];
  const pendingRecords = allRecords.filter(
    (r) => !r.isPaid && r.paidVia !== "engineer_wallet"
  );
  // Records that went via engineer wallet (for updating money source on transaction)
  const engineerWalletRecords = allRecords.filter(
    (r) => r.paidVia === "engineer_wallet" && r.engineerTransactionId
  );
  const totalAmount = pendingRecords.reduce((sum, r) => sum + r.amount, 0);
  const engineerWalletAmount = engineerWalletRecords.reduce((sum, r) => sum + r.amount, 0);

  const handleSubmit = async () => {
    if (!selectedSite?.id || !userProfile) return;

    setProcessing(true);
    setError(null);

    try {
      // Get daily and market record IDs
      const dailyIds = pendingRecords
        .filter((r) => r.sourceType === "daily")
        .map((r) => r.sourceId);
      const marketIds = pendingRecords
        .filter((r) => r.sourceType === "market")
        .map((r) => r.sourceId);

      const updateData = {
        payer_source: payerSource,
        payer_name: payerSource === "custom" ? customPayerName : null,
        subcontract_id: subcontractId,
      };

      // Update daily attendance
      if (dailyIds.length > 0) {
        const { error: dailyError } = await supabase
          .from("daily_attendance")
          .update(updateData)
          .in("id", dailyIds);

        if (dailyError) throw dailyError;
      }

      // Note: market_laborer_attendance doesn't have payer_source/payer_name columns
      // Those fields only apply to daily laborers

      // Update money_source on engineer transactions for records that went via engineer wallet
      const transactionIds = [...new Set(engineerWalletRecords
        .map(r => r.engineerTransactionId)
        .filter(Boolean)
      )] as string[];

      if (transactionIds.length > 0) {
        const { error: txError } = await (supabase
          .from("site_engineer_transactions") as any)
          .update({
            money_source: payerSource,
            money_source_name: (payerSource === "custom" || payerSource === "other_site_money") ? customPayerName : null,
          })
          .in("id", transactionIds);

        if (txError) throw txError;
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Error updating records:", err);
      setError(err.message || "Failed to update records");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      fullScreen={isMobile}
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <EditIcon color="primary" />
        <Box>
          <Typography variant="h6" component="span">Edit Date Records</Typography>
          <Typography variant="caption" color="text.secondary">
            {dayjs(date).format("dddd, MMM D, YYYY")}
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Box sx={{ mb: 3 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            This will update records for this date:
          </Typography>
          {pendingRecords.length > 0 && (
            <Box sx={{ display: "flex", gap: 2, mt: 1 }}>
              <Typography variant="body2">
                <strong>{pendingRecords.length}</strong> pending records
              </Typography>
              <Typography variant="body2">
                Rs.<strong>{totalAmount.toLocaleString("en-IN")}</strong>
              </Typography>
            </Box>
          )}
          {engineerWalletRecords.length > 0 && (
            <Box sx={{ display: "flex", gap: 2, mt: 1 }}>
              <Typography variant="body2" color="info.main">
                <strong>{engineerWalletRecords.length}</strong> via engineer
              </Typography>
              <Typography variant="body2" color="info.main">
                Rs.<strong>{engineerWalletAmount.toLocaleString("en-IN")}</strong>
              </Typography>
            </Box>
          )}
          {pendingRecords.length === 0 && engineerWalletRecords.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No records to update
            </Typography>
          )}
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Payer Source */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" fontWeight={600} gutterBottom>
            Payer Source
          </Typography>
          <PayerSourceSelector
            value={payerSource}
            customName={customPayerName}
            onChange={setPayerSource}
            onCustomNameChange={setCustomPayerName}
            siteId={selectedSite?.id}
            disabled={processing}
          />
        </Box>

        {/* Subcontract Link (only for daily laborers) */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" fontWeight={600} gutterBottom>
            Link to Subcontract
          </Typography>
          <SubcontractLinkSelector
            selectedSubcontractId={subcontractId}
            onSelect={setSubcontractId}
            paymentAmount={totalAmount}
            disabled={processing}
          />
          <Typography variant="caption" color="text.secondary">
            Note: Subcontract link only applies to daily laborers, not market laborers.
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} disabled={processing}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={processing || (pendingRecords.length === 0 && engineerWalletRecords.length === 0)}
          startIcon={processing ? <CircularProgress size={20} /> : <EditIcon />}
        >
          {processing ? "Updating..." : "Update All"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
