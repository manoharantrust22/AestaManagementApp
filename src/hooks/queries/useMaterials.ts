"use client";

import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient, ensureFreshSession } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/cache/keys";
import { wrapQueryFn } from "@/lib/utils/timeout";
import type {
  Material,
  MaterialWithDetails,
  MaterialFormData,
  MaterialCategory,
  MaterialCategoryWithChildren,
  MaterialBrand,
  MaterialBrandFormData,
  VariantFormData,
  CreateMaterialWithVariantsData,
  MaterialSearchOption,
  BrandWithVariantLinks,
  MaterialBrandVariantLink,
} from "@/types/material.types";

// ============================================
// MATERIAL CATEGORIES
// ============================================

/**
 * Fetch all material categories
 */
export function useMaterialCategories() {
  const supabase = createClient();

  return useQuery({
    queryKey: queryKeys.materials.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("material_categories")
        .select("*")
        .eq("is_active", true)
        .order("display_order");

      if (error) throw error;
      return data as MaterialCategory[];
    },
  });
}

/**
 * Fetch material categories as a tree structure
 */
export function useMaterialCategoryTree() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["materials", "categories", "tree"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("material_categories")
        .select("*")
        .eq("is_active", true)
        .order("display_order");

      if (error) throw error;

      // Build tree structure
      const categories = data as MaterialCategory[];
      const categoryMap = new Map<string, MaterialCategoryWithChildren>();
      const rootCategories: MaterialCategoryWithChildren[] = [];

      // First pass: create map
      categories.forEach((cat) => {
        categoryMap.set(cat.id, { ...cat, children: [] });
      });

      // Second pass: build tree
      categories.forEach((cat) => {
        const catWithChildren = categoryMap.get(cat.id)!;
        if (cat.parent_id && categoryMap.has(cat.parent_id)) {
          categoryMap.get(cat.parent_id)!.children!.push(catWithChildren);
        } else {
          rootCategories.push(catWithChildren);
        }
      });

      return rootCategories;
    },
  });
}

/**
 * Create a new material category
 */
export function useCreateMaterialCategory() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: Partial<MaterialCategory>) => {
      const { data: result, error } = await (
        supabase.from("material_categories") as any
      )
        .insert(data)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.materials.all });
      queryClient.invalidateQueries({
        queryKey: ["materials", "categories", "tree"],
      });
    },
  });
}

/**
 * Update an existing material category
 */
export function useUpdateMaterialCategory() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<MaterialCategory>;
    }) => {
      const { data: result, error } = await (
        supabase.from("material_categories") as any
      )
        .update(data)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.materials.all });
      queryClient.invalidateQueries({
        queryKey: ["materials", "categories", "tree"],
      });
    },
  });
}

/**
 * Delete (soft delete) a material category
 * Reassigns all materials in this category to "Miscellaneous" category
 */
export function useDeleteMaterialCategory() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // First, find or create the "Miscellaneous" category
      let { data: miscCategory } = await supabase
        .from("material_categories")
        .select("id")
        .eq("name", "Miscellaneous")
        .eq("is_active", true)
        .single();

      if (!miscCategory) {
        // Create Miscellaneous category if it doesn't exist
        const { data: newMisc, error: createError } = await (
          supabase.from("material_categories") as any
        )
          .insert({
            name: "Miscellaneous",
            code: "MISC",
            description: "Default category for unassigned materials",
            display_order: 999,
            is_active: true,
          })
          .select()
          .single();

        if (createError) throw createError;
        miscCategory = newMisc;
      }

      if (!miscCategory) throw new Error("Failed to get or create Miscellaneous category");

      // Reassign all materials in this category to Miscellaneous
      const { error: reassignError } = await supabase
        .from("materials")
        .update({ category_id: miscCategory.id })
        .eq("category_id", id);

      if (reassignError) throw reassignError;

      // Soft delete the category
      const { error } = await supabase
        .from("material_categories")
        .update({ is_active: false })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.materials.all });
      queryClient.invalidateQueries({
        queryKey: ["materials", "categories", "tree"],
      });
      queryClient.invalidateQueries({ queryKey: ["materials"] });
    },
  });
}

// ============================================
// MATERIALS
// ============================================

/**
 * Standalone fetch — usable outside React hooks (e.g. queryClient.prefetchQuery / fetchQuery).
 * Returns the full material list with category + brands, keyed by queryKeys.materials.list().
 */
export async function fetchMaterialCatalog(): Promise<MaterialWithDetails[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("materials")
    .select(
      `
      *,
      category:material_categories(id, name, code),
      brands:material_brands(id, brand_name, variant_name, is_preferred, quality_rating, image_url, is_active)
    `
    )
    .eq("is_active", true)
    .order("name");
  if (error) throw error;

  const materials = data as unknown as MaterialWithDetails[];
  const parentIds = [...new Set(materials.filter(m => m.parent_id).map(m => m.parent_id!))];

  if (parentIds.length > 0) {
    const { data: parents } = await supabase
      .from("materials")
      .select("id, name, code")
      .in("id", parentIds);

    const parentMap = new Map(parents?.map(p => [p.id, p]) || []);
    for (const m of materials) {
      if (m.parent_id) {
        m.parent_material = parentMap.get(m.parent_id) || null;
      }
    }
  }

  return materials;
}

/**
 * Fetch all materials with optional category filter
 * Includes parent material info for variants
 */
