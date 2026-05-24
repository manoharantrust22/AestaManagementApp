"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Button,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Alert,
  CircularProgress,
  Divider,
  Chip,
  IconButton,
} from "@mui/material";
import {
  Edit as EditIcon,
  Close as CloseIcon,
  Link as LinkIcon,
  Payment as PaymentIcon,
  PhotoCamera as PhotoIcon,
} from "@mui/icons-material";
import { createClient } from "@/lib/supabase/client";
import { useSite } from "@/contexts/SiteContext";
import FileUploader, { UploadedFile } from "@/components/common/FileUploader";
import SubcontractLinkSelector from "./SubcontractLinkSelector";
import PayerSourceSplitInput from "@/components/settlement/PayerSourceSplitInput";
import { toRpcArgs, validatePayerSourceInput } from "@/lib/settlement/payerSource";
import dayjs from "dayjs";
import type { DailyPaymentRecord, PaymentMode } from "@/types/payment.types";
import type { PayerSource, PayerSourceInput } from "@/types/settlement.types";
import type { SupabaseClient } from "@supabase/supabase-js";

interface SettlementEditDialogProps {
  open: boolean;
  onClose: () => void;
  record: DailyPaymentRecord | null;
  onSuccess?: () => void;
}

export default function SettlementEditDialog({
  open,
  onClose,
  record,
  onSuccess,
}: SettlementEditDialogProps) {
  const { selectedSite } = useSite();
  const supabase = createClient();

  // Form state
  const [subcontractId, setSubcontractId] = useState<string | null>(null);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("upi");
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState<string>("");
  const [payer, setPayer] = useState<PayerSourceInput>({
    mode: "single",
    source: "own_money",
  });

  // UI state
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize form when dialog opens or record changes
  useEffect(() => {
    if (open && record) {
      setSubcontractId(record.subcontractId || null);
      setPaymentMode(record.paymentMode || "upi");
      setProofUrl(record.proofUrl || null);
      setNotes(record.paymentNotes || "");
      if (record.payerSourceSplit && record.payerSourceSplit.length > 0) {
        setPayer({ mode: "split", rows: record.payerSourceSplit });
      } else {
        setPayer({
          mode: "single",
          source: (record.moneySource as PayerSource) ?? "own_money",
          name: record.moneySourceName ?? undefined,
        });
      }
      setError(null);
    }
  }, [open, record]);

  // Handle file upload - wrapped in useCallback to prevent re-renders
  const handleFileUploaded = useCallback((file: UploadedFile) => {
    setProofUrl(file.url);
  }, []);

  // Handle save
  const handleSave = async () => {
    if (!record || !selectedSite) {
      setError("Missing required data");
      return;
    }

    const payerCheck = validatePayerSourceInput(payer, record.amount);
    if (!payerCheck.ok) {
      setError(payerCheck.reason);
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const payerRpc = toRpcArgs(payer);

      // Prepare update payload for attendance record.
      // daily_attendance / market_laborer_attendance do not have a
      // payer_source_split column, so we only sync the single-source view
      // (with the 'split' sentinel + null name when in split mode). The
      // per-row breakdown lives on settlement_groups (source of truth).
      const attendancePayload: Record<string, any> = {
        payment_mode: paymentMode,
        payment_proof_url: proofUrl,
        payment_notes: notes || null,
        payer_source: payerRpc.p_payer_source,
        payer_name: payerRpc.p_payer_name,
      };

      // Add subcontract to payload for both daily and market
      attendancePayload.subcontract_id = subcontractId;

      // Update the attendance record
      if (record.sourceType === "daily") {
        const { error: dailyError } = await supabase
          .from("daily_attendance")
          .update(attendancePayload)
          .eq("id", record.sourceId);

        if (dailyError) throw dailyError;
      } else if (record.sourceType === "market") {
        const { error: marketError } = await supabase
          .from("market_laborer_attendance")
          .update(attendancePayload)
          .eq("id", record.sourceId);

        if (marketError) throw marketError;
      }

      // If this is an engineer wallet payment, update the transaction money source
      if (record.engineerTransactionId && record.paidVia === "engineer_wallet") {
        const { error: txError } = await (supabase as any)
          .from("site_engineer_transactions")
          .update({
            money_source: payerRpc.p_payer_source,
            money_source_name: payerRpc.p_payer_name,
            payer_source_split: payerRpc.p_payer_source_split,
          })
          .eq("id", record.engineerTransactionId);

        if (txError) throw txError;
      }

      // Update settlement_group if exists (new architecture - single source of truth)
      // Changes here will automatically reflect in v_all_expenses view
      // Note: Cast to any until Supabase types are regenerated after migrations
      if ((record as any).settlementGroupId) {
        const { error: groupError } = await (supabase as any)
          .from("settlement_groups")
          .update({
            subcontract_id: subcontractId,
            payer_source: payerRpc.p_payer_source,
            payer_name: payerRpc.p_payer_name,
            payer_source_split: payerRpc.p_payer_source_split,
            payment_mode: paymentMode,
            proof_url: proofUrl,
            notes: notes || null,
          })
          .eq("id", (record as any).settlementGroupId);

        if (groupError) {
          console.error("Error updating settlement_group:", groupError);
        }
      }

      // Legacy: Update engineer_transaction.related_subcontract_id for backward compatibility
      if (record.engineerTransactionId) {
        const { error: txSubError } = await (supabase
          .from("site_engineer_transactions") as any)
          .update({ related_subcontract_id: subcontractId })
          .eq("id", record.engineerTransactionId);

        if (txSubError) {
          console.error("Error updating engineer transaction subcontract:", txSubError);
        }
      }

      // Legacy: Update old-style expenses if they exist (for data created before migration)
      if (record.expenseId) {
        const { error: expenseError } = await supabase
          .from("expenses")
          .update({ contract_id: subcontractId })
          .eq("id", record.expenseId);

        if (expenseError) {
          console.error("Error updating expense contract link:", expenseError);
        }
      }

      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error("Error updating settlement:", err);
      setError(err.message || "Failed to update settlement");
    } finally {
      setProcessing(false);
    }
  };

  if (!record) return null;

  const isEngineerWallet = record.paidVia === "engineer_wallet";
  const isDaily = record.sourceType === "daily";

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <EditIcon color="primary" />
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" component="span">Edit Settlement Details</Typography>
          <Typography variant="caption" color="text.secondary">
            {record.laborerName} - {dayjs(record.date).format("DD MMM YYYY")}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Record Info */}
        <Box sx={{ mb: 3, p: 2, bgcolor: "action.hover", borderRadius: 1 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Type
            </Typography>
            <Chip
              label={record.sourceType === "daily" ? "Daily" : "Market"}
              size="small"
              color={record.sourceType === "daily" ? "primary" : "secondary"}
              variant="outlined"
            />
          </Box>
          <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Amount
            </Typography>
            <Typography variant="body2" fontWeight={600}>
              ₹{record.amount.toLocaleString()}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", justifyContent: "space-between" }}>
            <Typography variant="body2" color="text.secondary">
              Status
            </Typography>
            <Chip
              label={record.isPaid ? "Paid" : record.paidVia === "engineer_wallet" ? "With Engineer" : "Pending"}
              size="small"
              color={record.isPaid ? "success" : record.paidVia === "engineer_wallet" ? "info" : "warning"}
            />
          </Box>
        </Box>

        <Divider sx={{ my: 2 }} />

        {/* Editable Fields */}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
          {/* Payment Mode */}
          <FormControl fullWidth size="small">
            <InputLabel>Payment Mode</InputLabel>
            <Select
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
              label="Payment Mode"
            >
              <MenuItem value="upi">UPI</MenuItem>
              <MenuItem value="cash">Cash</MenuItem>
              <MenuItem value="net_banking">Net Banking</MenuItem>
              <MenuItem value="other">Other</MenuItem>
            </Select>
          </FormControl>

          {/* Subcontract Link - Available for both daily and market laborers */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1, display: "flex", alignItems: "center", gap: 0.5 }}>
              <LinkIcon fontSize="small" />
              Link to Subcontract
            </Typography>
            <SubcontractLinkSelector
              selectedSubcontractId={subcontractId}
              onSelect={setSubcontractId}
              paymentAmount={record.amount}
              showBalanceAfterPayment
            />
          </Box>

          {/* Money Source - Show for all paid settlements */}
          {(record.isPaid || isEngineerWallet) && (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Whose Money
              </Typography>
              <PayerSourceSplitInput
                value={payer}
                onChange={setPayer}
                total={record.amount}
                siteId={selectedSite?.id}
                disabled={processing}
              />
              {(() => {
                const c = validatePayerSourceInput(payer, record.amount);
                return !c.ok && payer.mode === "split" ? (
                  <Typography
                    variant="caption"
                    color="error.main"
                    sx={{ mt: 1, display: "block" }}
                  >
                    {c.reason}
                  </Typography>
                ) : null;
              })()}
            </Box>
          )}

          {/* Payment Proof */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1, display: "flex", alignItems: "center", gap: 0.5 }}>
              <PhotoIcon fontSize="small" />
              Payment Proof
            </Typography>
            {proofUrl ? (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Box
                  component="img"
                  src={proofUrl}
                  alt="Payment proof"
                  sx={{
                    width: 80,
                    height: 80,
                    objectFit: "cover",
                    borderRadius: 1,
                    border: 1,
                    borderColor: "divider",
                  }}
                />
                <Button
                  size="small"
                  color="error"
                  onClick={() => setProofUrl(null)}
                >
                  Remove
                </Button>
              </Box>
            ) : (
              <FileUploader
                supabase={supabase as SupabaseClient<any>}
                bucketName="payment-proofs"
                folderPath={`settlements/${selectedSite?.id}/${record.date}`}
                accept="image"
                label="Upload Proof"
                uploadOnSelect
                onUpload={handleFileUploaded}
              />
            )}
          </Box>

          {/* Notes */}
          <TextField
            label="Payment Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            multiline
            rows={2}
            fullWidth
            size="small"
            placeholder="Optional notes about this payment..."
          />
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={processing}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={
            processing ||
            !validatePayerSourceInput(payer, record.amount).ok
          }
          startIcon={processing ? <CircularProgress size={16} /> : <EditIcon />}
        >
          {processing ? "Saving..." : "Save Changes"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
