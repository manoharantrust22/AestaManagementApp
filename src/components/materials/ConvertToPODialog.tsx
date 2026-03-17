"use client";

import { useState, useEffect, useMemo } from "react";
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
  Checkbox,
  Chip,
  InputAdornment,
  CircularProgress,
  Tooltip,
} from "@mui/material";
import {
  Close as CloseIcon,
  ShoppingCart as ShoppingCartIcon,
  Warning as WarningIcon,
} from "@mui/icons-material";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useVendorsForMaterials, VendorForMaterials } from "@/hooks/queries/useVendors";
import { useLatestPrice } from "@/hooks/queries/useVendorInventory";
import {
  useRequestItemsForConversion,
  useConvertRequestToPO,
} from "@/hooks/queries/useMaterialRequests";
import type {
  MaterialRequestWithDetails,
  RequestItemForConversion,
} from "@/types/material.types";
import { formatCurrency } from "@/lib/formatters";
import { PRIORITY_LABELS, PRIORITY_COLORS } from "@/types/material.types";
import { useToast } from "@/contexts/ToastContext";

interface ConvertToPODialogProps {
  open: boolean;
  onClose: () => void;
  request: MaterialRequestWithDetails;
  onSuccess?: (poId: string) => void;
}

export default function ConvertToPODialog({
  open,
  onClose,
  request,
  onSuccess,
}: ConvertToPODialogProps) {
  const isMobile = useIsMobile();
  const { showSuccess, showError } = useToast();

  const { data: requestItems = [], isLoading: isLoadingItems } = useRequestItemsForConversion(
    open ? request.id : undefined
  );
  const convertToPO = useConvertRequestToPO();

  // Extract material IDs from request items for vendor filtering
  const materialIds = useMemo(() => {
    return requestItems
      .filter((item: any) => item.remaining_qty > 0)
      .map((item: any) => item.material_id);
  }, [requestItems]);

  // Get vendors that supply these specific materials
  const { data: vendors = [], isLoading: isLoadingVendors } = useVendorsForMaterials(
    materialIds.length > 0 ? materialIds : undefined,
    request.site_id
  );

  // Form state
  const [selectedVendor, setSelectedVendor] = useState<VendorForMaterials | null>(null);
  const [items, setItems] = useState<RequestItemForConversion[]>([]);
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [paymentTiming, setPaymentTiming] = useState<"advance" | "on_delivery">("on_delivery");
  const [transportCost, setTransportCost] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  // Initialize items from request when data loads
  useEffect(() => {
    if (requestItems.length > 0 && items.length === 0) {
      setItems(requestItems);
    }
  }, [requestItems, items.length]);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      setSelectedVendor(null);
      setItems([]);
      setExpectedDeliveryDate("");
      setDeliveryAddress("");
      setPaymentTerms("");
      setPaymentTiming("on_delivery");
      setTransportCost("");
      setNotes("");
      setError("");
    }
  }, [open]);

  // Calculate totals
  const totals = useMemo(() => {
    const selectedItems = items.filter((item) => item.selected && item.quantity_to_order > 0);

    let subtotal = 0;
    let taxAmount = 0;

    selectedItems.forEach((item) => {
      const itemTotal = item.quantity_to_order * item.unit_price;
      const itemTax = item.tax_rate ? (itemTotal * item.tax_rate) / 100 : 0;
      subtotal += itemTotal;
      taxAmount += itemTax;
    });

    const transport = parseFloat(transportCost) || 0;
    const total = subtotal + taxAmount + transport;

    return {
      subtotal,
      taxAmount,
      transport,
      total,
      selectedCount: selectedItems.length,
    };
  }, [items, transportCost]);

  // Check if form is valid
  const isValid = useMemo(() => {
    if (!selectedVendor) return false;
    if (totals.selectedCount === 0) return false;

    // Check all selected items have valid prices
    const selectedItems = items.filter((item) => item.selected && item.quantity_to_order > 0);
    return selectedItems.every((item) => item.unit_price > 0);
  }, [selectedVendor, totals.selectedCount, items]);

  // Handle item selection toggle
  const handleToggleItem = (itemId: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, selected: !item.selected } : item
      )
    );
  };

  // Handle select all / deselect all
  const handleToggleAll = () => {
    const selectableItems = items.filter((item) => item.remaining_qty > 0);
    const allSelected = selectableItems.every((item) => item.selected);

    setItems((prev) =>
      prev.map((item) =>
        item.remaining_qty > 0 ? { ...item, selected: !allSelected } : item
      )
    );
  };

  // Handle quantity change
  const handleQuantityChange = (itemId: string, value: string) => {
    const qty = parseFloat(value) || 0;
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        // Ensure quantity doesn't exceed remaining
        const validQty = Math.min(Math.max(0, qty), item.remaining_qty);
        return { ...item, quantity_to_order: validQty };
      })
    );
  };

  // Handle price change
  const handlePriceChange = (itemId: string, value: string) => {
    const price = parseFloat(value) || 0;
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, unit_price: price } : item
      )
    );
  };

  // Handle submit
  const handleSubmit = async () => {
    if (!selectedVendor) {
      setError("Please select a vendor");
      return;
    }

    const selectedItems = items.filter((item) => item.selected && item.quantity_to_order > 0);
    if (selectedItems.length === 0) {
      setError("Please select at least one item to order");
      return;
    }

    // Check all selected items have prices
    const itemsWithoutPrice = selectedItems.filter((item) => item.unit_price <= 0);
    if (itemsWithoutPrice.length > 0) {
      setError("Please enter prices for all selected items");
      return;
    }

    setError("");

    try {
      const result = await convertToPO.mutateAsync({
        request_id: request.id,
        vendor_id: selectedVendor.id,
        items: selectedItems.map((item) => ({
          request_item_id: item.id,
          material_id: item.material_id,
          brand_id: item.brand_id || undefined,
          quantity: item.quantity_to_order,
          unit_price: item.unit_price,
          tax_rate: item.tax_rate || undefined,
        })),
        expected_delivery_date: expectedDeliveryDate || undefined,
        delivery_address: deliveryAddress || undefined,
        payment_terms: paymentTerms || undefined,
        payment_timing: paymentTiming,
        transport_cost: parseFloat(transportCost) || undefined,
        notes: notes || undefined,
      });

      showSuccess(`Purchase Order ${result.po_number} created successfully!`);
      onSuccess?.(result.id);
      onClose();
    } catch (err: any) {
      console.error("Failed to convert request to PO:", err);
      showError(err.message || "Failed to create purchase order");
      setError(err.message || "Failed to create purchase order");
    }
  };

  // Check if there are items available to convert
  const hasConvertibleItems = items.some((item) => item.remaining_qty > 0);

  return (
    <Dialog
      open={open}
      onClose={(_event, reason) => { if (reason !== "backdropClick") onClose(); }}
      maxWidth="lg"
      fullWidth
      fullScreen={isMobile}
      PaperProps={{
        sx: { minHeight: isMobile ? "100%" : "80vh" },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          pb: 1,
        }}
      >
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
            <ShoppingCartIcon color="primary" />
            <Typography variant="h6" component="span">Convert Request to Purchase Order</Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            <Typography variant="body2" color="text.secondary">
              {request.request_number}
            </Typography>
            <Chip
              label={PRIORITY_LABELS[request.priority]}
              size="small"
              color={PRIORITY_COLORS[request.priority]}
            />
            {request.required_by_date && (
              <Typography variant="body2" color="text.secondary">
                Required by: {new Date(request.required_by_date).toLocaleDateString()}
              </Typography>
            )}
          </Box>
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

        {!hasConvertibleItems && !isLoadingItems && (
          <Alert severity="info" sx={{ mb: 2 }}>
            All items from this request have already been converted to purchase orders.
          </Alert>
        )}

        <Grid container spacing={3}>
          {/* Vendor Selection */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Autocomplete
              options={vendors}
              value={selectedVendor}
              onChange={(_, newValue) => setSelectedVendor(newValue)}
              getOptionLabel={(option) => option.name}
              loading={isLoadingVendors}
              openOnFocus
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Select Vendor *"
                  placeholder={isLoadingVendors ? "Loading vendors..." : "Click or type to search..."}
                  size="small"
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {isLoadingVendors ? <CircularProgress color="inherit" size={20} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
              renderOption={(props, option) => (
                <li {...props} key={option.id}>
                  <Box sx={{ width: "100%" }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <Typography variant="body2" fontWeight={option.isPreferred ? 600 : 400}>
                        {option.name}
                        {option.isPreferred && (
                          <Chip
                            label="Preferred"
                            size="small"
                            color="success"
                            sx={{ ml: 1, height: 18, fontSize: "0.65rem" }}
                          />
                        )}
                      </Typography>
                      <Typography variant="caption" color="primary.main" fontWeight={500}>
                        {option.suppliedMaterialCount}/{materialIds.length} materials
                      </Typography>
                    </Box>
                    <Box sx={{ display: "flex", gap: 2, mt: 0.25 }}>
                      {option.phone && (
                        <Typography variant="caption" color="text.secondary">
                          {option.phone}
                        </Typography>
                      )}
                      {option.purchaseCount > 0 && (
                        <Typography variant="caption" color="text.secondary">
                          {option.purchaseCount} orders
                        </Typography>
                      )}
                      {option.city && (
                        <Typography variant="caption" color="text.secondary">
                          {option.city}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                </li>
              )}
              noOptionsText={
                isLoadingItems
                  ? "Loading materials..."
                  : materialIds.length === 0
                  ? "No materials available to order"
                  : "No vendors supply these materials"
              }
            />
            {vendors.length > 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                Showing {vendors.length} vendor{vendors.length !== 1 ? "s" : ""} that supply the selected materials
              </Typography>
            )}
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <TextField
              fullWidth
              type="date"
              label="Expected Delivery Date"
              value={expectedDeliveryDate}
              onChange={(e) => setExpectedDeliveryDate(e.target.value)}
              size="small"
              InputLabelProps={{ shrink: true }}
            />
          </Grid>

          {/* Items Table */}
          <Grid size={12}>
            <Typography variant="subtitle2" gutterBottom>
              Select Items to Order
            </Typography>
            {isLoadingItems ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                <CircularProgress />
              </Box>
            ) : (
              <Paper variant="outlined" sx={{ overflow: "auto" }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: "grey.50" }}>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={
                            items.filter((i) => i.remaining_qty > 0).length > 0 &&
                            items.filter((i) => i.remaining_qty > 0).every((i) => i.selected)
                          }
                          indeterminate={
                            items.some((i) => i.selected && i.remaining_qty > 0) &&
                            !items.filter((i) => i.remaining_qty > 0).every((i) => i.selected)
                          }
                          onChange={handleToggleAll}
                        />
                      </TableCell>
                      <TableCell>Material</TableCell>
                      <TableCell align="right">Approved</TableCell>
                      <TableCell align="right">Ordered</TableCell>
                      <TableCell align="right">Remaining</TableCell>
                      <TableCell align="right" sx={{ minWidth: 100 }}>
                        Qty to Order
                      </TableCell>
                      <TableCell align="right" sx={{ minWidth: 120 }}>
                        Unit Price (₹)
                      </TableCell>
                      <TableCell align="right">Total</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {items.map((item) => {
                      const isDisabled = item.remaining_qty <= 0;
                      const itemTotal = item.selected
                        ? item.quantity_to_order * item.unit_price
                        : 0;

                      return (
                        <TableRow
                          key={item.id}
                          sx={{
                            opacity: isDisabled ? 0.5 : 1,
                            bgcolor: item.selected && !isDisabled ? "action.selected" : undefined,
                          }}
                        >
                          <TableCell padding="checkbox">
                            <Checkbox
                              checked={item.selected && !isDisabled}
                              onChange={() => handleToggleItem(item.id)}
                              disabled={isDisabled}
                            />
                          </TableCell>
                          <TableCell>
                            <Box>
                              <Typography variant="body2">
                                {item.material_name}
                                {item.material_code && (
                                  <Typography
                                    component="span"
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{ ml: 1 }}
                                  >
                                    ({item.material_code})
                                  </Typography>
                                )}
                              </Typography>
                              {item.brand_name && (
                                <Typography variant="caption" color="text.secondary">
                                  Brand: {item.brand_name}
                                </Typography>
                              )}
                            </Box>
                          </TableCell>
                          <TableCell align="right">
                            {item.approved_qty} {item.unit}
                          </TableCell>
                          <TableCell align="right">
                            {item.already_ordered_qty > 0 ? (
                              <Typography variant="body2" color="warning.main">
                                {item.already_ordered_qty} {item.unit}
                              </Typography>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell align="right">
                            {isDisabled ? (
                              <Tooltip title="Already fully ordered">
                                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 0.5 }}>
                                  <WarningIcon fontSize="small" color="disabled" />
                                  <Typography variant="body2" color="text.disabled">
                                    0
                                  </Typography>
                                </Box>
                              </Tooltip>
                            ) : (
                              <Typography variant="body2" color="success.main" fontWeight={500}>
                                {item.remaining_qty} {item.unit}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell align="right">
                            <TextField
                              type="number"
                              size="small"
                              value={item.quantity_to_order || ""}
                              onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                              disabled={isDisabled || !item.selected}
                              inputProps={{
                                min: 0,
                                max: item.remaining_qty,
                                step: 1,
                                style: { textAlign: "right", width: 60 },
                              }}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <TextField
                              type="number"
                              size="small"
                              value={item.unit_price || ""}
                              onChange={(e) => handlePriceChange(item.id, e.target.value)}
                              disabled={isDisabled || !item.selected}
                              inputProps={{
                                min: 0,
                                step: 0.01,
                                style: { textAlign: "right", width: 80 },
                              }}
                              InputProps={{
                                startAdornment: (
                                  <InputAdornment position="start">₹</InputAdornment>
                                ),
                              }}
                            />
                          </TableCell>
                          <TableCell align="right">
                            {item.selected && !isDisabled ? (
                              <Typography variant="body2" fontWeight={500}>
                                {formatCurrency(itemTotal)}
                              </Typography>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Paper>
            )}
          </Grid>

          {/* Additional Fields */}
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField
              fullWidth
              label="Delivery Address"
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
              size="small"
              multiline
              rows={2}
            />
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Grid container spacing={2}>
              <Grid size={6}>
                <TextField
                  fullWidth
                  label="Payment Terms"
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  size="small"
                  placeholder="e.g., Net 30"
                />
              </Grid>
              <Grid size={6}>
                <TextField
                  fullWidth
                  select
                  label="Payment Timing"
                  value={paymentTiming}
                  onChange={(e) => setPaymentTiming(e.target.value as "advance" | "on_delivery")}
                  size="small"
                  SelectProps={{ native: true }}
                >
                  <option value="on_delivery">On Delivery</option>
                  <option value="advance">Advance</option>
                </TextField>
              </Grid>
            </Grid>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <TextField
              fullWidth
              type="number"
              label="Transport Cost"
              value={transportCost}
              onChange={(e) => setTransportCost(e.target.value)}
              size="small"
              InputProps={{
                startAdornment: <InputAdornment position="start">₹</InputAdornment>,
              }}
            />
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <TextField
              fullWidth
              label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              size="small"
              multiline
              rows={2}
            />
          </Grid>

          {/* Totals */}
          <Grid size={12}>
            <Divider sx={{ my: 1 }} />
            <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
              <Box sx={{ minWidth: 250 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                  <Typography variant="body2" color="text.secondary">
                    Subtotal ({totals.selectedCount} items):
                  </Typography>
                  <Typography variant="body2">{formatCurrency(totals.subtotal)}</Typography>
                </Box>
                <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                  <Typography variant="body2" color="text.secondary">
                    GST:
                  </Typography>
                  <Typography variant="body2">{formatCurrency(totals.taxAmount)}</Typography>
                </Box>
                {totals.transport > 0 && (
                  <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                    <Typography variant="body2" color="text.secondary">
                      Transport:
                    </Typography>
                    <Typography variant="body2">{formatCurrency(totals.transport)}</Typography>
                  </Box>
                )}
                <Divider sx={{ my: 1 }} />
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="subtitle1" fontWeight={600}>
                    Total:
                  </Typography>
                  <Typography variant="subtitle1" fontWeight={600} color="primary">
                    {formatCurrency(totals.total)}
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!isValid || convertToPO.isPending}
          startIcon={convertToPO.isPending ? <CircularProgress size={16} /> : <ShoppingCartIcon />}
        >
          {convertToPO.isPending ? "Creating..." : "Create Purchase Order"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
