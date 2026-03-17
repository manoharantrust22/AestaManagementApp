"use client";

import { useState, useMemo, useEffect } from "react";
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
  Alert,
  Autocomplete,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Paper,
  Divider,
  MenuItem,
  InputAdornment,
  Chip,
} from "@mui/material";
import {
  Close as CloseIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Receipt as ReceiptIcon,
  Payment as PaymentIcon,
} from "@mui/icons-material";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useMaterials } from "@/hooks/queries/useMaterials";
import { useVendors } from "@/hooks/queries/useVendors";
import type {
  MaterialWithDetails,
  Vendor,
  MaterialBrand,
  MaterialPaymentMode,
  MaterialPurchaseExpenseWithDetails,
} from "@/types/material.types";
import { formatCurrency } from "@/lib/formatters";
import { createClient } from "@/lib/supabase/client";
import FileUploader, { UploadedFile } from "@/components/common/FileUploader";
import {
  MATERIAL_PAYMENT_MODE_LABELS,
} from "@/types/material.types";
import { useUpdateMaterialPurchase } from "@/hooks/queries/useMaterialPurchases";

interface EditMaterialPurchaseDialogProps {
  open: boolean;
  onClose: () => void;
  purchase: MaterialPurchaseExpenseWithDetails | null;
}

interface EditItemRow {
  id?: string; // existing item id
  materialId: string;
  materialName?: string;
  brandId?: string;
  brandName?: string;
  quantity: number;
  unitPrice: number;
  unit?: string;
  isNew?: boolean;
}

