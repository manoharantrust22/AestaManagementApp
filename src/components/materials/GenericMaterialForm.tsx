"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  FormControlLabel,
  IconButton,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { Close as CloseIcon, Inventory2 as MaterialIcon } from "@mui/icons-material";
import CategoryAutocomplete from "@/components/common/CategoryAutocomplete";
import ContainerSizesEditor, {
  blankContainerSize,
  parentPacksFromRows,
  type ContainerSizeRow,
} from "@/components/materials/ContainerSizesEditor";
import DraftRestoreBanner from "@/components/common/DraftRestoreBanner";
import { InlineErrorBanner } from "@/components/common/InlineErrorBanner";
import { SaveButton } from "@/components/common/SaveButton";
import { useToast } from "@/contexts/ToastContext";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useFormDraft } from "@/hooks/useFormDraft";
import { isAbortOrTimeoutError } from "@/lib/utils/timeout";
import { unitLabelFor, UNIT_OPTIONS } from "@/lib/materials/unitOptions";
import { defaultsForCategoryCode } from "@/lib/material-price-scoping-defaults";
import { useCreateMaterial } from "@/hooks/queries/useMaterials";
import { useCreateMaterialPack } from "@/hooks/queries/useMaterialPacks";
import type { MaterialCategory, MaterialUnit } from "@/types/material.types";

interface GenericMaterialFormProps {
  open: boolean;
  onClose: () => void;
  categories: MaterialCategory[];
  /** Shown as "Back" when this form was opened from AddMaterialWizard's fork. */
  onBackToFork?: () => void;
}

interface GenericDraft {
  name: string;
  categoryId: string;
  unit: MaterialUnit;
  gstRate: string;
  minOrderQty: string;
  soldInPacks: boolean;
  containerSizes: ContainerSizeRow[];
}

const EMPTY_DRAFT: GenericDraft = {
  name: "",
  categoryId: "",
  unit: "kg" as MaterialUnit,
  gstRate: "0",
  minOrderQty: "",
  soldInPacks: false,
  containerSizes: [blankContainerSize()],
};

/**
 * The "No, it's a bulk/commodity material" path from AddMaterialWizard's fork
 * — sand, aggregate, generic bricks. None of the brand/variant/pack-pricing
 * machinery the branded wizard needs applies here, so this stays a single
 * short screen instead of a stepper.
 */
