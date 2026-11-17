import { taskAction } from "@/lib/neram-hub/client";
import { hubErrorJson, hubJson, readJsonBody, withHubCaller } from "@/lib/neram-hub/route";
import { readAction } from "@/lib/neram-hub/validate";

export const dynamic = "force-dynamic";

/** POST /api/neram/tasks/:id/actions  { action, ... }  → { task: detail } */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withHubCaller("task action", async (caller) => {
    const body = await readJsonBody(request);
    if (!body.ok) return body.response;
    const action = readAction(body.value);
    if (!action.ok) return hubErrorJson({ error: action.error, code: "invalid", field: action.field }, 400);
    return hubJson({ task: await taskAction(caller.userId, id, action.value) });
  });
}
