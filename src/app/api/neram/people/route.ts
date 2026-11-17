import { createClient } from "@/lib/supabase/server";
import { listPeople } from "@/lib/neram-hub/client";
import { hubJson, withHubCaller } from "@/lib/neram-hub/route";

/**
 * GET /api/neram/people
 * Everyone linked to tasks in Aesta, for the "give to" picker. Adds the Aesta
 * role so the picker can group people as it does today.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return withHubCaller("people", async () => {
    const people = await listPeople();
    const ids = people.map((p) => p.externalId).filter(Boolean);
    const roles = new Map<string, string>();
    if (ids.length) {
      const supabase = await createClient();
      const { data } = await supabase.from("users").select("id, role").in("id", ids);
      (data ?? []).forEach((u) => roles.set(u.id as string, u.role as string));
    }
    return hubJson({
      people: people.map((p) => ({ ...p, role: roles.get(p.externalId) ?? null })),
    });
  });
}