export function useMaterials(categoryId?: string | null) {
  return useQuery({
    queryKey: categoryId
      ? [...queryKeys.materials.list(), categoryId]
      : queryKeys.materials.list(),
    queryFn: wrapQueryFn(async () => {
      const materials = await fetchMaterialCatalog();
      if (categoryId) {
        return materials.filter(m => m.category_id === categoryId);
      }
      return materials;
    }, { operationName: "useMaterials" }),
  });
}

/**
 * Extract base name from material name by removing common variant suffixes
 * Examples: "TMT Bar 8mm" -> "TMT Bar", "AAC Blocks 4 inch" -> "AAC Blocks"
 */
function extractBaseName(name: string): { baseName: string; variantPart: string } {
  // Common variant patterns to detect at the end of material names
  const variantPatterns = [
    // Size with unit: "8mm", "10mm", "12mm", "16mm", "20mm", "25mm", "32mm"
    /\s+(\d+(?:\.\d+)?)\s*(mm|cm|m|inch|inches|"|'|ft|feet)$/i,
    // Fraction sizes: "1/2 inch", "3/4 inch"
    /\s+(\d+\/\d+)\s*(inch|inches|"|')$/i,
    // Size without unit at end: "4 inch", "6 inch", "8 inch"
    /\s+(\d+)\s+(inch|inches)$/i,
    // Dimension patterns: "4x4", "6x6", "12x12"
    /\s+(\d+x\d+)$/i,
    // Weight/size descriptors: "40mm (Chips)", "12mm (Chips)"
    /\s+(\d+(?:\.\d+)?mm)\s*\([^)]+\)$/i,
    // Simple number at end: "Type 1", "Grade 2" (less aggressive)
    /\s+(Type\s+\d+|Grade\s+\d+)$/i,
  ];

  for (const pattern of variantPatterns) {
    const match = name.match(pattern);
    if (match) {
      const variantPart = match[0].trim();
      const baseName = name.slice(0, name.length - match[0].length).trim();
      if (baseName.length > 0) {
        return { baseName, variantPart };
      }
    }
  }

  return { baseName: name, variantPart: '' };
}

/**
 * Fetch materials grouped by parent (for hierarchical display)
 * Supports both explicit parent_id relationships AND smart name-based grouping
 * Returns parent materials with variant_count and parent-first sorting
 */
export function useMaterialsGrouped(categoryId?: string | null) {
  const supabase = createClient();

  return useQuery({
    queryKey: categoryId
      ? ["materials", "grouped", categoryId]
      : ["materials", "grouped"],
    queryFn: async () => {
      let query = supabase
        .from("materials")
        .select(
          `
          *,
          category:material_categories(id, name, code),
          brands:material_brands(id, brand_name, variant_name, is_preferred, quality_rating, image_url, is_active)
        `
        )
        .eq("is_active", true);

      if (categoryId) {
        query = query.eq("category_id", categoryId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const materials = data as unknown as MaterialWithDetails[];

      // First: Handle explicit parent-child relationships (parent_id is set)
      const explicitParentsMap = new Map<string, MaterialWithDetails>();
      const explicitVariantsByParent = new Map<string, MaterialWithDetails[]>();
      const materialsWithoutExplicitParent: MaterialWithDetails[] = [];

      for (const material of materials) {
        if (material.parent_id) {
          // This material has an explicit parent
          const variants = explicitVariantsByParent.get(material.parent_id) || [];
          variants.push(material);
          explicitVariantsByParent.set(material.parent_id, variants);
        } else {
          materialsWithoutExplicitParent.push(material);
        }
      }

      // Attach explicit variants to their parents
      for (const material of materialsWithoutExplicitParent) {
        const variants = explicitVariantsByParent.get(material.id);
        if (variants && variants.length > 0) {
          explicitParentsMap.set(material.id, {
            ...material,
            variants: variants.sort((a, b) => a.name.localeCompare(b.name)),
            variant_count: variants.length,
          });
        }
      }

      // Second: Smart grouping for materials without explicit parent_id
      // Group by detected base name pattern within the same category
      const materialsToSmartGroup = materialsWithoutExplicitParent.filter(
        m => !explicitParentsMap.has(m.id)
      );

      // Group by category + base name
      const smartGroupMap = new Map<string, MaterialWithDetails[]>();

      for (const material of materialsToSmartGroup) {
        const { baseName, variantPart } = extractBaseName(material.name);
        // Only group if we detected a variant part and category matches
        if (variantPart) {
          const groupKey = `${material.category_id || 'none'}::${baseName.toLowerCase()}`;
          const group = smartGroupMap.get(groupKey) || [];
          group.push({ ...material, _detectedBaseName: baseName, _detectedVariant: variantPart } as any);
          smartGroupMap.set(groupKey, group);
        }
      }

      // Convert smart groups to parent-variant structure
      const smartGroupedMaterials: MaterialWithDetails[] = [];
      const alreadyGroupedIds = new Set<string>();

      for (const [groupKey, groupMaterials] of smartGroupMap) {
        if (groupMaterials.length >= 2) {
          // Create a virtual parent from the first material's properties
          const firstMaterial = groupMaterials[0];
          const baseName = (firstMaterial as any)._detectedBaseName;

          // Mark all materials in this group as grouped
          groupMaterials.forEach(m => alreadyGroupedIds.add(m.id));

          // Create virtual parent entry (use first material as base, modify name)
          const virtualParent: MaterialWithDetails = {
            ...firstMaterial,
            id: `group_${groupKey}`, // Virtual ID for grouping
            name: baseName,
            code: null, // No code for virtual parent
            variants: groupMaterials.sort((a, b) => {
              // Sort variants by the variant part (size)
              const aVariant = (a as any)._detectedVariant || '';
              const bVariant = (b as any)._detectedVariant || '';
              // Try numeric sort first
              const aNum = parseFloat(aVariant.replace(/[^\d.]/g, ''));
              const bNum = parseFloat(bVariant.replace(/[^\d.]/g, ''));
              if (!isNaN(aNum) && !isNaN(bNum)) {
                return aNum - bNum;
              }
              return aVariant.localeCompare(bVariant);
            }),
            variant_count: groupMaterials.length,
            _isVirtualParent: true, // Flag to identify virtual parents
          } as any;

          smartGroupedMaterials.push(virtualParent);
        }
      }

      // Collect all results: explicit parents + smart groups + ungrouped standalones
      const result: MaterialWithDetails[] = [];

      // Add explicit parents (with their variants)
      for (const parent of explicitParentsMap.values()) {
        result.push(parent);
      }

      // Add smart-grouped materials
      result.push(...smartGroupedMaterials);

      // Add standalone materials (not grouped)
      for (const material of materialsToSmartGroup) {
        if (!alreadyGroupedIds.has(material.id)) {
          result.push(material);
        }
      }

      // Sort: groups with variants first, then standalones, alphabetically
      return result.sort((a, b) => {
        const aHasVariants = (a.variant_count || 0) > 0;
        const bHasVariants = (b.variant_count || 0) > 0;
        if (aHasVariants !== bHasVariants) {
          return aHasVariants ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
    },
  });
}

/**
 * Build searchable terms for a material
 * Includes name, code, local_name, and brand names
 */
function buildSearchTerms(
  material: MaterialWithDetails,
  parent?: MaterialWithDetails
): string[] {
  const terms: string[] = [];

  // Add material name and code
  terms.push(material.name.toLowerCase());
  if (material.code) {
    terms.push(material.code.toLowerCase());
  }
  if (material.local_name) {
    terms.push(material.local_name.toLowerCase());
  }

  // Add brand names as searchable terms
  if (material.brands) {
    for (const brand of material.brands) {
      if (brand.is_active) {
        terms.push(brand.brand_name.toLowerCase());
        if (brand.variant_name) {
          terms.push(`${brand.brand_name} ${brand.variant_name}`.toLowerCase());
        }
      }
    }
  }

  // For variants, also include parent name for combined search
  if (parent) {
    terms.push(parent.name.toLowerCase());
    terms.push(`${parent.name} ${material.name}`.toLowerCase());
  }

  return terms;
}

/**
 * Fetch materials as flat search options for autocomplete
 * Includes materials, variants, and brands as separate searchable entries
 * Smart auto-fill: selecting a variant auto-fills material+variant,
 * selecting a brand auto-fills material+brand
 */
export function useMaterialSearchOptions(categoryId?: string | null) {
  const { data: groupedMaterials = [], ...rest } = useMaterialsGrouped(categoryId);

  const searchOptions = React.useMemo(() => {
    const options: MaterialSearchOption[] = [];

    for (const material of groupedMaterials) {
      const hasVariants = (material.variants?.length || 0) > 0;
      const activeBrands = material.brands?.filter((b) => b.is_active) || [];

      // Add the parent/standalone material as a searchable option
      options.push({
        id: `material_${material.id}`,
        type: "material",
        displayName: material.name,
        searchTerms: buildSearchTerms(material),
        material,
        variant: null,
        brand: null,
        contextLabel: hasVariants
          ? `${material.variants!.length} variants`
          : activeBrands.length > 0
          ? `${activeBrands.length} brands available`
          : material.unit,
        unit: material.unit,
        brandCount: activeBrands.length,
        variantCount: material.variants?.length || 0,
      });

      // For materials with variants, add each variant as a searchable option
      if (material.variants) {
        for (const variant of material.variants) {
          if (variant.is_active === false) continue;

          const variantBrands = variant.brands?.filter((b) => b.is_active) || [];

          // Add the variant as a searchable option
          options.push({
            id: `variant_${variant.id}`,
            type: "variant",
            displayName: variant.name,
            searchTerms: buildSearchTerms(variant, material),
            material,
            variant,
            brand: null,
            contextLabel: `Variant of ${material.name}`,
            unit: variant.unit,
            brandCount: variantBrands.length,
            variantCount: 0,
          });

          // Add brands for this variant as searchable options
          for (const brand of variantBrands) {
            const brandDisplayName = brand.variant_name
              ? `${brand.brand_name} ${brand.variant_name}`
              : brand.brand_name;

            options.push({
              id: `brand_${brand.id}`,
              type: "brand",
              displayName: `${variant.name} - ${brandDisplayName}`,
              searchTerms: [
                brand.brand_name.toLowerCase(),
                brandDisplayName.toLowerCase(),
                `${variant.name} ${brand.brand_name}`.toLowerCase(),
                `${material.name} ${brand.brand_name}`.toLowerCase(),
                variant.name.toLowerCase(),
              ],
              material,
              variant,
              brand,
              contextLabel: `${brandDisplayName} brand of ${variant.name}`,
              unit: variant.unit,
              brandCount: 0,
              variantCount: 0,
            });
          }
        }
      }

      // For materials without variants, add brands directly
      if (!hasVariants) {
        for (const brand of activeBrands) {
          const brandDisplayName = brand.variant_name
            ? `${brand.brand_name} ${brand.variant_name}`
            : brand.brand_name;

          options.push({
            id: `brand_${brand.id}`,
            type: "brand",
            displayName: `${material.name} - ${brandDisplayName}`,
            searchTerms: [
              brand.brand_name.toLowerCase(),
              brandDisplayName.toLowerCase(),
              `${material.name} ${brand.brand_name}`.toLowerCase(),
              material.name.toLowerCase(),
            ],
            material,
            variant: null,
            brand,
            contextLabel: `${brandDisplayName} brand of ${material.name}`,
            unit: material.unit,
            brandCount: 0,
            variantCount: 0,
          });
        }
      }
    }

    return options;
  }, [groupedMaterials]);

  return { data: searchOptions, groupedMaterials, ...rest };
}

/**
 * Custom filter function for material search options
 * Supports multi-word search across all search terms
 */
export function filterMaterialSearchOptions(
  options: MaterialSearchOption[],
  inputValue: string
): MaterialSearchOption[] {
  const searchTerm = inputValue.toLowerCase().trim();
  if (!searchTerm) {
    // When no search, only show materials (not variants/brands) to reduce clutter
    return options.filter((opt) => opt.type === "material");
  }

  // Split search into words for multi-word matching
  const searchWords = searchTerm.split(/\s+/).filter((w) => w.length > 0);

  const filtered = options.filter((option) => {
    // Check if ALL search words match at least one search term
    return searchWords.every((word) =>
      option.searchTerms.some((term) => term.includes(word))
    );
  });

  // Sort results: prioritize exact/starts-with matches, then by type
  return filtered.sort((a, b) => {
    // Prioritize exact name matches
    const aExact = a.displayName.toLowerCase() === searchTerm;
    const bExact = b.displayName.toLowerCase() === searchTerm;
    if (aExact !== bExact) return aExact ? -1 : 1;

    // Then prioritize starts-with matches
    const aStarts = a.displayName.toLowerCase().startsWith(searchTerm);
    const bStarts = b.displayName.toLowerCase().startsWith(searchTerm);
    if (aStarts !== bStarts) return aStarts ? -1 : 1;

    // Prioritize materials over variants over brands
    const typeOrder = { material: 0, variant: 1, brand: 2 };
    if (a.type !== b.type) {
      return typeOrder[a.type] - typeOrder[b.type];
    }

    return a.displayName.localeCompare(b.displayName);
  });
}

/**
 * Fetch parent materials (materials that can have variants)
 * Excludes materials that are already variants
 */
export function useParentMaterials() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["materials", "parents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("materials")
        .select("id, name, code, unit, category_id")
        .eq("is_active", true)
        .is("parent_id", null) // Only materials that are not variants
        .order("name");

      if (error) throw error;
      return data as Pick<Material, "id" | "name" | "code" | "unit" | "category_id">[];
    },
  });
}

/**
 * Pagination parameters for server-side pagination
 */
export interface PaginationParams {
  pageIndex: number;
  pageSize: number;
}

/**
 * Paginated result with total count
 */
export interface PaginatedResult<T> {
  data: T[];
  totalCount: number;
  pageCount: number;
}

/**
 * Sort options for paginated materials
 */
export type MaterialSortOption = "alphabetical" | "recently_added" | "frequently_used" | "most_vendors" | "lowest_price";

/**
 * Fetch materials with server-side pagination
 * Use this for large datasets where client-side pagination is not efficient
 */
export function usePaginatedMaterials(
  pagination: PaginationParams,
  categoryIds?: string[] | null,
  searchTerm?: string,
  sortBy: MaterialSortOption = "alphabetical"
) {
  const supabase = createClient();
  const { pageIndex, pageSize } = pagination;
  const offset = pageIndex * pageSize;

  return useQuery({
    queryKey: ["materials", "paginated", { pageIndex, pageSize, categoryIds, searchTerm, sortBy }],
    queryFn: wrapQueryFn<PaginatedResult<MaterialWithDetails>>(async () => {
      // First, get total count
      let countQuery = supabase
        .from("materials")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true)
        .is("parent_id", null); // Only parent materials (exclude variants)

      if (categoryIds && categoryIds.length > 0) {
        countQuery = countQuery.in("category_id", categoryIds);
      }

      if (searchTerm && searchTerm.length >= 2) {
        countQuery = countQuery.or(
          `name.ilike.%${searchTerm}%,code.ilike.%${searchTerm}%,local_name.ilike.%${searchTerm}%`
        );
      }

      const { count: totalCount, error: countError } = await countQuery;
      if (countError) throw countError;

      // Then, get paginated data
      let dataQuery = supabase
        .from("materials")
        .select(
          `
          *,
          category:material_categories(id, name, code),
          brands:material_brands(id, brand_name, variant_name, is_preferred, quality_rating, image_url, is_active)
        `
        )
        .eq("is_active", true)
        .is("parent_id", null); // Only parent materials (exclude variants)

      // Apply server-side sorting (only alphabetical and recently_added can be done server-side)
      // Other sort options require client-side sorting with supplementary data
      if (sortBy === "recently_added") {
        dataQuery = dataQuery.order("created_at", { ascending: false });
      } else {
        // Default to alphabetical
        dataQuery = dataQuery.order("name", { ascending: true });
      }

      dataQuery = dataQuery.range(offset, offset + pageSize - 1);

      if (categoryIds && categoryIds.length > 0) {
        dataQuery = dataQuery.in("category_id", categoryIds);
      }

      if (searchTerm && searchTerm.length >= 2) {
        dataQuery = dataQuery.or(
          `name.ilike.%${searchTerm}%,code.ilike.%${searchTerm}%,local_name.ilike.%${searchTerm}%`
        );
      }

      const { data, error: dataError } = await dataQuery;
      if (dataError) throw dataError;

      // Fetch variant counts for each parent material
      const materialIds = data?.map((m: any) => m.id) || [];
      let variantCountsMap: Record<string, number> = {};

      if (materialIds.length > 0) {
        const { data: variantData } = await supabase
          .from("materials")
          .select("parent_id")
          .in("parent_id", materialIds)
          .eq("is_active", true);

        // Count variants per parent
        (variantData || []).forEach((v: { parent_id: string | null }) => {
          if (v.parent_id) {
            variantCountsMap[v.parent_id] = (variantCountsMap[v.parent_id] || 0) + 1;
          }
        });
      }

      // Attach variant count to materials
      const materialsWithVariantCount = (data || []).map((m: any) => ({
        ...m,
        variant_count: variantCountsMap[m.id] || 0,
      })) as MaterialWithDetails[];

      return {
        data: materialsWithVariantCount,
        totalCount: totalCount || 0,
        pageCount: Math.ceil((totalCount || 0) / pageSize),
      };
    }, { operationName: "usePaginatedMaterials" }),
    placeholderData: (previousData) => previousData, // Keep previous data while loading
  });
}

/**
 * Fetch a single material by ID
 */
export function useMaterial(id: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: id
      ? queryKeys.materials.byId(id)
      : [...queryKeys.materials.all, "unknown"],
    queryFn: async () => {
      if (!id) return null;

      const { data, error } = await supabase
        .from("materials")
        .select(
          `
          *,
          category:material_categories(id, name, code),
          brands:material_brands(id, brand_name, variant_name, is_preferred, quality_rating, notes, image_url, is_active)
        `
        )
        .eq("id", id)
        .single();

      if (error) throw error;

      const material = data as unknown as MaterialWithDetails;

      // Fetch parent material if this is a variant
      if (material.parent_id) {
        const { data: parent } = await supabase
          .from("materials")
          .select("id, name, code")
          .eq("id", material.parent_id)
          .single();

        material.parent_material = parent || null;
      }

      return material;
    },
    enabled: !!id,
  });
}

