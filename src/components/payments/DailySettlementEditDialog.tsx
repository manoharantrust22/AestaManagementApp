"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Chip,
  Tooltip,
  alpha,
  useTheme,
  InputAdornment,
} from "@mui/material";
import {
  Close as CloseIcon,
  Edit as EditIcon,
  Receipt as ReceiptIcon,
  Save as SaveIcon,
  Delete as DeleteIcon,
  ZoomIn as ZoomInIcon,
  Info as InfoIcon,
} from "@mui/icons-material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";
import { createClient } from "@/lib/supabase/client";
import { useSite } from "@/contexts/SiteContext";
import { useAuth } from "@/contexts/AuthContext";
import type { SettlementDetails } from "./SettlementRefDetailDialog";
import type { PaymentMode } from "@/types/payment.types";
import type { PayerSource, PayerSourceInput } from "@/types/settlement.types";
import PayerSourceSplitInput from "@/components/settlement/PayerSourceSplitInput";
import {
  validatePayerSourceInput,
  toRpcArgs,
} from "@/lib/settlement/payerSource";
import FileUploader from "@/components/common/FileUploader";
import SubcontractLinkSelector from "@/components/payments/SubcontractLinkSelector";
import ScreenshotViewer from "@/components/common/ScreenshotViewer";

interface DailySettlementEditDialogProps {
  open: boolean;
  onClose: () => void;
  settlement: SettlementDetails | null;
  onSuccess?: () => void;
  onDelete?: (settlement: SettlementDetails) => void;
}

