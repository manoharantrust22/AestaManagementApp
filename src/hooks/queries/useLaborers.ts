import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { wrapQueryFn } from "@/lib/utils/timeout";
import type { Database } from "@/types/database.types";

type Laborer = Database["public"]["Tables"]["laborers"]["Row"];

export const laborerKeys = {
  all: ["laborers"] as const,
  lists: () => [...laborerKeys.all, "list"] as const,
  list: (filters?: { site_id?: string }) => [...laborerKeys.lists(), filters] as const,
};

/**
 * Fetch all laborers
 */
export function useLaborers(filters?: { site_id?: string }) {
  const supabase = createClient();

  return useQuery({
    queryKey: laborerKeys.list(filters),
    queryFn: wrapQueryFn(async () => {
      const query = supabase
        .from("laborers")
        .select("*")
        .eq("status", "active")
        .order("name");

      const { data, error } = await query;

      if (error) throw error;
      return data as Laborer[];
    }, { operationName: "useLaborers" }),
  });
}
