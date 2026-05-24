"use client";

import React, { useState, useEffect, useMemo } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Collapse,
} from "@mui/material";
import {
  Close as CloseIcon,
  Edit as EditIcon,
  Receipt as ReceiptIcon,
  Save as SaveIcon,
  Delete as DeleteIcon,
  ZoomIn as ZoomInIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from "@mui/icons-material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import dayjs from "dayjs";
import { createClient } from "@/lib/supabase/client";
import { useSite } from "@/contexts/SiteContext";
import type { DateWiseSettlement, PaymentMode } from "@/types/payment.types";
import type { PayerSource, PayerSourceInput } from "@/types/settlement.types";
import PayerSourceSplitInput from "@/components/settlement/PayerSourceSplitInput";
import {
  validatePayerSourceInput,
  toRpcArgs,
} from "@/lib/settlement/payerSource";
import FileUploader from "@/components/common/FileUploader";
import SubcontractLinkSelector from "@/components/payments/SubcontractLinkSelector";
import ScreenshotViewer from "@/components/common/ScreenshotViewer";

interface LaborerPaymentInfo {
  id: string;
  laborerId: string;
  laborerName: string;
  laborerRole: string | null;
  amount: number;
  paymentReference: string | null;
}

interface ContractSettlementEditDialogProps {
  open: boolean;
  onClose: () => void;
  settlement: DateWiseSettlement | null;
  onSuccess?: () => void;
  onDelete?: (settlement: DateWiseSettlement) => void;
}

// Format currency
function formatCurrency(amount: number): string {
  return `Rs.${amount.toLocaleString()}`;
}

export default function ContractSettlementEditDialog({
  open,
  onClose,
  settlement,
  onSuccess,
  onDelete,
}: ContractSettlementEditDialogProps) {
  const theme = useTheme();
  const { selectedSite } = useSite();
  const supabase = createClient();

  const [loading, setLoading] = useState(false);
  const [fetchingLaborers, setFetchingLaborers] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Screenshot viewer state
  const [screenshotViewerOpen, setScreenshotViewerOpen] = useState(false);
  const [viewerInitialIndex, setViewerInitialIndex] = useState(0);

  // Form state
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [amountInput, setAmountInput] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState<dayjs.Dayjs | null>(null);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("upi");
  const [payer, setPayer] = useState<PayerSourceInput>({
    mode: "single",
    source: "own_money",
  });
  const [notes, setNotes] = useState("");
  const [proofUrls, setProofUrls] = useState<string[]>([]);
  const [subcontractId, setSubcontractId] = useState<string | null>(null);

  // Laborer payments for this settlement (fetched from labor_payments)
  const [laborerPayments, setLaborerPayments] = useState<LaborerPaymentInfo[]>([]);
  const [showLaborerBreakdown, setShowLaborerBreakdown] = useState(false);

  // Track original amount for comparison
  const [originalAmount, setOriginalAmount] = useState<number>(0);

  // Calculate if amount changed
  const amountChanged = useMemo(() => {
    return Math.abs(totalAmount - originalAmount) >= 1; // Allow for small rounding differences
  }, [totalAmount, originalAmount]);

  // Initialize form from settlement
  useEffect(() => {
    if (settlement) {
      setTotalAmount(settlement.totalAmount);
      setAmountInput(settlement.totalAmount.toString());
      setOriginalAmount(settlement.totalAmount);
      setPaymentDate(settlement.settlementDate ? dayjs(settlement.settlementDate) : null);
      setPaymentMode((settlement.paymentMode as PaymentMode) || "upi");
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

  // Fetch laborer payments when dialog opens
  useEffect(() => {
    const fetchLaborerPayments = async () => {
      if (!open || !settlement?.settlementGroupId) return;

      setFetchingLaborers(true);
      try {
        const { data, error: fetchError } = await supabase
          .from("labor_payments")
          .select(`
            id,
            laborer_id,
            amount,
            payment_reference,
            laborers(name, labor_roles(name))
          `)
          .eq("settlement_group_id", settlement.settlementGroupId)
          .eq("is_under_contract", true)
          .order("amount", { ascending: false });

        if (fetchError) throw fetchError;

        const payments: LaborerPaymentInfo[] = (data || []).map((p: any) => ({
          id: p.id,
          laborerId: p.laborer_id,
          laborerName: p.laborers?.name || "Unknown",
          laborerRole: p.laborers?.labor_roles?.name || null,
          amount: p.amount,
          paymentReference: p.payment_reference,
        }));

        setLaborerPayments(payments);
      } catch (err) {
        console.error("Error fetching laborer payments:", err);
      } finally {
        setFetchingLaborers(false);
      }
    };

    fetchLaborerPayments();
  }, [open, settlement?.settlementGroupId, supabase]);

  const handleSave = async () => {
    if (!settlement || !selectedSite?.id) return;

    if (totalAmount <= 0) {
      setError("Amount must be greater than zero");
      return;
    }

    const payerCheck = validatePayerSourceInput(payer, totalAmount);
    if (!payerCheck.ok) {
      setError(payerCheck.reason);
      return;
    }
    const payerRpc = toRpcArgs(payer);

    setLoading(true);
    setError(null);

    try {
      // Update settlement_groups record (source of truth — has payer_source_split column).
      const { error: updateError } = await (supabase
        .from("settlement_groups") as any)
        .update({
          total_amount: totalAmount,
          settlement_date: paymentDate?.format("YYYY-MM-DD"),
          actual_payment_date: paymentDate?.format("YYYY-MM-DD"),
          payment_mode: paymentMode,
          payer_source: payerRpc.p_payer_source,
          payer_name: payerRpc.p_payer_name,
          payer_source_split: payerRpc.p_payer_source_split,
          notes,
          proof_url: proofUrls[0] || null,
          proof_urls: proofUrls.length > 0 ? proofUrls : null,
          subcontract_id: subcontractId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", settlement.settlementGroupId);

      if (updateError) {
        throw updateError;
      }

      // If amount changed, update labor_payments proportionally
      if (amountChanged && laborerPayments.length > 0) {
        const currentTotal = laborerPayments.reduce((sum, p) => sum + p.amount, 0);

        if (currentTotal > 0) {
          // Calculate new amounts proportionally
          let allocatedSoFar = 0;
          const newAmounts: { id: string; amount: number }[] = [];

          laborerPayments.forEach((payment, index) => {
            let newAmount: number;
            if (index === laborerPayments.length - 1) {
              // Last laborer gets the remainder to ensure exact total
              newAmount = totalAmount - allocatedSoFar;
            } else {
              // Proportional distribution
              const proportion = payment.amount / currentTotal;
              newAmount = Math.round(totalAmount * proportion);
            }
            newAmounts.push({ id: payment.id, amount: Math.max(0, newAmount) });
            allocatedSoFar += Math.max(0, newAmount);
          });

          // Update each labor_payment with the new amount
          for (const item of newAmounts) {
            await supabase
              .from("labor_payments")
              .update({
                amount: item.amount,
                actual_payment_date: paymentDate?.format("YYYY-MM-DD"),
                payment_mode: paymentMode,
                proof_url: proofUrls[0] || null,
                notes,
                subcontract_id: subcontractId,
              })
              .eq("id", item.id);
          }
        }
      } else {
        // Amount not changed, just update metadata
        await supabase
          .from("labor_payments")
          .update({
            actual_payment_date: paymentDate?.format("YYYY-MM-DD"),
            payment_mode: paymentMode,
            proof_url: proofUrls[0] || null,
            notes,
            subcontract_id: subcontractId,
          })
          .eq("settlement_group_id", settlement.settlementGroupId);
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

          {/* Amount Field - Editable */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" gutterBottom>
              Total Amount
            </Typography>
            <TextField
              fullWidth
              size="small"
              type="text"
              inputMode="numeric"
              value={amountInput}
              onChange={(e) => {
                const value = e.target.value;
                // Only allow digits and optional decimal point
                if (value === "" || /^\d*\.?\d*$/.test(value)) {
                  setAmountInput(value);
                  const numValue = parseFloat(value) || 0;
                  setTotalAmount(numValue);
                }
              }}
              InputProps={{
                startAdornment: <InputAdornment position="start">Rs.</InputAdornment>,
              }}
              helperText={
                amountChanged
                  ? `Original: ${formatCurrency(originalAmount)} → New: ${formatCurrency(totalAmount)}`
                  : undefined
              }
              sx={{
                "& .MuiOutlinedInput-root": amountChanged
                  ? { borderColor: theme.palette.warning.main }
                  : {},
              }}
            />
            {amountChanged && laborerPayments.length > 1 && (
              <Alert severity="info" sx={{ mt: 1 }} icon={false}>
                <Typography variant="caption">
                  The new amount will be distributed proportionally among {laborerPayments.length} laborers.
                </Typography>
              </Alert>
            )}
          </Box>

          {/* Laborer Breakdown - Collapsible */}
          {laborerPayments.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Button
                size="small"
                onClick={() => setShowLaborerBreakdown(!showLaborerBreakdown)}
                endIcon={showLaborerBreakdown ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                sx={{ mb: 1, textTransform: "none" }}
              >
                {showLaborerBreakdown ? "Hide" : "Show"} Laborer Breakdown ({laborerPayments.length})
              </Button>
              <Collapse in={showLaborerBreakdown}>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Laborer</TableCell>
                        <TableCell align="right">Current Amount</TableCell>
                        {amountChanged && <TableCell align="right">New Amount</TableCell>}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {laborerPayments.map((payment, index) => {
                        const currentTotal = laborerPayments.reduce((sum, p) => sum + p.amount, 0);
                        let newAmount = payment.amount;
                        if (amountChanged && currentTotal > 0) {
                          if (index === laborerPayments.length - 1) {
                            const allocatedSoFar = laborerPayments
                              .slice(0, -1)
                              .reduce((sum, p) => sum + Math.round(totalAmount * (p.amount / currentTotal)), 0);
                            newAmount = totalAmount - allocatedSoFar;
                          } else {
                            newAmount = Math.round(totalAmount * (payment.amount / currentTotal));
                          }
                        }
                        return (
                          <TableRow key={payment.id}>
                            <TableCell>
                              <Typography variant="body2">{payment.laborerName}</Typography>
                              {payment.laborerRole && (
                                <Typography variant="caption" color="text.secondary">
                                  {payment.laborerRole}
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell align="right">
                              {formatCurrency(payment.amount)}
                            </TableCell>
                            {amountChanged && (
                              <TableCell align="right" sx={{ color: "warning.main", fontWeight: 600 }}>
                                {formatCurrency(Math.max(0, newAmount))}
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600 }}>Total</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>
                          {formatCurrency(laborerPayments.reduce((sum, p) => sum + p.amount, 0))}
                        </TableCell>
                        {amountChanged && (
                          <TableCell align="right" sx={{ fontWeight: 600, color: "warning.main" }}>
                            {formatCurrency(totalAmount)}
                          </TableCell>
                        )}
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>
              </Collapse>
            </Box>
          )}

          {fetchingLaborers && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
              <CircularProgress size={16} />
              <Typography variant="caption" color="text.secondary">
                Loading laborer breakdown...
              </Typography>
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

          {/* Payer Source */}
          <Box sx={{ mb: 2 }}>
            <PayerSourceSplitInput
              value={payer}
              onChange={setPayer}
              total={totalAmount}
              siteId={selectedSite?.id}
              disabled={loading}
            />
            {(() => {
              const c = validatePayerSourceInput(payer, totalAmount);
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
            label="Notes"
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
                !validatePayerSourceInput(payer, totalAmount).ok
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
