"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  Popover,
  TextField,
  Tooltip,
  Typography,
  Stack,
  Divider,
  alpha,
} from "@mui/material";
import {
  PhotoCamera as PhotoCameraIcon,
  Inventory as InventoryIcon,
  Save as SaveIcon,
  Close as CloseIcon,
  CloudUpload as CloudUploadIcon,
  Receipt as ReceiptIcon,
  AttachFile as AttachFileIcon,
} from "@mui/icons-material";
import { EntityImageAvatar } from "@/components/common/EntityImageAvatar";
import VendorAutocomplete from "@/components/common/VendorAutocomplete";
import DynamicVariantField from "./DynamicVariantField";
import {
  useAddVariantToMaterial,
  useMaterialCategories,
  useUpdateMaterial,
} from "@/hooks/queries/useMaterials";
import {
  getCategoryTemplate,
  renderNameTemplate,
} from "@/lib/category-variant-templates";
import type { VariantFieldDefinition } from "@/types/category-variant-fields.types";
import type { MaterialWithDetails, VariantFormData } from "@/types/material.types";
import { createClient } from "@/lib/supabase/client";
import { hardenedUpload } from "@/lib/storage/uploadHelpers";

const GALLERY_PHOTOS: string[] = [
  "CRI2HP30Stage.jpeg",
  "Chamber_brick.jpg",
  "Country_nattu_brick.jpeg",
  "Cover-Block.webp",
  "Msand.jpg",
  "PanelCRI.jpeg",
  "amman-tmt-bar-500x500.webp",
  "binding_wire.jpg",
  "chettinadPPC43.png",
  "flyash.jpg",
  "mukkal_Jalli.jpg",
  "ondra_jalli.webp",
  "psand.png",
  "red_Brick.jpg",
];

type Mode = "add" | "edit";

interface VariantInlineCardProps {
  mode: Mode;
  parentMaterial: MaterialWithDetails;
  /** Required in edit mode */
  variant?: MaterialWithDetails | null;
  onCancel: () => void;
  onSaved?: () => void;
}

function readSpecValue(
  variant: MaterialWithDetails | null | undefined,
  field: VariantFieldDefinition
): unknown {
  if (!variant) return field.defaultValue ?? null;
  // Steel/pipes/cable mirror these into legacy columns; read them back from there.
  if (field.writeLegacyColumn) {
    const legacyVal =
      field.key === "weight_per_unit"
        ? variant.weight_per_unit
        : field.key === "length_per_piece"
        ? variant.length_per_piece
        : field.key === "rods_per_bundle"
        ? variant.rods_per_bundle
        : null;
    return legacyVal ?? null;
  }
  const specs = (variant.specifications as Record<string, unknown> | null | undefined) ?? {};
  return specs[field.key] ?? null;
}

