"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient, ensureFreshSession } from "@/lib/supabase/client";
import type { MaterialPack } from "@/types/material.types";

/**
 * Hooks for managing a material's standard can/container sizes (material_packs).
 * Used by pack-only materials — see src/lib/materials/packs.ts for the pure
 * display/quantity helpers. `material_packs` is not in the generated Supabase
 * types yet, so the client is cast to `any` (same pattern as the brand hooks).
 */

export interface MaterialPackInput {
  material_id: string;
  label: string;
  contents_qty: number;
  price?: number | null;
  price_includes_gst?: boolean | null;
  gst_rate?: number | null;
  display_order?: number;
  is_active?: boolean;
}

const invalidatePacks = (
  queryClient: ReturnType<typeof useQueryClient>,
  materialId: string
) => {
  queryClient.invalidateQueries({ queryKey: ["materials", "packs", materialId] });
  queryClient.invalidateQueries({ queryKey: ["material", materialId] });
  queryClient.invalidateQueries({ queryKey: ["materials"] });
};

/**
 * Active packs for a material, sorted display_order then contents_qty.
 */
export function useMaterialPacks(materialId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["materials", "packs", materialId],
    queryFn: async () => {
      if (!materialId) return [];
      const { data, error } = await (supabase as any)
        .from("material_packs")
        .select("*")
        .eq("material_id", materialId)
        .eq("is_active", true)
        .order("display_order")
        .order("contents_qty");
      if (error) throw error;
      return (data ?? []) as unknown as MaterialPack[];
    },
    enabled: !!materialId,
  });
}

export function useCreateMaterialPack() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (input: MaterialPackInput) => {
      await ensureFreshSession();
      const { data, error } = await (supabase as any)
        .from("material_packs")
        .insert({
          material_id: input.material_id,
          label: input.label,
          contents_qty: input.contents_qty,
          price: input.price ?? null,
          price_includes_gst: input.price_includes_gst ?? false,
          gst_rate: input.gst_rate ?? null,
          display_order: input.display_order ?? 0,
          is_active: input.is_active ?? true,
        })
        .select()
        .single();
      if (error) throw error;
      return data as MaterialPack;
    },
    onSuccess: (_data, input) => invalidatePacks(queryClient, input.material_id),
  });
}

export function useUpdateMaterialPack() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      id,
      materialId,
      data,
    }: {
      id: string;
      materialId: string;
      data: Partial<MaterialPackInput>;
    }) => {
      await ensureFreshSession();
      const { data: result, error } = await (supabase as any)
        .from("material_packs")
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return result as MaterialPack;
    },
    onSuccess: (_data, { materialId }) => invalidatePacks(queryClient, materialId),
  });
}

/** Soft-delete: keeps the pack for historical request/PO references. */
export function useDeactivateMaterialPack() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({ id, materialId }: { id: string; materialId: string }) => {
      await ensureFreshSession();
      const { error } = await (supabase as any)
        .from("material_packs")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      return { id };
    },
    onSuccess: (_data, { materialId }) => invalidatePacks(queryClient, materialId),
  });
}

/** Toggle a material's `sold_in_packs` flag without opening the edit dialog. */
export function useSetMaterialSoldInPacks() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async ({
      materialId,
      soldInPacks,
    }: {
      materialId: string;
      soldInPacks: boolean;
    }) => {
      await ensureFreshSession();
      const { error } = await (supabase.from("materials") as any)
        .update({ sold_in_packs: soldInPacks })
        .eq("id", materialId);
      if (error) throw error;
      return { materialId, soldInPacks };
    },
    onSuccess: (_data, { materialId }) => invalidatePacks(queryClient, materialId),
  });
}
