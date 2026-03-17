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
  Tabs,
  Tab,
  FormControlLabel,
  Switch,
  InputAdornment,
  ToggleButton,
  ToggleButtonGroup,
  Rating,
  CircularProgress,
} from "@mui/material";
import {
  Close as CloseIcon,
  Store as StoreIcon,
  LocalShipping as DealerIcon,
  Factory as FactoryIcon,
  Person as PersonIcon,
  Handyman as RentalIcon,
  PersonAdd as PersonAddIcon,
  Search as SearchIcon,
} from "@mui/icons-material";
import VendorAutocomplete from "@/components/common/VendorAutocomplete";
import BrandChecklistSection from "@/components/materials/BrandChecklistSection";
import VariantChecklistSection from "@/components/materials/VariantChecklistSection";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useCreateVendor, useVendors } from "@/hooks/queries/useVendors";
import { useUpsertVendorInventory } from "@/hooks/queries/useVendorInventory";
import { useMaterialVariants } from "@/hooks/queries/useMaterials";
import type {
  MaterialWithDetails,
  VendorWithCategories,
  VendorFormData,
  VendorInventoryFormData,
  VendorType,
} from "@/types/material.types";

interface AddVendorToMaterialDialogProps {
  open: boolean;
  onClose: () => void;
  material: MaterialWithDetails | null;
  existingVendorIds?: string[];
  onSuccess?: () => void;
  /** Pre-select a specific brand when opening the dialog */
  preSelectedBrandId?: string;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      {...other}
    >
      {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
    </div>
  );
}

