"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient, ensureFreshSession } from "@/lib/supabase/client";
import { wrapQueryFn } from "@/lib/utils/timeout";
import { useSelectedCompany } from "@/contexts/CompanyContext";
import type {
  Equipment,
  EquipmentWithDetails,
  EquipmentFormData,
  EquipmentCategory,
  EquipmentTransfer,
  EquipmentTransferWithDetails,
  EquipmentTransferFormData,
  EquipmentReceiveFormData,
  EquipmentMaintenance,
  EquipmentMaintenanceWithDetails,
  EquipmentMaintenanceFormData,
  EquipmentFilterState,
  SimCard,
  SimCardWithDetails,
  SimCardFormData,
  SimRecharge,
  SimRechargeFormData,
  MemoryCard,
  MemoryCardFormData,
  MaintenanceAlertSummary,
  SimAlertSummary,
  PendingTransferSummary,
} from "@/types/equipment.types";

// ============================================
// QUERY KEYS
// ============================================

export const equipmentQueryKeys = {
  all: ["equipment"] as const,
  categories: {
    all: ["equipment", "categories"] as const,
  },
  list: (filters?: EquipmentFilterState) =>
    filters
      ? ([...equipmentQueryKeys.all, "list", filters] as const)
      : ([...equipmentQueryKeys.all, "list"] as const),
  byId: (id: string) => [...equipmentQueryKeys.all, id] as const,
  bySite: (siteId: string) =>
    [...equipmentQueryKeys.all, "site", siteId] as const,
  byCategory: (categoryId: string) =>
    [...equipmentQueryKeys.all, "category", categoryId] as const,
  accessories: (parentId: string) =>
    [...equipmentQueryKeys.all, "accessories", parentId] as const,
  cameras: {
    all: ["equipment", "cameras"] as const,
    bySite: (siteId: string) =>
      [...equipmentQueryKeys.cameras.all, "site", siteId] as const,
  },
  transfers: {
    all: ["equipment", "transfers"] as const,
    byEquipment: (equipmentId: string) =>
      [...equipmentQueryKeys.transfers.all, "equipment", equipmentId] as const,
    pending: () => [...equipmentQueryKeys.transfers.all, "pending"] as const,
    bySite: (siteId: string) =>
      [...equipmentQueryKeys.transfers.all, "site", siteId] as const,
  },
  maintenance: {
    all: ["equipment", "maintenance"] as const,
    byEquipment: (equipmentId: string) =>
      [...equipmentQueryKeys.maintenance.all, "equipment", equipmentId] as const,
    alerts: () => [...equipmentQueryKeys.maintenance.all, "alerts"] as const,
  },
  simCards: {
    all: ["equipment", "simCards"] as const,
    byId: (id: string) => [...equipmentQueryKeys.simCards.all, id] as const,
    recharges: (simId: string) =>
      [...equipmentQueryKeys.simCards.all, simId, "recharges"] as const,
    expiringSoon: () =>
      [...equipmentQueryKeys.simCards.all, "expiring"] as const,
  },
  memoryCards: {
    all: ["equipment", "memoryCards"] as const,
    byId: (id: string) => [...equipmentQueryKeys.memoryCards.all, id] as const,
  },
};

// ============================================
// EQUIPMENT CATEGORIES
// ============================================

export function useEquipmentCategories() {
  const supabase = createClient() as any;

  return useQuery({
    queryKey: equipmentQueryKeys.categories.all,
    queryFn: async (): Promise<EquipmentCategory[]> => {
      const { data, error } = await (supabase as any)
        .from("equipment_categories")
        .select("*")
        .eq("is_active", true)
        .order("display_order");

      if (error) throw error;
      return data as EquipmentCategory[];
    },
  });
}

// ============================================
// EQUIPMENT CRUD
// ============================================