export default function VariantInlineCard({
  mode,
  parentMaterial,
  variant,
  onCancel,
  onSaved,
}: VariantInlineCardProps) {
  // Resolve the spec template from the category hierarchy. Categories are
  // fetched here rather than read off parentMaterial.category, because the
  // material selects only (id, name, code) — `category.parent_id` type-checks
  // but is undefined at runtime, so walking it would silently resolve nothing.
  const { data: categories } = useMaterialCategories();
  const category = useMemo(
    () => categories?.find((c) => c.id === parentMaterial.category_id) ?? null,
    [categories, parentMaterial.category_id]
  );
  const parentCategory = useMemo(
    () =>
      category?.parent_id
        ? categories?.find((c) => c.id === category.parent_id) ?? null
        : null,
    [categories, category]
  );
  const template = useMemo(
    () => getCategoryTemplate(category, parentCategory),
    [category, parentCategory]
  );
  const specFields = template.fields;

  // Form state
  const [name, setName] = useState(variant?.name ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(variant?.image_url ?? null);
  const [specValues, setSpecValues] = useState<Record<string, unknown>>({});
  // Once the user types a name themselves, stop deriving it. Seeded true in edit
  // mode so opening an existing variant never rewrites its name.
  const [nameTouched, setNameTouched] = useState(mode === "edit");

  // Categories arrive async, so specFields is empty on first render and the
  // values have to be seeded once the template actually resolves.
  useEffect(() => {
    if (!specFields.length) return;
    setSpecValues((prev) => {
      const next: Record<string, unknown> = { ...prev };
      for (const f of specFields) {
        if (next[f.key] === undefined) next[f.key] = readSpecValue(variant, f);
      }
      return next;
    });
  }, [specFields, variant]);

  // Derive the variant name from its specs ("8x4 · 18mm"). Users type dimensions
  // into the name and skip the spec fields — only 11 of ~60 variants carry any
  // specs — so making the specs *produce* the name is what gets them filled.
  // Sets the real value (not a placeholder) so the required-name guard and the
  // Save disabled state keep working untouched.
  useEffect(() => {
    if (nameTouched || !template.nameTemplate) return;
    const derived = renderNameTemplate(template.nameTemplate, specValues);
    if (derived) setName(derived);
  }, [specValues, nameTouched, template.nameTemplate]);

  // Vendor + price (add mode only)
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [vendorBrandId, setVendorBrandId] = useState<string | null>(null);
  const [price, setPrice] = useState<string>("");
  const [vendorNotes, setVendorNotes] = useState<string>("");

  // The parent declares whether a price is brand-specific. The variant row
  // itself carries no such flag.
  const requiresBrand = parentMaterial.price_varies_by_brand === true;
  const visibleBrands = useMemo(
    () => (parentMaterial.brands ?? []).filter((b) => b.is_active),
    [parentMaterial.brands]
  );

  // Optional bill backing the manual vendor rate. Uploaded to
  // `purchase-documents` on save and stamped onto a price_history row.
  const [billFile, setBillFile] = useState<File | null>(null);
  const [billUploading, setBillUploading] = useState(false);
  const billInputRef = useRef<HTMLInputElement | null>(null);

  // Image picker popover
  const [pickerAnchor, setPickerAnchor] = useState<HTMLElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const addVariant = useAddVariantToMaterial();
  const updateMaterial = useUpdateMaterial();
  const isPending = addVariant.isPending || updateMaterial.isPending;

  const [error, setError] = useState<string>("");

  const handleFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input so picking the same file twice still fires onChange.
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError("Image too large (max 5 MB)");
      return;
    }
    if (!/^image\/(jpeg|png|webp|jpg)$/i.test(file.type)) {
      setError("Please pick a JPEG, PNG, or WebP image");
      return;
    }
    setError("");
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const slug = (parentMaterial.code || parentMaterial.id).toLowerCase().replace(/[^a-z0-9-]/g, "-");
      const filePath = `product-photos/variant-${slug}-${Date.now()}.${ext}`;
      const { publicUrl } = await hardenedUpload({
        supabase,
        bucketName: "work-updates",
        filePath,
        file,
        contentType: file.type,
      });
      setImageUrl(publicUrl);
      setPickerAnchor(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setError(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleSpecChange = (key: string, value: unknown) => {
    setSpecValues((prev) => ({ ...prev, [key]: value }));
  };

  const parseSpecsForSubmit = () => {
    const specs: Record<string, unknown> = {};
    // DynamicVariantField already coerces number/integer, so these arrive typed.
    const legacy: {
      weight_per_unit?: number | null;
      length_per_piece?: number | null;
      rods_per_bundle?: number | null;
      weight_unit?: string;
      length_unit?: string;
    } = {};

    for (const f of specFields) {
      const value = specValues[f.key];
      const isEmpty =
        value === undefined || value === null || String(value).trim() === "";

      if (isEmpty) {
        // Clear the mirrored column too, or a blanked field would leave a stale
        // number behind in the costing math.
        if (f.writeLegacyColumn) {
          if (f.key === "weight_per_unit") legacy.weight_per_unit = null;
          else if (f.key === "length_per_piece") legacy.length_per_piece = null;
          else if (f.key === "rods_per_bundle") legacy.rods_per_bundle = null;
        }
        continue;
      }

      specs[f.key] = value;

      if (f.writeLegacyColumn) {
        if (f.key === "weight_per_unit" || f.key === "length_per_piece") {
          legacy[f.key] = Number(value);
          // Carry the template's unit onto the paired column. Without this the
          // unit columns keep their 'm'/'kg' defaults while the value is in
          // whatever the template declares — a 40 ft TMT rod would persist as
          // length_per_piece=40, length_unit='m'.
          if (f.unit) {
            if (f.key === "length_per_piece") legacy.length_unit = f.unit;
            else legacy.weight_unit = f.unit;
          }
        } else if (f.key === "rods_per_bundle") {
          legacy.rods_per_bundle = Number(value);
        }
      }
    }
    return { specs, legacy };
  };

  const handleBillPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    // Allow re-picking the same file by clearing the input.
    if (billInputRef.current) billInputRef.current.value = "";
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) {
      setError("Bill too large (max 15 MB)");
      return;
    }
    if (
      !/^(application\/pdf|image\/(jpeg|jpg|png|webp|heic|heif))$/i.test(file.type)
    ) {
      setError("Bill must be a PDF, JPEG, PNG, WebP, or HEIC");
      return;
    }
    setError("");
    setBillFile(file);
  };

  const uploadBillIfNeeded = async (variantSlug: string): Promise<string | null> => {
    if (!billFile) return null;
    setBillUploading(true);
    try {
      const supabase = createClient();
      const ext = (billFile.name.split(".").pop() || "pdf").toLowerCase();
      const filePath = `manual-rates/${variantSlug}-${Date.now()}.${ext}`;
      const { publicUrl } = await hardenedUpload({
        supabase,
        bucketName: "purchase-documents",
        filePath,
        file: billFile,
        contentType: billFile.type,
      });
      return publicUrl;
    } finally {
      setBillUploading(false);
    }
  };

  const handleSave = async () => {
    setError("");
    if (!name.trim()) {
      setError("Variant name is required");
      return;
    }

    // Vendor implies price required (add mode only)
    if (mode === "add" && vendorId) {
      const p = Number(price);
      if (!p || p <= 0) {
        setError("Price is required when a vendor is selected");
        return;
      }
    }

    // Bill without vendor+price is nonsensical — surface the constraint here
    // rather than silently dropping the upload server-side.
    if (mode === "add" && billFile && !vendorId) {
      setError("Pick a vendor and price before attaching a bill");
      return;
    }

    // A first quote is a quote: it has to name its brand like any other.
    if (mode === "add" && vendorId && requiresBrand && !vendorBrandId) {
      setError(
        visibleBrands.length
          ? `Pick the brand this price is for — ${parentMaterial.name}'s price varies by brand.`
          : `${parentMaterial.name}'s price varies by brand, but it has no brands yet. Add one from the Brands tab first.`
      );
      return;
    }

    const { specs, legacy } = parseSpecsForSubmit();

    try {
      let billUrl: string | null = null;
      if (mode === "add" && billFile && vendorId) {
        const slug = (parentMaterial.code || parentMaterial.id)
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, "-");
        billUrl = await uploadBillIfNeeded(slug);
      }

      if (mode === "add") {
        const formData: VariantFormData = {
          name: name.trim(),
          weight_per_unit: legacy.weight_per_unit ?? null,
          length_per_piece: legacy.length_per_piece ?? null,
          rods_per_bundle: legacy.rods_per_bundle ?? null,
          weight_unit: legacy.weight_unit,
          length_unit: legacy.length_unit,
          specifications: specs,
          image_url: imageUrl,
          initial_vendor_id: vendorId ?? null,
          initial_vendor_price: vendorId ? Number(price) : null,
          initial_vendor_brand_id: vendorId ? vendorBrandId : null,
          initial_vendor_notes: vendorNotes.trim() || null,
          initial_vendor_bill_url: billUrl,
        };
        await addVariant.mutateAsync({
          parentId: parentMaterial.id,
          variant: formData,
        });
      } else if (mode === "edit" && variant) {
        await updateMaterial.mutateAsync({
          id: variant.id,
          data: {
            name: name.trim(),
            image_url: imageUrl ?? undefined,
            // MERGE, don't replace. `specs` only holds keys the current template
            // knows about, so a plain assignment drops everything else in the
            // JSONB — renaming a Paint variant used to silently wipe its
            // {"tier":"Retail"}, and Tools rows carry hand-authored JSON no
            // template declares.
            specifications: {
              ...((variant.specifications as Record<string, unknown> | null) ?? {}),
              ...specs,
            },
            weight_per_unit: legacy.weight_per_unit ?? null,
            length_per_piece: legacy.length_per_piece ?? null,
            rods_per_bundle: legacy.rods_per_bundle ?? null,
            ...(legacy.weight_unit ? { weight_unit: legacy.weight_unit } : {}),
            ...(legacy.length_unit ? { length_unit: legacy.length_unit } : {}),
          },
        });
      }
      onSaved?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save variant";
      setError(msg);
    }
  };

  const unitLabel = parentMaterial.unit || "unit";

  return (
    <Box
      sx={{
        border: 1,
        borderColor: "primary.main",
        borderRadius: 1.5,
        p: 1.5,
        bgcolor: "background.paper",
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
      }}
    >
      {/* Header: image + name */}
      <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start" }}>
        <Box sx={{ position: "relative", flexShrink: 0 }}>
          <EntityImageAvatar
            src={imageUrl}
            name={name || "?"}
            size={72}
            fallbackIcon={<InventoryIcon />}
            tint="primary"
          />
          <Tooltip title="Choose image" placement="top">
            <IconButton
              size="small"
              onClick={(e) => setPickerAnchor(e.currentTarget)}
              sx={{
                position: "absolute",
                bottom: -4,
                right: -4,
                width: 26,
                height: 26,
                bgcolor: "primary.main",
                color: "primary.contrastText",
                border: 2,
                borderColor: "background.paper",
                "&:hover": { bgcolor: "primary.dark" },
              }}
            >
              <PhotoCameraIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        </Box>
        <TextField
          fullWidth
          size="small"
          label="Variant name"
          required
          value={name}
          onChange={(e) => {
            // Latch on the USER's keystroke only — never on the derivation's own
            // setName, or auto-naming would kill itself on the first name it writes.
            setNameTouched(true);
            setName(e.target.value);
          }}
          autoFocus
          placeholder={`e.g., ${parentMaterial.name} (variant)`}
          helperText={
            !nameTouched && template.nameTemplate && name
              ? "Named from the specs below — type to override"
              : undefined
          }
        />
      </Box>

      {/* Specifications — skipped entirely for categories with no structured
          specs (sand, cement, hardware, tools), which is a deliberate template
          declaration rather than a gap. */}
      {specFields.length > 0 && (
        <>
          <Divider textAlign="left" sx={{ fontSize: 11, color: "text.secondary", letterSpacing: 0.5, textTransform: "uppercase" }}>
            Specifications
          </Divider>
          <Stack direction="row" flexWrap="wrap" gap={1}>
            {specFields.map((f) => (
              <Box key={f.key} sx={{ minWidth: 140, flex: "1 1 140px" }}>
                <DynamicVariantField
                  field={f}
                  value={specValues[f.key] ?? ""}
                  onChange={(v) => handleSpecChange(f.key, v)}
                  size="small"
                  variant="outlined"
                  fullWidth
                  showLabel
                />
              </Box>
            ))}
          </Stack>
        </>
      )}

      {/* Vendor + price (Add mode only) */}
      {mode === "add" && (
        <>
          <Divider textAlign="left" sx={{ fontSize: 11, color: "text.secondary", letterSpacing: 0.5, textTransform: "uppercase" }}>
            First vendor quote (optional)
          </Divider>
          <Stack direction="row" gap={1} flexWrap="wrap">
            <Box sx={{ flex: "2 1 200px", minWidth: 180 }}>
              <VendorAutocomplete
                value={vendorId}
                onChange={(v) => setVendorId(v as string | null)}
                size="small"
                label="Vendor"
                placeholder="Search vendors..."
              />
            </Box>
            <TextField
              size="small"
              label={`Price per ${unitLabel}`}
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                  inputProps: { min: 0, step: 0.01 },
                },
              }}
              sx={{ flex: "1 1 120px", minWidth: 120 }}
              disabled={!vendorId}
            />
          </Stack>
          {/* Brand — shown only when this material's price actually depends on
              it. Kept visible (rather than hidden) when there are no brands yet,
              so the gap is stated instead of silently producing a brandless price. */}
          {requiresBrand ? (
            visibleBrands.length ? (
              <Autocomplete
                size="small"
                value={visibleBrands.find((b) => b.id === vendorBrandId) ?? null}
                onChange={(_, b) => setVendorBrandId(b?.id ?? null)}
                options={visibleBrands}
                getOptionLabel={(o) =>
                  o.variant_name ? `${o.brand_name} ${o.variant_name}` : o.brand_name
                }
                isOptionEqualToValue={(a, b) => a.id === b.id}
                disabled={!vendorId}
                slotProps={{ popper: { disablePortal: false } }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Brand"
                    size="small"
                    required
                    helperText={`${parentMaterial.name}'s price varies by brand`}
                  />
                )}
              />
            ) : vendorId ? (
              <Alert severity="warning" variant="outlined" sx={{ py: 0, fontSize: 12 }}>
                {parentMaterial.name}&apos;s price varies by brand, but it has no
                brands yet — add one from the Brands tab.
              </Alert>
            ) : null
          ) : null}
          <TextField
            size="small"
            label="Vendor notes"
            value={vendorNotes}
            onChange={(e) => setVendorNotes(e.target.value)}
            placeholder='e.g., "Tipper load minimum 4 cft"'
            disabled={!vendorId}
          />
          {/* Optional bill attachment: backs the rate with a verifiable
              invoice. Persisted as a price_history row (source='manual'). */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            <Button
              size="small"
              variant={billFile ? "contained" : "outlined"}
              color={billFile ? "primary" : "inherit"}
              startIcon={billUploading ? <CircularProgress size={14} /> : <AttachFileIcon />}
              onClick={() => billInputRef.current?.click()}
              disabled={!vendorId || billUploading}
              sx={{ textTransform: "none", fontSize: 12 }}
            >
              {billFile ? "Bill attached" : "Attach bill (optional)"}
            </Button>
            {billFile ? (
              <>
                <Tooltip title={billFile.name} placement="top">
                  <Box
                    sx={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 0.5,
                      px: 0.75,
                      py: 0.25,
                      bgcolor: (t) => alpha(t.palette.success.main, 0.1),
                      borderRadius: 1,
                      fontSize: 11,
                      color: "success.dark",
                      maxWidth: 220,
                    }}
                  >
                    <ReceiptIcon sx={{ fontSize: 13 }} />
                    <Typography
                      sx={{
                        fontSize: 11,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {billFile.name}
                    </Typography>
                  </Box>
                </Tooltip>
                <IconButton
                  size="small"
                  onClick={() => setBillFile(null)}
                  disabled={billUploading}
                  aria-label="Remove bill"
                >
                  <CloseIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </>
            ) : (
              <Typography sx={{ fontSize: 11, color: "text.disabled" }}>
                PDF, JPEG, PNG, WebP, HEIC · up to 15 MB
              </Typography>
            )}
          </Box>
        </>
      )}

      {error && (
        <Typography variant="caption" color="error">
          {error}
        </Typography>
      )}

      {/* Actions */}
      <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, mt: 0.5 }}>
        <Button
          size="small"
          onClick={onCancel}
          disabled={isPending}
          startIcon={<CloseIcon />}
        >
          Cancel
        </Button>
        <Button
          size="small"
          variant="contained"
          onClick={handleSave}
          disabled={isPending || billUploading || !name.trim()}
          startIcon={<SaveIcon />}
        >
          {billUploading
            ? "Uploading bill..."
            : isPending
            ? "Saving..."
            : mode === "add"
            ? "Add variant"
            : "Save"}
        </Button>
      </Box>

      {/* Hidden file input for upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: "none" }}
        onChange={handleFilePicked}
      />

      {/* Hidden file input for bill upload (PDF / image) */}
      <input
        ref={billInputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
        style={{ display: "none" }}
        onChange={handleBillPicked}
      />

      {/* Image picker popover */}
      <Popover
        open={Boolean(pickerAnchor)}
        anchorEl={pickerAnchor}
        onClose={() => !uploading && setPickerAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { sx: { p: 1.5, width: 300 } } }}
      >
        <Typography sx={{ fontSize: 11, fontWeight: 700, mb: 1, color: "text.secondary", textTransform: "uppercase", letterSpacing: 0.5 }}>
          Choose image
        </Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0.75 }}>
          {/* Upload-new tile */}
          <Tooltip title="Upload from device (JPEG / PNG / WebP, up to 5 MB)" placement="top">
            <Box
              onClick={() => !uploading && fileInputRef.current?.click()}
              sx={{
                width: "100%",
                aspectRatio: "1",
                borderRadius: 1,
                cursor: uploading ? "wait" : "pointer",
                border: "2px dashed",
                borderColor: "primary.main",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                color: "primary.main",
                bgcolor: (t) => t.palette.action.hover,
                "&:hover": { bgcolor: (t) => t.palette.action.selected },
              }}
            >
              {uploading ? (
                <CircularProgress size={18} />
              ) : (
                <>
                  <CloudUploadIcon sx={{ fontSize: 22 }} />
                  <Typography sx={{ fontSize: 9, fontWeight: 700, mt: 0.25 }}>
                    Upload
                  </Typography>
                </>
              )}
            </Box>
          </Tooltip>
          {GALLERY_PHOTOS.map((fname) => (
            <Tooltip key={fname} title={fname.replace(/\.[^.]+$/, "").replace(/_/g, " ")} placement="top">
              <Box
                component="img"
                src={`/Material_Photo/${fname}`}
                alt={fname}
                onClick={() => {
                  setImageUrl(`/Material_Photo/${fname}`);
                  setPickerAnchor(null);
                }}
                sx={{
                  width: "100%",
                  aspectRatio: "1",
                  objectFit: "cover",
                  borderRadius: 1,
                  cursor: "pointer",
                  border: 2,
                  borderColor:
                    imageUrl === `/Material_Photo/${fname}` ? "primary.main" : "transparent",
                  "&:hover": { borderColor: "primary.main" },
                }}
              />
            </Tooltip>
          ))}
        </Box>
        <Box
          onClick={() => {
            if (uploading) return;
            setImageUrl(null);
            setPickerAnchor(null);
          }}
          sx={{
            mt: 1,
            pt: 1,
            borderTop: 1,
            borderColor: "divider",
            fontSize: 12,
            color: "text.secondary",
            cursor: uploading ? "wait" : "pointer",
            "&:hover": { color: "error.main" },
          }}
        >
          Remove image
        </Box>
      </Popover>
    </Box>
  );
}
