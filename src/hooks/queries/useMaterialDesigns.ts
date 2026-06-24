"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient, ensureFreshSession } from "@/lib/supabase/client";
import type {
  MaterialDesign,
  MaterialDesignFormData,
} from "@/types/material.types";

/**
 * Shared visual designs (e.g. tile patterns) attached to a PARENT material.
 * Designs are not priced and not tied to a thickness variant — they are a
 * gallery uploaded once and shown across all thicknesses.
 *
 * Backed by the `material_designs` table (migration 20260624140000).
 */
export function useMaterialDesigns(materialId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: ["materialDesigns", materialId],
    queryFn: async () => {
      if (!materialId) return [] as MaterialDesign[];

      const { data, error } = await (supabase as any)
        .from("material_designs")
        .select("*")
        .eq("material_id", materialId)
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data ?? []) as MaterialDesign[];
    },
    enabled: !!materialId,
  });
}

/**
 * Bulk-insert designs for a material. display_order is assigned sequentially
 * from the existing max so a second upload appends after the first.
 */
export function useAddMaterialDesigns() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      materialId,
      designs,
    }: {
      materialId: string;
      designs: MaterialDesignFormData[];
    }) => {
      if (!designs.length) return [] as MaterialDesign[];
      await ensureFreshSession();

      // Append after any existing designs.
      const { data: existing } = await (supabase as any)
        .from("material_designs")
        .select("display_order")
        .eq("material_id", materialId)
        .eq("is_active", true)
        .order("display_order", { ascending: false })
        .limit(1);
      const startOrder =
        existing && existing.length ? (existing[0].display_order ?? 0) + 1 : 0;

      const rows = designs.map((d, i) => ({
        material_id: materialId,
        image_url: d.image_url,
        name: d.name?.trim() || null,
        display_order: d.display_order ?? startOrder + i,
      }));

      const { data, error } = await (supabase as any)
        .from("material_designs")
        .insert(rows)
        .select();

      if (error) throw error;
      return (data ?? []) as MaterialDesign[];
    },
    onSuccess: (_, { materialId }) => {
      queryClient.invalidateQueries({ queryKey: ["materialDesigns", materialId] });
      queryClient.invalidateQueries({ queryKey: ["materials"] });
    },
  });
}

/** Soft-delete a single design (is_active = false). */
export function useDeleteMaterialDesign() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      designId,
    }: {
      designId: string;
      materialId: string;
    }) => {
      await ensureFreshSession();
      const { error } = await (supabase as any)
        .from("material_designs")
        .update({ is_active: false })
        .eq("id", designId);
      if (error) throw error;
    },
    onSuccess: (_, { materialId }) => {
      queryClient.invalidateQueries({ queryKey: ["materialDesigns", materialId] });
      queryClient.invalidateQueries({ queryKey: ["materials"] });
    },
  });
}

/** Persist a new ordering by writing display_order for the given design ids. */
export function useReorderMaterialDesigns() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      orderedIds,
    }: {
      orderedIds: string[];
      materialId: string;
    }) => {
      await ensureFreshSession();
      // Sequential single-row updates: ordering changes are small (a handful
      // of designs), so a batched upsert isn't worth the column-defaults risk.
      for (let i = 0; i < orderedIds.length; i++) {
        const { error } = await (supabase as any)
          .from("material_designs")
          .update({ display_order: i })
          .eq("id", orderedIds[i]);
        if (error) throw error;
      }
    },
    onSuccess: (_, { materialId }) => {
      queryClient.invalidateQueries({ queryKey: ["materialDesigns", materialId] });
    },
  });
}
