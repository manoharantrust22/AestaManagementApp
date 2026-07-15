"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  IconButton,
  Chip,
  Alert,
  FormControlLabel,
  Switch,
  Autocomplete,
  InputAdornment,
  Tooltip,
  Collapse,
  alpha,
  useTheme,
} from "@mui/material";
import {
  Close as CloseIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Add as AddIcon,
  AccountTree as AccountTreeIcon,
  Edit as EditIcon,
  Translate as TranslateIcon,
  Description as DescriptionIcon,
  Image as ImageIcon,
  Inventory2 as InventoryIcon,
  Storefront as BrandIcon,
} from "@mui/icons-material";
import CategoryAutocomplete from "@/components/common/CategoryAutocomplete";
import DraftRestoreBanner from "@/components/common/DraftRestoreBanner";
import FileUploader from "@/components/common/FileUploader";
import { EntityImageAvatar } from "@/components/common/EntityImageAvatar";
import { SaveButton } from "@/components/common/SaveButton";
import { InlineErrorBanner } from "@/components/common/InlineErrorBanner";
import { useToast } from "@/contexts/ToastContext";
import { isAbortOrTimeoutError } from "@/lib/utils/timeout";
import { createClient } from "@/lib/supabase/client";
import { calculatePieceWeight } from "@/lib/weightCalculation";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useFormDraft } from "@/hooks/useFormDraft";
import {
  useCreateMaterial,
  useUpdateMaterial,
  useCreateMaterialBrand,
  useDeleteMaterialBrand,
  useUpdateMaterialBrand,
  useParentMaterials,
  useCreateMaterialWithVariants,
  useMaterial,
  useMaterialVariants,
  useCreateMaterialCategory,
  useAddVariantToMaterial,
} from "@/hooks/queries/useMaterials";
import type {
  MaterialWithDetails,
  MaterialCategory,
  MaterialFormData,
  MaterialUnit,
  MaterialBrand,
  VariantFormData,
} from "@/types/material.types";
import VariantInlineTable from "./VariantInlineTable";
import BrandVariantEditor from "./BrandVariantEditor";
import CategoryDialog, { type CategoryFormData } from "@/components/categories/CategoryDialog";
import { defaultsForCategoryCode } from "@/lib/material-price-scoping-defaults";

const TMT_CATEGORY_PATTERNS = ["tmt", "steel", "bar", "rod"];

const UNITS: { value: MaterialUnit; label: string }[] = [
  { value: "kg", label: "Kilogram (kg)" },
  { value: "g", label: "Gram (g)" },
  { value: "ton", label: "Ton" },
  { value: "bag", label: "Bag" },
  { value: "piece", label: "Piece" },
  { value: "nos", label: "Numbers (nos)" },
  { value: "sqft", label: "Square Feet (sqft)" },
  { value: "sqm", label: "Square Meter (sqm)" },
  { value: "cft", label: "Cubic Feet (cft)" },
  { value: "cum", label: "Cubic Meter (cum)" },
  { value: "rmt", label: "Running Meter (rmt)" },
  { value: "liter", label: "Liter" },
  { value: "ml", label: "Milliliter (ml)" },
  { value: "bundle", label: "Bundle" },
  { value: "box", label: "Box" },
  { value: "set", label: "Set" },
];

interface MaterialDialogProps {
  open: boolean;
  onClose: () => void;
  material: MaterialWithDetails | null;
  categories: MaterialCategory[];
  onEditVariant?: (variant: MaterialWithDetails) => void;
}

