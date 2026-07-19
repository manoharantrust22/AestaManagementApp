"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  IconButton,
  Stack,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Divider,
} from "@mui/material";
import {
  Close as CloseIcon,
  Inventory2 as ProductIcon,
  Add as AddIcon,
  DeleteOutline as DeleteIcon,
} from "@mui/icons-material";
import CategoryAutocomplete from "@/components/common/CategoryAutocomplete";
import VendorAutocomplete from "@/components/common/VendorAutocomplete";
import FileUploader from "@/components/common/FileUploader";
import ContainerSizesEditor, {
  type ContainerSizeRow,
  suggestContainerLabel,
} from "@/components/materials/ContainerSizesEditor";
import { SaveButton } from "@/components/common/SaveButton";
import { InlineErrorBanner } from "@/components/common/InlineErrorBanner";
import { useToast } from "@/contexts/ToastContext";
import { useIsMobile } from "@/hooks/useIsMobile";
import { isAbortOrTimeoutError } from "@/lib/utils/timeout";
import { createClient } from "@/lib/supabase/client";
import {
  useCreateMaterialWithVariants,
  useConvertMaterialToBranded,
} from "@/hooks/queries/useMaterials";
import { getOrCreateUnspecifiedVendor } from "@/lib/materials/unspecifiedVendor";
import type {
  MaterialCategory,
  MaterialUnit,
  VariantFormData,
  ParentPackInput,
} from "@/types/material.types";

/** A flat material being converted into a branded parent-with-variants. */
export interface BrandedSourceMaterial {
  id: string;
  name: string;
  code: string | null;
  category_id: string | null;
  unit: MaterialUnit;
}

interface BrandedProductDialogProps {
  open: boolean;
  onClose: () => void;
  categories: MaterialCategory[];
  /** When set, the dialog converts this existing flat material instead of creating a new one. */
  sourceMaterial?: BrandedSourceMaterial | null;
}

// Common units for branded consumables (paints, putty, adhesives, etc.).
const UNIT_OPTIONS: { value: MaterialUnit; label: string }[] = [
  { value: "liter" as MaterialUnit, label: "Litre" },
  { value: "kg" as MaterialUnit, label: "Kg" },
  { value: "piece" as MaterialUnit, label: "Piece" },
  { value: "bag" as MaterialUnit, label: "Bag" },
  { value: "box" as MaterialUnit, label: "Box" },
];

interface VariantRow {
  name: string;
  /** Price the office enters — per-can when "sold in cans", else per unit. */
  price: string;
  imageUrl: string;
}

const blankRow = (): VariantRow => ({ name: "", price: "", imageUrl: "" });

// Local section wrapper — matches TileMaterialDialog's visual vocabulary.
function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Box sx={{ bgcolor: "background.paper", border: 1, borderColor: "divider", borderRadius: 1.5, p: 1.75 }}>
      <Typography
        sx={{ fontSize: 9.5, fontWeight: 700, color: "text.secondary", textTransform: "uppercase", letterSpacing: 0.6 }}
      >
        {title}
      </Typography>
      {subtitle && (
        <Typography sx={{ fontSize: 11, color: "text.secondary", mb: 1.25, mt: 0.25 }}>{subtitle}</Typography>
      )}
      <Box sx={{ mt: subtitle ? 0 : 1.25 }}>{children}</Box>
    </Box>
  );
}

