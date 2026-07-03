"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Drawer,
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
  TravelExplore as TravelExploreIcon,
  OpenInNew as OpenInNewIcon,
  ContentPaste as PasteIcon,
  Warehouse as WarehouseIcon,
  Category as CategoryIcon,
  Payments as PaymentsIcon,
  AccountBalance as BankIcon,
  Notes as NotesIcon,
  ContactPhone as ContactPhoneIcon,
  Place as PlaceIcon,
  Badge as BadgeIcon,
} from "@mui/icons-material";
import CategoryAutocomplete from "@/components/common/CategoryAutocomplete";
import DraftRestoreBanner from "@/components/common/DraftRestoreBanner";
import { compressImage } from "@/components/attendance/work-updates/imageUtils";
import { createClient } from "@/lib/supabase/client";
import { hardenedUpload } from "@/lib/storage/uploadHelpers";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useFormDraft } from "@/hooks/useFormDraft";
import {
  useCreateVendor,
  useUpdateVendor,
} from "@/hooks/queries/useVendors";
import type {
  Vendor,
  VendorWithCategories,
  VendorFormData,
  VendorType,
  MaterialCategory,
} from "@/types/material.types";
import { VENDOR_TYPE_LABELS } from "@/types/material.types";
import { googleMapsSearchHref, googleBusinessHref } from "@/lib/utils/contact";

interface VendorDialogProps {
  open: boolean;
  onClose: () => void;
  vendor: VendorWithCategories | null;
  categories?: MaterialCategory[]; // Optional - CategoryAutocomplete fetches its own data
  /** Called with the newly created vendor after a successful create (not on edit). */
  onCreated?: (vendor: Vendor) => void;
  /** Called after a successful edit save (not on create). */
  onSaved?: () => void;
  /** Seed fields when creating a new vendor (e.g. a name carried over from quick-add). */
  prefill?: Partial<VendorFormData>;
}

/** A left-aligned heading for the always-visible sections at the top of the drawer. */
function SectionTitle({
  icon,
  children,
  sx,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  sx?: object;
}) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5, ...sx }}>
      <Box sx={{ color: "primary.main", display: "flex" }}>{icon}</Box>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, letterSpacing: 0.2 }}>
        {children}
      </Typography>
    </Box>
  );
}

// Shared look for the collapsible advanced sections: a clean list of rows with a
// hairline divider between them, no elevation, no default expand line.
const sectionAccordionSx = {
  "&:before": { display: "none" },
  borderTop: "1px solid",
  borderColor: "divider",
  bgcolor: "transparent",
} as const;

