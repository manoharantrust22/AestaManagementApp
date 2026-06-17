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
  InputLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Select,
  MenuItem,
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
  AccountBalanceWallet as WalletIcon,
} from "@mui/icons-material";
import { createClient } from "@/lib/supabase/client";
import PayerSourceSplitInput from "@/components/settlement/PayerSourceSplitInput";
import SubcontractLinkSelector from "@/components/payments/SubcontractLinkSelector";
import {
  toRpcArgs,
  validatePayerSourceInput,
} from "@/lib/settlement/payerSource";
import {
  ReceiptCapture,
  type ReceiptCaptureValue,
} from "@/components/common/ReceiptCapture";
import { BillPreviewButton } from "@/components/common/BillViewerDialog";
import BillVerificationDialog from "@/components/materials/BillVerificationDialog";
import SettlementVerificationPrompt, { useSettlementVerification } from "@/components/materials/SettlementVerificationPrompt";
import { useSettleMaterialPurchase } from "@/hooks/queries/useMaterialPurchases";
import { useRecordAdvancePayment } from "@/hooks/queries/usePurchaseOrders";
import { useVerifyBill } from "@/hooks/queries/useBillVerification";
import { useSiteGroupMembership } from "@/hooks/queries/useSiteGroups";
import { useEngineerWalletBalance, useLatestDepositSource } from "@/hooks/queries/useEngineerWalletV2";
import { usePayerSources } from "@/hooks/queries/usePayerSources";
import { useAuth } from "@/contexts/AuthContext";
import { useSite } from "@/contexts/SiteContext";
import type { MaterialPurchaseExpenseWithDetails, MaterialPaymentMode, PurchaseOrderWithDetails } from "@/types/material.types";
import type { PayerSource, PayerSourceInput, PayerSourceSplitRow } from "@/types/settlement.types";
import { normalizeImageUrl } from "@/lib/utils/storageUrl";
import { formatCurrency, formatDate } from "@/lib/formatters";

interface MaterialSettlementDialogProps {
  open: boolean;
  purchase?: MaterialPurchaseExpenseWithDetails | null;
  purchaseOrder?: PurchaseOrderWithDetails | null;
  onClose: () => void;
  onSuccess?: () => void;
  /** Site whose payer sources should be offered (the viewing site when opened
   *  from the Hub). Without it a group PO falls back to the PO's originating
   *  site, surfacing another site's sources. */
  siteId?: string;
}

const PAYMENT_MODES: { value: MaterialPaymentMode; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cheque", label: "Cheque" },
];

/** Reverse of `toRpcArgs`: rebuild a PayerSourceInput from the columns stored on
 *  a settled expense, so the edit dialog opens with the original payer pre-filled. */
function payerInputFromExpense(p: {
  settlement_payer_source?: string | null;
  settlement_payer_name?: string | null;
  payer_source_split?: Array<{ source: string; name?: string; amount: number }> | null;
}): PayerSourceInput {
  const split = p.payer_source_split;
  if (Array.isArray(split) && split.length > 0) {
    return { mode: "split", rows: split as PayerSourceSplitRow[] };
  }
  return {
    mode: "single",
    source: (p.settlement_payer_source as PayerSource) || "own_money",
    ...(p.settlement_payer_name ? { name: p.settlement_payer_name } : {}),
  };
}