/**
 * Search materials by name or code
 */
export function useMaterialSearch(searchTerm: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["materials", "search", searchTerm],
    queryFn: async () => {
      if (!searchTerm || searchTerm.length < 2) return [];

      const { data, error } = await supabase
        .from("materials")
        .select(
          `
          id, name, code, unit, reorder_level,
          category:material_categories(id, name)
        `
        )
        .eq("is_active", true)
        .or(`name.ilike.%${searchTerm}%,code.ilike.%${searchTerm}%`)
        .limit(20);

      if (error) throw error;
      return data;
    },
    enabled: searchTerm.length >= 2,
  });
}

/**
 * Create a new material
 */
/**
 * Generate a material code from the name
 * Format: First 3 letters (uppercase) + 4-digit sequence
 * Example: CEM-0001 for Cement, STL-0001 for Steel
 */
async function generateMaterialCode(
  supabase: ReturnType<typeof createClient>,
  name: string
): Promise<string> {
  // Get prefix from name (first 3 letters, uppercase)
  const prefix = name
    .replace(/[^a-zA-Z]/g, "")
    .substring(0, 3)
    .toUpperCase()
    .padEnd(3, "X");

  // Get count of materials with same prefix
  const { count } = await (supabase as any)
    .from("materials")
    .select("*", { count: "exact", head: true })
    .ilike("code", `${prefix}-%`);

  const sequence = ((count || 0) + 1).toString().padStart(4, "0");
  return `${prefix}-${sequence}`;
}

