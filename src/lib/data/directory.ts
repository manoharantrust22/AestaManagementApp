import { createClient } from "@/lib/supabase/server";
import type { DirectoryPageData, TechnicianRow } from "@/types/directory.types";
import {
  buildTradeOptions,
  normalizeDirectory,
  type RawLaborer,
  type RawTeam,
} from "@/lib/utils/directory";

/**
 * Server loader for /company/directory.
 *
 * Fetches the four contact sources in parallel, normalizes laborers + vendors +
 * mestris into `entries`, and returns the raw `technicians` separately so the
 * client can drive add/edit/delete through React Query while keeping the
 * (read-only this session) other sources from the server render.
 *
 * Resilient to the `technicians` table not existing yet (pre-migration): that
 * fetch falls back to an empty list so the aggregated directory still renders.
 *
 * Company scoping follows the existing company-wide-catalog convention
 * (laborers/vendors are fetched app-wide, not company-filtered); writes stamp
 * `company_id` from the selected company.
 */
export async function getDirectoryPageData(): Promise<DirectoryPageData> {
  const supabase = await createClient();

  const [technicians, laborersRes, skillsRes, vendorsRes, teamsRes, categoriesRes] =
    await Promise.all([
      fetchTechnicians(),
      supabase
        .from("laborers")
        .select(
          "id, name, phone, address, photo_url, category_id, status, category:labor_categories(name)"
        )
        .eq("status", "active")
        .not("phone", "is", null)
        .neq("phone", "")
        .order("name"),
      (supabase.from("laborer_skills" as any) as any).select(
        "laborer_id, category_id"
      ),
      supabase
        .from("vendors")
        .select(
          "id, name, phone, whatsapp_number, email, contact_person, vendor_type, specializations, serving_locations, shop_photo_url, is_active, is_draft"
        )
        .eq("is_active", true)
        .not("phone", "is", null)
        .order("name"),
      supabase
        .from("teams")
        .select("id, name, leader_name, leader_phone, leader_laborer_id, status")
        .eq("status", "active"),
      supabase.from("labor_categories").select("id, name").eq("is_active", true),
    ]);

  // Category id → name (for laborer skill labels + trade autocomplete)
  const categoryNameById: Record<string, string> = {};
  const categoryNames: string[] = [];
  for (const c of (categoriesRes.data ?? []) as Array<{ id: string; name: string }>) {
    categoryNameById[c.id] = c.name;
    categoryNames.push(c.name);
  }

  // Laborer skills grouped by laborer
  const skillsByLaborer = new Map<string, string[]>();
  for (const s of (skillsRes.data ?? []) as Array<{
    laborer_id: string;
    category_id: string;
  }>) {
    const arr = skillsByLaborer.get(s.laborer_id) ?? [];
    arr.push(s.category_id);
    skillsByLaborer.set(s.laborer_id, arr);
  }

  const laborers: RawLaborer[] = ((laborersRes.data ?? []) as any[]).map((l) => ({
    id: l.id,
    name: l.name,
    phone: l.phone ?? null,
    category_name: l.category?.name ?? null,
    skillCategoryIds: skillsByLaborer.get(l.id) ?? [],
    address: l.address ?? null,
    photo_url: l.photo_url ?? null,
  }));

  const vendors = ((vendorsRes.data ?? []) as any[])
    .filter((v) => v.is_draft !== true)
    .map((v) => ({
      id: v.id,
      name: v.name,
      phone: v.phone ?? null,
      whatsapp_number: v.whatsapp_number ?? null,
      email: v.email ?? null,
      contact_person: v.contact_person ?? null,
      vendor_type: v.vendor_type ?? null,
      specializations: v.specializations ?? null,
      serving_locations: v.serving_locations ?? null,
      shop_photo_url: v.shop_photo_url ?? null,
    }));

  const teams: RawTeam[] = ((teamsRes.data ?? []) as any[]).map((t) => ({
    id: t.id,
    name: t.name ?? null,
    leader_name: t.leader_name ?? null,
    leader_phone: t.leader_phone ?? null,
    leader_laborer_id: t.leader_laborer_id ?? null,
  }));

  const allEntries = normalizeDirectory({
    technicians,
    laborers,
    vendors,
    teams,
    categoryNameById,
  });

  // Technician & brand rows (both from the `technicians` table) are served live
  // via React Query; keep only the read-only sources in the server entries so
  // they don't render twice.
  const entries = allEntries.filter(
    (e) => e.source !== "technician" && e.source !== "brand"
  );

  return {
    entries,
    technicians,
    tradeOptions: buildTradeOptions(categoryNames),
  };
}

/** Resilient technicians fetch — empty list if the table doesn't exist yet. */
async function fetchTechnicians(): Promise<TechnicianRow[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await (supabase.from("technicians" as any) as any)
      .select("*")
      .eq("is_active", true)
      .order("name");
    if (error) return [];
    return (data ?? []) as TechnicianRow[];
  } catch {
    return [];
  }
}