export default function MaterialSettlementDialog({
  open,
  purchase,
  purchaseOrder,
  onClose,
  onSuccess,
  siteId,
}: MaterialSettlementDialogProps) {
  const supabase = createClient();
  const { user, userProfile } = useAuth();
  const { selectedSite } = useSite();
  const isSiteEngineer = userProfile?.role === "site_engineer";
  const engineerId = userProfile?.id || "";

  const settleMutation = useSettleMaterialPurchase();
  const advancePaymentMutation = useRecordAdvancePayment();
  const verifyBillMutation = useVerifyBill();

  // Group membership — used to let user pick any group site as the payer
  const { data: groupMembership } = useSiteGroupMembership(purchase?.site_id);

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

  // EDIT mode: correcting an already-settled expense (opened from the Hub's
  // settlement "Correct" menu). Pre-fills the form and routes the save through
  // the edit-safe path (existing ref preserved, no wallet re-post). For a
  // wallet-paid row we lock the amount & payer to protect wallet integrity —
  // those must be reversed on the canonical page instead.
  const isEditMode = !!purchase?.is_paid;
  const isWalletPaidRow = purchase?.payment_channel === "engineer_wallet";
  const lockAmountPayer = isEditMode && isWalletPaidRow;

  // Detect group_stock PO so we can show "Complete Settlement" instead of "Advance Payment"
  const poNotes = (() => {
    try {
      const n = (purchaseOrder as any)?.internal_notes;
      return typeof n === "string" ? JSON.parse(n) : n;
    } catch { return null; }
  })();
  const isGroupStockAdvancePO = isPOAdvancePayment && poNotes?.is_group_stock === true;

  // Get the effective PO (either passed directly or from purchase)
  const effectivePO = purchaseOrder || purchase?.purchase_order;
  const hasBill = !!effectivePO?.vendor_bill_url;
  const billVerified = !!effectivePO?.bill_verified;

  // Form state
  const [settlementDate, setSettlementDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [paymentMode, setPaymentMode] = useState<MaterialPaymentMode>("upi");
  // Phase 4: PayerSourceInput supports both single-source and 2-3-row split mode.
  // Replaces the legacy { payerSource, payerName } pair.
  const [payer, setPayer] = useState<PayerSourceInput>({
    mode: "single",
    source: "own_money",
  });
  const [paymentReference, setPaymentReference] = useState("");
  const [bill, setBill] = useState<ReceiptCaptureValue | null>(null);
  const [screenshot, setScreenshot] = useState<ReceiptCaptureValue | null>(null);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [amountPaid, setAmountPaid] = useState<string>(""); // Bargained amount
  const [payingSiteId, setPayingSiteId] = useState<string>("");
  // Optional subcontract this material was bought under. null = unlinked.
  const [subcontractId, setSubcontractId] = useState<string | null>(null);

  // Wallet hooks — keyed to the currently selected paying site so the balance
  // updates whenever the engineer switches the paying site selector.
  const effectiveWalletSiteId = payingSiteId || selectedSite?.id || "";
  const balanceQuery = useEngineerWalletBalance(
    isSiteEngineer ? engineerId : undefined,
    isSiteEngineer ? effectiveWalletSiteId : undefined
  );
  const depositSourceQuery = useLatestDepositSource(
    isSiteEngineer ? engineerId : undefined,
    isSiteEngineer ? effectiveWalletSiteId : undefined
  );
  const payerSourcesQuery = usePayerSources(isSiteEngineer ? effectiveWalletSiteId : undefined);

  const walletBalance = balanceQuery.data?.balance ?? 0;
  const lifoSource = depositSourceQuery.data?.payer_source ?? "own_money";
  const walletSourceLabel =
    payerSourcesQuery.data?.find((s) => s.key === lifoSource)?.label ??
    lifoSource.replace(/_/g, " ");

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      const record = purchase || purchaseOrder;
      // total_amount now includes transport_cost (after backfill migration)
      const purchaseAmount = purchase?.purchase_order?.total_amount
        ? Number(purchase.purchase_order.total_amount)
        : Number(record?.total_amount || 0);

      if (isEditMode && purchase) {
        // Pre-fill from the existing settlement so the user edits in place.
        const existingDate = purchase.settlement_date || purchase.paid_date || "";
        setSettlementDate(
          existingDate
            ? existingDate.split("T")[0]
            : new Date().toISOString().split("T")[0]
        );
        setPaymentMode((purchase.payment_mode as MaterialPaymentMode) || "upi");
        setPayer(payerInputFromExpense(purchase));
        setPaymentReference(purchase.payment_reference || "");
        setBill(
          purchase.bill_url
            ? { url: normalizeImageUrl(purchase.bill_url), storage_path: "" }
            : null
        );
        setScreenshot(
          purchase.payment_screenshot_url
            ? { url: normalizeImageUrl(purchase.payment_screenshot_url), storage_path: "" }
            : null
        );
        setNotes(purchase.notes || "");
        setError("");
        setAmountPaid(String(purchase.amount_paid ?? purchaseAmount));
        setPayingSiteId(purchase.paying_site_id || purchase.site_id || "");
        setSubcontractId(purchase.subcontract_id ?? null);
        resetVerification();
        return;
      }

      setSettlementDate(new Date().toISOString().split("T")[0]);
      setPaymentMode(isSiteEngineer ? "cash" : "upi");
      setPayer({ mode: "single", source: "own_money" });
      setPaymentReference("");
      setBill(null);
      setScreenshot(null);
      setNotes("");
      setError("");
      setAmountPaid(purchaseAmount.toString());
      setPayingSiteId(purchase?.paying_site_id || purchase?.site_id || "");
      setSubcontractId(purchase?.subcontract_id ?? null);
      resetVerification();
    }
  }, [open, purchase, purchaseOrder, resetVerification, isEditMode, isSiteEngineer]);

  // Auto-apply LIFO payer source for engineer whenever wallet data (re-)loads,
  // including when the paying site selector changes. Always resets to
  // single-source mode (engineers never see the split UI — wallet attribution
  // is derived from deposit pools in Phase 2/3).
  useEffect(() => {
    if (isSiteEngineer && depositSourceQuery.data?.payer_source) {
      setPayer({
        mode: "single",
        source: depositSourceQuery.data.payer_source as PayerSource,
      });
    }
  }, [isSiteEngineer, depositSourceQuery.data?.payer_source]);

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

    // Check bill verification before proceeding (only for non-advance, non-edit
    // payments — editing an already-settled row should not re-prompt).
    if (!isPOAdvancePayment && !isEditMode && hasBill && !billVerified) {
      const canProceed = checkVerification(hasBill, billVerified);
      if (!canProceed) {
        return; // Will show verification prompt
      }
    }

    // Handle PO advance payment
    if (isPOAdvancePayment && purchaseOrder) {
      // Validate + normalize payer source. Engineers pass their auto LIFO single
      // source; admin/office pass whatever they picked (single or split).
      const advancePayerCheck = validatePayerSourceInput(payer, finalAmountPaid);
      if (!advancePayerCheck.ok) {
        setError(advancePayerCheck.reason);
        return;
      }
      const advancePayerRpc = toRpcArgs(payer);

      try {
        setError("");

        await advancePaymentMutation.mutateAsync({
          po_id: purchaseOrder.id,
          site_id: purchaseOrder.site_id,
          amount_paid: finalAmountPaid,
          payment_date: settlementDate,
          payment_mode: paymentMode,
          payment_reference: paymentReference || undefined,
          payment_screenshot_url: screenshot?.url || undefined,
          notes: notes || undefined,
          payer_source: advancePayerRpc.p_payer_source as PayerSource | "split",
          payer_name: advancePayerRpc.p_payer_name || undefined,
          payer_source_split: advancePayerRpc.p_payer_source_split,
          subcontract_id: subcontractId,
          is_complete: isGroupStockAdvancePO,
          actor_is_site_engineer: isSiteEngineer,
          // Pass wallet fields so EVERY site-engineer settlement debits the
          // engineer wallet — NOT just group_stock. Own-site advances used to be
          // gated behind isGroupStockAdvancePO, so they fell through to
          // payment_channel="direct" with no recordSpend() and never showed in
          // My Wallet (the Fly Ash ₹6,900 bug). The group-stock-only fields
          // (site_group_id / paying_site_id) are null-safe for own-site POs.
          ...(isSiteEngineer && engineerId && effectiveWalletSiteId ? {
            engineer_id: engineerId,
            wallet_site_id: effectiveWalletSiteId,
            recorded_by_user_id: engineerId,
            recorded_by_name: userProfile?.name || user?.email || "Unknown",
            site_group_id: (purchaseOrder as any).site_group_id || poNotes?.site_group_id || null,
            paying_site_id: poNotes?.payment_source_site_id || effectiveWalletSiteId,
          } : {}),
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

    // Phase 4: unified validation (covers single-source custom-name AND
    // split sum/keys/length). Splits aren't surfaced to engineers — the
    // PayerSourceSplitInput is hidden when isSiteEngineer is true, so this
    // branch only sees split mode for admin/office users.
    const payerCheck = validatePayerSourceInput(payer, finalAmountPaid);
    if (!payerCheck.ok) {
      setError(payerCheck.reason);
      return;
    }
    const payerRpc = toRpcArgs(payer);

    // Editing never re-posts the wallet (that would double-debit) — corrections
    // to wallet-paid rows are limited to metadata (date/images/mode/ref/notes).
    const useWallet =
      !isEditMode && isSiteEngineer && engineerId && effectiveWalletSiteId;

    try {
      setError("");
      await settleMutation.mutateAsync({
        id: purchase.id,
        settlement_date: settlementDate,
        payment_mode: paymentMode,
        // EDIT mode: preserve the existing ref + pass the prior amount as the
        // inventory-adjustment baseline so a re-edit transitions by the delta.
        existing_settlement_reference: isEditMode
          ? purchase.settlement_reference ?? undefined
          : undefined,
        previous_amount_paid: isEditMode
          ? purchase.amount_paid != null
            ? Number(purchase.amount_paid)
            : undefined
          : undefined,
        // For this domain the legacy single-source column is
        // `settlement_payer_source` on material_purchase_expenses (not
        // `payer_source`). The mutation hook maps `payer_source` -> that
        // column internally, so we keep the field name here. When `payer`
        // is in split mode `p_payer_source` is the literal "split" sentinel.
        payer_source: payerRpc.p_payer_source as PayerSource | "split",
        payer_name: payerRpc.p_payer_name || undefined,
        payer_source_split: payerRpc.p_payer_source_split,
        subcontract_id: subcontractId,
        payment_reference: paymentReference || undefined,
        bill_url: bill?.url || undefined,
        payment_screenshot_url: screenshot?.url || undefined,
        notes: notes || undefined,
        amount_paid: finalAmountPaid,
        isVendorPaymentOnly,
        paying_site_id: isGroupStockParent && payingSiteId ? payingSiteId : undefined,
        // A fresh engineer settlement must be wallet-paid (edits skip re-post).
        enforce_engineer_wallet: isSiteEngineer && !isEditMode,
        ...(useWallet
          ? {
              payment_channel: "engineer_wallet" as const,
              engineer_id: engineerId,
              wallet_site_id: effectiveWalletSiteId,
              recorded_by_user_id: engineerId,
              recorded_by_name: userProfile?.name || user?.email || "Unknown",
              wallet_description: `Material payment: ${vendorName} (${refCode})`,
            }
          : {}),
      });

      onSuccess?.();
      onClose();
    } catch (err) {
      console.error("Settlement failed:", err);
      const msg = err instanceof Error ? err.message : undefined;
      setError(
        msg ??
          (isVendorPaymentOnly
            ? "Failed to record vendor payment. Please try again."
            : "Failed to settle purchase. Please try again."),
      );
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
  // total_amount includes transport_cost (backfilled for old records, built-in for new)
  const purchaseAmount = purchase?.purchase_order?.total_amount
    ? Number(purchase.purchase_order.total_amount)
    : Number(record!.total_amount || 0);
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
    <Dialog open={open} onClose={(_event, reason) => { if (reason !== "backdropClick") onClose(); }} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <PaymentIcon color={isEditMode ? "primary" : isGroupStockAdvancePO ? "success" : isPOAdvancePayment ? "warning" : isGroupStockParent ? "secondary" : "success"} />
        {isEditMode ? "Edit Settlement" : isGroupStockAdvancePO ? "Complete Bulk Settlement" : isPOAdvancePayment ? "Record Advance Payment" : isGroupStockParent ? "Record Vendor Payment" : "Settle Material Purchase"}
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

        {/* Direct-PO payment alert — wording follows the PO's delivery state
            (same status field the Hub stepper reads) so a fully delivered
            order never claims "not delivered yet". */}
        {isPOAdvancePayment &&
          (purchaseOrder?.status === "delivered" ? (
            <Alert severity="info" sx={{ mb: 2 }}>
              Materials for this order have been <strong>delivered</strong>.
              Recording the final vendor payment.
            </Alert>
          ) : purchaseOrder?.status === "partial_delivered" ? (
            <Alert severity="info" sx={{ mb: 2 }}>
              Materials are <strong>partially delivered</strong>. Recording
              vendor payment for this order.
            </Alert>
          ) : (
            <Alert severity="warning" sx={{ mb: 2 }}>
              Recording <strong>advance payment</strong> for this purchase order.
              Materials have not been delivered yet.
            </Alert>
          ))}

        {/* Cross-site banner: consumer site settling on behalf of another payer site */}
        {isGroupStockParent && purchase && selectedSite && purchase.site_id !== selectedSite.id && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            You are recording this payment on behalf of{" "}
            <strong>{purchase.paying_site?.name || "another site"}</strong>. Use the
            <strong> Paying site</strong> selector below if your site is actually paying instead.
          </Alert>
        )}

        {/* Group Stock Info Alert + Paying Site Picker */}
        {isGroupStockParent && (
          <>
            <Alert severity="info" sx={{ mb: 2 }}>
              This is a <strong>Group Stock</strong> purchase. Recording vendor payment here.
              Inter-site settlements will be handled separately in the Batches tab.
            </Alert>
            {groupMembership?.isInGroup && groupMembership.allSites && groupMembership.allSites.length > 1 && (
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>Paying site</InputLabel>
                <Select
                  value={payingSiteId}
                  onChange={(e) => setPayingSiteId(e.target.value)}
                  label="Paying site"
                  size="small"
                >
                  {groupMembership.allSites.map((site) => (
                    <MenuItem key={site.id} value={site.id}>
                      {site.name}
                      {site.id === purchase?.site_id ? " (original)" : ""}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </>
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
          {lockAmountPayer && (
            <Alert severity="info" sx={{ mb: 1.5 }}>
              This settlement was paid from an engineer wallet. The amount and
              payer can&apos;t be changed here — reverse it on the settlement
              page to re-pay. You can still fix the date, images, mode and notes.
            </Alert>
          )}
          <TextField
            label="Amount to Pay"
            type="number"
            value={amountPaid}
            onChange={(e) => setAmountPaid(e.target.value)}
            disabled={lockAmountPayer}
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

        {/* Payment Mode — engineers are locked to wallet; admins see full selector */}
        {isSiteEngineer ? (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              gap: 1,
              mb: 2,
              p: 1.5,
              bgcolor: "primary.50",
              border: "1px solid",
              borderColor: "primary.light",
              borderRadius: 1,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
              <WalletIcon fontSize="small" color="primary" />
              <Typography variant="subtitle2" fontWeight={600}>
                Payment via Engineer Wallet
              </Typography>
            </Box>
            {balanceQuery.isLoading ? (
              <CircularProgress size={20} />
            ) : (
              <>
                {(() => {
                  const paying = Number(amountPaid) || purchaseAmount;
                  const remaining = walletBalance - paying;
                  const isShort = walletBalance < paying;
                  const deficit = paying - walletBalance;
                  return (
                    <>
                      <Box display="flex" justifyContent="space-between">
                        <Typography variant="body2" color="text.secondary">Wallet balance</Typography>
                        <Typography variant="body2" fontWeight={600} color={isShort ? "warning.main" : "success.main"}>
                          ₹{walletBalance.toLocaleString("en-IN")}
                        </Typography>
                      </Box>
                      {depositSourceQuery.data?.payer_source && (
                        <Box display="flex" justifyContent="space-between">
                          <Typography variant="body2" color="text.secondary">Funded by</Typography>
                          <Typography variant="body2">{walletSourceLabel}</Typography>
                        </Box>
                      )}
                      <Box display="flex" justifyContent="space-between">
                        <Typography variant="body2" color="text.secondary">After this payment</Typography>
                        <Typography variant="body2" fontWeight={600} color={remaining < 0 ? "warning.main" : "text.primary"}>
                          ₹{remaining.toLocaleString("en-IN")}
                        </Typography>
                      </Box>
                      {isShort && (
                        <Alert severity="warning" sx={{ mt: 0.5 }}>
                          Wallet will go negative by ₹{deficit.toLocaleString("en-IN")} — office will owe you this amount until next deposit
                        </Alert>
                      )}
                      {!depositSourceQuery.data?.payer_source && !depositSourceQuery.isLoading && (
                        <Alert severity="warning" sx={{ mt: 0.5 }}>
                          No wallet deposit found — ask admin to add funds
                        </Alert>
                      )}
                    </>
                  );
                })()}
              </>
            )}
          </Box>
        ) : (
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
        )}

        {/* Payer Source — shown for all admin/office settlements (regular, advance,
            and bulk). Engineers are auto-attributed via wallet LIFO and never see
            this UI, so do NOT re-add an !isPOAdvancePayment gate here. */}
        {!isSiteEngineer && (
          <Box sx={{ mb: 2 }}>
            <PayerSourceSplitInput
              value={payer}
              onChange={setPayer}
              total={Number(amountPaid) || purchaseAmount}
              siteId={
                payingSiteId ||
                siteId ||
                purchase?.site_id ||
                purchaseOrder?.site_id ||
                selectedSite?.id
              }
              disabled={settleMutation.isPending || advancePaymentMutation.isPending || lockAmountPayer}
            />
            {(() => {
              const c = validatePayerSourceInput(
                payer,
                Number(amountPaid) || purchaseAmount,
              );
              return !c.ok && payer.mode === "split" ? (
                <Typography variant="caption" color="error.main" sx={{ display: "block", mt: 0.5 }}>
                  {c.reason}
                </Typography>
              ) : null;
            })()}
          </Box>
        )}

        {/* Link to subcontract (optional). Some materials are bought under a
            subcontract; linking makes the amount count toward that contract's
            spend and surfaces it under the subcontract on /site/expenses. */}
        <Box sx={{ mb: 2 }}>
          <FormLabel sx={{ mb: 1, display: "block", fontWeight: 600, fontSize: "0.875rem" }}>
            Link to subcontract (optional)
          </FormLabel>
          <SubcontractLinkSelector
            selectedSubcontractId={subcontractId}
            onSelect={setSubcontractId}
            paymentAmount={Number(amountPaid) || purchaseAmount}
            disabled={settleMutation.isPending || advancePaymentMutation.isPending}
          />
        </Box>

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

        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, mb: 2 }}>
          <ReceiptCapture
            label="Bill image (optional)"
            value={bill}
            onChange={setBill}
            folder={`bills/${record!.site_id}`}
            disabled={settleMutation.isPending || advancePaymentMutation.isPending}
          />
          <ReceiptCapture
            label="Payment screenshot (optional)"
            value={screenshot}
            onChange={setScreenshot}
            folder={`screenshots/${record!.site_id}`}
            disabled={settleMutation.isPending || advancePaymentMutation.isPending}
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
          disabled={
            settleMutation.isPending ||
            advancePaymentMutation.isPending ||
            (isSiteEngineer && (balanceQuery.isLoading || !depositSourceQuery.data?.payer_source)) ||
            // Block submit when split mode is currently invalid (sum mismatch,
            // missing custom-name, duplicate sources, etc.). Single-source
            // failures still surface as inline alerts on submit.
            (!isSiteEngineer &&
              payer.mode === "split" &&
              !validatePayerSourceInput(
                payer,
                Number(amountPaid) || purchaseAmount,
              ).ok)
          }
          startIcon={
            (settleMutation.isPending || advancePaymentMutation.isPending) ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <PaymentIcon />
            )
          }
        >
          {(settleMutation.isPending || advancePaymentMutation.isPending)
            ? (isEditMode ? "Saving..." : isGroupStockAdvancePO ? "Processing..." : isPOAdvancePayment ? "Recording..." : isGroupStockParent ? "Recording..." : "Settling...")
            : (isEditMode ? "Save Changes" : isGroupStockAdvancePO ? "Confirm Full Settlement" : isPOAdvancePayment ? "Confirm Advance Payment" : isGroupStockParent ? "Confirm Vendor Payment" : "Confirm Settlement")}
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
