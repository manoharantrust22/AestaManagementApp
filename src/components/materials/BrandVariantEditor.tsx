"use client";

import { useState, useMemo } from "react";
import {
  Box,
  Typography,
  Chip,
  IconButton,
  TextField,
  Button,
  Collapse,
  Paper,
  Tooltip,
  Snackbar,
  Alert,
} from "@mui/material";
import {
  Add as AddIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Close as CloseIcon,
} from "@mui/icons-material";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MaterialBrand, BrandWithVariants, BrandWithVariantLinks, MaterialBrandVariantLink } from "@/types/material.types";
import FileUploader from "@/components/common/FileUploader";
import { hardenedUpload } from "@/lib/storage/uploadHelpers";
import {
  useToggleBrandVariantLink,
  useUpsertBrandVariantLinkImage,
  useBrandVariantLinks,
  useMaterialVariants,
} from "@/hooks/queries/useMaterials";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";

// Category-specific suggested brands
const CATEGORY_BRAND_SUGGESTIONS: Record<string, string[]> = {
  // Cement categories (by name patterns)
  cement: ["Ultratech", "Dalmia", "Ramco", "Chettinad", "TNPL", "ACC", "Birla", "Ambuja"],
  ppc: ["Ultratech", "Dalmia", "Ramco", "Chettinad", "TNPL", "ACC", "Birla", "Ambuja"],
  opc: ["Ultratech", "Dalmia", "Ramco", "Chettinad", "TNPL", "ACC", "Birla", "Ambuja"],
  // Steel/TMT categories
  steel: ["TATA Tiscon", "JSW Neo", "Kamachi", "SAIL", "Vizag Steel", "Shyam Steel"],
  tmt: ["TATA Tiscon", "JSW Neo", "Kamachi", "SAIL", "Vizag Steel", "Shyam Steel"],
  // Paint categories
  paint: ["Asian Paints", "Berger", "Nerolac", "Dulux", "Nippon"],
  // Tiles categories
  tiles: ["Kajaria", "Somany", "Johnson", "Orient Bell", "RAK"],
  // Plumbing
  plumbing: ["Astral", "Supreme", "Finolex", "Prince", "Ashirvad"],
  pipes: ["Astral", "Supreme", "Finolex", "Prince", "Ashirvad"],
  // Electrical
  electrical: ["Havells", "Polycab", "Finolex", "KEI", "Anchor"],
  wire: ["Havells", "Polycab", "Finolex", "KEI", "RR Kabel"],
};

function getLinkForVariant(
  links: BrandWithVariantLinks[],
  brandId: string,
  variantId: string
): MaterialBrandVariantLink | undefined {
  return links
    .find((b) => b.id === brandId)
    ?.material_brand_variant_links.find((l) => l.variant_id === variantId);
}

interface BrandVariantEditorProps {
  materialId: string;
  brands: MaterialBrand[];
  categoryName?: string | null;
  supabase: SupabaseClient<any>;
  onAddBrand: (brandName: string, variantName?: string | null) => Promise<void>;
  onUpdateBrand: (brandId: string, data: { is_preferred?: boolean; image_url?: string | null }) => Promise<void>;
  onDeleteBrand: (brand: MaterialBrand) => Promise<void>;
  disabled?: boolean;
}

