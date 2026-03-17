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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  InputAdornment,
  Autocomplete,
  CircularProgress,
} from "@mui/material";
import {
  Close as CloseIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
} from "@mui/icons-material";
import VendorAutocomplete from "@/components/common/VendorAutocomplete";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useMaterials } from "@/hooks/queries/useMaterials";
import { useMaterialBrands } from "@/hooks/queries/useMaterials";
import {
  useAddVendorInventory,
  useUpdateVendorInventory,
  useVendorInventoryItem,
} from "@/hooks/queries/useVendorInventory";
import type {
  VendorInventoryWithDetails,
  VendorInventoryFormData,
  MaterialWithDetails,
  VendorWithCategories,
} from "@/types/material.types";

interface VendorInventoryDialogProps {
  open: boolean;
  onClose: () => void;
  // Either provide vendor (from vendor details) or material (from material details)
  vendor?: VendorWithCategories | null;
  material?: MaterialWithDetails | null;
  // For editing an existing inventory item
  inventoryItem?: VendorInventoryWithDetails | null;
  inventoryItemId?: string;
}

export default function VendorInventoryDialog({
  open,
  onClose,
  vendor,
  material,
  inventoryItem,
  inventoryItemId,
}: VendorInventoryDialogProps) {
  const isMobile = useIsMobile();
  const isEdit = !!inventoryItem || !!inventoryItemId;

  // Load inventory item if only ID is provided
  const { data: loadedItem, isLoading: isLoadingItem } = useVendorInventoryItem(
    inventoryItemId && !inventoryItem ? inventoryItemId : undefined
  );

  // Use either passed item or loaded item
  const existingItem = inventoryItem || loadedItem;

  // Mutations
  const addInventory = useAddVendorInventory();
  const updateInventory = useUpdateVendorInventory();

  // Load materials for selection (if coming from vendor details)
  const { data: materials = [], isLoading: isLoadingMaterials } = useMaterials();

  // Load brands for selected material
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const { data: brands = [] } = useMaterialBrands(selectedMaterialId || undefined);

  // Track selected vendor (when vendor is not pre-selected)
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);

  const [error, setError] = useState("");
  const [formData, setFormData] = useState<Partial<VendorInventoryFormData>>({
    vendor_id: "",
    material_id: undefined,
    brand_id: undefined,
    current_price: 0,
    price_includes_gst: false,
    gst_rate: 18,
    price_includes_transport: false,
    transport_cost: 0,
    loading_cost: 0,
    unloading_cost: 0,
    is_available: true,
    min_order_qty: 1,
    unit: "",
    lead_time_days: 1,
    notes: "",
  });

  // Reset form when dialog opens or item changes
  useEffect(() => {
    if (existingItem) {
      setFormData({
        vendor_id: existingItem.vendor_id,
        material_id: existingItem.material_id || undefined,
        brand_id: existingItem.brand_id || undefined,
        current_price: existingItem.current_price || 0,
        price_includes_gst: existingItem.price_includes_gst || false,
        gst_rate: existingItem.gst_rate || 18,
        price_includes_transport: existingItem.price_includes_transport || false,
        transport_cost: existingItem.transport_cost || 0,
        loading_cost: existingItem.loading_cost || 0,
        unloading_cost: existingItem.unloading_cost || 0,
        is_available: existingItem.is_available ?? true,
        min_order_qty: existingItem.min_order_qty || 1,
        unit: existingItem.unit || existingItem.material?.unit || "",
        lead_time_days: existingItem.lead_time_days || 1,
        notes: existingItem.notes || "",
      });
      setSelectedMaterialId(existingItem.material_id || null);
    } else {
      // Reset to defaults
      setFormData({
        vendor_id: vendor?.id || "",
        material_id: material?.id || undefined,
        brand_id: undefined,
        current_price: 0,
        price_includes_gst: false,
        gst_rate: 18,
        price_includes_transport: false,
        transport_cost: 0,
        loading_cost: 0,
        unloading_cost: 0,
        is_available: true,
        min_order_qty: 1,
        unit: material?.unit || "",
        lead_time_days: 1,
        notes: "",
      });
      setSelectedMaterialId(material?.id || null);
      setSelectedVendorId(null);
    }
    setError("");
  }, [existingItem, vendor, material, open]);

  // Get selected material details
  const selectedMaterial = useMemo(() => {
    if (material) return material;
    if (!selectedMaterialId) return null;
    return materials.find((m) => m.id === selectedMaterialId) || null;
  }, [material, selectedMaterialId, materials]);

  // Calculate total landed cost
  const totalLandedCost = useMemo(() => {
    const price = formData.current_price || 0;
    const transport = formData.price_includes_transport ? 0 : (formData.transport_cost || 0);
    const loading = formData.loading_cost || 0;
    const unloading = formData.unloading_cost || 0;
    return price + transport + loading + unloading;
  }, [formData.current_price, formData.price_includes_transport, formData.transport_cost, formData.loading_cost, formData.unloading_cost]);

  const handleChange = (field: keyof VendorInventoryFormData, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  const handleMaterialChange = (mat: MaterialWithDetails | null) => {
    setSelectedMaterialId(mat?.id || null);
    setFormData((prev) => ({
      ...prev,
      material_id: mat?.id || undefined,
      unit: mat?.unit || prev.unit,
      brand_id: undefined, // Reset brand when material changes
    }));
  };

  const handleSubmit = async () => {
    // Validation
    if (!formData.vendor_id && !vendor?.id) {
      setError("Vendor is required");
      return;
    }
    if (!formData.material_id && !material?.id) {
      setError("Material is required");
      return;
    }
    if (!formData.current_price || formData.current_price <= 0) {
      setError("Price must be greater than 0");
      return;
    }

    try {
      const submitData: VendorInventoryFormData = {
        vendor_id: formData.vendor_id || vendor?.id || "",
        material_id: formData.material_id || material?.id,
        brand_id: formData.brand_id || undefined,
        current_price: formData.current_price || 0,
        price_includes_gst: formData.price_includes_gst,
        gst_rate: formData.gst_rate,
        price_includes_transport: formData.price_includes_transport,
        transport_cost: formData.transport_cost,
        loading_cost: formData.loading_cost,
        unloading_cost: formData.unloading_cost,
        is_available: formData.is_available,
        min_order_qty: formData.min_order_qty,
        unit: formData.unit,
        lead_time_days: formData.lead_time_days,
        notes: formData.notes,
      };

      if (isEdit && existingItem) {
        await updateInventory.mutateAsync({
          id: existingItem.id,
          data: submitData,
        });
      } else {
        await addInventory.mutateAsync(submitData);
      }
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save";
      setError(message);
    }
  };

  const isSubmitting = addInventory.isPending || updateInventory.isPending;
  const isLoading = isLoadingItem || isLoadingMaterials;

  // Dialog title based on context
  const getDialogTitle = () => {
    if (isEdit) return "Edit Material Pricing";
    if (vendor) return `Add Material to ${vendor.name}`;
    if (material) return `Add Vendor for ${material.name}`;
    return "Add Material to Vendor";
  };

  return (
    <Dialog
      open={open}
      onClose={(_event, reason) => { if (reason !== "backdropClick") onClose(); }}
      maxWidth="sm"
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
        <Typography variant="h6" component="span">{getDialogTitle()}</Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <Grid container spacing={2}>
              {/* Vendor Selection - only show if not pre-selected */}
              {!vendor && (
                <Grid size={12}>
                  <VendorAutocomplete
                    value={selectedVendorId}
                    onChange={(value) => {
                      setSelectedVendorId(value as string | null);
                      handleChange("vendor_id", value || "");
                    }}
                    label="Select Vendor"
                    placeholder="Search vendors..."
                    size="medium"
                    disabled={isEdit}
                  />
                </Grid>
              )}

              {/* Material Selection - only show if not pre-selected */}
              {!material && (
                <Grid size={12}>
                  <Autocomplete
                    options={materials}
                    value={selectedMaterial}
                    onChange={(_, value) => handleMaterialChange(value)}
                    getOptionLabel={(option) =>
                      `${option.name}${option.code ? ` (${option.code})` : ""}`
                    }
                    renderOption={(props, option) => (
                      <Box component="li" {...props}>
                        <Box>
                          <Typography variant="body2">{option.name}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {option.code} | {option.unit}
                            {option.category?.name && ` | ${option.category.name}`}
                          </Typography>
                        </Box>
                      </Box>
                    )}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Select Material"
                        required
                        placeholder="Search materials..."
                      />
                    )}
                    disabled={isEdit}
                  />
                </Grid>
              )}

              {/* Show selected material info */}
              {(selectedMaterial || material) && (
                <Grid size={12}>
                  <Box
                    sx={{
                      bgcolor: "action.hover",
                      p: 1.5,
                      borderRadius: 1,
                    }}
                  >
                    <Typography variant="subtitle2">
                      {selectedMaterial?.name || material?.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Unit: {selectedMaterial?.unit || material?.unit}
                      {selectedMaterial?.category?.name && ` | Category: ${selectedMaterial.category.name}`}
                    </Typography>
                  </Box>
                </Grid>
              )}

              {/* Brand Selection */}
              {brands.length > 0 && (
                <Grid size={12}>
                  <FormControl fullWidth>
                    <InputLabel>Brand (Optional)</InputLabel>
                    <Select
                      value={formData.brand_id || ""}
                      onChange={(e) => handleChange("brand_id", e.target.value || undefined)}
                      label="Brand (Optional)"
                    >
                      <MenuItem value="">No specific brand</MenuItem>
                      {brands.filter(b => b.is_active).map((brand) => (
                        <MenuItem key={brand.id} value={brand.id}>
                          {brand.brand_name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
              )}

              <Grid size={12}>
                <Divider>
                  <Typography variant="caption" color="text.secondary">
                    Pricing
                  </Typography>
                </Divider>
              </Grid>

              {/* Price */}
              <Grid size={{ xs: 6 }}>
                <TextField
                  fullWidth
                  label="Unit Price"
                  type="number"
                  value={formData.current_price || ""}
                  onChange={(e) =>
                    handleChange("current_price", parseFloat(e.target.value) || 0)
                  }
                  required
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">₹</InputAdornment>
                      ),
                      inputProps: { min: 0, step: 0.01 },
                    },
                  }}
                />
              </Grid>

              <Grid size={{ xs: 6 }}>
                <TextField
                  fullWidth
                  label="Unit"
                  value={formData.unit || ""}
                  onChange={(e) => handleChange("unit", e.target.value)}
                  placeholder={selectedMaterial?.unit || "bag, cft, kg..."}
                />
              </Grid>

              {/* GST */}
              <Grid size={{ xs: 6 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.price_includes_gst || false}
                      onChange={(e) =>
                        handleChange("price_includes_gst", e.target.checked)
                      }
                    />
                  }
                  label="Price includes GST"
                />
              </Grid>

              <Grid size={{ xs: 6 }}>
                <TextField
                  fullWidth
                  label="GST Rate"
                  type="number"
                  value={formData.gst_rate || ""}
                  onChange={(e) =>
                    handleChange("gst_rate", parseFloat(e.target.value) || 0)
                  }
                  slotProps={{
                    input: {
                      endAdornment: <InputAdornment position="end">%</InputAdornment>,
                      inputProps: { min: 0, max: 28 },
                    },
                  }}
                />
              </Grid>

              {/* Transport */}
              <Grid size={{ xs: 6 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.price_includes_transport || false}
                      onChange={(e) =>
                        handleChange("price_includes_transport", e.target.checked)
                      }
                    />
                  }
                  label="Price includes transport"
                />
              </Grid>

              {!formData.price_includes_transport && (
                <Grid size={{ xs: 6 }}>
                  <TextField
                    fullWidth
                    label="Transport Cost"
                    type="number"
                    value={formData.transport_cost || ""}
                    onChange={(e) =>
                      handleChange("transport_cost", parseFloat(e.target.value) || 0)
                    }
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">₹</InputAdornment>
                        ),
                        inputProps: { min: 0 },
                      },
                    }}
                  />
                </Grid>
              )}

              <Grid size={{ xs: 6 }}>
                <TextField
                  fullWidth
                  label="Loading Cost"
                  type="number"
                  value={formData.loading_cost || ""}
                  onChange={(e) =>
                    handleChange("loading_cost", parseFloat(e.target.value) || 0)
                  }
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">₹</InputAdornment>
                      ),
                      inputProps: { min: 0 },
                    },
                  }}
                />
              </Grid>

              <Grid size={{ xs: 6 }}>
                <TextField
                  fullWidth
                  label="Unloading Cost"
                  type="number"
                  value={formData.unloading_cost || ""}
                  onChange={(e) =>
                    handleChange("unloading_cost", parseFloat(e.target.value) || 0)
                  }
                  slotProps={{
                    input: {
                      startAdornment: (
                        <InputAdornment position="start">₹</InputAdornment>
                      ),
                      inputProps: { min: 0 },
                    },
                  }}
                />
              </Grid>

              {/* Total Landed Cost Display */}
              <Grid size={12}>
                <Box
                  sx={{
                    bgcolor: "primary.50",
                    p: 1.5,
                    borderRadius: 1,
                    border: "1px solid",
                    borderColor: "primary.200",
                  }}
                >
                  <Typography variant="body2" color="text.secondary">
                    Total Landed Cost
                  </Typography>
                  <Typography variant="h6" color="primary.main">
                    ₹{totalLandedCost.toLocaleString("en-IN")} / {formData.unit || selectedMaterial?.unit || "unit"}
                  </Typography>
                </Box>
              </Grid>

              <Grid size={12}>
                <Divider>
                  <Typography variant="caption" color="text.secondary">
                    Availability
                  </Typography>
                </Divider>
              </Grid>

              {/* Availability */}
              <Grid size={{ xs: 6 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.is_available ?? true}
                      onChange={(e) =>
                        handleChange("is_available", e.target.checked)
                      }
                      color={formData.is_available ? "success" : "default"}
                    />
                  }
                  label={
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                      {formData.is_available ? (
                        <CheckCircleIcon color="success" fontSize="small" />
                      ) : (
                        <CancelIcon color="disabled" fontSize="small" />
                      )}
                      {formData.is_available ? "Available" : "Not Available"}
                    </Box>
                  }
                />
              </Grid>

              <Grid size={{ xs: 6 }}>
                <TextField
                  fullWidth
                  label="Lead Time"
                  type="number"
                  value={formData.lead_time_days || ""}
                  onChange={(e) =>
                    handleChange("lead_time_days", parseInt(e.target.value) || 0)
                  }
                  slotProps={{
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">days</InputAdornment>
                      ),
                      inputProps: { min: 0 },
                    },
                  }}
                />
              </Grid>

              <Grid size={{ xs: 6 }}>
                <TextField
                  fullWidth
                  label="Min Order Quantity"
                  type="number"
                  value={formData.min_order_qty || ""}
                  onChange={(e) =>
                    handleChange("min_order_qty", parseFloat(e.target.value) || 0)
                  }
                  slotProps={{
                    input: {
                      inputProps: { min: 0 },
                    },
                  }}
                />
              </Grid>

              {/* Notes */}
              <Grid size={12}>
                <TextField
                  fullWidth
                  label="Notes"
                  value={formData.notes || ""}
                  onChange={(e) => handleChange("notes", e.target.value)}
                  multiline
                  rows={2}
                  placeholder="Additional notes about pricing, availability..."
                />
              </Grid>
            </Grid>
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={
            isSubmitting ||
            isLoading ||
            (!formData.material_id && !material?.id) ||
            (!formData.vendor_id && !vendor?.id)
          }
        >
          {isSubmitting ? "Saving..." : isEdit ? "Update" : vendor ? "Add Material" : "Add Vendor"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