function todayStr(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function BrandedProductDialog({
  open,
  onClose,
  categories,
  sourceMaterial = null,
}: BrandedProductDialogProps) {
  const isMobile = useIsMobile();
  const { showProgress } = useToast();
  const supabase = createClient();
  const createMaterialWithVariants = useCreateMaterialWithVariants();
  const convertMaterialToBranded = useConvertMaterialToBranded();
  const isConvert = !!sourceMaterial;

  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [unit, setUnit] = useState<MaterialUnit>("liter" as MaterialUnit);
  const [brandName, setBrandName] = useState("");

  const [vendorId, setVendorId] = useState<string | null>(null);
  const [quoteDate, setQuoteDate] = useState<string>(todayStr());
  const [priceIncludesGst, setPriceIncludesGst] = useState(false);
  const [gstRate, setGstRate] = useState<string>("0");

  const [soldInCans, setSoldInCans] = useState(true);
  // Standard container sizes the generic parent is sold in. The FIRST size is
  // the one the per-variant price below is quoted for; extra sizes are recorded
  // on the parent as size-only (price filled per vendor at grading).
  const [containerSizes, setContainerSizes] = useState<ContainerSizeRow[]>([
    { label: "", contents_qty: "20", price: "" },
  ]);

  const [rows, setRows] = useState<VariantRow[]>([blankRow(), blankRow()]);

  const [error, setError] = useState("");
  const [isTimeoutError, setIsTimeoutError] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Reset / prefill on (re)open.
  useEffect(() => {
    if (!open) return;
    setName(sourceMaterial?.name?.trim() ?? "");
    setCategoryId(sourceMaterial?.category_id ?? "");
    setUnit((sourceMaterial?.unit as MaterialUnit) ?? ("liter" as MaterialUnit));
    setBrandName("");
    setVendorId(null);
    setQuoteDate(todayStr());
    setPriceIncludesGst(false);
    setGstRate("0");
    setSoldInCans(true);
    setContainerSizes([{ label: "", contents_qty: "20", price: "" }]);
    setRows([blankRow(), blankRow()]);
    setError("");
    setIsTimeoutError(false);
    setSaveSuccess(false);
  }, [open, sourceMaterial]);

  const unitLabel = useMemo(
    () => UNIT_OPTIONS.find((u) => u.value === unit)?.label ?? unit,
    [unit]
  );
  // Include the source material's unit if it falls outside the common list
  // (convert flow can inherit any unit, e.g. "nos").
  const unitOptions = useMemo(
    () =>
      UNIT_OPTIONS.some((u) => u.value === unit)
        ? UNIT_OPTIONS
        : [{ value: unit, label: String(unit) }, ...UNIT_OPTIONS],
    [unit]
  );
  // Valid, parsed container sizes for the parent (size-only; prices come from
  // the vendor at grading, so they're stored null on the parent packs).
  const parentPacks = useMemo<ParentPackInput[]>(
    () =>
      containerSizes
        .map((s) => ({
          contents: parseFloat(s.contents_qty),
          label: s.label.trim() || suggestContainerLabel(s.contents_qty, unitLabel),
        }))
        .filter((s) => Number.isFinite(s.contents) && s.contents > 0)
        .map((s) => ({ label: s.label, contents_qty: s.contents, price: null })),
    [containerSizes, unitLabel]
  );

  // The primary container the per-variant price is quoted for (first valid size).
  const primaryPack = parentPacks[0] ?? null;
  const canLabel = primaryPack?.label ?? "can";
  const priceSuffix = soldInCans ? `/ ${canLabel}` : `/ ${unitLabel}`;

  const updateRow = (i: number, patch: Partial<VariantRow>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((prev) => [...prev, blankRow()]);
  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  const isPending = createMaterialWithVariants.isPending || convertMaterialToBranded.isPending;

  const handleSubmit = async () => {
    const label = name.trim();
    if (!label) {
      setError("Product name is required");
      setIsTimeoutError(false);
      return;
    }
    if (!brandName.trim()) {
      setError("Brand name is required");
      setIsTimeoutError(false);
      return;
    }
    const namedRows = rows.filter((r) => r.name.trim());
    if (namedRows.length === 0) {
      setError("Add at least one variant");
      setIsTimeoutError(false);
      return;
    }
    if (soldInCans && parentPacks.length === 0) {
      setError("Add at least one container size (e.g. 20 Litre can)");
      setIsTimeoutError(false);
      return;
    }
    setError("");
    setIsTimeoutError(false);

    const toast = showProgress(`${isConvert ? "Converting" : "Creating"} ${label}…`);
    try {
      const anyPriced = namedRows.some((r) => parseFloat(r.price) > 0);
      const resolvedVendorId =
        vendorId || (anyPriced ? await getOrCreateUnspecifiedVendor(supabase) : null);

      const variants: VariantFormData[] = namedRows.map((r) => {
        const price = parseFloat(r.price);
        const hasPrice = Number.isFinite(price) && price > 0;
        const base: VariantFormData = {
          name: r.name.trim(),
          image_url: r.imageUrl || null,
        };
        if (hasPrice) base.initial_vendor_id = resolvedVendorId;
        if (soldInCans && primaryPack) {
          // The entered price is per the primary container.
          base.pack_label = primaryPack.label;
          base.pack_contents_qty = primaryPack.contents_qty;
          if (hasPrice) base.pack_price = price;
        } else if (hasPrice) {
          base.initial_vendor_price = price;
        }
        return base;
      });

      const parent_packs = soldInCans ? parentPacks : undefined;

      const gst = parseFloat(gstRate) || 0;
      const firstImage = namedRows.find((r) => r.imageUrl)?.imageUrl || undefined;

      if (isConvert && sourceMaterial) {
        await convertMaterialToBranded.mutateAsync({
          material_id: sourceMaterial.id,
          name: label,
          brand_name: brandName.trim(),
          gst_rate: gst,
          price_includes_gst: priceIncludesGst,
          quote_recorded_date: quoteDate,
          variants,
          parent_packs,
        });
      } else {
        await createMaterialWithVariants.mutateAsync({
          name: label,
          category_id: categoryId || undefined,
          unit,
          gst_rate: gst,
          min_order_qty: 1,
          // Container sizes on the parent make it request-in-cans; the hook sets
          // sold_in_packs when parent_packs are present.
          sold_in_packs: soldInCans,
          image_url: firstImage,
          brand_name: brandName.trim(),
          price_includes_gst: priceIncludesGst,
          quote_recorded_date: quoteDate,
          variants,
          parent_packs,
        });
      }

      toast.update({
        severity: "success",
        message: `${isConvert ? "Converted" : "Created"} ${label}`,
        duration: 3000,
      });
      setSaveSuccess(true);
      window.setTimeout(() => {
        setSaveSuccess(false);
        onClose();
      }, 700);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save product";
      const timedOut = isAbortOrTimeoutError(err);
      setError(message);
      setIsTimeoutError(timedOut);
      toast.update({
        severity: "error",
        message: timedOut ? `Couldn't save ${label} — request timed out` : `Couldn't save ${label}`,
        action: { label: "Retry", onClick: () => void handleSubmit() },
      });
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={isMobile}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: isMobile ? 0 : 2 } }}
    >
      {/* Header */}
      <Box
        sx={{ display: "flex", alignItems: "center", gap: 1.25, px: 2.5, py: 1.75, borderBottom: 1, borderColor: "divider" }}
      >
        <ProductIcon sx={{ color: "primary.main" }} />
        <Box sx={{ flex: 1 }}>
          <Typography
            sx={{ fontSize: 9.5, fontWeight: 700, color: "text.secondary", textTransform: "uppercase", letterSpacing: 0.6 }}
          >
            {isConvert ? "Convert to branded product" : "New branded product"}
          </Typography>
          <Typography sx={{ fontSize: 16, fontWeight: 700 }}>
            {name.trim() || "Untitled product"}
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </Box>

      <DialogContent sx={{ px: 2.5, py: 2 }}>
        {error && (
          <Box sx={{ mb: 1.5 }}>
            <InlineErrorBanner
              title={isTimeoutError ? "Request timed out" : "Couldn't save product"}
              description={error}
              onRetry={() => void handleSubmit()}
            />
          </Box>
        )}

        <Stack gap={1.75}>
          {/* 1 · Basics */}
          <Section title="Product basics" subtitle="The generic product engineers request (e.g. Wall Primer) and its brand.">
            <Stack gap={1.5}>
              <TextField
                label="Product name"
                placeholder="e.g. Wall Primer"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError("");
                }}
                size="small"
                fullWidth
                required
                autoFocus
              />
              <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
                <TextField
                  label="Brand"
                  placeholder="e.g. Berger"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  size="small"
                  required
                  sx={{ flex: 1, minWidth: 140 }}
                />
                <Select
                  size="small"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as MaterialUnit)}
                  disabled={isConvert}
                  sx={{ minWidth: 110 }}
                >
                  {unitOptions.map((u) => (
                    <MenuItem key={u.value} value={u.value}>
                      {u.label}
                    </MenuItem>
                  ))}
                </Select>
              </Box>
              {!isConvert && (
                <CategoryAutocomplete
                  value={categoryId || null}
                  onChange={(v) => setCategoryId((v as string) || "")}
                  parentOnly
                  label="Category"
                />
              )}
            </Stack>
          </Section>

          {/* 2 · Quote (vendor + how prices are entered) */}
          <Section title="Pricing" subtitle="Prices are one vendor's quote on a date — other vendors can be added later.">
            <Stack gap={1.5}>
              <VendorAutocomplete
                value={vendorId}
                onChange={(v) => setVendorId((v as string) || null)}
                label="Quoting vendor (optional)"
                placeholder="Who quoted these prices?"
              />
              <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
                <TextField
                  label="Quote date"
                  type="date"
                  value={quoteDate}
                  onChange={(e) => setQuoteDate(e.target.value)}
                  size="small"
                  InputLabelProps={{ shrink: true }}
                  sx={{ minWidth: 160 }}
                />
                <TextField
                  label="GST %"
                  type="number"
                  value={gstRate}
                  onChange={(e) => setGstRate(e.target.value)}
                  size="small"
                  inputProps={{ min: 0, max: 100, step: 1 }}
                  sx={{ width: 90 }}
                />
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={priceIncludesGst}
                      onChange={(e) => setPriceIncludesGst(e.target.checked)}
                    />
                  }
                  label={<Typography sx={{ fontSize: 12 }}>Prices include GST</Typography>}
                />
              </Box>
              <Divider />
              <Box>
                <FormControlLabel
                  control={
                    <Switch size="small" checked={soldInCans} onChange={(e) => setSoldInCans(e.target.checked)} />
                  }
                  label={<Typography sx={{ fontSize: 12 }}>Sold only in fixed cans / containers</Typography>}
                />
                {soldInCans && (
                  <Box sx={{ mt: 1 }}>
                    <Typography sx={{ fontSize: 11, color: "text.secondary", mb: 1 }}>
                      Standard sizes engineers request in. The first size is what the price below is
                      quoted for; other vendors&apos; per-can prices are filled at PO grading.
                    </Typography>
                    <ContainerSizesEditor
                      sizes={containerSizes}
                      onChange={setContainerSizes}
                      unitLabel={unitLabel}
                    />
                  </Box>
                )}
              </Box>
            </Stack>
          </Section>

          {/* 3 · Variants */}
          <Section
            title="Variants"
            subtitle={`Each brand product under this name. Price is ${soldInCans ? "per can" : `per ${unitLabel.toLowerCase()}`}.`}
          >
            <Stack gap={1.25}>
              {rows.map((row, i) => (
                <Box
                  key={i}
                  sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.25, display: "flex", flexDirection: "column", gap: 1 }}
                >
                  <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
                    <TextField
                      label={`Variant ${i + 1}`}
                      placeholder="e.g. Walmasta Primer"
                      value={row.name}
                      onChange={(e) => updateRow(i, { name: e.target.value })}
                      size="small"
                      sx={{ flex: 1, minWidth: 120 }}
                    />
                    <TextField
                      label="Price"
                      type="number"
                      value={row.price}
                      onChange={(e) => updateRow(i, { price: e.target.value })}
                      size="small"
                      inputProps={{ min: 0, step: "any", style: { textAlign: "right" } }}
                      InputProps={{ startAdornment: <Typography sx={{ mr: 0.5 }}>₹</Typography> }}
                      helperText={priceSuffix}
                      sx={{ width: 130 }}
                    />
                    <IconButton
                      size="small"
                      onClick={() => removeRow(i)}
                      disabled={rows.length <= 1}
                      sx={{ mt: 0.5 }}
                      aria-label="Remove variant"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    {row.imageUrl ? (
                      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Box
                          component="img"
                          src={row.imageUrl}
                          sx={{ width: 40, height: 40, objectFit: "cover", borderRadius: 0.5, border: 1, borderColor: "divider" }}
                        />
                        <Button size="small" onClick={() => updateRow(i, { imageUrl: "" })} sx={{ textTransform: "none" }}>
                          Remove photo
                        </Button>
                      </Box>
                    ) : (
                      <FileUploader
                        supabase={supabase}
                        bucketName="work-updates"
                        folderPath="product-photos"
                        fileNamePrefix={`variant-${i + 1}`}
                        maxSizeMB={2}
                        accept="image"
                        compact
                        onUpload={(file) => updateRow(i, { imageUrl: file.url })}
                      />
                    )}
                  </Box>
                </Box>
              ))}
              <Button startIcon={<AddIcon />} onClick={addRow} size="small" sx={{ textTransform: "none", alignSelf: "flex-start" }}>
                Add variant
              </Button>
            </Stack>
          </Section>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 2.5, py: 1.5, borderTop: 1, borderColor: "divider" }}>
        <Button onClick={onClose} sx={{ textTransform: "none" }}>
          Cancel
        </Button>
        <SaveButton
          idleLabel={isConvert ? "Convert product" : "Create product"}
          savingLabel="Saving…"
          onClick={() => void handleSubmit()}
          isSaving={isPending}
          isError={!!error && !isPending && !saveSuccess}
          isSuccess={saveSuccess}
        />
      </DialogActions>
    </Dialog>
  );
}
