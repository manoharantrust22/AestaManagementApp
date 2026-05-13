"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Box,
  Typography,
  IconButton,
  Alert,
  InputAdornment,
  Divider,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Autocomplete,
  Paper,
  Chip,
  Checkbox,
  FormControlLabel,
} from "@mui/material";
import {
  Close as CloseIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
} from "@mui/icons-material";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  useCreateRentalOrder,
  useRentalItems,
  useRentalStores,
  useRentalStoreInventory,
} from "@/hooks/queries/useRentals";
import type {
  RentalOrderFormData,
  RentalOrderItemFormData,
  RentalItemWithDetails,
  TransportHandler,
  RentalRateType,
} from "@/types/rental.types";
import { TRANSPORT_HANDLER_LABELS } from "@/types/rental.types";
import type { Vendor } from "@/types/material.types";
import dayjs from "dayjs";

interface RentalOrderDialogProps {
  open: boolean;
  onClose: () => void;
  siteId: string;
}

interface OrderLineItem extends RentalOrderItemFormData {
  tempId: string;
  itemName: string;
  itemRateType: RentalRateType;
}

export default function RentalOrderDialog({
  open,
  onClose,
  siteId,
}: RentalOrderDialogProps) {
  const isMobile = useIsMobile();

  const { data: rentalStores = [] } = useRentalStores();
  const { data: allRentalItems = [] } = useRentalItems();
  const createOrder = useCreateRentalOrder();

  const [error, setError] = useState("");
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [lineItems, setLineItems] = useState<OrderLineItem[]>([]);

  // Form state
  const [startDate, setStartDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [expectedReturnDate, setExpectedReturnDate] = useState("");
  const [transportCostOutward, setTransportCostOutward] = useState(0);
  const [loadingCostOutward, setLoadingCostOutward] = useState(0);
  const [unloadingCostOutward, setUnloadingCostOutward] = useState(0);
  const [outwardBy, setOutwardBy] = useState<TransportHandler | "">("");
  const [notes, setNotes] = useState("");
  const [discountPercentage, setDiscountPercentage] = useState(0);
  const [excludeStartDate, setExcludeStartDate] = useState(false);

  // Get inventory for selected vendor
  const { data: vendorInventory = [] } = useRentalStoreInventory(
    selectedVendor?.id || ""
  );

  // Item selection state
  const [selectedItem, setSelectedItem] = useState<RentalItemWithDetails | null>(null);
  const [itemQuantity, setItemQuantity] = useState(1);
  const [itemRate, setItemRate] = useState(0);
  const [itemHours, setItemHours] = useState<number>(8); // Default 8 hours for hourly items

  useEffect(() => {
    if (!open) {
      // Reset form
      setSelectedVendor(null);
      setLineItems([]);
      setStartDate(dayjs().format("YYYY-MM-DD"));
      setExpectedReturnDate("");
      setTransportCostOutward(0);
      setLoadingCostOutward(0);
      setUnloadingCostOutward(0);
      setOutwardBy("");
      setNotes("");
      setDiscountPercentage(0);
      setExcludeStartDate(false);
      setSelectedItem(null);
      setItemQuantity(1);
      setItemRate(0);
      setItemHours(8);
      setError("");
    }
  }, [open]);

  // Get rate from vendor inventory when item is selected
  useEffect(() => {
    if (selectedItem && selectedVendor) {
      const inventoryItem = vendorInventory.find(
        (inv) => inv.rental_item_id === selectedItem.id
      );
      if (inventoryItem) {
        setItemRate(inventoryItem.daily_rate);
      } else {
        setItemRate(selectedItem.default_daily_rate || 0);
      }
    }
  }, [selectedItem, selectedVendor, vendorInventory]);

  const handleAddItem = () => {
    if (!selectedItem) {
      setError("Please select an item");
      return;
    }
    if (itemQuantity <= 0) {
      setError("Quantity must be greater than 0");
      return;
    }
    if (itemRate <= 0) {
      setError("Rate must be greater than 0");
      return;
    }

    // Check if item already exists
    const existingIndex = lineItems.findIndex(
      (li) => li.rental_item_id === selectedItem.id
    );

    if (existingIndex >= 0) {
      // Update existing
      setLineItems((prev) =>
        prev.map((li, i) =>
          i === existingIndex
            ? {
                ...li,
                quantity: li.quantity + itemQuantity,
              }
            : li
        )
      );
    } else {
      // Add new
      const isHourly = selectedItem.rate_type === "hourly";
      const newItem: OrderLineItem = {
        tempId: `temp-${Date.now()}`,
        rental_item_id: selectedItem.id,
        itemName: selectedItem.name,
        itemRateType: selectedItem.rate_type || "daily",
        quantity: itemQuantity,
        daily_rate_default: selectedItem.default_daily_rate || itemRate,
        daily_rate_actual: itemRate,
        rate_type: selectedItem.rate_type || "daily",
        hours_used: isHourly ? itemHours : undefined,
      };
      setLineItems((prev) => [...prev, newItem]);
    }

    // Reset selection
    setSelectedItem(null);
    setItemQuantity(1);
    setItemRate(0);
    setItemHours(8);
    setError("");
  };

  const handleRemoveItem = (tempId: string) => {
    setLineItems((prev) => prev.filter((li) => li.tempId !== tempId));
  };

  const handleUpdateItemRate = (tempId: string, newRate: number) => {
    setLineItems((prev) =>
      prev.map((li) =>
        li.tempId === tempId ? { ...li, daily_rate_actual: newRate } : li
      )
    );
  };

  const handleUpdateItemQuantity = (tempId: string, newQty: number) => {
    setLineItems((prev) =>
      prev.map((li) =>
        li.tempId === tempId ? { ...li, quantity: newQty } : li
      )
    );
  };

  const handleUpdateItemHours = (tempId: string, newHours: number) => {
    setLineItems((prev) =>
      prev.map((li) =>
        li.tempId === tempId ? { ...li, hours_used: newHours } : li
      )
    );
  };

  // Calculate estimated total
  const estimatedDays = useMemo(() => {
    if (!expectedReturnDate || !startDate) return 30;
    const start = dayjs(startDate);
    const end = dayjs(expectedReturnDate);
    return Math.max(1, end.diff(start, "day") + (excludeStartDate ? 0 : 1));
  }, [startDate, expectedReturnDate, excludeStartDate]);

  const estimatedTotal = useMemo(() => {
    const itemsTotal = lineItems.reduce((sum, li) => {
      if (li.rate_type === "hourly") {
        // Hourly items: qty × rate × hours
        return sum + li.quantity * li.daily_rate_actual * (li.hours_used || 8);
      } else {
        // Daily items: qty × rate × days
        return sum + li.quantity * li.daily_rate_actual * estimatedDays;
      }
    }, 0);
    const discount = (itemsTotal * discountPercentage) / 100;
    const transport = transportCostOutward + loadingCostOutward + unloadingCostOutward;
    return itemsTotal - discount + transport;
  }, [
    lineItems,
    estimatedDays,
    discountPercentage,
    transportCostOutward,
    loadingCostOutward,
    unloadingCostOutward,
  ]);

  const handleSubmit = async () => {
    if (!selectedVendor) {
      setError("Please select a rental store");
      return;
    }
    if (lineItems.length === 0) {
      setError("Please add at least one item");
      return;
    }

    try {
      const formData: RentalOrderFormData = {
        site_id: siteId,
        vendor_id: selectedVendor.id,
        start_date: startDate,
        expected_return_date: expectedReturnDate || undefined,
        transport_cost_outward: transportCostOutward,
        loading_cost_outward: loadingCostOutward,
        unloading_cost_outward: unloadingCostOutward,
        outward_by: outwardBy || undefined,
        notes: notes || undefined,
        negotiated_discount_percentage: discountPercentage,
        exclude_start_date: excludeStartDate,
        items: lineItems.map((li) => ({
          rental_item_id: li.rental_item_id,
          quantity: li.quantity,
          daily_rate_default: li.daily_rate_default,
          daily_rate_actual: li.daily_rate_actual,
          rate_type: li.rate_type,
          hours_used: li.hours_used,
        })),
      };

      await createOrder.mutateAsync(formData);
      onClose();
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message || "Failed to create rental order");
    }
  };

  const isLoading = createOrder.isPending;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      fullScreen={isMobile}
    >
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h6" component="span">Create Rental Order</Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
            {error}
          </Alert>
        )}

        <Grid container spacing={2}>
          {/* Store Selection */}
          <Grid size={12}>
            <Autocomplete
              options={rentalStores}
              getOptionLabel={(option) =>
                option.shop_name || option.name || ""
              }
              value={selectedVendor}
              onChange={(_, value) => setSelectedVendor(value as Vendor | null)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Select Rental Store"
                  required
                  placeholder="Search rental stores..."
                />
              )}
              renderOption={(props, option) => (
                <li {...props} key={option.id}>
                  <Box>
                    <Typography variant="body1">
                      {option.shop_name || option.name}
                    </Typography>
                    {option.phone && (
                      <Typography variant="caption" color="text.secondary">
                        {option.phone}
                      </Typography>
                    )}
                  </Box>
                </li>
              )}
            />
          </Grid>

          {/* Dates */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              type="date"
              label="Start Date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              required
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              type="date"
              label="Expected Return Date"
              value={expectedReturnDate}
              onChange={(e) => setExpectedReturnDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              helperText="Leave empty if unknown"
            />
          </Grid>

          {/* Exclude start date */}
          <Grid size={12}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={excludeStartDate}
                  onChange={(e) => setExcludeStartDate(e.target.checked)}
                  size="small"
                />
              }
              label={
                <Box component="span">
                  <Typography variant="body2" component="span">
                    Exclude start date from billing
                  </Typography>
                  <Typography variant="caption" color="text.secondary" component="span" sx={{ ml: 1 }}>
                    (e.g. centering materials — pickup day not counted)
                  </Typography>
                </Box>
              }
            />
          </Grid>

          {/* Item Selection */}
          <Grid size={12}>
            <Divider sx={{ my: 1 }}>
              <Chip label="Add Items" size="small" />
            </Divider>
          </Grid>

          <Grid size={{ xs: 12, md: 5 }}>
            <Autocomplete
              options={allRentalItems}
              getOptionLabel={(option) => `${option.name} (${option.code || ""})`}
              value={selectedItem}
              onChange={(_, value) => setSelectedItem(value)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Select Item"
                  placeholder="Search items..."
                  size="small"
                />
              )}
            />
          </Grid>

          <Grid size={{ xs: 4, md: 2 }}>
            <TextField
              fullWidth
              type="number"
              label="Qty"
              value={itemQuantity}
              onChange={(e) => setItemQuantity(parseInt(e.target.value) || 1)}
              size="small"
              inputProps={{ min: 1 }}
            />
          </Grid>

          <Grid size={{ xs: 4, md: 2 }}>
            <TextField
              fullWidth
              type="number"
              label={selectedItem?.rate_type === "hourly" ? "Rate/Hour" : "Rate/Day"}
              value={itemRate}
              onChange={(e) => setItemRate(parseFloat(e.target.value) || 0)}
              size="small"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">₹</InputAdornment>
                ),
              }}
            />
          </Grid>

          {selectedItem?.rate_type === "hourly" && (
            <Grid size={{ xs: 4, md: 2 }}>
              <TextField
                fullWidth
                type="number"
                label="Hours"
                value={itemHours}
                onChange={(e) => setItemHours(parseFloat(e.target.value) || 8)}
                size="small"
                inputProps={{ min: 1 }}
              />
            </Grid>
          )}

          <Grid size={{ xs: 4, md: selectedItem?.rate_type === "hourly" ? 1 : 2 }}>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={handleAddItem}
              disabled={!selectedItem}
              sx={{ minWidth: 0 }}
            >
              Add
            </Button>
          </Grid>

          {/* Items Table */}
          {lineItems.length > 0 && (
            <Grid size={12}>
              <Paper variant="outlined" sx={{ mt: 1 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Item</TableCell>
                      <TableCell align="center">Qty</TableCell>
                      <TableCell align="right">Rate</TableCell>
                      <TableCell align="center">Duration</TableCell>
                      <TableCell align="right">Est. Amount</TableCell>
                      <TableCell align="center" width={50}></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {lineItems.map((li) => {
                      const isHourly = li.rate_type === "hourly";
                      const amount = isHourly
                        ? li.quantity * li.daily_rate_actual * (li.hours_used || 8)
                        : li.quantity * li.daily_rate_actual * estimatedDays;
                      return (
                        <TableRow key={li.tempId}>
                          <TableCell>
                            {li.itemName}
                            {isHourly && (
                              <Chip label="Hourly" size="small" sx={{ ml: 1 }} />
                            )}
                          </TableCell>
                          <TableCell align="center">
                            <TextField
                              type="number"
                              value={li.quantity}
                              onChange={(e) =>
                                handleUpdateItemQuantity(
                                  li.tempId,
                                  parseInt(e.target.value) || 1
                                )
                              }
                              size="small"
                              sx={{ width: 70 }}
                              inputProps={{ min: 1 }}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <TextField
                              type="number"
                              value={li.daily_rate_actual}
                              onChange={(e) =>
                                handleUpdateItemRate(
                                  li.tempId,
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              size="small"
                              sx={{ width: 90 }}
                              InputProps={{
                                startAdornment: (
                                  <InputAdornment position="start">₹</InputAdornment>
                                ),
                              }}
                            />
                            <Typography variant="caption" display="block" color="text.secondary">
                              /{isHourly ? "hr" : "day"}
                            </Typography>
                          </TableCell>
                          <TableCell align="center">
                            {isHourly ? (
                              <TextField
                                type="number"
                                value={li.hours_used || 8}
                                onChange={(e) =>
                                  handleUpdateItemHours(
                                    li.tempId,
                                    parseFloat(e.target.value) || 8
                                  )
                                }
                                size="small"
                                sx={{ width: 70 }}
                                inputProps={{ min: 1 }}
                              />
                            ) : (
                              <Typography variant="body2">
                                {estimatedDays} days
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell align="right">
                            ₹{amount.toLocaleString("en-IN")}
                          </TableCell>
                          <TableCell align="center">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleRemoveItem(li.tempId)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Paper>
            </Grid>
          )}

          {/* Transport Details */}
          <Grid size={12}>
            <Divider sx={{ my: 1 }}>
              <Chip label="Transport (Outward)" size="small" />
            </Divider>
          </Grid>

          <Grid size={{ xs: 6, sm: 3 }}>
            <TextField
              fullWidth
              type="number"
              label="Transport"
              value={transportCostOutward}
              onChange={(e) =>
                setTransportCostOutward(parseFloat(e.target.value) || 0)
              }
              size="small"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">₹</InputAdornment>
                ),
              }}
            />
          </Grid>

          <Grid size={{ xs: 6, sm: 3 }}>
            <TextField
              fullWidth
              type="number"
              label="Loading"
              value={loadingCostOutward}
              onChange={(e) =>
                setLoadingCostOutward(parseFloat(e.target.value) || 0)
              }
              size="small"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">₹</InputAdornment>
                ),
              }}
            />
          </Grid>

          <Grid size={{ xs: 6, sm: 3 }}>
            <TextField
              fullWidth
              type="number"
              label="Unloading"
              value={unloadingCostOutward}
              onChange={(e) =>
                setUnloadingCostOutward(parseFloat(e.target.value) || 0)
              }
              size="small"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">₹</InputAdornment>
                ),
              }}
            />
          </Grid>

          <Grid size={{ xs: 6, sm: 3 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Handled By</InputLabel>
              <Select
                value={outwardBy}
                label="Handled By"
                onChange={(e) =>
                  setOutwardBy(e.target.value as TransportHandler | "")
                }
              >
                <MenuItem value="">Not specified</MenuItem>
                {(Object.keys(TRANSPORT_HANDLER_LABELS) as TransportHandler[]).map(
                  (handler) => (
                    <MenuItem key={handler} value={handler}>
                      {TRANSPORT_HANDLER_LABELS[handler]}
                    </MenuItem>
                  )
                )}
              </Select>
            </FormControl>
          </Grid>

          {/* Discount & Notes */}
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              fullWidth
              type="number"
              label="Discount %"
              value={discountPercentage}
              onChange={(e) =>
                setDiscountPercentage(parseFloat(e.target.value) || 0)
              }
              size="small"
              InputProps={{
                endAdornment: <InputAdornment position="end">%</InputAdornment>,
              }}
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 8 }}>
            <TextField
              fullWidth
              label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              size="small"
              placeholder="Any special notes..."
            />
          </Grid>

          {/* Estimated Total */}
          {lineItems.length > 0 && (
            <Grid size={12}>
              <Paper
                variant="outlined"
                sx={{ p: 2, bgcolor: "action.hover", mt: 1 }}
              >
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="subtitle1">
                    Estimated Total ({estimatedDays} days):
                  </Typography>
                  <Typography variant="h6" color="primary">
                    ₹{estimatedTotal.toLocaleString("en-IN")}
                  </Typography>
                </Box>
              </Paper>
            </Grid>
          )}
        </Grid>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={isLoading || !selectedVendor || lineItems.length === 0}
        >
          {isLoading ? "Creating..." : "Create Order"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
