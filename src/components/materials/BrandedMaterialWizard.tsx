"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  IconButton,
  Step,
  StepLabel,
  Stepper,
  Typography,
} from "@mui/material";
import {
  Close as CloseIcon,
  ArrowBack as BackIcon,
  ArrowForward as NextIcon,
  Inventory2 as ProductIcon,
} from "@mui/icons-material";
import { useFormDraft } from "@/hooks/useFormDraft";
import DraftRestoreBanner from "@/components/common/DraftRestoreBanner";
import { InlineErrorBanner } from "@/components/common/InlineErrorBanner";
import { SaveButton } from "@/components/common/SaveButton";
import { useToast } from "@/contexts/ToastContext";
import { useIsMobile } from "@/hooks/useIsMobile";
import { isAbortOrTimeoutError } from "@/lib/utils/timeout";
import { createClient } from "@/lib/supabase/client";
import { getOrCreateUnspecifiedVendor } from "@/lib/materials/unspecifiedVendor";
import { unitLabelFor } from "@/lib/materials/unitOptions";
import {
  useCreateMaterialWithVariants,
  useConvertMaterialToBranded,
} from "@/hooks/queries/useMaterials";
import {
  blankContainerSize,
  parentPacksFromRows,
  type ContainerSizeRow,
} from "@/components/materials/ContainerSizesEditor";
import CategoryBrandStep from "@/components/materials/wizard-steps/CategoryBrandStep";
import ProductIdentityStep from "@/components/materials/wizard-steps/ProductIdentityStep";
import VariantsStep from "@/components/materials/wizard-steps/VariantsStep";
import PacksPricingStep from "@/components/materials/wizard-steps/PacksPricingStep";
import ReviewStep from "@/components/materials/wizard-steps/ReviewStep";
import type { MaterialCategory, MaterialUnit, VariantFormData } from "@/types/material.types";

/** A flat material being converted into a branded parent-with-variants. */
export interface BrandedSourceMaterial {
  id: string;
  name: string;
  code: string | null;
  category_id: string | null;
  unit: MaterialUnit;
}

interface BrandedMaterialWizardProps {
  open: boolean;
  onClose: () => void;
  categories: MaterialCategory[];
  /** When set, the wizard converts this existing flat material instead of creating a new one. */
  sourceMaterial?: BrandedSourceMaterial | null;
  /** Shown as "Back" from step 1 when this wizard was opened from AddMaterialWizard's fork. */
  onBackToFork?: () => void;
}

interface WizardDraft {
  activeStep: number;
  categoryId: string;
  brandName: string;
  name: string;
  unit: MaterialUnit;
  gstRate: string;
  variants: VariantFormData[];
  packsByVariant: ContainerSizeRow[][];
  vendorId: string | null;
  quoteDate: string;
  priceIncludesGst: boolean;
}

