"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient, ensureFreshSession } from "@/lib/supabase/client";
import { wrapQueryFn } from "@/lib/utils/timeout";
import { useSelectedCompany } from "@/contexts/CompanyContext";
import type {
  EquipmentVendorPrice,
  EquipmentVendorPriceWithDetails,
  EquipmentVendorPriceFormData,
} from "@/types/equipment.types";

export const equipmentVendorPriceKeys = {
  all: ["equipment-vendor-prices"] as const,
  byEquipment: (id: string) =>
    [...equipmentVendorPriceKeys.all, "equipment", id] as const,
  byIds: (ids: string[]) =>
    [...equipmentVendorPriceKeys.all, "ids", ids] as const,
};

const PRICE_SELECT = `*, vendor:vendors(id, name)`;

/**
 * Active store prices for a single equipment item / size, cheapest first.
 */
export function useEquipmentVendorPrices(equipmentId: string | undefined) {
  const supabase = createClient() as any;

  return useQuery({
    queryKey: equipmentId
      ? equipmentVendorPriceKeys.byEquipment(equipmentId)
      : [...equipmentVendorPriceKeys.all, "none"],
    queryFn: wrapQueryFn(
      async () => {
        if (!equipmentId) return [] as EquipmentVendorPriceWithDetails[];
        const { data, error } = await supabase
          .from("equipment_vendor_prices")
          .select(PRICE_SELECT)
          .eq("equipment_id", equipmentId)
          .eq("is_active", true)
          .order("price", { ascending: true });
        if (error) throw error;
        return (data || []) as EquipmentVendorPriceWithDetails[];
      },
      { operationName: "useEquipmentVendorPrices" }
    ),
    enabled: !!equipmentId,
  });
}

/**
 * Active store prices for many equipment ids at once (e.g. a parent tool's
 * size variants), grouped by equipment_id and sorted cheapest-first within each
 * group. Used by the comparison panel to render one block per size.
 */
export function useEquipmentVendorPricesForIds(ids: string[]) {
  const supabase = createClient() as any;
  // Stable key regardless of caller ordering.
  const sortedIds = [...ids].sort();

  return useQuery({
    queryKey: equipmentVendorPriceKeys.byIds(sortedIds),
    queryFn: wrapQueryFn(
      async () => {
        const byId: Record<string, EquipmentVendorPriceWithDetails[]> = {};
        if (sortedIds.length === 0) return byId;
        const { data, error } = await supabase
          .from("equipment_vendor_prices")
          .select(PRICE_SELECT)
          .in("equipment_id", sortedIds)
          .eq("is_active", true)
          .order("price", { ascending: true });
        if (error) throw error;
        for (const p of (data || []) as EquipmentVendorPriceWithDetails[]) {
          if (!byId[p.equipment_id]) byId[p.equipment_id] = [];
          byId[p.equipment_id].push(p);
        }
        return byId;
      },
      { operationName: "useEquipmentVendorPricesForIds" }
    ),
    enabled: sortedIds.length > 0,
  });
}

export function useCreateEquipmentVendorPrice() {
  const queryClient = useQueryClient();
  const supabase = createClient() as any;
  const { selectedCompany } = useSelectedCompany();

  return useMutation({
    mutationFn: async (data: EquipmentVendorPriceFormData) => {
      if (!selectedCompany?.id) throw new Error("No company selected");
      await ensureFreshSession();

      const { data: user } = await supabase.auth.getUser();

      const { data: result, error } = await supabase
        .from("equipment_vendor_prices")
        .insert({
          ...data,
          company_id: selectedCompany.id,
          created_by: user?.user?.id,
        } as never)
        .select()
        .single();

      if (error) throw error;
      return result as EquipmentVendorPrice;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: equipmentVendorPriceKeys.all });
    },
  });
}

export function useDeleteEquipmentVendorPrice() {
  const queryClient = useQueryClient();
  const supabase = createClient() as any;

  return useMutation({
    mutationFn: async (id: string) => {
      await ensureFreshSession();
      // Soft delete
      const { error } = await supabase
        .from("equipment_vendor_prices")
        .update({ is_active: false } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: equipmentVendorPriceKeys.all });
    },
  });
}
