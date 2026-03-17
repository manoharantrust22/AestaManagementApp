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
  Divider,
  Alert,
  FormControlLabel,
  Switch,
  InputAdornment,
  CircularProgress,
  Chip,
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  useAddVendorInventory,
  useUpsertVendorInventory,
} from "@/hooks/queries/useVendorInventory";
import type {
  MaterialWithDetails,
  MaterialBrand,
  VendorWithCategories,
  VendorInventoryFormData,
  VendorInventoryWithDetails,
} from "@/types/material.types";

interface QuickPriceEntryDialogProps {
  open: boolean;
  onClose: () => void;
  material: MaterialWithDetails;
  vendor: VendorWithCategories;
  brand: MaterialBrand;
  existingInventory?: VendorInventoryWithDetails | null;
  onSuccess?: () => void;
}

export default function QuickPriceEntryDialog({
  open,
  onClose,
  material,
  vendor,
  brand,
  existingInventory,
  onSuccess,
}: QuickPriceEntryDialogProps) {
  const isMobile = useIsMobile();
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    current_price: 0,
    price_includes_gst: true,
    gst_rate: 18,
    price_includes_transport: true,
    transport_cost: 0,
    loading_cost: 0,
    unloading_cost: 0,
    min_order_qty: 1,
    lead_time_days: 1,
  });

  const addInventory = useAddVendorInventory();
  const upsertInventory = useUpsertVendorInventory();

  const isEdit = !!existingInventory;

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setError("");
      if (existingInventory) {
        // Editing existing price
        setFormData({
          current_price: existingInventory.current_price || 0,
          price_includes_gst: existingInventory.price_includes_gst ?? true,
          gst_rate: existingInventory.gst_rate || material.gst_rate || 18,
          price_includes_transport: existingInventory.price_includes_transport ?? true,
          transport_cost: existingInventory.transport_cost || 0,
          loading_cost: existingInventory.loading_cost || 0,
          unloading_cost: existingInventory.unloading_cost || 0,
          min_order_qty: existingInventory.min_order_qty || 1,
          lead_time_days: existingInventory.lead_time_days || 1,
        });
      } else {
        // New price entry
        setFormData({
          current_price: 0,
          price_includes_gst: true,
          gst_rate: material.gst_rate || 18,
          price_includes_transport: true,
          transport_cost: 0,
          loading_cost: 0,
          unloading_cost: 0,
          min_order_qty: 1,
          lead_time_days: 1,
        });
      }
    }
  }, [open, existingInventory, material]);

  const handleChange = (field: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  // Calculate total landed cost
  const totalLandedCost = useMemo(() => {
    const price = formData.current_price || 0;
    const transport = formData.price_includes_transport ? 0 : (formData.transport_cost || 0);
    const loading = formData.loading_cost || 0;
    const unloading = formData.unloading_cost || 0;
    return price + transport + loading + unloading;
  }, [formData]);

  const handleSubmit = async () => {
    if (!formData.current_price || formData.current_price <= 0) {
      setError("Price must be greater than 0");
      return;
    }

    try {
      const inventoryData: VendorInventoryFormData = {
        vendor_id: vendor.id,
        material_id: material.id,
        brand_id: brand.id,
        current_price: formData.current_price,
        price_includes_gst: formData.price_includes_gst,
        gst_rate: formData.gst_rate,
        price_includes_transport: formData.price_includes_transport,
        transport_cost: formData.transport_cost,
        loading_cost: formData.loading_cost,
        unloading_cost: formData.unloading_cost,
        is_available: true,
        min_order_qty: formData.min_order_qty,
        unit: material.unit,
        lead_time_days: formData.lead_time_days,
        price_source: "manual",
      };

      // Use upsert to handle both create and update
      await upsertInventory.mutateAsync(inventoryData);

      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save price";
      setError(message);
    }
  };

  const isSubmitting = addInventory.isPending || upsertInventory.isPending;

  // Format brand display name
  const brandDisplayName = brand.variant_name
    ? `${brand.brand_name} ${brand.variant_name}`
    : brand.brand_name;

  return (
    <Dialog
      open={open}
      onClose={(_event, reason) => { if (reason !== "backdropClick") onClose(); }}
      maxWidth="xs"
      fullWidth
      fullScreen={isMobile}
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
          <Typography variant="h6" component="span">
            {isEdit ? "Update Price" : "Add Price"}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.5 }}>
            <Typography variant="body2" color="text.secondary">
              {vendor.name}
            </Typography>
            <Typography variant="body2" color="text.secondary">→</Typography>
            <Chip label={brandDisplayName} size="small" color="primary" />
          </Box>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Grid container spacing={2}>
          {/* Price */}
          <Grid size={12}>
            <TextField
              fullWidth
              label="Unit Price"
              type="number"
              value={formData.current_price || ""}
              onChange={(e) =>
                handleChange("current_price", parseFloat(e.target.value) || 0)
              }
              required
              autoFocus
              slotProps={{
                input: {
                  startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                  endAdornment: <InputAdornment position="end">/ {material.unit}</InputAdornment>,
                  inputProps: { min: 0, step: 0.01 },
                },
              }}
            />
          </Grid>

          {/* GST */}
          <Grid size={6}>
            <FormControlLabel
              control={
                <Switch
                  checked={formData.price_includes_gst}
                  onChange={(e) => handleChange("price_includes_gst", e.target.checked)}
                  size="small"
                />
              }
              label="Price includes GST"
            />
          </Grid>

          <Grid size={6}>
            <TextField
              fullWidth
              label="GST Rate"
              type="number"
              value={formData.gst_rate || ""}
              onChange={(e) => handleChange("gst_rate", parseFloat(e.target.value) || 0)}
              size="small"
              slotProps={{
                input: {
                  endAdornment: <InputAdornment position="end">%</InputAdornment>,
                  inputProps: { min: 0, max: 28 },
                },
              }}
            />
          </Grid>

          {/* Transport */}
          <Grid size={6}>
            <FormControlLabel
              control={
                <Switch
                  checked={formData.price_includes_transport}
                  onChange={(e) => handleChange("price_includes_transport", e.target.checked)}
                  size="small"
                />
              }
              label="Incl. transport"
            />
          </Grid>

          {!formData.price_includes_transport && (
            <Grid size={6}>
              <TextField
                fullWidth
                label="Transport Cost"
                type="number"
                value={formData.transport_cost || ""}
                onChange={(e) =>
                  handleChange("transport_cost", parseFloat(e.target.value) || 0)
                }
                size="small"
                slotProps={{
                  input: {
                    startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                    inputProps: { min: 0 },
                  },
                }}
              />
            </Grid>
          )}

          <Grid size={6}>
            <TextField
              fullWidth
              label="Loading Cost"
              type="number"
              value={formData.loading_cost || ""}
              onChange={(e) =>
                handleChange("loading_cost", parseFloat(e.target.value) || 0)
              }
              size="small"
              slotProps={{
                input: {
                  startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                  inputProps: { min: 0 },
                },
              }}
            />
          </Grid>

          <Grid size={6}>
            <TextField
              fullWidth
              label="Unloading Cost"
              type="number"
              value={formData.unloading_cost || ""}
              onChange={(e) =>
                handleChange("unloading_cost", parseFloat(e.target.value) || 0)
              }
              size="small"
              slotProps={{
                input: {
                  startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                  inputProps: { min: 0 },
                },
              }}
            />
          </Grid>

          {/* Total Landed Cost Display */}
          <Grid size={12}>
            <Box
              sx={{
                bgcolor: "success.50",
                p: 1.5,
                borderRadius: 1,
                border: "1px solid",
                borderColor: "success.200",
              }}
            >
              <Typography variant="body2" color="text.secondary">
                Total Landed Cost
              </Typography>
              <Typography variant="h6" color="success.main">
                ₹{totalLandedCost.toLocaleString("en-IN")} / {material.unit}
              </Typography>
            </Box>
          </Grid>

          <Grid size={12}>
            <Divider />
          </Grid>

          {/* Lead Time */}
          <Grid size={6}>
            <TextField
              fullWidth
              label="Lead Time"
              type="number"
              value={formData.lead_time_days || ""}
              onChange={(e) =>
                handleChange("lead_time_days", parseInt(e.target.value) || 0)
              }
              size="small"
              slotProps={{
                input: {
                  endAdornment: <InputAdornment position="end">days</InputAdornment>,
                  inputProps: { min: 0 },
                },
              }}
            />
          </Grid>

          <Grid size={6}>
            <TextField
              fullWidth
              label="Min Order Qty"
              type="number"
              value={formData.min_order_qty || ""}
              onChange={(e) =>
                handleChange("min_order_qty", parseFloat(e.target.value) || 0)
              }
              size="small"
              slotProps={{
                input: {
                  endAdornment: <InputAdornment position="end">{material.unit}</InputAdornment>,
                  inputProps: { min: 0 },
                },
              }}
            />
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={isSubmitting || !formData.current_price}
          startIcon={isSubmitting ? <CircularProgress size={16} /> : null}
        >
          {isSubmitting ? "Saving..." : isEdit ? "Update Price" : "Save Price"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