export default function GenericMaterialForm({
  open,
  onClose,
  categories,
  onBackToFork,
}: GenericMaterialFormProps) {
  const isMobile = useIsMobile();
  const { showProgress } = useToast();
  const createMaterial = useCreateMaterial();
  const createMaterialPack = useCreateMaterialPack();

  const [error, setError] = useState("");
  const [isTimeoutError, setIsTimeoutError] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const { formData, updateField, isDirty, hasRestoredDraft, restoredAt, clearDraft, discardDraft } =
    useFormDraft<GenericDraft>({
      key: "material_wizard_generic",
      initialData: useMemo(() => EMPTY_DRAFT, []),
      isOpen: open,
    });

  useEffect(() => {
    if (!open) {
      setError("");
      setIsTimeoutError(false);
      setSaveSuccess(false);
    }
  }, [open]);

  const { name, categoryId, unit, gstRate, minOrderQty, soldInPacks, containerSizes } = formData;
  const unitLabel = unitLabelFor(unit);

  const parentPacks = useMemo(
    () => parentPacksFromRows(containerSizes, unitLabel),
    [containerSizes, unitLabel]
  );

  const isPending = createMaterial.isPending || createMaterialPack.isPending;

  const handleCategoryChange = (value: string) => {
    updateField("categoryId", value);
  };

  const handleClose = () => {
    if (!isDirty) discardDraft();
    onClose();
  };

  const handleSubmit = async () => {
    const label = name.trim();
    if (!label) {
      setError("Material name is required");
      setIsTimeoutError(false);
      return;
    }
    if (soldInPacks && parentPacks.length === 0) {
      setError("Add at least one container size (e.g. 50kg bag)");
      setIsTimeoutError(false);
      return;
    }
    setError("");
    setIsTimeoutError(false);

    const toast = showProgress(`Creating ${label}…`);
    try {
      const category = categories.find((c) => c.id === categoryId) ?? null;
      const scoping = defaultsForCategoryCode(category?.code ?? null);
      const gst = parseFloat(gstRate) || 0;
      const minOrder = parseFloat(minOrderQty);

      const created = await createMaterial.mutateAsync({
        name: label,
        category_id: categoryId || undefined,
        unit,
        gst_rate: gst,
        min_order_qty: Number.isFinite(minOrder) && minOrder > 0 ? minOrder : undefined,
        sold_in_packs: soldInPacks,
        price_varies_by_brand: scoping.price_varies_by_brand,
        price_varies_by_variant: scoping.price_varies_by_variant,
      });

      if (soldInPacks && parentPacks.length > 0 && created?.id) {
        for (let i = 0; i < parentPacks.length; i++) {
          const p = parentPacks[i];
          await createMaterialPack.mutateAsync({
            material_id: created.id,
            label: p.label,
            contents_qty: p.contents_qty,
            price: p.price ?? null,
            gst_rate: gst,
            display_order: i,
          });
        }
      }

      toast.update({ severity: "success", message: `Created ${label}`, duration: 3000 });
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
      onClose={handleClose}
      fullScreen={isMobile}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: isMobile ? 0 : 2 } }}
    >
      <Box
        sx={{ display: "flex", alignItems: "center", gap: 1.25, px: 2.5, py: 1.75, borderBottom: 1, borderColor: "divider" }}
      >
        <MaterialIcon sx={{ color: "primary.main" }} />
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontSize: 9.5, fontWeight: 700, color: "text.secondary", textTransform: "uppercase", letterSpacing: 0.6 }}>
            New bulk material
          </Typography>
          <Typography sx={{ fontSize: 16, fontWeight: 700 }}>{name.trim() || "Untitled material"}</Typography>
        </Box>
        <IconButton onClick={handleClose} size="small" sx={{ minWidth: 44, minHeight: 44 }}>
          <CloseIcon />
        </IconButton>
      </Box>

      <DialogContent sx={{ px: 2.5, py: 2 }}>
        {hasRestoredDraft && (
          <DraftRestoreBanner show={hasRestoredDraft} restoredAt={restoredAt} onDiscard={discardDraft} />
        )}
        {error && (
          <Box sx={{ mb: 1.5 }}>
            <InlineErrorBanner
              title={isTimeoutError ? "Request timed out" : "Couldn't save material"}
              description={error}
              onRetry={() => void handleSubmit()}
            />
          </Box>
        )}

        <Stack gap={2}>
          <TextField
            label="Material name"
            placeholder="e.g. M-Sand, 20mm Aggregate"
            value={name}
            onChange={(e) => updateField("name", e.target.value)}
            required
            autoFocus
            fullWidth
          />
          <CategoryAutocomplete
            value={categoryId || null}
            onChange={(v) => handleCategoryChange((v as string) || "")}
            parentOnly={false}
            label="Category"
          />
          <Stack direction="row" gap={2}>
            <TextField
              select
              label="Unit"
              value={unit}
              onChange={(e) => updateField("unit", e.target.value as MaterialUnit)}
              sx={{ flex: 1 }}
            >
              {UNIT_OPTIONS.map((u) => (
                <MenuItem key={u.value} value={u.value}>
                  {u.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="GST %"
              type="number"
              value={gstRate}
              onChange={(e) => updateField("gstRate", e.target.value)}
              inputProps={{ min: 0, max: 100, step: 0.5 }}
              sx={{ width: 100 }}
            />
            <TextField
              label="Min order qty"
              type="number"
              value={minOrderQty}
              onChange={(e) => updateField("minOrderQty", e.target.value)}
              inputProps={{ min: 0, step: "any" }}
              sx={{ width: 130 }}
            />
          </Stack>

          <Box>
            <FormControlLabel
              control={
                <Switch
                  checked={soldInPacks}
                  onChange={(e) => updateField("soldInPacks", e.target.checked)}
                />
              }
              label={<Typography sx={{ fontSize: 13 }}>Sold in fixed bags / containers</Typography>}
            />
            {soldInPacks && (
              <Box sx={{ mt: 1 }}>
                <ContainerSizesEditor
                  sizes={containerSizes}
                  onChange={(v) => updateField("containerSizes", v)}
                  unitLabel={unitLabel}
                />
              </Box>
            )}
          </Box>
        </Stack>
      </DialogContent>

      <Box
        sx={{ display: "flex", justifyContent: "space-between", px: 2.5, py: 1.5, borderTop: 1, borderColor: "divider" }}
      >
        <Button onClick={onBackToFork ?? handleClose} sx={{ textTransform: "none", minHeight: 44 }}>
          {onBackToFork ? "Back" : "Cancel"}
        </Button>
        <SaveButton
          idleLabel="Create material"
          savingLabel="Saving…"
          onClick={() => void handleSubmit()}
          isSaving={isPending}
          isError={!!error && !isPending && !saveSuccess}
          isSuccess={saveSuccess}
        />
      </Box>
    </Dialog>
  );
}