export function useEquipmentList(filters?: EquipmentFilterState) {
  const supabase = createClient() as any;

  return useQuery({
    queryKey: equipmentQueryKeys.list(filters),
    queryFn: wrapQueryFn(async () => {
      // Simple query first to verify table access works
      let query = supabase
        .from("equipment")
        .select("*")
        .eq("is_active", true)
        .order("equipment_code");

      // Apply filters
      if (filters?.category_id) {
        query = query.eq("category_id", filters.category_id);
      }
      if (filters?.status && filters.status !== "all") {
        query = query.eq("status", filters.status);
      }
      if (filters?.condition && filters.condition !== "all") {
        query = query.eq("condition", filters.condition);
      }
      if (filters?.location_type && filters.location_type !== "all") {
        query = query.eq("current_location_type", filters.location_type);
      }
      if (filters?.site_id) {
        query = query.eq("current_site_id", filters.site_id);
      }
      if (filters?.search) {
        query = query.or(
          `name.ilike.%${filters.search}%,equipment_code.ilike.%${filters.search}%,serial_number.ilike.%${filters.search}%`
        );
      }
      if (!filters?.include_accessories) {
        query = query.is("parent_equipment_id", null);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Attach size variants to each top-level tool (so the list can group/expand
      // sizes under one parent without showing them as standalone rows).
      const parentIds = (data || []).map((e: EquipmentWithDetails) => e.id);
      const variantsByParent: Record<string, EquipmentWithDetails[]> = {};
      if (parentIds.length > 0) {
        const { data: variantRows } = await supabase
          .from("equipment")
          .select("*")
          .in("parent_equipment_id", parentIds)
          .eq("parent_relationship", "variant")
          .eq("is_active", true)
          .order("equipment_code");
        for (const v of (variantRows || []) as EquipmentWithDetails[]) {
          const pid = v.parent_equipment_id as string;
          if (!variantsByParent[pid]) variantsByParent[pid] = [];
          variantsByParent[pid].push(v);
        }
      }

      // Calculate maintenance status for each equipment
      const now = new Date();
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      return (data as EquipmentWithDetails[]).map((equipment) => {
        let maintenance_status: "overdue" | "due_soon" | "ok" | "na" = "na";

        if (equipment.next_maintenance_date) {
          const nextMaint = new Date(equipment.next_maintenance_date);
          if (nextMaint < now) {
            maintenance_status = "overdue";
          } else if (nextMaint <= sevenDaysFromNow) {
            maintenance_status = "due_soon";
          } else {
            maintenance_status = "ok";
          }
        }

        // Calculate days at current location
        let days_at_current_location: number | undefined;
        if (equipment.deployed_at) {
          days_at_current_location = Math.floor(
            (now.getTime() - new Date(equipment.deployed_at).getTime()) /
              (1000 * 60 * 60 * 24)
          );
        }

        return {
          ...equipment,
          variants: variantsByParent[equipment.id] || [],
          maintenance_status,
          days_at_current_location,
        };
      });
    }, { operationName: "useEquipmentList" }),
  });
}

export function useEquipment(id: string | undefined) {
  const supabase = createClient() as any;

  return useQuery({
    queryKey: equipmentQueryKeys.byId(id || ""),
    queryFn: async () => {
      if (!id) return null;

      const { data, error } = await supabase
        .from("equipment")
        .select(
          `
          *,
          category:equipment_categories(*),
          current_site:sites(id, name, address),
          responsible_laborer:laborers(id, name, phone),
          purchase_vendor:vendors(id, name, phone)
        `
        )
        .eq("id", id)
        .single();

      if (error) throw error;

      // Fetch children (accessories + size variants) and partition them
      const { data: children } = await supabase
        .from("equipment")
        .select("*")
        .eq("parent_equipment_id", id)
        .eq("is_active", true)
        .order("equipment_code");

      const accessories = (children || []).filter(
        (c: Equipment) => c.parent_relationship !== "variant"
      );
      const variants = (children || []).filter(
        (c: Equipment) => c.parent_relationship === "variant"
      );

      // Fetch SIM card if it's a camera with sim_id
      let sim_card = null;
      if (data.camera_details?.sim_id) {
        const { data: sim } = await supabase
          .from("equipment_sim_cards")
          .select("*")
          .eq("id", data.camera_details.sim_id)
          .single();
        sim_card = sim;
      }

      // Fetch memory card if it's a camera with memory_card_id
      let memory_card = null;
      if (data.camera_details?.memory_card_id) {
        const { data: memCard } = await supabase
          .from("equipment_memory_cards")
          .select("*")
          .eq("id", data.camera_details.memory_card_id)
          .single();
        memory_card = memCard;
      }

      // Get transfer count
      const { count: transfer_count } = await supabase
        .from("equipment_transfers")
        .select("id", { count: "exact", head: true })
        .eq("equipment_id", id);

      // Get maintenance count
      const { count: maintenance_count } = await supabase
        .from("equipment_maintenance")
        .select("id", { count: "exact", head: true })
        .eq("equipment_id", id);

      return {
        ...data,
        accessories,
        variants,
        sim_card,
        memory_card,
        transfer_count: transfer_count || 0,
        maintenance_count: maintenance_count || 0,
      } as EquipmentWithDetails;
    },
    enabled: !!id,
  });
}

export function useCreateEquipment() {
  const queryClient = useQueryClient();
  const supabase = createClient() as any;
  const { selectedCompany } = useSelectedCompany();

  return useMutation({
    mutationFn: async (data: EquipmentFormData) => {
      if (!selectedCompany?.id) throw new Error("No company selected");

      await ensureFreshSession();

      const { data: user } = await supabase.auth.getUser();

      const { data: result, error } = await supabase
        .from("equipment")
        .insert({
          ...data,
          company_id: selectedCompany.id,
          created_by: user?.user?.id,
        } as never)
        .select()
        .single();

      if (error) throw error;
      return result as Equipment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: equipmentQueryKeys.all });
    },
  });
}

