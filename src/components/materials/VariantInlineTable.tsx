"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import {
  Alert,
  Box,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TextField,
  IconButton,
  Button,
  Paper,
  Typography,
  Tooltip,
  TableContainer,
} from "@mui/material";
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  AutoAwesome as AutoGenerateIcon,
} from "@mui/icons-material";
import type { VariantFormData } from "@/types/material.types";
import type { MaterialCategory } from "@/types/material.types";
import type { CategoryVariantTemplate } from "@/types/category-variant-fields.types";
import { getCategoryTemplate, renderNameTemplate } from "@/lib/category-variant-templates";
import DynamicVariantField from "./DynamicVariantField";

interface VariantInlineTableProps {
  parentName: string;
  parentCode?: string;
  parentUnit: string;
  variants: VariantFormData[];
  onVariantsChange: (variants: VariantFormData[]) => void;
  /** Category ID for determining which variant fields to show */
  categoryId?: string | null;
  /** Categories list for resolving category by ID */
  categories?: MaterialCategory[];
}

export default function VariantInlineTable({
  parentName,
  parentCode,
  variants,
  onVariantsChange,
  categoryId,
  categories,
}: VariantInlineTableProps) {
  // Resolve category and get template
  const category = useMemo(() => {
    if (!categoryId || !categories) return null;
    return categories.find((c) => c.id === categoryId) ?? null;
  }, [categoryId, categories]);

  // Get parent category for hierarchical matching
  const parentCategory = useMemo(() => {
    if (!category?.parent_id || !categories) return null;
    return categories.find((c) => c.id === category.parent_id) ?? null;
  }, [category, categories]);

  // Get the variant template for this category
  const template: CategoryVariantTemplate = useMemo(() => {
    return getCategoryTemplate(category, parentCategory);
  }, [category, parentCategory]);

  // Initialize new variant state with empty specifications
  const getEmptyVariant = useCallback((): Partial<VariantFormData> => {
    const specs: Record<string, unknown> = {};
    // Set default values from template
    template.fields.forEach((field) => {
      if (field.defaultValue !== undefined) {
        specs[field.key] = field.defaultValue;
      }
    });
    return {
      name: "",
      specifications: specs,
    };
  }, [template]);

  const [newVariant, setNewVariant] = useState<Partial<VariantFormData>>(getEmptyVariant);
  // Once the user types a name themselves, stop deriving it from the specs below.
  const [newNameTouched, setNewNameTouched] = useState(false);

  // Update new variant state when template changes
  useMemo(() => {
    setNewVariant(getEmptyVariant());
    setNewNameTouched(false);
  }, [getEmptyVariant]);

  // Derive the draft row's name from its specs (e.g. Shade "Gray" -> Name "Gray"),
  // same mechanism as VariantInlineCard's edit-mode form. Only touches the name
  // while the user hasn't typed one directly, so it never fights manual input.
  useEffect(() => {
    if (newNameTouched || !template.nameTemplate) return;
    const derived = renderNameTemplate(template.nameTemplate, newVariant.specifications ?? {});
    if (derived) setNewVariant((prev) => ({ ...prev, name: derived }));
  }, [newVariant.specifications, newNameTouched, template.nameTemplate]);

  const handleAddVariant = useCallback(() => {
    if (!newVariant.name?.trim()) return;

    const variantCode = parentCode
      ? `${parentCode}-V${(variants.length + 1).toString().padStart(2, "0")}`
      : undefined;

    // Extract legacy fields from specifications for backward compatibility
    const specs = newVariant.specifications ?? {};

    onVariantsChange([
      ...variants,
      {
        name: newVariant.name.trim(),
        code: variantCode,
        // Legacy fields for backward compatibility
        weight_per_unit: specs.weight_per_unit as number | null ?? null,
        length_per_piece: specs.length_per_piece as number | null ?? null,
        rods_per_bundle: specs.rods_per_bundle as number | null ?? null,
        // All specifications including dynamic fields
        specifications: specs,
      },
    ]);

    setNewVariant(getEmptyVariant());
    setNewNameTouched(false);
  }, [newVariant, variants, parentCode, onVariantsChange, getEmptyVariant]);

  const handleRemoveVariant = useCallback(
    (index: number) => {
      onVariantsChange(variants.filter((_, i) => i !== index));
    },
    [variants, onVariantsChange]
  );

  const handleVariantChange = useCallback(
    (index: number, field: keyof VariantFormData | string, value: unknown) => {
      onVariantsChange(
        variants.map((v, i) => {
          if (i !== index) return v;

          // Handle specification fields
          if (field !== "name" && field !== "code" && field !== "local_name") {
            const newSpecs = { ...(v.specifications ?? {}), [field]: value };
            return {
              ...v,
              specifications: newSpecs,
              // Also update legacy fields if applicable
              ...(field === "weight_per_unit" && { weight_per_unit: value as number | null }),
              ...(field === "length_per_piece" && { length_per_piece: value as number | null }),
              ...(field === "rods_per_bundle" && { rods_per_bundle: value as number | null }),
            };
          }

          return { ...v, [field]: value };
        })
      );
    },
    [variants, onVariantsChange]
  );

  const handleNewVariantSpecChange = useCallback(
    (field: string, value: unknown) => {
      setNewVariant((prev) => ({
        ...prev,
        specifications: {
          ...(prev.specifications ?? {}),
          [field]: value,
        },
      }));
    },
    []
  );

  // Auto-generate variants from template presets
  const handleAutoGenerate = useCallback(() => {
    const config = template.autoGenerateConfig;
    if (!config?.enabled || !config.presets) return;

    const newVariants = config.presets.map((preset, index) => ({
      name: `${parentName} ${preset.name}`,
      code: parentCode
        ? `${parentCode}-V${(variants.length + index + 1).toString().padStart(2, "0")}`
        : undefined,
      // Legacy fields
      weight_per_unit: preset.values.weight_per_unit as number | null ?? null,
      length_per_piece: preset.values.length_per_piece as number | null ?? null,
      rods_per_bundle: preset.values.rods_per_bundle as number | null ?? null,
      // All specifications
      specifications: preset.values,
    }));

    onVariantsChange([...variants, ...newVariants]);
  }, [template, parentName, parentCode, variants, onVariantsChange]);

  // Check if auto-generate is available
  const hasAutoGenerate = template.autoGenerateConfig?.enabled ?? false;

  // Get value from variant (check specifications first, then legacy fields)
  const getVariantValue = (variant: VariantFormData, fieldKey: string): unknown => {
    // First check specifications
    if (variant.specifications && fieldKey in variant.specifications) {
      return variant.specifications[fieldKey];
    }
    // Then check legacy fields
    if (fieldKey === "weight_per_unit") return variant.weight_per_unit;
    if (fieldKey === "length_per_piece") return variant.length_per_piece;
    if (fieldKey === "rods_per_bundle") return variant.rods_per_bundle;
    return null;
  };

  return (
    <Box>
      {/* Quick Actions */}
      {hasAutoGenerate && variants.length === 0 && (
        <Box sx={{ mb: 2 }}>
          <Button
            size="small"
            startIcon={<AutoGenerateIcon />}
            onClick={handleAutoGenerate}
            variant="outlined"
          >
            {template.autoGenerateConfig?.buttonLabel ?? "Auto-generate variants"}
          </Button>
        </Box>
      )}

      {/* Variants Table */}
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Variant Name *</TableCell>
              <TableCell align="center" sx={{ width: 80 }}>
                Code
              </TableCell>
              {template.fields.map((field) => (
                <TableCell
                  key={field.key}
                  align={field.type === "number" ? "right" : "left"}
                  sx={{ width: field.columnWidth ?? 100 }}
                >
                  {field.name}
                  {field.unit && ` (${field.unit})`}
                </TableCell>
              ))}
              <TableCell sx={{ width: 50 }}></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {variants.map((variant, index) => (
              <TableRow key={index} hover>
                <TableCell>
                  <TextField
                    size="small"
                    fullWidth
                    value={variant.name}
                    onChange={(e) =>
                      handleVariantChange(index, "name", e.target.value)
                    }
                    variant="standard"
                    placeholder="e.g., 8mm, 20mm, 50kg..."
                  />
                </TableCell>
                <TableCell align="center">
                  <Typography variant="caption" color="text.secondary">
                    {variant.code || "Auto"}
                  </Typography>
                </TableCell>
                {template.fields.map((field) => (
                  <TableCell
                    key={field.key}
                    align={field.type === "number" ? "right" : "left"}
                  >
                    <DynamicVariantField
                      field={field}
                      value={getVariantValue(variant, field.key)}
                      onChange={(value) =>
                        handleVariantChange(index, field.key, value)
                      }
                      size="small"
                      variant="standard"
                    />
                  </TableCell>
                ))}
                <TableCell>
                  <Tooltip title="Remove variant">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleRemoveVariant(index)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}

            {/* Add New Row */}
            <TableRow sx={{ backgroundColor: "action.hover" }}>
              <TableCell>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="New variant name..."
                  value={newVariant.name || ""}
                  onChange={(e) => {
                    setNewNameTouched(true);
                    setNewVariant((prev) => ({ ...prev, name: e.target.value }));
                  }}
                  variant="standard"
                  onKeyDown={(e) => e.key === "Enter" && handleAddVariant()}
                />
              </TableCell>
              <TableCell align="center">
                <Typography variant="caption" color="text.secondary">
                  Auto
                </Typography>
              </TableCell>
              {template.fields.map((field) => (
                <TableCell
                  key={field.key}
                  align={field.type === "number" ? "right" : "left"}
                >
                  <DynamicVariantField
                    field={field}
                    value={newVariant.specifications?.[field.key] ?? null}
                    onChange={(value) =>
                      handleNewVariantSpecChange(field.key, value)
                    }
                    size="small"
                    variant="standard"
                  />
                </TableCell>
              ))}
              <TableCell>
                <Tooltip title="Add variant">
                  <span>
                    <IconButton
                      size="small"
                      color="primary"
                      onClick={handleAddVariant}
                      disabled={!newVariant.name?.trim()}
                    >
                      <AddIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>

      {variants.length === 0 && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mt: 1, textAlign: "center" }}
        >
          Add variants for different sizes or specifications
        </Typography>
      )}

      {variants.length === 1 && template.fields.some((f) => f.key === "shade") && (
        <Alert severity="info" sx={{ mt: 1 }}>
          Only one variant added. If this product also comes in another color, add it
          as its own row — each variant gets independently priced packs on the next step.
        </Alert>
      )}

      {variants.length > 0 && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mt: 1 }}
        >
          {variants.length} variant{variants.length !== 1 ? "s" : ""} will be
          created with the parent material
        </Typography>
      )}
    </Box>
  );
}