export default function BrandVariantEditor({
  materialId,
  brands,
  categoryName,
  supabase,
  onAddBrand,
  onUpdateBrand,
  onDeleteBrand,
  disabled = false,
}: BrandVariantEditorProps) {
  const [newBrandName, setNewBrandName] = useState("");
  const [expandedBrands, setExpandedBrands] = useState<Set<string>>(new Set());
  const [isAddingBrand, setIsAddingBrand] = useState(false);
  const [imageUploadErrorOpen, setImageUploadErrorOpen] = useState(false);

  const { data: brandLinks = [] } = useBrandVariantLinks(materialId);
  const { data: materialVariants = [] } = useMaterialVariants(materialId);
  const toggleLink = useToggleBrandVariantLink();
  const upsertImage = useUpsertBrandVariantLinkImage();

  // Get suggested brands based on category
  const suggestedBrands = useMemo(() => {
    if (!categoryName) return [];
    const categoryLower = categoryName.toLowerCase();

    // Find matching category suggestions
    for (const [key, suggestions] of Object.entries(CATEGORY_BRAND_SUGGESTIONS)) {
      if (categoryLower.includes(key)) {
        // Filter out brands already added
        const existingBrandNames = new Set(brands.map(b => b.brand_name.toLowerCase()));
        return suggestions.filter(s => !existingBrandNames.has(s.toLowerCase()));
      }
    }
    return [];
  }, [categoryName, brands]);

  // Group brands by brand_name
  const groupedBrands = useMemo((): BrandWithVariants[] => {
    const groups = new Map<string, BrandWithVariants>();

    for (const brand of brands.filter(b => b.is_active)) {
      const key = brand.brand_name.toLowerCase();
      if (!groups.has(key)) {
        groups.set(key, {
          id: brand.id,
          brand_name: brand.brand_name,
          is_preferred: brand.is_preferred,
          variants: [],
        });
      } else if (!brand.variant_name) {
        // Prefer the canonical (no-variant) row's id as the group id
        groups.get(key)!.id = brand.id;
      }
      const group = groups.get(key)!;
      group.variants.push({
        id: brand.id,
        variant_name: brand.variant_name,
        quality_rating: brand.quality_rating,
        notes: brand.notes,
        image_url: brand.image_url,
        is_active: brand.is_active,
      });
      // Mark group as preferred if any variant is preferred
      if (brand.is_preferred) {
        group.is_preferred = true;
      }
    }

    // Sort: preferred first, then alphabetically
    return Array.from(groups.values()).sort((a, b) => {
      if (a.is_preferred && !b.is_preferred) return -1;
      if (!a.is_preferred && b.is_preferred) return 1;
      return a.brand_name.localeCompare(b.brand_name);
    });
  }, [brands]);

  const toggleBrandExpanded = (brandName: string) => {
    setExpandedBrands(prev => {
      const next = new Set(prev);
      if (next.has(brandName)) {
        next.delete(brandName);
      } else {
        next.add(brandName);
      }
      return next;
    });
  };

  const handleAddBrand = async (brandName: string) => {
    if (!brandName.trim() || disabled) return;
    setIsAddingBrand(true);
    try {
      await onAddBrand(brandName.trim(), null);
      setNewBrandName("");
    } finally {
      setIsAddingBrand(false);
    }
  };

  const handleTogglePreferred = async (brand: MaterialBrand) => {
    if (disabled) return;
    await onUpdateBrand(brand.id, { is_preferred: !brand.is_preferred });
  };

  const handleDeleteBrand = async (brand: MaterialBrand) => {
    if (disabled) return;
    const displayName = brand.variant_name
      ? `${brand.brand_name} - ${brand.variant_name}`
      : brand.brand_name;
    if (!confirm(`Delete "${displayName}"?`)) return;
    await onDeleteBrand(brand);
  };

  // Find the MaterialBrand object for a given brand name (for delete/update)
  const findBrandByNameAndVariant = (brandName: string, variantName: string | null): MaterialBrand | undefined => {
    return brands.find(
      b => b.brand_name.toLowerCase() === brandName.toLowerCase() &&
           b.variant_name === variantName &&
           b.is_active
    );
  };

  return (
    <Box>
      {/* Suggested Brands - Quick Add */}
      {suggestedBrands.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
            Quick Add:
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
            {suggestedBrands.slice(0, 8).map((brand) => (
              <Chip
                key={brand}
                label={brand}
                size="small"
                variant="outlined"
                onClick={() => handleAddBrand(brand)}
                disabled={disabled || isAddingBrand}
                sx={{ cursor: "pointer" }}
              />
            ))}
            <Chip
              label="+ Other"
              size="small"
              variant="outlined"
              color="primary"
              onClick={() => document.getElementById("new-brand-input")?.focus()}
              sx={{ cursor: "pointer" }}
            />
          </Box>
        </Box>
      )}

      {/* Grouped Brands List */}
      {groupedBrands.length > 0 && (
        <Box sx={{ mb: 2 }}>
          {groupedBrands.map((group) => {
            const isExpanded = expandedBrands.has(group.brand_name);

            return (
              <Paper
                key={group.brand_name}
                variant="outlined"
                sx={{ mb: 1, overflow: "hidden" }}
              >
                {/* Brand Header */}
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    px: 1.5,
                    py: 1,
                    bgcolor: group.is_preferred ? "primary.50" : "transparent",
                    borderBottom: isExpanded ? 1 : 0,
                    borderColor: "divider",
                  }}
                >
                  <IconButton
                    size="small"
                    onClick={() => toggleBrandExpanded(group.brand_name)}
                    sx={{ mr: 0.5 }}
                  >
                    {isExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                  </IconButton>

                  <Tooltip title={group.is_preferred ? "Preferred brand" : "Mark as preferred"}>
                    <IconButton
                      size="small"
                      onClick={() => {
                        // Toggle preferred on the first variant (or generic brand)
                        const mainBrand = findBrandByNameAndVariant(group.brand_name, null) ||
                                         findBrandByNameAndVariant(group.brand_name, group.variants[0]?.variant_name || null);
                        if (mainBrand) handleTogglePreferred(mainBrand);
                      }}
                      sx={{ mr: 1 }}
                      disabled={disabled}
                    >
                      {group.is_preferred ? (
                        <StarIcon fontSize="small" color="warning" />
                      ) : (
                        <StarBorderIcon fontSize="small" />
                      )}
                    </IconButton>
                  </Tooltip>

                  <Typography variant="body2" sx={{ fontWeight: 500, flex: 1 }}>
                    {group.brand_name}
                  </Typography>

                  {group.variants.length > 1 && (
                    <Typography variant="caption" color="text.secondary" sx={{ mr: 1 }}>
                      {group.variants.filter(v => v.variant_name).length} variants
                    </Typography>
                  )}

                  <IconButton
                    size="small"
                    onClick={() => {
                      // Delete all variants of this brand
                      const mainBrand = findBrandByNameAndVariant(group.brand_name, null);
                      if (mainBrand) handleDeleteBrand(mainBrand);
                      else if (group.variants.length === 1) {
                        const onlyVariant = findBrandByNameAndVariant(group.brand_name, group.variants[0].variant_name);
                        if (onlyVariant) handleDeleteBrand(onlyVariant);
                      }
                    }}
                    disabled={disabled}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>

                {/* Expanded Content - Variants */}
                <Collapse in={isExpanded}>
                  <Box sx={{ px: 2, py: 1.5, bgcolor: "grey.50" }}>
                    {/* Brand Product Image */}
                    {(() => {
                      // Use the first variant (or generic brand) for image storage
                      const mainVariant = group.variants.find(v => !v.variant_name) || group.variants[0];
                      const brandImage = group.variants.find(v => v.image_url)?.image_url || null;
                      return (
                        <Box sx={{ mb: 1.5 }}>
                          {brandImage ? (
                            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                              <Box
                                component="img"
                                src={brandImage}
                                alt={`${group.brand_name} product`}
                                sx={{
                                  width: 80,
                                  height: 80,
                                  objectFit: "cover",
                                  borderRadius: 1,
                                  border: 1,
                                  borderColor: "divider",
                                }}
                              />
                              <IconButton
                                size="small"
                                onClick={() => {
                                  if (mainVariant) {
                                    onUpdateBrand(mainVariant.id, { image_url: null });
                                  }
                                }}
                                disabled={disabled}
                              >
                                <CloseIcon fontSize="small" />
                              </IconButton>
                            </Box>
                          ) : (
                            <FileUploader
                              supabase={supabase}
                              bucketName="work-updates"
                              folderPath="product-photos"
                              fileNamePrefix={`brand-${group.brand_name.toLowerCase().replace(/\s+/g, "-")}`}
                              accept="image"
                              label="Brand Product Image"
                              value={null}
                              onUpload={(file) => {
                                if (mainVariant) {
                                  onUpdateBrand(mainVariant.id, { image_url: file.url });
                                }
                              }}
                              onRemove={() => {}}
                              compact
                              maxSizeMB={2}
                            />
                          )}
                        </Box>
                      );
                    })()}

                    {/* Variant link matrix — only shown when the material has variants */}
                    {materialVariants.length > 0 && (() => {
                      const brandId = group.id;
                      return (
                        <Box sx={{ mt: 1, pl: 1 }}>
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: "block", mb: 0.5 }}
                          >
                            Variants
                          </Typography>
                          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                            {materialVariants.map((variant) => {
                              const link = brandId
                                ? getLinkForVariant(brandLinks, brandId, variant.id)
                                : undefined;
                              const isLinked = link?.is_active ?? false;
                              return (
                                <Chip
                                  key={variant.id}
                                  label={variant.name}
                                  size="small"
                                  variant={isLinked ? "filled" : "outlined"}
                                  color={isLinked ? "primary" : "default"}
                                  onClick={() => {
                                    if (!brandId) return;
                                    toggleLink.mutate({
                                      brandId,
                                      variantId: variant.id,
                                      isActive: !isLinked,
                                      materialId,
                                    });
                                  }}
                                  disabled={disabled || toggleLink.isPending || !brandId}
                                  sx={{ height: 24, fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                                />
                              );
                            })}
                          </Box>

                          {/* Per-variant image uploads — shown for linked variants only */}
                          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
                            {materialVariants.map((variant) => {
                              const link = brandId
                                ? getLinkForVariant(brandLinks, brandId, variant.id)
                                : undefined;
                              if (!link?.is_active) return null;
                              return (
                                <Tooltip key={variant.id} title={`Set image for ${variant.name}`}>
                                  <IconButton
                                    size="small"
                                    component="label"
                                    disabled={disabled || upsertImage.isPending}
                                    sx={{ fontSize: 10, gap: 0.25, borderRadius: 1, px: 0.5 }}
                                  >
                                    <PhotoCameraIcon sx={{ fontSize: 14 }} />
                                    <Typography sx={{ fontSize: 10 }}>{variant.name}</Typography>
                                    <input
                                      hidden
                                      accept="image/*"
                                      type="file"
                                      onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file || !brandId) return;
                                        // Upload via the hardened pipeline (lock-free
                                        // token + watchdog + retry) so it can't hang on
                                        // the auth lock like a raw storage.upload() does.
                                        const fileExt = file.name.split(".").pop();
                                        const fileName = `brand-variant-${brandId}-${variant.id}-${Date.now()}.${fileExt}`;
                                        try {
                                          const { publicUrl } = await hardenedUpload({
                                            supabase,
                                            bucketName: "work-updates",
                                            filePath: `product-photos/${fileName}`,
                                            file,
                                            contentType: file.type,
                                          });
                                          upsertImage.mutate(
                                            {
                                              brandId,
                                              variantId: variant.id,
                                              imageUrl: publicUrl,
                                              materialId,
                                            },
                                            { onError: () => setImageUploadErrorOpen(true) }
                                          );
                                        } catch (uploadError) {
                                          console.error("Variant image upload failed:", uploadError);
                                          setImageUploadErrorOpen(true);
                                        }
                                      }}
                                    />
                                  </IconButton>
                                </Tooltip>
                              );
                            })}
                          </Box>
                        </Box>
                      );
                    })()}
                  </Box>
                </Collapse>
              </Paper>
            );
          })}
        </Box>
      )}

      {/* Add New Brand */}
      <Box sx={{ display: "flex", gap: 1 }}>
        <TextField
          id="new-brand-input"
          size="small"
          placeholder="Add brand name..."
          value={newBrandName}
          onChange={(e) => setNewBrandName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAddBrand(newBrandName);
            }
          }}
          sx={{ flex: 1 }}
          disabled={disabled}
        />
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => handleAddBrand(newBrandName)}
          disabled={!newBrandName.trim() || disabled || isAddingBrand}
        >
          Add
        </Button>
      </Box>

      <Snackbar
        open={imageUploadErrorOpen}
        autoHideDuration={4000}
        onClose={() => setImageUploadErrorOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setImageUploadErrorOpen(false)}
          severity="error"
          variant="filled"
          sx={{ width: "100%" }}
        >
          Image upload failed
        </Alert>
      </Snackbar>
    </Box>
  );
}
