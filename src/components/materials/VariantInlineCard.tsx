"use client";

import { useMemo, useState } from "react";
import {
  Box,
  Button,
  IconButton,
  InputAdornment,
  Popover,
  TextField,
  Tooltip,
  Typography,
  Stack,
  Divider,
} from "@mui/material";
import {
  PhotoCamera as PhotoCameraIcon,
  Inventory as InventoryIcon,
  Save as SaveIcon,
  Close as CloseIcon,
} from "@mui/icons-material";
import { EntityImageAvatar } from "@/components/common/EntityImageAvatar";
import VendorAutocomplete from "@/components/common/VendorAutocomplete";
import {
  useAddVariantToMaterial,
  useUpdateMaterial,
} from "@/hooks/queries/useMaterials";
import {
  getSpecFieldsForMaterial,
  type SpecFieldDef,
} from "@/lib/material-variant-specs";
import type { MaterialWithDetails, VariantFormData } from "@/types/material.types";

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
  field: SpecFieldDef
): string {
  if (!variant) return "";
  // Steel uses legacy columns directly.
  if (field.writeLegacyColumn) {
    const legacyVal =
      field.key === "weight_per_unit"
        ? variant.weight_per_unit
        : field.key === "length_per_piece"
        ? variant.length_per_piece
        : field.key === "rods_per_bundle"
        ? variant.rods_per_bundle
        : null;
    return legacyVal == null ? "" : String(legacyVal);
  }
  const specs = (variant.specifications as Record<string, unknown> | null | undefined) ?? {};
  const v = specs[field.key];
  return v == null ? "" : String(v);
}

export default function VariantInlineCard({
  mode,
  parentMaterial,
  variant,
  onCancel,
  onSaved,
}: VariantInlineCardProps) {
  const specFields = useMemo(
    () => getSpecFieldsForMaterial(parentMaterial),
    [parentMaterial]
  );

  // Form state
  const [name, setName] = useState(variant?.name ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(variant?.image_url ?? null);
  const [specValues, setSpecValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const f of specFields) init[f.key] = readSpecValue(variant, f);
    return init;
  });

  // Vendor + price (add mode only)
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [price, setPrice] = useState<string>("");
  const [vendorNotes, setVendorNotes] = useState<string>("");

  // Image picker popover
  const [pickerAnchor, setPickerAnchor] = useState<HTMLElement | null>(null);

  const addVariant = useAddVariantToMaterial();
  const updateMaterial = useUpdateMaterial();
  const isPending = addVariant.isPending || updateMaterial.isPending;

  const [error, setError] = useState<string>("");

  const handleSpecChange = (key: string, value: string) => {
    setSpecValues((prev) => ({ ...prev, [key]: value }));
  };

  const parseSpecsForSubmit = () => {
    const specs: Record<string, unknown> = {};
    const legacy: {
      weight_per_unit?: number | null;
      length_per_piece?: number | null;
      rods_per_bundle?: number | null;
    } = {};
    for (const f of specFields) {
      const raw = specValues[f.key]?.trim();
      if (!raw) {
        if (f.writeLegacyColumn && (f.key === "weight_per_unit" || f.key === "length_per_piece" || f.key === "rods_per_bundle")) {
          legacy[f.key] = null;
        }
        continue;
      }
      let parsed: unknown = raw;
      if (f.type === "number") parsed = Number(raw);
      else if (f.type === "integer") parsed = parseInt(raw, 10);
      if (typeof parsed === "number" && Number.isNaN(parsed)) continue;
      specs[f.key] = parsed;
      if (f.writeLegacyColumn) {
        if (f.key === "weight_per_unit" || f.key === "length_per_piece") {
          legacy[f.key] = parsed as number;
        } else if (f.key === "rods_per_bundle") {
          legacy.rods_per_bundle = parsed as number;
        }
      }
    }
    return { specs, legacy };
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

    const { specs, legacy } = parseSpecsForSubmit();

    try {
      if (mode === "add") {
        const formData: VariantFormData = {
          name: name.trim(),
          weight_per_unit: legacy.weight_per_unit ?? null,
          length_per_piece: legacy.length_per_piece ?? null,
          rods_per_bundle: legacy.rods_per_bundle ?? null,
          specifications: specs,
          image_url: imageUrl,
          initial_vendor_id: vendorId ?? null,
          initial_vendor_price: vendorId ? Number(price) : null,
          initial_vendor_notes: vendorNotes.trim() || null,
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
            specifications: specs,
            weight_per_unit: legacy.weight_per_unit ?? null,
            length_per_piece: legacy.length_per_piece ?? null,
            rods_per_bundle: legacy.rods_per_bundle ?? null,
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
          onChange={(e) => setName(e.target.value)}
          autoFocus
          placeholder={`e.g., ${parentMaterial.name} (variant)`}
        />
      </Box>

      {/* Specifications (only if category has spec fields) */}
      {specFields.length > 0 && (
        <>
          <Divider textAlign="left" sx={{ fontSize: 11, color: "text.secondary", letterSpacing: 0.5, textTransform: "uppercase" }}>
            Specifications
          </Divider>
          <Stack direction="row" flexWrap="wrap" gap={1}>
            {specFields.map((f) => (
              <TextField
                key={f.key}
                size="small"
                label={f.label}
                value={specValues[f.key] ?? ""}
                onChange={(e) => handleSpecChange(f.key, e.target.value)}
                helperText={f.helper}
                type={f.type === "text" ? "text" : "number"}
                slotProps={{
                  input: {
                    endAdornment: f.unit ? (
                      <InputAdornment position="end">{f.unit}</InputAdornment>
                    ) : undefined,
                    inputProps:
                      f.type === "integer"
                        ? { step: 1, min: 0 }
                        : f.type === "number"
                        ? { step: 0.001, min: 0 }
                        : undefined,
                  },
                }}
                sx={{ minWidth: 140, flex: "1 1 140px" }}
              />
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
          <TextField
            size="small"
            label="Vendor notes"
            value={vendorNotes}
            onChange={(e) => setVendorNotes(e.target.value)}
            placeholder='e.g., "Tipper load minimum 4 cft"'
            disabled={!vendorId}
          />
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
          disabled={isPending || !name.trim()}
          startIcon={<SaveIcon />}
        >
          {isPending ? "Saving..." : mode === "add" ? "Add variant" : "Save"}
        </Button>
      </Box>

      {/* Image picker popover */}
      <Popover
        open={Boolean(pickerAnchor)}
        anchorEl={pickerAnchor}
        onClose={() => setPickerAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { sx: { p: 1.5, width: 300 } } }}
      >
        <Typography sx={{ fontSize: 11, fontWeight: 700, mb: 1, color: "text.secondary", textTransform: "uppercase", letterSpacing: 0.5 }}>
          Choose image
        </Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0.75 }}>
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
            cursor: "pointer",
            "&:hover": { color: "error.main" },
          }}
        >
          Remove image
        </Box>
      </Popover>
    </Box>
  );
}