export default function MaterialDialog({
  open,
  onClose,
  material,
  categories,
  onEditVariant,
}: MaterialDialogProps) {
  const theme = useTheme();
  const isMobile = useIsMobile();
  const isEdit = !!material;

  const createMaterial = useCreateMaterial();
  const createMaterialWithVariants = useCreateMaterialWithVariants();
  const updateMaterial = useUpdateMaterial();
  const createBrand = useCreateMaterialBrand();
  const updateBrand = useUpdateMaterialBrand();
  const deleteBrand = useDeleteMaterialBrand();
  const { data: parentMaterials = [] } = useParentMaterials();
  const createCategory = useCreateMaterialCategory();
  const addVariant = useAddVariantToMaterial();

  const { data: freshMaterial } = useMaterial(material?.id);
  const materialForBrands = freshMaterial || material;

  const { data: materialVariants = [] } = useMaterialVariants(
    isEdit && material && !material.parent_id ? material.id : undefined
  );

  const [error, setError] = useState("");
  // True when the most recent save failed with a timeout/abort error, so the
  // dialog renders the calm InlineErrorBanner with a prominent Retry button
  // instead of the generic red Alert. Cleared on next attempt.
  const [isTimeoutError, setIsTimeoutError] = useState(false);
  // Brief "Saved" flash on the SaveButton before the dialog closes — gives
  // the user a confidence beat that their work persisted.
  const [saveSuccess, setSaveSuccess] = useState(false);
  const { showProgress } = useToast();
  const [newBrandName, setNewBrandName] = useState("");
  const [isVariant, setIsVariant] = useState(false);
  const [variants, setVariants] = useState<VariantFormData[]>([]);
  const [showVariantSection, setShowVariantSection] = useState(false);
  const [showWeightSection, setShowWeightSection] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customizeCode, setCustomizeCode] = useState(false);
  const [showLocalName, setShowLocalName] = useState(false);
  const [showDescription, setShowDescription] = useState(false);
  const [showImageUpload, setShowImageUpload] = useState(false);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [brandsExpanded, setBrandsExpanded] = useState(false);
  const [variantsExpanded, setVariantsExpanded] = useState(false);
  const [addVariantDialogOpen, setAddVariantDialogOpen] = useState(false);
  const [newVariantName, setNewVariantName] = useState("");
  const [newVariantWeight, setNewVariantWeight] = useState<string>("");
  const [newVariantLength, setNewVariantLength] = useState<string>("");
  const supabase = createClient();

  const initialFormData = useMemo<MaterialFormData>(
    () => ({
      name: material?.name || "",
      code: material?.code || "",
      local_name: material?.local_name || "",
      category_id: material?.category_id || "",
      parent_id: material?.parent_id || "",
      description: material?.description || "",
      unit: material?.unit || "piece",
      hsn_code: material?.hsn_code || "",
      gst_rate: material?.gst_rate ?? 0,
      reorder_level: material?.reorder_level ?? undefined,
      min_order_qty: material?.min_order_qty ?? undefined,
      sold_in_packs: material?.sold_in_packs ?? false,
      price_varies_by_brand: material?.price_varies_by_brand ?? false,
      price_varies_by_variant: material?.price_varies_by_variant ?? false,
      weight_per_unit: material?.weight_per_unit ?? null,
      weight_unit: material?.weight_unit || "kg",
      length_per_piece: material?.length_per_piece ?? null,
      length_unit: material?.length_unit || "ft",
      image_url: material?.image_url || "",
    }),
    [material]
  );

  const {
    formData,
    updateField,
    hasRestoredDraft,
    restoredAt,
    clearDraft,
    discardDraft,
  } = useFormDraft<MaterialFormData>({
    key: "material_dialog",
    initialData: initialFormData,
    isOpen: open,
    entityId: material?.id || null,
  });

  useEffect(() => {
    if (open) {
      if (material) {
        setIsVariant(!!material.parent_id);
        setShowVariantSection(false);
        setShowWeightSection(!!material.weight_per_unit || !!material.length_per_piece);
        setCustomizeCode(!!material.code);
        setShowLocalName(!!material.local_name);
        setShowDescription(!!material.description);
        setShowImageUpload(!!material.image_url);
      } else {
        setIsVariant(false);
        setShowVariantSection(false);
        setShowWeightSection(false);
        setCustomizeCode(false);
        setShowLocalName(false);
        setShowDescription(false);
        setShowImageUpload(false);
      }
      setVariants([]);
      setError("");
      setNewBrandName("");
      const hasBrands = (material?.brands?.filter(b => b.is_active)?.length || 0) > 0;
      setBrandsExpanded(hasBrands);
      setVariantsExpanded(false);
    }
  }, [material, open]);

  const parentCategories = useMemo(
    () => categories.filter((c) => !c.parent_id),
    [categories]
  );

  // Note: subCategories computed but not currently surfaced in the new UI — the
  // CategoryAutocomplete handles parent + sub selection internally. Kept around
  // so that future field-driven branches can still derive it.
  const _subCategoriesUnused = useMemo(() => {
    const parentId = formData.category_id;
    if (!parentId) return [];
    const isParent = parentCategories.some((c) => c.id === parentId);
    if (isParent) return categories.filter((c) => c.parent_id === parentId);
    return [];
  }, [categories, parentCategories, formData.category_id]);

  const availableParentMaterials = useMemo(() => {
    if (isEdit && material) {
      return parentMaterials.filter((m) => m.id !== material.id);
    }
    return parentMaterials;
  }, [parentMaterials, isEdit, material]);

  const currentCategoryName = useMemo(() => {
    if (!formData.category_id) return null;
    const category = categories.find(c => c.id === formData.category_id);
    if (!category) return null;
    if (category.parent_id) {
      const parent = categories.find(c => c.id === category.parent_id);
      return `${parent?.name || ""} ${category.name}`.toLowerCase();
    }
    return category.name.toLowerCase();
  }, [formData.category_id, categories]);

  const fieldVisibility = useMemo(() => {
    const isTMT = currentCategoryName
      ? TMT_CATEGORY_PATTERNS.some(p => currentCategoryName.includes(p))
      : false;
    // HSN code and Min-order-qty hiding were removed in the global field
    // declutter (HSN dropped from the form entirely, Min-order now optional).
    // TMT weight/length tracking stays category-driven.
    return {
      showWeightLengthToggle: isTMT,
    };
  }, [currentCategoryName]);

  const handleParentChange = (parentId: string) => {
    handleChange("parent_id", parentId);
    if (parentId) {
      const parent = parentMaterials.find((m) => m.id === parentId);
      if (parent) {
        if (parent.category_id) handleChange("category_id", parent.category_id);
        handleChange("unit", parent.unit);
      }
    }
  };

  const handleChange = (field: keyof MaterialFormData, value: unknown) => {
    updateField(field, value as MaterialFormData[typeof field]);
    setError("");
  };

  /**
   * Picking a category seeds the price-scoping switches from that category's
   * norms — nobody would think to set them by hand, and an unset flag is exactly
   * how unscoped quotes happen. Only for NEW materials: on an existing one the
   * flags are a deliberate answer and re-categorising must not silently rewrite
   * them.
   */
  const handleCategoryChange = (value: string | string[] | null) => {
    // CategoryAutocomplete is multi-capable; this instance is single-select.
    const categoryId = (Array.isArray(value) ? value[0] : value) || "";
    handleChange("category_id", categoryId);
    if (material) return;
    const code = categories.find((c) => c.id === categoryId)?.code ?? null;
    const defaults = defaultsForCategoryCode(code);
    updateField("price_varies_by_brand", defaults.price_varies_by_brand);
    updateField("price_varies_by_variant", defaults.price_varies_by_variant);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      setError("Material name is required");
      setIsTimeoutError(false);
      return;
    }
    if (isVariant && !formData.parent_id) {
      setError("Please select a parent material for this variant");
      setIsTimeoutError(false);
      return;
    }
    // Reset error state when a fresh attempt starts. Important so the
    // InlineErrorBanner from a previous timeout doesn't linger while the
    // user is mid-retry — the SaveButton's saving state is the only
    // feedback during the next attempt.
    setError("");
    setIsTimeoutError(false);

    // Material 3 progress toast — runs in parallel with the in-dialog
    // SaveButton state. Two redundant feedback channels are intentional:
    // the button anchors the user's attention to where they clicked, the
    // toast guarantees the user notices even if they navigate away.
    const materialLabel = formData.name.trim() || "material";
    const toast = showProgress(
      isEdit ? `Saving ${materialLabel}…` : `Creating ${materialLabel}…`,
    );

    try {
      const dataToSubmit = {
        ...formData,
        parent_id: isVariant ? formData.parent_id : null,
      };
      if (isEdit) {
        await updateMaterial.mutateAsync({ id: material.id, data: dataToSubmit });
      } else if (variants.length > 0 && !isVariant) {
        await createMaterialWithVariants.mutateAsync({ ...dataToSubmit, variants });
      } else {
        await createMaterial.mutateAsync(dataToSubmit);
      }
      // Success path: flash a checkmark on the button + green toast.
      // 700ms is long enough to register as positive feedback, short enough
      // not to feel like the dialog is hanging on completion.
      toast.update({
        severity: "success",
        message: isEdit ? `Saved ${materialLabel}` : `Created ${materialLabel}`,
        duration: 3000,
      });
      setSaveSuccess(true);
      clearDraft();
      window.setTimeout(() => {
        setSaveSuccess(false);
        onClose();
      }, 700);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save material";
      const timedOut = isAbortOrTimeoutError(err);
      setError(message);
      setIsTimeoutError(timedOut);
      // Persistent error toast with a Retry action that re-fires the same
      // submit handler. Form data stays put, so the retry is genuinely a
      // one-tap recovery from any transient network/proxy hiccup.
      toast.update({
        severity: "error",
        message: timedOut
          ? `Couldn't save ${materialLabel} — request timed out`
          : `Couldn't save ${materialLabel}`,
        action: { label: "Retry", onClick: () => { void handleSubmit(); } },
      });
    }
  };

  const handleCreateCategory = async (data: CategoryFormData) => {
    const newCategory = await createCategory.mutateAsync({ ...data, is_active: true });
    handleChange("category_id", newCategory.id);
    setCategoryDialogOpen(false);
  };

  const handleAddBrand = async (brandName?: string, variantName?: string | null) => {
    const name = brandName || newBrandName;
    if (!material || !name.trim()) return;
    try {
      await createBrand.mutateAsync({
        material_id: material.id,
        brand_name: name.trim(),
        variant_name: variantName || null,
        is_preferred: false,
      });
      if (!brandName) setNewBrandName("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add brand");
    }
  };

  const handleDeleteBrand = async (brand: MaterialBrand) => {
    if (!material) return;
    if (!confirm(`Delete brand "${brand.brand_name}"?`)) return;
    try {
      await deleteBrand.mutateAsync({ id: brand.id, materialId: material.id });
    } catch (err) {
      console.error("Failed to delete brand:", err);
    }
  };

  const handleAddVariant = async () => {
    if (!material?.id || !newVariantName.trim()) return;
    try {
      await addVariant.mutateAsync({
        parentId: material.id,
        variant: {
          name: newVariantName.trim(),
          weight_per_unit: newVariantWeight ? parseFloat(newVariantWeight) : undefined,
          length_per_piece: newVariantLength ? parseFloat(newVariantLength) : undefined,
        },
      });
      setAddVariantDialogOpen(false);
      setNewVariantName("");
      setNewVariantWeight("");
      setNewVariantLength("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add variant");
    }
  };

  const isSubmitting =
    createMaterial.isPending ||
    createMaterialWithVariants.isPending ||
    updateMaterial.isPending;
  const activeBrands = materialForBrands?.brands?.filter((b) => b.is_active) || [];

  return (
    <Dialog
      open={open}
      onClose={(_event, reason) => { if (reason !== "backdropClick") onClose(); }}
      maxWidth="md"
      fullWidth
      fullScreen={isMobile}
      PaperProps={{ sx: { borderRadius: isMobile ? 0 : 2 } }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 2.5,
          pt: 2,
          pb: 1.5,
          borderBottom: 1,
          borderColor: "divider",
          flexShrink: 0,
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 1,
            mb: 1.25,
          }}
        >
          <Typography
            sx={{
              fontSize: 9.5,
              fontWeight: 700,
              color: "text.secondary",
              textTransform: "uppercase",
              letterSpacing: 0.6,
            }}
          >
            {isEdit ? "Edit material" : "New material"}
          </Typography>
          <IconButton onClick={onClose} size="small" aria-label="Close">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        <Box sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
          <EntityImageAvatar
            src={formData.image_url || null}
            name={formData.name || "?"}
            size={48}
            fallbackIcon={<InventoryIcon />}
            tint="primary"
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 16, fontWeight: 700, lineHeight: 1.25 }}>
              {formData.name || (isEdit ? material?.name : "Untitled material")}
            </Typography>
            <Typography
              sx={{
                fontSize: 11,
                color: "text.secondary",
                textTransform: "uppercase",
                letterSpacing: 0.4,
                mt: 0.25,
              }}
            >
              {[material?.code, formData.unit, currentCategoryName].filter(Boolean).join(" · ") ||
                "Fill in basics below"}
            </Typography>
          </Box>
        </Box>
      </Box>

      <DialogContent sx={{ p: 0, bgcolor: alpha(theme.palette.background.default, 0.4) }}>
        <Box sx={{ p: 2.5, display: "flex", flexDirection: "column", gap: 2 }}>
          <DraftRestoreBanner
            show={hasRestoredDraft}
            restoredAt={restoredAt}
            onDiscard={discardDraft}
          />
          {error && (
            isTimeoutError ? (
              <InlineErrorBanner
                title="Couldn't save — request timed out"
                description="Your network or our proxy is slow right now. Your form is still here — tap Retry to try again."
                onRetry={() => { void handleSubmit(); }}
                onDismiss={() => { setError(""); setIsTimeoutError(false); }}
              />
            ) : (
              <Alert
                severity="error"
                sx={{ fontSize: 12 }}
                onClose={() => setError("")}
              >
                {error}
              </Alert>
            )
          )}

          {/* Basics */}
          <Section title="Basics">
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", md: customizeCode ? "1.5fr 1fr 1.5fr" : "2fr 1.5fr" },
                gap: 1.5,
              }}
            >
              <TextField
                size="small"
                label="Material name"
                value={formData.name}
                onChange={(e) => handleChange("name", e.target.value)}
                required
                autoFocus
                helperText={
                  !customizeCode ? (
                    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
                      Code auto-generated
                      <Box
                        component="span"
                        role="button"
                        tabIndex={0}
                        onClick={() => setCustomizeCode(true)}
                        sx={{
                          color: "primary.main",
                          cursor: "pointer",
                          fontWeight: 600,
                          ml: 0.5,
                          "&:hover": { textDecoration: "underline" },
                        }}
                      >
                        Customize
                      </Box>
                    </Box>
                  ) : undefined
                }
              />
              {customizeCode && (
                <TextField
                  size="small"
                  label="Code"
                  value={formData.code}
                  onChange={(e) => handleChange("code", e.target.value.toUpperCase())}
                  placeholder="Auto if empty"
                />
              )}
              <Box sx={{ display: "flex", alignItems: "flex-start", gap: 0.5 }}>
                <Box sx={{ flex: 1 }}>
                  <CategoryAutocomplete
                    value={formData.category_id || null}
                    onChange={(value) => handleCategoryChange(value)}
                    parentOnly={false}
                    disabled={isVariant && !!formData.parent_id}
                    label="Category"
                    placeholder="Search categories..."
                  />
                </Box>
                <Tooltip title="Add new category">
                  <span>
                    <IconButton
                      onClick={() => setCategoryDialogOpen(true)}
                      disabled={isVariant && !!formData.parent_id}
                      size="small"
                      color="primary"
                      sx={{ mt: 0.5 }}
                    >
                      <AddIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
            </Box>

            {/* Optional toggle buttons */}
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mt: 1.5 }}>
              {!showLocalName && (
                <ToggleAddButton
                  icon={<TranslateIcon sx={{ fontSize: 14 }} />}
                  label="Add local name"
                  onClick={() => setShowLocalName(true)}
                />
              )}
              {!showDescription && (
                <ToggleAddButton
                  icon={<DescriptionIcon sx={{ fontSize: 14 }} />}
                  label="Add description"
                  onClick={() => setShowDescription(true)}
                />
              )}
              {!showImageUpload && (
                <ToggleAddButton
                  icon={<ImageIcon sx={{ fontSize: 14 }} />}
                  label="Add product image"
                  onClick={() => setShowImageUpload(true)}
                />
              )}
            </Box>

            {(showLocalName || showDescription) && (
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", md: showLocalName && showDescription ? "1fr 1fr" : "1fr" },
                  gap: 1.5,
                  mt: 1.5,
                }}
              >
                {showLocalName && (
                  <TextField
                    size="small"
                    label="Local name (Tamil)"
                    value={formData.local_name}
                    onChange={(e) => handleChange("local_name", e.target.value)}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            size="small"
                            onClick={() => {
                              setShowLocalName(false);
                              handleChange("local_name", "");
                            }}
                          >
                            <CloseIcon fontSize="small" />
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                )}
                {showDescription && (
                  <TextField
                    size="small"
                    label="Description"
                    value={formData.description}
                    onChange={(e) => handleChange("description", e.target.value)}
                    multiline
                    rows={2}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end" sx={{ alignSelf: "flex-start", mt: 1 }}>
                          <IconButton
                            size="small"
                            onClick={() => {
                              setShowDescription(false);
                              handleChange("description", "");
                            }}
                          >
                            <CloseIcon fontSize="small" />
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                )}
              </Box>
            )}

            {showImageUpload && (
              <Box sx={{ mt: 1.5, display: "flex", alignItems: "flex-start", gap: 1 }}>
                <Box sx={{ flex: 1 }}>
                  <FileUploader
                    supabase={supabase}
                    bucketName="work-updates"
                    folderPath="product-photos"
                    fileNamePrefix="material"
                    accept="image"
                    label="Product image"
                    value={formData.image_url ? { url: formData.image_url, name: "Product Image", size: 0 } : null}
                    onUpload={(file) => handleChange("image_url", file.url)}
                    onRemove={() => handleChange("image_url", "")}
                    compact
                    maxSizeMB={2}
                  />
                </Box>
                <IconButton
                  size="small"
                  onClick={() => {
                    setShowImageUpload(false);
                    handleChange("image_url", "");
                  }}
                  sx={{ mt: 0.5 }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
            )}
          </Section>

          {/* Variant of */}
          <Section title="Material variant">
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={isVariant}
                  onChange={(e) => {
                    setIsVariant(e.target.checked);
                    if (!e.target.checked) handleChange("parent_id", "");
                  }}
                  disabled={isEdit && (material?.variant_count || 0) > 0}
                />
              }
              label={
                <Box>
                  <Typography sx={{ fontSize: 13 }}>This is a variant of another material</Typography>
                  {isEdit && (material?.variant_count || 0) > 0 && (
                    <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
                      Cannot convert: this material has {material?.variant_count} variants
                    </Typography>
                  )}
                </Box>
              }
            />
            {isVariant && (
              <Box sx={{ mt: 1.5 }}>
                <Autocomplete
                  size="small"
                  options={availableParentMaterials}
                  getOptionLabel={(option) =>
                    `${option.name}${option.code ? ` (${option.code})` : ""}`
                  }
                  value={
                    availableParentMaterials.find((m) => m.id === formData.parent_id) || null
                  }
                  onChange={(_, newValue) => handleParentChange(newValue?.id || "")}
                  slotProps={{ popper: { disablePortal: false } }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Parent material"
                      placeholder="Search parent material..."
                      helperText="Select the parent material this variant belongs to"
                      required
                      size="small"
                    />
                  )}
                  isOptionEqualToValue={(option, value) => option.id === value.id}
                />
              </Box>
            )}
          </Section>

          {/* Units & specs */}
          <Section title="Units & specifications">
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr 1fr", md: "1fr 1fr 1fr" },
                gap: 1.5,
              }}
            >
              <FormControl size="small" required>
                <InputLabel>Primary unit</InputLabel>
                <Select
                  value={formData.unit}
                  onChange={(e) => handleChange("unit", e.target.value as MaterialUnit)}
                  label="Primary unit"
                  MenuProps={{ disablePortal: false }}
                >
                  {UNITS.map((unit) => (
                    <MenuItem key={unit.value} value={unit.value} sx={{ fontSize: 13 }}>
                      {unit.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                size="small"
                label="GST rate (%)"
                type="number"
                value={formData.gst_rate ?? 0}
                onChange={(e) => handleChange("gst_rate", parseFloat(e.target.value) || 0)}
                InputProps={{
                  inputProps: { min: 0, max: 100, step: 0.5 },
                  endAdornment: <InputAdornment position="end">%</InputAdornment>,
                }}
              />
              <TextField
                size="small"
                label="Min order qty"
                type="number"
                value={formData.min_order_qty ?? ""}
                onChange={(e) =>
                  handleChange(
                    "min_order_qty",
                    e.target.value ? parseFloat(e.target.value) : undefined,
                  )
                }
                helperText="Optional"
                InputProps={{
                  inputProps: { min: 0, step: 1 },
                  endAdornment: <InputAdornment position="end">{formData.unit}</InputAdornment>,
                }}
              />
            </Box>

            {/* Pack-only: products sold only in fixed standard cans/containers
                (e.g. a 5 L can). Add the can sizes from the material's "Packs"
                tab after saving; requests/POs are then constrained to whole cans
                while stock/usage stay free-form in the primary unit. */}
            <Box sx={{ mt: 1 }}>
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={!!formData.sold_in_packs}
                    onChange={(e) => handleChange("sold_in_packs", e.target.checked)}
                  />
                }
                label={
                  <Box component="span">
                    <Typography component="span" sx={{ fontSize: 13 }}>
                      Sold in fixed cans / containers
                    </Typography>
                    <Typography
                      component="span"
                      sx={{ display: "block", fontSize: 11, color: "text.secondary" }}
                    >
                      Bought in whole cans (e.g. 5 L can). Define sizes in the Packs tab.
                    </Typography>
                  </Box>
                }
              />
            </Box>

            {/* What a vendor's price depends on. Seeded from the category on
                category change, because the honest default differs per material:
                plywood is priced by brand AND thickness, sand by neither. When
                both are off, the quote form says "one price for all brands"
                rather than silently accepting an unscoped number. */}
            <Box sx={{ mt: 1 }}>
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={!!formData.price_varies_by_brand}
                    onChange={(e) =>
                      handleChange("price_varies_by_brand", e.target.checked)
                    }
                  />
                }
                label={
                  <Box component="span">
                    <Typography component="span" sx={{ fontSize: 13 }}>
                      Price varies by brand
                    </Typography>
                    <Typography
                      component="span"
                      sx={{ display: "block", fontSize: 11, color: "text.secondary" }}
                    >
                      Vendor quotes must name a brand (e.g. cement, plywood).
                    </Typography>
                  </Box>
                }
              />
            </Box>

            <Box sx={{ mt: 1 }}>
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={!!formData.price_varies_by_variant}
                    onChange={(e) =>
                      handleChange("price_varies_by_variant", e.target.checked)
                    }
                  />
                }
                label={
                  <Box component="span">
                    <Typography component="span" sx={{ fontSize: 13 }}>
                      Price varies by variant / size
                    </Typography>
                    <Typography
                      component="span"
                      sx={{ display: "block", fontSize: 11, color: "text.secondary" }}
                    >
                      Vendor quotes must be tied to a variant (e.g. 18mm vs 19mm ply).
                    </Typography>
                  </Box>
                }
              />
            </Box>

            {/* Advanced — rarely-needed fields tucked away to keep the form clean.
                Reorder level still drives the low-stock alert for restocked
                materials (cement/steel); it's optional and simply off the main view. */}
            <Box sx={{ mt: 1 }}>
              <Button
                size="small"
                onClick={() => setShowAdvanced((v) => !v)}
                endIcon={showAdvanced ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                sx={{ textTransform: "none", color: "text.secondary", px: 0.5 }}
              >
                Advanced
              </Button>
              <Collapse in={showAdvanced} unmountOnExit>
                <Box sx={{ mt: 1, maxWidth: 260 }}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Reorder level"
                    type="number"
                    value={formData.reorder_level ?? ""}
                    onChange={(e) =>
                      handleChange(
                        "reorder_level",
                        e.target.value ? parseFloat(e.target.value) : undefined,
                      )
                    }
                    helperText="Low-stock alert threshold (optional)"
                    InputProps={{
                      inputProps: { min: 0, step: 1 },
                      endAdornment: <InputAdornment position="end">{formData.unit}</InputAdornment>,
                    }}
                  />
                </Box>
              </Collapse>
            </Box>

            {fieldVisibility.showWeightLengthToggle && (
              <Box sx={{ mt: 1.5 }}>
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={showWeightSection}
                      onChange={(e) => setShowWeightSection(e.target.checked)}
                    />
                  }
                  label={
                    <Typography sx={{ fontSize: 13 }}>Enable weight & length tracking</Typography>
                  }
                />
                <Collapse in={showWeightSection} unmountOnExit>
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr 1fr", md: "1fr 1fr 1fr 1fr" },
                      gap: 1.5,
                      mt: 1.5,
                    }}
                  >
                    <TextField
                      size="small"
                      label="Length per piece"
                      type="number"
                      value={formData.length_per_piece ?? ""}
                      onChange={(e) =>
                        handleChange(
                          "length_per_piece",
                          e.target.value ? parseFloat(e.target.value) : null
                        )
                      }
                      InputProps={{ inputProps: { min: 0, step: 0.1 } }}
                    />
                    <FormControl size="small">
                      <InputLabel>Length unit</InputLabel>
                      <Select
                        value={formData.length_unit || "ft"}
                        onChange={(e) => handleChange("length_unit", e.target.value)}
                        label="Length unit"
                        MenuProps={{ disablePortal: false }}
                      >
                        <MenuItem value="ft" sx={{ fontSize: 13 }}>Feet (ft)</MenuItem>
                        <MenuItem value="m" sx={{ fontSize: 13 }}>Meter (m)</MenuItem>
                      </Select>
                    </FormControl>
                    <FormControl size="small">
                      <InputLabel>Weight unit</InputLabel>
                      <Select
                        value={formData.weight_unit || "kg"}
                        onChange={(e) => handleChange("weight_unit", e.target.value)}
                        label="Weight unit"
                        MenuProps={{ disablePortal: false }}
                      >
                        <MenuItem value="kg" sx={{ fontSize: 13 }}>Kilogram (kg)</MenuItem>
                        <MenuItem value="g" sx={{ fontSize: 13 }}>Gram (g)</MenuItem>
                        <MenuItem value="ton" sx={{ fontSize: 13 }}>Ton</MenuItem>
                      </Select>
                    </FormControl>
                    <TextField
                      size="small"
                      label="Weight per unit"
                      type="number"
                      value={formData.weight_per_unit ?? ""}
                      onChange={(e) =>
                        handleChange(
                          "weight_per_unit",
                          e.target.value ? parseFloat(e.target.value) : null
                        )
                      }
                      helperText="±5% may vary"
                      InputProps={{ inputProps: { min: 0, step: 0.001 } }}
                    />
                  </Box>
                </Collapse>
              </Box>
            )}
          </Section>

          {/* Inline variants on creation */}
          {!isEdit && !isVariant && (
            <CollapsibleSection
              title={`Add variants${variants.length > 0 ? ` (${variants.length})` : ""}`}
              icon={<AccountTreeIcon sx={{ fontSize: 16, color: "action.active" }} />}
              expanded={showVariantSection}
              onToggle={() => setShowVariantSection((v) => !v)}
            >
              <VariantInlineTable
                parentName={formData.name}
                parentCode={formData.code}
                parentUnit={formData.unit}
                variants={variants}
                onVariantsChange={setVariants}
                categoryId={formData.category_id}
                categories={categories}
              />
            </CollapsibleSection>
          )}

          {/* Existing variants on edit */}
          {isEdit && material && !material.parent_id && (
            <CollapsibleSection
              title={`Material variants (${materialVariants.length})`}
              icon={<AccountTreeIcon sx={{ fontSize: 16, color: "action.active" }} />}
              expanded={variantsExpanded || materialVariants.length > 0}
              onToggle={() => setVariantsExpanded((v) => !v)}
              defaultOpen={materialVariants.length > 0}
            >
              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
                {materialVariants.length > 0 ? (
                  <>
                    {materialVariants.map((variant) => (
                      <Box
                        key={variant.id}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          px: 1.25,
                          py: 0.75,
                          border: 1,
                          borderColor: "divider",
                          borderRadius: 1,
                          bgcolor: "background.paper",
                        }}
                      >
                        <Typography sx={{ fontSize: 13, fontWeight: 600, flex: 1 }}>
                          {variant.name}
                        </Typography>
                        {variant.code && (
                          <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
                            {variant.code}
                          </Typography>
                        )}
                        {variant.weight_per_unit && variant.length_per_piece && (
                          <Chip
                            label={`~${calculatePieceWeight(variant.weight_per_unit, variant.length_per_piece, variant.length_unit || "ft")?.toFixed(2) || variant.weight_per_unit} kg/pc`}
                            size="small"
                            sx={{ height: 20, fontSize: 10.5 }}
                          />
                        )}
                        {variant.length_per_piece && (
                          <Chip
                            label={`${variant.length_per_piece} ${variant.length_unit || "ft"}`}
                            size="small"
                            sx={{ height: 20, fontSize: 10.5 }}
                          />
                        )}
                        <Tooltip title="Edit variant">
                          <IconButton
                            size="small"
                            onClick={() => {
                              onClose();
                              onEditVariant?.(variant);
                            }}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    ))}
                  </>
                ) : (
                  <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                    No variants yet. Add variants to track different sizes or specs.
                  </Typography>
                )}
                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={() => setAddVariantDialogOpen(true)}
                  sx={{ alignSelf: "flex-start", mt: 0.5, textTransform: "none" }}
                >
                  Add variant
                </Button>
              </Box>
            </CollapsibleSection>
          )}

          {/* Brands */}
          {isEdit && material && (
            <CollapsibleSection
              title={`Brands (${activeBrands.length})`}
              icon={<BrandIcon sx={{ fontSize: 16, color: "action.active" }} />}
              expanded={brandsExpanded}
              onToggle={() => setBrandsExpanded((v) => !v)}
            >
              <BrandVariantEditor
                materialId={material.id}
                brands={activeBrands}
                categoryName={currentCategoryName}
                supabase={supabase}
                onAddBrand={handleAddBrand}
                onUpdateBrand={async (brandId, data) => {
                  await updateBrand.mutateAsync({ id: brandId, data });
                }}
                onDeleteBrand={handleDeleteBrand}
                disabled={createBrand.isPending || updateBrand.isPending || deleteBrand.isPending}
              />
            </CollapsibleSection>
          )}
        </Box>
      </DialogContent>

      <DialogActions
        sx={{
          px: 2.5,
          py: 1.5,
          borderTop: 1,
          borderColor: "divider",
          flexShrink: 0,
        }}
      >
        <Button onClick={onClose} disabled={isSubmitting} sx={{ textTransform: "none" }}>
          Cancel
        </Button>
        <SaveButton
          isSaving={isSubmitting}
          isError={Boolean(error)}
          isSuccess={saveSuccess}
          disabled={!formData.name.trim()}
          idleLabel={isEdit ? "Save changes" : "Create material"}
          errorLabel="Try again"
          onClick={handleSubmit}
        />
      </DialogActions>

      {/* Inline category creation */}
      <CategoryDialog
        open={categoryDialogOpen}
        onClose={() => setCategoryDialogOpen(false)}
        onSubmit={handleCreateCategory}
        category={null}
        isLoading={createCategory.isPending}
      />

      {/* Add variant nested dialog */}
      <Dialog
        open={addVariantDialogOpen}
        onClose={(_event, reason) => { if (reason !== "backdropClick") setAddVariantDialogOpen(false); }}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <Box sx={{ px: 2.5, pt: 2, pb: 1, borderBottom: 1, borderColor: "divider" }}>
          <Typography
            sx={{
              fontSize: 9.5,
              fontWeight: 700,
              color: "text.secondary",
              textTransform: "uppercase",
              letterSpacing: 0.6,
            }}
          >
            New variant
          </Typography>
          <Typography sx={{ fontSize: 16, fontWeight: 700, mt: 0.25 }}>
            Add variant for {material?.name}
          </Typography>
        </Box>
        <DialogContent sx={{ pt: 2 }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            <TextField
              size="small"
              label="Variant name"
              value={newVariantName}
              onChange={(e) => setNewVariantName(e.target.value)}
              fullWidth
              required
              placeholder="e.g., 8mm, Priya Brick, Chamber Brick"
            />
            <TextField
              size="small"
              label="Weight per unit"
              value={newVariantWeight}
              onChange={(e) => setNewVariantWeight(e.target.value)}
              type="number"
              fullWidth
              InputProps={{
                endAdornment: <InputAdornment position="end">kg</InputAdornment>,
                inputProps: { min: 0, step: 0.001 },
              }}
              helperText="Optional"
            />
            <TextField
              size="small"
              label="Length per piece"
              value={newVariantLength}
              onChange={(e) => setNewVariantLength(e.target.value)}
              type="number"
              fullWidth
              InputProps={{
                endAdornment: <InputAdornment position="end">{material?.length_unit || "ft"}</InputAdornment>,
                inputProps: { min: 0, step: 0.1 },
              }}
              helperText="Optional"
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, py: 1.5, borderTop: 1, borderColor: "divider" }}>
          <Button onClick={() => setAddVariantDialogOpen(false)} sx={{ textTransform: "none" }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleAddVariant}
            disabled={!newVariantName.trim() || addVariant.isPending}
            sx={{ textTransform: "none" }}
          >
            {addVariant.isPending ? "Adding…" : "Add variant"}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}