export function useUpdateEquipment() {
  const queryClient = useQueryClient();
  const supabase = createClient() as any;

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<EquipmentFormData>;
    }) => {
      await ensureFreshSession();

      const { data: user } = await supabase.auth.getUser();

      const { data: result, error } = await supabase
        .from("equipment")
        .update({
          ...data,
          updated_by: user?.user?.id,
        } as never)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return result as Equipment;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: equipmentQueryKeys.all });
      queryClient.invalidateQueries({
        queryKey: equipmentQueryKeys.byId(variables.id),
      });
    },
  });
}

export function useDeleteEquipment() {
  const queryClient = useQueryClient();
  const supabase = createClient() as any;

  return useMutation({
    mutationFn: async (id: string) => {
      await ensureFreshSession();

      // Soft delete
      const { error } = await supabase
        .from("equipment")
        .update({ is_active: false } as never)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: equipmentQueryKeys.all });
    },
  });
}

// ============================================
// EQUIPMENT ACCESSORIES
// ============================================

export function useEquipmentAccessories(parentId: string | undefined) {
  const supabase = createClient() as any;

  return useQuery({
    queryKey: equipmentQueryKeys.accessories(parentId || ""),
    queryFn: async () => {
      if (!parentId) return [];

      const { data, error } = await supabase
        .from("equipment")
        .select(
          `
          *,
          category:equipment_categories(id, name, code)
        `
        )
        .eq("parent_equipment_id", parentId)
        .eq("is_active", true)
        .order("equipment_code");

      if (error) throw error;
      return data as EquipmentWithDetails[];
    },
    enabled: !!parentId,
  });
}

// ============================================
// EQUIPMENT TRANSFERS
// ============================================

export function useEquipmentTransfers(equipmentId: string | undefined) {
  const supabase = createClient() as any;

  return useQuery({
    queryKey: equipmentQueryKeys.transfers.byEquipment(equipmentId || ""),
    queryFn: async () => {
      if (!equipmentId) return [];

      const { data, error } = await supabase
        .from("equipment_transfers")
        .select("*")
        .eq("equipment_id", equipmentId)
        .order("transfer_date", { ascending: false });

      if (error) throw error;
      return data as EquipmentTransferWithDetails[];
    },
    enabled: !!equipmentId,
  });
}

export function usePendingTransfers() {
  const supabase = createClient() as any;

  return useQuery({
    queryKey: equipmentQueryKeys.transfers.pending(),
    queryFn: async () => {
      // Simple query first to verify table access works
      const { data, error } = await supabase
        .from("equipment_transfers")
        .select("*")
        .in("status", ["pending", "in_transit"])
        .order("transfer_date", { ascending: false });

      if (error) throw error;
      return data as EquipmentTransferWithDetails[];
    },
  });
}