export function useCreateMaterial() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: MaterialFormData) => {
      // Ensure fresh session before mutation to prevent stale token issues
      await ensureFreshSession();

      // Auto-generate code if not provided
      let code = data.code?.trim() || null;
      if (!code) {
        code = await generateMaterialCode(supabase, data.name);
      }

      // Clean data: convert empty strings to null for UUID fields
      const cleanData = {
        ...data,
        code,
        local_name: data.local_name?.trim() || null,
        category_id: data.category_id?.trim() || null,
        parent_id: data.parent_id?.trim() || null,
        description: data.description?.trim() || null,
        hsn_code: data.hsn_code?.trim() || null,
      };

      const { data: result, error } = await (supabase.from("materials") as any)
        .insert(cleanData)
        .select()
        .single();

      if (error) throw error;
      return result as Material;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["materials"] });
    },
  });
}

/**
 * Update an existing material
 */
export function useUpdateMaterial() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<MaterialFormData>;
    }) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      // Clean data: convert empty strings to null for UUID/optional fields
      const cleanData: Record<string, unknown> = {
        ...data,
        updated_at: new Date().toISOString(),
      };

      // Only clean fields that are present in the update
      if ("code" in data) cleanData.code = data.code?.trim() || null;
      if ("local_name" in data) cleanData.local_name = data.local_name?.trim() || null;
      if ("category_id" in data) cleanData.category_id = data.category_id?.trim() || null;
      if ("parent_id" in data) cleanData.parent_id = data.parent_id?.trim() || null;
      if ("description" in data) cleanData.description = data.description?.trim() || null;
      if ("hsn_code" in data) cleanData.hsn_code = data.hsn_code?.trim() || null;

      const { data: result, error } = await (supabase.from("materials") as any)
        .update(cleanData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return result as Material;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["materials"] });
      queryClient.invalidateQueries({ queryKey: ["material", variables.id] });
    },
  });
}

