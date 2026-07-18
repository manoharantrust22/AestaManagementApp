"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  Box,
  Typography,
  IconButton,
  InputAdornment,
  Alert,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Paper,
  Chip,
  Divider,
  Collapse,
  FormControlLabel,
  Switch,
  Checkbox,
  Stack,
} from "@mui/material";
import {
  Close as CloseIcon,
  Check as CheckIcon,
  Warning as WarningIcon,
  PhotoCamera as CameraIcon,
  Delete as DeleteIcon,
  Inventory as InventoryIcon,
} from "@mui/icons-material";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useRecordAndVerifyDelivery } from "@/hooks/queries/usePurchaseOrders";
import { createClient } from "@/lib/supabase/client";
import FileUploader, { UploadedFile } from "@/components/common/FileUploader";
import type {
  PurchaseOrderWithDetails,
  DeliveryItemFormData,
  DeliveryDiscrepancy,
} from "@/types/material.types";
import { formatCurrency } from "@/lib/formatters";
import {
  extractGstFromGross,
  addGstToNet,
  weightVariancePct,
  isLargeWeightVariance,
  WEIGHT_VARIANCE_WARN_PCT,
} from "@/lib/weightCalculation";

interface RecordAndVerifyDeliveryDialogProps {
  open: boolean;
  onClose: () => void;
  purchaseOrder: PurchaseOrderWithDetails | null;
  siteId: string;
}

interface DeliveryItemRow extends DeliveryItemFormData {
  materialName?: string;
  unit?: string;
  /** Area materials: the slab sizes from the PO line. Display only. */
  sizeNote?: string;
  orderedQty: number;
  pendingQty: number;
  pricing_mode?: "per_piece" | "per_kg";
  calculated_weight?: number | null;
  actual_weight?: number | null;
  tax_rate?: number | null;
  // Issue tracking
  hasIssue?: boolean;
  issueType?: "damaged" | "missing" | "wrong_spec" | "short";
}

interface InspectionChecklist {
  qualityOk: boolean;
  quantityMatches: boolean;
  noDamage: boolean;
  specsCorrect: boolean;
}

