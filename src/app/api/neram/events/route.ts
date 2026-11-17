import { NextResponse } from "next/server";
import { receiveHubEvents, supabaseEventStore } from "@/lib/neram-hub/events";

/**
 * POST /api/neram/events  (public: called by Neram Admin, no user session)
 * Signed like every hub request (TASK_HUB_CONTRACT.md > Events). Each event
 * becomes an Aesta notification (bell + phone push) for the people in `to`.
 * Answers 2xx only once stored; on anything else Admin keeps the event, and we
 * get it from the pull.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const url = new URL(request.url);
  const body = await request.text().catch(() => "");
  try {
    const result = await receiveHubEvents({
      headers: request.headers,
      method: request.method,
      pathAndQuery: url.pathname + url.search,
      body,
      store: supabaseEventStore(),
    });
    return NextResponse.json(result.body, {
      status: result.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[neram] event push failed:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Could not store the events. Try again.", code: "error" },
      { status: 500 },
    );
  }
}