/**
 * Delete (soft delete) a material
 */
export function useDeleteMaterial() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      const { data, error } = await supabase
        .from("materials")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        throw new Error("Failed to delete material. You may not have permission to perform this action.");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["materials"] });
    },
  });
}

// ============================================
// MATERIAL BRANDS
// ============================================

/**
 * Fetch brands for a material
 */
export function useMaterialBrands(materialId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["materialBrands", materialId],
    queryFn: async () => {
      if (!materialId) return [];

      const { data, error } = await supabase
        .from("material_brands")
        .select("*")
        .eq("material_id", materialId)
        .eq("is_active", true)
        .order("brand_name");

      if (error) throw error;
      return data as MaterialBrand[];
    },
    enabled: !!materialId,
  });
}

export function useBrandVariantLinks(materialId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["brandVariantLinks", materialId],
    queryFn: async () => {
      if (!materialId) return [] as BrandWithVariantLinks[];

      const { data, error } = await supabase
        .from("material_brands")
        .select(
          `id, brand_name, is_preferred, quality_rating, notes, image_url,
           material_brand_variant_links(id, brand_id, variant_id, is_active, image_url, created_at)`
        )
        .eq("material_id", materialId)
        .eq("is_active", true)
        .order("brand_name");

      if (error) throw error;
      return data as unknown as BrandWithVariantLinks[];
    },
    enabled: !!materialId,
  });
}