function todayStr(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function emptyDraft(sourceMaterial?: BrandedSourceMaterial | null): WizardDraft {
  return {
    activeStep: 0,
    categoryId: sourceMaterial?.category_id ?? "",
    brandName: "",
    name: sourceMaterial?.name ?? "",
    unit: sourceMaterial?.unit ?? ("kg" as MaterialUnit),
    gstRate: "0",
    variants: [],
    packsByVariant: [],
    vendorId: null,
    quoteDate: todayStr(),
    priceIncludesGst: true,
  };
}

const STEPS = [
  { key: "category-brand", label: "Category & Brand" },
  { key: "identity", label: "Product" },
  { key: "variants", label: "Variants" },
  { key: "packs", label: "Pack Sizes & Pricing" },
  { key: "review", label: "Review" },
] as const;

export default function BrandedMaterialWizard({
  open,
  onClose,
  categories,
  sourceMaterial = null,
  onBackToFork,
}: BrandedMaterialWizardProps) {
  const isMobile = useIsMobile();
  const { showProgress } = useToast();
  const supabase = createClient();
  const createMaterialWithVariants = useCreateMaterialWithVariants();
  const convertMaterialToBranded = useConvertMaterialToBranded();
  const isConvert = !!sourceMaterial;
  const isPending = createMaterialWithVariants.isPending || convertMaterialToBranded.isPending;

  const [error, setError] = useState("");
  const [isTimeoutError, setIsTimeoutError] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [stepError, setStepError] = useState("");

  const { formData, updateField, isDirty, hasRestoredDraft, restoredAt, clearDraft, discardDraft } =
    useFormDraft<WizardDraft>({
      key: "material_wizard_branded",
      initialData: useMemo(() => emptyDraft(sourceMaterial), [sourceMaterial]),
      isOpen: open,
      entityId: sourceMaterial?.id ?? null,
    });

  useEffect(() => {
    if (!open) {
      setError("");
      setIsTimeoutError(false);
      setSaveSuccess(false);
      setStepError("");
    }
  }, [open]);

  const {
    activeStep,
    categoryId,
    brandName,
    name,
    unit,
    gstRate,
    variants,
    packsByVariant,
    vendorId,
    quoteDate,
    priceIncludesGst,
  } = formData;

  const unitLabel = unitLabelFor(unit);

  const category = useMemo(
    () => categories.find((c) => c.id === categoryId) ?? null,
    [categories, categoryId]
  );

  const canProceed = (): boolean => {
    switch (STEPS[activeStep].key) {
      case "category-brand":
        return (isConvert || !!categoryId) && !!brandName.trim();
      case "identity":
        return !!name.trim();
      case "variants":
        return variants.length > 0;
      case "packs":
        return packsByVariant.some((rows) =>
          rows.some((r) => parseFloat(r.contents_qty) > 0)
        );
      default:
        return true;
    }
  };

  const handleNext = () => {
    if (!canProceed()) {
      setStepError(
        STEPS[activeStep].key === "packs"
          ? "Add at least one pack size (e.g. 40kg bag) for at least one variant"
          : "Fill in the required fields before continuing"
      );
      return;
    }
    setStepError("");
    updateField("activeStep", activeStep + 1);
  };

  const handleClose = () => {
    if (!isDirty) discardDraft();
    onClose();
  };

  const handleBack = () => {
    setStepError("");
    if (activeStep === 0) {
      if (onBackToFork) onBackToFork();
      else handleClose();
      return;
    }
    updateField("activeStep", activeStep - 1);
  };

  const handleSubmit = async () => {
    const label = name.trim();
    setError("");
    setIsTimeoutError(false);

    const toast = showProgress(`${isConvert ? "Converting" : "Creating"} ${label}…`);
    try {
      const anyPriced = packsByVariant.some((rows) =>
        rows.some((r) => parseFloat(r.price) > 0)
      );
      const resolvedVendorId =
        vendorId || (anyPriced ? await getOrCreateUnspecifiedVendor(supabase) : null);

      const gst = parseFloat(gstRate) || 0;

      const variantsWithPacks: VariantFormData[] = variants.map((v, i) => {
        const rows = packsByVariant[i] ?? [];
        const packs = parentPacksFromRows(rows, unitLabel, { includePrice: true });
        const hasPrice = packs.some((p) => p.price != null && p.price > 0);
        return {
          ...v,
          packs,
          initial_vendor_id: hasPrice ? resolvedVendorId : undefined,
        };
      });

      if (isConvert && sourceMaterial) {
        await convertMaterialToBranded.mutateAsync({
          material_id: sourceMaterial.id,
          name: label,
          brand_name: brandName.trim(),
          gst_rate: gst,
          price_includes_gst: priceIncludesGst,
          quote_recorded_date: quoteDate,
          variants: variantsWithPacks,
        });
      } else {
        await createMaterialWithVariants.mutateAsync({
          name: label,
          category_id: categoryId || undefined,
          unit,
          gst_rate: gst,
          min_order_qty: 1,
          brand_name: brandName.trim(),
          price_includes_gst: priceIncludesGst,
          quote_recorded_date: quoteDate,
          variants: variantsWithPacks,
        });
      }

      toast.update({
        severity: "success",
        message: `${isConvert ? "Converted" : "Created"} ${label}`,
        duration: 3000,
      });
      setSaveSuccess(true);
      clearDraft();
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

  const stepKey = STEPS[activeStep].key;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullScreen={isMobile}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { borderRadius: isMobile ? 0 : 2, minHeight: isMobile ? undefined : 560 } }}
    >
      <Box
        sx={{ display: "flex", alignItems: "center", gap: 1.25, px: 2.5, py: 1.75, borderBottom: 1, borderColor: "divider" }}
      >
        <ProductIcon sx={{ color: "primary.main" }} />
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontSize: 9.5, fontWeight: 700, color: "text.secondary", textTransform: "uppercase", letterSpacing: 0.6 }}>
            {isConvert ? "Convert to branded product" : "New branded product"}
          </Typography>
          <Typography sx={{ fontSize: 16, fontWeight: 700 }}>
            {name.trim() || "Untitled product"}
          </Typography>
        </Box>
        <IconButton onClick={handleClose} size="small" sx={{ minWidth: 44, minHeight: 44 }}>
          <CloseIcon />
        </IconButton>
      </Box>

      <DialogContent sx={{ px: { xs: 2, sm: 3 }, py: 2.5 }}>
        {hasRestoredDraft && (
          <DraftRestoreBanner show={hasRestoredDraft} restoredAt={restoredAt} onDiscard={discardDraft} />
        )}
        {error && (
          <Box sx={{ mb: 2 }}>
            <InlineErrorBanner
              title={isTimeoutError ? "Request timed out" : "Couldn't save product"}
              description={error}
              onRetry={() => void handleSubmit()}
            />
          </Box>
        )}

        <Stepper activeStep={activeStep} sx={{ mb: 4 }} alternativeLabel={isMobile}>
          {STEPS.map((step, index) => (
            <Step key={step.key} completed={index < activeStep}>
              <StepLabel>{isMobile ? undefined : step.label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {stepError && (
          <Typography sx={{ fontSize: 12, color: "error.main", textAlign: "center", mb: 2 }}>
            {stepError}
          </Typography>
        )}

        {stepKey === "category-brand" && (
          <CategoryBrandStep
            categoryId={categoryId}
            onCategoryChange={(v) => updateField("categoryId", v)}
            brandName={brandName}
            onBrandNameChange={(v) => updateField("brandName", v)}
            hideCategory={isConvert}
          />
        )}
        {stepKey === "identity" && (
          <ProductIdentityStep
            name={name}
            onNameChange={(v) => updateField("name", v)}
            unit={unit}
            onUnitChange={(v) => updateField("unit", v)}
            gstRate={gstRate}
            onGstRateChange={(v) => updateField("gstRate", v)}
            unitDisabled={isConvert}
          />
        )}
        {stepKey === "variants" && (
          <VariantsStep
            parentName={name}
            parentUnit={unit}
            categoryId={categoryId || null}
            categories={categories}
            variants={variants}
            onVariantsChange={(v) => updateField("variants", v)}
          />
        )}
        {stepKey === "packs" && (
          <PacksPricingStep
            variants={variants}
            packsByVariant={
              packsByVariant.length === variants.length
                ? packsByVariant
                : variants.map((_, i) => packsByVariant[i] ?? [blankContainerSize()])
            }
            onPacksByVariantChange={(v) => updateField("packsByVariant", v)}
            unitLabel={unitLabel}
            vendorId={vendorId}
            onVendorChange={(v) => updateField("vendorId", v)}
            quoteDate={quoteDate}
            onQuoteDateChange={(v) => updateField("quoteDate", v)}
            priceIncludesGst={priceIncludesGst}
            onPriceIncludesGstChange={(v) => updateField("priceIncludesGst", v)}
          />
        )}
        {stepKey === "review" && (
          <ReviewStep
            categoryName={category?.name ?? null}
            brandName={brandName}
            name={name}
            unitLabel={unitLabel}
            variants={variants}
            packsByVariant={packsByVariant}
          />
        )}
      </DialogContent>

      <Box
        sx={{ display: "flex", justifyContent: "space-between", px: 2.5, py: 1.75, borderTop: 1, borderColor: "divider" }}
      >
        <Button
          startIcon={activeStep === 0 && !onBackToFork ? undefined : <BackIcon />}
          onClick={handleBack}
          disabled={isPending}
          sx={{ textTransform: "none", minHeight: 44 }}
        >
          {activeStep === 0 && !onBackToFork ? "Cancel" : "Back"}
        </Button>

        {stepKey === "review" ? (
          <SaveButton
            idleLabel={isConvert ? "Convert product" : "Create material"}
            savingLabel="Saving…"
            onClick={() => void handleSubmit()}
            isSaving={isPending}
            isError={!!error && !isPending && !saveSuccess}
            isSuccess={saveSuccess}
          />
        ) : (
          <Button
            variant="contained"
            endIcon={<NextIcon />}
            onClick={handleNext}
            sx={{ textTransform: "none", minHeight: 44 }}
          >
            Next
          </Button>
        )}
      </Box>
    </Dialog>
  );
}
