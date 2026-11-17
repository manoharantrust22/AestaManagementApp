import { getRunning } from "@/lib/neram-hub/client";
import { hubJson, withHubCaller } from "@/lib/neram-hub/route";

export const dynamic = "force-dynamic";

/** GET /api/neram/running  → { now, running: [...] }  (count time from `now`, the hub's clock) */
export async function GET() {
  return withHubCaller("running tasks", async (caller) => hubJson(await getRunning(caller.userId)));
}
