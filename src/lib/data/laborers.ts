import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database.types";

type Laborer = Tables<"laborers">;
type LaborCategory = Tables<"labor_categories">;
type LaborRole = Tables<"labor_roles">;
type Team = Tables<"teams">;

export interface LaborerSkill {
  category_id: string;
  is_primary: boolean;
}

export type LaborerWithDetails = Laborer & {
  category_name: string;
  role_name: string;
  team_name: string | null;
  associated_team_name?: string | null;
  skills: LaborerSkill[];
  /** Fine-grained specialty ids (labor_specialties.id) this laborer is good at. */
  specialty_ids: string[];
};

export interface LaborersPageData {
  laborers: LaborerWithDetails[];
  categories: LaborCategory[];
  roles: LaborRole[];
  teams: Team[];
}

/**
 * Fetch all laborers page data on the server.
 * Note: Laborers are company-wide, not site-specific.
 */
export async function getLaborersPageData(): Promise<LaborersPageData> {
  const supabase = await createClient();

  // Fetch all data in parallel
  const [
    laborersResult,
    categoriesResult,
    rolesResult,
    teamsResult,
    skillsResult,
    specialtiesResult,
  ] = await Promise.all([
    supabase
      .from("laborers")
      .select(
        `*, category:labor_categories(name), role:labor_roles(name), team:teams!laborers_team_id_fkey(name), associated_team:teams!laborers_associated_team_id_fkey(name)`
      )
      .order("name"),
    supabase.from("labor_categories").select("*").order("name"),
    supabase.from("labor_roles").select("*").order("name"),
    supabase.from("teams").select("*").eq("status", "active").order("name"),
    supabase
      .from("laborer_skills" as any)
      .select("laborer_id, category_id, is_primary"),
    supabase
      .from("laborer_specialties" as any)
      .select("laborer_id, specialty_id"),
  ]);

  const skillsByLaborer = new Map<string, LaborerSkill[]>();
  for (const s of (skillsResult.data || []) as any[]) {
    const arr = skillsByLaborer.get(s.laborer_id) ?? [];
    arr.push({ category_id: s.category_id, is_primary: !!s.is_primary });
    skillsByLaborer.set(s.laborer_id, arr);
  }

  const specialtiesByLaborer = new Map<string, string[]>();
  for (const s of (specialtiesResult.data || []) as any[]) {
    const arr = specialtiesByLaborer.get(s.laborer_id) ?? [];
    arr.push(s.specialty_id);
    specialtiesByLaborer.set(s.laborer_id, arr);
  }

  // Transform laborers to include flattened relation names + skills + specialties.
  const laborers: LaborerWithDetails[] = (laborersResult.data || []).map(
    (l: any) => ({
      ...l,
      category_name: l.category?.name || "",
      role_name: l.role?.name || "",
      team_name: l.team?.name || null,
      associated_team_name: l.associated_team?.name || null,
      skills: skillsByLaborer.get(l.id) ?? [],
      specialty_ids: specialtiesByLaborer.get(l.id) ?? [],
    })
  );

  return {
    laborers,
    categories: (categoriesResult.data || []) as LaborCategory[],
    roles: (rolesResult.data || []) as LaborRole[],
    teams: (teamsResult.data || []) as Team[],
  };
}