export function useToggleBrandVariantLink() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      brandId,
      variantId,
      isActive,
      materialId,
    }: {
      brandId: string;
      variantId: string;
      isActive: boolean;
      materialId: string;
    }) => {
      await ensureFreshSession();

      const { data, error } = await (supabase as any)
        .from("material_brand_variant_links")
        .upsert(
          { brand_id: brandId, variant_id: variantId, is_active: isActive },
          { onConflict: "brand_id,variant_id" }
        )
        .select()
        .single();

      if (error) throw error;
      return data as MaterialBrandVariantLink;
    },
    onSuccess: (_, { materialId }) => {
      queryClient.invalidateQueries({
        queryKey: ["brandVariantLinks", materialId],
      });
      queryClient.invalidateQueries({ queryKey: ["brandVariantLinkedBrandNames"] });
    },
  });
}

export function useUpsertBrandVariantLinkImage() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      brandId,
      variantId,
      imageUrl,
      materialId,
    }: {
      brandId: string;
      variantId: string;
      imageUrl: string | null;
      materialId: string;
    }) => {
      await ensureFreshSession();

      const { data, error } = await (supabase as any)
        .from("material_brand_variant_links")
        .upsert(
          { brand_id: brandId, variant_id: variantId, image_url: imageUrl },
          { onConflict: "brand_id,variant_id" }
        )
        .select()
        .single();

      if (error) throw error;
      return data as MaterialBrandVariantLink;
    },
    onSuccess: (_, { materialId }) => {
      queryClient.invalidateQueries({
        queryKey: ["brandVariantLinks", materialId],
      });
      queryClient.invalidateQueries({ queryKey: ["materials"] });
    },
  });
}

/**
 * Returns brand names linked to a specific variant material.
 * Returns null when variantId is falsy (show all brands).
 * Returns null when no links exist yet (edge case: pre-migration or new variant).
 */
export function useBrandVariantLinkedBrandNames(variantId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["brandVariantLinkedBrandNames", variantId],
    queryFn: async () => {
      if (!variantId) return null;

      const { data, error } = await (supabase as any)
        .from("material_brand_variant_links")
        .select("material_brands!brand_id(brand_name)")
        .eq("variant_id", variantId)
        .eq("is_active", true);

      if (error) throw error;
      if (!data || data.length === 0) return null; // no links → show all brands
      return data.map((r: any) => r.material_brands.brand_name as string);
    },
    enabled: !!variantId,
  });
}

/**
 * Create a new material brand
 * If an inactive brand with the same name exists, reactivate it instead of inserting
 */
export function useCreateMaterialBrand() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: MaterialBrandFormData) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      // Check for existing inactive brand with same material_id, brand_name, variant_name
      // This handles the case where a brand was soft-deleted and user tries to re-add it
      let query = supabase
        .from("material_brands")
        .select("id")
        .eq("material_id", data.material_id)
        .eq("brand_name", data.brand_name)
        .eq("is_active", false);

      // Handle null variant_name comparison correctly
      if (data.variant_name === null || data.variant_name === undefined) {
        query = query.is("variant_name", null);
      } else {
        query = query.eq("variant_name", data.variant_name);
      }

      const { data: existing } = await query.maybeSingle();

      if (existing) {
        // Reactivate existing brand instead of inserting
        const { data: result, error } = await supabase
          .from("material_brands")
          .update({
            is_active: true,
            is_preferred: data.is_preferred || false,
          })
          .eq("id", existing.id)
          .select()
          .single();

        if (error) throw error;

        // Ensure links exist for all active variants (re-activate or create)
        const { data: variants } = await supabase
          .from("materials")
          .select("id")
          .eq("parent_id", data.material_id)
          .eq("is_active", true);

        if (variants && variants.length > 0) {
          await (supabase as any)
            .from("material_brand_variant_links")
            .upsert(
              variants.map((v) => ({
                brand_id: result.id,
                variant_id: v.id,
                is_active: true,
              })),
              { onConflict: "brand_id,variant_id" }
            )
            .throwOnError();
        }

        return result as MaterialBrand;
      }

      // Insert new brand
      const { data: result, error } = await supabase
        .from("material_brands")
        .insert(data)
        .select()
        .single();

      if (error) throw error;

      // Auto-link new brand to all existing active variants of this material
      const { data: variants } = await supabase
        .from("materials")
        .select("id")
        .eq("parent_id", data.material_id)
        .eq("is_active", true);

      if (variants && variants.length > 0) {
        await (supabase as any)
          .from("material_brand_variant_links")
          .insert(
            variants.map((v) => ({
              brand_id: result.id,
              variant_id: v.id,
              is_active: true,
            }))
          )
          .throwOnError();
      }

      return result as MaterialBrand;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["materialBrands", variables.material_id],
      });
      queryClient.invalidateQueries({
        queryKey: ["material", variables.material_id],
      });
      queryClient.invalidateQueries({ queryKey: ["materials"] });
    },
  });
}

