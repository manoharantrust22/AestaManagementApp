import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { wrapQueryFn } from "@/lib/utils/timeout";
import type { Database } from "@/types/database.types";

type User = Database["public"]["Tables"]["users"]["Row"];

export const userKeys = {
  all: ["users"] as const,
  lists: () => [...userKeys.all, "list"] as const,
  list: (filters?: { role?: string }) => [...userKeys.lists(), filters] as const,
};

/**
 * Fetch all users
 */
export function useUsers(filters?: { role?: string }) {
  const supabase = createClient() as any;

  return useQuery({
    queryKey: userKeys.list(filters),
    queryFn: wrapQueryFn(async () => {
      let query = supabase
        .from("users")
        .select("*")
        .eq("status", "active")
        .order("name");

      if (filters?.role) {
        query = query.eq("role", filters.role);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as User[];
    }, { operationName: "useUsers" }),
  });
}
