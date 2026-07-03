"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys, cacheTTL } from "@/lib/cache/keys";

/**
 * Roles within a trade category (`labor_roles`): Mason, Helper, … with a
 * default daily rate. Reference data — callers filter by `category_id`
 * client-side (same as the laborers page does with its server-loaded list).
 */
export interface LaborRoleOption {
  id: string;
  name: string;
  category_id: string;
  default_daily_rate: number;
}

export function useLaborRoles(activeOnly = true) {
  const supabase = createClient();
  return useQuery({
    queryKey: [...queryKeys.laborRoles.list(), { activeOnly }] as const,
    queryFn: async () => {
      let query = supabase
        .from("labor_roles")
        .select("id, name, category_id, default_daily_rate")
        .order("display_order", { ascending: true })
        .order("name", { ascending: true });
      if (activeOnly) query = query.eq("is_active", true);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as LaborRoleOption[];
    },
    staleTime: cacheTTL.reference,
  });
}
