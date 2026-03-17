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
  History as HistoryIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Receipt as ReceiptIcon,
  Payment as PaymentIcon,
} from "@mui/icons-material";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useMaterials } from "@/hooks/queries/useMaterials";
import { useVendors } from "@/hooks/queries/useVendors";
import { useMaterialPriceHistory, useVendorInventory } from "@/hooks/queries/useVendorInventory";
import {
  useSiteGroupMembership,
  useAddHistoricalGroupStockPurchase,
} from "@/hooks/queries/useSiteGroups";
import type {
  MaterialWithDetails,
  Vendor,
  MaterialBrand,
  MaterialPurchaseType,
  MaterialPaymentMode,
} from "@/types/material.types";
import { formatCurrency } from "@/lib/formatters";
import { createClient } from "@/lib/supabase/client";
import FileUploader, { UploadedFile } from "@/components/common/FileUploader";
import {
  MATERIAL_PURCHASE_TYPE_LABELS,
  MATERIAL_PAYMENT_MODE_LABELS,
} from "@/types/material.types";
import { useCreateMaterialPurchase } from "@/hooks/queries/useMaterialPurchases";

interface AddHistoricalPurchaseDialogProps {
  open: boolean;
  onClose: () => void;
  siteId: string;
}

interface PurchaseItemRow {
  materialId: string;
  materialName?: string;
  brandId?: string;
  brandName?: string;
  quantity: number;
  unitPrice: number;
  unit?: string;
}

