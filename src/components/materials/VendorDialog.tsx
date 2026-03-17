"use client";

import React, { useState, useEffect, useMemo } from "react";
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
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Rating,
  ToggleButton,
  ToggleButtonGroup,
  FormControlLabel,
  Switch,
  InputAdornment,
  CircularProgress,
} from "@mui/material";
import {
  Close as CloseIcon,
  ExpandMore as ExpandMoreIcon,
  Store as StoreIcon,
  LocalShipping as DealerIcon,
  Factory as FactoryIcon,
  Person as PersonIcon,
  Handyman as RentalIcon,
  Edit as EditIcon,
  CloudUpload as UploadIcon,
  Delete as DeleteIcon,
} from "@mui/icons-material";
import CategoryAutocomplete from "@/components/common/CategoryAutocomplete";
import { compressImage } from "@/components/attendance/work-updates/imageUtils";
import { createClient } from "@/lib/supabase/client";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useFormDraft } from "@/hooks/useFormDraft";
import {
  useCreateVendor,
  useUpdateVendor,
} from "@/hooks/queries/useVendors";
import type {
  VendorWithCategories,
  VendorFormData,
  VendorType,
  MaterialCategory,
} from "@/types/material.types";
import { VENDOR_TYPE_LABELS } from "@/types/material.types";

interface VendorDialogProps {
  open: boolean;
  onClose: () => void;
  vendor: VendorWithCategories | null;
  categories?: MaterialCategory[]; // Optional - CategoryAutocomplete fetches its own data
}

