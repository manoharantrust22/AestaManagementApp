import { addFile } from "@/lib/neram-hub/client";
import { hubErrorJson, hubJson, readJsonBody, withHubCaller } from "@/lib/neram-hub/route";
import { readFile } from "@/lib/neram-hub/validate";

export const dynamic = "force-dynamic";

/** POST /api/neram/tasks/:id/files  { name, type, data: base64 }  (at most 3 MB, resized on the phone) */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withHubCaller("add photo", async (caller) => {
    const body = await readJsonBody(request);
    if (!body.ok) return body.response;
    const file = readFile(body.value);
    if (!file.ok) return hubErrorJson({ error: file.error, code: "invalid", field: file.field }, 400);
    return hubJson({ task: await addFile(caller.userId, id, file.value) }, 201);
  });
}