export default function EditMaterialPurchaseDialog({
  open,
  onClose,
  purchase,
}: EditMaterialPurchaseDialogProps) {
  const isMobile = useIsMobile();
  const supabase = createClient();

  const { data: materials = [] } = useMaterials();
  const { data: vendors = [] } = useVendors();
  const updateMaterialPurchase = useUpdateMaterialPurchase();

  const [error, setError] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [vendorName, setVendorName] = useState("");
  const [transportCost, setTransportCost] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<EditItemRow[]>([]);

  // Payment fields
  const [paymentMode, setPaymentMode] = useState<MaterialPaymentMode | "">("");
  const [paymentReference, setPaymentReference] = useState("");
  const [billFile, setBillFile] = useState<UploadedFile | null>(null);
  const [paymentScreenshot, setPaymentScreenshot] = useState<UploadedFile | null>(null);
  const [isPaid, setIsPaid] = useState(false);

  // New item form
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialWithDetails | null>(null);
  const [selectedBrand, setSelectedBrand] = useState<MaterialBrand | null>(null);
  const [newItemQty, setNewItemQty] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");

  // Initialize form when purchase changes
  useEffect(() => {
    if (purchase) {
      setPurchaseDate(purchase.purchase_date);
      setTransportCost(purchase.transport_cost?.toString() || "");
      setNotes(purchase.notes || "");
      setPaymentMode((purchase.payment_mode as MaterialPaymentMode) || "");
      setPaymentReference(purchase.payment_reference || "");
      setIsPaid(purchase.is_paid);
      setVendorName(purchase.vendor_name || "");

      // Set vendor if exists
      if (purchase.vendor_id) {
        const vendor = vendors.find((v) => v.id === purchase.vendor_id);
        setSelectedVendor(vendor || null);
      } else {
        setSelectedVendor(null);
      }

      // Set bill file if exists
      if (purchase.bill_url) {
        setBillFile({ url: purchase.bill_url, name: "Existing Bill", size: 0 });
      } else {
        setBillFile(null);
      }

      // Set payment screenshot if exists
      if (purchase.payment_screenshot_url) {
        setPaymentScreenshot({
          url: purchase.payment_screenshot_url,
          name: "Payment Screenshot",
          size: 0,
        });
      } else {
        setPaymentScreenshot(null);
      }

      // Convert items
      if (purchase.items) {
        setItems(
          purchase.items.map((item) => ({
            id: item.id,
            materialId: item.material_id,
            materialName: item.material?.name,
            brandId: item.brand_id || undefined,
            brandName: item.brand?.brand_name,
            quantity: item.quantity,
            unitPrice: item.unit_price,
            unit: item.material?.unit,
          }))
        );
      }
    }
  }, [purchase, vendors]);

  // Get available brands when material is selected
  const availableBrands = useMemo(() => {
    if (!selectedMaterial?.brands) return [];
    return selectedMaterial.brands.filter((b) => b.is_active);
  }, [selectedMaterial]);

  // Reset brand when material changes
  useEffect(() => {
    setSelectedBrand(null);
    setNewItemPrice("");
  }, [selectedMaterial]);

  // Calculate totals
  const totals = useMemo(() => {
    const subtotal = items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0
    );
    const transport = parseFloat(transportCost) || 0;
    return {
      subtotal,
      transport,
      total: subtotal + transport,
    };
  }, [items, transportCost]);

  const handleAddItem = () => {
    if (!selectedMaterial) {
      setError("Please select a material");
      return;
    }
    if (!newItemQty || parseFloat(newItemQty) <= 0) {
      setError("Please enter a valid quantity");
      return;
    }
    if (!newItemPrice || parseFloat(newItemPrice) <= 0) {
      setError("Please enter a valid unit price");
      return;
    }

    const newItem: EditItemRow = {
      materialId: selectedMaterial.id,
      materialName: selectedMaterial.name,
      brandId: selectedBrand?.id,
      brandName: selectedBrand
        ? selectedBrand.variant_name
          ? `${selectedBrand.brand_name} ${selectedBrand.variant_name}`
          : selectedBrand.brand_name
        : undefined,
      quantity: parseFloat(newItemQty),
      unitPrice: parseFloat(newItemPrice),
      unit: selectedMaterial.unit,
      isNew: true,
    };

    setItems([...items, newItem]);
    setSelectedMaterial(null);
    setSelectedBrand(null);
    setNewItemQty("");
    setNewItemPrice("");
    setError("");
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!purchase) return;

    if (!purchaseDate) {
      setError("Please select a purchase date");
      return;
    }
    if (items.length === 0) {
      setError("Please add at least one item");
      return;
    }

    try {
      await updateMaterialPurchase.mutateAsync({
        id: purchase.id,
        data: {
          vendor_id: selectedVendor?.id,
          vendor_name: selectedVendor?.name || vendorName || undefined,
          purchase_date: purchaseDate,
          transport_cost: parseFloat(transportCost) || 0,
          payment_mode: paymentMode || undefined,
          payment_reference: paymentReference || undefined,
          payment_screenshot_url: paymentScreenshot?.url,
          is_paid: isPaid,
          paid_date: isPaid ? purchaseDate : undefined,
          bill_url: billFile?.url,
          notes: notes || undefined,
          items: items.map((item) => ({
            material_id: item.materialId,
            brand_id: item.brandId,
            quantity: item.quantity,
            unit_price: item.unitPrice,
          })),
        },
      });

      onClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to update purchase";
      setError(message);
    }
  };

  const isSubmitting = updateMaterialPurchase.isPending;

  // Check if purchase can be edited
  const canEdit = purchase?.status === "in_stock" || purchase?.status === "partial_used" || purchase?.status === "recorded";

  if (!purchase) return null;

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
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <EditIcon color="primary" />
          <Typography component="span" variant="h6">
            Edit Purchase - {purchase.ref_code}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {!canEdit && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            This purchase cannot be edited because it has been completed or
            converted.
          </Alert>
        )}

        <Grid container spacing={2}>
          {/* Purchase Date */}
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              fullWidth
              type="date"
              label="Purchase Date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              required
              disabled={!canEdit}
              slotProps={{
                inputLabel: { shrink: true },
                input: {
                  inputProps: {
                    max: new Date().toISOString().split("T")[0],
                  },
                },
              }}
            />
          </Grid>

          {/* Transport Cost */}
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              fullWidth
              type="number"
              label="Transport Cost"
              value={transportCost}
              onChange={(e) => setTransportCost(e.target.value)}
              disabled={!canEdit}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">₹</InputAdornment>
                  ),
                  inputProps: { min: 0, step: 0.01 },
                },
              }}
              helperText="Total transport for all items"
            />
          </Grid>

          {/* Payment Mode */}
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              select
              fullWidth
              label="Payment Mode"
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value as MaterialPaymentMode)}
              disabled={!canEdit}
            >
              <MenuItem value="">Not specified</MenuItem>
              {(Object.keys(MATERIAL_PAYMENT_MODE_LABELS) as MaterialPaymentMode[]).map((mode) => (
                <MenuItem key={mode} value={mode}>
                  {MATERIAL_PAYMENT_MODE_LABELS[mode]}
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          {/* Payment Reference - show for UPI, Bank Transfer, Cheque */}
          {paymentMode && ["upi", "bank_transfer", "cheque"].includes(paymentMode) && (
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                fullWidth
                label={
                  paymentMode === "upi"
                    ? "UPI Transaction ID"
                    : paymentMode === "cheque"
                    ? "Cheque Number"
                    : "Transaction Reference"
                }
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                disabled={!canEdit}
                placeholder={
                  paymentMode === "upi"
                    ? "Enter UPI transaction ID"
                    : paymentMode === "cheque"
                    ? "Enter cheque number"
                    : "Enter NEFT/RTGS reference"
                }
              />
            </Grid>
          )}

          {/* Bill Upload */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                <ReceiptIcon color="action" fontSize="small" />
                <Typography variant="subtitle2">Bill/Receipt</Typography>
              </Box>
              <FileUploader
                supabase={supabase}
                bucketName="purchase-documents"
                folderPath={`material-purchases/${purchase.site_id}`}
                onUpload={(file) => setBillFile(file)}
                onRemove={() => setBillFile(null)}
                value={billFile}
                accept="all"
                maxSizeMB={10}
                label="Upload bill or receipt"
                disabled={!canEdit}
              />
            </Paper>
          </Grid>

          {/* Payment Screenshot - show when payment mode is set and not cash/credit */}
          {paymentMode && !["cash", "credit", ""].includes(paymentMode) && (
            <Grid size={{ xs: 12, md: 6 }}>
              <Paper variant="outlined" sx={{ p: 2 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                  <PaymentIcon color="action" fontSize="small" />
                  <Typography variant="subtitle2">Payment Screenshot</Typography>
                </Box>
                <FileUploader
                  supabase={supabase}
                  bucketName="purchase-documents"
                  folderPath={`payment-screenshots/${purchase.site_id}`}
                  onUpload={(file) => setPaymentScreenshot(file)}
                  onRemove={() => setPaymentScreenshot(null)}
                  value={paymentScreenshot}
                  accept="image"
                  maxSizeMB={5}
                  label="Upload payment confirmation"
                  disabled={!canEdit}
                />
              </Paper>
            </Grid>
          )}

          {/* Vendor */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Autocomplete
              options={vendors}
              getOptionLabel={(option) => option.name}
              value={selectedVendor}
              onChange={(_, value) => {
                setSelectedVendor(value);
                if (value) setVendorName(value.name);
              }}
              disabled={!canEdit}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Vendor (Select or type below)"
                />
              )}
            />
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <TextField
              fullWidth
              label="Vendor Name (if not in list)"
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              disabled={!canEdit || !!selectedVendor}
            />
          </Grid>

          {/* Notes */}
          <Grid size={12}>
            <TextField
              fullWidth
              label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!canEdit}
              placeholder="Any additional notes about this purchase..."
              multiline
              rows={2}
            />
          </Grid>

          {/* Add Item Section */}
          {canEdit && (
            <>
              <Grid size={12}>
                <Divider sx={{ my: 1 }}>
                  <Typography variant="subtitle2">Add Items</Typography>
                </Divider>
              </Grid>

              <Grid size={{ xs: 12, md: 4 }}>
                <Autocomplete
                  options={materials}
                  getOptionLabel={(option) =>
                    `${option.name}${option.code ? ` (${option.code})` : ""}`
                  }
                  value={selectedMaterial}
                  onChange={(_, value) => setSelectedMaterial(value)}
                  renderInput={(params) => (
                    <TextField {...params} label="Material" size="small" />
                  )}
                  renderOption={(props, option) => (
                    <li {...props} key={option.id}>
                      <Box>
                        <Typography variant="body2">{option.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {option.code} • {option.unit}
                          {option.brands && option.brands.length > 0 && (
                            <> • {option.brands.filter(b => b.is_active).length} brands</>
                          )}
                        </Typography>
                      </Box>
                    </li>
                  )}
                />
              </Grid>

              {/* Brand Selection - Show when material has brands */}
              <Grid size={{ xs: 12, md: 3 }}>
                <Autocomplete
                  options={availableBrands}
                  getOptionLabel={(brand) =>
                    brand.variant_name
                      ? `${brand.brand_name} ${brand.variant_name}`
                      : brand.brand_name
                  }
                  value={selectedBrand}
                  onChange={(_, value) => setSelectedBrand(value)}
                  disabled={!selectedMaterial || availableBrands.length === 0}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Brand/Variant"
                      size="small"
                      placeholder={
                        !selectedMaterial
                          ? "Select material first"
                          : availableBrands.length === 0
                          ? "No brands available"
                          : "Select brand"
                      }
                    />
                  )}
                  renderOption={(props, brand) => (
                    <li {...props} key={brand.id}>
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1, width: "100%" }}>
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="body2">
                            {brand.brand_name}
                            {brand.variant_name && (
                              <Typography component="span" color="text.secondary">
                                {" "}- {brand.variant_name}
                              </Typography>
                            )}
                          </Typography>
                        </Box>
                        {brand.is_preferred && (
                          <Chip label="Preferred" size="small" color="primary" variant="outlined" />
                        )}
                      </Box>
                    </li>
                  )}
                />
              </Grid>

              <Grid size={{ xs: 4, md: 1.5 }}>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  label="Quantity"
                  value={newItemQty}
                  onChange={(e) => setNewItemQty(e.target.value)}
                  slotProps={{ input: { inputProps: { min: 0, step: 0.01 } } }}
                />
              </Grid>

              <Grid size={{ xs: 4, md: 2 }}>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  label="Unit Price (₹)"
                  value={newItemPrice}
                  onChange={(e) => setNewItemPrice(e.target.value)}
                  slotProps={{ input: { inputProps: { min: 0, step: 0.01 } } }}
                />
              </Grid>

              <Grid size={{ xs: 4, md: 1.5 }}>
                <Button
                  fullWidth
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={handleAddItem}
                  sx={{ height: 40 }}
                >
                  Add
                </Button>
              </Grid>
            </>
          )}

          {/* Items Table */}
          <Grid size={12}>
            <Paper variant="outlined" sx={{ mt: 1 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Material</TableCell>
                    <TableCell align="right">Qty</TableCell>
                    <TableCell align="right">Unit Price</TableCell>
                    <TableCell align="right">Amount</TableCell>
                    {canEdit && <TableCell width={50}></TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={canEdit ? 5 : 4} align="center">
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ py: 2 }}
                        >
                          No items
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Typography variant="body2">
                            {item.materialName}
                            {item.isNew && (
                              <Chip
                                label="New"
                                size="small"
                                color="success"
                                sx={{ ml: 0.5, height: 18, fontSize: "0.7rem" }}
                              />
                            )}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {item.brandName && (
                              <Chip
                                label={item.brandName}
                                size="small"
                                variant="outlined"
                                sx={{ mr: 0.5, height: 18, fontSize: "0.7rem" }}
                              />
                            )}
                            {item.unit}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">{item.quantity}</TableCell>
                        <TableCell align="right">
                          {formatCurrency(item.unitPrice)}
                        </TableCell>
                        <TableCell align="right">
                          {formatCurrency(item.quantity * item.unitPrice)}
                        </TableCell>
                        {canEdit && (
                          <TableCell>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleRemoveItem(index)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Paper>
          </Grid>

          {/* Totals */}
          {items.length > 0 && (
            <Grid size={12}>
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "flex-end",
                  mt: 2,
                }}
              >
                <Box sx={{ minWidth: 200 }}>
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      mb: 0.5,
                    }}
                  >
                    <Typography variant="body2">Subtotal:</Typography>
                    <Typography variant="body2">
                      {formatCurrency(totals.subtotal)}
                    </Typography>
                  </Box>
                  {totals.transport > 0 && (
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        mb: 0.5,
                      }}
                    >
                      <Typography variant="body2">Transport:</Typography>
                      <Typography variant="body2">
                        {formatCurrency(totals.transport)}
                      </Typography>
                    </Box>
                  )}
                  <Divider sx={{ my: 1 }} />
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <Typography variant="subtitle1" fontWeight={600}>
                      Total:
                    </Typography>
                    <Typography variant="subtitle1" fontWeight={600}>
                      {formatCurrency(totals.total)}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            </Grid>
          )}
        </Grid>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={isSubmitting || !canEdit || items.length === 0}
        >
          {isSubmitting ? "Saving..." : "Save Changes"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