export function useCreateEquipmentTransfer() {
  const queryClient = useQueryClient();
  const supabase = createClient() as any;

  return useMutation({
    mutationFn: async (data: EquipmentTransferFormData) => {
      await ensureFreshSession();

      const { data: user } = await supabase.auth.getUser();

      // Get current equipment details
      const { data: equipment } = await supabase
        .from("equipment")
        .select(
          "current_location_type, current_site_id, warehouse_location, responsible_user_id, responsible_laborer_id, condition"
        )
        .eq("id", data.equipment_id)
        .single();

      if (!equipment) throw new Error("Equipment not found");

      // Create transfer record
      const { data: transfer, error } = await supabase
        .from("equipment_transfers")
        .insert({
          equipment_id: data.equipment_id,
          from_location_type: equipment.current_location_type,
          from_site_id: equipment.current_site_id,
          from_warehouse_location: equipment.warehouse_location,
          from_responsible_user_id: equipment.responsible_user_id,
          from_responsible_laborer_id: equipment.responsible_laborer_id,
          to_location_type: data.to_location_type,
          to_site_id: data.to_site_id,
          to_warehouse_location: data.to_warehouse_location,
          to_responsible_user_id: data.to_responsible_user_id,
          to_responsible_laborer_id: data.to_responsible_laborer_id,
          transfer_date: data.transfer_date,
          condition_at_handover: data.condition_at_handover || equipment.condition,
          reason: data.reason,
          notes: data.notes,
          handover_photos: data.handover_photos || [],
          status: "pending",
          initiated_by: user?.user?.id,
        } as never)
        .select()
        .single();

      if (error) throw error;
      return transfer;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: equipmentQueryKeys.transfers.byEquipment(variables.equipment_id),
      });
      queryClient.invalidateQueries({
        queryKey: equipmentQueryKeys.transfers.pending(),
      });
      queryClient.invalidateQueries({
        queryKey: equipmentQueryKeys.byId(variables.equipment_id),
      });
    },
  });
}

export function useVerifyEquipmentTransfer() {
  const queryClient = useQueryClient();
  const supabase = createClient() as any;

  return useMutation({
    mutationFn: async ({
      transferId,
      condition_at_receipt,
      is_working,
      condition_notes,
    }: {
      transferId: string;
      condition_at_receipt: string;
      is_working: boolean;
      condition_notes?: string;
    }) => {
      await ensureFreshSession();

      const { data: user } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from("equipment_transfers")
        .update({
          condition_at_receipt,
          is_working,
          condition_notes,
          verified_by: user?.user?.id,
          verified_at: new Date().toISOString(),
          status: "in_transit",
        } as never)
        .eq("id", transferId)
        .select("equipment_id")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: equipmentQueryKeys.transfers.all,
      });
      if (data?.equipment_id) {
        queryClient.invalidateQueries({
          queryKey: equipmentQueryKeys.byId(data.equipment_id),
        });
      }
    },
  });
}

export function useReceiveEquipmentTransfer() {
  const queryClient = useQueryClient();
  const supabase = createClient() as any;

  return useMutation({
    mutationFn: async ({
      transferId,
      receiving_photos,
    }: {
      transferId: string;
      receiving_photos?: string[];
    }) => {
      await ensureFreshSession();

      const { data: user } = await supabase.auth.getUser();

      // Update transfer status - the trigger will update equipment location
      const { data, error } = await supabase
        .from("equipment_transfers")
        .update({
          status: "received",
          received_date: new Date().toISOString().split("T")[0],
          received_by: user?.user?.id,
          received_at: new Date().toISOString(),
          receiving_photos: receiving_photos || [],
        } as never)
        .eq("id", transferId)
        .select("equipment_id")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: equipmentQueryKeys.all });
      queryClient.invalidateQueries({
        queryKey: equipmentQueryKeys.transfers.all,
      });
      if (data?.equipment_id) {
        queryClient.invalidateQueries({
          queryKey: equipmentQueryKeys.byId(data.equipment_id),
        });
      }
    },
  });
}