export default function VendorDialog({
  open,
  onClose,
  vendor,
  onCreated,
  onSaved,
  prefill,
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
  const [storeExpanded, setStoreExpanded] = useState(false);
  const [servicesExpanded, setServicesExpanded] = useState(false);
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);
  const [bankExpanded, setBankExpanded] = useState(false);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [sameAsAddress, setSameAsAddress] = useState(false);

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
      google_business_url: vendor?.google_business_url || "",
      // When creating, seed any fields handed over (e.g. name typed in quick-add).
      ...(vendor ? {} : prefill),
    }),
    [vendor, prefill]
  );

  // Use form draft hook for persistence
  const {
    formData,
    updateField,
    isDirty,
    hasRestoredDraft,
    restoredAt,
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

  // When opening to edit, expand only the advanced sections that already hold
  // data so existing values aren't hidden behind a collapsed accordion. On a
  // fresh create everything stays collapsed (progressive disclosure).
  useEffect(() => {
    if (!open) return;
    const v = vendor;
    setStoreExpanded(
      !!(
        v &&
        (v.has_physical_store ||
          v.store_address ||
          v.delivery_radius_km ||
          v.shop_photo_url)
      )
    );
    setServicesExpanded(
      !!(
        v &&
        (v.provides_transport ||
          v.provides_loading ||
          v.provides_unloading ||
          v.min_order_amount)
      )
    );
    setCategoriesExpanded(!!(v && v.categories?.length));
    setTaxDetailsExpanded(
      !!(
        v &&
        (v.gst_number ||
          v.pan_number ||
          v.credit_limit ||
          v.accepts_credit ||
          (v.payment_terms_days ?? 30) !== 30)
      )
    );
    setBankExpanded(
      !!(
        v &&
        (v.upi_id ||
          v.qr_code_url ||
          v.bank_name ||
          v.bank_account_number ||
          v.bank_ifsc)
      )
    );
    setNotesExpanded(!!(v && v.notes));
  }, [open, vendor]);

  // Initialize "Same as address" toggle when dialog opens
  useEffect(() => {
    if (open) {
      if (vendor) {
        const matches =
          !!vendor.address &&
          vendor.store_address === vendor.address &&
          (vendor.store_city || "") === (vendor.city || "") &&
          (vendor.store_pincode || "") === (vendor.pincode || "");
        setSameAsAddress(matches);
      } else {
        setSameAsAddress(false);
      }
    }
  }, [open, vendor]);

  const handleChange = (field: keyof VendorFormData, value: unknown) => {
    updateField(field, value as VendorFormData[typeof field]);
    setError("");
    if (sameAsAddress) {
      if (field === "address") {
        updateField("store_address", value as VendorFormData["store_address"]);
      } else if (field === "city") {
        updateField("store_city", value as VendorFormData["store_city"]);
      } else if (field === "pincode") {
        updateField("store_pincode", value as VendorFormData["store_pincode"]);
      }
    }
  };

  const handleSameAsAddressToggle = (checked: boolean) => {
    setSameAsAddress(checked);
    if (checked) {
      updateField("store_address", formData.address);
      updateField("store_city", formData.city);
      updateField("store_pincode", formData.pincode);
    }
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

      const fileName = `vendors/${vendor?.id || "new"}/${Date.now()}.jpg`;

      const { publicUrl } = await hardenedUpload({
        supabase,
        bucketName: "vendor-qr",
        filePath: fileName,
        file: compressedFile,
        contentType: "image/jpeg",
      });
      handleChange("qr_code_url", publicUrl);
    } catch (err: unknown) {
      console.error("Error uploading QR code:", err);
      const message = err instanceof Error ? err.message : "";
      setError(
        message.includes("timed out") || message.includes("stalled")
          ? "Upload timed out. Please check your connection and try again."
          : "Failed to upload QR code image"
      );
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
  // Shared pipeline for a shop-photo image, whatever the source (file picker,
  // "Paste" button, or Ctrl/Cmd+V over the photo area): compress → upload.
  const processShopPhotoFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file");
      return;
    }

    setUploadingShopPhoto(true);
    setError("");

    try {
      // Compress image for shop photos (max 500KB, 1200px)
      const compressedFile = await compressImage(file, 500, 1200, 1200, 0.8);

      const fileName = `vendors/${vendor?.id || "new"}/${Date.now()}_shop.jpg`;

      const { publicUrl } = await hardenedUpload({
        supabase,
        bucketName: "vendor-photos",
        filePath: fileName,
        file: compressedFile,
        contentType: "image/jpeg",
      });
      handleChange("shop_photo_url", publicUrl);
    } catch (err: unknown) {
      console.error("Error uploading shop photo:", err);
      const message = err instanceof Error ? err.message : "";
      setError(
        message.includes("timed out") || message.includes("stalled")
          ? "Upload timed out. Please check your connection and try again."
          : "Failed to upload shop photo"
      );
    } finally {
      setUploadingShopPhoto(false);
    }
  };

  const handleShopPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await processShopPhotoFile(file);
    if (shopPhotoInputRef.current) {
      shopPhotoInputRef.current.value = "";
    }
  };

  // "Paste" button → pull an image off the clipboard via the async Clipboard API.
  const handlePasteShopPhoto = async () => {
    setError("");
    try {
      if (!navigator.clipboard?.read) {
        setError("Clipboard paste isn't supported here — use Upload instead.");
        return;
      }
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (imageType) {
          const blob = await item.getType(imageType);
          const ext = blob.type.split("/")[1] || "png";
          await processShopPhotoFile(
            new File([blob], `pasted_${Date.now()}.${ext}`, { type: blob.type })
          );
          return;
        }
      }
      setError("No image in the clipboard. Copy an image first, then tap Paste.");
    } catch (err: unknown) {
      console.error("Clipboard paste failed:", err);
      setError("Couldn't read the clipboard. Allow clipboard access, or use Upload.");
    }
  };

  // Ctrl/Cmd+V while the photo area is focused pastes an image directly.
  const handleShopPhotoPasteEvent = (e: React.ClipboardEvent) => {
    const imageItem = Array.from(e.clipboardData?.items ?? []).find((i) =>
      i.type.startsWith("image/")
    );
    if (imageItem) {
      const file = imageItem.getAsFile();
      if (file) {
        e.preventDefault();
        void processShopPhotoFile(file);
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
        clearDraft(); // Clear draft on successful save
        onClose();
        onSaved?.();
      } else {
        const created = await createVendor.mutateAsync(formData);
        clearDraft(); // Clear draft on successful save
        onClose();
        onCreated?.(created);
      }
    } catch (err: unknown) {
      // Supabase PostgrestErrors are plain objects, not Error instances, so the
      // real cause (e.g. a duplicate code) would otherwise be swallowed.
      const raw =
        err instanceof Error
          ? err.message
          : err && typeof err === "object" && "message" in err
            ? String((err as { message: unknown }).message)
            : "Failed to save vendor";
      setError(
        /duplicate key|23505/i.test(raw)
          ? "That vendor code is already taken. Pick another under Customize."
          : raw
      );
    }
  };

  const isSubmitting = createVendor.isPending || updateVendor.isPending;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={(_event, reason) => {
        if (reason !== "backdropClick") onClose();
      }}
      // Sit above any Dialog (e.g. the Purchase Order quick-add) that opened us.
      sx={{ zIndex: (theme) => theme.zIndex.modal + 1 }}
      slotProps={{
        paper: {
          sx: {
            width: { xs: "100%", sm: 560 },
            maxWidth: "100%",
            display: "flex",
            flexDirection: "column",
          },
        },
      }}
    >
      {/* Sticky header */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderBottom: 1,
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          bgcolor: "background.paper",
          flexShrink: 0,
        }}
      >
        <Typography variant="h6" component="span">
          {isEdit ? "Edit Vendor" : "Add New Vendor"}
        </Typography>
        <IconButton onClick={onClose} size="small" aria-label="Close">
          <CloseIcon />
        </IconButton>
      </Box>

      {/* Scrollable body */}
      <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>
        <DraftRestoreBanner
          show={hasRestoredDraft}
          restoredAt={restoredAt}
          onDiscard={discardDraft}
        />
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* ---------------- Basics (always visible) ---------------- */}
        <SectionTitle icon={<BadgeIcon fontSize="small" />}>Basics</SectionTitle>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: customizeCode ? 7 : 12 }}>
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
            <Grid size={{ xs: 12, sm: 5 }}>
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

          {/* Vendor Type — compact icon-over-label grid that wraps in the drawer */}
          <Grid size={12}>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
              Vendor Type
            </Typography>
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
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "repeat(3, 1fr)", sm: "repeat(5, 1fr)" },
                gap: 1,
                width: "100%",
                "& .MuiToggleButtonGroup-grouped": {
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 1.5,
                  flexDirection: "column",
                  gap: 0.5,
                  py: 1,
                  textTransform: "none",
                  fontSize: "0.7rem",
                  lineHeight: 1.2,
                  "&.Mui-selected": {
                    borderColor: "primary.main",
                    bgcolor: "action.selected",
                    color: "primary.main",
                  },
                },
              }}
            >
              <ToggleButton value="shop" aria-label="shop">
                <StoreIcon fontSize="small" />
                {VENDOR_TYPE_LABELS.shop}
              </ToggleButton>
              <ToggleButton value="dealer" aria-label="dealer">
                <DealerIcon fontSize="small" />
                {VENDOR_TYPE_LABELS.dealer}
              </ToggleButton>
              <ToggleButton value="manufacturer" aria-label="manufacturer">
                <FactoryIcon fontSize="small" />
                {VENDOR_TYPE_LABELS.manufacturer}
              </ToggleButton>
              <ToggleButton value="individual" aria-label="individual">
                <PersonIcon fontSize="small" />
                {VENDOR_TYPE_LABELS.individual}
              </ToggleButton>
              <ToggleButton value="rental_store" aria-label="rental_store">
                <RentalIcon fontSize="small" />
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
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <Typography variant="body2" color="text.secondary">
                Rating
              </Typography>
              <Rating
                value={formData.rating || 0}
                onChange={(_, value) => handleChange("rating", value)}
                precision={0.5}
              />
            </Box>
          </Grid>
        </Grid>

        {/* ---------------- Contact (always visible) ---------------- */}
        <SectionTitle icon={<ContactPhoneIcon fontSize="small" />} sx={{ mt: 3 }}>
          Contact
        </SectionTitle>
        <Grid container spacing={2}>
          <Grid size={12}>
            <TextField
              fullWidth
              label="Contact Person"
              value={formData.contact_person}
              onChange={(e) => handleChange("contact_person", e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <TextField
              fullWidth
              label="Phone"
              value={formData.phone}
              onChange={(e) => handleChange("phone", e.target.value)}
              placeholder="+91 99999 99999"
            />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <TextField
              fullWidth
              label="Alternate Phone"
              value={formData.alternate_phone}
              onChange={(e) => handleChange("alternate_phone", e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <TextField
              fullWidth
              label="WhatsApp"
              value={formData.whatsapp_number}
              onChange={(e) => handleChange("whatsapp_number", e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <TextField
              fullWidth
              label="Email"
              type="email"
              value={formData.email}
              onChange={(e) => handleChange("email", e.target.value)}
            />
          </Grid>
          <Grid size={12}>
            <TextField
              fullWidth
              label="Google Business / Maps link"
              placeholder="https://maps.app.goo.gl/..."
              value={formData.google_business_url}
              onChange={(e) => handleChange("google_business_url", e.target.value)}
              helperText="Tap Find → open the listing on Google → Share → copy the link → paste it here."
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    {googleBusinessHref(formData.google_business_url) ? (
                      <IconButton
                        size="small"
                        edge="end"
                        aria-label="Open saved link"
                        onClick={() => {
                          const href = googleBusinessHref(formData.google_business_url);
                          if (href) window.open(href, "_blank", "noopener");
                        }}
                      >
                        <OpenInNewIcon fontSize="small" />
                      </IconButton>
                    ) : null}
                    <Button
                      size="small"
                      startIcon={<TravelExploreIcon fontSize="small" />}
                      onClick={() =>
                        window.open(
                          googleMapsSearchHref([
                            formData.name,
                            formData.shop_name,
                            formData.city,
                            formData.state,
                            "India",
                          ]),
                          "_blank",
                          "noopener"
                        )
                      }
                      sx={{ whiteSpace: "nowrap", flexShrink: 0 }}
                    >
                      Find
                    </Button>
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
        </Grid>

        {/* ---------------- Location (always visible) ---------------- */}
        <SectionTitle icon={<PlaceIcon fontSize="small" />} sx={{ mt: 3 }}>
          Location
        </SectionTitle>
        <Grid container spacing={2}>
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
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              fullWidth
              label="City"
              value={formData.city}
              onChange={(e) => handleChange("city", e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 4 }}>
            <TextField
              fullWidth
              label="State"
              value={formData.state}
              onChange={(e) => handleChange("state", e.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 4 }}>
            <TextField
              fullWidth
              label="Pincode"
              value={formData.pincode}
              onChange={(e) => handleChange("pincode", e.target.value)}
            />
          </Grid>
        </Grid>

        {/* ---------------- Advanced (collapsed by default) ---------------- */}
        <Box sx={{ mt: 3 }}>
          {/* Store & warehouse — for shop and any vendor with a physical store */}
          {(formData.vendor_type === "shop" || formData.has_physical_store) && (
            <Accordion
              expanded={storeExpanded}
              onChange={(_, v) => setStoreExpanded(v)}
              disableGutters
              elevation={0}
              square
              sx={sectionAccordionSx}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <WarehouseIcon fontSize="small" color="action" />
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Store &amp; warehouse
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 0 }}>
                <Grid container spacing={2}>
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
                    <FormControlLabel
                      control={
                        <Switch
                          checked={sameAsAddress}
                          onChange={(e) => handleSameAsAddressToggle(e.target.checked)}
                        />
                      }
                      label="Same as address"
                    />
                  </Grid>
                  <Grid size={12}>
                    <TextField
                      fullWidth
                      label="Store Address"
                      value={formData.store_address}
                      onChange={(e) => handleChange("store_address", e.target.value)}
                      multiline
                      rows={2}
                      placeholder="Physical store/warehouse address"
                      disabled={sameAsAddress}
                    />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 4 }}>
                    <TextField
                      fullWidth
                      label="Store City"
                      value={formData.store_city}
                      onChange={(e) => handleChange("store_city", e.target.value)}
                      disabled={sameAsAddress}
                    />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 4 }}>
                    <TextField
                      fullWidth
                      label="Store Pincode"
                      value={formData.store_pincode}
                      onChange={(e) => handleChange("store_pincode", e.target.value)}
                      disabled={sameAsAddress}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField
                      fullWidth
                      label="Delivery Radius (km)"
                      type="number"
                      value={formData.delivery_radius_km || ""}
                      onChange={(e) =>
                        handleChange("delivery_radius_km", parseInt(e.target.value) || 0)
                      }
                      slotProps={{ input: { inputProps: { min: 0 } } }}
                    />
                  </Grid>

                  {/* Shop Photo Upload */}
                  <Grid size={12}>
                    <Box onPaste={handleShopPhotoPasteEvent} tabIndex={0} sx={{ outline: "none" }}>
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
                              onClick={handlePasteShopPhoto}
                              disabled={uploadingShopPhoto}
                              startIcon={<PasteIcon />}
                            >
                              Paste
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
                        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                          <Button
                            variant="outlined"
                            onClick={() => shopPhotoInputRef.current?.click()}
                            disabled={uploadingShopPhoto}
                            startIcon={uploadingShopPhoto ? <CircularProgress size={16} /> : <UploadIcon />}
                            sx={{ height: 56 }}
                          >
                            {uploadingShopPhoto ? "Uploading..." : "Upload Shop Photo"}
                          </Button>
                          <Button
                            variant="outlined"
                            onClick={handlePasteShopPhoto}
                            disabled={uploadingShopPhoto}
                            startIcon={<PasteIcon />}
                            sx={{ height: 56 }}
                          >
                            Paste
                          </Button>
                        </Box>
                      )}
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                        Add a photo of the vendor&apos;s shop — upload, or paste a copied image (Ctrl/Cmd+V)
                      </Typography>
                    </Box>
                  </Grid>
                </Grid>
              </AccordionDetails>
            </Accordion>
          )}

          {/* Services & delivery — hidden for rental vendors */}
          {formData.vendor_type !== "rental_store" && (
            <Accordion
              expanded={servicesExpanded}
              onChange={(_, v) => setServicesExpanded(v)}
              disableGutters
              elevation={0}
              square
              sx={sectionAccordionSx}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <DealerIcon fontSize="small" color="action" />
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Services &amp; delivery
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 0 }}>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 6, sm: 4 }}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={formData.provides_transport || false}
                          onChange={(e) => handleChange("provides_transport", e.target.checked)}
                        />
                      }
                      label="Transport"
                    />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 4 }}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={formData.provides_loading || false}
                          onChange={(e) => handleChange("provides_loading", e.target.checked)}
                        />
                      }
                      label="Loading"
                    />
                  </Grid>
                  <Grid size={{ xs: 6, sm: 4 }}>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={formData.provides_unloading || false}
                          onChange={(e) => handleChange("provides_unloading", e.target.checked)}
                        />
                      }
                      label="Unloading"
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
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
                          startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                        },
                      }}
                    />
                  </Grid>
                </Grid>
              </AccordionDetails>
            </Accordion>
          )}

          {/* Material categories — hidden for rental vendors */}
          {formData.vendor_type !== "rental_store" && (
            <Accordion
              expanded={categoriesExpanded}
              onChange={(_, v) => setCategoriesExpanded(v)}
              disableGutters
              elevation={0}
              square
              sx={sectionAccordionSx}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <CategoryIcon fontSize="small" color="action" />
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Material categories
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 0 }}>
                <CategoryAutocomplete
                  value={formData.category_ids || []}
                  onChange={(value) => handleChange("category_ids", value || [])}
                  multiple
                  parentOnly
                  label="Categories"
                  placeholder="Search and select categories..."
                />
              </AccordionDetails>
            </Accordion>
          )}

          {/* Tax & payment */}
          <Accordion
            expanded={taxDetailsExpanded}
            onChange={(_, v) => setTaxDetailsExpanded(v)}
            disableGutters
            elevation={0}
            square
            sx={sectionAccordionSx}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <PaymentsIcon fontSize="small" color="action" />
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  Tax &amp; payment
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 0 }}>
              <Grid container spacing={2}>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <TextField
                    fullWidth
                    label="GST Number"
                    value={formData.gst_number}
                    onChange={(e) => handleChange("gst_number", e.target.value.toUpperCase())}
                    placeholder="22AAAAA0000A1Z5"
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <TextField
                    fullWidth
                    label="PAN Number"
                    value={formData.pan_number}
                    onChange={(e) => handleChange("pan_number", e.target.value.toUpperCase())}
                    placeholder="AAAAA0000A"
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <TextField
                    fullWidth
                    label="Payment Terms (Days)"
                    type="number"
                    value={formData.payment_terms_days}
                    onChange={(e) =>
                      handleChange("payment_terms_days", parseInt(e.target.value) || 0)
                    }
                    slotProps={{ input: { inputProps: { min: 0 } } }}
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <TextField
                    fullWidth
                    label="Credit Limit (₹)"
                    type="number"
                    value={formData.credit_limit}
                    onChange={(e) =>
                      handleChange("credit_limit", parseFloat(e.target.value) || 0)
                    }
                    slotProps={{ input: { inputProps: { min: 0 } } }}
                  />
                </Grid>

                <Grid size={12}>
                  <Typography variant="subtitle2" sx={{ mt: 1, mb: 0.5 }}>
                    Payment Methods Accepted
                  </Typography>
                </Grid>
                <Grid size={{ xs: 4 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={formData.accepts_upi || false}
                        onChange={(e) => handleChange("accepts_upi", e.target.checked)}
                      />
                    }
                    label="UPI"
                  />
                </Grid>
                <Grid size={{ xs: 4 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={formData.accepts_cash || false}
                        onChange={(e) => handleChange("accepts_cash", e.target.checked)}
                      />
                    }
                    label="Cash"
                  />
                </Grid>
                <Grid size={{ xs: 4 }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={formData.accepts_credit || false}
                        onChange={(e) => handleChange("accepts_credit", e.target.checked)}
                      />
                    }
                    label="Credit"
                  />
                </Grid>
                {formData.accepts_credit && (
                  <Grid size={{ xs: 6, sm: 4 }}>
                    <TextField
                      fullWidth
                      label="Credit Days"
                      type="number"
                      value={formData.credit_days || ""}
                      onChange={(e) =>
                        handleChange("credit_days", parseInt(e.target.value) || 0)
                      }
                      slotProps={{ input: { inputProps: { min: 0 } } }}
                      helperText="Days of credit allowed"
                    />
                  </Grid>
                )}
              </Grid>
            </AccordionDetails>
          </Accordion>

          {/* Bank & UPI */}
          <Accordion
            expanded={bankExpanded}
            onChange={(_, v) => setBankExpanded(v)}
            disableGutters
            elevation={0}
            square
            sx={sectionAccordionSx}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <BankIcon fontSize="small" color="action" />
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  Bank &amp; UPI
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 0 }}>
              <Grid container spacing={2}>
                <Grid size={12}>
                  <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                    UPI / Digital Payment
                  </Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label="UPI ID"
                    value={formData.upi_id}
                    onChange={(e) => handleChange("upi_id", e.target.value)}
                    placeholder="name@upi or phone@bank"
                    helperText="e.g., vendor@ybl, 9876543210@paytm"
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
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

                <Grid size={12}>
                  <Divider sx={{ my: 1 }} />
                  <Typography variant="subtitle2" sx={{ mt: 1, mb: 0.5 }}>
                    Bank Account Details
                  </Typography>
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField
                    fullWidth
                    label="Bank Name"
                    value={formData.bank_name}
                    onChange={(e) => handleChange("bank_name", e.target.value)}
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <TextField
                    fullWidth
                    label="Account Number"
                    value={formData.bank_account_number}
                    onChange={(e) => handleChange("bank_account_number", e.target.value)}
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <TextField
                    fullWidth
                    label="IFSC Code"
                    value={formData.bank_ifsc}
                    onChange={(e) => handleChange("bank_ifsc", e.target.value.toUpperCase())}
                  />
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>

          {/* Notes */}
          <Accordion
            expanded={notesExpanded}
            onChange={(_, v) => setNotesExpanded(v)}
            disableGutters
            elevation={0}
            square
            sx={sectionAccordionSx}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <NotesIcon fontSize="small" color="action" />
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  Notes
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 0 }}>
              <TextField
                fullWidth
                label="Notes"
                value={formData.notes}
                onChange={(e) => handleChange("notes", e.target.value)}
                multiline
                rows={3}
                placeholder="Additional notes about this vendor..."
              />
            </AccordionDetails>
          </Accordion>
        </Box>
      </Box>

      {/* Sticky footer */}
      <Box
        sx={{
          borderTop: 1,
          borderColor: "divider",
          p: 2,
          display: "flex",
          gap: 1,
          justifyContent: "flex-end",
          bgcolor: "background.paper",
          flexShrink: 0,
        }}
      >
        <Button onClick={onClose} disabled={isSubmitting} fullWidth={isMobile}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={isSubmitting || !formData.name.trim()}
          fullWidth={isMobile}
          startIcon={isSubmitting ? <CircularProgress size={16} color="inherit" /> : undefined}
        >
          {isSubmitting ? "Saving..." : isEdit ? "Update" : "Create"}
        </Button>
      </Box>
    </Drawer>
  );
}