export default function RecordAndVerifyDeliveryDialog({
  open,
  onClose,
  purchaseOrder,
  siteId,
}: RecordAndVerifyDeliveryDialogProps) {
  const isMobile = useIsMobile();
  const supabase = createClient();

  const recordAndVerify = useRecordAndVerifyDelivery();

  // Form state
  const [error, setError] = useState("");
  const [deliveryDate, setDeliveryDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [showAdditionalDetails, setShowAdditionalDetails] = useState(false);
  const [challanNumber, setChallanNumber] = useState("");
  const [challanDate, setChallanDate] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [challanUrl, setChallanUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<DeliveryItemRow[]>([]);

  // Weight-based (TMT) yellow-bill capture
  // editRate: rate/kg is read-only by default (it was agreed at PO time); the
  // engineer can opt in to correct it in the rare case the vendor changed it.
  const [editRate, setEditRate] = useState(false);
  // billTotal: editable gross total to absorb handling/rounding on the bill.
  const [billTotal, setBillTotal] = useState("");
  // TMT bills are gross/inclusive of GST by default.
  const [billIncludesGst, setBillIncludesGst] = useState(true);

  // Photos (required for unified flow)
  const [photos, setPhotos] = useState<UploadedFile[]>([]);

  // Inspection checklist
  const [inspectionChecklist, setInspectionChecklist] =
    useState<InspectionChecklist>({
      qualityOk: true,
      quantityMatches: true,
      noDamage: true,
      specsCorrect: true,
    });

  // Reset form when PO changes
  useEffect(() => {
    if (!open) return;

    if (purchaseOrder?.items) {
      const isBatchDelivery = purchaseOrder.status === 'partial_delivered';
      const deliveryItems: DeliveryItemRow[] = purchaseOrder.items
        .filter((item) => {
          const pending = item.quantity - (item.received_qty || 0);
          return pending > 0;
        })
        .map((item) => {
          const pendingQty = item.quantity - (item.received_qty || 0);
          // For batch deliveries (partial_delivered), start at 0 so engineer enters
          // only today's batch qty rather than accidentally submitting full pending
          const defaultReceivedQty = isBatchDelivery ? 0 : pendingQty;
          // Weight-based (TMT): pre-seed this installment's weight from the PO
          // estimate (est kg/pc × qty arriving) so the field starts close to reality;
          // the engineer overwrites it with the exact figure from the yellow bill.
          const estPerPiece =
            item.calculated_weight && item.quantity
              ? item.calculated_weight / item.quantity
              : null;
          const seedActualWeight =
            item.pricing_mode === "per_kg" && estPerPiece
              ? Number((defaultReceivedQty * estPerPiece).toFixed(3))
              : null;
          return {
          po_item_id: item.id,
          material_id: item.material_id,
          brand_id: item.brand_id || undefined,
          ordered_qty: item.quantity,
          received_qty: defaultReceivedQty,
          accepted_qty: defaultReceivedQty,
          rejected_qty: 0,
          unit_price: item.unit_price,
          materialName: item.material?.name,
          unit: item.material?.unit,
          // Area materials: the slab sizes bought, so the engineer can check the
          // pieces against the order. Read-only here — sizes are set at the PO.
          sizeNote: item.notes || undefined,
          orderedQty: item.quantity,
          pendingQty: item.quantity - (item.received_qty || 0),
          pricing_mode: item.pricing_mode,
          calculated_weight: item.calculated_weight,
          actual_weight: seedActualWeight,
          tax_rate: item.tax_rate,
          hasIssue: false,
          issueType: undefined,
        };
        });
      setItems(deliveryItems);
    } else {
      setItems([]);
    }

    setDeliveryDate(
      purchaseOrder?.order_date || new Date().toISOString().split("T")[0]
    );
    setShowAdditionalDetails(false);
    setChallanNumber("");
    setChallanDate("");
    setChallanUrl(null);
    setVehicleNumber("");
    setDriverName("");
    setDriverPhone("");
    setNotes("");
    setError("");
    setPhotos([]);
    setEditRate(false);
    setBillTotal("");
    setBillIncludesGst(true);
    setInspectionChecklist({
      qualityOk: true,
      quantityMatches: true,
      noDamage: true,
      specsCorrect: true,
    });
  }, [purchaseOrder, open]);

  const handleItemChange = (
    index: number,
    field:
      | "received_qty"
      | "accepted_qty"
      | "rejected_qty"
      | "rejection_reason"
      | "hasIssue"
      | "issueType"
      | "actual_weight"
      | "unit_price",
    value: string | number | boolean
  ) => {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;

        const updated = { ...item, [field]: value };

        // Auto-calculate rejected qty when received changes
        if (field === "received_qty") {
          updated.accepted_qty = Number(value);
          updated.rejected_qty = 0;
        }
        // Auto-calculate accepted when rejected changes
        if (field === "rejected_qty") {
          updated.accepted_qty = updated.received_qty - Number(value);
          updated.hasIssue = Number(value) > 0;
        }
        // Clear issue type if no issue
        if (field === "hasIssue" && !value) {
          updated.issueType = undefined;
          updated.rejected_qty = 0;
          updated.accepted_qty = updated.received_qty;
        }

        return updated;
      })
    );
  };

  // Check if any items have issues
  const hasAnyIssues = useMemo(() => {
    return items.some((item) => item.hasIssue && (item.rejected_qty ?? 0) > 0);
  }, [items]);

  // Calculate totals.
  // For weight-based (per_kg) lines the value is the ACTUAL delivered weight (from
  // the yellow bill, this installment) × rate/kg. The bill is gross/inclusive by
  // default, so GST is extracted from each line; otherwise it's added on top.
  const totals = useMemo(() => {
    let totalReceivedPcs = 0;
    let totalAcceptedPcs = 0;
    let totalRejectedPcs = 0;
    let totalReceivedKg = 0;
    let totalAcceptedKg = 0;
    let netSum = 0;
    let gstSum = 0;
    let grossSum = 0;
    let hasPerKgItems = false;
    let hasMixedUnits = false;

    items.forEach((item) => {
      const receivedQty = item.received_qty;
      const acceptedQty = item.accepted_qty || item.received_qty;
      const rejectedQty = item.rejected_qty || 0;

      totalReceivedPcs += receivedQty;
      totalAcceptedPcs += acceptedQty;
      totalRejectedPcs += rejectedQty;

      let lineAmount = 0;
      if (item.pricing_mode === "per_kg") {
        hasPerKgItems = true;
        const lineWeight = item.actual_weight ?? 0; // installment weight from the bill
        totalReceivedKg += lineWeight;
        totalAcceptedKg += lineWeight;
        lineAmount = lineWeight * (item.unit_price || 0);
      } else {
        if (hasPerKgItems) hasMixedUnits = true;
        lineAmount = acceptedQty * (item.unit_price || 0);
      }

      const split = billIncludesGst
        ? extractGstFromGross(lineAmount, item.tax_rate)
        : addGstToNet(lineAmount, item.tax_rate);
      netSum += split.net;
      gstSum += split.gst;
      grossSum += split.gross;
    });

    const allPerKg =
      hasPerKgItems &&
      !hasMixedUnits &&
      items.every((i) => i.pricing_mode === "per_kg");

    // The editable gross bill total wins when set (handling/rounding); else use
    // the computed line sum.
    const billTotalNum = billTotal ? parseFloat(billTotal) : NaN;
    const effectiveGross =
      !isNaN(billTotalNum) && billTotalNum > 0 ? billTotalNum : grossSum;

    return {
      totalReceived: allPerKg ? totalReceivedKg : totalReceivedPcs,
      totalAccepted: allPerKg ? totalAcceptedKg : totalAcceptedPcs,
      totalRejected: totalRejectedPcs,
      subtotal: netSum,
      taxAmount: gstSum,
      totalValue: effectiveGross,
      lineSum: grossSum,
      unit: allPerKg ? "kg" : "pcs",
      hasPerKgItems,
    };
  }, [items, billIncludesGst, billTotal]);

  // Per-line weight variance vs the PO estimate, and whether ANY line is drastically
  // off (likely a wrong order / weighing error) — surfaced as a banner the engineer
  // can't miss. Informational only: the bill is the source of truth.
  const weightVariances = useMemo(
    () =>
      items.map((item) => {
        if (item.pricing_mode !== "per_kg") return null;
        const expectedPerPiece =
          item.calculated_weight && item.orderedQty
            ? item.calculated_weight / item.orderedQty
            : null;
        const actualPerPiece =
          item.actual_weight && item.received_qty
            ? item.actual_weight / item.received_qty
            : null;
        return weightVariancePct(actualPerPiece, expectedPerPiece);
      }),
    [items]
  );
  const anyLargeVariance = useMemo(
    () => weightVariances.some((v) => isLargeWeightVariance(v)),
    [weightVariances]
  );

  const handlePhotoUpload = useCallback((file: UploadedFile) => {
    setPhotos((prev) => [...prev, file]);
  }, []);

  const handleRemovePhoto = useCallback((index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Re-entrancy lock: blocks a second submission while one is in flight, even in
  // the brief window before the disabled button state re-renders (mobile double-tap,
  // slow network). Combined with the over-receipt guard in the mutation, this is
  // what prevents one physical delivery from being recorded as multiple GRNs.
  const submitInFlightRef = useRef(false);

  const handleSubmit = async (flagIssues: boolean = false) => {
    if (!purchaseOrder) return;
    if (submitInFlightRef.current || recordAndVerify.isPending) return;

    // Validate photos (optional in dev mode for testing)
    if (photos.length === 0 && process.env.NODE_ENV === "production") {
      setError("Please upload at least one photo of the delivered materials");
      return;
    }

    // Validate items
    const hasReceivedItems = items.some((item) => item.received_qty > 0);
    if (!hasReceivedItems) {
      setError("Please enter received quantity for at least one item");
      return;
    }

    // Validate quantities don't exceed pending
    for (const item of items) {
      if (item.received_qty > item.pendingQty) {
        setError(
          `Received quantity for ${item.materialName} exceeds pending quantity`
        );
        return;
      }
    }

    // If flagging issues, ensure at least one issue is marked
    if (flagIssues && !hasAnyIssues) {
      setError(
        "Please mark at least one item with an issue before flagging for review"
      );
      return;
    }

    // Build discrepancies for items with issues
    const discrepancies: DeliveryDiscrepancy[] = items
      .filter((item) => item.hasIssue && item.issueType)
      .map((item) => ({
        item_id: item.po_item_id || item.material_id,
        expected_qty: item.orderedQty,
        received_qty: item.accepted_qty || 0,
        issue: item.issueType!,
        notes: item.rejection_reason,
      }));

    try {
      const deliveryData = {
        po_id: purchaseOrder.id,
        site_id: siteId,
        vendor_id: purchaseOrder.vendor_id || purchaseOrder.vendor?.id || "",
        delivery_date: deliveryDate,
        challan_number: challanNumber || undefined,
        challan_date: challanDate || undefined,
        challan_url: challanUrl || undefined,
        vehicle_number: vehicleNumber || undefined,
        driver_name: driverName || undefined,
        driver_phone: driverPhone || undefined,
        photos: photos.map((p) => p.url),
        notes: notes || undefined,
        items: items
          .filter((item) => item.received_qty > 0)
          .map((item) => {
            const acceptedQty = item.accepted_qty ?? item.received_qty;
            const lineAmount =
              item.pricing_mode === "per_kg"
                ? (item.actual_weight ?? 0) * (item.unit_price || 0)
                : acceptedQty * (item.unit_price || 0);
            return {
              po_item_id: item.po_item_id,
              material_id: item.material_id,
              brand_id: item.brand_id,
              ordered_qty: item.orderedQty,
              received_qty: item.received_qty,
              accepted_qty: item.accepted_qty,
              rejected_qty: item.rejected_qty,
              rejection_reason: item.rejection_reason,
              unit_price: item.unit_price,
              // Weight-based (TMT) actuals from the yellow bill
              pricing_mode: item.pricing_mode,
              actual_weight: item.actual_weight ?? null,
              calculated_weight: item.calculated_weight ?? null,
              line_amount: Number(lineAmount.toFixed(2)),
              tax_rate: item.tax_rate ?? null,
            };
          }),
        inspectionChecklist,
        issues: discrepancies.length > 0 ? discrepancies : undefined,
        hasIssues: flagIssues || hasAnyIssues,
        // Gross bill total + GST treatment (weight-based / TMT deliveries)
        bill_total: billTotal ? parseFloat(billTotal) : undefined,
        bill_includes_gst: billIncludesGst,
        bill_gst_rate:
          items.find((i) => i.pricing_mode === "per_kg" && i.tax_rate)?.tax_rate ??
          undefined,
      };

      console.log(
        "[RecordAndVerifyDeliveryDialog] Submitting:",
        deliveryData
      );

      submitInFlightRef.current = true;
      await recordAndVerify.mutateAsync(deliveryData);
      onClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to record and verify delivery";
      setError(message);
    } finally {
      submitInFlightRef.current = false;
    }
  };

  const isSubmitting = recordAndVerify.isPending;

  if (!purchaseOrder) return null;

  return (
    <Dialog
      open={open}
      onClose={(_event, reason) => { if (reason !== "backdropClick") onClose(); }}
      maxWidth="lg"
      fullWidth
      fullScreen={isMobile}
    >
      <DialogTitle
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Box>
          <Typography variant="h6" component="span">
            Record & Verify Delivery
          </Typography>
          <Typography variant="body2" color="text.secondary">
            PO: {purchaseOrder.po_number} • {purchaseOrder.vendor?.name}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
            {error}
          </Alert>
        )}

        <Grid container spacing={2}>
          {/* Photos Section - Required and Prominent */}
          <Grid size={12}>
            <Paper
              variant="outlined"
              sx={{ p: 2, bgcolor: "primary.50", borderColor: "primary.200" }}
            >
              <Typography
                variant="subtitle1"
                fontWeight={600}
                sx={{ mb: 1, display: "flex", alignItems: "center", gap: 1 }}
              >
                <CameraIcon color="primary" />
                Delivery Photos (Required)
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", mb: 2 }}
              >
                Upload photos of delivered materials for verification. At least
                one photo is required.
              </Typography>

              <Box sx={{ mb: 2 }}>
                <FileUploader
                  supabase={supabase}
                  bucketName="delivery-verifications"
                  folderPath={`${siteId}/${purchaseOrder?.po_number || "direct"}`}
                  fileNamePrefix="delivery"
                  accept="image"
                  maxSizeMB={10}
                  label="Add Photo"
                  helperText="Tap to add delivery photo"
                  uploadOnSelect
                  onUpload={handlePhotoUpload}
                />
              </Box>

              {photos.length > 0 && (
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                  {photos.map((photo, index) => (
                    <Box
                      key={index}
                      sx={{
                        position: "relative",
                        width: 80,
                        height: 80,
                        borderRadius: 1,
                        overflow: "hidden",
                        border: "2px solid",
                        borderColor: "primary.main",
                      }}
                    >
                      <img
                        src={photo.url}
                        alt={`Photo ${index + 1}`}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                      <IconButton
                        size="small"
                        onClick={() => handleRemovePhoto(index)}
                        sx={{
                          position: "absolute",
                          top: 2,
                          right: 2,
                          bgcolor: "rgba(0,0,0,0.5)",
                          color: "white",
                          "&:hover": { bgcolor: "rgba(0,0,0,0.7)" },
                        }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  ))}
                </Box>
              )}

              {photos.length === 0 && (
                <Alert severity="info" sx={{ mt: 1 }}>
                  Upload at least one photo to proceed
                </Alert>
              )}
            </Paper>
          </Grid>

          {/* Delivery Date */}
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              fullWidth
              type="date"
              label="Delivery Date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              required
            />
          </Grid>

          {/* Toggle for additional details */}
          <Grid size={{ xs: 12, md: 8 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={showAdditionalDetails}
                  onChange={(e) => setShowAdditionalDetails(e.target.checked)}
                />
              }
              label={
                <Typography variant="body2" color="text.secondary">
                  Add challan, vehicle & driver details
                </Typography>
              }
            />
          </Grid>

          {/* Additional Details - Collapsible */}
          <Grid size={12}>
            <Collapse in={showAdditionalDetails}>
              <Paper variant="outlined" sx={{ p: 2, bgcolor: "grey.50" }}>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 6, md: 3 }}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Challan Number"
                      value={challanNumber}
                      onChange={(e) => setChallanNumber(e.target.value)}
                    />
                  </Grid>

                  <Grid size={{ xs: 6, md: 3 }}>
                    <TextField
                      fullWidth
                      size="small"
                      type="date"
                      label="Challan Date"
                      value={challanDate}
                      onChange={(e) => setChallanDate(e.target.value)}
                      slotProps={{ inputLabel: { shrink: true } }}
                    />
                  </Grid>

                  <Grid size={{ xs: 12, md: 3 }}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Vehicle Number"
                      value={vehicleNumber}
                      onChange={(e) =>
                        setVehicleNumber(e.target.value.toUpperCase())
                      }
                      placeholder="TN 00 AB 0000"
                    />
                  </Grid>

                  <Grid size={{ xs: 6, md: 1.5 }}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Driver Name"
                      value={driverName}
                      onChange={(e) => setDriverName(e.target.value)}
                    />
                  </Grid>

                  <Grid size={{ xs: 6, md: 1.5 }}>
                    <TextField
                      fullWidth
                      size="small"
                      label="Driver Phone"
                      value={driverPhone}
                      onChange={(e) => setDriverPhone(e.target.value)}
                    />
                  </Grid>
                </Grid>
              </Paper>
            </Collapse>
          </Grid>

          {/* Inspection Checklist */}
          <Grid size={12}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                Quick Inspection Checklist
              </Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={inspectionChecklist.qualityOk}
                      onChange={(e) =>
                        setInspectionChecklist((prev) => ({
                          ...prev,
                          qualityOk: e.target.checked,
                        }))
                      }
                      color="success"
                    />
                  }
                  label="Quality OK"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={inspectionChecklist.quantityMatches}
                      onChange={(e) =>
                        setInspectionChecklist((prev) => ({
                          ...prev,
                          quantityMatches: e.target.checked,
                        }))
                      }
                      color="success"
                    />
                  }
                  label="Quantity Matches"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={inspectionChecklist.noDamage}
                      onChange={(e) =>
                        setInspectionChecklist((prev) => ({
                          ...prev,
                          noDamage: e.target.checked,
                        }))
                      }
                      color="success"
                    />
                  }
                  label="No Damage"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={inspectionChecklist.specsCorrect}
                      onChange={(e) =>
                        setInspectionChecklist((prev) => ({
                          ...prev,
                          specsCorrect: e.target.checked,
                        }))
                      }
                      color="success"
                    />
                  }
                  label="Specs Correct"
                />
              </Box>
            </Paper>
          </Grid>

          {/* Batch delivery context banner */}
          {purchaseOrder.status === 'partial_delivered' && (
            <Grid size={12}>
              <Alert severity="info" icon={<InventoryIcon />}>
                <Typography variant="body2" fontWeight={600}>
                  Batch delivery — enter only the quantity arriving TODAY
                </Typography>
                {purchaseOrder.items?.map((item) => {
                  const alreadyReceived = item.received_qty || 0;
                  const stillPending = item.quantity - alreadyReceived;
                  if (alreadyReceived === 0) return null;
                  return (
                    <Typography key={item.id} variant="caption" display="block">
                      {item.material?.name}: {alreadyReceived} {item.material?.unit} received so far · {stillPending} {item.material?.unit} still pending
                    </Typography>
                  );
                })}
              </Alert>
            </Grid>
          )}

          {/* Items Table */}
          <Grid size={12}>
            <Divider sx={{ my: 1 }}>
              <Typography variant="subtitle2">Received Items</Typography>
            </Divider>
          </Grid>

          {/* TMT: enter the exact weight from the yellow bill. Rate is read-only
              (agreed at PO time) unless the engineer opts in to correct it. */}
          {totals.hasPerKgItems && (
            <Grid size={12}>
              <Box sx={{ display: "flex", justifyContent: "flex-end", mb: -0.5 }}>
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={editRate}
                      onChange={(e) => setEditRate(e.target.checked)}
                    />
                  }
                  label={
                    <Typography variant="caption" color="text.secondary">
                      Edit rate/kg (only if the vendor changed it)
                    </Typography>
                  }
                />
              </Box>
            </Grid>
          )}

          <Grid size={12}>
            <Paper variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Material</TableCell>
                    <TableCell align="right">Ordered</TableCell>
                    <TableCell align="right">Pending</TableCell>
                    <TableCell align="right" sx={{ width: 90 }}>
                      Received
                    </TableCell>
                    <TableCell align="right" sx={{ width: 90 }}>
                      Accepted
                    </TableCell>
                    {totals.hasPerKgItems && (
                      <>
                        <TableCell align="right" sx={{ width: 110 }}>
                          Actual kg
                        </TableCell>
                        <TableCell align="right" sx={{ width: 95 }}>
                          Rate ₹/kg
                        </TableCell>
                        <TableCell align="right" sx={{ width: 100 }}>
                          Line ₹
                        </TableCell>
                      </>
                    )}
                    <TableCell align="center" sx={{ width: 100 }}>
                      Issue?
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={totals.hasPerKgItems ? 9 : 6} align="center">
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ py: 2 }}
                        >
                          No pending items in this PO
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((item, index) => (
                      <TableRow
                        key={index}
                        sx={{
                          bgcolor: item.hasIssue ? "warning.50" : "inherit",
                        }}
                      >
                        <TableCell>
                          <Typography variant="body2">
                            {item.materialName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {item.unit}
                            {item.unit_price &&
                              ` • ${formatCurrency(item.unit_price)}/${
                                item.pricing_mode === "per_kg" ? "kg" : "unit"
                              }`}
                          </Typography>
                          {item.sizeNote && (
                            <Typography variant="caption" color="text.secondary" display="block">
                              {item.sizeNote}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          {item.orderedQty}
                          {item.pricing_mode === "per_kg" &&
                            (item.actual_weight ?? item.calculated_weight) && (
                              <Typography
                                variant="caption"
                                color="text.secondary"
                                display="block"
                              >
                                {(
                                  (item.actual_weight ??
                                    item.calculated_weight) || 0
                                ).toFixed(1)}{" "}
                                kg
                              </Typography>
                            )}
                        </TableCell>
                        <TableCell align="right">
                          <Chip
                            label={item.pendingQty}
                            size="small"
                            color={item.pendingQty > 0 ? "warning" : "success"}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <TextField
                            size="small"
                            type="number"
                            value={item.received_qty}
                            onChange={(e) =>
                              handleItemChange(
                                index,
                                "received_qty",
                                parseFloat(e.target.value) || 0
                              )
                            }
                            slotProps={{
                              input: {
                                inputProps: {
                                  min: 0,
                                  max: item.pendingQty,
                                  step: 0.01,
                                },
                              },
                            }}
                            sx={{ width: 75 }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <TextField
                            size="small"
                            type="number"
                            value={item.accepted_qty}
                            onChange={(e) =>
                              handleItemChange(
                                index,
                                "accepted_qty",
                                parseFloat(e.target.value) || 0
                              )
                            }
                            slotProps={{
                              input: {
                                inputProps: {
                                  min: 0,
                                  max: item.received_qty,
                                  step: 0.01,
                                },
                              },
                            }}
                            sx={{ width: 75 }}
                            error={(item.rejected_qty || 0) > 0}
                          />
                        </TableCell>
                        {totals.hasPerKgItems && (
                          <>
                            {/* Actual weight (kg) from the yellow bill + variance vs estimate */}
                            <TableCell align="right">
                              {item.pricing_mode === "per_kg" ? (
                                <Box>
                                  <TextField
                                    size="small"
                                    type="number"
                                    value={item.actual_weight ?? ""}
                                    onChange={(e) =>
                                      handleItemChange(
                                        index,
                                        "actual_weight",
                                        parseFloat(e.target.value) || 0
                                      )
                                    }
                                    placeholder="kg"
                                    slotProps={{
                                      input: {
                                        endAdornment: (
                                          <InputAdornment position="end" sx={{ fontSize: "0.7rem" }}>kg</InputAdornment>
                                        ),
                                        inputProps: { min: 0, step: 0.01, style: { textAlign: "right" } },
                                      },
                                    }}
                                    sx={{ width: 100 }}
                                  />
                                  {(() => {
                                    const v = weightVariances[index];
                                    if (v == null) return null;
                                    const large = isLargeWeightVariance(v);
                                    return (
                                      <Typography
                                        variant="caption"
                                        sx={{
                                          display: "block",
                                          mt: 0.25,
                                          fontWeight: large ? 600 : 400,
                                          color: large
                                            ? "error.main"
                                            : Math.abs(v) > 4
                                              ? "warning.main"
                                              : "success.main",
                                        }}
                                      >
                                        {large && "⚠️ "}
                                        {v > 0 ? "+" : ""}
                                        {v.toFixed(1)}% vs est
                                      </Typography>
                                    );
                                  })()}
                                </Box>
                              ) : (
                                <Typography variant="caption" color="text.secondary">—</Typography>
                              )}
                            </TableCell>
                            {/* Rate ₹/kg — read-only unless the engineer unlocked editing */}
                            <TableCell align="right">
                              {item.pricing_mode === "per_kg" ? (
                                <TextField
                                  size="small"
                                  type="number"
                                  value={item.unit_price ?? ""}
                                  disabled={!editRate}
                                  onChange={(e) =>
                                    handleItemChange(
                                      index,
                                      "unit_price",
                                      parseFloat(e.target.value) || 0
                                    )
                                  }
                                  slotProps={{
                                    input: {
                                      startAdornment: (
                                        <InputAdornment position="start">₹</InputAdornment>
                                      ),
                                      inputProps: { min: 0, step: 0.01, style: { textAlign: "right" } },
                                    },
                                  }}
                                  sx={{ width: 85 }}
                                />
                              ) : (
                                <Typography variant="caption" color="text.secondary">—</Typography>
                              )}
                            </TableCell>
                            {/* Line amount = actual kg × rate */}
                            <TableCell align="right">
                              {item.pricing_mode === "per_kg" ? (
                                <Typography variant="body2" fontWeight={500}>
                                  {formatCurrency((item.actual_weight ?? 0) * (item.unit_price || 0))}
                                </Typography>
                              ) : (
                                <Typography variant="caption" color="text.secondary">—</Typography>
                              )}
                            </TableCell>
                          </>
                        )}
                        <TableCell align="center">
                          {item.hasIssue ? (
                            <Stack spacing={0.5}>
                              <Chip
                                label={item.issueType || "Select"}
                                size="small"
                                color="warning"
                                onClick={() =>
                                  handleItemChange(index, "hasIssue", false)
                                }
                                onDelete={() =>
                                  handleItemChange(index, "hasIssue", false)
                                }
                              />
                              <Box
                                sx={{
                                  display: "flex",
                                  gap: 0.5,
                                  flexWrap: "wrap",
                                  justifyContent: "center",
                                }}
                              >
                                {["short", "damaged", "wrong_spec", "missing"].map(
                                  (issue) => (
                                    <Chip
                                      key={issue}
                                      label={issue.replace("_", " ")}
                                      size="small"
                                      variant={
                                        item.issueType === issue
                                          ? "filled"
                                          : "outlined"
                                      }
                                      color={
                                        item.issueType === issue
                                          ? "warning"
                                          : "default"
                                      }
                                      onClick={() =>
                                        handleItemChange(
                                          index,
                                          "issueType",
                                          issue
                                        )
                                      }
                                      sx={{ fontSize: "0.65rem" }}
                                    />
                                  )
                                )}
                              </Box>
                            </Stack>
                          ) : (
                            <Chip
                              label="OK"
                              size="small"
                              color="success"
                              variant="outlined"
                              onClick={() =>
                                handleItemChange(index, "hasIssue", true)
                              }
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Paper>
          </Grid>

          {/* Weight mismatch warning — a drastic variance usually means a wrong
              item or a weighing error. Informational: the bill is the source of truth. */}
          {anyLargeVariance && (
            <Grid size={12}>
              <Alert severity="warning" icon={<WarningIcon />}>
                <Typography variant="body2" fontWeight={600}>
                  Delivered weight is more than {WEIGHT_VARIANCE_WARN_PCT}% off the estimate
                </Typography>
                <Typography variant="caption">
                  Double-check the bill and the order before confirming — a large gap usually
                  means a wrong item or a weighing error. You can still confirm if the bill is correct.
                </Typography>
              </Alert>
            </Grid>
          )}

          {/* TMT: editable gross bill total (handling/rounding) + GST treatment */}
          {totals.hasPerKgItems && (
            <Grid size={12}>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "flex-end",
                  alignItems: "flex-start",
                  gap: 2,
                  flexWrap: "wrap",
                }}
              >
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={billIncludesGst}
                      onChange={(e) => setBillIncludesGst(e.target.checked)}
                    />
                  }
                  label={
                    <Typography variant="caption">Bill incl. GST</Typography>
                  }
                  sx={{ mt: 0.5 }}
                />
                <TextField
                  size="small"
                  type="number"
                  label="Bill total (₹)"
                  value={billTotal}
                  onChange={(e) => setBillTotal(e.target.value)}
                  placeholder={totals.lineSum.toFixed(2)}
                  helperText={`Line sum: ${formatCurrency(totals.lineSum)}${billIncludesGst ? " · incl GST" : ""}`}
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">₹</InputAdornment>
                      ),
                      inputProps: { min: 0, step: 0.01, style: { textAlign: "right" } },
                    },
                  }}
                  sx={{ width: 200 }}
                />
              </Box>
            </Grid>
          )}

          {/* Summary */}
          {items.length > 0 && (
            <Grid size={12}>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "flex-end",
                  mt: 1,
                  gap: 3,
                }}
              >
                <Box sx={{ textAlign: "center" }}>
                  <Typography variant="caption" color="text.secondary">
                    Total Received
                  </Typography>
                  <Typography variant="h6">
                    {totals.unit === "kg"
                      ? totals.totalReceived.toFixed(1)
                      : totals.totalReceived}{" "}
                    {totals.unit}
                  </Typography>
                </Box>
                <Box sx={{ textAlign: "center" }}>
                  <Typography variant="caption" color="text.secondary">
                    Total Accepted
                  </Typography>
                  <Typography variant="h6" color="success.main">
                    {totals.unit === "kg"
                      ? totals.totalAccepted.toFixed(1)
                      : totals.totalAccepted}{" "}
                    {totals.unit}
                  </Typography>
                </Box>
                {totals.totalRejected > 0 && (
                  <Box sx={{ textAlign: "center" }}>
                    <Typography variant="caption" color="text.secondary">
                      Total Rejected
                    </Typography>
                    <Typography variant="h6" color="error.main">
                      {totals.totalRejected} pcs
                    </Typography>
                  </Box>
                )}
                <Box sx={{ textAlign: "center" }}>
                  <Typography variant="caption" color="text.secondary">
                    Delivery Value
                  </Typography>
                  <Typography variant="h6">
                    {formatCurrency(totals.totalValue)}
                  </Typography>
                  {totals.hasPerKgItems && totals.taxAmount > 0 && (
                    <Typography variant="caption" color="text.secondary" display="block">
                      incl. {formatCurrency(totals.taxAmount)} GST
                    </Typography>
                  )}
                </Box>
              </Box>
            </Grid>
          )}

          {/* Notes */}
          <Grid size={12}>
            <TextField
              fullWidth
              label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              multiline
              rows={2}
              placeholder="Inspection notes, remarks..."
            />
          </Grid>

          {/* Stock Creation Notice */}
          <Grid size={12}>
            <Alert
              severity="info"
              icon={<InventoryIcon />}
              sx={{ bgcolor: "success.50" }}
            >
              <Typography variant="body2">
                <strong>Stock will be added immediately</strong> when you submit.
                Materials will be available for use right away.
              </Typography>
            </Alert>
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, flexWrap: "wrap", gap: 1 }}>
        <Button onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Box sx={{ flex: 1 }} />

        {hasAnyIssues && (
          <Button
            variant="contained"
            color="warning"
            startIcon={<WarningIcon />}
            onClick={() => handleSubmit(true)}
            disabled={isSubmitting || (photos.length === 0 && process.env.NODE_ENV === "production")}
          >
            {isSubmitting ? "Saving..." : "Flag for Review"}
          </Button>
        )}

        <Button
          variant="contained"
          color="success"
          startIcon={<CheckIcon />}
          onClick={() => handleSubmit(false)}
          disabled={
            isSubmitting ||
            (photos.length === 0 && process.env.NODE_ENV === "production") ||
            items.every((i) => i.received_qty === 0)
          }
        >
          {isSubmitting ? "Processing..." : "Record & Verify"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
