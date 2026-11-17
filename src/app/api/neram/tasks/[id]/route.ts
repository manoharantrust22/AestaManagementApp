import { getTask } from "@/lib/neram-hub/client";
import { hubJson, withHubCaller } from "@/lib/neram-hub/route";

export const dynamic = "force-dynamic";

/** GET /api/neram/tasks/:id  → { task: detail } */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withHubCaller("get task", async (caller) => hubJson({ task: await getTask(caller.userId, id) }));
}
