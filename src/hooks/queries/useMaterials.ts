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
  ParentPackInput,
  MaterialSearchOption,
  BrandWithVariantLinks,
  MaterialBrandVariantLink,
  MaterialPack,
} from "@/types/material.types";

const MATERIAL_PACK_COLUMNS =
  "id, material_id, label, contents_qty, price, coverage, price_includes_gst, gst_rate, is_active, display_order, created_at, updated_at";

/**
 * Attach active `packs` to each material via a single separate query.
 * Resilient: if the material_packs table doesn't exist yet (pre-migration),
 * the error is swallowed and packs simply stay undefined — the catalog still
 * renders with its normal best-price display.
 */
async function attachMaterialPacks(
  supabase: ReturnType<typeof createClient>,
  materials: MaterialWithDetails[],
): Promise<void> {
  if (materials.length === 0) return;
  try {
    const { data, error } = await (supabase as any)
      .from("material_packs")
      .select(MATERIAL_PACK_COLUMNS)
      .eq("is_active", true);
    if (error || !data) return;
    const byMaterial = new Map<string, MaterialPack[]>();
    for (const pack of data as MaterialPack[]) {
      const list = byMaterial.get(pack.material_id) ?? [];
      list.push(pack);
      byMaterial.set(pack.material_id, list);
    }
    for (const m of materials) {
      const packs = byMaterial.get(m.id);
      if (packs) m.packs = packs;
    }
  } catch {
    // material_packs not migrated yet — leave packs undefined.
  }
}

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
 * Distinct brand names already used anywhere in the catalog. `material_brands`
 * is scoped per-material (no global brand table), so without this a user who
 * typed "MCP Tixolite" for one product gets no suggestion when adding another
 * — risking silent duplicates ("MCP Tixolite" vs "MCP-Tixolite"). Powers a
 * freeSolo Autocomplete; not a source of truth, just a typing aid.
 */
export function useDistinctBrandNames() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["materials", "brands", "distinct-names"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("material_brands")
        .select("brand_name")
        .eq("is_active", true)
        .order("brand_name");

      if (error) throw error;
      const names = new Set<string>();
      for (const row of (data ?? []) as { brand_name: string }[]) {
        const n = row.brand_name?.trim();
        if (n) names.add(n);
      }
      return Array.from(names);
    },
    staleTime: 5 * 60 * 1000,
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

  // Pack-only materials: attach standard can sizes via a SEPARATE query so the
  // catalog stays resilient if material_packs hasn't been migrated yet (the
  // table is tiny — only pack-only materials have rows).
  await attachMaterialPacks(supabase, materials);

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
 * Options for useMaterials.
 * Use `includeDrafts: true` on office/admin surfaces that need to see
 * draft (`is_draft=true`) materials (e.g. /company/materials, the spot
 * purchase form which lets supervisors re-pick their own quick-adds).
 * All other pickers (PO, requests, RecordPrice, etc.) keep the default
 * `false` so drafts don't pollute supervisor flows.
 */
export interface UseMaterialsOptions {
  categoryId?: string | null;
  includeDrafts?: boolean;
}

/**
 * Fetch all materials with optional category filter
 * Includes parent material info for variants
 *
 * Accepts either a legacy `categoryId` string for back-compat, or an
 * options object `{ categoryId?, includeDrafts? }`.
 */