export function useRejectEquipmentTransfer() {
  const queryClient = useQueryClient();
  const supabase = createClient() as any;

  return useMutation({
    mutationFn: async ({
      transferId,
      rejection_reason,
    }: {
      transferId: string;
      rejection_reason: string;
    }) => {
      await ensureFreshSession();

      const { data: user } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from("equipment_transfers")
        .update({
          status: "rejected",
          rejected_by: user?.user?.id,
          rejected_at: new Date().toISOString(),
          rejection_reason,
        } as never)
        .eq("id", transferId)
        .select("equipment_id")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: equipmentQueryKeys.transfers.all,
      });
      if (data?.equipment_id) {
        queryClient.invalidateQueries({
          queryKey: equipmentQueryKeys.byId(data.equipment_id),
        });
      }
    },
  });
}

// ============================================
// EQUIPMENT MAINTENANCE
// ============================================

export function useEquipmentMaintenance(equipmentId: string | undefined) {
  const supabase = createClient() as any;

  return useQuery({
    queryKey: equipmentQueryKeys.maintenance.byEquipment(equipmentId || ""),
    queryFn: async () => {
      if (!equipmentId) return [];

      const { data, error } = await supabase
        .from("equipment_maintenance")
        .select(
          `
          *,
          vendor:vendors(id, name)
        `
        )
        .eq("equipment_id", equipmentId)
        .order("maintenance_date", { ascending: false });

      if (error) throw error;
      return data as EquipmentMaintenanceWithDetails[];
    },
    enabled: !!equipmentId,
  });
}

export function useMaintenanceAlerts() {
  const supabase = createClient() as any;

  return useQuery({
    queryKey: equipmentQueryKeys.maintenance.alerts(),
    queryFn: async () => {
      const now = new Date();
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

      // Get equipment with overdue maintenance
      const { data: overdueData } = await supabase
        .from("equipment")
        .select(
          `
          *,
          category:equipment_categories(id, name, code, icon),
          current_site:sites(id, name)
        `
        )
        .eq("is_active", true)
        .not("next_maintenance_date", "is", null)
        .lt("next_maintenance_date", now.toISOString().split("T")[0])
        .order("next_maintenance_date");

      // Get equipment due soon
      const { data: dueSoonData } = await supabase
        .from("equipment")
        .select(
          `
          *,
          category:equipment_categories(id, name, code, icon),
          current_site:sites(id, name)
        `
        )
        .eq("is_active", true)
        .not("next_maintenance_date", "is", null)
        .gte("next_maintenance_date", now.toISOString().split("T")[0])
        .lte("next_maintenance_date", sevenDaysFromNow.toISOString().split("T")[0])
        .order("next_maintenance_date");

      // Get equipment at site for too long (90+ days without maintenance)
      const { data: longDeployedData } = await supabase
        .from("equipment")
        .select(
          `
          *,
          category:equipment_categories(id, name, code, icon),
          current_site:sites(id, name)
        `
        )
        .eq("is_active", true)
        .eq("current_location_type", "site")
        .or(
          `last_maintenance_date.is.null,last_maintenance_date.lt.${ninetyDaysAgo.toISOString().split("T")[0]}`
        )
        .order("deployed_at");

      return {
        overdue_count: overdueData?.length || 0,
        due_soon_count: dueSoonData?.length || 0,
        overdue_equipment: (overdueData || []) as EquipmentWithDetails[],
        due_soon_equipment: (dueSoonData || []) as EquipmentWithDetails[],
        long_deployed_equipment: (longDeployedData || []) as EquipmentWithDetails[],
      } as MaintenanceAlertSummary & {
        long_deployed_equipment: EquipmentWithDetails[];
      };
    },
  });
}