export default function AddHistoricalPurchaseDialog({
  open,
  onClose,
  siteId,
}: AddHistoricalPurchaseDialogProps) {
  const isMobile = useIsMobile();
  const supabase = createClient();

  const { data: materials = [] } = useMaterials();
  const { data: vendors = [] } = useVendors();
  const { data: groupMembership } = useSiteGroupMembership(siteId);
  const addHistoricalPurchase = useAddHistoricalGroupStockPurchase();
  const createMaterialPurchase = useCreateMaterialPurchase();

  const [error, setError] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [payingSiteId, setPayingSiteId] = useState<string>(siteId);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [vendorName, setVendorName] = useState("");
  const [transportCost, setTransportCost] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<PurchaseItemRow[]>([]);

  // New fields for Phase 7
  const [purchaseType, setPurchaseType] = useState<MaterialPurchaseType>("group_stock");
  const [paymentMode, setPaymentMode] = useState<MaterialPaymentMode | "">("");
  const [paymentReference, setPaymentReference] = useState("");
  const [billFile, setBillFile] = useState<UploadedFile | null>(null);
  const [paymentScreenshot, setPaymentScreenshot] = useState<UploadedFile | null>(null);
  const [isPaid, setIsPaid] = useState(true);

  // New item form
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialWithDetails | null>(null);
  const [selectedBrand, setSelectedBrand] = useState<MaterialBrand | null>(null);
  const [newItemQty, setNewItemQty] = useState("");
  const [newItemPrice, setNewItemPrice] = useState("");

  // Fetch price history for auto-fill (fallback)
  const { data: priceHistory = [] } = useMaterialPriceHistory(selectedMaterial?.id);

  // Fetch vendor catalog for price auto-fill (primary source)
  const { data: vendorCatalog = [] } = useVendorInventory(selectedVendor?.id);

  // Get available brands when material is selected
  const availableBrands = useMemo(() => {
    if (!selectedMaterial?.brands) return [];
    return selectedMaterial.brands.filter((b) => b.is_active);
  }, [selectedMaterial]);

  // Find last price for the selected material+brand - prioritize vendor catalog
  const lastPriceInfo = useMemo(() => {
    // First, check vendor catalog (vendor_inventory) if vendor is selected
    if (selectedVendor && selectedMaterial && vendorCatalog.length > 0) {
      // Find matching entry in vendor catalog for material + brand
      const catalogEntry = vendorCatalog.find((item) => {
        const materialMatch = item.material_id === selectedMaterial.id;
        const brandMatch = selectedBrand
          ? item.brand_id === selectedBrand.id
          : !item.brand_id; // Match null brand_id if no brand selected
        return materialMatch && (brandMatch || !selectedBrand);
      });

      if (catalogEntry) {
        return {
          price: catalogEntry.current_price || 0,
          date: catalogEntry.last_price_update || catalogEntry.updated_at,
          vendor: selectedVendor.name,
          isSameBrand: selectedBrand ? catalogEntry.brand_id === selectedBrand.id : true,
          source: "catalog" as const,
        };
      }
    }

    // Fallback to price history if no catalog entry found
    if (!selectedBrand || !priceHistory.length) return null;
    const brandPrice = priceHistory.find((p) => p.brand_id === selectedBrand.id);
    if (!brandPrice) {
      // If no price for this brand, get any recent price for the material
      const anyPrice = priceHistory[0];
      if (anyPrice) {
        return {
          price: anyPrice.price,
          date: anyPrice.recorded_date,
          vendor: anyPrice.vendor?.name,
          isSameBrand: false,
          source: "history" as const,
        };
      }
      return null;
    }
    return {
      price: brandPrice.price,
      date: brandPrice.recorded_date,
      vendor: brandPrice.vendor?.name,
      isSameBrand: true,
      source: "history" as const,
    };
  }, [selectedBrand, selectedMaterial, selectedVendor, priceHistory, vendorCatalog]);

  // Auto-fill price when vendor catalog or brand price is found
  useEffect(() => {
    if (lastPriceInfo && lastPriceInfo.price > 0) {
      // Auto-fill if:
      // 1. It's from vendor catalog (always auto-fill since it's the current price)
      // 2. Or it's from price history and matches the selected brand
      if (lastPriceInfo.source === "catalog" || lastPriceInfo.isSameBrand) {
        setNewItemPrice(lastPriceInfo.price.toString());
      }
    }
  }, [lastPriceInfo]);

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

    const newItem: PurchaseItemRow = {
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
    // For group_stock type, check if site is in a group
    if (purchaseType === "group_stock" && !groupMembership?.isInGroup) {
      setError("Site is not part of a group. Select 'Own Site Purchase' or add site to a group.");
      return;
    }
    if (!purchaseDate) {
      setError("Please select a purchase date");
      return;
    }
    if (purchaseType === "group_stock" && !payingSiteId) {
      setError("Please select which site paid for this purchase");
      return;
    }
    if (items.length === 0) {
      setError("Please add at least one item");
      return;
    }

    try {
      if (purchaseType === "own_site") {
        // Use the new material purchase expense system
        await createMaterialPurchase.mutateAsync({
          site_id: siteId,
          purchase_type: "own_site",
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
          notes,
          items: items.map((item) => ({
            material_id: item.materialId,
            brand_id: item.brandId,
            quantity: item.quantity,
            unit_price: item.unitPrice,
          })),
        });
      } else {
        // Group stock - use both new system and legacy system for compatibility
        // First, create material purchase expense record
        await createMaterialPurchase.mutateAsync({
          site_id: payingSiteId,
          purchase_type: "group_stock",
          site_group_id: groupMembership?.groupId,
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
          notes,
          items: items.map((item) => ({
            material_id: item.materialId,
            brand_id: item.brandId,
            quantity: item.quantity,
            unit_price: item.unitPrice,
          })),
        });

        // Also add to legacy group_stock_transactions for backward compatibility
        for (const item of items) {
          const itemValue = item.quantity * item.unitPrice;
          const itemTransportCost =
            totals.subtotal > 0
              ? (parseFloat(transportCost) || 0) * (itemValue / totals.subtotal)
              : 0;

          await addHistoricalPurchase.mutateAsync({
            groupId: groupMembership!.groupId!,
            materialId: item.materialId,
            brandId: item.brandId,
            quantity: item.quantity,
            unitCost: item.unitPrice,
            transportCost: itemTransportCost,
            paymentSiteId: payingSiteId,
            purchaseDate,
            vendorName: selectedVendor?.name || vendorName || undefined,
            notes,
          });
        }
      }

      // Reset form
      setPurchaseDate(new Date().toISOString().split("T")[0]);
      setPayingSiteId(siteId);
      setSelectedVendor(null);
      setVendorName("");
      setTransportCost("");
      setNotes("");
      setItems([]);
      setError("");
      setPurchaseType("group_stock");
      setPaymentMode("");
      setPaymentReference("");
      setBillFile(null);
      setPaymentScreenshot(null);
      setIsPaid(true);
      onClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to add historical purchase";
      setError(message);
    }
  };

  const isSubmitting = addHistoricalPurchase.isPending || createMaterialPurchase.isPending;

  // Allow own site purchases even when not in a group
  const canAddGroupStock = groupMembership?.isInGroup;

  // Reset purchase type to own_site if not in a group
  useEffect(() => {
    if (!canAddGroupStock && purchaseType === "group_stock") {
      setPurchaseType("own_site");
    }
  }, [canAddGroupStock, purchaseType]);

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
          <HistoryIcon color="primary" />
          <Typography component="span" variant="h6">Add Historical Purchase</Typography>
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

        <Alert severity="info" sx={{ mb: 2 }}>
          Use this form to record past purchases made before using this app.
          This helps establish accurate cost tracking for settlements between
          sites.
        </Alert>

        <Grid container spacing={2}>
          {/* Purchase Type Selection */}
          <Grid size={12}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Purchase Type
              </Typography>
              <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                <Box
                  onClick={() => canAddGroupStock && setPurchaseType("own_site")}
                  sx={{
                    flex: 1,
                    minWidth: 200,
                    p: 2,
                    border: 2,
                    borderColor:
                      purchaseType === "own_site" ? "primary.main" : "divider",
                    borderRadius: 1,
                    cursor: "pointer",
                    bgcolor:
                      purchaseType === "own_site" ? "primary.50" : "transparent",
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                >
                  <Typography variant="subtitle2" color={purchaseType === "own_site" ? "primary" : "text.primary"}>
                    Own Site Purchase
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Material used entirely by this site
                  </Typography>
                </Box>
                <Box
                  onClick={() => canAddGroupStock && setPurchaseType("group_stock")}
                  sx={{
                    flex: 1,
                    minWidth: 200,
                    p: 2,
                    border: 2,
                    borderColor:
                      purchaseType === "group_stock" ? "primary.main" : "divider",
                    borderRadius: 1,
                    cursor: canAddGroupStock ? "pointer" : "not-allowed",
                    opacity: canAddGroupStock ? 1 : 0.5,
                    bgcolor:
                      purchaseType === "group_stock" ? "primary.50" : "transparent",
                    "&:hover": canAddGroupStock ? { bgcolor: "action.hover" } : {},
                  }}
                >
                  <Typography variant="subtitle2" color={purchaseType === "group_stock" ? "primary" : "text.primary"}>
                    Group Stock Purchase
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {canAddGroupStock
                      ? "Shared material for multiple sites"
                      : "Site must be in a group"}
                  </Typography>
                </Box>
              </Box>
            </Paper>
          </Grid>

          {/* Purchase Date */}
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              fullWidth
              type="date"
              label="Purchase Date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              required
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

          {/* Paying Site - only show for group stock */}
          {purchaseType === "group_stock" && groupMembership?.allSites && (
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                select
                fullWidth
                label="Paying Site"
                value={payingSiteId}
                onChange={(e) => setPayingSiteId(e.target.value)}
                required
                helperText="Which site's money was used"
              >
                {groupMembership.allSites.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.name}
                    {s.id === siteId && " (Current)"}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          )}

          {/* Transport Cost */}
          <Grid size={{ xs: 12, md: purchaseType === "group_stock" ? 4 : 4 }}>
            <TextField
              fullWidth
              type="number"
              label="Transport Cost"
              value={transportCost}
              onChange={(e) => setTransportCost(e.target.value)}
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
                folderPath={`material-purchases/${siteId}`}
                onUpload={(file) => setBillFile(file)}
                onRemove={() => setBillFile(null)}
                value={billFile}
                accept="all"
                maxSizeMB={10}
                label="Upload bill or receipt"
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
                  folderPath={`payment-screenshots/${siteId}`}
                  onUpload={(file) => setPaymentScreenshot(file)}
                  onRemove={() => setPaymentScreenshot(null)}
                  value={paymentScreenshot}
                  accept="image"
                  maxSizeMB={5}
                  label="Upload payment confirmation"
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
              disabled={!!selectedVendor}
            />
          </Grid>

          {/* Notes */}
          <Grid size={12}>
            <TextField
              fullWidth
              label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes about this purchase..."
            />
          </Grid>

          {/* Add Item Section */}
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
              helperText={
                lastPriceInfo ? (
                  <Box
                    component="span"
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.5,
                      color: lastPriceInfo.source === "catalog" ? "primary.main" :
                             lastPriceInfo.isSameBrand ? "success.main" : "text.secondary",
                    }}
                  >
                    {lastPriceInfo.source === "catalog" ? (
                      <TrendingUpIcon sx={{ fontSize: 14 }} />
                    ) : lastPriceInfo.isSameBrand ? (
                      <TrendingUpIcon sx={{ fontSize: 14 }} />
                    ) : (
                      <TrendingDownIcon sx={{ fontSize: 14 }} />
                    )}
                    {lastPriceInfo.source === "catalog" ? "Catalog: " : "Last: "}
                    {formatCurrency(lastPriceInfo.price)}
                    {lastPriceInfo.vendor && ` (${lastPriceInfo.vendor})`}
                  </Box>
                ) : selectedMaterial ? (
                  selectedVendor ? "No catalog price" : "Select vendor for price"
                ) : undefined
              }
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
                    <TableCell width={50}></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ py: 2 }}
                        >
                          No items added yet
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Typography variant="body2">
                            {item.materialName}
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
                        <TableCell>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => handleRemoveItem(index)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
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
          disabled={isSubmitting || items.length === 0}
        >
          {isSubmitting ? "Saving..." : "Add Purchase"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
