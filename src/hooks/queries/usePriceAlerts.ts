/**
 * Price Alerts Hooks
 * Hooks for managing price alerts and monitoring price changes
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { wrapQueryFn } from "@/lib/utils/timeout";
import type {
  PriceAlert,
  PriceAlertWithDetails,
  PriceAlertTriggered,
  PriceAlertTriggeredWithDetails,
  PriceAlertFormData,
  PriceAlertType,
} from "@/types/material.types";

// ============================================
// QUERY KEYS
// ============================================

const PRICE_ALERT_KEYS = {
  all: ["price-alerts"] as const,
  lists: () => [...PRICE_ALERT_KEYS.all, "list"] as const,
  list: (filters: { materialId?: string; isActive?: boolean }) =>
    [...PRICE_ALERT_KEYS.lists(), filters] as const,
  details: () => [...PRICE_ALERT_KEYS.all, "detail"] as const,
  detail: (id: string) => [...PRICE_ALERT_KEYS.details(), id] as const,
  triggered: () => [...PRICE_ALERT_KEYS.all, "triggered"] as const,
  triggeredList: (filters: { acknowledged?: boolean; limit?: number }) =>
    [...PRICE_ALERT_KEYS.triggered(), filters] as const,
  materialAlerts: (materialId: string) =>
    [...PRICE_ALERT_KEYS.all, "material", materialId] as const,
};

// ============================================
// FETCH HOOKS
// Note: Using type assertions because price_alerts tables
// may not be in generated types until regeneration
// ============================================

/**
 * Check if error is due to missing table (table doesn't exist yet)
 * or other recoverable database errors
 */
function isTableNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string; message?: string; status?: number; statusCode?: number };
  // PostgreSQL error code 42P01 = undefined_table
  // Also check for message patterns indicating missing relation
  // Handle 400 Bad Request which can occur when table doesn't exist
  return (
    err.code === "42P01" ||
    err.code === "PGRST200" || // PostgREST error for missing table
    err.status === 400 ||
    err.statusCode === 400 ||
    (err.message?.includes("relation") ?? false) ||
    (err.message?.includes("does not exist") ?? false) ||
    (err.message?.includes("price_alerts") ?? false)
  );
}

/**
 * Fetch all price alerts with optional filters
 */