/**
 * Update a material brand
 */
export function useUpdateMaterialBrand() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<MaterialBrandFormData>;
    }) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      const { data: result, error } = await supabase
        .from("material_brands")
        .update(data)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return result as MaterialBrand;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: ["materialBrands", result.material_id],
      });
      queryClient.invalidateQueries({
        queryKey: ["material", result.material_id],
      });
      queryClient.invalidateQueries({ queryKey: ["materials"] });
    },
  });
}

/**
 * Delete a material brand
 */
export function useDeleteMaterialBrand() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      id,
      materialId,
    }: {
      id: string;
      materialId: string;
    }) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      const { error } = await supabase
        .from("material_brands")
        .update({ is_active: false })
        .eq("id", id);

      if (error) throw error;
      return { id, materialId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: ["materialBrands", result.materialId],
      });
      queryClient.invalidateQueries({
        queryKey: ["brandVariantLinks", result.materialId],
      });
      queryClient.invalidateQueries({
        queryKey: ["material", result.materialId],
      });
      queryClient.invalidateQueries({ queryKey: ["materials"] });
    },
  });
}

// ============================================
// MATERIAL VARIANTS
// ============================================

/**
 * Create a material with variants in one transaction
 * Creates the parent material first, then all variants with the same parent_id
 */
export function useCreateMaterialWithVariants() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: CreateMaterialWithVariantsData) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      const { variants, ...parentData } = data;

      // Generate parent code if not provided
      let code = parentData.code?.trim() || null;
      if (!code) {
        code = await generateMaterialCode(supabase, parentData.name);
      }

      // Clean parent data
      const cleanParentData = {
        ...parentData,
        code,
        local_name: parentData.local_name?.trim() || null,
        category_id: parentData.category_id?.trim() || null,
        parent_id: null, // Parent materials should not have a parent
        description: parentData.description?.trim() || null,
        hsn_code: parentData.hsn_code?.trim() || null,
      };

      // Create parent material
      const { data: parent, error: parentError } = await (
        supabase.from("materials") as any
      )
        .insert(cleanParentData)
        .select()
        .single();

      if (parentError) throw parentError;

      // Create variants if any
      if (variants && variants.length > 0) {
        const variantsToInsert = variants.map((v, index) => {
          const variantCode =
            v.code?.trim() ||
            `${code}-V${(index + 1).toString().padStart(2, "0")}`;
          return {
            name: v.name.trim(),
            code: variantCode,
            local_name: v.local_name?.trim() || null,
            parent_id: parent.id,
            category_id: parentData.category_id?.trim() || null,
            unit: parentData.unit,
            hsn_code: parentData.hsn_code?.trim() || null,
            gst_rate: parentData.gst_rate,
            // Legacy fields for backward compatibility
            weight_per_unit: v.weight_per_unit,
            weight_unit: parentData.weight_unit || "kg",
            length_per_piece: v.length_per_piece,
            length_unit: parentData.length_unit || "m",
            rods_per_bundle: v.rods_per_bundle,
            // Dynamic specifications based on category template
            specifications: v.specifications || null,
          };
        });

        const { data: createdVariants, error: variantError } = await (supabase.from("materials") as any)
          .insert(variantsToInsert)
          .select("id");

        if (variantError) throw variantError;

        // Auto-link all existing active brands of the parent material to each new variant
        if (createdVariants && createdVariants.length > 0) {
          const { data: brands } = await supabase
            .from("material_brands")
            .select("id")
            .eq("material_id", parent.id)
            .eq("is_active", true);

          if (brands && brands.length > 0) {
            const links = createdVariants.flatMap((v: { id: string }) =>
              brands.map((b) => ({
                brand_id: b.id,
                variant_id: v.id,
                is_active: true,
              }))
            );
            await (supabase as any)
              .from("material_brand_variant_links")
              .insert(links)
              .throwOnError();
          }
        }
      }

      return parent as Material;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["materials"] });
    },
  });
}

/**
 * Add a variant to an existing parent material
 */