export function useCreateMaintenance() {
  const queryClient = useQueryClient();
  const supabase = createClient() as any;

  return useMutation({
    mutationFn: async (data: EquipmentMaintenanceFormData) => {
      await ensureFreshSession();

      const { data: user } = await supabase.auth.getUser();

      const { data: result, error } = await supabase
        .from("equipment_maintenance")
        .insert({
          ...data,
          created_by: user?.user?.id,
        } as never)
        .select()
        .single();

      if (error) throw error;
      return result as EquipmentMaintenance;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: equipmentQueryKeys.maintenance.byEquipment(variables.equipment_id),
      });
      queryClient.invalidateQueries({
        queryKey: equipmentQueryKeys.maintenance.alerts(),
      });
      queryClient.invalidateQueries({
        queryKey: equipmentQueryKeys.byId(variables.equipment_id),
      });
      queryClient.invalidateQueries({ queryKey: equipmentQueryKeys.all });
    },
  });
}

// ============================================
// SIM CARDS
// ============================================

export function useSimCards() {
  const supabase = createClient() as any;

  return useQuery({
    queryKey: equipmentQueryKeys.simCards.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipment_sim_cards")
        .select(
          `
          *,
          assigned_equipment:equipment(id, equipment_code, name)
        `
        )
        .eq("is_active", true)
        .order("phone_number");

      if (error) throw error;

      // Get latest recharge for each SIM
      const simIds = data.map((sim: any) => sim.id);
      const { data: recharges } = await supabase
        .from("equipment_sim_recharges")
        .select("*")
        .in("sim_card_id", simIds)
        .order("recharge_date", { ascending: false });

      // Map latest recharge to each SIM
      const now = new Date();
      const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      return data.map((sim: any) => {
        const latestRecharge = recharges?.find((r: any) => r.sim_card_id === sim.id);
        const validityEnd = latestRecharge?.validity_end_date
          ? new Date(latestRecharge.validity_end_date)
          : null;

        let is_expiring_soon = false;
        let days_until_expiry: number | null = null;

        if (validityEnd) {
          days_until_expiry = Math.ceil(
            (validityEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          );
          is_expiring_soon = validityEnd <= sevenDaysFromNow && validityEnd >= now;
        }

        return {
          ...sim,
          latest_recharge: latestRecharge || null,
          current_validity_end: latestRecharge?.validity_end_date || null,
          is_expiring_soon,
          days_until_expiry,
        } as SimCardWithDetails;
      });
    },
  });
}

export function useSimCard(id: string | undefined) {
  const supabase = createClient() as any;

  return useQuery({
    queryKey: equipmentQueryKeys.simCards.byId(id || ""),
    queryFn: async () => {
      if (!id) return null;

      const { data, error } = await supabase
        .from("equipment_sim_cards")
        .select(
          `
          *,
          assigned_equipment:equipment(id, equipment_code, name, current_site:sites(id, name))
        `
        )
        .eq("id", id)
        .single();

      if (error) throw error;
      return data as SimCardWithDetails;
    },
    enabled: !!id,
  });
}

export function useCreateSimCard() {
  const queryClient = useQueryClient();
  const supabase = createClient() as any;

  return useMutation({
    mutationFn: async (data: SimCardFormData) => {
      await ensureFreshSession();

      const { data: user } = await supabase.auth.getUser();

      const { data: result, error } = await supabase
        .from("equipment_sim_cards")
        .insert({
          ...data,
          assigned_at: data.assigned_equipment_id ? new Date().toISOString() : null,
          created_by: user?.user?.id,
        } as never)
        .select()
        .single();

      if (error) throw error;
      return result as SimCard;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: equipmentQueryKeys.simCards.all });
    },
  });
}

export function useUpdateSimCard() {
  const queryClient = useQueryClient();
  const supabase = createClient() as any;

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<SimCardFormData>;
    }) => {
      await ensureFreshSession();

      // If assigned_equipment_id is being changed, update assigned_at
      const updateData: Record<string, unknown> = { ...data };
      if ("assigned_equipment_id" in data) {
        updateData.assigned_at = data.assigned_equipment_id
          ? new Date().toISOString()
          : null;
      }

      const { data: result, error } = await supabase
        .from("equipment_sim_cards")
        .update(updateData as never)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return result as SimCard;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: equipmentQueryKeys.simCards.all });
      queryClient.invalidateQueries({
        queryKey: equipmentQueryKeys.simCards.byId(variables.id),
      });
    },
  });
}