// ============================================================
// Section components — match the InspectPane visual vocabulary
// ============================================================

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        bgcolor: "background.paper",
        border: 1,
        borderColor: "divider",
        borderRadius: 1.5,
        p: 1.75,
      }}
    >
      <Typography
        sx={{
          fontSize: 9.5,
          fontWeight: 700,
          color: "text.secondary",
          textTransform: "uppercase",
          letterSpacing: 0.6,
          mb: 1.25,
        }}
      >
        {title}
      </Typography>
      {children}
    </Box>
  );
}

function CollapsibleSection({
  title,
  icon,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        bgcolor: "background.paper",
        border: 1,
        borderColor: "divider",
        borderRadius: 1.5,
        overflow: "hidden",
      }}
    >
      <Box
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 1.75,
          py: 1.25,
          cursor: "pointer",
          transition: "background-color 120ms",
          "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.04) },
          ...(expanded && { borderBottom: 1, borderColor: "divider" }),
        }}
      >
        {icon}
        <Typography
          sx={{
            fontSize: 13,
            fontWeight: 700,
            flex: 1,
            color: "text.primary",
          }}
        >
          {title}
        </Typography>
        {expanded ? (
          <ExpandLessIcon sx={{ fontSize: 18, color: "text.secondary" }} />
        ) : (
          <ExpandMoreIcon sx={{ fontSize: 18, color: "text.secondary" }} />
        )}
      </Box>
      <Collapse in={expanded} unmountOnExit>
        <Box sx={{ p: 1.75 }}>{children}</Box>
      </Collapse>
    </Box>
  );
}

function ToggleAddButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  const theme = useTheme();
  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        px: 1,
        py: 0.5,
        border: 1,
        borderColor: alpha(theme.palette.primary.main, 0.4),
        borderStyle: "dashed",
        borderRadius: 1,
        cursor: "pointer",
        color: theme.palette.primary.dark,
        fontSize: 12,
        fontWeight: 600,
        transition: "background-color 120ms",
        "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.06) },
      }}
    >
      {icon}
      {label}
    </Box>
  );
}
