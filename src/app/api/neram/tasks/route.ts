import { createTask, listTasks } from "@/lib/neram-hub/client";
import {
  canonicalPageUrl,
  hubErrorJson,
  hubJson,
  readJsonBody,
  withHubCaller,
} from "@/lib/neram-hub/route";
import { readNewTask } from "@/lib/neram-hub/validate";
import type { HubState, HubView } from "@/lib/neram-hub/types";

export const dynamic = "force-dynamic";

const VIEWS: HubView[] = ["mine", "given", "all"];
const STATES: HubState[] = ["open", "closed"];

/** GET /api/neram/tasks?view=mine|given|all&state=open|closed */
export async function GET(request: Request) {
  return withHubCaller("list tasks", async (caller) => {
    const url = new URL(request.url);
    const view = url.searchParams.get("view") as HubView | null;
    const state = url.searchParams.get("state") as HubState | null;
    const tasks = await listTasks(caller.userId, {
      view: view && VIEWS.includes(view) ? view : undefined,
      state: state && STATES.includes(state) ? state : undefined,
    });
    return hubJson({ tasks });
  });
}

/** POST /api/neram/tasks  { title, notes?, owner?, dueDate?, dueTime?, priority?, size?, page? } */
export async function POST(request: Request) {
  return withHubCaller("create task", async (caller) => {
    const body = await readJsonBody(request);
    if (!body.ok) return body.response;
    const input = readNewTask(body.value, canonicalPageUrl);
    if (!input.ok) return hubErrorJson({ error: input.error, code: "invalid", field: input.field }, 400);
    const task = await createTask(caller.userId, input.value);
    return hubJson({ task }, 201);
  });
}
