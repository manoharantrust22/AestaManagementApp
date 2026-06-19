/**
 * useLaborSpecialties
 *
 * Fetches the managed list of fine-grained work specialties (Tiling,
 * Plastering, Brickwork, Helper only, ...) from labor_specialties
 * (migration 20260619180100). Used by the Add/Edit form's specialty
 * multi-select, the toolbar specialty filter, and the manage-specialties
 * dialog on /company/laborers.
 *
 * The table is accessed via `as any` to match the laborer_skills pattern --
 * these reference tables are not in the committed database.types.ts.
 */

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface LaborSpecialty {
  id: string;
  name: string;
  is_active: boolean;
  display_order: number;
}

export const laborSpecialtyKeys = {
  all: ["labor-specialties"] as const,
};

export function useLaborSpecialties() {
  const supabase = createClient();
  return useQuery<LaborSpecialty[]>({
    queryKey: laborSpecialtyKeys.all,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<LaborSpecialty[]> => {
      const { data, error } = await (supabase.from("labor_specialties" as any) as any)
        .select("id, name, is_active, display_order")
        .order("display_order")
        .order("name");
      if (error) throw error;
      return ((data || []) as any[]).map((s) => ({
        id: String(s.id),
        name: String(s.name),
        is_active: !!s.is_active,
        display_order: Number(s.display_order ?? 0),
      }));
    },
  });
}
