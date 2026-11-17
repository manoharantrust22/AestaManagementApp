import { pullHubEvents } from "@/lib/neram-hub/events";
import { hubJson, withHubCaller } from "@/lib/neram-hub/route";

/**
 * POST /api/neram/events/sync  (signed-in)
 * Called when the Tasks page opens: pulls every hub event after our cursor so
 * a push that never arrived still becomes a notification. At most one pull
 * every 20 seconds however many people open Tasks.
 */
export const dynamic = "force-dynamic";

export async function POST() {
  return withHubCaller("events sync", async () => hubJson(await pullHubEvents()));
}
