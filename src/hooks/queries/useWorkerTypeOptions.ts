"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { wrapQueryFn } from "@/lib/utils/timeout";
import type { DayWorkerLineKind } from "@/types/taskWork.types";

/**
 * A pickable worker "type" for the day-log breakdown. Two flavours come from one
 * trade category: labour ROLES (rate book, e.g. Mason with a default rate) and
 * individual LABORERS in that trade (carrying their own current daily rate).
 * The picker is also freeSolo, so a typed-in label becomes a `custom` line.
 */
export interface WorkerTypeOption {
  kind: Extract<DayWorkerLineKind, "role" | "laborer">;
  id: string;
  label: string;
  rate: number;
  /** Section header in the dropdown. */
  group: "Roles" | "Laborers";
}

/**
 * Loads role + laborer options for a trade category, used by the day-log
 * "Worker type" dropdown. Roles prefill `default_daily_rate`; laborers prefill
 * their current `daily_rate`. Mirrors the inline role query in
 * EstimateMonitorPanel, plus the named-laborer source.
 */
export function useWorkerTypeOptions(
  categoryId: string | null | undefined,
  enabled = true
) {
  const supabase = createClient();
  return useQuery({
    queryKey: ["worker-type-options", categoryId ?? "none"],
    enabled: !!categoryId && enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: wrapQueryFn(
      async (): Promise<WorkerTypeOption[]> => {
        if (!categoryId) return [];
        const sb = supabase as any;
        const [rolesRes, laborersRes] = await Promise.all([
          sb
            .from("labor_roles")
            .select("id, name, default_daily_rate")
            .eq("category_id", categoryId)
            .eq("is_active", true)
            .order("display_order", { ascending: true }),
          sb
            .from("laborers")
            .select("id, name, daily_rate, role:labor_roles(name)")
            .eq("category_id", categoryId)
            .eq("status", "active")
            .order("name", { ascending: true }),
        ]);
        if (rolesRes.error) throw rolesRes.error;
        if (laborersRes.error) throw laborersRes.error;

        const roles: WorkerTypeOption[] = (rolesRes.data ?? []).map((r: any) => ({
          kind: "role" as const,
          id: r.id,
          label: r.name,
          rate: Number(r.default_daily_rate ?? 0),
          group: "Roles" as const,
        }));
        const laborers: WorkerTypeOption[] = (laborersRes.data ?? []).map(
          (l: any) => ({
            kind: "laborer" as const,
            id: l.id,
            label: l.role?.name ? `${l.name} (${l.role.name})` : l.name,
            rate: Number(l.daily_rate ?? 0),
            group: "Laborers" as const,
          })
        );
        return [...roles, ...laborers];
      },
      { operationName: "useWorkerTypeOptions" }
    ),
  });
}
