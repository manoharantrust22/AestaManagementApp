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
  TextField,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Divider,
  Alert,
  CircularProgress,
  Chip,
  Paper,
} from "@mui/material";
import {
  Payment as PaymentIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  QrCode2 as QrCodeIcon,
} from "@mui/icons-material";
import { createClient } from "@/lib/supabase/client";
import PayerSourceSelector from "@/components/settlement/PayerSourceSelector";
import FileUploader, { UploadedFile } from "@/components/common/FileUploader";
import { BillPreviewButton } from "@/components/common/BillViewerDialog";
import BillVerificationDialog from "@/components/materials/BillVerificationDialog";
import SettlementVerificationPrompt, { useSettlementVerification } from "@/components/materials/SettlementVerificationPrompt";
import { useSettleMaterialPurchase } from "@/hooks/queries/useMaterialPurchases";
import { useRecordAdvancePayment } from "@/hooks/queries/usePurchaseOrders";
import { useVerifyBill } from "@/hooks/queries/useBillVerification";
import { useAuth } from "@/contexts/AuthContext";
import type { MaterialPurchaseExpenseWithDetails, MaterialPaymentMode, PurchaseOrderWithDetails } from "@/types/material.types";
import type { PayerSource } from "@/types/settlement.types";
import { formatCurrency, formatDate } from "@/lib/formatters";

interface MaterialSettlementDialogProps {
  open: boolean;
  purchase?: MaterialPurchaseExpenseWithDetails | null;
  purchaseOrder?: PurchaseOrderWithDetails | null;
  onClose: () => void;
  onSuccess?: () => void;
}

const PAYMENT_MODES: { value: MaterialPaymentMode; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cheque", label: "Cheque" },
];