// ============================================
// SIM RECHARGES
// ============================================

export function useSimRecharges(simCardId: string | undefined) {
  const supabase = createClient() as any;

  return useQuery({
    queryKey: equipmentQueryKeys.simCards.recharges(simCardId || ""),
    queryFn: async () => {
      if (!simCardId) return [];

      const { data, error } = await supabase
        .from("equipment_sim_recharges")
        .select("*")
        .eq("sim_card_id", simCardId)
        .order("recharge_date", { ascending: false });

      if (error) throw error;
      return data as SimRecharge[];
    },
    enabled: !!simCardId,
  });
}

export function useCreateSimRecharge() {
  const queryClient = useQueryClient();
  const supabase = createClient() as any;

  return useMutation({
    mutationFn: async (data: SimRechargeFormData) => {
      await ensureFreshSession();

      const { data: user } = await supabase.auth.getUser();

      const { data: result, error } = await supabase
        .from("equipment_sim_recharges")
        .insert({
          ...data,
          created_by: user?.user?.id,
        } as never)
        .select()
        .single();

      if (error) throw error;
      return result as SimRecharge;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: equipmentQueryKeys.simCards.recharges(variables.sim_card_id),
      });
      queryClient.invalidateQueries({ queryKey: equipmentQueryKeys.simCards.all });
      queryClient.invalidateQueries({
        queryKey: equipmentQueryKeys.simCards.expiringSoon(),
      });
    },
  });
}

export function useExpiringSims(daysThreshold: number = 7) {
  const supabase = createClient() as any;

  return useQuery({
    queryKey: equipmentQueryKeys.simCards.expiringSoon(),
    queryFn: async () => {
      const now = new Date();
      const thresholdDate = new Date(
        now.getTime() + daysThreshold * 24 * 60 * 60 * 1000
      );

      // Get all active SIM cards with their equipment
      const { data: sims } = await supabase
        .from("equipment_sim_cards")
        .select(
          `
          *,
          assigned_equipment:equipment(id, equipment_code, name, current_site:sites(id, name))
        `
        )
        .eq("is_active", true);

      if (!sims || sims.length === 0) {
        return {
          expiring_soon_count: 0,
          expired_count: 0,
          expiring_sims: [],
        } as SimAlertSummary;
      }

      // Get latest recharge for each SIM
      const { data: recharges } = await supabase
        .from("equipment_sim_recharges")
        .select("*")
        .in(
          "sim_card_id",
          sims.map((s: any) => s.id)
        )
        .order("recharge_date", { ascending: false });

      // Filter and enhance SIMs
      const expiringSims: SimCardWithDetails[] = [];
      let expiredCount = 0;

      for (const sim of sims as any[]) {
        const latestRecharge = recharges?.find((r: any) => r.sim_card_id === sim.id);
        if (!latestRecharge?.validity_end_date) continue;

        const validityEnd = new Date(latestRecharge.validity_end_date);
        const days_until_expiry = Math.ceil(
          (validityEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (validityEnd <= thresholdDate) {
          if (validityEnd < now) {
            expiredCount++;
          }
          expiringSims.push({
            ...sim,
            latest_recharge: latestRecharge,
            current_validity_end: latestRecharge.validity_end_date,
            is_expiring_soon: validityEnd >= now,
            days_until_expiry,
          } as SimCardWithDetails);
        }
      }

      // Sort by expiry date
      expiringSims.sort((a, b) => {
        const dateA = a.current_validity_end
          ? new Date(a.current_validity_end).getTime()
          : 0;
        const dateB = b.current_validity_end
          ? new Date(b.current_validity_end).getTime()
          : 0;
        return dateA - dateB;
      });

      return {
        expiring_soon_count: expiringSims.length - expiredCount,
        expired_count: expiredCount,
        expiring_sims: expiringSims,
      } as SimAlertSummary;
    },
  });
}

// ============================================
// MEMORY CARDS
// ============================================

export function useMemoryCards() {
  const supabase = createClient() as any;

  return useQuery({
    queryKey: equipmentQueryKeys.memoryCards.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipment_memory_cards")
        .select(
          `
          *,
          assigned_equipment:equipment(id, equipment_code, name)
        `
        )
        .eq("is_active", true)
        .order("capacity_gb", { ascending: false });

      if (error) throw error;
      return data as MemoryCard[];
    },
  });
}

export function useCreateMemoryCard() {
  const queryClient = useQueryClient();
  const supabase = createClient() as any;

  return useMutation({
    mutationFn: async (data: MemoryCardFormData) => {
      await ensureFreshSession();

      const { data: user } = await supabase.auth.getUser();

      const { data: result, error } = await supabase
        .from("equipment_memory_cards")
        .insert({
          ...data,
          assigned_at: data.assigned_equipment_id ? new Date().toISOString() : null,
          created_by: user?.user?.id,
        } as never)
        .select()
        .single();

      if (error) throw error;
      return result as MemoryCard;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: equipmentQueryKeys.memoryCards.all,
      });
    },
  });
}