export default function DailySettlementEditDialog({
  open,
  onClose,
  settlement,
  onSuccess,
  onDelete,
}: DailySettlementEditDialogProps) {
  const theme = useTheme();
  const { selectedSite } = useSite();
  const { userProfile } = useAuth();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Screenshot viewer state
  const [screenshotViewerOpen, setScreenshotViewerOpen] = useState(false);
  const [viewerInitialIndex, setViewerInitialIndex] = useState(0);

  // Form state
  const [paymentDate, setPaymentDate] = useState<dayjs.Dayjs | null>(null);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("upi");
  const [paymentChannel, setPaymentChannel] = useState<string>("direct");
  const [payer, setPayer] = useState<PayerSourceInput>({
    mode: "single",
    source: "own_money",
  });
  const [notes, setNotes] = useState("");
  const [proofUrls, setProofUrls] = useState<string[]>([]);
  const [subcontractId, setSubcontractId] = useState<string | null>(null);

  // Initialize form from settlement
  useEffect(() => {
    if (settlement) {
      setPaymentDate(settlement.settlementDate ? dayjs(settlement.settlementDate) : null);
      setPaymentMode((settlement.paymentMode as PaymentMode) || "upi");
      setPaymentChannel(settlement.paymentChannel || "direct");
      if (settlement.payerSourceSplit && settlement.payerSourceSplit.length > 0) {
        setPayer({ mode: "split", rows: settlement.payerSourceSplit });
      } else {
        setPayer({
          mode: "single",
          source: (settlement.payerSource as PayerSource) ?? "own_money",
          name: settlement.payerName ?? undefined,
        });
      }
      setNotes(settlement.notes || "");
      setProofUrls(settlement.proofUrls || []);
      setSubcontractId(settlement.subcontractId);
    }
  }, [settlement]);

  const handleSave = async () => {
    if (!settlement || !selectedSite?.id) return;

    const payerCheck = validatePayerSourceInput(payer, settlement.totalAmount);
    if (!payerCheck.ok) {
      setError(payerCheck.reason);
      return;
    }
    const payerRpc = toRpcArgs(payer);

    setLoading(true);
    setError(null);

    try {
      const userName = userProfile?.name || userProfile?.email || "Unknown";

      // Update settlement_groups record (source of truth — has payer_source_split column).
      const { error: updateError } = await (supabase as any)
        .from("settlement_groups")
        .update({
          settlement_date: paymentDate?.format("YYYY-MM-DD"),
          actual_payment_date: paymentDate?.format("YYYY-MM-DD"),
          payment_mode: paymentMode,
          payment_channel: paymentChannel,
          payer_source: payerRpc.p_payer_source,
          payer_name: payerRpc.p_payer_name,
          payer_source_split: payerRpc.p_payer_source_split,
          notes,
          proof_url: proofUrls[0] || null,
          proof_urls: proofUrls.length > 0 ? proofUrls : null,
          subcontract_id: subcontractId,
          created_by_name: userName, // Update to current user who edited
          updated_at: new Date().toISOString(),
        })
        .eq("id", settlement.settlementGroupId);

      if (updateError) {
        throw updateError;
      }

      // Update related daily_attendance records (if any).
      // daily_attendance has no payer_source_split column — only sync the
      // single-source view (with 'split' sentinel + null name when in split mode).
      const { error: dailyError } = await supabase
        .from("daily_attendance")
        .update({
          payment_mode: paymentMode,
          payer_source: payerRpc.p_payer_source,
          payer_name: payerRpc.p_payer_name,
          payment_proof_url: proofUrls[0] || null,
          payment_notes: notes,
          subcontract_id: subcontractId,
        })
        .eq("settlement_group_id", settlement.settlementGroupId);

      if (dailyError) {
        console.warn("Error updating daily_attendance:", dailyError);
      }

      // Update related market_laborer_attendance records (if any).
      // Same constraint as daily_attendance — no payer_source_split column.
      const { error: marketError } = await supabase
        .from("market_laborer_attendance")
        .update({
          payment_mode: paymentMode,
          payer_source: payerRpc.p_payer_source,
          payer_name: payerRpc.p_payer_name,
          payment_proof_url: proofUrls[0] || null,
          payment_notes: notes,
          subcontract_id: subcontractId,
        })
        .eq("settlement_group_id", settlement.settlementGroupId);

      if (marketError) {
        console.warn("Error updating market_laborer_attendance:", marketError);
      }

      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error("Error updating settlement:", err);
      setError(err.message || "Failed to update settlement");
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (file: { url: string; name: string; size: number; type?: string }) => {
    setProofUrls((prev) => [...prev, file.url]);
  };

  const handleRemoveFile = (index: number) => {
    setProofUrls((prev) => prev.filter((_, i) => i !== index));
  };

  if (!settlement) return null;

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: { borderRadius: 2 },
        }}
      >
        <DialogTitle
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            pb: 1,
            borderBottom: `1px solid ${theme.palette.divider}`,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <EditIcon color="primary" />
            <Typography variant="h6" component="span">Edit Settlement</Typography>
          </Box>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ pt: 3 }}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {/* Settlement Reference */}
          <Box sx={{ mb: 3, p: 2, bgcolor: alpha(theme.palette.primary.main, 0.04), borderRadius: 1 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
              <ReceiptIcon fontSize="small" color="primary" />
              <Chip
                label={settlement.settlementReference}
                color="primary"
                variant="outlined"
                sx={{ fontFamily: "monospace" }}
              />
            </Box>
          </Box>

          {/* Amount Field - Read Only with Info Message */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" gutterBottom>
              Total Amount
            </Typography>
            <TextField
              fullWidth
              size="small"
              value={settlement.totalAmount.toLocaleString()}
              disabled
              InputProps={{
                startAdornment: <InputAdornment position="start">Rs.</InputAdornment>,
              }}
            />
            <Alert severity="info" sx={{ mt: 1 }} icon={<InfoIcon fontSize="small" />}>
              <Typography variant="caption">
                Amount is calculated from attendance records. To change the amount, edit the attendance.
              </Typography>
            </Alert>
          </Box>

          {/* Laborer Count - Read Only */}
          {settlement.laborerCount > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Laborers
              </Typography>
              <Chip
                label={`${settlement.laborerCount} laborer${settlement.laborerCount > 1 ? "s" : ""}`}
                variant="outlined"
                size="small"
              />
            </Box>
          )}

          {/* Payment Date */}
          <Box sx={{ mb: 2 }}>
            <DatePicker
              label="Payment Date"
              value={paymentDate}
              onChange={(date) => setPaymentDate(date)}
              slotProps={{
                textField: {
                  fullWidth: true,
                  size: "small",
                },
              }}
            />
          </Box>

          {/* Payment Mode */}
          <FormControl fullWidth size="small" sx={{ mb: 2 }}>
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

          {/* Payment Channel */}
          <FormControl fullWidth size="small" sx={{ mb: 2 }}>
            <InputLabel>Payment Channel</InputLabel>
            <Select
              value={paymentChannel}
              onChange={(e) => setPaymentChannel(e.target.value)}
              label="Payment Channel"
            >
              <MenuItem value="direct">Direct Payment</MenuItem>
              <MenuItem value="engineer_wallet">Via Engineer Wallet</MenuItem>
            </Select>
          </FormControl>

          {/* Payer Source */}
          <Box sx={{ mb: 2 }}>
            <PayerSourceSplitInput
              value={payer}
              onChange={setPayer}
              total={settlement.totalAmount}
              siteId={selectedSite?.id}
              disabled={loading}
            />
            {(() => {
              const c = validatePayerSourceInput(payer, settlement.totalAmount);
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

          {/* Subcontract Link */}
          {selectedSite?.id && (
            <Box sx={{ mb: 2 }}>
              <SubcontractLinkSelector
                selectedSubcontractId={subcontractId}
                onSelect={setSubcontractId}
                paymentAmount={settlement.totalAmount}
              />
            </Box>
          )}

          {/* Notes */}
          <TextField
            fullWidth
            size="small"
            label="Notes (Optional)"
            placeholder="Add any notes about this settlement..."
            multiline
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            sx={{ mb: 2 }}
          />

          {/* Proof Screenshots */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
              Payment Proof Screenshots
            </Typography>

            {/* Existing files - Clickable for fullscreen view */}
            {proofUrls.length > 0 && (
              <Box sx={{ display: "flex", gap: 1, mb: 1, flexWrap: "wrap" }}>
                {proofUrls.map((url, idx) => (
                  <Tooltip key={idx} title="Click to view fullscreen">
                    <Box
                      sx={{
                        position: "relative",
                        width: 64,
                        height: 64,
                        borderRadius: 1,
                        overflow: "hidden",
                        border: `1px solid ${theme.palette.divider}`,
                        cursor: "pointer",
                        transition: "all 0.2s",
                        "&:hover": {
                          borderColor: theme.palette.primary.main,
                          transform: "scale(1.05)",
                          "& .zoom-overlay": {
                            opacity: 1,
                          },
                        },
                      }}
                      onClick={() => {
                        setViewerInitialIndex(idx);
                        setScreenshotViewerOpen(true);
                      }}
                    >
                      <Box
                        component="img"
                        src={url}
                        alt={`Proof ${idx + 1}`}
                        sx={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                      {/* Zoom overlay on hover */}
                      <Box
                        className="zoom-overlay"
                        sx={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          bgcolor: "rgba(0,0,0,0.4)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          opacity: 0,
                          transition: "opacity 0.2s",
                        }}
                      >
                        <ZoomInIcon sx={{ color: "white" }} />
                      </Box>
                      {/* Delete button */}
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveFile(idx);
                        }}
                        sx={{
                          position: "absolute",
                          top: -8,
                          right: -8,
                          bgcolor: "error.main",
                          color: "white",
                          "&:hover": { bgcolor: "error.dark" },
                          width: 20,
                          height: 20,
                        }}
                      >
                        <CloseIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Box>
                  </Tooltip>
                ))}
              </Box>
            )}

            {/* Upload new file */}
            {selectedSite?.id && (
              <FileUploader
                supabase={supabase}
                bucketName="payment-proofs"
                folderPath={`${selectedSite.id}/${dayjs().format("YYYY-MM")}`}
                onUpload={handleFileUpload}
                acceptString="image/png,image/jpeg,image/webp"
                maxSizeMB={5}
              />
            )}
          </Box>
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2, borderTop: `1px solid ${theme.palette.divider}`, justifyContent: "space-between" }}>
          {onDelete && settlement ? (
            <Button
              color="error"
              onClick={() => {
                onDelete(settlement);
                onClose();
              }}
              disabled={loading}
              startIcon={<DeleteIcon />}
            >
              Delete
            </Button>
          ) : (
            <Box />
          )}
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={
                loading ||
                !validatePayerSourceInput(payer, settlement.totalAmount).ok
              }
              startIcon={loading ? <CircularProgress size={16} /> : <SaveIcon />}
            >
              Save Changes
            </Button>
          </Box>
        </DialogActions>
      </Dialog>

      {/* Screenshot Viewer for Fullscreen Proof View */}
      <ScreenshotViewer
        open={screenshotViewerOpen}
        onClose={() => setScreenshotViewerOpen(false)}
        images={proofUrls}
        initialIndex={viewerInitialIndex}
        title="Payment Proof"
      />
    </LocalizationProvider>
  );
}