export default function MaterialSettlementDialog({
  open,
  purchase,
  purchaseOrder,
  onClose,
  onSuccess,
}: MaterialSettlementDialogProps) {
  const supabase = createClient();
  const { user } = useAuth();
  const settleMutation = useSettleMaterialPurchase();
  const advancePaymentMutation = useRecordAdvancePayment();
  const verifyBillMutation = useVerifyBill();

  // Bill verification workflow
  const {
    showPrompt: showVerificationPrompt,
    setShowPrompt: setShowVerificationPrompt,
    verificationConfirmed,
    showVerificationDialog,
    setShowVerificationDialog,
    checkVerification,
    handleProceed: handleVerificationProceed,
    handleVerify,
    handleVerificationComplete,
    handleSkip,
    resetVerification,
  } = useSettlementVerification();

  // Determine if this is a PO advance payment or expense settlement
  const isPOAdvancePayment = !!purchaseOrder && !purchase;

  // Get the effective PO (either passed directly or from purchase)
  const effectivePO = purchaseOrder || purchase?.purchase_order;
  const hasBill = !!effectivePO?.vendor_bill_url;
  const billVerified = !!effectivePO?.bill_verified;

  // Form state
  const [settlementDate, setSettlementDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [paymentMode, setPaymentMode] = useState<MaterialPaymentMode>("upi");
  const [payerSource, setPayerSource] = useState<PayerSource>("own_money");
  const [payerName, setPayerName] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [billUrl, setBillUrl] = useState("");
  const [paymentScreenshotUrl, setPaymentScreenshotUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [amountPaid, setAmountPaid] = useState<string>(""); // Bargained amount

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      const record = purchase || purchaseOrder;
      // For expenses with linked PO, use PO's total_amount + transport_cost (which reflects pricing mode changes)
      const purchaseAmount = purchase?.purchase_order?.total_amount
        ? Number(purchase.purchase_order.total_amount) + Number(purchase.purchase_order.transport_cost || 0)
        : Number(record?.total_amount || 0) + (purchaseOrder ? Number(purchaseOrder.transport_cost || 0) : 0);

      setSettlementDate(new Date().toISOString().split("T")[0]);
      setPaymentMode("upi");
      setPayerSource("own_money");
      setPayerName("");
      setPaymentReference("");
      setBillUrl("");
      setPaymentScreenshotUrl("");
      setNotes("");
      setError("");
      setAmountPaid(purchaseAmount.toString()); // Initialize with original amount
      resetVerification(); // Reset bill verification state
    }
  }, [open, purchase, purchaseOrder, resetVerification]);

  const handleSubmit = async () => {
    // Validation
    if (!settlementDate) {
      setError("Please select a payment date");
      return;
    }

    // Validate amount paid
    const finalAmountPaid = Number(amountPaid);
    if (!finalAmountPaid || finalAmountPaid <= 0) {
      setError("Please enter a valid amount paid");
      return;
    }

    // Check bill verification before proceeding (only for non-advance payments)
    if (!isPOAdvancePayment && hasBill && !billVerified) {
      const canProceed = checkVerification(hasBill, billVerified);
      if (!canProceed) {
        return; // Will show verification prompt
      }
    }

    // Handle PO advance payment
    if (isPOAdvancePayment && purchaseOrder) {
      try {
        setError("");
        await advancePaymentMutation.mutateAsync({
          po_id: purchaseOrder.id,
          site_id: purchaseOrder.site_id,
          amount_paid: finalAmountPaid,
          payment_date: settlementDate,
          payment_mode: paymentMode,
          payment_reference: paymentReference || undefined,
          payment_screenshot_url: paymentScreenshotUrl || undefined,
          notes: notes || undefined,
        });

        onSuccess?.();
        onClose();
      } catch (err) {
        console.error("Advance payment recording failed:", err);
        setError("Failed to record advance payment. Please try again.");
      }
      return;
    }

    // Handle expense settlement
    if (!purchase) return;

    // Check if this is a group stock parent (vendor payment only)
    const isVendorPaymentOnly = purchase.purchase_type === "group_stock" && !purchase.original_batch_code;

    // Only validate payer source for non-vendor-only payments
    if (["custom", "other_site_money"].includes(payerSource) && !payerName.trim()) {
      setError("Please enter the payer name");
      return;
    }

    try {
      setError("");
      await settleMutation.mutateAsync({
        id: purchase.id,
        settlement_date: settlementDate,
        payment_mode: paymentMode,
        payer_source: payerSource,
        payer_name: payerName || undefined,
        payment_reference: paymentReference || undefined,
        bill_url: billUrl || undefined,
        payment_screenshot_url: paymentScreenshotUrl || undefined,
        notes: notes || undefined,
        amount_paid: finalAmountPaid,
        isVendorPaymentOnly,
      });

      onSuccess?.();
      onClose();
    } catch (err) {
      console.error("Settlement failed:", err);
      setError(isVendorPaymentOnly ? "Failed to record vendor payment. Please try again." : "Failed to settle purchase. Please try again.");
    }
  };

  // Handler for completing bill verification
  const handleBillVerified = async (notes?: string) => {
    if (!effectivePO?.id || !user?.id) return;

    try {
      await verifyBillMutation.mutateAsync({
        poId: effectivePO.id,
        userId: user.id,
        notes,
      });
      handleVerificationComplete();
    } catch (err) {
      console.error("Bill verification failed:", err);
      setError("Failed to verify bill. Please try again.");
    }
  };

  // Handler for when user confirms verification through prompt
  const handleVerificationProceedAndSubmit = () => {
    handleVerificationProceed();
    // Auto-submit after confirming verification
    setTimeout(() => {
      handleSubmit();
    }, 100);
  };

  if (!purchase && !purchaseOrder) return null;

  // Get details from either purchase or PO
  const record = purchase || purchaseOrder;
  // For expenses with linked PO, use PO's total_amount + transport_cost (which reflects pricing mode changes)
  const purchaseAmount = purchase?.purchase_order?.total_amount
    ? Number(purchase.purchase_order.total_amount) + Number(purchase.purchase_order.transport_cost || 0)
    : Number(record!.total_amount || 0) + (purchaseOrder ? Number(purchaseOrder.transport_cost || 0) : 0);
  const vendorName = record!.vendor?.name || (purchase?.vendor_name) || "Unknown Vendor";
  const vendorQrCodeUrl = record!.vendor?.qr_code_url || null;
  const vendorUpiId = record!.vendor?.upi_id || null;
  const refCode = purchase?.ref_code || purchaseOrder?.po_number || "";
  const dateField = purchase?.purchase_date || purchaseOrder?.order_date || "";

  const materialsText = record!.items && record!.items.length > 0
    ? record!.items.map((i: any) => i.material?.name || "Unknown").join(", ")
    : "Material purchase";

  // Check if this is a group stock parent (vendor payment only)
  const isGroupStockParent = purchase?.purchase_type === "group_stock" && !purchase.original_batch_code;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <PaymentIcon color={isPOAdvancePayment ? "warning" : isGroupStockParent ? "secondary" : "success"} />
        {isPOAdvancePayment ? "Record Advance Payment" : isGroupStockParent ? "Record Vendor Payment" : "Settle Material Purchase"}
      </DialogTitle>

      <DialogContent>
        {/* Purchase Summary */}
        <Box
          sx={{
            bgcolor: "background.default",
            p: 2,
            borderRadius: 1,
            mb: 3,
          }}
        >
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            {isPOAdvancePayment ? "Purchase Order Details" : "Purchase Details"}
          </Typography>
          <Typography variant="body2" fontWeight={600} fontFamily="monospace">
            {refCode}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {formatDate(dateField)} • {vendorName}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {materialsText}
          </Typography>
          <Typography variant="h5" color="primary" fontWeight={700} sx={{ mt: 1 }}>
            {formatCurrency(purchaseAmount)}
          </Typography>
        </Box>

        <Divider sx={{ mb: 2 }} />

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
            {error}
          </Alert>
        )}

        {/* Advance Payment Info Alert */}
        {isPOAdvancePayment && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Recording <strong>advance payment</strong> for this purchase order.
            Materials have not been delivered yet.
          </Alert>
        )}

        {/* Group Stock Info Alert */}
        {isGroupStockParent && (
          <Alert severity="info" sx={{ mb: 2 }}>
            This is a <strong>Group Stock</strong> purchase. Recording vendor payment here.
            Inter-site settlements will be handled separately in the Batches tab.
          </Alert>
        )}

        {/* Bill Verification Status */}
        {!isPOAdvancePayment && hasBill && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              p: 1.5,
              mb: 2,
              bgcolor: billVerified ? "success.lighter" : "warning.lighter",
              borderRadius: 1,
              border: 1,
              borderColor: billVerified ? "success.light" : "warning.light",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              {billVerified ? (
                <CheckCircleIcon color="success" fontSize="small" />
              ) : (
                <WarningIcon color="warning" fontSize="small" />
              )}
              <Typography variant="body2" component="span">
                Vendor Bill:{" "}
              </Typography>
              <Chip
                label={billVerified ? "Verified" : "Unverified"}
                color={billVerified ? "success" : "warning"}
                size="small"
                variant="outlined"
              />
            </Box>
            <BillPreviewButton
              billUrl={effectivePO?.vendor_bill_url || null}
              label="View"
              size="small"
            />
          </Box>
        )}

        {/* Vendor QR Code - Show prominently when payment mode is UPI */}
        {paymentMode === "upi" && (
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              mb: 2,
              bgcolor: "primary.50",
              borderColor: "primary.main",
            }}
          >
            <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
              {/* QR Code Display */}
              {vendorQrCodeUrl ? (
                <Box sx={{ textAlign: "center", flexShrink: 0 }}>
                  <Box
                    component="img"
                    src={vendorQrCodeUrl}
                    alt="Vendor Payment QR"
                    sx={{
                      width: 140,
                      height: 140,
                      objectFit: "contain",
                      borderRadius: 1,
                      border: "2px solid",
                      borderColor: "primary.main",
                      bgcolor: "white",
                      p: 0.5,
                    }}
                  />
                  <Typography
                    variant="caption"
                    color="primary.main"
                    fontWeight={600}
                    display="block"
                    sx={{ mt: 1 }}
                  >
                    Scan to Pay
                  </Typography>
                </Box>
              ) : (
                <Box
                  sx={{
                    width: 140,
                    height: 140,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 1,
                    border: "2px dashed",
                    borderColor: "grey.400",
                    bgcolor: "grey.100",
                    flexShrink: 0,
                  }}
                >
                  <QrCodeIcon sx={{ fontSize: 48, color: "grey.400" }} />
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                    No QR Code
                  </Typography>
                </Box>
              )}

              {/* Vendor Payment Details */}
              <Box sx={{ flex: 1 }}>
                <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                  Pay to: {vendorName}
                </Typography>
                {vendorUpiId ? (
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                      UPI ID:
                    </Typography>
                    <Typography
                      variant="body1"
                      fontWeight={600}
                      fontFamily="monospace"
                      sx={{
                        bgcolor: "grey.100",
                        px: 1,
                        py: 0.5,
                        borderRadius: 0.5,
                        display: "inline-block",
                        userSelect: "all",
                      }}
                    >
                      {vendorUpiId}
                    </Typography>
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    No UPI ID available
                  </Typography>
                )}

                {/* Amount to Pay - Emphasized */}
                <Box
                  sx={{
                    mt: 2,
                    p: 1.5,
                    bgcolor: "success.lighter",
                    borderRadius: 1,
                    border: "1px solid",
                    borderColor: "success.light",
                  }}
                >
                  <Typography variant="caption" color="success.dark">
                    Amount to Pay:
                  </Typography>
                  <Typography variant="h5" color="success.dark" fontWeight={700}>
                    {formatCurrency(Number(amountPaid) || purchaseAmount)}
                  </Typography>
                </Box>

                {/* No QR Code Alert */}
                {!vendorQrCodeUrl && !vendorUpiId && (
                  <Alert severity="info" sx={{ mt: 2 }} icon={false}>
                    <Typography variant="body2">
                      Add vendor&apos;s QR code in Vendor Management for easier payments.
                    </Typography>
                  </Alert>
                )}
              </Box>
            </Box>
          </Paper>
        )}

        {/* Editable Amount Field for Bargaining */}
        <Box
          sx={{
            bgcolor: "warning.lighter",
            border: "1px solid",
            borderColor: "warning.main",
            p: 2,
            borderRadius: 1,
            mb: 2,
          }}
        >
          <Typography variant="subtitle2" fontWeight={600} gutterBottom>
            Final Payment Amount
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
            Original Amount: {formatCurrency(purchaseAmount)} • You can enter a different amount after bargaining
          </Typography>
          <TextField
            label="Amount to Pay"
            type="number"
            value={amountPaid}
            onChange={(e) => setAmountPaid(e.target.value)}
            fullWidth
            size="small"
            placeholder={purchaseAmount.toString()}
            slotProps={{
              input: {
                startAdornment: <Typography sx={{ mr: 1, color: "text.secondary" }}>₹</Typography>,
              },
              inputLabel: { shrink: true },
            }}
            helperText="Enter the final amount you agreed to pay after bargaining"
          />
        </Box>

        {/* Payment Date */}
        <TextField
          label={isGroupStockParent ? "Payment Date" : "Settlement Date"}
          type="date"
          value={settlementDate}
          onChange={(e) => setSettlementDate(e.target.value)}
          fullWidth
          size="small"
          sx={{ mb: 2 }}
          slotProps={{ inputLabel: { shrink: true } }}
        />

        {/* Payment Mode */}
        <FormControl sx={{ mb: 2 }} fullWidth>
          <FormLabel sx={{ mb: 1, fontWeight: 600, fontSize: "0.875rem" }}>
            Payment Mode
          </FormLabel>
          <RadioGroup
            row
            value={paymentMode}
            onChange={(e) => setPaymentMode(e.target.value as MaterialPaymentMode)}
          >
            {PAYMENT_MODES.map((mode) => (
              <FormControlLabel
                key={mode.value}
                value={mode.value}
                control={<Radio size="small" />}
                label={mode.label}
              />
            ))}
          </RadioGroup>
        </FormControl>

        {/* Payer Source - only for regular expense settlements (not PO advance or group stock) */}
        {!isPOAdvancePayment && (
          <PayerSourceSelector
            value={payerSource}
            customName={payerName}
            onChange={setPayerSource}
            onCustomNameChange={setPayerName}
            compact
          />
        )}

        {/* Payment Reference */}
        <TextField
          label="Payment Reference"
          placeholder="UPI ID / Transaction ID / Cheque No."
          value={paymentReference}
          onChange={(e) => setPaymentReference(e.target.value)}
          fullWidth
          size="small"
          sx={{ mb: 2 }}
        />

        <Divider sx={{ mb: 2 }} />

        {/* File Uploads */}
        <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>
          Attachments (Optional)
        </Typography>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mb: 2 }}>
          <FileUploader
            supabase={supabase}
            bucketName="documents"
            folderPath={`settlements/${record!.site_id}`}
            fileNamePrefix="bill"
            accept="all"
            label="Vendor Bill"
            helperText="Upload bill/invoice from vendor"
            uploadOnSelect
            value={billUrl ? { name: "bill", size: 0, url: billUrl } : null}
            onUpload={(file: UploadedFile) => setBillUrl(file.url)}
            onRemove={() => setBillUrl("")}
            compact
          />

          <FileUploader
            supabase={supabase}
            bucketName="documents"
            folderPath={`settlements/${record!.site_id}`}
            fileNamePrefix="payment-proof"
            accept="image"
            label={paymentMode === "upi" ? "UPI Payment Screenshot" : "Payment Proof"}
            helperText={
              paymentMode === "upi"
                ? "Upload screenshot after scanning QR code and completing payment"
                : "UPI screenshot / Bank statement"
            }
            uploadOnSelect
            value={
              paymentScreenshotUrl
                ? { name: "payment-proof", size: 0, url: paymentScreenshotUrl }
                : null
            }
            onUpload={(file: UploadedFile) => setPaymentScreenshotUrl(file.url)}
            onRemove={() => setPaymentScreenshotUrl("")}
            compact
          />
        </Box>

        {/* Notes */}
        <TextField
          label="Notes"
          placeholder="Any additional notes..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          fullWidth
          size="small"
          multiline
          rows={2}
        />
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={settleMutation.isPending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color={isPOAdvancePayment ? "warning" : isGroupStockParent ? "secondary" : "success"}
          onClick={handleSubmit}
          disabled={settleMutation.isPending || advancePaymentMutation.isPending}
          startIcon={
            (settleMutation.isPending || advancePaymentMutation.isPending) ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <PaymentIcon />
            )
          }
        >
          {(settleMutation.isPending || advancePaymentMutation.isPending)
            ? (isPOAdvancePayment ? "Recording..." : isGroupStockParent ? "Recording..." : "Settling...")
            : (isPOAdvancePayment ? "Confirm Advance Payment" : isGroupStockParent ? "Confirm Vendor Payment" : "Confirm Settlement")}
        </Button>
      </DialogActions>

      {/* Verification Prompt - shown when settling with unverified bill */}
      <SettlementVerificationPrompt
        open={showVerificationPrompt}
        onClose={() => setShowVerificationPrompt(false)}
        purchaseOrder={effectivePO || null}
        purchase={purchase}
        onProceed={handleVerificationProceedAndSubmit}
        onVerify={handleVerify}
        onSkip={() => {
          handleSkip();
          // Auto-submit after skipping
          setTimeout(() => {
            handleSubmit();
          }, 100);
        }}
        isSettling={settleMutation.isPending}
      />

      {/* Bill Verification Dialog - side-by-side comparison (only when full PO is available) */}
      {purchaseOrder && (
        <BillVerificationDialog
          open={showVerificationDialog}
          onClose={() => setShowVerificationDialog(false)}
          purchaseOrder={purchaseOrder}
          onVerified={handleBillVerified}
          isVerifying={verifyBillMutation.isPending}
        />
      )}
    </Dialog>
  );
}