export function usePriceAlerts(filters?: { materialId?: string; isActive?: boolean }) {
  const supabase = createClient();

  return useQuery({
    queryKey: PRICE_ALERT_KEYS.list(filters || {}),
    queryFn: wrapQueryFn(async () => {
      try {
        let query = (supabase as any)
          .from("price_alerts")
          .select(
            `
            *,
            material:materials!material_id(id, name, code, unit),
            brand:material_brands!brand_id(id, brand_name, variant_name),
            created_by_user:profiles!created_by(name)
          `
          )
          .order("created_at", { ascending: false });

        if (filters?.materialId) {
          query = query.eq("material_id", filters.materialId);
        }

        if (filters?.isActive !== undefined) {
          query = query.eq("is_active", filters.isActive);
        }

        const { data, error } = await query;

        if (error) {
          if (isTableNotFoundError(error)) {
            console.warn("price_alerts table not found. Run database migration to enable this feature.");
            return [] as PriceAlertWithDetails[];
          }
          throw error;
        }
        return (data || []) as PriceAlertWithDetails[];
      } catch (err) {
        if (isTableNotFoundError(err)) {
          console.warn("price_alerts table not found. Run database migration to enable this feature.");
          return [] as PriceAlertWithDetails[];
        }
        throw err;
      }
    }, { operationName: "usePriceAlerts" }),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Fetch price alerts for a specific material
 */
export function useMaterialPriceAlerts(materialId: string | undefined) {
  const supabase = createClient();

  return useQuery({
    queryKey: PRICE_ALERT_KEYS.materialAlerts(materialId || ""),
    queryFn: async () => {
      if (!materialId) return [] as PriceAlertWithDetails[];

      try {
        const { data, error } = await (supabase as any)
          .from("price_alerts")
          .select(
            `
            *,
            material:materials!material_id(id, name, code, unit),
            brand:material_brands!brand_id(id, brand_name, variant_name),
            created_by_user:profiles!created_by(name)
          `
          )
          .eq("material_id", materialId)
          .order("created_at", { ascending: false });

        if (error) {
          if (isTableNotFoundError(error)) {
            return [] as PriceAlertWithDetails[];
          }
          throw error;
        }
        return (data || []) as PriceAlertWithDetails[];
      } catch (err) {
        if (isTableNotFoundError(err)) {
          return [] as PriceAlertWithDetails[];
        }
        throw err;
      }
    },
    enabled: !!materialId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Fetch triggered alerts
 */
export function useTriggeredAlerts(filters?: { acknowledged?: boolean; limit?: number }) {
  const supabase = createClient();

  return useQuery({
    queryKey: PRICE_ALERT_KEYS.triggeredList(filters || {}),
    queryFn: async () => {
      try {
        let query = (supabase as any)
          .from("price_alerts_triggered")
          .select(
            `
            *,
            alert:price_alerts!alert_id(*),
            vendor:vendors!vendor_id(id, name)
          `
          )
          .order("triggered_at", { ascending: false });

        if (filters?.acknowledged !== undefined) {
          query = query.eq("acknowledged", filters.acknowledged);
        }

        if (filters?.limit) {
          query = query.limit(filters.limit);
        }

        const { data, error } = await query;

        if (error) {
          if (isTableNotFoundError(error)) {
            return [] as PriceAlertTriggeredWithDetails[];
          }
          throw error;
        }
        return (data || []) as PriceAlertTriggeredWithDetails[];
      } catch (err) {
        if (isTableNotFoundError(err)) {
          return [] as PriceAlertTriggeredWithDetails[];
        }
        throw err;
      }
    },
    staleTime: 1 * 60 * 1000, // 1 minute
  });
}

/**
 * Count unacknowledged triggered alerts
 */
export function useUnacknowledgedAlertCount() {
  const supabase = createClient();

  return useQuery({
    queryKey: [...PRICE_ALERT_KEYS.triggered(), "count"],
    queryFn: async () => {
      try {
        const { count, error } = await (supabase as any)
          .from("price_alerts_triggered")
          .select("*", { count: "exact", head: true })
          .eq("acknowledged", false);

        if (error) {
          if (isTableNotFoundError(error)) {
            return 0;
          }
          throw error;
        }
        return count || 0;
      } catch (err) {
        if (isTableNotFoundError(err)) {
          return 0;
        }
        throw err;
      }
    },
    staleTime: 1 * 60 * 1000,
  });
}

// ============================================
// MUTATION HOOKS
// ============================================

/**
 * Create a new price alert
 */
export function useCreatePriceAlert() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (data: PriceAlertFormData) => {
      const supabase = createClient();
      const alertData = {
        material_id: data.material_id,
        brand_id: data.brand_id || null,
        alert_type: data.alert_type,
        threshold_value: data.threshold_value || null,
        threshold_percent: data.threshold_percent || null,
        is_active: true,
        trigger_count: 0,
        created_by: user?.id || null,
      };

      const { data: result, error } = await (supabase as any)
        .from("price_alerts")
        .insert(alertData)
        .select()
        .single();

      if (error) throw error;
      return result as PriceAlert;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: PRICE_ALERT_KEYS.all });
      queryClient.invalidateQueries({
        queryKey: PRICE_ALERT_KEYS.materialAlerts(variables.material_id),
      });
    },
  });
}

/**
 * Update a price alert
 */
export function useUpdatePriceAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<PriceAlertFormData> & { id: string }) => {
      const supabase = createClient();
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (data.alert_type !== undefined) updateData.alert_type = data.alert_type;
      if (data.threshold_value !== undefined) updateData.threshold_value = data.threshold_value;
      if (data.threshold_percent !== undefined) updateData.threshold_percent = data.threshold_percent;
      if (data.brand_id !== undefined) updateData.brand_id = data.brand_id || null;

      const { data: result, error } = await (supabase as any)
        .from("price_alerts")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return result as PriceAlert;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRICE_ALERT_KEYS.all });
    },
  });
}

/**
 * Toggle price alert active status
 */
export function useTogglePriceAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const supabase = createClient();
      const { data, error } = await (supabase as any)
        .from("price_alerts")
        .update({
          is_active: isActive,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as PriceAlert;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRICE_ALERT_KEYS.all });
    },
  });
}

/**
 * Delete a price alert
 */
export function useDeletePriceAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await (supabase as any).from("price_alerts").delete().eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRICE_ALERT_KEYS.all });
    },
  });
}

/**
 * Acknowledge a triggered alert
 */
