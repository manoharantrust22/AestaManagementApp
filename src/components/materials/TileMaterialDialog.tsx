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
  ToggleButton,
  ToggleButtonGroup,
  Stack,
} from "@mui/material";
import { Close as CloseIcon, GridView as TileIcon } from "@mui/icons-material";
import CategoryAutocomplete from "@/components/common/CategoryAutocomplete";
import { SaveButton } from "@/components/common/SaveButton";
import { InlineErrorBanner } from "@/components/common/InlineErrorBanner";
import { useToast } from "@/contexts/ToastContext";
import { useIsMobile } from "@/hooks/useIsMobile";
import { isAbortOrTimeoutError } from "@/lib/utils/timeout";
import { createClient } from "@/lib/supabase/client";
import { useCreateMaterialWithVariants } from "@/hooks/queries/useMaterials";
import { getOrCreateUnspecifiedVendor } from "@/lib/materials/unspecifiedVendor";
import type {
  MaterialCategory,
  MaterialUnit,
  VariantFormData,
} from "@/types/material.types";
import ThicknessPriceChips, { type ThicknessRow } from "./tile/ThicknessPriceChips";
import DesignGalleryUploader, {
  type DesignGalleryValue,
} from "./tile/DesignGalleryUploader";

interface TileMaterialDialogProps {
  open: boolean;
  onClose: () => void;
  categories: MaterialCategory[];
}

// Local section wrapper — matches the MaterialDialog visual vocabulary.
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
        }}
      >
        {title}
      </Typography>
      {subtitle && (
        <Typography sx={{ fontSize: 11, color: "text.secondary", mb: 1.25, mt: 0.25 }}>
          {subtitle}
        </Typography>
      )}
      <Box sx={{ mt: subtitle ? 0 : 1.25 }}>{children}</Box>
    </Box>
  );
}

