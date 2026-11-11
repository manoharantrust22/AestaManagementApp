import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { executeAction, type UserRole } from "@/lib/assistant/actionTools";
import type { ConfirmRequest, ConfirmResponse } from "@/lib/assistant/types";

export const runtime = "nodejs";

/**
 * Confirm or cancel a proposed assistant action. Executes with the caller's
 * own session, so RLS decides what is allowed. The proposed→executing claim
 * is a conditional update, so a double tap can't run it twice.
 */
export async function POST(request: NextRequest): Promise<NextResponse<ConfirmResponse>> {
  const supabase = (await createClient()) as any;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ status: "failed", error: "Not authenticated" }, { status: 401 });

  const { data: me } = await supabase.from("users").select("id, name, role").eq("auth_id", user.id).single();
  if (!me?.id) return NextResponse.json({ status: "failed", error: "User profile not found" }, { status: 403 });

  const { actionId, decision } = (await request.json().catch(() => ({}))) as Partial<ConfirmRequest>;
  if (!actionId || (decision !== "confirm" && decision !== "cancel")) {
    return NextResponse.json({ status: "failed", error: "actionId and decision required" }, { status: 400 });
  }

  const now = new Date().toISOString();

  if (decision === "cancel") {
    const { data } = await supabase
      .from("assistant_actions")
      .update({ status: "cancelled", decided_at: now })
      .eq("id", actionId)
      .eq("user_id", me.id)
      .eq("status", "proposed")
      .select("id");
    return NextResponse.json({ status: data?.length ? "cancelled" : "failed", error: data?.length ? undefined : "Already handled" });
  }

  const { data: claimed, error: claimErr } = await supabase
    .from("assistant_actions")
    .update({ status: "executing", decided_at: now })
    .eq("id", actionId)
    .eq("user_id", me.id)
    .eq("status", "proposed")
    .select("id, tool, args")
    .maybeSingle();
  if (claimErr) return NextResponse.json({ status: "failed", error: claimErr.message }, { status: 500 });
  if (!claimed) return NextResponse.json({ status: "failed", error: "This action was already handled" }, { status: 409 });

  try {
    const result = await executeAction(supabase, { id: me.id, name: me.name, role: me.role as UserRole }, claimed.tool, claimed.args ?? {});
    await supabase.from("assistant_actions").update({ status: "executed", result }).eq("id", actionId);
    return NextResponse.json({ status: "executed", message: result.message, url: result.url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed";
    await supabase.from("assistant_actions").update({ status: "failed", error: msg }).eq("id", actionId);
    return NextResponse.json({ status: "failed", error: msg }, { status: 500 });
  }
}