export function useAddVariantToMaterial() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      parentId,
      variant,
    }: {
      parentId: string;
      variant: VariantFormData;
    }) => {
      // Ensure fresh session before mutation
      await ensureFreshSession();

      // Get parent material for inherited fields
      const { data: parent, error: parentError } = await supabase
        .from("materials")
        .select("*")
        .eq("id", parentId)
        .single();

      if (parentError) throw parentError;
      if (!parent) throw new Error("Parent material not found");

      // Cast parent to access all fields including new weight columns
      const parentMaterial = parent as unknown as Material;

      // Get count of existing variants to generate code
      const { count } = await supabase
        .from("materials")
        .select("*", { count: "exact", head: true })
        .eq("parent_id", parentId);

      const variantCode =
        variant.code?.trim() ||
        `${parentMaterial.code}-V${((count || 0) + 1).toString().padStart(2, "0")}`;

      const { data: result, error } = await (supabase.from("materials") as any)
        .insert({
          name: variant.name.trim(),
          code: variantCode,
          local_name: variant.local_name?.trim() || null,
          parent_id: parentId,
          category_id: parentMaterial.category_id,
          unit: parentMaterial.unit,
          hsn_code: parentMaterial.hsn_code,
          gst_rate: parentMaterial.gst_rate,
          // Legacy fields for backward compatibility
          weight_per_unit: variant.weight_per_unit,
          weight_unit: parentMaterial.weight_unit || "kg",
          length_per_piece: variant.length_per_piece,
          length_unit: parentMaterial.length_unit || "m",
          rods_per_bundle: variant.rods_per_bundle,
          // Dynamic specifications based on category template
          specifications: variant.specifications || null,
          // Variant image (from gallery picker)
          image_url: variant.image_url ?? null,
        })
        .select()
        .single();

      if (error) throw error;

      // Auto-link all existing active brands of the parent material to this new variant
      const { data: brands } = await supabase
        .from("material_brands")
        .select("id")
        .eq("material_id", parentId)
        .eq("is_active", true);

      if (brands && brands.length > 0) {
        await (supabase as any)
          .from("material_brand_variant_links")
          .insert(
            brands.map((b) => ({
              brand_id: b.id,
              variant_id: result.id,
              is_active: true,
            }))
          )
          .throwOnError();
      }

      // Optional first-vendor quote chained from the inline Add Variant card.
      // Variants are first-class materials (parent_id != null), so the vendor
      // price row points at the new variant's id via material_id — same shape
      // as AddVendorToMaterialDialog uses for variant-supplying vendors.
      if (variant.initial_vendor_id && variant.initial_vendor_price && variant.initial_vendor_price > 0) {
        const { error: invErr } = await (supabase as any)
          .from("vendor_inventory")
          .insert({
            vendor_id: variant.initial_vendor_id,
            material_id: result.id,
            current_price: variant.initial_vendor_price,
            unit: parentMaterial.unit,
            gst_rate: parentMaterial.gst_rate ?? 18,
            price_includes_gst: true,
            price_includes_transport: true,
            is_available: true,
            min_order_qty: 1,
            lead_time_days: 1,
            notes: variant.initial_vendor_notes?.trim() || null,
            last_price_update: new Date().toISOString(),
          });
        if (invErr) {
          // Don't fail the whole variant create — the variant is in, the price
          // just didn't land. Surface to console; the user can re-attach via
          // the Vendors tab.
          console.error("Failed to insert initial vendor quote:", invErr);
        }
      }

      return result as Material;
    },
    onSuccess: (newVariant, variables) => {
      // Immediately inject the new variant so the dialog shows it without waiting for refetch
      queryClient.setQueryData<MaterialWithDetails[]>(
        ["materials", "variants", variables.parentId],
        (old = []) => [...old, newVariant as unknown as MaterialWithDetails]
      );
      queryClient.invalidateQueries({ queryKey: ["materials"] });
      queryClient.invalidateQueries({ queryKey: ["material", variables.parentId] });
      queryClient.invalidateQueries({
        queryKey: ["material", variables.parentId, "with-variants"],
      });
    },
  });
}

/**
 * Fetch variants for a parent material
 * Returns array of variant materials with their details
 */
export function useMaterialVariants(parentId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["materials", "variants", parentId],
    queryFn: async () => {
      if (!parentId) return [];

      const { data, error } = await supabase
        .from("materials")
        .select(
          `
          id, name, code, unit, image_url, parent_id, category_id, specifications,
          weight_per_unit, weight_unit,
          length_per_piece, length_unit,
          rods_per_bundle,
          gst_rate,
          brands:material_brands(id, brand_name, variant_name, is_preferred, image_url, is_active)
        `
        )
        .eq("parent_id", parentId)
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      return data as unknown as MaterialWithDetails[];
    },
    enabled: !!parentId,
  });
}

/**
 * Fetch material with all its variants
 */
export function useMaterialWithVariants(id: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["material", id, "with-variants"],
    queryFn: async () => {
      if (!id) return null;

      // Get main material
      const { data: material, error } = await supabase
        .from("materials")
        .select(
          `
          *,
          category:material_categories(id, name, code),
          brands:material_brands(id, brand_name, variant_name, is_preferred, quality_rating, notes, image_url, is_active)
        `
        )
        .eq("id", id)
        .single();

      if (error) throw error;

      const materialWithDetails = material as unknown as MaterialWithDetails;

      // Get variants if this is a parent material (not a variant itself)
      if (!materialWithDetails.parent_id) {
        const { data: variants } = await supabase
          .from("materials")
          .select(
            `
            *,
            brands:material_brands(id, brand_name, is_preferred, image_url, is_active)
          `
          )
          .eq("parent_id", id)
          .eq("is_active", true)
          .order("name");

        materialWithDetails.variants = (variants as unknown as MaterialWithDetails[]) || [];
        materialWithDetails.variant_count = materialWithDetails.variants.length;
      } else {
        // Fetch parent material info if this is a variant
        const { data: parent } = await supabase
          .from("materials")
          .select("id, name, code")
          .eq("id", materialWithDetails.parent_id)
          .single();

        materialWithDetails.parent_material = parent || null;
      }

      return materialWithDetails;
    },
    enabled: !!id,
  });
}