export function useAcknowledgeAlert() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (triggeredId: string) => {
      const supabase = createClient();
      const { data, error } = await (supabase as any)
        .from("price_alerts_triggered")
        .update({
          acknowledged: true,
          acknowledged_by: user?.id || null,
          acknowledged_at: new Date().toISOString(),
        })
        .eq("id", triggeredId)
        .select()
        .single();

      if (error) throw error;
      return data as PriceAlertTriggered;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRICE_ALERT_KEYS.triggered() });
    },
  });
}

/**
 * Acknowledge all triggered alerts
 */
export function useAcknowledgeAllAlerts() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async () => {
      const supabase = createClient();
      const { error } = await (supabase as any)
        .from("price_alerts_triggered")
        .update({
          acknowledged: true,
          acknowledged_by: user?.id || null,
          acknowledged_at: new Date().toISOString(),
        })
        .eq("acknowledged", false);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRICE_ALERT_KEYS.triggered() });
    },
  });
}

// ============================================
// UTILITY HOOKS
// ============================================

/**
 * Check if a price change should trigger any alerts
 * This is typically called when a new price is recorded
 */
export function useCheckPriceAlerts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      materialId,
      brandId,
      vendorId,
      oldPrice,
      newPrice,
      sourceReference,
    }: {
      materialId: string;
      brandId?: string;
      vendorId?: string;
      oldPrice: number;
      newPrice: number;
      sourceReference?: string;
    }) => {
      const supabase = createClient();

      // Fetch active alerts for this material
      let query = (supabase as any)
        .from("price_alerts")
        .select("*")
        .eq("material_id", materialId)
        .eq("is_active", true);

      if (brandId) {
        query = query.or(`brand_id.is.null,brand_id.eq.${brandId}`);
      }

      const { data: alerts, error: alertsError } = await query;

      if (alertsError) throw alertsError;
      if (!alerts || alerts.length === 0) return { triggeredCount: 0 };

      const changePercent = oldPrice > 0 ? ((newPrice - oldPrice) / oldPrice) * 100 : 0;
      const triggeredAlerts: Array<{ alert: PriceAlert; reason: string }> = [];

      for (const alert of alerts) {
        let shouldTrigger = false;
        let reason = "";

        switch (alert.alert_type as PriceAlertType) {
          case "price_drop":
            if (alert.threshold_percent && changePercent <= -alert.threshold_percent) {
              shouldTrigger = true;
              reason = `Price dropped by ${Math.abs(changePercent).toFixed(1)}%`;
            }
            break;

          case "price_increase":
            if (alert.threshold_percent && changePercent >= alert.threshold_percent) {
              shouldTrigger = true;
              reason = `Price increased by ${changePercent.toFixed(1)}%`;
            }
            break;

          case "threshold_below":
            if (alert.threshold_value && newPrice <= alert.threshold_value) {
              shouldTrigger = true;
              reason = `Price fell below threshold of ${alert.threshold_value}`;
            }
            break;

          case "threshold_above":
            if (alert.threshold_value && newPrice >= alert.threshold_value) {
              shouldTrigger = true;
              reason = `Price exceeded threshold of ${alert.threshold_value}`;
            }
            break;
        }

        if (shouldTrigger) {
          triggeredAlerts.push({ alert, reason });
        }
      }

      // Record triggered alerts
      if (triggeredAlerts.length > 0) {
        const triggeredRecords = triggeredAlerts.map(({ alert }) => ({
          alert_id: alert.id,
          triggered_at: new Date().toISOString(),
          old_price: oldPrice,
          new_price: newPrice,
          change_percent: changePercent,
          vendor_id: vendorId || null,
          source_reference: sourceReference || null,
          acknowledged: false,
        }));

        const { error: insertError } = await (supabase as any)
          .from("price_alerts_triggered")
          .insert(triggeredRecords);

        if (insertError) {
          console.warn("Failed to record triggered alerts:", insertError);
        }

        // Update trigger counts
        for (const { alert } of triggeredAlerts) {
          await (supabase as any)
            .from("price_alerts")
            .update({
              last_triggered_at: new Date().toISOString(),
              trigger_count: (alert.trigger_count || 0) + 1,
            })
            .eq("id", alert.id);
        }
      }

      return { triggeredCount: triggeredAlerts.length };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PRICE_ALERT_KEYS.triggered() });
    },
  });
}
