import { addComment } from "@/lib/neram-hub/client";
import { hubErrorJson, hubJson, readJsonBody, withHubCaller } from "@/lib/neram-hub/route";
import { readComment } from "@/lib/neram-hub/validate";

export const dynamic = "force-dynamic";

/** POST /api/neram/tasks/:id/comments  { text }  (a voice note goes as its English words) */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withHubCaller("add comment", async (caller) => {
    const body = await readJsonBody(request);
    if (!body.ok) return body.response;
    const comment = readComment(body.value);
    if (!comment.ok) return hubErrorJson({ error: comment.error, code: "invalid", field: comment.field }, 400);
    return hubJson({ task: await addComment(caller.userId, id, comment.value) }, 201);
  });
}