export default function AddVendorToMaterialDialog({
  open,
  onClose,
  material,
  existingVendorIds = [],
  onSuccess,
  preSelectedBrandId,
}: AddVendorToMaterialDialogProps) {
  const isMobile = useIsMobile();
  const [tabValue, setTabValue] = useState(0);
  const [error, setError] = useState("");

  // For selecting existing vendor
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<VendorWithCategories | null>(null);

  // For creating new vendor
  const [vendorFormData, setVendorFormData] = useState<Partial<VendorFormData>>({
    name: "",
    vendor_type: "dealer",
    phone: "",
    whatsapp_number: "",
    city: "",
    address: "",
    accepts_credit: false,
    credit_days: 0,
  });

  // Pricing form data (shared between both tabs) - now optional for materials with brands
  const [pricingData, setPricingData] = useState<Partial<VendorInventoryFormData>>({
    current_price: 0,
    price_includes_gst: true,
    gst_rate: 18,
    price_includes_transport: true,
    transport_cost: 0,
    loading_cost: 0,
    unloading_cost: 0,
    is_available: true,
    min_order_qty: 1,
    unit: "",
    lead_time_days: 1,
    notes: "",
  });

  // Check if material has variants or brands
  // Variants take priority: if material has variants, use variant checklist
  const hasVariants = (material?.variant_count || 0) > 0;
  const hasBrands = !hasVariants && (material?.brands?.filter(b => b.is_active)?.length || 0) > 0;

  // Variant selection state - which variants this vendor supplies
  const [selectedVariants, setSelectedVariants] = useState<Set<string>>(new Set());
  const [variantPrices, setVariantPrices] = useState<Record<string, number>>({});
  // For variants: selected brand and pricing mode
  const [variantBrandId, setVariantBrandId] = useState<string | null>(null);
  const [variantPricingMode, setVariantPricingMode] = useState<'per_piece' | 'per_kg'>('per_piece');

  // Brand selection state - which brands this vendor carries
  const [selectedBrands, setSelectedBrands] = useState<Set<string>>(new Set());
  const [brandPrices, setBrandPrices] = useState<Record<string, number>>({});

  // Track if we've auto-selected variants for this dialog session
  const [hasAutoSelected, setHasAutoSelected] = useState(false);

  // Fetch variants for parent material (used for auto-selection)
  const { data: materialVariants = [] } = useMaterialVariants(
    hasVariants && open ? material?.id : undefined
  );

  // Mutations
  const createVendor = useCreateVendor();
  const upsertInventory = useUpsertVendorInventory();

  // Get existing vendors to filter out already linked ones
  const { data: allVendors = [] } = useVendors();

  // Filter vendors for the autocomplete
  const excludeVendorIds = useMemo(() => {
    return [...existingVendorIds];
  }, [existingVendorIds]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setTabValue(0);
      setError("");
      setSelectedVendorId(null);
      setSelectedVendor(null);
      setSelectedVariants(new Set());
      setVariantPrices({});
      setVariantBrandId(null);
      setVariantPricingMode('per_piece');
      setHasAutoSelected(false); // Reset auto-selection flag
      // Pre-select brand if provided
      if (preSelectedBrandId) {
        setSelectedBrands(new Set([preSelectedBrandId]));
      } else {
        setSelectedBrands(new Set());
      }
      setBrandPrices({});
      setVendorFormData({
        name: "",
        vendor_type: "dealer",
        phone: "",
        whatsapp_number: "",
        city: "",
        address: "",
        accepts_credit: false,
        credit_days: 0,
      });
      setPricingData({
        current_price: 0,
        price_includes_gst: true,
        gst_rate: material?.gst_rate || 18,
        price_includes_transport: true,
        transport_cost: 0,
        loading_cost: 0,
        unloading_cost: 0,
        is_available: true,
        min_order_qty: 1,
        unit: material?.unit || "",
        lead_time_days: 1,
        notes: "",
      });
    }
  }, [open, material, preSelectedBrandId]);

  // Auto-select all variants when they load (for parent materials with variants)
  useEffect(() => {
    if (
      open &&
      hasVariants &&
      materialVariants.length > 0 &&
      !hasAutoSelected &&
      selectedVariants.size === 0
    ) {
      // Auto-select all variants
      setSelectedVariants(new Set(materialVariants.map((v) => v.id)));
      setHasAutoSelected(true);
    }
  }, [open, hasVariants, materialVariants, hasAutoSelected, selectedVariants.size]);

  const handleVendorChange = (field: keyof VendorFormData, value: unknown) => {
    setVendorFormData((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  const handlePricingChange = (field: keyof VendorInventoryFormData, value: unknown) => {
    setPricingData((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  // Brand selection handlers
  const handleBrandToggle = (brandId: string, checked: boolean) => {
    setSelectedBrands((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(brandId);
      } else {
        next.delete(brandId);
        // Also remove price for this brand
        setBrandPrices((prices) => {
          const { [brandId]: _, ...rest } = prices;
          return rest;
        });
      }
      return next;
    });
    setError("");
  };

  const handleBrandPriceChange = (brandId: string, price: number) => {
    setBrandPrices((prev) => ({ ...prev, [brandId]: price }));
    setError("");
  };

  // Variant selection handlers
  const handleVariantToggle = (variantId: string, checked: boolean) => {
    setSelectedVariants((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(variantId);
      } else {
        next.delete(variantId);
        // Also remove price for this variant
        setVariantPrices((prices) => {
          const { [variantId]: _, ...rest } = prices;
          return rest;
        });
      }
      return next;
    });
    setError("");
  };

  const handleVariantPriceChange = (variantId: string, price: number) => {
    setVariantPrices((prev) => ({ ...prev, [variantId]: price }));
    setError("");
  };

  // Calculate total landed cost
  const totalLandedCost = useMemo(() => {
    const price = pricingData.current_price || 0;
    const transport = pricingData.price_includes_transport ? 0 : (pricingData.transport_cost || 0);
    const loading = pricingData.loading_cost || 0;
    const unloading = pricingData.unloading_cost || 0;
    return price + transport + loading + unloading;
  }, [pricingData]);

  const handleSubmit = async () => {
    if (!material?.id) {
      setError("Material is required");
      return;
    }

    // For materials with variants, require at least one variant selected
    if (hasVariants && selectedVariants.size === 0) {
      setError("Please select at least one variant this vendor supplies");
      return;
    }

    // For materials with brands, require at least one brand selected
    if (hasBrands && selectedBrands.size === 0) {
      setError("Please select at least one brand this vendor carries");
      return;
    }

    // Validate pricing only if material has no variants and no brands
    if (!hasVariants && !hasBrands && (!pricingData.current_price || pricingData.current_price <= 0)) {
      setError("Price must be greater than 0");
      return;
    }

    try {
      // Note: ensureFreshSession is called internally by mutations with debouncing
      // No need to call it here - the mutation hooks handle session checks

      let vendorId: string;

      if (tabValue === 0) {
        // Existing vendor flow
        if (!selectedVendorId) {
          setError("Please select a vendor");
          return;
        }
        vendorId = selectedVendorId;
      } else {
        // New vendor flow
        if (!vendorFormData.name?.trim()) {
          setError("Vendor name is required");
          return;
        }

        // Create the vendor first
        const newVendor = await createVendor.mutateAsync(vendorFormData as VendorFormData);
        vendorId = newVendor.id;
      }

      if (hasVariants) {
        // Create vendor_inventory for EACH selected variant - run in parallel for speed
        // Note: We create inventory for the VARIANT material, not the parent
        const upsertPromises = Array.from(selectedVariants).map((variantId) => {
          const inventoryData: VendorInventoryFormData = {
            vendor_id: vendorId,
            material_id: variantId, // Use variant ID, not parent ID
            brand_id: variantBrandId || undefined, // Include selected brand if any
            current_price: variantPrices[variantId] || 0,
            pricing_mode: variantPricingMode, // Include pricing mode (per_piece or per_kg)
            price_includes_gst: pricingData.price_includes_gst,
            gst_rate: pricingData.gst_rate || material.gst_rate || 18,
            price_includes_transport: pricingData.price_includes_transport,
            transport_cost: pricingData.transport_cost,
            loading_cost: pricingData.loading_cost,
            unloading_cost: pricingData.unloading_cost,
            is_available: true,
            min_order_qty: pricingData.min_order_qty,
            unit: pricingData.unit || material.unit,
            lead_time_days: pricingData.lead_time_days,
            notes: pricingData.notes,
          };

          return upsertInventory.mutateAsync(inventoryData);
        });

        await Promise.all(upsertPromises);
      } else if (hasBrands) {
        // Create vendor_inventory for EACH selected brand - run in parallel for speed
        const upsertPromises = Array.from(selectedBrands).map((brandId) => {
          const inventoryData: VendorInventoryFormData = {
            vendor_id: vendorId,
            material_id: material.id,
            brand_id: brandId,
            current_price: brandPrices[brandId] || 0,
            price_includes_gst: pricingData.price_includes_gst,
            gst_rate: pricingData.gst_rate || material.gst_rate || 18,
            price_includes_transport: pricingData.price_includes_transport,
            transport_cost: pricingData.transport_cost,
            loading_cost: pricingData.loading_cost,
            unloading_cost: pricingData.unloading_cost,
            is_available: true,
            min_order_qty: pricingData.min_order_qty,
            unit: pricingData.unit || material.unit,
            lead_time_days: pricingData.lead_time_days,
            notes: pricingData.notes,
          };

          return upsertInventory.mutateAsync(inventoryData);
        });

        await Promise.all(upsertPromises);
      } else {
        // Material without brands - single price entry
        const inventoryData: VendorInventoryFormData = {
          vendor_id: vendorId,
          material_id: material.id,
          current_price: pricingData.current_price || 0,
          price_includes_gst: pricingData.price_includes_gst,
          gst_rate: pricingData.gst_rate || material.gst_rate || 18,
          price_includes_transport: pricingData.price_includes_transport,
          transport_cost: pricingData.transport_cost,
          loading_cost: pricingData.loading_cost,
          unloading_cost: pricingData.unloading_cost,
          is_available: pricingData.is_available,
          min_order_qty: pricingData.min_order_qty,
          unit: pricingData.unit || material.unit,
          lead_time_days: pricingData.lead_time_days,
          notes: pricingData.notes,
        };

        await upsertInventory.mutateAsync(inventoryData);
      }

      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to add vendor";
      setError(message);
    }
  };

  const isSubmitting = createVendor.isPending || upsertInventory.isPending;

  // Check if form is valid for submit
  const canSubmit = useMemo(() => {
    // For materials with variants, require at least one variant selected
    if (hasVariants && selectedVariants.size === 0) {
      return false;
    }
    // For materials with brands, require at least one brand selected
    if (hasBrands && selectedBrands.size === 0) {
      return false;
    }
    // For materials without variants or brands, require a price
    if (!hasVariants && !hasBrands && (!pricingData.current_price || pricingData.current_price <= 0)) {
      return false;
    }
    if (tabValue === 0) {
      return !!selectedVendorId;
    } else {
      return !!vendorFormData.name?.trim();
    }
  }, [tabValue, selectedVendorId, vendorFormData.name, pricingData.current_price, hasVariants, selectedVariants.size, hasBrands, selectedBrands.size]);

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
          pb: 1,
        }}
      >
        <Box>
          <Typography variant="h6" component="span">Add Vendor</Typography>
          <Typography variant="caption" color="text.secondary">
            for {material?.name}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <Box sx={{ borderBottom: 1, borderColor: "divider", px: 2 }}>
        <Tabs
          value={tabValue}
          onChange={(_, newValue) => setTabValue(newValue)}
          variant="fullWidth"
        >
          <Tab
            icon={<SearchIcon />}
            iconPosition="start"
            label="Select Existing"
            sx={{ minHeight: 48 }}
          />
          <Tab
            icon={<PersonAddIcon />}
            iconPosition="start"
            label="Create New"
            sx={{ minHeight: 48 }}
          />
        </Tabs>
      </Box>

      <DialogContent sx={{ pt: 0 }}>
        {error && (
          <Alert severity="error" sx={{ mt: 2, mb: 1 }}>
            {error}
          </Alert>
        )}

        {/* Tab 0: Select Existing Vendor */}
        <TabPanel value={tabValue} index={0}>
          <Grid container spacing={2}>
            <Grid size={12}>
              <VendorAutocomplete
                value={selectedVendorId}
                onChange={(value, vendor) => {
                  setSelectedVendorId(value as string | null);
                  setSelectedVendor(vendor as VendorWithCategories | null);
                }}
                excludeVendorIds={excludeVendorIds}
                label="Select Vendor"
                placeholder="Search vendors..."
                size="medium"
              />
            </Grid>

            {selectedVendor && (
              <Grid size={12}>
                <Box
                  sx={{
                    bgcolor: "action.hover",
                    p: 1.5,
                    borderRadius: 1,
                  }}
                >
                  <Typography variant="subtitle2">{selectedVendor.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {selectedVendor.phone && `${selectedVendor.phone} • `}
                    {selectedVendor.city || "Location not set"}
                    {selectedVendor.accepts_credit && " • Credit available"}
                  </Typography>
                </Box>
              </Grid>
            )}

            {/* Show variant/brand selection or pricing section when vendor is selected */}
            {selectedVendor && (
              <>
                {/* For materials with variants, show variant checklist */}
                {hasVariants && material ? (
                  <Grid size={12}>
                    <Box sx={{ mt: 1 }}>
                      <VariantChecklistSection
                        parentMaterial={material}
                        selectedVariants={selectedVariants}
                        variantPrices={variantPrices}
                        onVariantToggle={handleVariantToggle}
                        onPriceChange={handleVariantPriceChange}
                        disabled={isSubmitting}
                        selectedBrandId={variantBrandId}
                        onBrandChange={setVariantBrandId}
                        pricingMode={variantPricingMode}
                        onPricingModeChange={setVariantPricingMode}
                      />
                    </Box>
                  </Grid>
                ) : hasBrands && material ? (
                  /* For materials with brands, show brand checklist */
                  <Grid size={12}>
                    <Box sx={{ mt: 1 }}>
                      <BrandChecklistSection
                        material={material}
                        selectedBrands={selectedBrands}
                        brandPrices={brandPrices}
                        onBrandToggle={handleBrandToggle}
                        onPriceChange={handleBrandPriceChange}
                        disabled={isSubmitting}
                      />
                    </Box>
                  </Grid>
                ) : (
                  /* Show pricing form for materials without variants or brands */
                  <PricingFormSection
                    pricingData={pricingData}
                    onPricingChange={handlePricingChange}
                    totalLandedCost={totalLandedCost}
                    material={material}
                  />
                )}
              </>
            )}
          </Grid>
        </TabPanel>

        {/* Tab 1: Create New Vendor */}
        <TabPanel value={tabValue} index={1}>
          <Grid container spacing={2}>
            {/* Vendor Type */}
            <Grid size={12}>
              <ToggleButtonGroup
                value={vendorFormData.vendor_type}
                exclusive
                onChange={(_, value) => {
                  if (value) handleVendorChange("vendor_type", value);
                }}
                fullWidth
                size="small"
              >
                <ToggleButton value="shop">
                  <StoreIcon sx={{ mr: 0.5 }} fontSize="small" />
                  Shop
                </ToggleButton>
                <ToggleButton value="dealer">
                  <DealerIcon sx={{ mr: 0.5 }} fontSize="small" />
                  Dealer
                </ToggleButton>
                <ToggleButton value="manufacturer">
                  <FactoryIcon sx={{ mr: 0.5 }} fontSize="small" />
                  Mfr
                </ToggleButton>
                <ToggleButton value="individual">
                  <PersonIcon sx={{ mr: 0.5 }} fontSize="small" />
                  Individual
                </ToggleButton>
              </ToggleButtonGroup>
            </Grid>

            {/* Basic Info */}
            <Grid size={{ xs: 12, sm: 8 }}>
              <TextField
                fullWidth
                label="Vendor Name"
                value={vendorFormData.name}
                onChange={(e) => handleVendorChange("name", e.target.value)}
                required
                autoFocus={tabValue === 1}
              />
            </Grid>

            <Grid size={{ xs: 12, sm: 4 }}>
              <Box sx={{ display: "flex", flexDirection: "column" }}>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
                  Rating
                </Typography>
                <Rating
                  value={vendorFormData.rating || 0}
                  onChange={(_, value) => handleVendorChange("rating", value)}
                  precision={0.5}
                  size="small"
                />
              </Box>
            </Grid>

            {/* Contact */}
            <Grid size={{ xs: 6 }}>
              <TextField
                fullWidth
                label="Phone"
                value={vendorFormData.phone}
                onChange={(e) => handleVendorChange("phone", e.target.value)}
                size="small"
              />
            </Grid>

            <Grid size={{ xs: 6 }}>
              <TextField
                fullWidth
                label="WhatsApp"
                value={vendorFormData.whatsapp_number}
                onChange={(e) => handleVendorChange("whatsapp_number", e.target.value)}
                size="small"
              />
            </Grid>

            {/* Location */}
            <Grid size={{ xs: 6 }}>
              <TextField
                fullWidth
                label="City"
                value={vendorFormData.city}
                onChange={(e) => handleVendorChange("city", e.target.value)}
                size="small"
              />
            </Grid>

            <Grid size={{ xs: 6 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={vendorFormData.accepts_credit || false}
                    onChange={(e) => handleVendorChange("accepts_credit", e.target.checked)}
                    size="small"
                  />
                }
                label="Accepts Credit"
              />
            </Grid>

            {vendorFormData.accepts_credit && (
              <Grid size={{ xs: 6 }}>
                <TextField
                  fullWidth
                  label="Credit Days"
                  type="number"
                  value={vendorFormData.credit_days || ""}
                  onChange={(e) => handleVendorChange("credit_days", parseInt(e.target.value) || 0)}
                  size="small"
                  slotProps={{
                    input: {
                      inputProps: { min: 0 },
                    },
                  }}
                />
              </Grid>
            )}

            {/* Variant/Brand selection or pricing for new vendor */}
            {hasVariants && material ? (
              <Grid size={12}>
                <Box sx={{ mt: 1 }}>
                  <VariantChecklistSection
                    parentMaterial={material}
                    selectedVariants={selectedVariants}
                    variantPrices={variantPrices}
                    onVariantToggle={handleVariantToggle}
                    onPriceChange={handleVariantPriceChange}
                    disabled={isSubmitting}
                    selectedBrandId={variantBrandId}
                    onBrandChange={setVariantBrandId}
                    pricingMode={variantPricingMode}
                    onPricingModeChange={setVariantPricingMode}
                  />
                </Box>
              </Grid>
            ) : hasBrands && material ? (
              <Grid size={12}>
                <Box sx={{ mt: 1 }}>
                  <BrandChecklistSection
                    material={material}
                    selectedBrands={selectedBrands}
                    brandPrices={brandPrices}
                    onBrandToggle={handleBrandToggle}
                    onPriceChange={handleBrandPriceChange}
                    disabled={isSubmitting}
                  />
                </Box>
              </Grid>
            ) : (
              <PricingFormSection
                pricingData={pricingData}
                onPricingChange={handlePricingChange}
                totalLandedCost={totalLandedCost}
                material={material}
              />
            )}
          </Grid>
        </TabPanel>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={isSubmitting || !canSubmit}
          startIcon={isSubmitting ? <CircularProgress size={16} /> : null}
        >
          {isSubmitting ? "Adding..." : "Add Vendor"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// Extracted pricing form section component
interface PricingFormSectionProps {
  pricingData: Partial<VendorInventoryFormData>;
  onPricingChange: (field: keyof VendorInventoryFormData, value: unknown) => void;
  totalLandedCost: number;
  material: MaterialWithDetails | null;
}

function PricingFormSection({
  pricingData,
  onPricingChange,
  totalLandedCost,
  material,
}: PricingFormSectionProps) {
  return (
    <>
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
          value={pricingData.current_price || ""}
          onChange={(e) =>
            onPricingChange("current_price", parseFloat(e.target.value) || 0)
          }
          required
          size="small"
          slotProps={{
            input: {
              startAdornment: <InputAdornment position="start">₹</InputAdornment>,
              inputProps: { min: 0, step: 0.01 },
            },
          }}
        />
      </Grid>

      <Grid size={{ xs: 6 }}>
        <TextField
          fullWidth
          label="Unit"
          value={pricingData.unit || ""}
          onChange={(e) => onPricingChange("unit", e.target.value)}
          placeholder={material?.unit || "bag, cft, kg..."}
          size="small"
        />
      </Grid>

      {/* GST */}
      <Grid size={{ xs: 6 }}>
        <FormControlLabel
          control={
            <Switch
              checked={pricingData.price_includes_gst || false}
              onChange={(e) => onPricingChange("price_includes_gst", e.target.checked)}
              size="small"
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
          value={pricingData.gst_rate || ""}
          onChange={(e) => onPricingChange("gst_rate", parseFloat(e.target.value) || 0)}
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
      <Grid size={{ xs: 6 }}>
        <FormControlLabel
          control={
            <Switch
              checked={pricingData.price_includes_transport || false}
              onChange={(e) => onPricingChange("price_includes_transport", e.target.checked)}
              size="small"
            />
          }
          label="Incl. transport"
        />
      </Grid>

      {!pricingData.price_includes_transport && (
        <Grid size={{ xs: 6 }}>
          <TextField
            fullWidth
            label="Transport Cost"
            type="number"
            value={pricingData.transport_cost || ""}
            onChange={(e) =>
              onPricingChange("transport_cost", parseFloat(e.target.value) || 0)
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

      <Grid size={{ xs: 6 }}>
        <TextField
          fullWidth
          label="Loading Cost"
          type="number"
          value={pricingData.loading_cost || ""}
          onChange={(e) =>
            onPricingChange("loading_cost", parseFloat(e.target.value) || 0)
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

      <Grid size={{ xs: 6 }}>
        <TextField
          fullWidth
          label="Unloading Cost"
          type="number"
          value={pricingData.unloading_cost || ""}
          onChange={(e) =>
            onPricingChange("unloading_cost", parseFloat(e.target.value) || 0)
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
            ₹{totalLandedCost.toLocaleString("en-IN")} / {pricingData.unit || material?.unit || "unit"}
          </Typography>
        </Box>
      </Grid>

      {/* Availability */}
      <Grid size={{ xs: 6 }}>
        <TextField
          fullWidth
          label="Min Order Qty"
          type="number"
          value={pricingData.min_order_qty || ""}
          onChange={(e) =>
            onPricingChange("min_order_qty", parseFloat(e.target.value) || 0)
          }
          size="small"
          slotProps={{
            input: {
              inputProps: { min: 0 },
            },
          }}
        />
      </Grid>

      <Grid size={{ xs: 6 }}>
        <TextField
          fullWidth
          label="Lead Time"
          type="number"
          value={pricingData.lead_time_days || ""}
          onChange={(e) =>
            onPricingChange("lead_time_days", parseInt(e.target.value) || 0)
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
    </>
  );
}