export function useMaterials(
  options?: string | null | UseMaterialsOptions,
) {
  const normalized: UseMaterialsOptions =
    typeof options === "string" || options === null || options === undefined
      ? { categoryId: options ?? null }
      : options;
  const { categoryId = null, includeDrafts = false } = normalized;

  return useQuery({
    queryKey: [
      ...queryKeys.materials.list(),
      ...(categoryId ? [categoryId] : []),
      includeDrafts ? "withDrafts" : "noDrafts",
    ],
    queryFn: wrapQueryFn(async () => {
      const materials = await fetchMaterialCatalog();
      const afterDrafts = includeDrafts
        ? materials
        : materials.filter((m) => m.is_draft !== true);
      if (categoryId) {
        return afterDrafts.filter((m) => m.category_id === categoryId);
      }
      return afterDrafts;
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
 * Per-material parent lookup for the Material Hub filter.
 *
 * Returns a Map keyed by `material_id` → { parentId, parentName, selfName } for
 * every active material, so the Hub can roll grade/size variants up under their
 * parent (e.g. "TMT Rods 16mm" → "TMT Rods") when filtering. A standalone/root
 * material has `parentId === null`. Cheap (one `id,name,parent_id` query) and
 * cached like the other catalog reads.
 */
export interface MaterialParentInfo {
  parentId: string | null;
  parentName: string | null;
  selfName: string;
}

export function useMaterialParentMap() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["materials", "parent-map"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("materials")
        .select("id, name, parent_id")
        .eq("is_active", true);

      if (error) throw error;
      const rows = (data ?? []) as {
        id: string;
        name: string;
        parent_id: string | null;
      }[];
      const nameById = new Map(rows.map((r) => [r.id, r.name]));
      const map = new Map<string, MaterialParentInfo>();
      for (const r of rows) {
        map.set(r.id, {
          parentId: r.parent_id,
          parentName: r.parent_id ? nameById.get(r.parent_id) ?? null : null,
          selfName: r.name,
        });
      }
      return map;
    },
    staleTime: 5 * 60 * 1000,
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

      // Attach pack sizes so pack-only materials show honest per-can pricing
      // (resilient if material_packs isn't migrated yet).
      await attachMaterialPacks(supabase, materialsWithVariantCount);

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

      // Attach active packs (resilient if material_packs is not yet migrated).
      await attachMaterialPacks(supabase, [material]);

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
 * Toggle what a material's vendor price depends on, without opening the edit
 * dialog. Mirrors useSetMaterialSoldInPacks — the realisation that a flag is
 * wrong happens in the drawer while looking at a suspect price, and a flag that
 * costs a dialog round-trip to fix is a flag that stays wrong.
 */
export function useUpdateMaterialPriceScoping() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      materialId,
      priceVariesByBrand,
      priceVariesByVariant,
    }: {
      materialId: string;
      priceVariesByBrand?: boolean;
      priceVariesByVariant?: boolean;
    }) => {
      await ensureFreshSession();
      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (priceVariesByBrand !== undefined) {
        patch.price_varies_by_brand = priceVariesByBrand;
      }
      if (priceVariesByVariant !== undefined) {
        patch.price_varies_by_variant = priceVariesByVariant;
      }

      const { error } = await (supabase.from("materials") as any)
        .update(patch)
        .eq("id", materialId);
      if (error) throw error;
    },
    onSuccess: (_data, { materialId }) => {
      queryClient.invalidateQueries({ queryKey: ["materials"] });
      queryClient.invalidateQueries({ queryKey: ["material", materialId] });
      // The unscoped-quote count is derived from these flags server-side.
      queryClient.invalidateQueries({ queryKey: ["material-vendor-summary", materialId] });
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
 * Insert a set of variants (child materials) under an existing parent, wiring
 * up brand links, pack rows, the first vendor quote (vendor_inventory), and a
 * dated price_history quote row for the branded/pack flow. Shared by
 * useCreateMaterialWithVariants and useConvertMaterialToBranded so both paths
 * behave identically. The tile flow (no brand, no pack) is unaffected: no
 * packs, per-piece vendor price, and no price_history row.
 */
/**
 * Insert the generic PARENT's standard container/can sizes as `material_packs`
 * rows. These drive the request picker (order in whole cans) and the catalog
 * per-can price. Prices are left as passed (usually null → the card shows an
 * estimate from the cheapest variant's landed cost). Caller is responsible for
 * setting the parent's `sold_in_packs` flag.
 */
async function insertParentPacks(
  supabase: any,
  parentId: string,
  packs: {
    label?: string | null;
    contents_qty: number;
    price?: number | null;
    coverage?: string | null;
  }[],
  gstRate?: number
): Promise<void> {
  const rows = packs
    .filter((p) => p.contents_qty && p.contents_qty > 0)
    .map((p, i) => ({
      material_id: parentId,
      label: p.label?.trim() || `${p.contents_qty}`,
      contents_qty: p.contents_qty,
      price: p.price ?? null,
      coverage: p.coverage ?? null,
      price_includes_gst: true,
      gst_rate: gstRate ?? 0,
      display_order: i,
      is_active: true,
    }));
  if (rows.length === 0) return;
  const { error } = await supabase.from("material_packs").insert(rows);
  if (error) throw error;
}

/**
 * Per-base-unit price implied by a variant's packs, for the vendor_inventory/
 * price_history headline price. Picks the smallest priced pack (mirrors the
 * display-side rule in src/lib/materials/packs.ts's representativePack) so a
 * variant sold in both 20kg and 40kg bags still gets one coherent per-kg rate.
 */
function representativePackUnitPrice(packs?: ParentPackInput[] | null): number | null {
  const priced = (packs ?? []).filter(
    (p) => p.price != null && p.price > 0 && p.contents_qty > 0
  );
  if (priced.length === 0) return null;
  const rep = priced.reduce((best, p) => (p.contents_qty < best.contents_qty ? p : best));
  return rep.price! / rep.contents_qty;
}

async function insertBrandedVariants(
  supabase: any,
  params: {
    parentId: string;
    parentCode: string | null;
    unit: string;
    gstRate?: number;
    categoryId?: string | null;
    weightUnit?: string;
    lengthUnit?: string;
    hsnCode?: string | null;
    createdBrandId: string | null;
    brandName?: string | null;
    priceIncludesGst?: boolean;
    quoteRecordedDate?: string;
    variants: VariantFormData[];
  }
): Promise<void> {
  const {
    parentId,
    parentCode,
    unit,
    gstRate,
    categoryId,
    weightUnit,
    lengthUnit,
    hsnCode,
    createdBrandId,
    brandName,
    priceIncludesGst,
    quoteRecordedDate,
    variants,
  } = params;

  if (!variants || variants.length === 0) return;

  // Map each row back to its source VariantFormData by its (deterministic) code.
  const codeToVariant = new Map<string, VariantFormData>();
  const variantsToInsert = variants.map((v, index) => {
    const variantCode =
      v.code?.trim() || `${parentCode}-V${(index + 1).toString().padStart(2, "0")}`;
    codeToVariant.set(variantCode, v);
    return {
      name: v.name.trim(),
      code: variantCode,
      local_name: v.local_name?.trim() || null,
      parent_id: parentId,
      category_id: categoryId?.trim() || null,
      unit,
      hsn_code: hsnCode?.trim() || null,
      gst_rate: gstRate,
      weight_per_unit: v.weight_per_unit,
      weight_unit: weightUnit || "kg",
      length_per_piece: v.length_per_piece,
      length_unit: lengthUnit || "m",
      rods_per_bundle: v.rods_per_bundle,
      image_url: v.image_url ?? null,
      specifications: v.specifications || null,
      // Pack-priced branded variants are sold in fixed cans.
      sold_in_packs: !!(v.packs && v.packs.length > 0),
    };
  });

  const { data: createdVariants, error: variantError } = await supabase
    .from("materials")
    .insert(variantsToInsert)
    .select("id, code");
  if (variantError) throw variantError;
  if (!createdVariants || createdVariants.length === 0) return;

  // Auto-link all active brands of the parent to each new variant.
  const { data: brands } = await supabase
    .from("material_brands")
    .select("id")
    .eq("material_id", parentId)
    .eq("is_active", true);
  if (brands && brands.length > 0) {
    const links = (createdVariants as { id: string }[]).flatMap((v) =>
      brands.map((b: { id: string }) => ({
        brand_id: b.id,
        variant_id: v.id,
        is_active: true,
      }))
    );
    await supabase.from("material_brand_variant_links").insert(links).throwOnError();
  }

  const nowIso = new Date().toISOString();
  const recordedDate = quoteRecordedDate || nowIso.slice(0, 10);
  const incGst = priceIncludesGst ?? true;

  // Per-variant packs (branded products sold in fixed cans). Each entered
  // pack size becomes its own material_packs row; the vendor quote below is
  // derived from a single representative pack so downstream money math stays
  // per-base-unit even when a variant has multiple priced sizes.
  const packRows = (createdVariants as { id: string; code: string }[]).flatMap((cv) => {
    const src = codeToVariant.get(cv.code);
    const packs = (src?.packs ?? []).filter((p) => p.contents_qty > 0);
    return packs.map((p, j) => ({
      material_id: cv.id,
      label: p.label?.trim() || `${p.contents_qty} ${unit}`,
      contents_qty: p.contents_qty,
      price: p.price ?? null,
      coverage: p.coverage ?? null,
      price_includes_gst: incGst,
      gst_rate: gstRate ?? 0,
      display_order: j,
      is_active: true,
    }));
  });
  if (packRows.length > 0) {
    const { error: packErr } = await supabase.from("material_packs").insert(packRows);
    if (packErr) console.error("Failed to insert variant packs:", packErr);
  }

  const priceHistoryRows: Record<string, unknown>[] = [];
  const inventoryRows = (createdVariants as { id: string; code: string }[])
    .map((cv) => {
      const src = codeToVariant.get(cv.code);
      if (!src?.initial_vendor_id) return null;
      const packUnitPrice = representativePackUnitPrice(src.packs);
      const hasPack = packUnitPrice != null;
      const perUnit = hasPack ? packUnitPrice : src.initial_vendor_price ?? null;
      if (!perUnit || perUnit <= 0) return null;

      // Dated quote log — branded/pack flow only.
      if (hasPack || brandName) {
        priceHistoryRows.push({
          vendor_id: src.initial_vendor_id,
          material_id: cv.id,
          brand_id: createdBrandId,
          price: perUnit,
          price_includes_gst: incGst,
          gst_rate: gstRate ?? 0,
          total_landed_cost: perUnit,
          recorded_date: recordedDate,
          source: "quotation",
          notes: src.initial_vendor_notes?.trim() || null,
          bill_url: src.initial_vendor_bill_url || null,
        });
      }

      return {
        vendor_id: src.initial_vendor_id,
        material_id: cv.id,
        brand_id: createdBrandId ?? undefined,
        current_price: perUnit,
        unit,
        gst_rate: gstRate ?? 0,
        price_includes_gst: incGst,
        price_includes_transport: true,
        is_available: true,
        min_order_qty: 1,
        lead_time_days: 1,
        notes: src.initial_vendor_notes?.trim() || null,
        last_price_update: nowIso,
        price_source: src.initial_vendor_bill_url
          ? "bill"
          : brandName
            ? "quotation"
            : "manual",
      };
    })
    .filter(Boolean);
  if (inventoryRows.length > 0) {
    const { error: invErr } = await supabase.from("vendor_inventory").insert(inventoryRows);
    if (invErr) console.error("Failed to insert variant prices:", invErr);
  }
  if (priceHistoryRows.length > 0) {
    const { error: phErr } = await supabase.from("price_history").insert(priceHistoryRows);
    if (phErr) console.error("Failed to insert variant price history:", phErr);
  }
}

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

      // Pull the branded-flow fields out so they don't leak into the materials
      // insert (they are not columns on `materials`).
      const {
        variants,
        designs,
        brand_name,
        price_includes_gst,
        quote_recorded_date,
        parent_packs,
        ...parentData
      } = data;

      // Generate parent code if not provided
      let code = parentData.code?.trim() || null;
      if (!code) {
        code = await generateMaterialCode(supabase, parentData.name);
      }

      // Standard container sizes on the parent make it a pack-restricted
      // (requested-in-cans) material regardless of the passed flag.
      const hasParentPacks = !!(parent_packs && parent_packs.length > 0);

      // Clean parent data
      const cleanParentData = {
        ...parentData,
        code,
        sold_in_packs: hasParentPacks ? true : parentData.sold_in_packs,
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

      // Standard container sizes on the generic parent (the request/catalog
      // menu). Prices are left null → the card estimates the can price from the
      // cheapest variant's landed cost.
      if (hasParentPacks) {
        await insertParentPacks(supabase, parent.id, parent_packs!, parentData.gst_rate);
      }

      // Branded-product flow: create the brand on the parent up-front so the
      // variant auto-link below (which links all active parent brands) picks it
      // up. The tile flow passes no brand_name and is unaffected.
      let createdBrandId: string | null = null;
      if (brand_name?.trim()) {
        const { data: brandRow, error: brandErr } = await (supabase as any)
          .from("material_brands")
          .insert({
            material_id: parent.id,
            brand_name: brand_name.trim(),
            is_preferred: true,
            is_active: true,
          })
          .select("id")
          .single();
        if (brandErr) throw brandErr;
        createdBrandId = brandRow.id;
      }

      // Insert shared visual designs (e.g. tile patterns) on the parent.
      // Designs are not priced and not tied to a variant — a gallery uploaded
      // once and shown across all thickness variants.
      if (designs && designs.length > 0) {
        const designRows = designs.map((d, i) => ({
          material_id: parent.id,
          image_url: d.image_url,
          name: d.name?.trim() || null,
          display_order: d.display_order ?? i,
        }));
        const { error: designError } = await (supabase as any)
          .from("material_designs")
          .insert(designRows);
        if (designError) throw designError;
      }

      // Create variants (child materials) with brand links, packs, the first
      // vendor quote, and a dated price_history row. Shared with
      // useConvertMaterialToBranded via insertBrandedVariants.
      if (variants && variants.length > 0) {
        await insertBrandedVariants(supabase, {
          parentId: parent.id,
          parentCode: code,
          unit: parentData.unit,
          gstRate: parentData.gst_rate,
          categoryId: parentData.category_id,
          weightUnit: parentData.weight_unit,
          lengthUnit: parentData.length_unit,
          hsnCode: parentData.hsn_code,
          createdBrandId,
          brandName: brand_name,
          priceIncludesGst: price_includes_gst,
          quoteRecordedDate: quote_recorded_date,
          variants,
        });
      }

      return parent as Material;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["materials"] });
    },
  });
}