export default function VendorDialog({
  open,
  onClose,
  vendor,
}: VendorDialogProps) {
  const isMobile = useIsMobile();
  const isEdit = !!vendor;

  const createVendor = useCreateVendor();
  const updateVendor = useUpdateVendor();
  const supabase = createClient();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const shopPhotoInputRef = React.useRef<HTMLInputElement>(null);

  const [error, setError] = useState("");
  const [customizeCode, setCustomizeCode] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [uploadingShopPhoto, setUploadingShopPhoto] = useState(false);
  const [taxDetailsExpanded, setTaxDetailsExpanded] = useState(false);

  // Memoize initial form data based on vendor prop
  const initialFormData = useMemo<VendorFormData>(
    () => ({
      name: vendor?.name || "",
      code: vendor?.code || "",
      contact_person: vendor?.contact_person || "",
      phone: vendor?.phone || "",
      alternate_phone: vendor?.alternate_phone || "",
      whatsapp_number: vendor?.whatsapp_number || "",
      email: vendor?.email || "",
      address: vendor?.address || "",
      city: vendor?.city || "",
      state: vendor?.state || "Tamil Nadu",
      pincode: vendor?.pincode || "",
      gst_number: vendor?.gst_number || "",
      pan_number: vendor?.pan_number || "",
      bank_name: vendor?.bank_name || "",
      bank_account_number: vendor?.bank_account_number || "",
      bank_ifsc: vendor?.bank_ifsc || "",
      payment_terms_days: vendor?.payment_terms_days || 30,
      credit_limit: vendor?.credit_limit || 0,
      notes: vendor?.notes || "",
      rating: vendor?.rating || 0,
      category_ids:
        vendor?.categories?.map((c) => c?.id).filter(Boolean) as string[] || [],
      vendor_type: vendor?.vendor_type || "dealer",
      shop_name: vendor?.shop_name || "",
      has_physical_store: vendor?.has_physical_store || false,
      store_address: vendor?.store_address || "",
      store_city: vendor?.store_city || "",
      store_pincode: vendor?.store_pincode || "",
      provides_transport: vendor?.provides_transport || false,
      provides_loading: vendor?.provides_loading || false,
      provides_unloading: vendor?.provides_unloading || false,
      min_order_amount: vendor?.min_order_amount || 0,
      delivery_radius_km: vendor?.delivery_radius_km || 0,
      specializations: vendor?.specializations || [],
      accepts_upi: vendor?.accepts_upi ?? true,
      accepts_cash: vendor?.accepts_cash ?? true,
      accepts_credit: vendor?.accepts_credit || false,
      credit_days: vendor?.credit_days || 0,
      upi_id: vendor?.upi_id || "",
      qr_code_url: vendor?.qr_code_url || "",
      shop_photo_url: vendor?.shop_photo_url || "",
    }),
    [vendor]
  );

  // Use form draft hook for persistence
  const {
    formData,
    updateField,
    isDirty,
    hasRestoredDraft,
    clearDraft,
    discardDraft,
  } = useFormDraft<VendorFormData>({
    key: "vendor_dialog",
    initialData: initialFormData,
    isOpen: open,
    entityId: vendor?.id || null,
  });

  // Sync customizeCode state with vendor code
  useEffect(() => {
    if (open) {
      setCustomizeCode(!!vendor?.code);
      setError("");
    }
  }, [vendor, open]);

  // Sync tax details accordion state when dialog opens
  useEffect(() => {
    if (open) {
      setTaxDetailsExpanded(!!vendor);
    }
  }, [open, vendor]);

  const handleChange = (field: keyof VendorFormData, value: unknown) => {
    updateField(field, value as VendorFormData[typeof field]);
    setError("");
  };

  // QR Code upload handler
  const handleQrCodeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file");
      return;
    }

    setUploadingQr(true);
    setError("");

    try {
      // Compress image for QR codes (max 200KB, 400px)
      const compressedFile = await compressImage(file, 200, 400, 400, 0.8);

      // Generate unique file name
      const fileExt = "jpg";
      const fileName = `vendors/${vendor?.id || "new"}/${Date.now()}.${fileExt}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("vendor-qr")
        .upload(fileName, compressedFile, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage.from("vendor-qr").getPublicUrl(fileName);
      handleChange("qr_code_url", urlData.publicUrl);
    } catch (err: unknown) {
      console.error("Error uploading QR code:", err);
      setError("Failed to upload QR code image");
    } finally {
      setUploadingQr(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemoveQrCode = () => {
    handleChange("qr_code_url", "");
  };

  // Shop Photo upload handler
  const handleShopPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file");
      return;
    }

    setUploadingShopPhoto(true);
    setError("");

    try {
      // Compress image for shop photos (max 500KB, 1200px)
      const compressedFile = await compressImage(file, 500, 1200, 1200, 0.8);

      // Generate unique file name
      const fileExt = "jpg";
      const fileName = `vendors/${vendor?.id || "new"}/${Date.now()}_shop.${fileExt}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("vendor-photos")
        .upload(fileName, compressedFile, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage.from("vendor-photos").getPublicUrl(fileName);
      handleChange("shop_photo_url", urlData.publicUrl);
    } catch (err: unknown) {
      console.error("Error uploading shop photo:", err);
      setError("Failed to upload shop photo");
    } finally {
      setUploadingShopPhoto(false);
      if (shopPhotoInputRef.current) {
        shopPhotoInputRef.current.value = "";
      }
    }
  };

  const handleRemoveShopPhoto = () => {
    handleChange("shop_photo_url", "");
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      setError("Vendor name is required");
      return;
    }

    try {
      if (isEdit) {
        await updateVendor.mutateAsync({
          id: vendor.id,
          data: formData,
        });
      } else {
        await createVendor.mutateAsync(formData);
      }
      clearDraft(); // Clear draft on successful save
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save vendor";
      setError(message);
    }
  };

  const isSubmitting = createVendor.isPending || updateVendor.isPending;

  return (
    <Dialog
      open={open}
      onClose={(_event, reason) => { if (reason !== "backdropClick") onClose(); }}
      maxWidth="md"
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
        <Typography variant="h6" component="span">
          {isEdit ? "Edit Vendor" : "Add New Vendor"}
        </Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {hasRestoredDraft && (
          <Alert
            severity="info"
            sx={{ mb: 2 }}
            action={
              <Button size="small" color="inherit" onClick={discardDraft}>
                Discard
              </Button>
            }
          >
            Restored from previous session
          </Alert>
        )}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Grid container spacing={2}>
          {/* Basic Info */}
          <Grid size={{ xs: 12, md: customizeCode ? 5 : 8 }}>
            <TextField
              fullWidth
              label="Vendor Name"
              value={formData.name}
              onChange={(e) => handleChange("name", e.target.value)}
              required
              autoFocus
              helperText={
                !customizeCode && (
                  <Box component="span" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    Code will be auto-generated
                    <Button
                      size="small"
                      onClick={() => setCustomizeCode(true)}
                      sx={{ minWidth: "auto", p: 0, ml: 0.5, textTransform: "none", fontSize: "0.75rem" }}
                      startIcon={<EditIcon sx={{ fontSize: 14 }} />}
                    >
                      Customize
                    </Button>
                  </Box>
                )
              }
            />
          </Grid>
          {customizeCode && (
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField
                fullWidth
                label="Vendor Code"
                value={formData.code}
                onChange={(e) => handleChange("code", e.target.value.toUpperCase())}
                placeholder="e.g., SHP-0001"
                helperText="Leave empty to auto-generate"
              />
            </Grid>
          )}
          <Grid size={{ xs: 12, md: 4 }}>
            <Box sx={{ display: "flex", flexDirection: "column" }}>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
                Rating
              </Typography>
              <Rating
                value={formData.rating || 0}
                onChange={(_, value) => handleChange("rating", value)}
                precision={0.5}
              />
            </Box>
          </Grid>

          {/* Vendor Type Selector */}
          <Grid size={12}>
            <Divider sx={{ my: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Vendor Type
              </Typography>
            </Divider>
          </Grid>

          <Grid size={12}>
            <ToggleButtonGroup
              value={formData.vendor_type}
              exclusive
              onChange={(_, value) => {
                if (value) {
                  handleChange("vendor_type", value);
                  // Auto-set has_physical_store for shop and rental_store types
                  if (value === "shop" || value === "rental_store") {
                    handleChange("has_physical_store", true);
                  }
                }
              }}
              aria-label="vendor type"
              fullWidth
              sx={{ mb: 1 }}
            >
              <ToggleButton value="shop" aria-label="shop">
                <StoreIcon sx={{ mr: 1 }} />
                {VENDOR_TYPE_LABELS.shop}
              </ToggleButton>
              <ToggleButton value="dealer" aria-label="dealer">
                <DealerIcon sx={{ mr: 1 }} />
                {VENDOR_TYPE_LABELS.dealer}
              </ToggleButton>
              <ToggleButton value="manufacturer" aria-label="manufacturer">
                <FactoryIcon sx={{ mr: 1 }} />
                {VENDOR_TYPE_LABELS.manufacturer}
              </ToggleButton>
              <ToggleButton value="individual" aria-label="individual">
                <PersonIcon sx={{ mr: 1 }} />
                {VENDOR_TYPE_LABELS.individual}
              </ToggleButton>
              <ToggleButton value="rental_store" aria-label="rental_store">
                <RentalIcon sx={{ mr: 1 }} />
                {VENDOR_TYPE_LABELS.rental_store}
              </ToggleButton>
            </ToggleButtonGroup>
          </Grid>

          {/* Shop Name - shown for shop and rental_store types */}
          {(formData.vendor_type === "shop" || formData.vendor_type === "rental_store") && (
            <Grid size={12}>
              <TextField
                fullWidth
                label={formData.vendor_type === "rental_store" ? "Rental Store Name" : "Shop/Store Name"}
                value={formData.shop_name}
                onChange={(e) => handleChange("shop_name", e.target.value)}
                placeholder={formData.vendor_type === "rental_store" ? "e.g., Sri Lakshmi Rentals" : "e.g., Sri Lakshmi Hardware"}
                helperText={formData.vendor_type === "rental_store" ? "Display name for the rental store" : "Display name for the shop"}
              />
            </Grid>
          )}

          <Grid size={12}>
            <Divider sx={{ my: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Contact Information
              </Typography>
            </Divider>
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              fullWidth
              label="Contact Person"
              value={formData.contact_person}
              onChange={(e) => handleChange("contact_person", e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 6, md: 4 }}>
            <TextField
              fullWidth
              label="Phone"
              value={formData.phone}
              onChange={(e) => handleChange("phone", e.target.value)}
              placeholder="+91 99999 99999"
            />
          </Grid>
          <Grid size={{ xs: 6, md: 4 }}>
            <TextField
              fullWidth
              label="Alternate Phone"
              value={formData.alternate_phone}
              onChange={(e) => handleChange("alternate_phone", e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 6, md: 4 }}>
            <TextField
              fullWidth
              label="WhatsApp"
              value={formData.whatsapp_number}
              onChange={(e) => handleChange("whatsapp_number", e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 6, md: 8 }}>
            <TextField
              fullWidth
              label="Email"
              type="email"
              value={formData.email}
              onChange={(e) => handleChange("email", e.target.value)}
            />
          </Grid>

          <Grid size={12}>
            <Divider sx={{ my: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Address
              </Typography>
            </Divider>
          </Grid>

          <Grid size={12}>
            <TextField
              fullWidth
              label="Address"
              value={formData.address}
              onChange={(e) => handleChange("address", e.target.value)}
              multiline
              rows={2}
            />
          </Grid>
          <Grid size={{ xs: 6, md: 4 }}>
            <TextField
              fullWidth
              label="City"
              value={formData.city}
              onChange={(e) => handleChange("city", e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 6, md: 4 }}>
            <TextField
              fullWidth
              label="State"
              value={formData.state}
              onChange={(e) => handleChange("state", e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 6, md: 4 }}>
            <TextField
              fullWidth
              label="Pincode"
              value={formData.pincode}
              onChange={(e) => handleChange("pincode", e.target.value)}
            />
          </Grid>

          {/* Store Location - shown for shop and dealer types with physical store */}
          {(formData.vendor_type === "shop" || formData.has_physical_store) && (
            <>
              <Grid size={12}>
                <Divider sx={{ my: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Store/Warehouse Location
                  </Typography>
                </Divider>
              </Grid>

              {formData.vendor_type !== "shop" && (
                <Grid size={12}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={formData.has_physical_store || false}
                        onChange={(e) =>
                          handleChange("has_physical_store", e.target.checked)
                        }
                      />
                    }
                    label="Has physical store/warehouse"
                  />
                </Grid>
              )}

              <Grid size={12}>
                <TextField
                  fullWidth
                  label="Store Address"
                  value={formData.store_address}
                  onChange={(e) => handleChange("store_address", e.target.value)}
                  multiline
                  rows={2}
                  placeholder="Physical store/warehouse address"
                />
              </Grid>
              <Grid size={{ xs: 6, md: 4 }}>
                <TextField
                  fullWidth
                  label="Store City"
                  value={formData.store_city}
                  onChange={(e) => handleChange("store_city", e.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 6, md: 4 }}>
                <TextField
                  fullWidth
                  label="Store Pincode"
                  value={formData.store_pincode}
                  onChange={(e) => handleChange("store_pincode", e.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 6, md: 4 }}>
                <TextField
                  fullWidth
                  label="Delivery Radius (km)"
                  type="number"
                  value={formData.delivery_radius_km || ""}
                  onChange={(e) =>
                    handleChange(
                      "delivery_radius_km",
                      parseInt(e.target.value) || 0
                    )
                  }
                  slotProps={{
                    input: { inputProps: { min: 0 } },
                  }}
                />
              </Grid>

              {/* Shop Photo Upload */}
              <Grid size={12}>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
                    Shop/Store Photo
                  </Typography>
                  <input
                    ref={shopPhotoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleShopPhotoUpload}
                    style={{ display: "none" }}
                    id="vendor-shop-photo-upload"
                  />
                  {formData.shop_photo_url ? (
                    <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
                      <Box
                        component="img"
                        src={formData.shop_photo_url}
                        alt="Shop Photo"
                        sx={{
                          width: 150,
                          height: 100,
                          objectFit: "cover",
                          borderRadius: 1,
                          border: "1px solid",
                          borderColor: "divider",
                        }}
                      />
                      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => shopPhotoInputRef.current?.click()}
                          disabled={uploadingShopPhoto}
                          startIcon={uploadingShopPhoto ? <CircularProgress size={16} /> : <UploadIcon />}
                        >
                          Replace
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          onClick={handleRemoveShopPhoto}
                          startIcon={<DeleteIcon />}
                        >
                          Remove
                        </Button>
                      </Box>
                    </Box>
                  ) : (
                    <Button
                      variant="outlined"
                      onClick={() => shopPhotoInputRef.current?.click()}
                      disabled={uploadingShopPhoto}
                      startIcon={uploadingShopPhoto ? <CircularProgress size={16} /> : <UploadIcon />}
                      sx={{ height: 56 }}
                    >
                      {uploadingShopPhoto ? "Uploading..." : "Upload Shop Photo"}
                    </Button>
                  )}
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                    Add a photo of the vendor&apos;s shop or store front
                  </Typography>
                </Box>
              </Grid>
            </>
          )}

          {/* Services & Delivery Options - Hide for rental vendors */}
          {formData.vendor_type !== "rental_store" && (
            <>
              <Grid size={12}>
                <Divider sx={{ my: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Services & Delivery
                  </Typography>
                </Divider>
              </Grid>

              <Grid size={{ xs: 6, md: 4 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.provides_transport || false}
                      onChange={(e) =>
                        handleChange("provides_transport", e.target.checked)
                      }
                    />
                  }
                  label="Provides Transport"
                />
              </Grid>
              <Grid size={{ xs: 6, md: 4 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.provides_loading || false}
                      onChange={(e) =>
                        handleChange("provides_loading", e.target.checked)
                      }
                    />
                  }
                  label="Provides Loading"
                />
              </Grid>
              <Grid size={{ xs: 6, md: 4 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.provides_unloading || false}
                      onChange={(e) =>
                        handleChange("provides_unloading", e.target.checked)
                      }
                    />
                  }
                  label="Provides Unloading"
                />
              </Grid>
              <Grid size={{ xs: 6, md: 4 }}>
                <TextField
                  fullWidth
                  label="Minimum Order Amount (₹)"
                  type="number"
                  value={formData.min_order_amount || ""}
                  onChange={(e) =>
                    handleChange("min_order_amount", parseFloat(e.target.value) || 0)
                  }
                  slotProps={{
                    input: {
                      inputProps: { min: 0 },
                      startAdornment: (
                        <InputAdornment position="start">₹</InputAdornment>
                      ),
                    },
                  }}
                />
              </Grid>
            </>
          )}

          {/* Material Categories - Hide for rental vendors */}
          {formData.vendor_type !== "rental_store" && (
            <>
              <Grid size={12}>
                <Divider sx={{ my: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Material Categories Supplied
                  </Typography>
                </Divider>
              </Grid>

              <Grid size={12}>
                <CategoryAutocomplete
                  value={formData.category_ids || []}
                  onChange={(value) => handleChange("category_ids", value || [])}
                  multiple
                  parentOnly
                  label="Categories"
                  placeholder="Search and select categories..."
                />
              </Grid>
            </>
          )}

          {/* Tax & Payment Section - Accordion */}
          <Grid size={12}>
            <Accordion
              expanded={taxDetailsExpanded}
              onChange={(_, expanded) => setTaxDetailsExpanded(expanded)}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>Tax & Payment Details</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 6, md: 4 }}>
                    <TextField
                      fullWidth
                      label="GST Number"
                      value={formData.gst_number}
                      onChange={(e) =>
                        handleChange("gst_number", e.target.value.toUpperCase())
                      }
                      placeholder="22AAAAA0000A1Z5"
                    />
                  </Grid>
                  <Grid size={{ xs: 6, md: 4 }}>
                    <TextField
                      fullWidth
                      label="PAN Number"
                      value={formData.pan_number}
                      onChange={(e) =>
                        handleChange("pan_number", e.target.value.toUpperCase())
                      }
                      placeholder="AAAAA0000A"
                    />
                  </Grid>
                  <Grid size={{ xs: 6, md: 4 }}>
                    <TextField
                      fullWidth
                      label="Payment Terms (Days)"
                      type="number"
                      value={formData.payment_terms_days}
                      onChange={(e) =>
                        handleChange(
                          "payment_terms_days",
                          parseInt(e.target.value) || 0
                        )
                      }
                      slotProps={{
                        input: { inputProps: { min: 0 } },
                      }}
                    />
                  </Grid>
                  <Grid size={{ xs: 6, md: 4 }}>
                    <TextField
                      fullWidth
                      label="Credit Limit (₹)"
                      type="number"
                      value={formData.credit_limit}
                      onChange={(e) =>
                        handleChange(
                          "credit_limit",
                          parseFloat(e.target.value) || 0
                        )
                      }
                      slotProps={{
                        input: { inputProps: { min: 0 } },
                      }}
                    />
                  </Grid>

                  {/* Payment Methods Accepted */}
                  <Grid size={12}>
                    <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
                      Payment Methods Accepted
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 4, md: 3 }}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={formData.accepts_upi || false}
                          onChange={(e) =>
                            handleChange("accepts_upi", e.target.checked)
                          }
                        />
                      }
                      label="UPI"
                    />
                  </Grid>
                  <Grid size={{ xs: 4, md: 3 }}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={formData.accepts_cash || false}
                          onChange={(e) =>
                            handleChange("accepts_cash", e.target.checked)
                          }
                        />
                      }
                      label="Cash"
                    />
                  </Grid>
                  <Grid size={{ xs: 4, md: 3 }}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={formData.accepts_credit || false}
                          onChange={(e) =>
                            handleChange("accepts_credit", e.target.checked)
                          }
                        />
                      }
                      label="Credit"
                    />
                  </Grid>
                  {formData.accepts_credit && (
                    <Grid size={{ xs: 6, md: 3 }}>
                      <TextField
                        fullWidth
                        label="Credit Days"
                        type="number"
                        value={formData.credit_days || ""}
                        onChange={(e) =>
                          handleChange(
                            "credit_days",
                            parseInt(e.target.value) || 0
                          )
                        }
                        slotProps={{
                          input: { inputProps: { min: 0 } },
                        }}
                        helperText="Days of credit allowed"
                      />
                    </Grid>
                  )}
                </Grid>
              </AccordionDetails>
            </Accordion>
          </Grid>

          {/* Bank & Payment Details - Accordion */}
          <Grid size={12}>
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>Bank & Payment Details</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={2}>
                  {/* UPI Section */}
                  <Grid size={12}>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>
                      UPI / Digital Payment
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <TextField
                      fullWidth
                      label="UPI ID"
                      value={formData.upi_id}
                      onChange={(e) => handleChange("upi_id", e.target.value)}
                      placeholder="name@upi or phone@bank"
                      helperText="e.g., vendor@ybl, 9876543210@paytm"
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Box>
                      <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
                        Payment QR Code
                      </Typography>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleQrCodeUpload}
                        style={{ display: "none" }}
                        id="vendor-qr-upload"
                      />
                      {formData.qr_code_url ? (
                        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
                          <Box
                            component="img"
                            src={formData.qr_code_url}
                            alt="Payment QR Code"
                            sx={{
                              width: 100,
                              height: 100,
                              objectFit: "contain",
                              borderRadius: 1,
                              border: "1px solid",
                              borderColor: "divider",
                            }}
                          />
                          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => fileInputRef.current?.click()}
                              disabled={uploadingQr}
                              startIcon={uploadingQr ? <CircularProgress size={16} /> : <UploadIcon />}
                            >
                              Replace
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              color="error"
                              onClick={handleRemoveQrCode}
                              startIcon={<DeleteIcon />}
                            >
                              Remove
                            </Button>
                          </Box>
                        </Box>
                      ) : (
                        <Button
                          variant="outlined"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploadingQr}
                          startIcon={uploadingQr ? <CircularProgress size={16} /> : <UploadIcon />}
                          sx={{ height: 56 }}
                        >
                          {uploadingQr ? "Uploading..." : "Upload QR Code"}
                        </Button>
                      )}
                    </Box>
                  </Grid>

                  {/* Bank Details Section */}
                  <Grid size={12}>
                    <Divider sx={{ my: 1 }} />
                    <Typography variant="subtitle2" sx={{ mt: 1, mb: 1 }}>
                      Bank Account Details
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <TextField
                      fullWidth
                      label="Bank Name"
                      value={formData.bank_name}
                      onChange={(e) => handleChange("bank_name", e.target.value)}
                    />
                  </Grid>
                  <Grid size={{ xs: 6, md: 4 }}>
                    <TextField
                      fullWidth
                      label="Account Number"
                      value={formData.bank_account_number}
                      onChange={(e) =>
                        handleChange("bank_account_number", e.target.value)
                      }
                    />
                  </Grid>
                  <Grid size={{ xs: 6, md: 4 }}>
                    <TextField
                      fullWidth
                      label="IFSC Code"
                      value={formData.bank_ifsc}
                      onChange={(e) =>
                        handleChange("bank_ifsc", e.target.value.toUpperCase())
                      }
                    />
                  </Grid>
                </Grid>
              </AccordionDetails>
            </Accordion>
          </Grid>

          {/* Notes */}
          <Grid size={12}>
            <TextField
              fullWidth
              label="Notes"
              value={formData.notes}
              onChange={(e) => handleChange("notes", e.target.value)}
              multiline
              rows={2}
              placeholder="Additional notes about this vendor..."
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
          disabled={isSubmitting || !formData.name.trim()}
        >
          {isSubmitting ? "Saving..." : isEdit ? "Update" : "Create"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