export function useUpdateMemoryCard() {
  const queryClient = useQueryClient();
  const supabase = createClient() as any;

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: Partial<MemoryCardFormData>;
    }) => {
      await ensureFreshSession();

      const updateData: Record<string, unknown> = { ...data };
      if ("assigned_equipment_id" in data) {
        updateData.assigned_at = data.assigned_equipment_id
          ? new Date().toISOString()
          : null;
      }

      const { data: result, error } = await supabase
        .from("equipment_memory_cards")
        .update(updateData as never)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return result as MemoryCard;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: equipmentQueryKeys.memoryCards.all,
      });
      queryClient.invalidateQueries({
        queryKey: equipmentQueryKeys.memoryCards.byId(variables.id),
      });
    },
  });
}

// ============================================
// CAMERAS (Filtered Equipment)
// ============================================

export function useCameras(siteId?: string) {
  const supabase = createClient() as any;

  return useQuery({
    queryKey: siteId
      ? equipmentQueryKeys.cameras.bySite(siteId)
      : equipmentQueryKeys.cameras.all,
    queryFn: async () => {
      // Get surveillance category ID
      const { data: category } = await supabase
        .from("equipment_categories")
        .select("id")
        .eq("code", "SURV")
        .single();

      if (!category) return [];

      let query = supabase
        .from("equipment")
        .select(
          `
          *,
          category:equipment_categories(id, name, code),
          current_site:sites(id, name)
        `
        )
        .eq("category_id", category.id)
        .eq("is_active", true);

      if (siteId) {
        query = query.eq("current_site_id", siteId);
      }

      const { data, error } = await query.order("equipment_code");
      if (error) throw error;

      // Fetch SIM cards for cameras
      const cameraIds = data.map((c: any) => c.id);
      const { data: simCards } = await supabase
        .from("equipment_sim_cards")
        .select("*")
        .in("assigned_equipment_id", cameraIds);

      // Fetch memory cards for cameras
      const { data: memoryCards } = await supabase
        .from("equipment_memory_cards")
        .select("*")
        .in("assigned_equipment_id", cameraIds);

      // Map SIM and memory cards to cameras
      return data.map((camera: any) => ({
        ...camera,
        sim_card: simCards?.find((s: any) => s.assigned_equipment_id === camera.id) || null,
        memory_card:
          memoryCards?.find((m: any) => m.assigned_equipment_id === camera.id) || null,
      })) as EquipmentWithDetails[];
    },
  });
}

// ============================================
// EQUIPMENT BY SITE
// ============================================

export function useEquipmentBySite(siteId: string | undefined) {
  const supabase = createClient() as any;

  return useQuery({
    queryKey: equipmentQueryKeys.bySite(siteId || ""),
    queryFn: async () => {
      if (!siteId) return [];

      const { data, error } = await supabase
        .from("equipment")
        .select(
          `
          *,
          category:equipment_categories(id, name, code, icon),
          responsible_laborer:laborers(id, name)
        `
        )
        .eq("current_site_id", siteId)
        .eq("is_active", true)
        .is("parent_equipment_id", null)
        .order("equipment_code");

      if (error) throw error;
      return data as EquipmentWithDetails[];
    },
    enabled: !!siteId,
  });
}