export interface ConvertMaterialToBrandedData {
  material_id: string;
  /** Optional new name for the parent (e.g. rename "Berger White Primer" → "Wall Primer"). */
  name?: string;
  brand_name: string;
  gst_rate?: number;
  price_includes_gst?: boolean;
  quote_recorded_date?: string;
  variants: VariantFormData[];
  /**
   * Standard container/can sizes for the parent. When present the parent is
   * marked `sold_in_packs` and these become `material_packs` rows on the parent
   * (skipped if the parent already has active packs, so re-converting is safe).
   */
  parent_packs?: ParentPackInput[];
}

/**
 * Convert an existing FLAT material into a branded parent-with-variants:
 * optionally rename it, add the brand, and add the priced variants (+ packs +
 * vendor quote + dated price_history). Reuses insertBrandedVariants so it stays
 * identical to the create flow. Intended for fixing a mistakenly-created flat
 * material (e.g. a brand name entered as a standalone material).
 */
export function useConvertMaterialToBranded() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (data: ConvertMaterialToBrandedData) => {
      await ensureFreshSession();

      // Load the existing parent for its code/unit/category needed by variants.
      const { data: parent, error: parentErr } = await (supabase.from("materials") as any)
        .select("id, code, name, unit, category_id, gst_rate, weight_unit, length_unit, hsn_code, parent_id")
        .eq("id", data.material_id)
        .single();
      if (parentErr) throw parentErr;
      if (parent.parent_id) {
        throw new Error("This material is already a variant — pick its parent instead.");
      }

      const hasParentPacks = !!(data.parent_packs && data.parent_packs.length > 0);

      // Optional rename + GST update; keep it a top-level parent. Declaring
      // container sizes also makes the parent pack-restricted (requested in cans).
      const updates: Record<string, unknown> = {};
      if (data.name?.trim() && data.name.trim() !== parent.name) {
        updates.name = data.name.trim();
      }
      if (data.gst_rate != null) updates.gst_rate = data.gst_rate;
      if (hasParentPacks) updates.sold_in_packs = true;
      if (Object.keys(updates).length > 0) {
        const { error: upErr } = await (supabase.from("materials") as any)
          .update(updates)
          .eq("id", parent.id);
        if (upErr) throw upErr;
      }

      // Standard container sizes for the parent — only add them if it has none
      // active yet, so re-converting the same material stays idempotent.
      if (hasParentPacks) {
        const { data: existingPacks } = await (supabase as any)
          .from("material_packs")
          .select("id")
          .eq("material_id", parent.id)
          .eq("is_active", true)
          .limit(1);
        if (!existingPacks || existingPacks.length === 0) {
          await insertParentPacks(
            supabase,
            parent.id,
            data.parent_packs!,
            data.gst_rate ?? parent.gst_rate
          );
        }
      }

      // Reuse an existing active brand of the same name, else create it.
      const bn = data.brand_name.trim();
      let brandId: string | null = null;
      const { data: existing } = await supabase
        .from("material_brands")
        .select("id")
        .eq("material_id", parent.id)
        .eq("brand_name", bn)
        .eq("is_active", true)
        .limit(1);
      if (existing && existing.length > 0) {
        brandId = existing[0].id;
      } else {
        const { data: brandRow, error: brandErr } = await (supabase as any)
          .from("material_brands")
          .insert({ material_id: parent.id, brand_name: bn, is_preferred: true, is_active: true })
          .select("id")
          .single();
        if (brandErr) throw brandErr;
        brandId = brandRow.id;
      }

      await insertBrandedVariants(supabase, {
        parentId: parent.id,
        parentCode: parent.code,
        unit: parent.unit,
        gstRate: data.gst_rate ?? parent.gst_rate,
        categoryId: parent.category_id,
        weightUnit: parent.weight_unit,
        lengthUnit: parent.length_unit,
        hsnCode: parent.hsn_code,
        createdBrandId: brandId,
        brandName: bn,
        priceIncludesGst: data.price_includes_gst,
        quoteRecordedDate: data.quote_recorded_date,
        variants: data.variants,
      });

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
          // Legacy fields for backward compatibility.
          // The spec template's own unit wins: it is the unit the value was
          // actually entered in. Falling straight through to the parent (or the
          // 'm'/'kg' defaults) is what made a 40 ft rod persist as 40 metres.
          weight_per_unit: variant.weight_per_unit,
          weight_unit: variant.weight_unit || parentMaterial.weight_unit || "kg",
          length_per_piece: variant.length_per_piece,
          length_unit: variant.length_unit || parentMaterial.length_unit || "m",
          rods_per_bundle: variant.rods_per_bundle,
          // NOTE: price_varies_by_brand / _by_variant are deliberately NOT
          // copied. They are a property of the parent; a variant resolves them
          // by walking parent_id.
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
        const billUrl = variant.initial_vendor_bill_url ?? null;
        const { error: invErr } = await (supabase as any)
          .from("vendor_inventory")
          .insert({
            vendor_id: variant.initial_vendor_id,
            material_id: result.id,
            // Scope the price to its brand. Omitting this is how a quote ends up
            // meaning "Rs.75/sqft for Plywood" rather than for a specific brand
            // and thickness.
            brand_id: variant.initial_vendor_brand_id ?? null,
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
            // Stamp the source so vendor_inventory carries provenance even
            // for entries without a separate price_history row.
            price_source: billUrl ? "bill" : "manual",
          });
        if (invErr) {
          // Don't fail the whole variant create — the variant is in, the price
          // just didn't land. Surface to console; the user can re-attach via
          // the Vendors tab.
          console.error("Failed to insert initial vendor quote:", invErr);
        }

        // Manual-rate provenance: when the user attached a bill, write a
        // price_history row so the bill surfaces wherever bill_url is rendered
        // (catalog row "Last:" line, vendor inspect, price-history tab).
        // No material_purchase_expenses row is created — the catalog stays a
        // company-level rate book; actual purchase recording still flows
        // through /site AI ingest or AddHistoricalPurchaseDialog.
        if (billUrl) {
          const today = new Date().toISOString().slice(0, 10);
          const {
            data: { user },
          } = await supabase.auth.getUser();
          const { error: phErr } = await (supabase as any)
            .from("price_history")
            .insert({
              vendor_id: variant.initial_vendor_id,
              material_id: result.id,
              brand_id: variant.initial_vendor_brand_id ?? null,
              price: variant.initial_vendor_price,
              price_includes_gst: true,
              gst_rate: parentMaterial.gst_rate ?? null,
              recorded_date: today,
              source: "manual",
              source_reference: "VariantInlineCard manual entry",
              unit: parentMaterial.unit,
              recorded_by: user?.id ?? null,
              notes: variant.initial_vendor_notes?.trim() || null,
              bill_url: billUrl,
              bill_date: today,
            });
          if (phErr) {
            console.error("Failed to insert price_history with bill:", phErr);
          }
        }
      }

      return result as Material;
    },
    onSuccess: (newVariant, variables) => {
      // Optimistic: inject the new variant so the list updates in the same tick.
      queryClient.setQueryData<MaterialWithDetails[]>(
        ["materials", "variants", variables.parentId],
        (old = []) => {
          if (old.some((v) => v.id === (newVariant as Material).id)) return old;
          return [...old, newVariant as unknown as MaterialWithDetails];
        }
      );
      // Force a canonical refetch of the variants list so it picks up the
      // joined columns (brands, image_url shape) that the bare insert row
      // doesn't carry. Without this an injected row can look subtly wrong
      // (e.g., missing image_url cast or brands array) until manual refresh.
      queryClient.refetchQueries({
        queryKey: ["materials", "variants", variables.parentId],
      });
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