export default function TileMaterialDialog({
  open,
  onClose,
  categories,
}: TileMaterialDialogProps) {
  const isMobile = useIsMobile();
  const { showProgress } = useToast();
  const supabase = createClient();
  const createMaterialWithVariants = useCreateMaterialWithVariants();

  // Default to a top-level category whose name looks like tiles.
  const defaultTileCategoryId = useMemo(() => {
    const tile = categories.find(
      (c) => !c.parent_id && /tile/i.test(c.name),
    );
    return tile?.id ?? "";
  }, [categories]);

  const [name, setName] = useState("");
  const [unit, setUnit] = useState<MaterialUnit>("piece");
  const [tileSize, setTileSize] = useState("");
  const [categoryId, setCategoryId] = useState<string>(defaultTileCategoryId);
  const [thicknessRows, setThicknessRows] = useState<ThicknessRow[]>([]);
  const [designs, setDesigns] = useState<DesignGalleryValue[]>([]);
  const [designsUploading, setDesignsUploading] = useState(false);

  const [error, setError] = useState("");
  const [isTimeoutError, setIsTimeoutError] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Reset on (re)open.
  useEffect(() => {
    if (open) {
      setName("");
      setUnit("piece");
      setTileSize("");
      setCategoryId(defaultTileCategoryId);
      setThicknessRows([]);
      setDesigns([]);
      setDesignsUploading(false);
      setError("");
      setIsTimeoutError(false);
      setSaveSuccess(false);
    }
  }, [open, defaultTileCategoryId]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("Tile name is required");
      setIsTimeoutError(false);
      return;
    }
    if (designsUploading) {
      setError("Please wait for design photos to finish uploading");
      setIsTimeoutError(false);
      return;
    }
    setError("");
    setIsTimeoutError(false);

    const label = name.trim();
    const toast = showProgress(`Creating ${label}…`);

    try {
      // Resolve the house "List price" vendor only if a thickness carries a price.
      const anyPriced = thicknessRows.some(
        (r) => parseFloat(r.price) > 0,
      );
      const houseVendorId = anyPriced
        ? await getOrCreateUnspecifiedVendor(supabase)
        : null;

      const variants: VariantFormData[] = thicknessRows
        .filter((r) => r.thickness.trim())
        .map((r) => {
          const price = parseFloat(r.price);
          const hasPrice = !Number.isNaN(price) && price > 0;
          return {
            name: r.thickness.trim(),
            specifications: { thickness: r.thickness.trim() },
            initial_vendor_id: hasPrice ? houseVendorId : null,
            initial_vendor_price: hasPrice ? price : null,
          };
        });

      await createMaterialWithVariants.mutateAsync({
        name: label,
        category_id: categoryId || undefined,
        unit,
        gst_rate: 0,
        min_order_qty: 1,
        // Default the parent card image to the first design so the catalog
        // tile shows a picture without a separate hero upload.
        image_url: designs[0]?.image_url || undefined,
        specifications: tileSize.trim()
          ? { tile_size: tileSize.trim() }
          : undefined,
        variants,
        designs: designs.map((d, i) => ({
          image_url: d.image_url,
          name: d.name,
          display_order: i,
        })),
      });

      toast.update({
        severity: "success",
        message: `Created ${label}`,
        duration: 3000,
      });
      setSaveSuccess(true);
      window.setTimeout(() => {
        setSaveSuccess(false);
        onClose();
      }, 700);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create tile";
      const timedOut = isAbortOrTimeoutError(err);
      setError(message);
      setIsTimeoutError(timedOut);
      toast.update({
        severity: "error",
        message: timedOut
          ? `Couldn't create ${label} — request timed out`
          : `Couldn't create ${label}`,
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
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.25,
          px: 2.5,
          py: 1.75,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <TileIcon sx={{ color: "primary.main" }} />
        <Box sx={{ flex: 1 }}>
          <Typography
            sx={{
              fontSize: 9.5,
              fontWeight: 700,
              color: "text.secondary",
              textTransform: "uppercase",
              letterSpacing: 0.6,
            }}
          >
            New tile
          </Typography>
          <Typography sx={{ fontSize: 16, fontWeight: 700 }}>
            {name.trim() || "Untitled tile"}
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
              title={isTimeoutError ? "Request timed out" : "Couldn't create tile"}
              description={error}
              onRetry={() => void handleSubmit()}
            />
          </Box>
        )}

        <Stack gap={1.75}>
          {/* 1 · Basics */}
          <Section title="Product basics">
            <Stack gap={1.5}>
              <TextField
                label="Tile name"
                placeholder="e.g. Dhakshan Cool Roof Tiles"
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
              <CategoryAutocomplete
                value={categoryId || null}
                onChange={(v) => setCategoryId((v as string) || "")}
                parentOnly
                label="Category"
              />
              <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
                <Box>
                  <Typography sx={{ fontSize: 11, color: "text.secondary", mb: 0.5 }}>
                    Sold by
                  </Typography>
                  <ToggleButtonGroup
                    size="small"
                    exclusive
                    value={unit}
                    onChange={(_, v) => v && setUnit(v as MaterialUnit)}
                  >
                    <ToggleButton value="piece" sx={{ textTransform: "none", px: 1.5 }}>
                      Piece
                    </ToggleButton>
                    <ToggleButton value="box" sx={{ textTransform: "none", px: 1.5 }}>
                      Box
                    </ToggleButton>
                  </ToggleButtonGroup>
                </Box>
                <TextField
                  label="Tile size (optional)"
                  placeholder="e.g. 1×1 ft"
                  value={tileSize}
                  onChange={(e) => setTileSize(e.target.value)}
                  size="small"
                  sx={{ flex: 1, minWidth: 150 }}
                />
              </Box>
            </Stack>
          </Section>

          {/* 2 · Thickness & price */}
          <Section
            title="Thickness & price"
            subtitle="Price is by thickness only. Tap a thickness, then set its rate."
          >
            <ThicknessPriceChips
              rows={thicknessRows}
              onRowsChange={setThicknessRows}
              unitLabel={unit}
            />
          </Section>

          {/* 3 · Designs */}
          <Section
            title="Designs"
            subtitle="The patterns/colours of this tile — uploaded once, shared across every thickness."
          >
            <DesignGalleryUploader
              onDesignsChange={setDesigns}
              onUploadingChange={setDesignsUploading}
            />
          </Section>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 2.5, py: 1.5, borderTop: 1, borderColor: "divider" }}>
        <Button onClick={onClose} sx={{ textTransform: "none" }}>
          Cancel
        </Button>
        <SaveButton
          idleLabel="Create tile"
          savingLabel="Creating…"
          onClick={() => void handleSubmit()}
          isSaving={createMaterialWithVariants.isPending}
          isError={!!error && !createMaterialWithVariants.isPending && !saveSuccess}
          isSuccess={saveSuccess}
          disabled={designsUploading}
        />
      </DialogActions>
    </Dialog>
  );
}
